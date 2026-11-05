"""Moving running task agents between Claude accounts (herdr_task/moves.py) and the picks another machine reads and
sets (accounts list / set), in a throwaway home: HOME, the picks file and the store are patched; hc, the shell and
launch are fakes, so no program runs."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.path.join(ROOT, "mods", "tasks", "bin")


class Moves(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0, BIN)
        import herdr_task.accounts as acc
        import herdr_task.moves as mv
        import herdr_task.launch as L
        import herdr_task.news as news
        import herdr_task.sessions as sess
        import herdr_task.store as store
        self.acc, self.mv = acc, mv
        self.home = tempfile.mkdtemp()
        self.hc = {}       # address -> hc get record
        self.killed = []
        self.launched = []

        def launch(s, t, argv, space, message=None, parent=None, resume=None, role=None, account=None):
            a = {"address": f"t{len(self.launched) + 10}", "agent": "claude", "argv": argv, "account": account, "resume": resume}
            self.launched.append(a)
            t["agents"].append(a)
            return a

        def run(argv, *a, **k):
            if argv[:2] == ["hc", "kill"]:
                self.killed.append(argv[2])
            return mock.Mock(returncode=0, stdout="", stderr="")
        for mod, name, value in ((acc, "HOME", self.home), (acc, "FILE", os.path.join(self.home, ".herdr", "accounts.json")),
                                 (mv, "STORE", os.path.join(self.home, "tasks")), (mv, "run", run),
                                 (mv, "hc_json", lambda verb, addr: self.hc.get(addr)),
                                 (mv, "live_agents", lambda key: [dict(v) for v in self.hc.values()]), (mv, "detail", lambda k: self.hc.get(k["address"], k)),
                                 (L, "launch", launch), (L, "parent_for", lambda p, sp: p),
                                 (news, "typing", lambda addr, k=None, there=None: None),
                                 (sess, "refresh_sessions", lambda *a: None), (store, "store_files", lambda folder=None: [])):
            p = mock.patch.object(mod, name, value)
            p.start()
            self.addCleanup(p.stop)
        os.makedirs(os.path.join(self.home, ".claude", "projects", "-w-repo"))
        os.makedirs(os.path.join(self.home, ".claude-work"))
        with open(os.path.join(self.home, ".claude", "projects", "-w-repo", "s-1.jsonl"), "w") as f:
            f.write('{"type":"user"}\n')
        os.makedirs(os.path.join(self.home, ".claude", "projects", "-w-repo", "s-1", "subagents"))

    def agent(self, status="idle", turn=3, address="t1"):
        k = {"address": address, "state": "live", "foreground": {"name": "claude"}, "status": {"state": status}, "turn": turn,
             "labels": {"herdr.task.space": "sp1"}}
        self.hc[address] = k
        return k

    def task(self):
        from test_herdr_task import Store
        t = {"id": 4, "title": "x", "state": "running", "space": "sp1",
             "agents": [{"address": "t1", "agent": "claude", "argv": ["claude"], "account": "default", "session": "s-1",
                         "log": os.path.join(self.home, ".claude", "projects", "-w-repo", "s-1.jsonl")}]}
        return Store([t]), t

    def test_copy_keeps_the_project_folder(self):
        dst = self.mv.copy_session("s-1", "default", "work")
        self.assertEqual(dst, os.path.join(self.home, ".claude-work", "projects", "-w-repo", "s-1.jsonl"))
        with open(dst) as f:
            self.assertEqual(f.read(), '{"type":"user"}\n')
        self.assertTrue(os.path.isdir(os.path.join(self.home, ".claude-work", "projects", "-w-repo", "s-1", "subagents")))
        self.assertIsNone(self.mv.copy_session("nope", "default", "work"))
        self.assertIsNone(self.mv.copy_session("s-1", "default", "default"))

    def test_an_idle_agent_resumes_on_the_new_account(self):
        s, t = self.task()
        k = self.agent()
        new = self.mv.move_agent(s, t, k, "work")
        self.assertEqual(new["account"], "work")
        self.assertEqual(new["resume"], ["claude", "--resume", "s-1"])
        self.assertEqual(new["moved"]["from"], "default")
        self.assertEqual(self.killed, ["t1"])
        self.assertEqual(t["agents"][0]["moved_to"], "work")

    def test_a_working_turn_is_never_ended(self):
        s, t = self.task()
        self.assertFalse(self.mv.quiet(self.agent("working")))
        self.assertFalse(self.mv.quiet(self.agent("blocked")))
        self.assertEqual(self.mv.candidates(s, t, ["default"]), [])
        # Idle at first, at work again by the last look: the new agent goes, the old one keeps its turn.
        k = self.agent("idle", 3)
        orig = self.mv.hc_json
        with mock.patch.object(self.mv, "hc_json", lambda verb, addr: dict(orig(verb, addr), status={"state": "working"}, turn=4)):
            self.assertIsNone(self.mv.move_agent(s, t, k, "work"))
        self.assertEqual(self.killed, ["t10"])
        self.assertEqual([a["address"] for a in t["agents"]], ["t1"])

    def test_a_held_message_or_typing_keeps_it(self):
        k = self.agent()
        os.makedirs(self.mv.STORE)
        with open(os.path.join(self.mv.STORE, ".held.json"), "w") as f:
            json.dump({"t1": [{"text": "hi"}]}, f)
        self.assertFalse(self.mv.quiet(k))

    def test_due_only_while_the_rule_applies(self):
        def pick(d):
            os.makedirs(os.path.dirname(self.acc.FILE), exist_ok=True)
            with open(self.acc.FILE, "w") as f:
                json.dump(d, f)
        mv = {"from": ["default"], "to": "work", "at": 1}
        pick({"active": "work", "running": "stays", "moving": mv})
        self.assertIsNone(self.mv.due())
        pick({"active": "work", "running": "moves", "moving": mv})
        self.assertEqual(self.mv.due(), {"from": ["default"], "to": "work"})
        pick({"active": "default", "running": "moves", "moving": mv})
        self.assertIsNone(self.mv.due(), "undone: the active account is the old one again")
        import time
        pick({"active": "work", "running": "moves", "moving": dict(mv, at=time.time() * 1000)})
        self.assertIsNone(self.mv.due(), "inside the Undo window")

    def test_a_stopped_task_resumes_on_the_new_account(self):
        s, t = self.task()
        self.assertTrue(self.mv.repoint(s, t, ["default"], "work"))
        a = t["agents"][-1]
        self.assertEqual((a["account"], a["moves"][0]["from"]), ("work", "default"))
        self.assertTrue(a["log"].startswith(os.path.join(self.home, ".claude-work")))

    def test_picks_list_and_set(self):
        d = self.acc.listing()
        self.assertEqual([a["id"] for a in d["accounts"]], ["default", "work"])
        self.assertEqual(d["active"], "default")
        self.acc.set_picks({"active": "work", "skipped": ["work"], "switch_at": 72, "running": "moves"})
        d = self.acc.listing()
        self.assertEqual((d["active"], d["skipped"], d["switch_at"], d["running"]), ("work", ["work"], 70, "moves"))
        for bad in ({"active": "nope"}, {"evil": 1}, {"order": ["../x"]}, {"auto": "yes"}, {}):
            with self.assertRaises(self.acc.Fail):
                self.acc.set_picks(bad)


if __name__ == "__main__":
    unittest.main()
