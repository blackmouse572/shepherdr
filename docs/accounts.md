# Accounts

Shepherdr can use more than one Claude account on a machine. Each account is a Claude Code config folder:
`~/.claude` is **Default**, and every `~/.claude-<id>` is the account `<id>`. Codex has its one sign-in (`~/.codex`).

## Where you see them

- **The status bar's usage pill** shows the active account, its 5-hour session and its week. A click opens the usage
  popover: one card per account, meters with the switch point, and a chevron for an account's detail (the last 7 days,
  this week by space, when the week resets).
- **Settings > Accounts** has the same cards and lets you add, rename, sign in again and remove accounts.

## What "active" does

New task agents and reviewers that run Claude Code start on the **ACTIVE** account: herdr-task adds
`CLAUDE_CONFIG_DIR=~/.claude-<id>` when it starts them (`herdr_task/accounts.py`). A resumed task stays on the account
its session started on, because the session lives in that account's folder. Assistants still start on Default.

Past **Switch above** (95% by default, of the 5-hour session or the week), the status bar makes the emptiest other
account active and says so in a toast. Running tasks keep their account. Off (100%) never switches.

## Adding, renaming, removing

- **Add**: a name makes `~/.claude-<id>` (owner only) with Shepherdr's question and permission hooks
  (`herdr-task accounts prepare <id>`), then opens a terminal running `claude /login` with that folder.
- **Rename** gives the account a name of your own. The folder keeps its name, because a Mac keeps the sign-in in the
  Keychain under the folder's path.
- **Remove** hides the account from Shepherdr. Its folder and sign-in stay, and **Show again** brings it back. The
  default and the active account can't be removed.

The picks live in `~/.herdr/accounts.json` (`active`, `switch_at`, `names`, `hidden`), one file per machine. A machine
without one uses Default.

## Where the numbers come from

`mods/workspace-status-chat/bin/herdr-usage` reads each account's plan limits the way Settings > Machines does:
Claude Code's own `/usage`, in a sealed process that writes nothing real (herdr-task's `machine.py`). The 7-day bars and
the split by space come from the account's own transcripts (`<folder>/projects/*/*.jsonl`). The installer gives every
`~/.claude-<id>` that exists at install time the same hooks as `~/.claude`.
