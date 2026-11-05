import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { panes, run, openOverlay, theme, window, shared, setShared, layout, settings, nextCommand, readTextFile, appHome, home, exec, props, terminals } from "herdr";
import { spacesWithChats as spaces, sweep } from "./parked.js";
import { agentIn, isCoordinatorTab, closeTab, watchNewSpaces, newSpace, openCoordinator, renameTab, renameSpace } from "./coordinator.js";
import { startTick, tickOnChange } from "./tick.js";
import { startInbox, count as inboxCount, countsByTab, readyCount, readyByTab, showInbox, toAlert } from "./inbox.js";
import { serveRemote } from "./secrets.js";
import { watchService } from "./service.js";
import { startBridge } from "./bridge.js";
import { countBadge, H, TEXT, RADIUS, MONO, SERIF, HEAD, working, openSettings, raisedLook, well, isDark, banner } from "./ui.js";
import { statusDot } from "./dot.js";
import { READ_LISTS, taskLists } from "./core/tasklists.js";
import { autoPrefix } from "./core/tasks.js";
// The branch chip's git and its menu's size (Doop App 02b; the menu is spaces-chat's branch-menu.js).
import { BRANCH_STATE, BRANCH_MENU, branchState, branchMenuHeight, BRANCH_EXTRAS, EDITOR_KEY, PR_KEEP, PR_WAIT, branchExtras,
  editorTries, canUpdate, branchActions } from "./core/worktree.js";
import { on as addonOn } from "./addons.js";
// A tab's name (what runs in it while Herdr named it): core/menus.js, as the web app's tab bar names it.
import { tabName } from "./core/menus.js";

// The command bar's popup, as mods/jump/mod.json opens it (keep the two the same).
const JUMP_POPUP = { at: "top", offset: 56, width: 640, height: 560 };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The side panels, in the design's order (Doop App 02 .rp .seg.fill): [stack child, label, icon].
const PANELS = [["tasks", "Tasks", "mods/tasks/tasks.svg"], ["changes", "Changes", "mods/changes/changes.svg"],
  ["files", "Files", "mods/files/file.svg"], ["artifacts", "Artifacts", "mods/artifacts/artifacts.svg"]];
const openPanel = (id) => { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); };
// The panel's head (the layout's "panel-switch" block): the shown panel's banner over the switcher, or the switcher
// alone over a drilled-in view (a task's thread, an artifact), which has its own header. The block is resized to it.
// The switcher's well inside the head's card: the block is its bottom gap (8), the card's border (2), padding (8), the well.
const BANNER_H = 60, WELL_H = 32, SWITCH_H = 8 + 2 + 8 + WELL_H, HEAD_H = SWITCH_H + BANNER_H + 1;
const HEAD_MS = 200, PILL = { duration: 180, easing: "ease-in-out" };

export default class Tabs extends View {
  init(_props, cx) {
    // The panel switcher (the layout's "panel-switch" block, props.view "panels") only draws: the bar's copy does
    // the background work and takes the commands.
    if (props()?.view === "panels") {
      // Tasks and Artifacts leave their banners to this head (shared "panel.tasks" / "panel.artifacts" fill it).
      setShared("panel.head", true);
      return;
    }
    // Agents parked behind a chat whose tab or space closed end, as their pane would have (the
    // Agents list did this; the layout has none now).
    cx.timer.every(5000, () => sweep());
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    // Shepherdr's service, which does the background work while it runs (lib/service.js).
    watchService(cx);
    // The person's pins, sidebar sections, icons and Notify, in step with the web app (lib/bridge.js).
    startBridge(cx);
    // Tasks' queue and merge watcher (mods/tasks owns it): left to the service while it runs.
    startTick(cx);
    // What needs the person, for Tasks' "Needs you" and the red counts (inbox.js).
    startInbox(cx);
    // The add-ons switched off (lib/addons.js): Everywhere's "off" in ~/.herdr/shepherdr.json, as
    // the settings window last saved it (or pushed it here), into shared state the mods read.
    readTextFile(`${home()}/.herdr/shepherdr.json`).then((s) => {
      const list = JSON.parse(s ?? "{}")?.everywhere?.off;
      const want = Array.isArray(list) ? list : [];
      if (JSON.stringify(want) !== JSON.stringify(shared("addons.off") ?? [])) setShared("addons.off", want);
    }).catch(() => {});
    // Ctrl+Shift+W comes here so a coordinator with live workers asks first, like its x.
    // At most 5 s per wait (one pending nextCommand), so a reload's old build ends at its next
    // cx use instead of staying in memory.
    cx.spawn(async (cx) => {
      let cmd = null;
      for (;;) {
        cmd ??= nextCommand();
        const c = await Promise.race([cmd, cx.sleep(5000)]);
        if (c === undefined) continue;
        cmd = null;
        const tab = spaces().find(s => s.active)?.tabs.find(t => t.active);
        if (c === "close" && tab) closeTab(tab.id);
        // F2 / Shift+F2 (keys.json): our Rename dialogs for the shown tab and space.
        if (c === "rename-tab" && tab) renameTab(tab);
        if (c === "rename-space") { const sp = spaces().find(s => s.active); if (sp) renameSpace(sp.id); }
        // Ctrl+Shift+N: the New space dialog, on the shown space's machine.
        if (c === "newspace") newSpace(spaces().find(s => s.active));
        // Ctrl+Shift+P (keys.json): the command bar (mods/jump) on commands only.
        if (c === "commands") openOverlay({ mod: "jump", kind: "popup", ...JUMP_POPUP, props: { mode: "commands" } });
        // Cmd+, / Ctrl+, (keys.json): Shepherdr's Settings, as the sidebar foot's Settings.
        if (c === "settings") openSettings();
        // This computer's + in the Spaces sidebar: the dialog here, whatever space is shown.
        if (c === "newspace-local") newSpace(null);
        // A machine's New space in the Spaces sidebar: the dialog there (shared "newspace.on" =
        // { machine, at }, null machine: this computer). A script's way: data/newspace-on.json
        // ({ machine }).
        if (c === "newspace-on") {
          let on = shared("newspace.on");
          if (!on || Date.now() - on.at >= 10000) {
            try { on = { ...JSON.parse(await readTextFile(`${appHome()}/data/newspace-on.json`) ?? "null"), at: Date.now() }; } catch { on = null; }
          }
          newSpace(on?.machine || on?.section ? { machine: on.machine ?? null, section: on.section ?? null } : null);
        }
        // A space's coordinator tab, opened (a script's way to the + menu's Coordinator): the space
        // in data/coordinator-openreq.json ({ space }), else the shown one.
        if (c === "coordinator") {
          let id = null;
          try { id = JSON.parse(await readTextFile(`${appHome()}/data/coordinator-openreq.json`) ?? "null")?.space ?? null; } catch {}
          const s = spaces().find(s => (id ? s.id === id : s.active));
          if (s) openCoordinator(s, true);
        }
        // A toast's "needs you": the Tasks panel, on its Active tab.
        if (c === "inbox") showInbox();
        // An agent's alert (herdr-task alert), clicked: "alert-<terminal>" ("~" for "/"), to that agent (inbox.js).
        if (c.startsWith("alert-")) toAlert({ terminal: c.slice(6).replace(/~/g, "/") });
      }
    });
  }

  // Where the shown tab's code lives: its focused pane's folder and branch (else its first pane with a branch, else the
  // space's), read
  // with git when it changes and every 15 s (BRANCH_STATE: base, ahead, changes, the other checkouts).
  branchOf(space, cx, extras = true) {
    const tab = space?.tabs.find((c) => c.active)?.id;
    const tabs = new Set((space?.tabs ?? []).map((c) => c.id));
    const ps = panes().filter((p) => p.tab === tab && p.cwd && p.branch);
    // A tab of chats only (an Assistant's): the space's other panes say where its code is.
    const p = ps.find((x) => x.focused) ?? ps[0] ?? panes().find((x) => tabs.has(x.tab) && x.cwd && x.branch);
    if (!p) return null;
    const machine = space.machine ?? null, key = JSON.stringify([machine, p.cwd]);
    if (this.branchKey !== key || Date.now() - (this.branchAt ?? 0) > 15000) {
      if (this.branchKey !== key) this.branch = null;
      this.branchKey = key;
      this.branchAt = Date.now();
      cx.spawn(async (cx) => {
        const r = await exec("sh", ["-c", BRANCH_STATE, "sh"], { cwd: p.cwd, on: machine }).catch(() => null);
        if (this.branchKey !== key) return;
        this.branch = r?.code === 0 ? branchState(r.stdout) : null;
        cx.notify();
        if (this.branch && extras) await this.readExtras(p.cwd, p.branch, machine, cx);
      });
    }
    if (!extras) return { name: p.branch, machine, state: this.branch };
    if (this.branch && this.extras?.key !== this.extrasKey(p.branch, machine)) cx.spawn((cx) => this.readExtras(p.cwd, p.branch, machine, cx));
    const x = this.extras?.key === this.extrasKey(p.branch, machine) ? this.extras : null;
    return { name: p.branch, machine, state: this.branch, editor: x?.editor ?? null, pr: x?.pr ?? null };
  }

  extrasKey(branch, machine) { return JSON.stringify([machine, this.branch?.top, branch, shared(EDITOR_KEY) ?? null]); }

  // The menu's editor (the chosen one, if it's there) and the branch's PR (gh, if it's there): at most once a minute.
  async readExtras(cwd, branch, machine, cx) {
    const key = this.extrasKey(branch, machine);
    if (this.extras?.key === key && Date.now() - this.extras.at < PR_KEEP) return;
    this.extras = { ...(this.extras?.key === key ? this.extras : { editor: null, pr: null }), key, at: Date.now() };
    const tries = editorTries(shared(EDITOR_KEY)).join(" ");
    const r = await Promise.race([exec("sh", ["-c", BRANCH_EXTRAS, "sh", tries, branch ?? ""], { cwd, on: machine }).catch(() => null), cx.sleep(PR_WAIT)]);
    if (this.extras.key !== key || !r || r.code !== 0) return;
    Object.assign(this.extras, branchExtras(r.stdout));
    cx.notify();
  }

  // The chip: the branch and how far ahead of the repo's own branch; a click opens its menu under it.
  branchChip(b, t, roomy, files) {
    const s = b.state;
    return h_flex().id("branch-chip").h(22).pl(6).pr(8).gap(6).flex_none().items_center().rounded(RADIUS.control)
      .border(1).border_color(t.border).bg(t.raised).font_family(MONO).text_size(TEXT.label).text_color(t.foreground)
      .when(Boolean(s), (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)))
      .tooltip(s ? (s.linked ? `Worktree of ${s.repo}` : s.repo) : b.name)
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        this.chipAt = { x: e.position.x - (e.local_position?.x ?? 0), y: e.position.y - (e.local_position?.y ?? 0), h: e.bounds?.height ?? H.sm };
      })
      .on_click(() => {
        if (!s) return;
        const at = this.chipAt ? { x: this.chipAt.x, y: this.chipAt.y + this.chipAt.h + 6 } : "pointer";
        const update = canUpdate(s, b.name);
        openOverlay({ mod: "spaces-chat", kind: "popup", width: BRANCH_MENU.width, at,
          height: branchMenuHeight(s, branchActions({ files, editor: b.editor, update }), Boolean(b.pr)),
          props: { view: "branch", state: s, branch: b.name, machine: b.machine, files, editor: b.editor, update, pr: b.pr,
            height: branchMenuHeight(s, branchActions({ files, editor: b.editor, update }), Boolean(b.pr)) } });
      })
      .child(svg("mods/workspace-chrome-shepherdr/git-branch.svg").size(13).flex_none().text_color(working()))
      .child(div().max_w(roomy ? 240 : 140).truncate().child(b.name))
      .when(s?.linked && s.ahead > 0, (el) => el.child(div().flex_none().text_color(t.dim).child(`↑${s.ahead}`)));
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        // The Inbox panel is gone: a space that had it open shows Tasks, where its items are.
        const stored = this.panels[space.id] === "inbox" ? "tasks" : this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // The layout's side panel and which of its panels are offered: Tasks and Artifacts (Artifacts unless its add-on is
  // off), beside whichever of Files and Changes are on.
  panelState() {
    const root = layout();
    const enabled = [...(shared("workspace.panels") ?? ["files", "changes"]), "tasks", ...(addonOn("artifacts") ? ["artifacts"] : [])];
    return { root, panel: find(root, "panel"), body: find(root, "panel-body"), enabled };
  }

  // A tab's task: its terminal's herdr.task label, looked up in its machine's task lists (read at most every 20 s,
  // as the sidebar reads them). { ref, title, pct } or null.
  taskOf(space, ps, byAddress, cx) {
    const m = space?.machine ?? null;
    for (const p of ps) {
      const key = p.terminal ? byAddress.get(p.terminal)?.labels?.["herdr.task"] : null;
      if (!key) continue;
      this.readTaskLists(m, cx);
      return this.tasks?.get(`${m ?? ""}|${key}`) ?? null;
    }
    return null;
  }

  readTaskLists(m, cx) {
    this.tasksAt ??= {};
    if (Date.now() - (this.tasksAt[m ?? ""] ?? 0) < 20000) return;
    this.tasksAt[m ?? ""] = Date.now();
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", READ_LISTS], m ? { on: m } : {}).catch(() => null);
      if (!r) return;
      this.tasks ??= new Map();
      for (const list of taskLists(r.stdout)) for (const task of Array.isArray(list.tasks) ? list.tasks : [])
        this.tasks.set(`${m ?? ""}|${list.slug}#${task.id}`, { ref: `${list.prefix || autoPrefix(list.folder)}-${task.id}`, title: task.title ?? null, pct: task.progress?.done ?? null });
      cx.notify();
    });
  }

  // The panel switcher (Doop App 02 .rp .seg.fill): over the side panel, a full-width segmented of its panels, each
  // with its icon and a count where one is known (Tasks: needs you and Ready; Changes: files not committed). The
  // shown one is raised; words on every segment where roomy, else on the shown one only.
  panelSwitch(cx) {
    const t = theme();
    const { root, body, enabled } = this.panelState();
    const space = spaces().find((s) => s.active);
    const counts = shared("counts.red") !== false, greens = shared("counts.green") !== false;
    const dirty = enabled.includes("changes") ? this.branchOf(space, cx, false)?.state?.dirty ?? 0 : 0;
    const roomy = (this.width ?? 0) >= 400;
    const shown = body?.active;
    const seg = ([id, label, icon]) => {
      const on = shown === id;
      const [need, ready] = id === "tasks" ? [counts ? inboxCount() : 0, greens ? readyCount() : 0] : [0, 0];
      const n = id === "changes" ? dirty : 0;
      return h_flex().id(`seg-${id}`).flex_1().min_w(0).h_full().px(6).gap(6).justify_center().items_center().rounded(7)
        .text_size(TEXT.label).font_medium().whitespace_nowrap()
        .when(on, (el) => el.text_color(t.foreground))
        .when(!on, (el) => el.text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click(() => openPanel(id)))
        .when(!roomy && !on, (el) => el.tooltip(label))
        .child(svg(icon).size(13).flex_none().when(on, (el) => el.text_color(t.accent)))
        .when(roomy || on, (el) => el.child(label))
        .when(need + ready > 0, (el) => el.child(countBadge(need, ready, on ? t.raised : t.background)))
        .when(n > 0, (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id - 0.5).font_medium().text_color(t.dim).child(n > 99 ? "99+" : String(n))));
    };
    const inner = (shown === "tasks" && find(root, "tasks")?.active === "tasks-thread") || (shown === "artifacts" && find(root, "artifacts")?.active === "artifacts-view");
    this.resizeHead(inner ? SWITCH_H : HEAD_H, cx);
    // The shown segment's raised pill slides under the segments (the tab indicator): the row splits evenly, so its
    // place is the row's measured width (an element with an id: one without loses its size) split n ways, in px so
    // the native transition can ease it.
    const list = PANELS.filter(([id]) => enabled.includes(id));
    // Measured sizes come zoomed (settings' zoom); lengths are drawn at the zoom, so they're set unzoomed.
    const at = list.findIndex(([id]) => id === shown), n = list.length, z = Number(settings()?.zoom) || 1;
    const segW = n && this.rowW ? this.rowW / z / n : 0;
    const pill = at >= 0 && segW > 0 && div().id("seg-pill").absolute().top(0).h_full().left(at * segW).w(segW)
      .transition("left", PILL)
      .child(raisedLook(div().size_full().rounded(7), 7).when(!isDark(), (el) => el.bg(t.background)));
    const segs = well(div().id("seg-well").w_full().h(WELL_H).flex_none().p(2), 10)
      .child(h_flex().id("seg-row").relative().size_full()
        .on_size_change((size, cx) => { if (Math.abs((this.rowW ?? 0) - size.width) > 0.5) { this.rowW = size.width; cx.notify(); } })
        .when(Boolean(pill), (el) => el.child(pill))
        .children(list.map(seg)));
    const [title, line, right] = this.headOf(shown, space, t, cx);
    // Doop App 02 .rp: the neutral wool banner, the panel's name in the serif and its line in mono, its control at
    // the right; the switcher under it. Over a drilled-in view the block is the switcher's height and the banner
    // gone; back over a list it fades in.
    return div().id("panel-switch").size_full().pb(8)
      .on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } })
      .child(v_flex().size_full().rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
        .child(div().id("panel-fold").w_full().flex_1().min_h(0).overflow_hidden()
          .opacity(inner ? 0 : 1).transition("opacity", { duration: HEAD_MS, easing: "ease-out" })
          .child(banner("panel-banner", "neutral", BANNER_H).border_b(1).border_color(t.border)
            .child(h_flex().absolute().inset_0().pl(14).pr(8).gap(6).items_center()
              .child(v_flex().flex_1().min_w(0).gap(4)
                .child(div().truncate().when(isDark(), (el) => el.font_family(SERIF).text_size(HEAD.small)).when(!isDark(), (el) => el.font_semibold()).child(title))
                .when(Boolean(line), (el) => el.child(div().min_w(0).truncate().font_family(MONO).text_size(TEXT.id).text_color(t.muted).child(line))))
              .when(Boolean(right) && !inner, (el) => el.child(right)))))
        .child(div().w_full().flex_none().p(4).child(segs)));
  }

  // The block's height, set at once: a layout resize every frame lags the window, so the banner only fades.
  resizeHead(px, cx) {
    if (this.headTo === px) return;
    this.headTo = px;
    cx.spawn(async () => run("layout.resize", { id: "panel-switch", px }));
  }


  // The head's banner for a panel: [its name, its line, its control at the right or null].
  headOf(id, space, t, cx) {
    if (id === "tasks") {
      const d = shared("panel.tasks") ?? {};
      const line = typeof d.open === "number" ? `${d.space ? `${d.space} · ` : ""}${d.open} open · ${d.done} done this week` : "";
      // Group by (mods/tasks-menu): a 28 heading, then 32 rows (ui.js menuRow).
      const more = h_flex().id("panel-more").size(H.sm).flex_none().items_center().justify_center().rounded(RADIUS.control).cursor_pointer().text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Group by")
        .on_click(() => openOverlay({ mod: "tasks-menu", kind: "popup", at: "pointer", width: 200, height: 8 + 28 + (d.multi ? 4 : 2) * 32, props: { menu: "group", machines: Boolean(d.multi) } }))
        .child(svg("mods/tasks/more.svg").size(14).flex_none());
      return ["Tasks", line, more];
    }
    if (id === "artifacts") {
      const on = Boolean(shared("artifacts.all"));
      const all = h_flex().id("panel-art-all").h(24).px(8).flex_none().items_center().rounded(RADIUS.control).cursor_pointer().text_size(TEXT.label).font_medium()
        .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(on ? t.selected : t.hover).text_color(t.foreground))
        .on_click(() => setShared("artifacts.all", !on))
        .child("All");
      return ["Artifacts", shared("panel.artifacts")?.line ?? "", all];
    }
    if (id === "changes") {
      const b = this.branchOf(space, cx, false), n = b?.state?.dirty ?? 0;
      return ["Changes", b ? `${b.name} · ${n ? `${n} not committed` : "nothing to commit"}` : "", null];
    }
    const f = space?.folder ?? "", h = home();
    return ["Files", !space?.machine && h && (f === h || f.startsWith(`${h}/`)) ? `~${f.slice(h.length)}` : f, null];
  }

  render(cx) {
    if (props()?.view === "panels") return this.panelSwitch(cx);
    // Another machine's agent using a secret: answered from here (secrets.js, bin/herdr-secret serve).
    serveRemote();
    tickOnChange(cx);
    watchNewSpaces(spaces());
    const t = theme();
    const space = spaces().find(p => p.active);
    // A coordinator's tab is pinned first.
    const shown = [...(space?.tabs ?? [])].sort((a, b) => isCoordinatorTab(b.id) - isCoordinatorTab(a.id));
    // Settled tabs (tab.settle) stay out of the bar, behind "N settled", which shows them dimmed (a click on one
    // brings it back). The shown tab is never hidden.
    const settled = shown.filter((c) => c.settled && !c.active);
    if (!settled.length) this.showSettled = false;
    const listed = shown.filter((c) => !c.settled || c.active || this.showSettled);
    // The tab menu's height: Rename, Close, and the rows the tab gets (menu-tasks): a coordinator
    // tab's Edit instructions, an agent's Switch agent and Restart.
    const menuHeight = (id) => 19 + 32 * (2 + (isCoordinatorTab(id) ? 1 : 0) + (agentIn(id) && !agentIn(id).address.includes("/") ? 2 : 0));
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action, size = H.sm) => div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(RADIUS.control + 1).cursor_pointer().text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    // What needs the person, per tab (the Inbox's items), and Tasks' Ready: the tab's dot (with how many past one).
    // Shepherdr settings' "Red counts" off (shared "counts.red" false): none here, nor on Tasks.
    const counts = shared("counts.red") !== false, greens = shared("counts.green") !== false;
    const needs = counts ? countsByTab() : new Map(), readies = greens ? readyByTab() : new Map();
    // Its "Tab bar" off (shared "tabbar.tabs" false): the bar keeps +, the panel toggle and the window's
    // buttons (and its background work), without the tabs.
    const tabsShown = shared("tabbar.tabs") !== false;
    const byAddress = new Map(terminals().map((k) => [k.address, k]));
    // A tab (Doop App 02 .tab): a 28 tall pill, its icon (the Assistant's compass, an agent's or program's logo, else
    // a terminal), a task's id, its name, its status and ×. The shown tab is raised, the others plain.
    const item = (c, i) => {
      const ps = panes().filter((p) => p.tab === c.id);
      const program = ps.find(p => p.program?.agent)?.program ?? ps[0]?.program;
      const coord = isCoordinatorTab(c.id);
      const task = coord ? null : this.taskOf(space, ps, byAddress, cx);
      const name = task?.title && !c.named ? task.title : tabName(c.name, program?.name);
      const tint = c.active ? t.accent : t.dim;
      const icon = coord ? svg("mods/spaces-chat/compass.svg").size(14).flex_none().text_color(tint)
        : program?.icon && !program.shell ? (program.tint ? svg(program.icon).size(14).flex_none().text_color(tint) : image(program.icon).size(14).flex_none())
        : svg("mods/workspace-chrome/terminal.svg").size(14).flex_none().text_color(tint);
      const need = needs.get(c.id) ?? 0, ready = readies.get(c.id) ?? 0;
      const kind = need > 0 || c.status === "blocked" ? "needs" : c.status === "working" ? "working" : ready > 0 ? "ready" : c.status === "done" ? "done" : null;
      const n = kind === "needs" ? need : kind === "ready" ? ready : 0;
      return h_flex().id(`tab-${c.id}`).h(28).pl(10).pr(8).gap(7).rounded(RADIUS.card).items_center().flex_none().text_size(TEXT.body - 0.5).whitespace_nowrap()
        .when(c.active, (el) => raisedLook(el, RADIUS.card).text_color(t.foreground))
        .when(!c.active, (el) => el.text_color(t.muted).hover(s => s.bg(t.hover)))
        .when(c.settled && !c.active, (el) => el.opacity(0.6))
        .cursor_pointer()
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) renameTab(c); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i && listed[from]) run("tab.move", { id: listed[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu-tasks", kind: "popup", width: 236, height: menuHeight(c.id), props: { tab: "tab", target: { id: c.id, space: space.id }, right: this.right } }); })
        .child(icon)
        .when(Boolean(task?.ref), (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id).font_medium().text_color(t.dim).child(task.ref)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(Boolean(kind), (el) => el.child(statusDot(kind, kind === "working" ? task?.pct ?? null : null)))
        .when(n > 1, (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id).font_medium().text_color(t.dim).child(n > 9 ? "9+" : String(n))))
        .when(!coord || c.active, (el) => el.child(div().id(`close-${c.id}`).flex_none().ml(2).rounded(4).cursor_pointer().text_color(t.dim).hover((s) => s.text_color(t.foreground))
          .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); closeTab(c.id); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const { root, panel, body, enabled } = this.panelState();
    const sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    this.syncPanel(space, panel, body, enabled);
    const roomy = (this.width ?? 0) >= 1100;
    const branch = this.branchOf(space, cx);
    // The side panel's toggle (the design's titlebar right toggle): its panels switch inside it (panelSwitch). Shut,
    // it carries Tasks' counts, so what needs the person still shows.
    const open = Boolean(panel && !panel.hidden);
    const [need, ready] = [counts ? inboxCount() : 0, greens ? readyCount() : 0];
    const toggle = h_flex().id("panel-toggle").h(28).px(6).gap(5).flex_none().items_center().rounded(RADIUS.control + 1).cursor_pointer()
      .bg(open ? t.selected : t.chrome).text_color(open ? t.foreground : t.muted).hover((s) => s.bg(open ? t.selected : t.hover).text_color(t.foreground))
      .tooltip("Side panel (⌘L)").on_mouse_down("left", stop)
      .on_click(() => {
        if (open) run("layout.hide", { id: "panel" });
        else if (enabled.includes(body?.active)) run("layout.show", { id: "panel" });
        else openPanel("tasks");
      })
      .child(svg("mods/workspace-chrome-shepherdr/panel-right.svg").size(15).flex_none())
      .when(!open && need + ready > 0, (el) => el.child(countBadge(need, ready, t.chrome)));
    return h_flex().id("tabs-bar").size_full().min_w(0).px(10).pl(lightsPadding).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      .on_mouse_up("left", () => { this.pressed = null; })
      // The bar runs to the window's right edge: menus opened from it place their submenus by it.
      .on_mouse_move((e) => { this.right = e.position.x - e.local_position.x + e.bounds.width; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .when(Boolean(branch), (el) => el.child(this.branchChip(branch, t, roomy, enabled.includes("files"))).child(div().w(6).flex_none()))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(4).overflow_x_scrollbar()
        .children(tabsShown ? listed.map(item) : [])
        .child(button("tab-new", svg("mods/workspace-chrome-shepherdr/plus.svg").size(15), () => openOverlay({ mod: "new-menu-tasks", kind: "popup", width: 250, height: 543, props: { right: this.right } }), 28)))
      .when(tabsShown && settled.length > 0, (el) => el.child(h_flex().id("tabs-settled").h(28).px(10).gap(7).flex_none().items_center().rounded(RADIUS.card)
        .text_size(TEXT.body - 0.5).whitespace_nowrap().cursor_pointer()
        .bg(this.showSettled ? t.selected : t.chrome).text_color(this.showSettled ? t.foreground : t.muted).hover((s) => s.bg(this.showSettled ? t.selected : t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop).on_click((_e, cx) => { this.showSettled = !this.showSettled; cx.notify(); })
        .child(svg("mods/tabs-tasks/eye-off.svg").size(14).flex_none().text_color(t.dim))
        .child(`${settled.length} settled`)))
      .child(toggle)
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs-tasks/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs-tasks/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs-tasks/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
