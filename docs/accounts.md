# Accounts

Shepherdr can use more than one Claude account on a machine. Each account is a Claude Code config folder:
`~/.claude` is **Default**, and every `~/.claude-<id>` is the account `<id>`. Codex has its one sign-in (`~/.codex`).

## Where you see them

- **The status bar** shows, after the machine, the usage pill (the active account, its 5-hour session and its week),
  the switch rule ("switch at 95% · Personal next") and Codex's plan and session. A click opens the usage popover: one
  card per account, meters with the switch point, and a chevron for an account's detail (the last 7 days, this week
  by space, when the week resets, and Use for new work or Sign in).
- **Settings > Accounts** lists the accounts in their switch order, one compact row each. A row's ⋯ renames it, sets it
  as default (new work starts there), signs in again, opens its folder, moves it up or down in the order, skips it
  when switching, or removes it. **Add account** sits in the Claude card's header. The Switching card holds the rule,
  the Codex card signs Codex in and out (`codex login` / `codex logout`). With connected machines, a machine's own
  ~/.claude and Codex show read-only, as Settings > Machines reads them.
- **Tasks** show the account their Claude agent runs on: an initial in the task list, its name in the task's header.

## What "active" does

New task agents and reviewers that run Claude Code start on the **ACTIVE** account: herdr-task adds
`CLAUDE_CONFIG_DIR=~/.claude-<id>` when it starts them (`herdr_task/accounts.py`). A resumed task stays on the account
its session started on, because the session lives in that account's folder. Assistants still start on Default.

With **Switch automatically** on, past **Switch above** (95% by default, of the 5-hour session window only) the status
bar makes the next account in the switch order active: the first that isn't skipped, works, and has room in its own
5-hour window. A toast says so and names the next queued task; with **Toast with Undo** on, Undo (10 seconds) puts
the old account back and leaves it until its window resets. Running tasks keep their account: **Work already
running: Moves** is stored, but a running session can't move yet (it lives in its account's folder), so it stays.

## Adding, renaming, removing

- **Add**: a name makes `~/.claude-<id>` (owner only) with Shepherdr's question and permission hooks
  (`herdr-task accounts prepare <id>`), then opens a terminal running `claude /login` with that folder.
- **Rename** gives the account a name of your own. The folder keeps its name, because a Mac keeps the sign-in in the
  Keychain under the folder's path.
- **Remove** hides the account from Shepherdr. Its folder and sign-in stay, and **Show again** brings it back. The
  default and the active account can't be removed.

The picks live in `~/.herdr/accounts.json` (`active`, `auto`, `switch_at`, `running`, `undo`, `names`, `hidden`,
`order`, `skipped`), one file per machine; `herdr-task accounts` prints them. A machine without one uses Default. A
`switch_at` of 100 from before `auto` reads as switching off.

## Where the numbers come from

`mods/workspace-status-chat/bin/herdr-usage` reads each account's plan limits the way Settings > Machines does:
Claude Code's own `/usage`, in a sealed process that writes nothing real (herdr-task's `machine.py`). The 7-day bars and
the split by space come from the account's own transcripts (`<folder>/projects/*/*.jsonl`). The installer gives every
`~/.claude-<id>` that exists at install time the same hooks as `~/.claude`.
