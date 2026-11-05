"""Moving running task agents to another Claude account (Settings > Accounts: Work already running: Moves).

A Claude Code session lives in its account's folder (<folder>/projects/<project>/<session>.jsonl), so an agent moves
by: waiting until it is idle between turns (never while a turn works, asks or waits on a person typing to it), copying
its transcript (and the session's folder of tool results and subagents) into the same project folder of the target
account, starting it there with `--resume <session>` (launch(), as resume and switch do), and only then ending the old
terminal, after one last look that it is still idle on the same turn. If it took up work meanwhile the new agent goes
instead and the old one finishes; the copy left behind is harmless. The task's record keeps both agents; the new one
says where it came from ("moved": {"from", "at"}).

When: the status bar's switch rule (lib/usage-data.js) writes ~/.herdr/accounts.json "moving" = {"from": [ids],
"to": id, "at": ms} when it moves new work to the next account and the person picked Moves. The tick's moves_pass then
moves, a few per tick, every running task's idle Claude worker that runs on one of "from", while "to" is still the
active account (an Undo or a manual pick stops it), "running" is still "moves", and the Undo window has passed.
`herdr-task accounts move --from X --to Y` does one round now (Settings > Machines' "Move to Default", on that
machine): idle workers move, stopped tasks get their session copied and resume on Y, working ones are left to finish
and listed."""

import json
import os
import shutil
import time

from .base import hc_json, now, run, STORE
from . import accounts
from .agents import agent_running, detail, live_agents, status_word

GRACE_MS = 15000        # the switch toast's Undo stays 10 s: nothing moves before it's gone
SETTLE_S = 2            # an idle agent must still be idle, on the same turn, this much later
PER_TICK = 4            # at most this many moves per tick (each starts an agent)


def idle(k):
    """Its agent runs and sits between turns: Herdr's status idle or done (never working or blocked)."""
    return bool(k) and k.get("state", "live") == "live" and agent_running(k) and status_word(k) in ("idle", "done")


def held(address):
    """A message waits for it (news.py's held_pass sends it once the person stops typing)."""
    try:
        with open(os.path.join(STORE, ".held.json")) as f:
            return bool((json.load(f) or {}).get(address))
    except (OSError, ValueError, AttributeError):
        return False


def quiet(k):
    """Idle, nobody typing to it, nothing held for it."""
    if not idle(k):
        return False
    from .news import typing
    return not typing(k["address"], k) and not held(k["address"])


def find_log(account, session, log=None):
    """The session's transcript in that account's folder: the recorded log when it is there, else a search."""
    base = os.path.join(accounts.folder(account), "projects")
    if log and os.path.isfile(log) and os.path.realpath(log).startswith(os.path.realpath(base) + os.sep):
        return log
    for d in sorted(os.listdir(base)) if os.path.isdir(base) else []:
        f = os.path.join(base, d, session + ".jsonl")
        if os.path.isfile(f):
            return f
    return None


def copy_session(session, frm, to, log=None):
    """Copies the transcript and the session's folder from account frm into account to, same project folder (Claude
    Code finds a session by the folder it runs in). Returns the new transcript's path, or None when there's none."""
    src = find_log(frm, session, log)
    if not src or frm == to:
        return None
    proj = os.path.basename(os.path.dirname(src))
    dst_dir = os.path.join(accounts.folder(to), "projects", proj)
    os.makedirs(dst_dir, mode=0o700, exist_ok=True)
    dst = os.path.join(dst_dir, session + ".jsonl")
    tmp = f"{dst}.{os.getpid()}.tmp"
    shutil.copy2(src, tmp)
    os.replace(tmp, dst)
    side = os.path.join(os.path.dirname(src), session)
    if os.path.isdir(side):
        shutil.copytree(side, os.path.join(dst_dir, session), dirs_exist_ok=True)
    return dst


def move_agent(s, t, k, to, settled_turn=None):
    """Moves one quiet Claude worker k (its hc record) to account `to`. Returns the new agent record, or None when it
    moved nothing (unknown session, already there, or busy again by the last look)."""
    from .launch import launch, parent_for, resume_argv
    from .sessions import refresh_sessions
    a = next((x for x in t["agents"] if x.get("address") == k.get("address")), None)
    if not a or a.get("agent") != "claude" or (a.get("account") or accounts.DEFAULT) == to:
        return None
    refresh_sessions(s, t, [k])
    sid, frm = a.get("session"), a.get("account") or accounts.DEFAULT
    argv = a.get("argv") or ["claude"]
    space = (k.get("labels") or {}).get("herdr.task.space") or t.get("space")
    res = resume_argv(argv, sid) if sid and space else None
    log = copy_session(sid, frm, to, a.get("log")) if res else None
    if not log:
        return None
    new = launch(s, t, argv, space, parent=parent_for(a.get("parent"), space), resume=res, account=to)
    new.update(session=sid, log=log, moved={"from": frm, "at": now()})
    # The last look: still idle on the same turn. Else the old one keeps its turn and the new one goes.
    k2 = hc_json("get", k["address"])
    turn = settled_turn if settled_turn is not None else (k.get("turn") or 0)
    if not quiet(k2) or (k2.get("turn") or 0) != turn:
        run(["hc", "kill", new["address"]])
        t["agents"].remove(new)
        s.dirty = True
        return None
    run(["hc", "kill", k["address"]])
    a["ended"] = now()
    a["moved_to"] = to
    s.dirty = True
    return new


def candidates(s, t, frm):
    """The task's quiet Claude workers on one of the accounts frm (their hc records)."""
    out = []
    for k in map(detail, live_agents(s.key(t))):
        if (k.get("labels") or {}).get("herdr.role") == "reviewer" or not quiet(k):
            continue
        a = next((x for x in t["agents"] if x.get("address") == k.get("address")), None)
        if a and a.get("agent") == "claude" and (a.get("account") or accounts.DEFAULT) in frm:
            out.append(k)
    return out


def working(s, t, frm):
    """The task's Claude workers on frm that are at work now (left to finish their turn)."""
    out = []
    for k in map(detail, live_agents(s.key(t))):
        a = next((x for x in t["agents"] if x.get("address") == k.get("address")), None)
        if a and a.get("agent") == "claude" and (a.get("account") or accounts.DEFAULT) in frm and agent_running(k) and not quiet(k):
            out.append(k)
    return out


def due():
    """The move the switch rule asked for, while it still applies: {"from": [ids], "to": id} or None."""
    d = accounts.picks()
    mv = d.get("moving")
    if accounts.switching()["running"] != "moves" or not isinstance(mv, dict):
        return None
    frm = [x for x in mv.get("from") or [] if isinstance(x, str)]
    to, at = mv.get("to"), mv.get("at")
    if not frm or not isinstance(to, str) or accounts.active() != to or not isinstance(at, (int, float)):
        return None
    if now() - at < GRACE_MS:
        return None
    return {"from": [x for x in frm if x != to], "to": to}


def each_running():
    """(store, task) for every running task with agents, store by store (a Store held while its tasks are used)."""
    from .store import locate, read_list, Store, store_files
    for p in store_files():
        d = read_list(p)
        if not d or not os.path.isdir(d.get("folder") or "") or not any(
                t.get("state") == "running" and t.get("agents") for t in d.get("tasks") or []):
            continue
        with Store(locate(d["folder"])) as s:
            for t in s.data["tasks"]:
                if t.get("state") == "running" and t.get("agents"):
                    yield s, t


def move_round(frm, to, limit=PER_TICK, stopped=False):
    """One round: quiet workers on frm move to `to` (settled first: SETTLE_S later, same turn). With `stopped`, a
    running task whose agent is gone and whose last agent ran on frm gets its session copied, so its resume starts on
    `to`. -> {"moved": [ref], "waiting": [ref], "repointed": [ref]}"""
    out = {"moved": [], "waiting": [], "repointed": []}
    found = []
    for s, t in each_running():
        ks = candidates(s, t, frm)
        if ks:
            found.append((s.loc["folder"], t["id"], {k["address"]: k.get("turn") or 0 for k in ks}))
        elif working(s, t, frm):
            out["waiting"].append(s.ref(t))
        elif stopped and repoint(s, t, frm, to):
            out["repointed"].append(s.ref(t))
    if not found:
        return out
    time.sleep(SETTLE_S)
    from .store import locate, Store
    for folder, tid, turns in found:
        with Store(locate(folder)) as s:
            t = next((x for x in s.data["tasks"] if x["id"] == tid), None)
            if not t:
                continue
            for k in candidates(s, t, frm):
                if k["address"] not in turns or (k.get("turn") or 0) != turns[k["address"]]:
                    out["waiting"].append(s.ref(t))
                    continue
                if len(out["moved"]) >= limit:
                    out["waiting"].append(s.ref(t))
                    continue
                if move_agent(s, t, k, to, settled_turn=turns[k["address"]]):
                    out["moved"].append(s.ref(t))
                else:
                    out["waiting"].append(s.ref(t))
    return out


def repoint(s, t, frm, to):
    """A stopped running task (no agent left) whose last agent was Claude on frm: its session copied to `to`, and that
    agent's record says so, so `resume` starts it there."""
    if any(agent_running(detail(k)) for k in live_agents(s.key(t))):
        return False
    a = (t.get("agents") or [None])[-1]
    if not a or a.get("agent") != "claude" or (a.get("account") or accounts.DEFAULT) not in frm or not a.get("session"):
        return False
    log = copy_session(a["session"], a.get("account") or accounts.DEFAULT, to, a.get("log"))
    if not log:
        return False
    a.setdefault("moves", []).append({"from": a.get("account") or accounts.DEFAULT, "to": to, "at": now()})
    a["account"], a["log"] = to, log
    s.dirty = True
    return True


def moves_pass(report):
    """The tick's turn: the switch rule's move, a few agents at a time."""
    mv = due()
    if not mv or not mv["from"]:
        return
    r = move_round(mv["from"], mv["to"])
    if r["moved"]:
        report["moved"] = r["moved"]
    if r["waiting"]:
        report["move_waiting"] = sorted(set(r["waiting"]))
