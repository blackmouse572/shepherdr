# Accounts

Shepherdr can use more than one Claude account on a machine. Each account is a Claude Code config folder:
`~/.claude` is **Default**, and every `~/.claude-<id>` is the account `<id>`. Codex has its one sign-in (`~/.codex`).

## Where you see them

- **The status bar** shows, after the machine, the usage pill (the active account, its 5-hour session and its week),
  the switch rule ("switch at 95% · Personal next") and Codex's plan and session. A click opens the usage popover: one
  card per account, meters with the switch point, and a chevron for an account's detail (the last 7 days, this week
  by space, when the week resets, and Sign in when signed out). Another account's card has a quick Switch. Numbers
  kept from an earlier read, after a read failed, show dimmed with when they were read ("as of 10:42").
- **Settings > Accounts** lists the accounts in their switch order, one compact row each; drag a row by its grip to
  reorder. A row's ⋯ renames it, sets it as default (new work starts there), signs in again, opens its folder, moves it
  up or down in the order, skips it when switching, or removes it. **Add account** sits in the Claude card's header. The Switching card holds the rule,
  the Codex card signs Codex in and out (`codex login` / `codex logout`). With connected machines, the machine switch
  (This Mac | build-box) shows that machine's own accounts and picks: Settings runs herdr-task there (`herdr-task
  accounts list --json`, herdr's exec on that machine) and Set as default, Skip and Move up / down change them there
  (`accounts set '<json>'`). A signed-out account there with tasks gets **Move to Default** (`accounts move`). Its usage
  meters come a moment after (`accounts list --usage` reads each account's limits there, at most every 5 minutes), and
  switching by usage runs only where a window reads usage. A machine whose
  herdr-task can't answer yet shows its ~/.claude and Codex read-only, as Settings > Machines reads them.
- **Settings > Machines** lists another machine's accounts the same way; a signed-out one says which tasks it holds
  ("EVL-3 and EVL-4 in eval-runner are paused until it signs in") and offers Move to Default.
- **Tasks** show the account their Claude agent runs on: an initial in the task list, its name in the task's header.

## What "active" does

New task agents and reviewers that run Claude Code start on the **ACTIVE** account: herdr-task adds
`CLAUDE_CONFIG_DIR=~/.claude-<id>` when it starts them (`herdr_task/accounts.py`). A resumed task stays on the account
its session started on, because the session lives in that account's folder. Assistants still start on Default.

With **Switch automatically** on, past **Switch above** (95% by default, of the 5-hour session window only) the status
bar makes the next account in the switch order active: the first that isn't skipped, works, and has room in its own
5-hour window. A toast says so and names the next queued task; with **Toast with Undo** on, Undo (10 seconds) puts
the old account back and leaves it until its window resets.

**Work already running** decides what happens to tasks already at work when the rule switches:

- **Stays** (the default): they keep the account they started on.
- **Moves**: the switch also writes `moving` (`{from, to, at}`) to `accounts.json`, and herdr-task's scheduler moves
  each running task's Claude worker on an old account to the new one, a few per round (`herdr_task/moves.py`). An
  agent moves only between turns: Herdr shows it idle, it stays idle on the same turn for 2 seconds, nobody is typing
  to it and no message is held for it. Then its session transcript (and the session's folder) is copied into the same
  project folder of the new account, a new agent starts there with `--resume <session>`, and the old terminal ends
  after one last look that it's still idle on the same turn; if it took up work meanwhile, the new agent goes and the
  old one finishes. A working turn, a permission ask or a question is never interrupted: those agents move once their
  turn ends. Nothing moves during the Undo window; Undo, a manual pick of another account or Stays stops it. The task's
  record keeps both agents: the new one has `account` and `moved: {from, at}`, the old one `moved_to`.
- `herdr-task accounts move --from <id> [--to <id>]` does one round by hand: idle workers move, a stopped task's
  session is copied so `resume` starts it on the new account, and working ones are listed to try again.

## Adding, renaming, removing

- **Add**: a name makes `~/.claude-<id>` (owner only) with Shepherdr's question and permission hooks
  (`herdr-task accounts prepare <id>`), then opens a terminal running `claude /login` with that folder.
- **Rename** gives the account a name of your own. The folder keeps its name, because a Mac keeps the sign-in in the
  Keychain under the folder's path.
- **Remove** hides the account from Shepherdr. Its folder and sign-in stay, and **Show again** brings it back. The
  default and the active account can't be removed.

The picks live in `~/.herdr/accounts.json` (`active`, `auto`, `switch_at`, `running`, `undo`, `names`, `hidden`,
`order`, `skipped`, `moving`), one file per machine; `herdr-task accounts` prints them, `accounts list --json` lists
the accounts with them, `accounts set '<json>'` changes them (checked: only those keys, real accounts). A machine without one uses Default. A
`switch_at` of 100 from before `auto` reads as switching off.

## Where the numbers come from

`mods/workspace-status-chat/bin/herdr-usage` reads each account's plan limits the way Settings > Machines does:
Claude Code's own `/usage`, in a sealed process that writes nothing real (herdr-task's `machine.py`). The 7-day bars and
the split by space come from the account's own transcripts (`<folder>/projects/*/*.jsonl`). The installer gives every
`~/.claude-<id>` that exists at install time the same hooks as `~/.claude`.
