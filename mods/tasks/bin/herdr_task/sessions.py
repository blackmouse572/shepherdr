"""Agent sessions: the Claude Code or Codex session a task's agent runs, so it can resume."""

import json
import os
import re
import shutil

from .base import HOME, run
from .agents import agent_running, detail


# ---- agent sessions -------------------------------------------------------------------------

def kids(pid):
    r = run(["pgrep", "-P", str(pid)])
    out = []
    for p in r.stdout.split():
        out.append(p)
        out.extend(kids(p))
    return out


def claude_folders():
    """Every Claude account's config folder here (accounts.py): ~/.claude, then each ~/.claude-<id>."""
    import glob
    return [os.path.join(HOME, ".claude")] + sorted(d for d in glob.glob(os.path.join(HOME, ".claude-*")) if os.path.isdir(d))


def session_of(pid):
    """(session id, log path) of the agent process pid (or a child), as core/chat-log.js finds it:
    Claude Code names its session in <account folder>/sessions/<pid>.json; Codex holds its rollout open."""
    folders = claude_folders()
    for p in [str(pid)] + kids(pid):
        j = next((x for x in (os.path.join(c, "sessions", p + ".json") for c in folders) if os.path.isfile(x)), None)
        if j:
            try:
                with open(j) as f:
                    sid = json.load(f).get("sessionId")
            except (OSError, ValueError):
                sid = None
            if sid:
                log = None
                base = os.path.join(os.path.dirname(os.path.dirname(j)), "projects")
                for d in os.listdir(base) if os.path.isdir(base) else []:
                    f = os.path.join(base, d, sid + ".jsonl")
                    if os.path.isfile(f):
                        log = f
                        break
                return sid, log
        files = []
        fd = f"/proc/{p}/fd"
        if os.path.isdir(fd):
            for n in os.listdir(fd):
                try:
                    files.append(os.readlink(os.path.join(fd, n)))
                except OSError:
                    pass
        elif shutil.which("lsof"):
            files = [l[1:] for l in run(["lsof", "-p", p, "-Fn"]).stdout.split("\n") if l.startswith("n")]
        for f in files:
            m = re.search(r"/rollout-.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$", f)
            if m:
                return m.group(1), f
    return None, None


def refresh_sessions(s, task, live):
    """Records each live agent's current session (it changes on /clear)."""
    for k in live:
        k = detail(k)
        pid = (k.get("foreground") or {}).get("pid")
        a = next((a for a in task["agents"] if a["address"] == k["address"]), None)
        if not pid or not a or not agent_running(k):
            continue
        sid, log = session_of(pid)
        if sid and (a.get("session"), a.get("log")) != (sid, log):
            a["session"], a["log"] = sid, log
            s.dirty = True
