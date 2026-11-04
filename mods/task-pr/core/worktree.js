// A task's worktree as its side views read it: what it changed against its base (Changes) and its pull request
// (Pull request), for the window's mods (task-changes, task-pr) and the web app's Diff and Pull request alike. git and
// gh run through a runner the caller gives (the window's exec, the service's herdr-core), on the task's machine.
// Shared core: the source is core/worktree.js; bin/sync-shared copies it into the mods in lib/COPIES.

// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie): a folder watch would see it, and
// every refresh would start the next one.
export const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];

// Where the task left its base: the fork point with its base branch, unless the base already holds all of it
// (merged), then the commit it started from. Neither: its last commit (only what isn't committed shows, as Herdr's
// Changes). git(args) -> { code, stdout }.
export async function against(git, { base, start }) {
  const head = (await git(["rev-parse", "--verify", "HEAD"])).stdout?.trim();
  if (!head) return null;
  if (base) {
    const mb = await git(["merge-base", "HEAD", base]);
    const at = mb.code === 0 ? mb.stdout.trim() : null;
    if (at && at !== head) return { rev: at, label: base };
  }
  if (start && start !== head && (await git(["cat-file", "-e", `${start}^{commit}`])).code === 0) return { rev: start, label: base ?? start.slice(0, 7) };
  return { rev: "HEAD", label: null };
}

// The changed files from `diff --name-status -z`, `diff --numstat -z` and `ls-files --others -z`, by path:
// [{ path, status: "A" | "M" | "D" | "U", fresh (not in git yet), add, del, binary? }].
export function changedFiles(names, nums, fresh) {
  const stats = {};
  for (const entry of String(nums).split("\0")) {
    const [a, d, ...parts] = entry.split("\t");
    if (parts.length) stats[parts.join("\t")] = { add: Number(a) || 0, del: Number(d) || 0, binary: a === "-" };
  }
  const files = [], parts = String(names).split("\0");
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const xy = parts[i], path = parts[i + 1];
    const s = xy.startsWith("U") ? "U" : xy.startsWith("D") ? "D" : xy.startsWith("A") ? "A" : "M";
    files.push({ path, status: s, fresh: false, ...(stats[path] ?? { add: 0, del: 0 }) });
  }
  for (const path of String(fresh).split("\0").filter(Boolean)) files.push({ path, status: "A", fresh: true, add: 0, del: 0 });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export const PR_FIELDS = "number,title,state,isDraft,url,headRefName,baseRefName,additions,deletions,changedFiles,statusCheckRollup";

// A check, as Shepherdr sorts them: pass, fail, pending (running or waiting) or skip.
export function checkOf(c) {
  if (c.__typename === "StatusContext") {
    const s = String(c.state ?? "").toUpperCase();
    return { name: c.context ?? "Status", url: c.targetUrl || null,
      state: s === "SUCCESS" ? "pass" : s === "PENDING" || s === "EXPECTED" ? "pending" : "fail" };
  }
  const done = String(c.status ?? "").toUpperCase() === "COMPLETED", end = String(c.conclusion ?? "").toUpperCase();
  return { name: c.name ?? c.workflowName ?? "Check", workflow: c.workflowName || null, url: c.detailsUrl || null,
    state: !done ? "pending" : end === "SUCCESS" ? "pass" : end === "SKIPPED" || end === "NEUTRAL" ? "skip" : "fail" };
}

// "1 failed · 2 running · 3 passed"
export function checksLine(cs) {
  const n = (s) => cs.filter((c) => c.state === s).length;
  return [[n("fail"), "failed"], [n("pending"), "running"], [n("pass"), "passed"], [n("skip"), "skipped"]]
    .filter(([k]) => k).map(([k, w]) => `${k} ${w}`).join(" · ");
}

// Failed first, then running, passed, skipped: what needs a look sits on top.
export const CHECK_ORDER = { fail: 0, pending: 1, pass: 2, skip: 3 };

// The side views' words, as the window's mods show them (task-files, task-changes, task-pr): the web app's Files,
// Changes and Pull request say the same (core/worktree.test.js checks the mods still say these).
export const VIEW_WORDS = {
  allFiles: "All files",
  loadingFiles: "Loading files…",
  noFiles: "No files",
  noFolder: "No folder for this task",
  folderGone: "This task's folder can't be read. It may have been removed after the task finished.",
  limited: "File list limited to 500 entries per folder and 5,000 total",
  loadingFile: "Loading file…",
  fileGone: "This file is no longer available.",
  binaryFile: "Binary file · No text preview",
  cantPreview: "Can't preview this file. It's binary, too large or unreadable.",
  truncated: "… (file truncated)",
  loadingChanges: "Loading changes…",
  notGit: "This task's folder isn't a git repository.",
  noCommits: "This repository has no commits.",
  uncommitted: "Uncommitted",
  noUncommitted: "No uncommitted changes",
  pickChange: "Select a file to see its changes.",
  cantDiff: "Can't preview this diff. It's too large or unreadable.",
  binaryDiff: "Binary file · No text diff",
  binaryChanged: "Binary file changed",
  noTextDiff: "No text diff available",
  firstThousand: "Showing the first 1,000 changed files",
  askingGitHub: "Asking GitHub…",
  noPr: "This task has no pull request.",
  noBranch: "This task works in its folder, with no branch of its own, so it has no pull request.",
  openOnGitHub: "Open on GitHub",
  copyLink: "Copy link",
  copied: "Copied",
  checks: "Checks",
  noChecks: "No checks on it.",
};
// A change's word, and a check's: on hover.
export const CHANGE_WORDS = { A: "Added", M: "Changed", D: "Deleted", U: "Conflict" };
export const CHECK_WORDS = { pass: "Passed", fail: "Failed", pending: "Running", skip: "Skipped" };
export const PR_STATES = { open: "Open", draft: "Draft", merged: "Merged", closed: "Closed" };
// "No changes against main", "Against main"; "3 files"
export const noChanges = (label) => (label ? `No changes against ${label}` : VIEW_WORDS.noUncommitted);
export const againstLine = (label) => (label ? `Against ${label}` : VIEW_WORDS.uncommitted);
export const filesCount = (n) => `${n.toLocaleString("en")} ${n === 1 ? "file" : "files"}`;

// A folder's entries, as the window's Files lists them (one folder at a time, .git left out, at most PER_FOLDER and
// TOTAL in all): sh -c LIST_DIR files <folder> prints "<d|f>\0<name>\0" each, and fails when it isn't a folder.
export const PER_FOLDER = 500, TOTAL = 5000;
export const LIST_DIR = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
// Its entries, folders first, then by name.
export function dirEntries(stdout) {
  const fields = String(stdout).split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}
// The letter beside a changed file in Files (git status --porcelain=v1 -z): A new, U conflict, D deleted, else M.
export const MARK_ARGS = ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"];
export function markOf(xy) {
  return xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
}

// gh pr view's JSON as the views show it.
export function prOf(d) {
  const state = d.state === "MERGED" ? "merged" : d.state === "CLOSED" ? "closed" : d.isDraft ? "draft" : "open";
  const checks = (d.statusCheckRollup ?? []).map(checkOf).sort((a, b) => CHECK_ORDER[a.state] - CHECK_ORDER[b.state] || a.name.localeCompare(b.name));
  return { number: d.number, title: d.title, url: d.url, state, head: d.headRefName, base: d.baseRefName,
    add: d.additions ?? 0, del: d.deletions ?? 0, files: d.changedFiles ?? 0, checks };
}

// The tab bar's branch chip and its menu (Doop App 02b): where the shown code lives. `sh -c BRANCH_STATE sh` in the
// folder prints its top, git's common folder, the base (the repo's own checkout's branch), ahead, behind, how many
// files aren't committed, `diff --shortstat` against the fork point, then "tree\t<path>\t<branch>\t<ahead>" for each
// checkout with a branch. Fails outside a repo.
export const BRANCH_STATE = `top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 1
common=$(git rev-parse --path-format=absolute --git-common-dir)
base=$(git worktree list --porcelain | sed -n '1,/^$/s/^branch refs\\/heads\\///p' | head -n 1)
[ -n "$base" ] || base=main
mb=$(git merge-base HEAD "$base" 2>/dev/null)
a=$(git rev-list --count "$base..HEAD" 2>/dev/null || echo 0)
b=$(git rev-list --count "HEAD..$base" 2>/dev/null || echo 0)
d=$(git --no-optional-locks -c core.fsmonitor=false status --porcelain 2>/dev/null | wc -l | tr -d ' ')
st=$(git --no-optional-locks -c core.fsmonitor=false -c diff.autoRefreshIndex=false diff --shortstat \${mb:-HEAD} 2>/dev/null)
printf '%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n' "$top" "$common" "$base" "$a" "$b" "$d" "$st"
git worktree list --porcelain | while read -r k v; do
  [ "$k" = worktree ] && p=$v
  [ "$k" = branch ] && printf 'tree\\t%s\\t%s\\t%s\\n' "$p" "\${v#refs/heads/}" "$(git rev-list --count "$base..$v" 2>/dev/null || echo 0)"
done; true`;

// BRANCH_STATE's output: { top, repo (its name), linked (a worktree, not the repo's own checkout), base, ahead,
// behind, dirty, files, add, del, trees: [{ path, branch, ahead, main }] }, or null.
export function branchState(out) {
  const lines = String(out ?? "").split("\n");
  const [top, common, base] = lines;
  if (!top || !common || !base) return null;
  const n = (s) => parseInt(s, 10) || 0;
  const st = lines[6] ?? "";
  const num = (re) => n((re.exec(st) ?? [])[1]);
  const trees = lines.slice(7).filter((l) => l.startsWith("tree\t")).map((l, i) => {
    const [, path, branch, ahead] = l.split("\t");
    return { path, branch, ahead: n(ahead), main: i === 0 };
  });
  const own = common.endsWith("/.git") ? common.slice(0, -5) : common.replace(/\.git$/, "");
  return { top, repo: own.split("/").filter(Boolean).pop() ?? "", linked: common !== `${top}/.git`, base,
    ahead: n(lines[3]), behind: n(lines[4]), dirty: n(lines[5]),
    files: num(/(\d+) files? changed/), add: num(/(\d+) insertions?/), del: num(/(\d+) deletions?/), trees };
}

// Its menu's lines: "main · 3 ahead · 0 behind"; "in 4 files · 1 not committed" (after +add -del), or "No changes".
export const baseLine = (s) => `${s.base} · ${s.ahead} ahead · ${s.behind} behind`;
export function changesLine(s) {
  if (!s.files && !s.dirty) return "No changes";
  const files = s.files ? `in ${s.files} ${s.files === 1 ? "file" : "files"}` : "";
  return [files, s.dirty ? `${s.dirty} not committed` : ""].filter(Boolean).join(" · ");
}

// The menu's sizes (a popup is opened at its height): header, the Base/Path/Changes block (kvLine more with a PR line),
// a section's heading, a row, a list's bottom padding; at most `others` other checkouts.
export const BRANCH_MENU = { width: 420, head: 58, kv: 88, kvLine: 24, sec: 30, row: 34, pad: 6, others: 6 };
export const otherTrees = (s) => (s?.trees ?? []).filter((x) => x.path !== s.top).slice(0, BRANCH_MENU.others);
export function branchMenuHeight(s, actions, pr = false) {
  const M = BRANCH_MENU, o = otherTrees(s).length;
  return M.head + M.kv + (pr ? M.kvLine : 0) + M.sec + actions * M.row + M.pad + (o ? M.sec + o * M.row + M.pad : 0) + 2;
}

// ---- the branch menu's extras: Open in editor, Update from <base>, the PR line ------------------------------------

// The editor a worktree opens with: Settings › Window's choice (shared EDITOR_KEY, an EDITORS id). Unset: the first
// one installed, else the system's opener (open on macOS, xdg-open).
export const EDITOR_KEY = "branch.editor";
export const EDITORS = [
  { id: "code", name: "VS Code" },
  { id: "cursor", name: "Cursor" },
  { id: "zed", name: "Zed" },
  { id: "system", name: "System default" },
];
export const EDITOR_ROW = { title: "Editor", about: "Open in editor, in the branch menu, opens the worktree with it." };
// sh -c DETECT_EDITORS: the editors' commands installed here, one a line.
export const DETECT_EDITORS = 'for c in code cursor zed; do command -v "$c" >/dev/null 2>&1 && echo "$c"; done; true';
export const installedEditors = (out) => String(out ?? "").split("\n").map((l) => l.trim()).filter((l) => EDITORS.some((e) => e.id === l));
// The commands to try, in order, for a choice.
export const editorTries = (pref) => (EDITORS.some((e) => e.id === pref) ? [pref] : EDITORS.map((e) => e.id));
// What Settings shows chosen: the choice, else the first installed, else the system's.
export const editorShown = (pref, installed) => (EDITORS.some((e) => e.id === pref) ? pref : installed?.[0] ?? "system");
export const editorName = (cmd) => (cmd === "open" || cmd === "xdg-open" ? "System default" : EDITORS.find((e) => e.id === cmd)?.name ?? cmd);

// `sh -c BRANCH_EXTRAS sh "<editor ids>" <branch>` in the worktree, on its machine: the first editor command there
// ("editor\t<cmd>", empty when none), then gh's answer for the branch's PR when gh is there.
export const BRANCH_EXTRAS = `ed=
for c in $1; do
  if [ "$c" = system ]; then
    if [ "$(uname)" = Darwin ]; then ed=open; elif command -v xdg-open >/dev/null 2>&1; then ed=xdg-open; fi
  elif command -v "$c" >/dev/null 2>&1; then ed=$c; fi
  [ -n "$ed" ] && break
done
printf 'editor\\t%s\\n' "$ed"
[ -n "$2" ] && command -v gh >/dev/null 2>&1 && gh pr view "$2" --json number,state,isDraft,url 2>/dev/null
true`;
// How long a branch's PR answer is kept, and how long gh may take.
export const PR_KEEP = 60000, PR_WAIT = 6000;

// BRANCH_EXTRAS's output: { editor: command or null, pr: { number, state, url } or null }.
export function branchExtras(out) {
  const text = String(out ?? "");
  const ed = /^editor\t(.*)$/m.exec(text)?.[1]?.trim() || null;
  let pr = null;
  const json = text.split("\n").find((l) => l.startsWith("{"));
  try {
    const d = json ? JSON.parse(json) : null;
    if (d?.number && d.url) pr = { number: d.number, url: d.url, state: d.state === "MERGED" ? "merged" : d.state === "CLOSED" ? "closed" : d.isDraft ? "draft" : "open" };
  } catch {}
  return { editor: ed, pr };
}
// "#48 · draft"
export const prLine = (pr) => `#${pr.number} · ${pr.state}`;

// Update from its base: fetch, then merge origin/<base> in a terminal, so a conflict is there to see. Not on the base.
export const canUpdate = (s, branch) => Boolean(s?.base && branch && branch !== s.base);
export const updateLabel = (base) => `Update from ${base}`;
export const updateArgv = (base) => ["sh", "-c", 'git fetch && git merge "origin/$1"; exec "${SHELL:-/bin/sh}"', "sh", base];

// The menu's action rows: terminal and copy, then those that apply.
export const branchActions = ({ files = false, editor = null, update = false } = {}) => 2 + [files, editor, update].filter(Boolean).length;
