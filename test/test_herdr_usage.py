"""herdr-usage (mods/workspace-status-chat/bin/herdr-usage): the accounts it finds, the meters it makes of
machine.py's plan limits, and the last 7 days from transcripts. Throwaway homes only, and no limits read (--no-fetch)."""
import datetime as dt
import importlib.machinery
import importlib.util
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "mods", "workspace-status-chat", "bin", "herdr-usage")


def load():
    loader = importlib.machinery.SourceFileLoader("herdr_usage", SCRIPT)
    spec = importlib.util.spec_from_loader("herdr_usage", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


U = load()


def line(ts, cwd, mid, out=100, inp=10, cache=5, read=1000):
    return json.dumps({"type": "assistant", "timestamp": ts, "cwd": cwd, "requestId": "r" + mid,
                       "message": {"id": mid, "usage": {"input_tokens": inp, "output_tokens": out,
                                                        "cache_creation_input_tokens": cache, "cache_read_input_tokens": read}}})


class HerdrUsage(unittest.TestCase):
    def test_meters_from_plan_limits(self):
        got = {"state": "ok", "plan": "max", "windows": [
            {"name": "Weekly (all models)", "used": 51, "resets_at": 1762430000000},
            {"name": "5-hour", "used": 59.4, "resets_at": 1762260000000},
            {"name": "Weekly (Fable only)", "used": 37},
            {"name": "GPT-5 · Weekly", "used": 12}]}
        meters, plan, err = U.meters_from(got)
        self.assertEqual([m["id"] for m in meters], ["session", "weekly", "fable", "gpt-5"])
        self.assertEqual(meters[2]["label"], "Fable")
        self.assertEqual(meters[0]["pct"], 59.4)
        self.assertTrue(meters[0]["resets_at"].startswith("2025-"))
        self.assertEqual((plan, err), ("Max", None))
        self.assertEqual(U.meters_from({"state": "signed-out"})[2], "signed-out")
        self.assertEqual(U.meters_from(None)[2], "no-cli")
        self.assertEqual(U.meters_from({"state": "unknown", "why": "x"})[2], "error")

    def test_accounts_and_history(self):
        with tempfile.TemporaryDirectory() as home:
            today = dt.date.today()
            noon = lambda d: dt.datetime.combine(d, dt.time(12)).astimezone().isoformat()
            for d in (".claude", ".claude-personal", ".claude-work"):
                os.makedirs(os.path.join(home, d, "projects", "p"))
            os.makedirs(os.path.join(home, "code", "shep"))
            with open(os.path.join(home, ".claude", "projects", "p", "a.jsonl"), "w") as f:
                f.write(line(noon(today), f"{home}/code/shep/sub", "m1") + "\n")
                f.write(line(noon(today), f"{home}/code/shep/sub", "m1") + "\n")  # the same answer again: once
                f.write(line(noon(today - dt.timedelta(days=2)), f"{home}/code/other", "m2", out=200) + "\n")
                f.write(line(noon(today - dt.timedelta(days=30)), f"{home}/code/shep", "m3") + "\n")  # too old
                f.write("not json\n")
            spaces = json.dumps([{"name": "Shepherdr", "folder": f"{home}/code/shep"}])
            buf = io.StringIO()
            with redirect_stdout(buf):
                U.main(["--home", home, "--no-fetch", "--spaces", spaces])
            out = json.loads(buf.getvalue())
            self.assertEqual([a["id"] for a in out["claude"]], ["default", "personal", "work"])
            self.assertEqual([a["name"] for a in out["claude"]], ["Default", "Personal", "Work"])
            self.assertEqual(out["claude"][1]["folder"], "~/.claude-personal")
            d = out["claude"][0]
            self.assertEqual(len(d["days"]), 7)
            self.assertEqual(d["days"][-1], {"date": today.isoformat(), "tokens": 115})
            self.assertEqual(d["days"][-3]["tokens"], 215)
            self.assertEqual(d["spaces"], [{"name": "other", "tokens": 215}, {"name": "Shepherdr", "tokens": 115}])
            self.assertFalse(out["codex"]["signed_in"])


if __name__ == "__main__":
    unittest.main()
