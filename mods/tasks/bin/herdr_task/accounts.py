"""Claude accounts: which Claude Code config folder a new agent starts on (Settings > Accounts).

An account is a Claude Code config folder on this machine: ~/.claude is "default", ~/.claude-<id> is <id>. The
window keeps the person's picks in ~/.herdr/accounts.json: {"active": <id>, "auto": bool, "switch_at": 50..95 (of the
5h window), "running": "stays" | "moves", "undo": bool, "names": {<id>: name}, "hidden": [<id>], "order": [<id>],
"skipped": [<id>], "moving": {"from": [<id>], "to": <id>, "at": ms}} (lib/usage-data.js writes it; the status bar moves "active" to the next account in "order" that
isn't skipped, past the switch point). A switch_at of 100 from before "auto" means switching is off. A new Claude
agent here starts on the active account (CLAUDE_CONFIG_DIR); a resumed one stays on the account its session is in,
since a session lives in its account's folder. Each machine has its own file: none means ~/.claude.

`herdr-task accounts prepare <id>` makes an account's folder (owner only) and gives it Shepherdr's hooks, as the
installer gave ~/.claude (the question and permission cards); a launch on an account checks the hooks again, so a
folder made by hand gets them too. `accounts list` / `accounts set '<json>'` read and set the picks for another
machine's Settings > Accounts (run there with herdr's exec on that machine); `accounts move --from X --to Y` moves
its running tasks between turns (moves.py), as "moving" does when the switch rule moves new work and "running" is
"moves"."""

import json
import os
import re

from .base import Fail, HOME

FILE = os.environ.get("HERDR_ACCOUNTS") or os.path.join(HOME, ".herdr", "accounts.json")
DEFAULT = "default"
ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,23}$")
# The installer's hooks (bin/shepherdr HOOKS): entries whose command runs one of these, from ~/.claude/settings.json.
OURS = "/mods/chat/"


def folder(account):
    """The account's config folder."""
    if not account or account == DEFAULT:
        return os.path.join(HOME, ".claude")
    if not ID.match(account):
        raise Fail(f"{account!r} isn't an account name: lowercase letters, digits and dashes, at most 24.")
    return os.path.join(HOME, f".claude-{account}")


def picks():
    try:
        with open(FILE) as f:
            d = json.load(f)
    except (OSError, ValueError):
        d = {}
    return d if isinstance(d, dict) else {}


def switching():
    """The switch rule as the window reads it (core/usage.js normPrefs): {auto, switch_at, running, order, skipped}."""
    d = picks()
    at = d.get("switch_at")
    at = at if isinstance(at, (int, float)) and not isinstance(at, bool) else 95
    old = at >= 100
    strs = lambda v: [x for x in v if isinstance(x, str)] if isinstance(v, list) else []
    return {"auto": d["auto"] if isinstance(d.get("auto"), bool) else not old,
            "switch_at": 95 if old else min(95, max(50, int(round(at / 5.0)) * 5)),
            "running": "moves" if d.get("running") == "moves" else "stays",
            "order": strs(d.get("order")), "skipped": strs(d.get("skipped"))}


def active():
    """The account new Claude agents here start on: the one picked when its folder is there, else default."""
    a = picks().get("active")
    if isinstance(a, str) and a != DEFAULT and ID.match(a) and os.path.isdir(folder(a)):
        return a
    return DEFAULT


def env(account):
    """The environment an agent on `account` starts with: CLAUDE_CONFIG_DIR for any but default (which Claude Code
    finds by itself, and whose macOS Keychain item has no folder hash)."""
    if not account or account == DEFAULT:
        return []
    return [f"CLAUDE_CONFIG_DIR={folder(account)}"]


def _read(path):
    try:
        with open(path) as f:
            d = json.load(f)
        return d if isinstance(d, dict) else None
    except OSError:
        return {}
    except ValueError:
        return None


def ensure_hooks(account):
    """Copies Shepherdr's hook entries from ~/.claude/settings.json into the account's settings.json where they're
    missing. Returns the events it added; leaves a settings.json that isn't JSON alone."""
    if not account or account == DEFAULT:
        return []
    base = _read(os.path.join(HOME, ".claude", "settings.json")) or {}
    path = os.path.join(folder(account), "settings.json")
    mine = _read(path)
    if mine is None or not os.path.isdir(folder(account)):
        return []
    added = []
    for event, entries in (base.get("hooks") or {}).items():
        for e in entries if isinstance(entries, list) else []:
            cmds = [h.get("command", "") for h in (e.get("hooks") or []) if isinstance(h, dict)]
            ours = [c for c in cmds if OURS in c]
            if not ours:
                continue
            have = mine.setdefault("hooks", {}).setdefault(event, [])
            script = ours[0].split(OURS)[-1]
            if any(script in (h.get("command") or "") and OURS in (h.get("command") or "")
                   for x in have if isinstance(x, dict) for h in (x.get("hooks") or []) if isinstance(h, dict)):
                continue
            have.append(e)
            added.append(event)
    if added:
        tmp = path + ".tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(mine, f, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    return added


def prepare(account):
    """Makes the account's folder (owner only) and gives it the hooks. -> (folder, made, hooks added)."""
    if not account or account == DEFAULT:
        raise Fail("The default account is ~/.claude itself.")
    path = folder(account)
    made = not os.path.isdir(path)
    if made:
        os.makedirs(path, mode=0o700)
    return path, made, ensure_hooks(account)


def ids():
    """Every account here: default, then each ~/.claude-<id> folder."""
    import glob
    found = sorted(os.path.basename(d)[len(".claude-"):] for d in glob.glob(os.path.join(HOME, ".claude-*")) if os.path.isdir(d))
    return [DEFAULT] + [x for x in found if ID.match(x)]


def signed_in(account):
    """Claude Code's sign-in as its folder records it (the account's email), or None. Cheap: nothing is run."""
    own = account and account != DEFAULT
    path = os.path.join(folder(account), ".claude.json") if own else os.path.join(HOME, ".claude.json")
    d = _read(path) or {}
    email = (d.get("oauthAccount") or {}).get("emailAddress") if isinstance(d.get("oauthAccount"), dict) else None
    return str(email)[:80] if email else None


def tasks_on():
    """The running tasks here whose last agent is Claude, by account: {id: [{ref, folder, live}]}."""
    from .store import read_list, store_files
    out = {}
    for p in store_files():
        d = read_list(p) or {}
        for t in d.get("tasks") or []:
            a = (t.get("agents") or [None])[-1]
            if t.get("state") != "running" or not a or a.get("agent") != "claude" or a.get("ended"):
                continue
            ref = f"{d['prefix']}-{t['id']}" if d.get("prefix") else f"#{t['id']}"
            out.setdefault(a.get("account") or DEFAULT, []).append({"ref": ref, "folder": os.path.basename(d.get("folder") or "")})
    return out


def limits_of(accounts):
    """Each account's plan limits, side by side, as herdr-usage reads them (machine.py's sealed /usage)."""
    import threading
    from . import machine
    got = {}

    def one(a):
        try:
            got[a] = machine.claude(None if a == DEFAULT else folder(a))
        except Exception:
            got[a] = {"state": "unknown"}
    jobs = [threading.Thread(target=one, args=(a,)) for a in accounts]
    for j in jobs:
        j.start()
    for j in jobs:
        j.join()
    return got


def listing(usage=False):
    """This machine's accounts and picks, for another machine's Settings > Accounts (`accounts list --json`).
    `usage`: each account's plan limits too ("limits", slow: Claude Code's /usage per account)."""
    d, rule = picks(), switching()
    names = {k: v for k, v in (d.get("names") or {}).items() if isinstance(v, str)} if isinstance(d.get("names"), dict) else {}
    hidden = [x for x in d.get("hidden") or [] if isinstance(x, str)] if isinstance(d.get("hidden"), list) else []
    on = tasks_on()
    rows = [{"id": a, "name": names.get(a) or ("Default" if a == DEFAULT else a), "folder": folder(a).replace(HOME, "~", 1),
             "account": signed_in(a), "signed_in": bool(signed_in(a)), "tasks": on.get(a, [])} for a in ids()]
    if usage:
        got = limits_of([r["id"] for r in rows])
        for r in rows:
            r["limits"] = got.get(r["id"])
    return {"accounts": rows, "active": active(), "names": names, "hidden": hidden,
            "undo": d["undo"] if isinstance(d.get("undo"), bool) else True, **rule}


# The picks another machine may set here (`accounts set '<json>'`), each checked as normPrefs would.
SETTABLE = ("active", "auto", "switch_at", "running", "undo", "order", "skipped", "hidden", "names")


def set_picks(change):
    """Merges checked picks into accounts.json (atomic). Raises Fail on a pick that isn't one."""
    if not isinstance(change, dict) or not change or any(k not in SETTABLE for k in change):
        raise Fail(f"Only these can be set: {', '.join(SETTABLE)}.")
    known = set(ids())
    for k, v in change.items():
        if k == "active" and (not isinstance(v, str) or v not in known):
            raise Fail(f"{v!r} isn't an account here.")
        if k in ("auto", "undo") and not isinstance(v, bool):
            raise Fail(f"{k} is true or false.")
        if k == "switch_at" and (isinstance(v, bool) or not isinstance(v, (int, float))):
            raise Fail("switch_at is a number.")
        if k == "running" and v not in ("stays", "moves"):
            raise Fail("running is stays or moves.")
        if k in ("order", "skipped", "hidden") and (not isinstance(v, list) or any(not isinstance(x, str) or not ID.match(x) for x in v)):
            raise Fail(f"{k} is a list of account names.")
        if k == "names" and (not isinstance(v, dict) or any(not isinstance(x, str) for x in v.values())):
            raise Fail("names maps an account to its name.")
    if "switch_at" in change:
        change = {**change, "switch_at": min(95, max(50, int(round(change["switch_at"] / 5.0)) * 5))}
    d = {**picks(), **change}
    if change.get("running") == "stays":
        d.pop("moving", None)
    os.makedirs(os.path.dirname(FILE), exist_ok=True)
    tmp = f"{FILE}.{os.getpid()}.tmp"
    with open(tmp, "w") as f:
        json.dump(d, f, indent=2)
        f.write("\n")
    os.replace(tmp, FILE)
    return d


def cmd_accounts(args):
    from .output import say
    if args.action == "prepare":
        path, made, hooks = prepare(args.account)
        say(args, {"account": args.account, "folder": path, "made": made, "hooks": hooks},
            f"{path} {'made' if made else 'is there'}" + (f"; hooks added: {', '.join(hooks)}." if hooks else "."))
    elif args.action == "list":
        d = listing(getattr(args, "usage", False))
        say(args, d, "\n".join(f"{'*' if a['id'] == d['active'] else ' '} {a['name']} ({a['folder']})"
                               f"{'' if a['signed_in'] else ' signed out'}" for a in d["accounts"]))
    elif args.action == "set":
        try:
            change = json.loads(args.account or "")
        except ValueError:
            raise Fail("set takes the picks as JSON: accounts set '{\"active\": \"work\"}'.")
        set_picks(change)
        say(args, listing(), "Saved.")
    elif args.action == "move":
        from .moves import move_round
        frm = getattr(args, "frm", None) or args.account
        to = getattr(args, "to", None) or DEFAULT
        if not frm:
            raise Fail("Which account do tasks move from? accounts move --from <account> [--to <account>]")
        for a in (frm, to):
            folder(a)
            if a not in ids():
                raise Fail(f"{a!r} isn't an account here.")
        if frm == to:
            raise Fail("They are the same account.")
        r = move_round([frm], to, limit=50, stopped=True)
        parts = [f"moved {', '.join(r['moved'])}" if r["moved"] else "",
                 f"resume on {to}: {', '.join(r['repointed'])}" if r["repointed"] else "",
                 f"still working, left to finish: {', '.join(sorted(set(r['waiting'])))}" if r["waiting"] else ""]
        say(args, {"from": frm, "to": to, **r}, "; ".join(p for p in parts if p) or f"Nothing runs on {frm}.")
    else:
        a, rule = active(), switching()
        say(args, {"active": a, "folder": folder(a), **rule},
            f"New Claude agents start on {a} ({folder(a)}); "
            + (f"switches above {rule['switch_at']}% of the 5h window." if rule["auto"] else "switching is off."))
