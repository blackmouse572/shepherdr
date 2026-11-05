// Workspace spaces, as the design's sidebar (Doop App 01/02): Needs you on top, then Pinned, each machine's spaces
// and its sections, under small mono headings. A space's row is its folder, its name and, under it, its parent
// folder; a repo lists its worktrees under it (git worktree list), each with its branch and how far ahead it is, a
// worktree open as a space being that space's row there. Long lists fold after 5 ("N more"), never folding what
// needs you or the space you're in; names stay on one line, paths and branches are cut in the middle (App 13).
// After a space's name, the repo its first terminal is in now, only where unusual: branch, ahead/behind. Click to
// switch, right-click for its menu, drag to reorder. Under each machine, its sections
// (sections.js): the + on its header makes one, spaces drag in and out of them (only by
// dragging; a folded one opens while a space is dragged over it); a section's own + makes a space in it. Above the
// machines, Pinned (Pin / Unpin in a space's menu, or a drag in and out). A machine header's right-click renames
// it: the name and emoji the sidebar shows. A space nobody named reads after where it is
// (nameOf: "Home", its repo, its folder). New space (and its menu) is in the sidebar's footer
// (workspace-chrome-shepherdr), which asks this mod for the menu (spaces-chat.new-menu).
// A machine that isn't connected reads "Offline", dimmed and folded, with no + or meter.
// Opened as an overlay (props.view), this mod is instead one of its menus (popups.js), the
// rename and New section dialog (rename.js) or that dialog's icon picker (icon.js).
// Under each space (Doop App 02): its repo's checkouts ("main · checkout" first, each with ↑ahead ↓behind and a dot
// while dirty) and the agents and programs it runs, each with its status dot; a row's right side is its most urgent
// status and how many are so. What needs you inside a folded group shows as a pill at the list's foot (App 13).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { machines, panes, run, props, exec, hc, home, theme, shared, setShared, watchFolder, window, layout, nextCommand, spaces as allSpaces, terminals, agents } from "herdr";
import { countsByTab, readyByTab, count as needsCount } from "./inbox.js";
import { spacesWithChats } from "./parked.js";
import { sectionsOf, sectionOf, iconOf, placeSpace, foldSection, prune, data, pin, foldPinned, machineLook, restoreSection } from "./sections.js";
import { Menu, openMenu, rectOf, newSpace } from "./popups.js";
import { IconPicker } from "./icon.js";
import { Rename } from "./rename.js";
import { unreadSpaces, readShown } from "./unread.js";
import { muted } from "./notify.js";
import { MachinePopup, openMachine, openMachineSettings } from "./machine-popup.js";
import { NeedsDrawer, openNeeds } from "./needs-drawer.js";
import { BranchMenu } from "./branch-menu.js";
import { startPolling, allStats } from "./machines.js";
import { startAllowRules } from "./allow.js";
// The meter's tooltip and the red dot's words: the shared core's (the web's machine header says the same).
import { meterWords, healthErrorWords } from "./core/machines.js";
import { countBadge, red, green, need, working, onStatus, button, TEXT, RADIUS } from "./ui.js";
import { spaceName, gitTail, tilde, midCut, parentOf, foldList, parseWorktrees, assistantOf, machineOf } from "./core/spaces.js";
import { READ_LISTS, taskLists } from "./core/tasklists.js";
import { autoPrefix } from "./core/tasks.js";
import { taskDot } from "./dot.js";

const POPUPS = { add: Menu, space: Menu, section: Menu, icon: IconPicker, rename: Rename, machine: MachinePopup, needs: NeedsDrawer, branch: BranchMenu };

// Spaces with agents showing as a chat counted in their status.
const spaces = spacesWithChats;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
// A slim sidebar (not the rail): machine heads keep their name, the counts go to the tooltip.
const slim = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 250;

// Checkouts made for work (~/.herdr/worktrees/<repo>/<branch>, on any machine): a coordinator's
// task workers run in them, and a worktree space is made in one.
const WORKTREES = /\/\.herdr\/worktrees\//;
const inside = (path, folder) => path === folder || path.startsWith(`${folder.replace(/\/+$/, "")}/`);

// Where a space is now: its first terminal's live folder, else where it was made. A task
// worker's checkout never speaks for the space (its branch isn't the space's): a terminal
// in ~/.herdr/worktrees counts only inside the space's own folder (a worktree space's).
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  const own = (cwd) => !WORKTREES.test(`${cwd}/`) || (s.folder && inside(cwd, s.folder));
  return ps.find((p) => tabs.has(p.tab) && p.cwd && own(p.cwd))?.cwd || s.folder;
}
// The design's rows (Doop App 01/02): a space is its name over its parent folder (38), or one line when there is
// none (30); a worktree under its repo is one quiet mono line (26). Group headings are small mono capitals.
const ROW = 30, ROW_SUB = 38, TREE = 26;
const MONO = "JetBrains Mono", MONO_CHAR = 6.6; // an 11px mono character's width, for cutting paths to fit
// R4: a list shows 5, then "N more".
const FOLD = 5;
// The sidebar's width now (its edge can be dragged), and how many mono characters fit in `used` less than it.
const sideWidth = () => find(layout(), "sidebar")?.size?.px ?? 268;
const fits = (used) => Math.max(8, Math.floor((sideWidth() - used) / MONO_CHAR));
// drag()'s machine for Pinned's places: a space from any machine lands there.
const ANY = "\u0000any";
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// A home folder, here or on another machine (whose home() isn't known here), and a path from it (tilde): the shared
// core's, as the web's rows.
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// Each worktree after the base branch's name: its ref and its folder, a line each back: "<ahead> <behind> <1 if dirty>".
const TREE_STATE = 'b=$1; shift; while [ $# -gt 1 ]; do a=$(git rev-list --count "$b..$1" 2>/dev/null || echo 0); c=$(git rev-list --count "$1..$b" 2>/dev/null || echo 0); d=$(git -C "$2" --no-optional-locks -c core.fsmonitor=false status --porcelain 2>/dev/null | head -c 1); echo "$a $c ${d:+1}"; shift 2; done';
// An agent's status as the design's dot: needs you, working, done, else idle.
const dotOf = (status) => (status === "blocked" ? "needs" : status === "working" ? "working" : status === "done" ? "done" : "idle");
const STATUS_WORDS = { needs: "Needs you", working: "Working", done: "Done", idle: "Idle" };
const short = (address) => String(address ?? "").split("/").pop();
// A dev server's port from its title ("vite :5173", "localhost:3000").
const PORT = /\s*(?:localhost|127\.0\.0\.1)?:(\d{2,5})\b/;
const portOf = (title) => PORT.exec(String(title ?? ""))?.[0]?.trim().replace(/^(localhost|127\.0\.0\.1)/, "") ?? null;

// A task's worker chat inside the Tasks panel (as Jump opens it: mods/chat/panel.js openTaskThread).
function openTaskThread(terminal, task, title) {
  setShared("tasks.thread", { terminal, task: task ?? null, title: title ?? null, at: Date.now() });
  run("layout.select", { stack: "panel-body", child: "tasks" });
  run("layout.select", { stack: "tasks", child: "tasks-thread" });
  if (find(layout(), "tasks-thread-body")) run("layout.select", { stack: "tasks-thread-body", child: "tasks-thread-chat" });
  run("layout.show", { id: "panel" });
}

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// A space's name (or its number on the rail): bold and bright while its Assistant has something
// new (unread.js), as Slack's unread channels. A hidden bold copy holds the width either way, so
// nothing beside it moves when it turns bold.
function nameText(text, fresh, color, t) {
  return div().relative().min_w(0)
    .child(div().invisible().font_semibold().truncate().child(text))
    .child(div().absolute().top(0).left(0).right(0).truncate().text_color(fresh ? t.foreground : color)
      .when(fresh, (el) => el.font_semibold()).child(text));
}

export default class Spaces extends View {
  init(_props, cx) {
    const Popup = POPUPS[props()?.view];
    if (Popup) {
      this.popup = new Popup();
      this.popup.init(cx);
      return;
    }
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked, top }, null: not a repo
    this.trees = {}; // a repo (its git's repo key) -> its worktrees: [{ path, branch, head, ahead }] (git worktree list)
    this.more = new Set(); // lists opened past their first 5 ("N more"), by key
    this.into = null; // a section's +: { section, machine, before (the space ids then), at }: the new space goes in it
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null; // the space being dragged (its id)
    this.over = null; // where it would land: "space:<id>", "section:<id>" (its end) or "top:<machine>"
    this.peek = null; // a folded section opened while a space is dragged over it
    this.unread = new Set(); // spaces whose Assistant has something new (unread.js)
    this.machines = [];
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.openOffline = new Set(); // offline machines opened anyway (they start folded)
    this.machinesRead = false; // hc machine ls answered once: a machine missing from it is offline
    this.tasks = new Map(); // "<machine>|<slug>#<id>" -> { ref, title, pct }, for the agent rows
    this.agents = {}; // space id -> its agent rows (agentIndex), per render
    this.readTasks(cx);
    cx.timer.every(20000, (cx) => { if (window().active) this.readTasks(cx); });
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // Each machine's health and plan limits (machines.js): read every 45 s / 10 min, not per render.
    startPolling(cx);
    // "Always in this space": waiting permission asks a space's rule answers (allow.js).
    startAllowRules(cx);
    // spaces-chat.machine (a key, or `herdr-app do`): the details of the shown space's machine.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        // Beside the sidebar, near the top: no meter was pressed to put it under.
        if (c === "machine") openMachine(allSpaces().find((s) => s.active)?.machine ?? null, { x: 250, y: 40, width: 320, height: 0 });
        // spaces-chat.machine-limits: Settings > Machines, as the details' last row opens it.
        if (c === "machine-limits") openMachineSettings();
        // The Deleted section toast's click (sections.js deleteSection).
        if (c === "undo-section") restoreSection();
        // The sidebar footer's New space (workspace-chrome-shepherdr): its menu, at the pointer, for the shown space.
        if (c === "new-menu") this.footerMenu();
        cx.notify();
      }
    });
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    this.fileNew(sp, now);
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  // Every machine's task lists (as Jump reads them): a task agent's row shows its id and title.
  readTasks(cx) {
    if (this.readingTasks) return;
    this.readingTasks = true;
    cx.spawn(async (cx) => {
      const found = new Map();
      for (const m of [null, ...machines().filter((x) => x.name && x.layout === "ready").map((x) => x.name)]) {
        try {
          const r = await exec("sh", ["-c", READ_LISTS], m ? { on: m } : {});
          for (const list of taskLists(r.stdout)) for (const task of Array.isArray(list.tasks) ? list.tasks : [])
            found.set(`${m ?? ""}|${list.slug}#${task.id}`, { ref: `${list.prefix || autoPrefix(list.folder)}-${task.id}`, title: task.title ?? null, pct: task.progress?.done ?? null });
        } catch {}
      }
      this.tasks = found;
      this.readingTasks = false;
      cx.notify();
    });
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) { this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); this.machinesRead = true; }
      } catch {}
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // A section's + made a space: the first new one on its machine goes into that section (for 2 minutes).
  fileNew(sp, now) {
    const into = this.into;
    if (!into) return;
    if (now - into.at > 120000) { this.into = null; return; }
    const made = sp.find((s) => !into.before.has(s.id) && (s.machine ?? null) === into.machine);
    if (!made) return;
    this.into = null;
    placeSpace(made.id, into.section);
  }

  // New space from a section header's +: the New space dialog on its machine, the new space filed in it.
  newIn(s) {
    this.into = { section: s.id, machine: s.machine ?? null, before: new Set(allSpaces().map((x) => x.id)), at: Date.now() };
    newSpace(s.machine ?? null, s.id);
  }

  // The footer's New space menu: New space and New section on the shown space's machine, New worktree when that
  // space is in a repo, and Add machine.
  footerMenu() {
    const s = allSpaces().find((x) => x.active);
    const g = s ? this.git[where(s, panes())] : null;
    openMenu("add", { machine: s?.machine ?? null, space: s?.id ?? null, git: Boolean(g), footer: true });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, dirty: false, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git`, top: top.stdout.trim() };
      for (const line of r.stdout.split("\n")) {
        if (/^[12u?] /.test(line)) info.dirty = true;
        else if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      // A repo's own folder lists its worktrees under it.
      if (!info.linked) await this.listTrees(on, cwd, info);
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  // A repo's checkouts (git worktree list, its own first), each with ahead/behind the repo's own branch and whether
  // it has uncommitted changes: one git and one sh, whatever the number of worktrees.
  async listTrees(on, cwd, info) {
    const r = await exec("git", ["--no-optional-locks", "worktree", "list", "--porcelain"], { cwd, on });
    if (r.code !== 0) return;
    const list = parseWorktrees(r.stdout, { main: true });
    if (list.length < 2) { this.trees[info.repo] = []; return; }
    const from = info.branch && info.branch !== "(detached)" ? info.branch : "HEAD";
    const args = list.flatMap((w) => [w.branch ? `refs/heads/${w.branch}` : w.head, w.path]);
    const n = await exec("sh", ["-c", TREE_STATE, "sh", from, ...args], { cwd, on });
    const lines = n.code === 0 ? n.stdout.split("\n") : [];
    this.trees[info.repo] = list.map((w, i) => {
      const [a, b, d] = (lines[i] ?? "").split(" ");
      return { ...w, ahead: parseInt(a, 10) || 0, behind: parseInt(b, 10) || 0, dirty: d === "1" };
    });
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        let w = null;
        while (this.watching.has(repo)) {
          // At most 5 s per wait, so a reload's old build ends at its next cx use.
          w ??= watchFolder(repo).then(() => true);
          if (!(await Promise.race([w, cx.sleep(5000)]))) continue;
          w = null;
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  // The space's own menu (popups.js).
  menu(w, g, name, e) {
    openMenu("space", { space: w.id, name, machine: w.machine ?? null, git: g ? (g.linked ? "linked" : "main") : null, unread: this.unread.has(w.id), row: rectOf(e) });
  }

  // What a space is called: the name the person gave it, else after where it is now (`at`), as
  // Herdr names it but never "~": a home folder reads "Home", a repo its name, any other folder its
  // own (a space in /tmp/488b3d00 is "488b3d00", not its Assistant's "~"). A space named "~" (as
  // our New space and the tab bar once named home ones) counts as unnamed.
  nameOf(w, g, at) {
    if (!at) return w.name;
    return spaceName(w, { at, repo: g?.name ?? null, home: home(), named: Boolean(w.named) });
  }

  // The spaces shown, in Herdr's order, each with its git, where it is and its name: { w, i, g, at, name }.
  visible() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    return sp.filter((w) => this.shown.has(w.id)).map((w) => {
      const g = this.git[where(w, ps)] ?? null, at = place(w, ps);
      return { w, i: sp.indexOf(w), g, at, name: this.nameOf(w, g, at) };
    });
  }

  // `list` in order, each repo's own checkout with its worktrees under it (`kids`, from git worktree list; one
  // that is a space is that space's row there), so its worktree spaces aren't rows of their own.
  ordered(list = this.visible()) {
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      const top = { ...r, kids: [] };
      out.push(top);
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      top.kids = this.kidsOf(r, list.filter((k) => nested(k) && k.g.repo === r.g.repo));
    }
    return out;
  }

  // A repo's worktrees, each { path, branch, ahead, space } (space: the row of the space open in it, or null). A
  // worktree space git's list didn't have (not read yet) still shows, with its own branch. Shepherdr settings'
  // "Worktrees in the sidebar" off (shared "sidebar.worktrees" false): only the one being looked at.
  // The repo's own checkout comes first ({ main: true }), shown only beside other worktrees.
  kidsOf(r, spacesIn) {
    const used = new Set();
    const kids = (this.trees[r.g.repo] ?? []).map((w) => {
      const space = w.main ? null : spacesIn.find((k) => k.g.top === w.path) ?? null;
      if (space) used.add(space.w.id);
      return { path: w.path, branch: w.branch, ahead: w.ahead, behind: w.behind ?? 0, dirty: Boolean(w.dirty), main: Boolean(w.main), space };
    });
    for (const k of spacesIn) if (!used.has(k.w.id))
      kids.push({ path: k.g.top ?? k.at, branch: k.g.branch, ahead: k.g.ahead, behind: k.g.behind, dirty: Boolean(k.g.dirty), main: false, space: k });
    const all = kids.some((k) => !k.main) ? kids : [];
    return shared("sidebar.worktrees") === false ? all.filter((k) => k.space?.w.active) : all;
  }

  // What never folds away (R5): the space you're in, one that needs you, one with something new.
  keeps(r) {
    return Boolean(r && (r.w.active || this.needs(r.w) > 0 || this.unread.has(r.w.id)));
  }

  // Top rows (`ordered`) as drawn: each space's row, then its worktrees. Past 5 rows the rest fold into "N more"
  // (`key` names the list), except those keeps() holds. `opts` goes to each row (Pinned's, a section's last).
  drawList(key, tops, t, opts = () => ({})) {
    const kept = (r) => this.keeps(r) || r.kids.some((k) => this.keeps(k.space));
    const { shown, hidden } = foldList(tops, { limit: FOLD, open: this.more.has(key), keep: kept });
    const out = shown.flatMap((r, n) => [this.row({ ...r, ...opts(r, n, shown.length) }, t), ...this.treeRows(r, t)]);
    if (hidden || (this.more.has(key) && tops.length > FOLD)) out.push(this.moreRow(key, hidden, t, "spaces"));
    return out;
  }

  // The rows, under a header per machine, this computer's too (Doop App 01/02: "THIS MAC · 9 terminals"); the rail
  // shows none while this computer is the only one.
  // Pinned spaces (sections.js) sit in Pinned at the top instead (not on the rail).
  grouped(t, collapsed) {
    const visible = this.visible();
    const pins = collapsed ? [] : data().pinned;
    // A pinned repo keeps its worktree spaces under it in Pinned, not in its machine's list.
    const pinnedRepos = new Set(visible.filter((r) => pins.includes(r.w.id) && r.g && !r.g.linked).map((r) => r.g.repo));
    const underPin = (r) => Boolean(r.g?.linked && pinnedRepos.has(r.g.repo) && !pins.includes(r.w.id));
    const all = visible.filter((r) => !pins.includes(r.w.id) && !underPin(r));
    const rows = this.ordered(all);
    // On the rail: one number per space, worktree spaces after their repo's.
    const flat = (list) => list.flatMap((r) => [r, ...r.kids.filter((k) => k.space).map((k) => k.space)]);
    // A machine's spaces: those in no section first, then its sections (the rail has none).
    const body = (m, mine) => (collapsed ? flat(mine).map((r) => this.compact(r, t)) : this.sectioned(m, all.filter((r) => (r.w.machine ?? null) === m), t));
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).flex().items_center().text_size(TEXT.label).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    const pinned = this.pinned(visible, pins, Boolean(remote.length), t, visible.filter(underPin));
    if (!remote.length && collapsed) return [...pinned, ...(loading(null) && !rows.length && !pinned.length ? [loadingRow(null)] : body(null, rows))];
    const machineNames = [null, ...remote];
    return [...pinned, ...machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const machine = this.machines.find(k => k.name === m);
      // Not known yet (hc hasn't answered): neither connected nor offline.
      const state = !m ? "connected" : machine?.state ?? (this.machinesRead ? "unreachable" : null);
      const connected = state === "connected";
      const offline = state !== null && !connected;
      // Offline, it starts folded; a click opens it for now.
      const folded = offline ? !this.openOffline.has(m) : this.folded.has(m);
      if (folded && !collapsed) this.hide(all.filter((r) => (r.w.machine ?? null) === m), machineLook(m).name, () => {
        if (offline) this.openOffline.add(m);
        else { this.folded.delete(m); localStorage.setItem("machines.folded", JSON.stringify([...this.folded])); }
      });
      const health = this.stats?.[m ?? ""];
      // A space dropped on its machine's header leaves its section, for the top.
      const out = this.pressed && (sectionOf(this.pressed) || data().pinned.includes(this.pressed)) && this.over === `top:${m}`;
      // The machine's header, as the design's group headings: its icon and its name in small mono capitals, dim,
      // above its sections and spaces. Connected: its + (New space, New section) and machineNote(). Offline: the
      // word, dimmed, nothing else.
      const head = this.groupHead(`machine-${m ?? "local"}`, t).px(collapsed ? 2 : 8).when(offline, (el) => el.opacity(0.7))
        .on_click((_e, cx) => {
          if (offline) this.openOffline.has(m) ? this.openOffline.delete(m) : this.openOffline.add(m);
          else {
            folded ? this.folded.delete(m) : this.folded.add(m);
            localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          }
          cx.notify();
        })
        .on_mouse_move((_e, cx) => this.drag(`top:${m}`, m, cx))
        .on_mouse_down("right", (e) => openMenu("machine", { machine: m, row: rectOf(e) }))
        .when(out, el => el.child(this.line(t, "bottom")))
        // Its emoji, or the server / monitor; and the name it was given (Rename), else its own.
        .child(machineLook(m).icon
          ? div().w(14).flex_none().flex().justify_center().text_size(12).when(offline, el => el.opacity(0.5)).child(machineLook(m).icon)
          : svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(12).flex_none())
        .when(!collapsed, el => el.child(this.capitals(machineLook(m).name))
          .when(offline, el => el.child(div().flex_none().child(state === "connecting" ? "Connecting…" : "Offline")))
          // + (New space or New section, there) hugging its one meter. HERD-70.
          .when(connected, el => el.child(h_flex().flex_none().gap(2).items_center()
            .child(this.plus(`machine-add-${m ?? "local"}`, "New space or section", (e) => { this.addAt = rectOf(e); }, () => this.addMenu(m), t))
            .child(this.machineNote(m, health, t))))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(12).flex_none()));
      const own = !collapsed && sectionsOf(m).length;
      // An empty machine is just its header: its + makes a space.
      return [head, ...(folded ? [] : mine.length || own ? body(m, mine) : loading(m) ? [loadingRow(m)] : [])];
    })];
  }

  // A machine heading's right side (Doop App 02): here "9 terminals"; another machine a dot (green, red when its
  // health couldn't be read), "ssh" and its load. Health stays in the tooltip and the details a click opens.
  // `s`: this.stats, read once per render (each read copies every machine's numbers).
  machineNote(m, s, t) {
    const id = `machine-meter-${m ?? "local"}`;
    const n = this.terminalCount?.get(m ?? null) ?? 0;
    const load = typeof s?.health?.load === "number" ? `load ${s.health.load.toFixed(2)}` : null;
    const all = m ? ["ssh", load].filter(Boolean).join(" · ") : `${n} terminal${n === 1 ? "" : "s"}`;
    const words = slim() ? "" : all;
    return h_flex().id(id).flex_none().h(20).px(4).gap(6).items_center().rounded(RADIUS.control).cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .tooltip(s?.error ? healthErrorWords(s.error) : s?.health ? meterWords(s) : all)
      .on_mouse_down("left", (e) => { this.meterAt = rectOf(e); })
      .on_click((_e, cx) => { cx.stop_propagation(); openMachine(m, this.meterAt); })
      .when(Boolean(m) || Boolean(s?.error), (el) => el.child(div().size(6).rounded(3).flex_none().bg(s?.error ? red() : green())))
      .child(words);
  }

  // Pinned, as Shepherdr's: a heading like a section's (its pin, no menu), shown while it holds
  // any, then its spaces in their own order, each with its machine after its name once there
  // are several. Folded, it still shows the space you're in and its unread ones.
  pinned(list, pins, many, t, trees = []) {
    const byId = new Map(list.map((r) => [r.w.id, r]));
    const members = pins.map((id) => byId.get(id)).filter(Boolean);
    if (!members.length) return [];
    const open = !data().pinnedFolded || (this.pressed !== null && this.peek === "pinned");
    const needs = open ? 0 : members.reduce((n, r) => n + this.needs(r.w), 0);
    const ready = open ? 0 : members.reduce((n, r) => n + this.readyIn(r.w), 0);
    const head = this.groupHead("section-pinned", t)
      .on_click(() => foldPinned())
      .on_mouse_move((_e, cx) => this.drag("pinned", ANY, cx))
      .child(svg("mods/workspace-chrome/pin.svg").size(12).flex_none())
      .child(this.capitals("Pinned"))
      .when(needs > 0 || ready > 0, (el) => el.child(countBadge(needs, ready, t.chrome)))
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none())
      .when(this.pressed !== null && this.over === "pinned" && !open, (el) => el.child(this.line(t, "bottom")));
    const shown = open ? members : members.filter((r) => r.w.active || this.unread.has(r.w.id));
    if (!open) this.hide(members.filter((r) => !shown.includes(r)), "Pinned", () => foldPinned());
    // Each pinned space keeps its worktrees under it.
    const tops = shown.map((r) => ({ ...r, kids: r.g && !r.g.linked ? this.kidsOf(r, trees.filter((k) => k.g.repo === r.g.repo)) : [] }));
    return [head, ...this.drawList("pinned", tops, t, (r, n, len) => ({ pinned: true, tag: many ? machineLook(r.w.machine ?? null).name : null,
      end: open && n === len - 1 ? "pinned" : null }))];
  }

  // The + menu under its button: its right edge at the button's.
  addMenu(m) {
    const r = this.addAt;
    openMenu("add", { machine: m }, r ? { x: Math.max(8, r.x + r.width - 210), y: r.y + r.height + 4 } : "pointer");
  }

  // One machine's rows (`list`: its shown spaces, in Herdr's order): the spaces in no
  // section, then each section's header and, unless folded, its spaces in its order.
  sectioned(m, list, t) {
    const sections = sectionsOf(m);
    const byId = new Map(list.map((r) => [r.w.id, r]));
    const filed = new Set(sections.flatMap((s) => s.spaces));
    const out = this.drawList(`top:${m ?? ""}`, this.ordered(list.filter((r) => !filed.has(r.w.id))), t);
    for (const s of sections) {
      const members = s.spaces.map((id) => byId.get(id)).filter(Boolean);
      const open = !s.folded || (this.pressed !== null && this.peek === s.id);
      out.push(this.sectionHead(s, members, t, open));
      // Folded, it still shows the space you're in and its unread ones, as Slack does.
      const shown = this.ordered(open ? members : members.filter((r) => r.w.active || this.unread.has(r.w.id)));
      if (!open) this.hide(members.filter((r) => !(r.w.active || this.unread.has(r.w.id))), s.name, () => foldSection(s.id));
      // Dropped on the header, a space goes to the section's end: the line shows under its last row.
      out.push(...this.drawList(`section:${s.id}`, shown, t, (_r, n, len) => ({ end: open && n === len - 1 ? `section:${s.id}` : null })));
      if (open && !members.length) out.push(this.emptySection(s, t));
    }
    return out;
  }

  sectionHead(s, members, t, open) {
    const needs = open ? 0 : members.reduce((n, r) => n + this.needs(r.w), 0);
    const ready = open ? 0 : members.reduce((n, r) => n + this.readyIn(r.w), 0);
    // Over it, the line shows where the space lands: under the section's last row ("Drag spaces
    // here" when empty), or under the header while it's folded.
    const line = this.pressed !== null && this.over === `section:${s.id}` && !open;
    return this.groupHead(`section-${s.id}`, t)
      .on_click(() => foldSection(s.id))
      .on_mouse_down("right", (e) => openMenu("section", { section: s.id, row: rectOf(e) }))
      .on_mouse_move((_e, cx) => this.drag(`section:${s.id}`, s.machine, cx))
      // Its emoji when one was picked for it; the design's headings have no folder icon.
      .when(Boolean(s.icon), (el) => el.child(div().flex_none().text_size(12).child(s.icon)))
      .child(this.capitals(s.name))
      .when(needs > 0 || ready > 0, (el) => el.child(countBadge(needs, ready, t.chrome)))
      // Its + makes a space in it (the New space dialog on its machine, the new space filed here).
      .child(this.plus(`section-add-${s.id}`, `New space in ${s.name}`, null, () => this.newIn(s), t))
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none())
      .when(line, (el) => el.child(this.line(t, "bottom")));
  }

  // A group's heading (Pinned, a section, a machine), as the design's: small mono capitals, dim, a little air above
  // it so groups read apart. Its icon (12), then capitals(), then what sits at its right.
  groupHead(id, t) {
    return h_flex().relative().id(id).h(28).mt(6).flex_none().px(8).gap(6).items_center().rounded(RADIUS.card)
      .text_size(TEXT.id).font_family(MONO).font_medium().text_color(t.dim).cursor_pointer().hover((st) => st.bg(t.hover));
  }

  // A heading's name: capitals on one line, cut at its end (R1), the whole name on hover.
  capitals(name) {
    return div().flex_1().min_w(0).truncate().child(String(name ?? "").toUpperCase());
  }

  // A heading's + (a machine's: New space or section; a section's: New space in it): quiet until hovered.
  plus(id, tip, onDown, onClick, t) {
    return div().id(id).size(20).flex_none().flex().items_center().justify_center().rounded(RADIUS.control)
      .text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground)).tooltip(tip)
      .when(Boolean(onDown), (el) => el.on_mouse_down("left", (e) => onDown(e)))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(); cx.notify(); })
      .child(svg("mods/workspace-chrome/plus.svg").size(13));
  }

  // "N more spaces, none need you" (App 13; what needs you never folds), "N more worktrees", "N more agents"; or
  // "Show fewer" once open.
  moreRow(key, hidden, t, what) {
    const open = this.more.has(key);
    const noun = hidden === 1 ? what.slice(0, -1) : what;
    const words = open ? "Show fewer" : what === "spaces" ? `${hidden} more ${noun}, none need you` : `${hidden} more ${noun}`;
    return h_flex().id(`more-${key}`).h(26).flex_none().px(10).gap(8).items_center().rounded(RADIUS.card)
      .text_size(TEXT.id + 0.5).font_family(MONO).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.muted))
      .on_click((_e, cx) => { open ? this.more.delete(key) : this.more.add(key); cx.notify(); })
      .child(svg(`mods/workspace-chrome/chevron-${open ? "right" : "down"}.svg`).size(12).flex_none())
      .child(div().min_w(0).truncate().child(words));
  }

  // Under a space (Doop App 02), beside a guide line: its agents and programs, then its repo's checkouts, each with
  // its own agents (by the folder each runs in). Past 5 the worktrees fold, and past 5 the agents (helpers go with
  // theirs), never one that needs you.
  treeRows(r, t) {
    const kids = r.kids ?? [];
    const all = [r, ...kids.map((k) => k.space).filter(Boolean)].flatMap((x) => this.agents[x.w.id] ?? []);
    if (!kids.length && !all.length) return [];
    const akey = `agents:${r.w.id}`;
    const tops = all.filter((a) => !a.helper);
    const folded = foldList(tops, { limit: FOLD, open: this.more.has(akey), keep: (a) => a.status === "blocked" || all.some((h) => h.helper === a.address && h.status === "blocked") });
    const shownAgents = new Set(folded.shown.map((a) => a.address));
    const visible = all.filter((a) => shownAgents.has(a.helper ?? a.address));
    // Each agent under the checkout it runs in (the deepest folder holding its own), else its worktree space's, else
    // the repo's own checkout; none: under the space itself.
    const byKid = new Map();
    const main = kids.find((k) => k.main) ?? null;
    for (const a of visible) {
      const at = kids.filter((k) => a.cwd && inside(a.cwd, k.path)).sort((x, y) => y.path.length - x.path.length)[0]
        ?? kids.find((k) => k.space?.w.id === a.space) ?? (a.space === r.w.id ? main : null);
      const list = byKid.get(at) ?? [];
      list.push(a);
      byKid.set(at, list);
    }
    const key = `tree:${r.w.id}`;
    const { shown, hidden } = foldList(kids, { limit: FOLD, open: this.more.has(key), keep: (k) => this.keeps(k.space) || k.main });
    const rows = (byKid.get(null) ?? []).map((a) => this.agentRow(a, t, false));
    for (const k of shown) rows.push(this.treeRow(r, k, t), ...(byKid.get(k) ?? []).map((a) => this.agentRow(a, t, true)));
    if (hidden || (this.more.has(key) && kids.length > FOLD)) rows.push(this.moreRow(key, hidden, t, "worktrees"));
    if (folded.hidden || (this.more.has(akey) && tops.length > FOLD)) rows.push(this.moreRow(akey, folded.hidden, t, "agents"));
    return [v_flex().id(`trees-${r.w.id}`).flex_none().ml(16).pl(4).border_l(1).border_color(t.border).children(rows)];
  }

  // A checkout: its branch (cut in the middle, R2), "checkout" for the repo's own, else ↑ahead ↓behind and a dot while
  // it has uncommitted changes. One open as a space is that space: a click shows it, a right-click its menu, its roll
  // at the right, a flat fill while shown.
  treeRow(r, k, t) {
    const s = k.space, on = Boolean(s?.w.active);
    const label = k.branch ?? "detached";
    const max = fits(8 * 2 + 18 + 8 * 2 + 12 + 7 + 64);
    return h_flex().id(`tree-${r.w.id}-${k.path}`).h(TREE).flex_none().px(8).gap(7).items_center().rounded(RADIUS.card)
      .text_size(TEXT.id).font_family(MONO).text_color(on ? t.foreground : s ? t.muted : t.dim)
      .tooltip(`${label} · ${tilde(k.path)}${k.dirty ? " · uncommitted changes" : ""}`)
      .when(on, (el) => el.bg(t.selected))
      .when(Boolean(s) && !on, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)))
      .when(Boolean(s), (el) => el.on_click(() => run("space.select", { id: s.w.id }))
        .on_mouse_down("right", (e) => this.menu(s.w, s.g, s.name, e)))
      .child(svg("mods/workspace-chrome/branch.svg").size(12).flex_none().text_color(on ? working() : t.dim))
      .child(div().flex_1().min_w(0).truncate().child(midCut(label, max)))
      .when(k.main, (el) => el.child(div().flex_none().child("checkout")))
      .when(!k.main && k.ahead > 0, (el) => el.child(div().flex_none().text_color(green()).child(`↑${k.ahead > 99 ? "99+" : k.ahead}`)))
      .when(!k.main && k.behind > 0, (el) => el.child(div().flex_none().child(`↓${k.behind > 99 ? "99+" : k.behind}`)))
      .when(k.dirty, (el) => el.child(div().size(6).rounded(3).flex_none().bg(need())))
      .when(Boolean(s) && muted(s.w.id), (el) => el.child(svg("mods/spaces-chat/bell-off.svg").size(12).flex_none().text_color(t.dim)))
      .when(Boolean(s), (el) => el.child(this.roll(s.w, t)));
  }

  // What each space runs, for the rows under it: its Assistant, its tasks' agents (hc children of the Assistant,
  // labelled herdr.task, no pane), the agents and programs in its tabs (plain shells left out), and after each its
  // helpers (its own children, a task's reviewer). space id -> [{ address, kind, name, ref, sub, status, pct,
  // program, cwd, space, tab, pane, helper (its agent's address) }]. Once per render.
  agentIndex(sp, ps) {
    const ts = terminals().filter((k) => k.state === "live");
    const said = new Map(agents().map((a) => [a.address, a.status]));
    const byAddress = new Map(ts.map((k) => [k.address, k]));
    const statusOf = (address, fallback) => said.get(address) ?? byAddress.get(address)?.status ?? fallback ?? null;
    this.terminalCount = new Map();
    for (const k of ts) this.terminalCount.set(machineOf(k.address), (this.terminalCount.get(machineOf(k.address)) ?? 0) + 1);
    const out = {};
    for (const s of sp) {
      const m = s.machine ?? null, id = String(s.id).split("/").pop();
      const full = (a) => (a && m && !String(a).includes("/") ? `${m}/${a}` : a);
      const mine = ts.filter((k) => machineOf(k.address) === m);
      const rows = [], seen = new Set();
      const add = (row) => { if (seen.has(row.address)) return; seen.add(row.address); rows.push({ space: s.id, ...row }); };
      const coord = assistantOf(s, ts);
      if (coord) add({ address: coord.address, kind: "assistant", name: "Assistant", status: statusOf(coord.address), cwd: coord.cwd });
      const task = (k, p = null) => {
        const key = k.labels["herdr.task"], info = this.tasks.get(`${m ?? ""}|${key}`);
        return { address: k.address, kind: "task", key, ref: info?.ref ?? null, name: info?.title ?? k.name ?? "Task", status: statusOf(k.address, p?.status),
          pct: info?.pct, program: k.program ?? p?.program, cwd: p?.cwd ?? k.cwd, tab: p?.tab, pane: p?.pane };
      };
      const tabs = new Set(s.tabs.map((x) => x.id));
      for (const p of ps) {
        if (!tabs.has(p.tab) || !p.terminal || p.program?.shell) continue;
        const k = byAddress.get(p.terminal), l = k?.labels ?? {};
        if (l["herdr.role"] === "coordinator") continue;
        if (l["herdr.task"]) { add(task(k, p)); continue; }
        const tab = s.tabs.find((x) => x.id === p.tab);
        const agent = Boolean(p.program?.agent);
        add({ address: p.terminal, kind: agent ? "agent" : "terminal", name: agent ? (tab?.named ? tab.name : p.program?.name ?? p.title) : String(p.title ?? "").replace(PORT, "").trim() || p.program?.name || "Terminal",
          sub: agent ? null : [short(p.terminal), portOf(p.title)].filter(Boolean).join(" · "), status: agent ? statusOf(p.terminal, p.status) : null,
          program: p.program, cwd: p.cwd, tab: p.tab, pane: p.pane, focused: p.focused && s.active });
      }
      for (const k of mine) {
        const l = k.labels ?? {};
        if (l["herdr.role"] === "reviewer" || l["herdr.role"] === "coordinator") continue;
        const under = l["herdr.task.space"] === id || (coord && full(k.parent) === coord.address);
        if (l["herdr.task"] && under) add(task(k));
        else if (under) add({ address: k.address, kind: "agent", name: k.name || k.program?.name || short(k.address), status: statusOf(k.address), program: k.program, cwd: k.cwd });
      }
      const RANK = { assistant: 0, task: 1, agent: 2, terminal: 3 };
      rows.sort((x, y) => RANK[x.kind] - RANK[y.kind]);
      out[s.id] = rows.flatMap((row) => {
        if (row.kind === "assistant") return [row];
        const helpers = mine.filter((k) => !seen.has(k.address) && (full(k.parent) === row.address
          || (row.key && k.labels?.["herdr.task"] === row.key && k.labels?.["herdr.role"] === "reviewer")));
        for (const k of helpers) seen.add(k.address);
        return [row, ...helpers.map((k) => ({ space: s.id, address: k.address, kind: "helper", helper: row.address, status: statusOf(k.address), program: k.program, cwd: k.cwd,
          name: k.labels?.["herdr.role"] === "reviewer" ? "review" : k.name || k.program?.name || short(k.address), sub: "helper" }))];
      });
    }
    return out;
  }

  // One agent or program (Doop App 02 .ag): its icon (the Assistant's compass, a program's terminal, else its logo),
  // a task's id, its name, a quiet second part, its status dot at the right. A helper sits further in, a corner guide
  // pointing up to its agent. A click shows it: its pane, a task's chat, else a peek.
  agentRow(a, t, nested) {
    const logo = (p, n) => (p?.icon ? (p.tint ? svg(p.icon).size(n).flex_none().text_color(t.muted) : image(p.icon).size(n).flex_none()) : null);
    const icon = a.kind === "assistant" ? svg("mods/spaces-chat/compass.svg").size(14).flex_none().text_color(t.dim)
      : a.kind === "terminal" ? svg("mods/workspace-chrome/terminal.svg").size(14).flex_none().text_color(t.dim)
      : logo(a.program, a.helper ? 13 : 14) ?? svg("mods/workspace-chrome/terminal.svg").size(14).flex_none().text_color(t.dim);
    const kind = a.kind === "terminal" ? "idle" : dotOf(a.status);
    const left = (nested ? 12 : 4) + (a.helper ? 16 : 0);
    return h_flex().relative().id(`agent-${a.address}`).h(26).flex_none().pl(left + 4).pr(8).gap(8).items_center().rounded(RADIUS.control)
      .text_size(TEXT.body - 0.5).text_color(a.focused ? t.foreground : t.muted).whitespace_nowrap().cursor_pointer()
      .when(Boolean(a.focused), (el) => el.bg(t.selected))
      .hover((s) => s.bg(a.focused ? t.selected : t.hover))
      .tooltip([a.ref, a.name, a.kind === "terminal" ? null : STATUS_WORDS[kind]].filter(Boolean).join(" · "))
      .on_click(() => this.openAgent(a))
      .when(Boolean(a.helper), (el) => el.child(div().absolute().left(left - 5).top(4).w(7).h(9).border_l(1).border_b(1).border_color(t.input ?? t.border).rounded_bl(4)))
      .child(icon)
      .when(Boolean(a.ref), (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id - 0.5).font_medium().text_color(t.dim).child(a.ref)))
      .child(div().min_w(0).truncate().child(a.name))
      .when(Boolean(a.sub), (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id - 0.5).text_color(t.dim).child(a.sub)))
      .child(div().flex_1())
      .child(this.statusDot(kind, t, a.status === "working" ? a.pct : null));
  }

  openAgent(a) {
    if (a.pane) {
      run("space.select", { id: a.space });
      run("tab.select", { id: a.tab });
      return run("pane.focus", { pane: a.pane });
    }
    if (a.kind === "assistant") return run("space.select", { id: a.space });
    if (a.kind === "task") return openTaskThread(a.address, a.ref, a.name);
    run("terminal.peek", { terminal: a.address });
  }

  // The design's status dot (Doop App 02 .dot): needs you (amber, pulsing), working (blue, an arc going round it; a
  // task's pie once it reports its %), done (green), idle (hollow). 14 square, so nothing moves when it changes.
  statusDot(kind, t, pct = null) {
    const box = () => div().relative().size(14).flex_none().flex().items_center().justify_center();
    if (kind === "working" && Number.isFinite(pct)) return taskDot("working", { pct });
    if (kind === "needs") return box()
      .child(div().absolute().top(1).left(1).size(12).rounded(6).bg(need()).loop("opacity", { from: 0.1, to: 0.45, period: 2000 }))
      .child(div().size(8).rounded(4).bg(need()));
    if (kind === "working") return box().child(div().size(6).rounded(3).bg(working()))
      .child(div().absolute().inset_0().child(svg("mods/workspace-chrome/spinner.svg").size(14).text_color(working()).spin(1200)));
    if (kind === "done") return box().child(div().size(8).rounded(4).bg(green()));
    return box().child(div().size(8).rounded(4).border(1.5).border_color(t.dim));
  }

  // A row's right side (App 02 .roll): its most urgent status as a dot and how many are so (needs you: the Inbox's
  // items in its tabs; working: its agents at work; done: its tasks in Ready and its agents done). Nothing: hollow.
  roll(w, t) {
    const list = this.agents[w.id] ?? [];
    const count = (st) => list.filter((a) => a.status === st).length;
    const needs = this.needs(w), busy = count("working"), done = this.readyIn(w) + count("done");
    const [kind, n] = needs ? ["needs", needs] : busy ? ["working", busy] : done ? ["done", done] : ["idle", 0];
    return h_flex().flex_none().gap(5).items_center().font_family(MONO).text_size(TEXT.id).font_medium().text_color(t.muted)
      .child(this.statusDot(kind, t)).when(n > 0, (el) => el.child(n > 99 ? "99+" : String(n)));
  }

  // R5: rows inside a folded group (a machine, a section, Pinned) whose needs show in the edge pill.
  hide(rows, name, open) {
    const n = rows.reduce((sum, r) => sum + this.needs(r.w), 0);
    if (n > 0) this.hidden.push({ n, name, open });
  }

  // "2 need you below · build-box" (App 13), over the list's foot; a click opens those groups.
  edgePill(t) {
    const n = this.hidden.reduce((sum, h) => sum + h.n, 0);
    if (!n) return null;
    const where = this.hidden.length === 1 ? this.hidden[0].name : `${this.hidden.length} groups`;
    const groups = [...this.hidden];
    return h_flex().absolute().left(0).right(0).bottom(12).justify_center()
      .child(h_flex().id("needs-below").h(26).px(11).gap(6).items_center().rounded(13).bg(need()).text_color(onStatus())
        .text_size(TEXT.label - 0.5).font_medium().whitespace_nowrap().cursor_pointer()
        .on_click((_e, cx) => { for (const h of groups) h.open(); cx.notify(); })
        .child(svg("mods/spaces-chat/arrow-down.svg").size(13).flex_none())
        .child(`${n} need${n === 1 ? "s" : ""} you below · ${where}`));
  }

  emptySection(s, t) {
    return h_flex().relative().id(`section-empty-${s.id}`).h(28).flex_none().px(8).gap(9).items_center().text_size(TEXT.label).text_color(t.dim)
      .on_mouse_move((_e, cx) => this.drag(`section:${s.id}`, s.machine, cx))
      .child(div().w(18).flex_none())
      .child("Drag spaces here")
      .when(this.pressed && this.over === `section:${s.id}`, (el) => el.child(this.line(t, "top")));
  }

  // Where a dragged space would land.
  line(t, edge) {
    return div().absolute().left(0).right(0).h(2).bg(t.accent).when(edge === "top", (l) => l.top(0)).when(edge === "bottom", (l) => l.bottom(0));
  }

  // The pointer, with a space pressed, over a place for it: on its own machine only, but
  // Pinned (machine ANY) takes any machine's.
  drag(over, machine, cx) {
    if (this.pressed === null) return;
    const from = spaces().find((s) => s.id === this.pressed);
    const next = from && (machine === ANY || (from.machine ?? null) === (machine ?? null)) ? over : null;
    // Over a folded section's header, it opens until the drop; over another section, that one does.
    const sec = next === "pinned" ? "pinned" : next?.startsWith("section:") ? next.slice(8) : null;
    const shut = sec === "pinned" ? data().pinnedFolded : sectionsOf(machine).find((s) => s.id === sec)?.folded;
    const peek = sec && shut ? sec : sec ? null : this.peek;
    if (this.over !== next || this.peek !== peek) {
      this.over = next;
      this.peek = peek;
      cx.notify();
    }
  }

  // Released: a press without a move selects the space; else it goes where the line shows.
  release(cx) {
    const from = this.pressed, over = this.over;
    this.pressed = null;
    this.over = null;
    this.peek = null;
    if (from !== null && over === `space:${from}`) run("space.select", { id: from });
    else if (from !== null && over) this.drop(from, over);
    cx.notify();
  }

  // Which edge of a space's row a dragged one lands on: below it when coming from above it
  // in the same list, else above it.
  edge(from, to) {
    const pins = data().pinned;
    if (pins.includes(to)) {
      const a = pins.indexOf(from);
      return a >= 0 && a < pins.indexOf(to) ? "bottom" : "top";
    }
    const sec = sectionOf(to);
    if (sec) {
      const a = sec.spaces.indexOf(from);
      return a >= 0 && a < sec.spaces.indexOf(to) ? "bottom" : "top";
    }
    // At the top, Herdr's order decides (space.move).
    const sp = spaces();
    return sp.findIndex((s) => s.id === from) < sp.findIndex((s) => s.id === to) ? "bottom" : "top";
  }

  // Into Pinned (its heading, among its spaces), or out of it to anywhere else.
  drop(from, over) {
    if (over === "pinned") return pin(from);
    const cut = over.indexOf(":");
    const kind = over.slice(0, cut), id = over.slice(cut + 1);
    const pins = data().pinned;
    if (kind === "space" && pins.includes(id)) {
      if (id === from) return;
      const at = pins.filter((x) => x !== from).indexOf(id);
      return pin(from, true, this.edge(from, id) === "bottom" ? at + 1 : at);
    }
    if (pins.includes(from)) pin(from, false);
    if (kind === "section") placeSpace(from, id);
    else if (kind === "top") placeSpace(from, null);
    else if (kind === "space" && id !== from) {
      const sec = sectionOf(id);
      if (sec) {
        const at = sec.spaces.filter((x) => x !== from).indexOf(id);
        placeSpace(from, sec.id, this.edge(from, id) === "bottom" ? at + 1 : at);
      } else {
        if (sectionOf(from)) placeSpace(from, null);
        // space.move takes the target's place, counted from 1: the rest shift toward where it was.
        const i = spaces().findIndex((s) => s.id === id);
        if (i >= 0) run("space.move", { id: from, index: i + 1 });
      }
    }
  }

  // What needs the person in a space, for its red count, and its tasks in Ready, for its green
  // count (none while Shepherdr settings' "Red counts" / "Green counts" is off: shared
  // "counts.red" / "counts.green" false).
  needs(w) {
    if (shared("counts.red") === false) return 0;
    const m = countsByTab();
    return w.tabs.reduce((n, tab) => n + (m.get(tab.id) ?? 0), 0);
  }

  readyIn(w) {
    if (shared("counts.green") === false) return 0;
    const m = readyByTab();
    return w.tabs.reduce((n, tab) => n + (m.get(tab.id) ?? 0), 0);
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t, tag) {
    // the words are the shared core's (the web's row says the same)
    const { where } = gitTail(g, { name, tree: Boolean(tree), tag });
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(TEXT.label)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  // `pinned`: in Pinned, `tag` its machine there; `end`: the drag key (a section's, Pinned) a
  // drop under this last row goes to.
  // As the design's (Doop App 01): its folder (or the emoji picked for it), its name on one line (R1) over its
  // parent folder in mono, cut in the middle to fit (R2), the repo's branch only when unusual, its counts at the
  // right. Shown, a flat fill one step up (no edge, glow or border).
  row({ w, g, end, pinned, tag, at, name }, t) {
    const on = w.active;
    const fresh = this.unread.has(w.id);
    // Notify Off (notify.js): muted, as Slack's muted channels: dimmed, a crossed-out bell; its
    // counts still show.
    const quiet = muted(w.id);
    const parent = at ? parentOf(at) : "";
    const sub = [tag, parent ? `in ${midCut(parent, fits(8 * 2 + 8 * 2 + 18 + 9 + 8 + 3 * MONO_CHAR + (tag ? tag.length * MONO_CHAR : 0)))}` : null].filter(Boolean).join(" · ");
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(sub ? ROW_SUB : ROW)
      .flex_none()
      .justify_center()
      .rounded(RADIUS.card)
      .cursor_pointer()
      .tooltip(at ? `${name} · ${tilde(at)}` : name)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== `space:${w.id}`, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.pressed !== w.id && this.over === `space:${w.id}`, (el) => el.child(this.line(t, this.edge(this.pressed, w.id))))
      .when(this.pressed !== null && end && this.over === end, (el) => el.child(this.line(t, "bottom")))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = `space:${w.id}`;
      })
      .on_mouse_move((_e, cx) => this.drag(`space:${w.id}`, pinned ? ANY : w.machine, cx))
      .on_mouse_down("right", (e) => this.menu(w, g, name, e))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          // Its folder, or the emoji picked for it (Change icon), in one slot so names stay aligned.
          .child(div().w(18).flex_none().flex().justify_center()
            .child(iconOf(w.id)
              ? div().text_size(14).when(quiet, (el) => el.opacity(0.5)).child(iconOf(w.id))
              : svg("mods/workspace-chrome/folder.svg").size(15).text_color(fresh || on ? t.foreground : t.dim)))
          .child(v_flex().flex_1().min_w(0)
            .child(h_flex().min_w(0).gap(6).items_center()
              .child(nameText(name, fresh, quiet ? t.dim : on ? t.foreground : t.muted, t))
              .child(g ? this.gitTail(g, false, name, t, null) : div().flex_1()))
            .when(Boolean(sub), (el) => el.child(div().min_w(0).truncate().font_family(MONO).text_size(TEXT.id - 0.5).text_color(t.dim).child(sub))))
          .when(quiet, (el) => el.child(svg("mods/spaces-chat/bell-off.svg").size(13).flex_none().text_color(t.dim)))
          .child(this.roll(w, t)),
      );
  }

  // Needs you, above every group (Doop App 01): a raised row with the bell and how many things wait for you across
  // every space and machine (inbox.js), opening the Needs you drawer beside the sidebar (needs-drawer.js, App 03; its
  // Show in Tasks goes on to Tasks' Needs you). It sits above the list, so it never scrolls or
  // folds away (R5). Its count stops at 99+ (R3). On the rail: the bell and the count.
  needsRow(t, collapsed) {
    const n = needsCount();
    const pill = div().h(18).min_w(20).px(6).flex_none().flex().items_center().justify_center().rounded(9).bg(need())
      .text_color(onStatus()).font_family(MONO).text_size(TEXT.id).font_semibold().child(n > 99 ? "99+" : String(n));
    const bell = svg("mods/spaces-chat/bell.svg").size(15).flex_none().text_color(n ? need() : t.dim);
    if (collapsed)
      return h_flex().id("needs-you").h(30).mx(6).mt(8).mb(2).flex_none().gap(4).items_center().justify_center().rounded(RADIUS.card)
        .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(n ? `Needs you: ${n}` : "Needs you")
        .on_mouse_down("left", (e) => { this.needsAt = rectOf(e); }).on_click(() => openNeeds(this.needsAt))
        .child(bell).when(n > 0, (el) => el.child(pill.min_w(16).px(4)));
    const label = h_flex().flex_1().min_w(0).gap(9).items_center()
      .child(bell)
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child("Needs you"))
      .when(n > 0, (el) => el.child(pill));
    return div().flex_none().px(8).pt(10).pb(4)
      .child(button("needs-you", label, { kind: "secondary", size: "lg", onClick: () => openNeeds(this.needsAt) }).w_full().h(34).pl(10).pr(8)
        .on_mouse_down("left", (e) => { this.needsAt = rectOf(e); }));
  }

  // The rail's space: its icon (emoji or folder) on a 34 tile, the roll's status dot on its corner, the name as a tip.
  compact({ w, g, i, name }, t) {
    const on = w.active, fresh = this.unread.has(w.id), quiet = muted(w.id);
    const label = name ?? w.name ?? String(i + 1);
    const list = this.agents[w.id] ?? [];
    const needs = this.needs(w), busy = list.some((a) => a.status === "working");
    const done = this.readyIn(w) + list.filter((a) => a.status === "done").length;
    const kind = needs ? "needs" : busy ? "working" : done ? "done" : null;
    return h_flex()
      .id(`space-${w.id}`)
      .relative()
      .h(34)
      .flex_none()
      .items_center()
      .justify_center()
      .rounded(RADIUS.card)
      .cursor_pointer()
      .tooltip(needs ? `${label} · ${needs} need you` : label)
      .when(on, (el) => el.bg(t.selected).border_1().border_color(t.border))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .on_mouse_down("right", (e) => this.menu(w, g, label, e))
      .child(iconOf(w.id)
        ? div().text_size(16).when(quiet, (el) => el.opacity(0.5)).child(iconOf(w.id))
        : svg("mods/workspace-chrome/folder.svg").size(16).text_color(fresh || on ? t.foreground : t.dim))
      .when(Boolean(kind), (el) => el.child(div().absolute().top(2).right(6).child(this.statusDot(kind, t))));
  }

  close() { this.popup?.close?.(); }

  render(cx) {
    if (this.popup) return this.popup.render(cx);
    const t = theme();
    const collapsed = narrow();
    this.stats = collapsed ? null : allStats();
    prune();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    // Assistants with something new; any on screen is read now.
    readShown();
    // Shepherdr settings' "Bold unread spaces" off (shared "sidebar.unread" false): none.
    this.unread = shared("sidebar.unread") === false ? new Set() : unreadSpaces(sp);
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    this.agents = this.agentIndex(sp, panes());
    this.hidden = [];
    const rows = this.grouped(t, collapsed);
    const pill = collapsed ? null : this.edgePill(t);
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      // Needs you on top; New space moved to the sidebar's footer (workspace-chrome-shepherdr), as the design has it.
      .child(this.needsRow(t, collapsed))
      .child(div().relative().flex_1().min_h(0).flex().flex_col()
        .child(v_flex().flex_1().min_h(0).px(8).pb(pill ? 48 : 14).overflow_y_scrollbar().mode("always")
          .on_mouse_up("left", (_e, cx) => this.release(cx))
          .children(rows))
        .when(Boolean(pill), (el) => el.child(pill)));
  }
}
