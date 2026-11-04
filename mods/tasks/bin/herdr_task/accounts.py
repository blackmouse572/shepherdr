"""Claude accounts: which Claude Code config folder a new agent starts on (Settings > Accounts).

An account is a Claude Code config folder on this machine: ~/.claude is "default", ~/.claude-<id> is <id>. The
window keeps the person's picks in ~/.herdr/accounts.json: {"active": <id>, "switch_at": .., "names": {<id>: name},
"hidden": [<id>]} (lib/usage-data.js writes it; the status bar moves "active" past the switch point). A new Claude
agent here starts on the active account (CLAUDE_CONFIG_DIR); a resumed one stays on the account its session is in,
since a session lives in its account's folder. Each machine has its own file: none means ~/.claude.

`herdr-task accounts prepare <id>` makes an account's folder (owner only) and gives it Shepherdr's hooks, as the
installer gave ~/.claude (the question and permission cards); a launch on an account checks the hooks again, so a
folder made by hand gets them too."""

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


def cmd_accounts(args):
    from .output import say
    if args.action == "prepare":
        path, made, hooks = prepare(args.account)
        say(args, {"account": args.account, "folder": path, "made": made, "hooks": hooks},
            f"{path} {'made' if made else 'is there'}" + (f"; hooks added: {', '.join(hooks)}." if hooks else "."))
    else:
        a = active()
        say(args, {"active": a, "folder": folder(a)}, f"New Claude agents start on {a} ({folder(a)}).")
