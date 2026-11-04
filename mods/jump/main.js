// Jump (Ctrl+K, as Shepherdr's ⌘K): the command bar. One box that finds a space, a task, an artifact, a machine
// or a command and goes there or does it. Opened with mod.open:jump (again closes it), a popup at the top of the
// window; Ctrl+Shift+P in our layout (tabs-tasks.commands) opens it on commands only (props().mode "commands"), and
// so does a ">" typed first. The search field is the header: no banner (Doop App 07b).
// Nothing typed: Needs you first (every one, never folded, each named by what it asks of you), then Recent (the
// latest tasks, spaces, terminals and artifacts), then This space's commands, Accounts, the app's and Go to (App 07b). Typed: every word must be in the item somewhere, any case
// (Shepherdr's matches()), and each match has a thin underline in the primary text colour. Tasks by id, title,
// status line, summary and where they ran, Done and archived ones too (archived only once something is typed);
// artifacts by title, the task that made them and their folder; spaces by name, folder and machine; commands by
// name. Each group newest first. ↑/↓ (Ctrl+N/P) move, Tab and Shift+Tab jump between sections, Enter or a click go:
//   space     space.select
//   machine   its first space
//   task      its worker's chat inside the Tasks panel (chat/panel.js's drill-in); a task with no
//             live worker (to do, queued, done, archived): the Tasks list, searched for it. A
//             layout without the Tasks panel switches to ours that has it (TASKS_LAYOUT) first.
//   artifact  the viewer over the focused pane when it's a chat (or the task's chat in the Tasks
//             panel, when the keyboard was there), as a card there opens it (artview.js); else
//             (a terminal, or its place not known yet) the Artifacts sidebar, else the whole window
//   agent     an agent or program in a pane: its pane; a helper (no pane): a peek
//   command   runs it, with its key shown in caps at the right
// Cmd+Enter opens a task's or a helper's terminal in a split beside the shown pane; → peeks at it.
// The selected row is a flat fill one step lighter than the bar (theme().selected): no edge, glow or amber.
// Ctrl+Shift+K opens this too: it's the one switcher.
// Tasks and artifacts are read from every machine's ~/.herdr/tasks and ~/.herdr/artifacts once
// as it opens, as the Tasks and Artifacts panels read them.

import { div, svg, image } from "gpui-kit";
import { View } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, VirtualListScrollHandle, v_virtual_list, Scrollbar } from "gpui-base";
import { spaces, machines, terminals, agents, panes, layout, layouts, exec, home, run, theme, props, closeOverlay, openOverlay, shared, setShared, keys, window, writeTextFile } from "herdr";
import { taskDot } from "./dot.js";
import { READ_LISTS, taskLists } from "./core/tasklists.js";
import { busyAgain } from "./core/tasks.js";
import { REASONS } from "./core/needs.js";
// A space's name as the sidebar (and the web app) says it: never "~" (core/spaces.js).
import { spaceName } from "./core/spaces.js";
// Keys as caps, one key each (core/keys.js, the Keybinds dialog's words).
import { keyCaps } from "./core/keys.js";
import { openViewer, showViewer, chatArea } from "./artview.js";
import { showInSidebar, hasSidebarView } from "./artifact-sidebar.js";
import { TEXT, RADIUS, keycaps, openSettings } from "./ui.js";

// Our layout with the Tasks panel, for a task picked where the shown one has none.
const TASKS_LAYOUT = "shepherdr";

const KINDS = ["task", "space", "agent", "artifact", "machine", "command"];
const GROUP = { space: "Spaces", task: "Tasks", agent: "Agents and terminals", artifact: "Artifacts", machine: "Machines", command: "Commands" };
const SHOWN = 8;  // rows a group shows before "Show N more"
const SHOWN_CMDS = 4; // a commands group with nothing typed
const RECENT = 5; // Recent's rows
const ROW = 40, HEAD = 34, MORE = 32;
// A popup is as tall as what it holds: the list gets its own height, up to this.
const LIST_MAX = 440;
const MONO = "JetBrains Mono";
const WC = "mods/workspace-chrome";
const STATUS = { needs: "Needs you", working: "Working", merging: "Merging", ready: "Ready", queued: "Queued", todo: "To do", done: "Done" };
// A Needs you row is named by what it asks of you ("Approve the plan"), from why it waits (core/needs.js).
const ACTIONS = { [REASONS.plan]: "Approve the plan", [REASONS.permission]: "Allow or deny", [REASONS.question]: "Answer the question",
  [REASONS.reply]: "Reply to it", [REASONS.signedOut]: "Sign in again", [REASONS.stopped]: "Restart its agent" };
const actionOf = (why) => {
  const w = String(why ?? "").split("\n")[0].trim();
  return ACTIONS[w] ?? (/^(Run|Fetch|Edit|Write)\b/.test(w) ? `Allow ${w}` : w ? capital(w) : "Look at it");
};
const short = (address) => String(address ?? "").split("/").pop();
// A dev server's port in a terminal's title ("vite :5173").
const PORT = /\s*(?:localhost|127\.0\.0\.1)?:(\d{2,5})\b/;
const portOf = (title) => { const m = PORT.exec(String(title ?? "")); return m ? `:${m[1]}` : null; };

// The Tasks panel's reads (tasklists.js: READ_LISTS, taskLists); every artifact registry the
// same way.
const READ_ARTS = 'cd "$HOME/.herdr/artifacts" 2>/dev/null || exit 0; for f in *.json .*.json; do [ -f "$f" ] && cat "$f" && printf "\\n\\036\\n"; done; true';
// Each folder's git repo (its common .git folder), a line each: "<folder>\t<common dir>", for a space's name.
const READ_REPOS = 'for f in "$@"; do r=$(git -C "$f" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); printf "%s\\t%s\\n" "$f" "$r"; done; true';
// The repo's name from its common .git folder (as the service's model.ts and the sidebar name it).
const repoName = (common) => (common ? (common.endsWith("/.git") ? common.slice(0, -5) : common.replace(/\.git$/, "")).split("/").filter(Boolean).pop() ?? null : null);

// herdr-task's auto_prefix, for a list from before prefixes (as mods/tasks/main.js).
function autoPrefix(folder) {
  const name = String(folder ?? "").split("/").filter(Boolean).pop() ?? "";
  const ws = name.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z]+/).filter(Boolean);
  let p = ws.length > 1 ? ws.map((w) => w[0]).join("").slice(0, 5) : (ws[0] ?? "").slice(0, 4);
  if (p.length < 2) p = ws.join("").length >= 2 ? ws.join("").slice(0, 2) : "TASK";
  return p.toUpperCase();
}

// Every word typed is in one of these, any case.
function matches(q, ...fields) {
  const all = fields.filter((f) => f !== undefined && f !== null && f !== "").join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => all.includes(w));
}

const machineOf = (address) => (address?.includes("/") ? address.split("/")[0] : null);
const machineName = (m) => m ?? "This computer";
const tilde = (p) => { const h = home(); return h && p && (p === h || p.startsWith(h + "/")) ? `~${p.slice(h.length)}` : p; };
const capital = (s) => (s && /^[a-z](?![A-Z])/.test(s) ? s[0].toUpperCase() + s.slice(1) : s);

// "now", "5m", "3h", "2d", else the date.
function ago(at) {
  if (!at) return null;
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  if (m < 10080) return `${Math.floor(m / 1440)}d`;
  return new Date(at).toLocaleDateString();
}

// New work on another Claude account, as lib/usage-data.js setPrefs() writes it: shared at once, then
// ~/.herdr/accounts.json (read by herdr-task).
function useAccount(id) {
  const next = { active: null, switch_at: 95, names: {}, hidden: [], ...(shared("usage.prefs") ?? {}), active: id };
  setShared("usage.prefs", next);
  const file = `${home()}/.herdr/accounts.json`;
  exec("sh", ["-c", 'mkdir -p "$(dirname "$1")"', "x", file]).catch(() => {})
    .then(() => writeTextFile(file, `${JSON.stringify(next, null, 2)}\n`, null)).catch(() => {});
}

const find = (node, id) => {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const hit = find(c, id); if (hit) return hit; }
  return null;
};

// A task's worker chat inside the Tasks panel (mods/chat/panel.js openTaskThread).
function openTaskThread(terminal, task, title) {
  setShared("tasks.thread", { terminal, task: task ?? null, title: title ?? null, at: Date.now() });
  run("layout.select", { stack: "panel-body", child: "tasks" });
  run("layout.select", { stack: "tasks", child: "tasks-thread" });
  if (find(layout(), "tasks-thread-body")) run("layout.select", { stack: "tasks-thread-body", child: "tasks-thread-chat" });
  run("layout.show", { id: "panel" });
}

// The Tasks list, searched for one task (mods/tasks/main.js reads shared "tasks.searchreq").
function showInTaskList(q) {
  setShared("tasks.searchreq", { q, at: Date.now() });
  run("layout.select", { stack: "panel-body", child: "tasks" });
  run("layout.select", { stack: "tasks", child: "tasks-list" });
  run("layout.show", { id: "panel" });
}

// Where each word typed first shows in a text, as parts: [{ text, hit }] (hit: underlined). Overlapping hits merge.
function matchParts(text, words) {
  const s = String(text ?? ""), low = s.toLowerCase();
  const spans = [];
  for (const w of words ?? []) {
    const i = w ? low.indexOf(w.toLowerCase()) : -1;
    if (i >= 0) spans.push([i, i + w.length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let at = 0;
  for (const [a, b] of spans) {
    if (b <= at) continue;
    const from = Math.max(a, at);
    if (from > at) parts.push({ text: s.slice(at, from), hit: false });
    parts.push({ text: s.slice(from, b), hit: true });
    at = b;
  }
  if (at < s.length) parts.push({ text: s.slice(at), hit: false });
  return parts;
}

// The commands, in groups: "space" (This space, App 07b: peek, split, new worktree, settle), "app" (tabs, panes,
// spaces and the app's own) and "goto" (Settings). Each { id, group, label, sub, icon, key (the action as keys.json
// binds it, for its caps), go() }. ours: the shown layout is ours, whose tab bar (tabs-tasks) takes the tabs-tasks.*
// commands; tasks: it has the Tasks panel; peek: this space's terminals to peek at; done: its finished tabs.
function commandList({ space, ours, tasks, peek = [], done = [], onPeek }) {
  const cmd = (id, group, label, icon, key, go, sub = null) => ({ kind: "command", key: `c:${id}`, id, group, label, sub, icon, action: key, go });
  const does = (name, args) => () => (args ? run(name, args) : run(name));
  return [
    peek.length && cmd("peek", "space", "Peek a terminal", "mods/jump/eye.svg", null, onPeek, peek.slice(0, 3).join(", ")),
    cmd("split-right", "space", "Split side by side", "mods/jump/columns.svg", "pane.split:right", does("pane.split", { direction: "right" }), "a new terminal beside this one"),
    space?.branch && cmd("worktree", "space", "New worktree", `${WC}/branch.svg`, null,
      () => openOverlay({ mod: "worktree", kind: "dialog", width: 440, height: 260, props: { space: space.id, action: "new" } }), `from ${space.branch}`),
    done.length && cmd("settle", "space", "Settle finished tabs", `${WC}/archive.svg`, null, () => { for (const id of done) run("tab.settle", { id }); }, `${done.length} done`),
    cmd("tab.new", "app", "New terminal tab", `${WC}/terminal.svg`, "tab.new", () => run("tab.new", space ? { space: space.id } : {})),
    cmd("split-down", "app", "Split down", "mods/pane-chat/split-down.svg", "pane.split:down", does("pane.split", { direction: "down" })),
    cmd("pane.zoom", "app", "Zoom pane, or show all", "mods/pane-chat/zoom.svg", "pane.zoom", does("pane.zoom")),
    cmd("pane.close", "app", "Close pane", `${WC}/x.svg`, "pane.close", does("pane.close")),
    ours && cmd("rename-tab", "app", "Rename tab", `${WC}/square-pen.svg`, "tabs-tasks.rename-tab", does("tabs-tasks.rename-tab")),
    ours && cmd("rename-space", "app", "Rename space", `${WC}/square-pen.svg`, "tabs-tasks.rename-space", does("tabs-tasks.rename-space")),
    ours && cmd("close-tab", "app", "Close tab", `${WC}/x.svg`, "tabs-tasks.close", does("tabs-tasks.close")),
    cmd("tab.next", "app", "Next tab", `${WC}/chevron-right.svg`, "tab.next", does("tab.next")),
    cmd("tab.prev", "app", "Previous tab", `${WC}/chevron-left.svg`, "tab.prev", does("tab.prev")),
    tasks && cmd("tasks", "app", "Show the Tasks list", "mods/shepherdr-settings/list-checks.svg", null, () => {
      run("layout.select", { stack: "panel-body", child: "tasks" });
      run("layout.select", { stack: "tasks", child: "tasks-list" });
      run("layout.show", { id: "panel" });
    }),
    ours ? cmd("new-space", "app", "New space", `${WC}/plus.svg`, "tabs-tasks.newspace", does("tabs-tasks.newspace"))
      : cmd("new-space", "app", "New space", `${WC}/plus.svg`, "space.new", does("space.new")),
    cmd("space.next", "app", "Next space", `${WC}/chevron-down.svg`, "space.next", does("space.next")),
    cmd("space.prev", "app", "Previous space", "mods/chat/chevron-up.svg", "space.prev", does("space.prev")),
    cmd("add-machine", "app", "Add machine", `${WC}/server.svg`, null, does("mod.open", { name: "machine-add-chat" })),
    cmd("keybinds", "app", "Keybinds", "mods/keybinds/keyboard.svg", "mod.open:keybinds", does("mod.open", { name: "keybinds" })),
    layouts().length > 1 && cmd("layout.switch", "app", "Switch layout", "mods/shepherdr-settings/layout.svg", "layout.switch", does("layout.switch"),
      layouts().map((n) => (n === "main" ? "Herdr" : capital(n))).join(" · ")),
    cmd("app.settings", "app", "Herdr settings", `${WC}/settings.svg`, "app.settings", does("app.settings"), "Look, alerts, updates"),
    cmd("zoom-in", "app", "Zoom in", "mods/chat-image/zoom-in.svg", "app.zoom_in", does("app.zoom_in")),
    cmd("zoom-out", "app", "Zoom out", "mods/chat-image/zoom-out.svg", "app.zoom_out", does("app.zoom_out")),
    cmd("zoom-reset", "app", "Actual size", `${WC}/search.svg`, "app.zoom_reset", does("app.zoom_reset")),
    cmd("palette", "app", "All Herdr commands", `${WC}/terminal.svg`, "app.palette", does("app.palette")),
    cmd("settings", "goto", "Settings", `${WC}/settings.svg`, "tabs-tasks.settings", () => openSettings(), "Accounts, tasks, machines"),
  ].filter(Boolean);
}

export default class Jump extends View {
  init(_props, cx) {
    this.openedAt = Date.now(); // a chat's box letting go of the keyboard about now had it (chatArea())
    this.lists = new Map(); // "" (this computer) or a machine -> its task lists
    this.arts = new Map();  // the same -> its artifacts, each with { machine, folder }
    this.repos = new Map(); // "<machine>|<folder>" -> its git repo's name (null: not a repo)
    this.loading = new Set();
    this.more = new Set();  // sections showing every row
    this.sel = null;        // the selected row's key
    // "commands": commands only (Ctrl+Shift+P); else everything.
    this.mode = props()?.mode === "commands" ? "commands" : "all";
    this.input = InputState.new({ placeholder: this.placeholder() });
    this.input.on("change", (_e, cx) => this.reset(cx));
    this.input.on("submit", (e, cx) => this.go(this.current, cx, { split: Boolean(e?.secondary) }));
    this.scroll = VirtualListScrollHandle.new();
    this.input.focus();
    cx.timer.after(0, () => this.input.focus());
    cx.timer.after(600, () => this.input.focus());
    for (const m of [null, ...machines().filter((x) => x.name && x.layout !== "unavailable").map((x) => x.name)]) {
      cx.spawn(async (cx) => this.read(cx, m));
    }
  }

  close() { this.input.release(); this.scroll.release(); }

  placeholder() { return this.mode === "commands" ? "Type a command" : this.mode === "peek" ? "Peek at a terminal" : "Type a command or search"; }

  reset(cx) {
    this.sel = null;
    this.more.clear();
    this.scroll.scroll_to_item(0, "top");
    cx?.notify();
  }

  // Commands only, or everything again (the footer's switch).
  setMode(mode, cx) {
    this.mode = mode;
    this.input.set_placeholder?.(this.placeholder());
    this.reset(cx);
    this.input.focus();
  }

  // One machine's task lists and artifacts (null: this computer's).
  async read(cx, machine) {
    const k = machine ?? "", on = machine ? { on: machine } : {};
    this.loading.add(k);
    try {
      const folders = [...new Set(spaces().filter((s) => (s.machine ?? null) === machine && s.folder).map((s) => s.folder))];
      const [lists, arts, repos] = await Promise.all([exec("sh", ["-c", READ_LISTS], on), exec("sh", ["-c", READ_ARTS], on),
        folders.length ? exec("sh", ["-c", READ_REPOS, "repos", ...folders], on).catch(() => null) : null]);
      for (const line of (repos?.stdout ?? "").split("\n")) {
        const [f, common] = line.split("\t");
        if (f) this.repos.set(`${k}|${f}`, repoName(common));
      }
      this.lists.set(k, taskLists(lists.stdout)
        .map((d) => ({ ...d, machine, prefix: d.prefix || autoPrefix(d.folder), tasks: Array.isArray(d.tasks) ? d.tasks : [] })));
      const found = [];
      for (const part of arts.stdout.split("\x1e")) {
        try { const reg = JSON.parse(part); for (const a of reg.artifacts ?? []) found.push({ ...a, machine, regFolder: reg.folder, regName: reg.name }); } catch {}
      }
      this.arts.set(k, found);
    } catch {
      // A machine out of reach: its items just aren't listed.
    }
    this.loading.delete(k);
    cx.notify();
  }

  // What a space is called, as the sidebar says it: its own name, else its repo's or its folder's, "Home" at home.
  nameOf(s) {
    const repo = this.repos.get(`${s.machine ?? ""}|${s.folder}`) ?? null;
    return spaceName(s, { repo, home: s.machine ? null : home(), named: Boolean(s.named) });
  }

  // The space working in a folder on a machine, by name.
  spaceAt(machine, folder) {
    return spaces().find((s) => (s.machine ?? null) === (machine ?? null) && s.folder === folder) ?? null;
  }

  // A task's live agents: terminals labelled with its key on its folder's machine.
  live(list, task) {
    const key = `${list.slug}#${task.id}`, m = list.machine ?? null;
    const shown = new Map(agents().map((a) => [a.address, a]));
    return terminals().filter((k) => k.state === "live" && k.labels?.["herdr.task"] === key && machineOf(k.address) === m)
      .filter((k) => k.program?.key !== "shell" && !k.program?.shell)
      .map((k) => ({ address: k.address, status: shown.get(k.address)?.status ?? k.status, turn: k.turn, role: k.labels?.["herdr.role"] ?? "worker" }));
  }

  // A task's status as the Tasks panel names it, in short (its full rules: tasks/main.js place()).
  status(task, live) {
    const st = task.state;
    if (["todo", "queued", "done"].includes(st)) return st;
    if (task.attention || live.some((a) => a.status === "blocked")) return "needs";
    // Back at work after it said ready (core/tasks.js busyAgain()): Working.
    if (st === "ready" && !busyAgain(task, live)) return task.merge_requested && live.length ? "merging" : "ready";
    if (live.some((a) => a.status === "working")) return "working";
    const last = task.agents?.[task.agents.length - 1];
    const started = Math.max(0, ...[task.started, last?.at].filter((x) => typeof x === "number"));
    if (!last?.ended && Date.now() - started < 90000) return "working";
    return "needs";
  }

  items(q) {
    const out = [];
    const icons = shared("spaces-chat")?.icons ?? {};
    const remote = machines().some((m) => m.name);
    for (const s of spaces()) {
      const where = [remote ? machineName(s.machine) : null, tilde(s.folder) || "~"].filter(Boolean).join(" · ");
      const name = this.nameOf(s);
      if (q && !matches(q, name, s.folder, tilde(s.folder), machineName(s.machine))) continue;
      const at = Math.max(0, ...s.tabs.map((t) => t.changed_at ?? 0));
      const n = s.tabs.filter((t) => !t.settled).length;
      out.push({ kind: "space", key: `s:${s.id}`, id: s.id, icon: icons[s.id] ?? "#", label: name, sub: where, at, active: s.active, status: s.status,
        meta: n ? `${n} open` : null });
    }
    for (const [, lists] of this.lists) for (const list of lists) for (const task of list.tasks) {
      if (task.archived && !q) continue;
      const ref = `${list.prefix}-${task.id}`;
      const space = this.spaceAt(list.machine, list.folder);
      const place = [space ? this.nameOf(space) : list.name, remote ? machineName(list.machine) : null].filter(Boolean).join(" · ");
      const live = task.state === "running" || task.state === "ready" ? this.live(list, task) : [];
      const status = this.status(task, live);
      const line = status === "working" ? task.progress?.text : status === "needs" ? task.waits ?? task.attention : task.summary;
      if (q && !matches(q, ref, task.title, task.progress?.text, task.summary, task.waits, task.attention, space ? this.nameOf(space) : null, list.name, machineName(list.machine))) continue;
      const at = Math.max(0, ...[task.archived, task.done_at, task.ready_at, task.progress?.at, task.started, task.created].filter((x) => typeof x === "number"));
      out.push({ kind: "task", key: `t:${list.machine ?? ""}:${list.slug}#${task.id}`, ref, label: task.title, live, status, pct: task.progress?.done, place: space ? this.nameOf(space) : list.name,
        action: status === "needs" ? actionOf(line) : null, title: task.title,
        sub: [ref, task.archived ? "Archived" : STATUS[status], line && capital(String(line).split("\n")[0]), place].filter(Boolean).join(" · "), at, meta: ago(at) });
    }
    out.push(...this.agentItems(q));
    for (const [, arts] of this.arts) for (const a of arts) {
      const space = this.spaceAt(a.machine, a.folder ?? a.regFolder);
      const place = space ? this.nameOf(space) : a.regName ?? tilde(a.folder);
      if (q && !matches(q, a.title, a.id, a.task, place, tilde(a.folder), remote ? machineName(a.machine) : null)) continue;
      out.push({ kind: "artifact", key: `a:${a.machine ?? ""}:${a.id}`, art: a, label: a.title || a.id,
        sub: [a.task, place, remote ? machineName(a.machine) : null, `v${a.version ?? 1}`].filter(Boolean).join(" · "), at: a.at ?? 0, meta: ago(a.at) });
    }
    if (remote) for (const m of machines()) {
      const n = spaces().filter((s) => (s.machine ?? null) === (m.name ?? null)).length;
      if (q && !matches(q, machineName(m.name))) continue;
      out.push({ kind: "machine", key: `m:${m.name ?? ""}`, name: m.name, label: machineName(m.name),
        sub: [`${n} space${n === 1 ? "" : "s"}`, m.layout === "unavailable" ? "Offline" : null].filter(Boolean).join(" · "), at: 0 });
    }
    // Newest first in each group; spaces with no news keep the sidebar's order (a stable sort).
    return out.sort((a, b) => b.at - a.at);
  }


  // The agents and programs in every space's panes (plain shells left out), and helpers: an agent's own children and a
  // task's reviewer, which have no pane. Task workers are their tasks' rows; Assistants their spaces'.
  agentItems(q) {
    const ts = terminals().filter((k) => k.state === "live");
    const byAddress = new Map(ts.map((k) => [k.address, k]));
    const said = new Map(agents().map((a) => [a.address, a.status]));
    const refs = new Map();
    for (const [, lists] of this.lists) for (const list of lists) for (const task of list.tasks) refs.set(`${list.machine ?? ""}|${list.slug}#${task.id}`, `${list.prefix}-${task.id}`);
    const out = [];
    const push = (x) => { if (!q || matches(q, x.label, x.sub, x.meta)) out.push(x); };
    for (const s of spaces()) {
      const tabs = new Map(s.tabs.map((t) => [t.id, t]));
      const name = this.nameOf(s);
      for (const p of panes()) {
        if (!tabs.has(p.tab) || !p.terminal || p.program?.shell) continue;
        const l = byAddress.get(p.terminal)?.labels ?? {};
        if (l["herdr.role"] === "coordinator" || l["herdr.task"]) continue;
        const agent = Boolean(p.program?.agent), tab = tabs.get(p.tab);
        const label = agent ? (tab.named ? tab.name : p.program?.name ?? p.title) : String(p.title ?? "").replace(PORT, "").trim() || p.program?.name || "Terminal";
        push({ kind: "agent", key: `g:${p.terminal}`, terminal: p.terminal, pane: p.pane, tab: p.tab, space: s.id, label, program: p.program, here: s.active,
          sub: [agent ? null : portOf(p.title), name].filter(Boolean).join(" · "), meta: short(p.terminal), at: tab.changed_at ?? 0 });
      }
    }
    for (const k of ts) {
      const l = k.labels ?? {}, m = machineOf(k.address);
      const parent = k.parent ? byAddress.get(m && !String(k.parent).includes("/") ? `${m}/${k.parent}` : k.parent) : null;
      const reviewer = l["herdr.role"] === "reviewer";
      if (l["herdr.role"] === "coordinator" || !(reviewer || (parent && parent.labels?.["herdr.role"] !== "coordinator"))) continue;
      const task = l["herdr.task"] ?? parent?.labels?.["herdr.task"];
      const ref = task ? refs.get(`${m ?? ""}|${task}`) : null;
      const sid = l["herdr.task.space"] ?? parent?.labels?.["herdr.task.space"] ?? parent?.labels?.["herdr.space"];
      const space = sid ? spaces().find((s) => (s.machine ?? null) === m && String(s.id).split("/").pop() === sid) : null;
      push({ kind: "agent", key: `g:${k.address}`, terminal: k.address, space: space?.id ?? null, program: k.program, here: Boolean(space?.active), status: said.get(k.address) ?? k.status,
        label: reviewer ? "review" : k.name || k.program?.name || short(k.address),
        sub: [ref ? `helper on ${ref}` : "helper", space ? this.nameOf(space) : null].filter(Boolean).join(" · "), meta: short(k.address), at: 0 });
    }
    return out;
  }

  // The commands this layout takes, each with its key as caps (the shown layout's own key first, then the global one),
  // and Accounts': new work on another Claude account.
  commands() {
    const ours = shared("layout") === TASKS_LAYOUT;
    const space = spaces().find((s) => s.active) ?? null;
    const peek = this.agentItems("").filter((x) => x.here);
    const done = (space?.tabs ?? []).filter((t) => t.status === "done" && !t.active && !t.settled).map((t) => t.id);
    const list = commandList({ space, ours, tasks: Boolean(find(layout(), "tasks-list")), peek: peek.map((x) => x.label), done,
      onPeek: () => this.setMode("peek") });
    return [...list, ...this.accountCommands()].map((c) => ({ ...c, caps: this.capsOf(c.action) }));
  }

  // Accounts (App 07b): "Send new work to Personal" for each other Claude account that works, while there are two or
  // more. Read from the status bar's usage (shared "usage", "usage.prefs"); nothing here reads or changes the engine.
  accountCommands() {
    const prefs = shared("usage.prefs"), usage = shared("usage");
    if (!prefs || !Array.isArray(usage?.claude)) return [];
    const hidden = new Set(prefs.hidden ?? []), names = prefs.names ?? {};
    const list = usage.claude.filter((a) => !hidden.has(a.id)).map((a) => (names[a.id] ? { ...a, name: names[a.id] } : a));
    if (list.length < 2) return [];
    const active = list.find((a) => a.id === prefs.active) ?? list.find((a) => !a.error) ?? list[0];
    const pcts = (active.meters ?? []).filter((m) => (m.id === "session" || m.id === "weekly") && Number.isFinite(m.pct)).map((m) => m.pct);
    const sub = pcts.length ? `${active.name} is at ${Math.round(Math.max(...pcts))}%` : null;
    return list.filter((a) => a.id !== active.id && !a.error).map((a) => ({ kind: "command", key: `c:account:${a.id}`, id: `account:${a.id}`, group: "accounts",
      label: `Send new work to ${a.name}`, sub, logo: "claude", action: null, go: () => useAccount(a.id) }));
  }

  // An action's key as caps (core/keys.js keyCaps), or null when nothing binds it.
  capsOf(action) {
    if (!action) return null;
    const all = keys(), shown = `layout:${shared("layout") ?? ""}`;
    // A global key the shown layout binds to something else isn't this action's there.
    const mine = new Set(all.filter((b) => b.section === shown).map((b) => b.keys));
    const k = all.find((b) => b.section === shown && b.action === action) ?? all.find((b) => b.section === "global" && b.action === action && !mine.has(b.keys));
    return k?.keys?.trim() ? keyCaps(k.keys, window()?.platform === "macos") : null;
  }

  // The bar's sections: [{ id, label, right, rows, fold }] (fold: rows shown before "Show N more"; 0 never folds).
  sections(q, mode) {
    const here = spaces().find((s) => s.active);
    const name = here ? this.nameOf(here) : null;
    // Peek a terminal: this space's agents and programs; Enter (or →) peeks.
    if (mode === "peek") return [{ id: "peek", label: "Peek a terminal", right: name, rows: this.agentItems(q).filter((x) => x.here), fold: 0 }];
    const cmds = this.commands().filter((c) => !q || matches(q, c.label));
    const group = (id, label, fold, right = null) => ({ id, label, right, rows: cmds.filter((c) => c.group === id), fold });
    const space = group("space", "This space", 0, name), accounts = group("accounts", "Accounts", 0);
    const app = group("app", "App", q ? SHOWN : SHOWN_CMDS), goto = group("goto", "Go to", 0);
    if (mode === "commands") return [space, accounts, { ...app, fold: 0 }, goto];
    const items = this.items(q);
    if (q) {
      return KINDS.map((kind) => {
        const rows = kind === "command" ? cmds : items.filter((x) => x.kind === kind);
        // Tasks all in one space: its name at the right (App 07b).
        const places = kind === "task" ? [...new Set(rows.map((x) => x.place))] : [];
        return { id: kind, label: GROUP[kind], rows, fold: SHOWN, right: places.length === 1 ? places[0] : null };
      });
    }
    // Nothing typed: what needs you (named by what it asks), then the latest work, then the commands.
    const needs = items.filter((x) => x.kind === "task" && x.status === "needs")
      .map((x) => ({ ...x, label: x.action, sub: [x.title, x.ref].filter(Boolean).join(" · ") }));
    const recent = items.filter((x) => x.at > 0 && x.kind !== "machine" && !(x.kind === "task" && (x.status === "needs" || x.status === "done"))).slice(0, RECENT);
    return [{ id: "needs", label: "Needs you", rows: needs, fold: 0 }, { id: "recent", label: "Recent", rows: recent, fold: 0 }, space, accounts, app, goto];
  }

  // The list as drawn: each non-empty section's heading, its rows (each knowing its section), and "Show N more".
  rows(q, mode) {
    const rows = [];
    for (const sec of this.sections(q, mode)) {
      if (!sec.rows.length) continue;
      rows.push({ kind: "head", key: `h:${sec.id}`, label: sec.label, right: sec.right ?? (q || sec.id === "needs" ? String(sec.rows.length) : null), sec: sec.id });
      const shown = sec.fold && !this.more.has(sec.id) ? sec.rows.slice(0, sec.fold) : sec.rows;
      rows.push(...shown.map((r) => ({ ...r, key: `${sec.id}|${r.key}`, sec: sec.id })));
      if (sec.rows.length > shown.length) rows.push({ kind: "more", key: `more:${sec.id}`, group: sec.id, sec: sec.id, count: sec.rows.length - shown.length });
    }
    return rows;
  }

  // What's typed: its words, and whether it asks for commands only (a ">" first).
  query() {
    const raw = this.input.value().trim();
    const cmds = raw.startsWith(">");
    return { q: (cmds ? raw.slice(1) : raw).trim(), mode: cmds ? "commands" : this.mode };
  }

  go(r, cx, { split = false } = {}) {
    if (!r) return;
    if (r.kind === "more") {
      this.more.add(r.group);
      this.sel = null;
      cx?.notify();
      return;
    }
    // Peek a terminal lists this space's terminals in the bar itself.
    if (r.kind === "command" && r.id === "peek") { this.input.set_value?.(""); r.go(); cx?.notify(); return; }
    if (this.mode === "peek" && r.kind === "agent") return this.peek(r);
    closeOverlay(props().overlay);
    if (split && this.terminalOf(r) && !r.pane) return run("terminal.keep", { terminal: this.terminalOf(r), place: "right" });
    if (r.kind === "space") run("space.select", { id: r.id });
    else if (r.kind === "machine") {
      const s = spaces().find((x) => (x.machine ?? null) === (r.name ?? null));
      if (s) run("space.select", { id: s.id });
      else run("app.settings", { section: "machines" });
    } else if (r.kind === "task") this.openTask(r);
    else if (r.kind === "command") r.go();
    else if (r.kind === "artifact") this.openArtifact(r.art);
    else if (r.kind === "agent") this.openAgent(r);
  }

  // The terminal a row stands for: an agent's, or a task's worker (one asking first).
  terminalOf(r) {
    if (r?.kind === "agent") return r.terminal;
    if (r?.kind !== "task") return null;
    const workers = r.live.filter((a) => a.role !== "reviewer");
    return (workers.find((a) => a.status === "blocked") ?? workers[0] ?? r.live[0])?.address ?? null;
  }

  // → : a peek at the row's terminal over the tab (terminal.peek).
  peek(r) {
    const terminal = this.terminalOf(r);
    if (!terminal) return false;
    closeOverlay(props().overlay);
    run("terminal.peek", { terminal });
    return true;
  }

  // Its pane (its space and tab shown first); a helper, which has none: a peek.
  openAgent(r) {
    if (!r.pane) return run("terminal.peek", { terminal: r.terminal });
    run("space.select", { id: r.space });
    run("tab.select", { id: r.tab });
    run("pane.focus", { pane: r.pane });
  }

  // Its worker's chat in the Tasks panel (a worker asking first); else the Tasks list, searched
  // for it. Where the shown layout has no Tasks panel, ours that has one shows first.
  openTask(r) {
    if (!find(layout(), "tasks-list") && layouts().includes(TASKS_LAYOUT)) run("layout.switch", { name: TASKS_LAYOUT });
    const workers = r.live.filter((a) => a.role !== "reviewer");
    const w = workers.find((a) => a.status === "blocked") ?? workers[0] ?? r.live[0];
    if (w) return openTaskThread(w.address, r.ref, r.title ?? r.label);
    showInTaskList(`${r.ref} ${r.title ?? r.label}`);
  }

  // Over the chat the keyboard was in, as its card opens it; else in the Artifacts sidebar.
  openArtifact(a) {
    const area = chatArea(this.openedAt);
    const show = area || !hasSidebarView() ? showViewer : (v) => showInSidebar(v) || showViewer(v);
    openViewer({ id: a.id, title: a.title, version: a.version, machine: a.machine ?? null }, area, show);
  }


  mark(r, t) {
    // Things sit in a small tile; commands are a plain line icon.
    const tile = (child) => div().size(26).flex_none().flex().items_center().justify_center().rounded(7)
      .bg(t.background).border_1().border_color(t.border).child(child);
    const logo = (p) => (p?.icon ? (p.tint ? svg(p.icon).size(15).text_color(t.muted) : image(p.icon).size(15)) : null);
    if (r.logo === "claude") return tile(image("mods/workspace-status-chat/claude.svg").size(15));
    if (r.kind === "command") return div().size(26).flex_none().flex().items_center().justify_center()
      .child(svg(r.icon).size(16).text_color(t.dim));
    if (r.kind === "agent") return tile(logo(r.program) ?? svg(`${WC}/terminal.svg`).size(14).text_color(t.muted));
    if (r.kind === "task") return tile(taskDot(r.status, { pct: r.pct }));
    if (r.kind === "artifact") return tile(svg("mods/artifacts/artifacts.svg").size(14).text_color(t.muted));
    if (r.kind === "machine") return tile(svg(`${WC}/server.svg`).size(14).text_color(t.muted));
    return tile(div().text_size(r.icon === "#" ? 14 : 13).text_color(t.muted).child(r.icon));
  }

  // A text with each word typed underlined where it first shows: a thin underline in the primary text colour,
  // never amber. The last part takes the ellipsis.
  marked(text, words, color, t) {
    const parts = words.length ? matchParts(text, words) : [];
    if (!parts.some((p) => p.hit)) return div().min_w(0).truncate().text_color(color).child(text);
    return h_flex().min_w(0).overflow_hidden().whitespace_nowrap().text_color(color)
      .children(parts.map((p, i) => div().when(i === parts.length - 1, (d) => d.min_w(0).truncate()).when(i < parts.length - 1, (d) => d.flex_none())
        .when(p.hit, (d) => d.text_color(t.foreground).underline()).child(p.text)));
  }

  row(r, on, t, words) {
    if (r.kind === "head") {
      return h_flex().w_full().h(HEAD).px(20).pt(12).gap(8).items_center().text_size(TEXT.label).font_medium().text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().child(r.label))
        .when(Boolean(r.right), (el) => el.child(div().flex_none().max_w(200).truncate().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(r.right)));
    }
    if (r.kind === "more") {
      return h_flex().w_full().h(MORE).px(8).child(
        h_flex().flex_1().h_full().px(12).items_center().rounded(RADIUS.card).text_size(TEXT.label).text_color(t.muted).cursor_pointer()
          .when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(on ? t.selected : t.hover))
          .child(`Show ${r.count} more`));
    }
    // One line: the name, then a quieter second part, then the time or the key at the right (never cut).
    return h_flex().w_full().h(ROW).px(8).child(
      h_flex().flex_1().min_w(0).h_full().px(12).gap(12).items_center().rounded(RADIUS.card).cursor_pointer()
        .when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(on ? t.selected : t.hover))
        .child(this.mark(r, t))
        .child(h_flex().flex_1().min_w(0).gap(10).items_center().text_size(TEXT.body + 1)
          .child(div().flex_none().max_w(300).min_w(0).when(Boolean(r.active), (d) => d.font_semibold())
            .child(this.marked(r.label, words, t.foreground, t)))
          .when(Boolean(r.sub), (el) => el.child(div().flex_1().min_w(0).text_size(TEXT.body).child(this.marked(r.sub, words, t.dim, t)))))
        .when(Boolean(r.caps), (el) => el.child(keycaps(r.caps)))
        .when(!r.caps && Boolean(r.meta), (el) => el.child(div().flex_none().min_w(34).text_right().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(r.meta))));
  }

  // The foot (App 07b). Nothing typed: Tab's hint and the switch between commands only and everything (with its key,
  // when one is bound). Typed: what Enter, Cmd+Enter (a task's or helper's terminal in a split) and → (a peek) do.
  footer(mode, typed, t) {
    const hint = (caps, words) => h_flex().flex_none().gap(8).items_center().child(keycaps(caps)).child(words);
    const foot = h_flex().h(44).flex_none().px(20).gap(8).items_center().border_t(1).border_color(t.border)
      .text_size(TEXT.label).text_color(t.dim).whitespace_nowrap();
    if (typed || mode === "peek") {
      const mac = window()?.platform === "macos";
      return foot.child(hint(["⏎"], mode === "peek" ? "peek" : "open"))
        .when(mode !== "peek", (el) => el.child(div().w(6)).child(hint([mac ? "⌘" : "Ctrl", "⏎"], "open in split"))
          .child(div().w(6)).child(hint(["→"], "peek")))
        .child(div().flex_1()).child(hint(["Esc"], "close"));
    }
    const toCmds = mode !== "commands";
    const caps = this.capsOf(toCmds ? "tabs-tasks.commands" : "mod.open:jump");
    return foot.child(keycaps(["Tab"])).child("to jump between sections")
      .child(div().flex_1())
      .child(h_flex().id("jump-mode").flex_none().gap(8).items_center().px(6).py(4).rounded(RADIUS.control).cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.setMode(toCmds ? "commands" : "all", cx))
        .when(Boolean(caps), (el) => el.child(keycaps(caps)))
        .child(toCmds ? "Commands only" : "Everything"));
  }

  render(cx) {
    const t = theme();
    const { q, mode } = this.query();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.rows(q, mode);
    const pickable = rows.filter((r) => r.kind !== "head");
    const at = Math.max(0, pickable.findIndex((r) => r.key === this.sel));
    const cur = (this.current = pickable[at] ?? null);
    const select = (next, cx, up = false) => {
      if (!next) return;
      this.sel = next.key;
      const i = rows.indexOf(next);
      // The section's heading stays in view over its first row.
      this.scroll.scroll_to_item(rows[i - 1]?.kind === "head" && up ? i - 1 : i);
      cx.notify();
    };
    const move = (d, cx) => {
      if (pickable.length) select(pickable[Math.max(0, Math.min(pickable.length - 1, at + d))], cx, d < 0);
    };
    // Tab: the next section's first row (round to the first); Shift+Tab: this section's first, else the one before.
    const jump = (d, cx) => {
      const firsts = pickable.filter((r, i) => i === 0 || pickable[i - 1].sec !== r.sec);
      if (!firsts.length) return;
      const mine = firsts.findIndex((r) => r.sec === cur?.sec);
      const next = d > 0 ? firsts[(mine + 1) % firsts.length]
        : cur && firsts[mine] !== cur ? firsts[mine] : firsts[(mine - 1 + firsts.length) % firsts.length];
      select(next, cx, true);
    };
    const loading = this.loading.size > 0;
    const empty = !rows.length
      ? v_flex().h(120).items_center().justify_center().gap(4).text_size(TEXT.body).text_color(t.dim)
        .child(loading && mode !== "commands" ? "Reading tasks and artifacts…" : q ? "Nothing found. Try fewer words." : "Nothing here.")
      : null;
    const sizes = rows.map((r) => (r.kind === "head" ? HEAD : r.kind === "more" ? MORE : ROW));
    const listH = Math.min(LIST_MAX, sizes.reduce((a, b) => a + b, 0));
    const found = pickable.filter((r) => r.kind !== "more").length;
    return v_flex().id("jump").w_full().bg(t.popover).text_size(TEXT.body)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); return; }
        if (e.key === "down" || (e.key === "n" && e.modifiers.control)) move(1, cx);
        else if (e.key === "up" || (e.key === "p" && e.modifiers.control)) move(-1, cx);
        else if (e.key === "tab") jump(e.modifiers.shift ? -1 : 1, cx);
        // →: a peek, when the row has a terminal (else the caret moves as usual).
        else if (e.key === "right" && this.terminalOf(cur)) this.peek(cur);
        else return;
        cx.stop_propagation();
      })
      // The search field is the header: no banner.
      .child(h_flex().h(56).flex_none().px(20).gap(12).items_center().border_b(1).border_color(t.border)
        .child(svg(`${WC}/search.svg`).size(18).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(16).text_color(t.foreground))
        .when(Boolean(q), (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim)
          .child(`${found} result${found === 1 ? "" : "s"}`)))
        // Nothing typed: ⏎ opens the selected row.
        .when(!q, (el) => el.child(keycaps(["⏎"]))))
      .child(empty ?? div().relative().h(listH + 10).pt(2).pb(8)
        .child(v_virtual_list("jump-list", rows.length, sizes,
          (i) => rows[i].key, (range) => rows.slice(range.start, range.end).map((r) => this.row(r, r === cur, t, words)))
          .track_scroll(this.scroll).size_full()
          // Rows take no handlers: the list says which one was pressed.
          .on_item_click((key, cx) => { const p = this.query(); this.go(this.rows(p.q, p.mode).find((r) => r.key === key && r.kind !== "head"), cx); }))
        .child(Scrollbar.vertical("jump-list").absolute().inset_0()))
      .child(this.footer(mode, Boolean(q), t));
  }
}
