// A task's chat inside the Tasks panel (the person's decision: drill in, never a side chat).
// The layout's "tasks" stack holds the list ("tasks-list", mod tasks) and this view
// ("tasks-thread", a column): a header ("tasks-thread-head", mod chat with props { panel: true,
// head: true }: ‹ Tasks back to the list, the task, its worker's status, Accept and the main
// chat's Chat / Terminal switch) over a stack ("tasks-thread-body") of the worker's chat
// ("tasks-thread-chat", mod chat with props { panel: true }: a nested Chat made again for each
// worker) and its raw terminal ("tasks-thread-term", a layout terminal block). A task worker has
// no pane or tab, and none is made: the terminal block shows it where it runs.
// Which worker: shared "tasks.thread" = { terminal, task, title, at } (openTaskThread()). The
// Tasks list sends every task this way, with { key: { machine, folder, slug, id } } too: an
// ended task's last agent (its chat read from { log: { path, kind } }, with Resume) or, never
// started (terminal null), a { note } saying why it waits (mods/tasks target()).
// A Ready task (its worker said ready) gets Accept in the header, as its row in the list does:
// the person's one action on tasks (herdr-task accept: merges first when there's something to
// merge, else done). The task's record is read from its list file (its herdr.task label).
// Beside the chat and terminal the body stack holds the task's Files, Changes (against its base)
// and Pull request (mods task-files, task-changes, task-pr), and its Browser (mods/task-browser: a
// live viewer in a terminal block of its own), picked in the header's second row, as Shepherdr's
// task side panel. All are one switcher (only one shows at a time), the main chat's header switch
// (ui.js pillTabs); Pull request only once the task has one. They show the task the header
// publishes (shared "tasks.thread.where", from its record: lib/taskwhere.js).
// The header is Doop App 02's task header: a banner in the task's state over the switcher, the
// title in the serif, its line (id · branch · model · effort · account), its progress and pull
// request pills, Stop (ends its worker, asked first) and ⋯ (the task row's menu, mods/tasks-menu).

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { shared, setShared, run, theme, exec, appHome, home, readTextFile, writeTextFile, notify, layout, openOverlay, settings } from "herdr";
import { terminals, agents } from "./live.js";
import { taskDot, ownProgress } from "./dot.js";
import { busyAgain, reportOf, retryLine, taskLine, progressPill, prPill } from "./core/tasks.js";
import { runsOn, NAMES } from "./agent.js";
import { endAgent } from "./core/menus.js";
import { button, pillTabs, TEXT, RADIUS, HEAD, MONO, SERIF, isDark, bannerBg, bannerDots, red, working, toast, plainError } from "./ui.js";
import { on as addonOn } from "./addons.js";

// The task header's shared left edge, and task ids in the Tasks list's monospace (mods/tasks).
const EDGE = 12, ID_FONT = MONO;
// The banner's height (under the 96 of its dots' picture) and the switcher row's: with the border,
// the "tasks-thread-head" block's size in layouts/shepherdr.json (133). Keep them in step.
const BANNER_H = 92, VIEWS_H = 40;
// The header's pills give way on a narrow panel (its width, unzoomed): PR first, then progress.
const PR_PILL_W = 430, PROGRESS_PILL_W = 340;
// A task's state as its banner's (ui.js banner states).
const BANNER = { needs: "attention", working: "working", merging: "done", ready: "done", done: "done" };
// The Claude account the task's agent runs on (herdr-task's record), by the person's name for it (Settings >
// Accounts, shared "usage.prefs"); null with only one account here.
function accountName(rec) {
  if ((shared("usage")?.claude ?? []).length < 2) return null;
  const id = [...(rec?.agents ?? [])].reverse().find((a) => typeof a?.account === "string")?.account;
  if (!id) return null;
  return shared("usage.prefs")?.names?.[id] || (id === "default" ? "Default" : id[0].toUpperCase() + id.slice(1));
}

export const STACK = "tasks", LIST = "tasks-list", THREAD = "tasks-thread";
export const BODY = "tasks-thread-body", CHAT = "tasks-thread-chat", TERM = "tasks-thread-term";
export const FILES = "tasks-thread-files", CHANGES = "tasks-thread-changes", PR = "tasks-thread-pr";
export const BROWSER = "tasks-thread-browser";

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const hit = find(c, id); if (hit) return hit; }
  return null;
}

// The chat shown inside, for its cleanup: a nested view gets no close() of its own.
export const inner = { chat: null };

// Which task a "tasks.thread" names: its agent's terminal, else its key (one never started).
const wantId = (w) => (w ? w.terminal ?? (w.key ? `${w.key.machine ?? ""}:${w.key.slug}#${w.key.id}` : null) : null);

// Whether the shown layout has the drill-in view (else callers go to the agent instead).
export function hasTaskThread(node) {
  if (!node || typeof node !== "object") return false;
  if (node.id === THREAD) return true;
  return (node.children ?? []).some(hasTaskThread);
}

export function openTaskThread(terminal, task, title) {
  setShared("tasks.thread", { terminal, task: task ?? null, title: title ?? null, at: Date.now() });
  run("layout.select", { stack: "panel-body", child: STACK });
  run("layout.select", { stack: STACK, child: THREAD });
  // A task opens on its chat; the header's switch shows its terminal.
  if (find(layout(), BODY)) run("layout.select", { stack: BODY, child: CHAT });
  run("layout.show", { id: "panel" });
}

export const backToTasks = () => run("layout.select", { stack: STACK, child: LIST });

// Chat / Terminal: which the view shows now (the body stack's child).
export const terminalShown = () => find(layout(), BODY)?.active === TERM;
export const showWorkerChat = () => run("layout.select", { stack: BODY, child: CHAT });
// Asks the header for the worker's terminal (the chat's own "Open terminal", a slash menu): it
// has the timers the swap waits on. Shared "tasks.thread.termreq" = { terminal, at }.
export const requestWorkerTerminal = (terminal) => setShared("tasks.thread.termreq", { terminal, at: Date.now() });

// The terminal block shows the worker: an edit of that one block in the layout's file (a mod
// can't draw a terminal, and a layout block can show any core terminal without giving it a pane;
// not layout.set, as the Artifacts sidebar explains). Only if the file is unchanged since it was
// read; else read again. Then Herdr reads the file (under a second): wait for the block.
async function pointTerm(addr, cx) {
  const path = `${appHome()}/layouts/${shared("layout")}.json`;
  for (let i = 0; ; i++) {
    const text = await readTextFile(path);
    const tree = JSON.parse(text ?? "null"), body = find(tree, BODY);
    if (!body) throw new Error("This layout has no task terminal.");
    const node = { id: TERM, type: "block", content: { terminal: addr } };
    const at = body.children.findIndex((c) => c.id === TERM);
    if (at < 0) body.children.push(node); else body.children[at] = node;
    try { await writeTextFile(path, JSON.stringify(tree, null, 2), text); break; }
    catch (e) { if (i >= 2) throw e; }
  }
  for (let i = 0; i < 30 && find(layout(), TERM)?.content?.terminal !== addr; i++) await new Promise((r) => cx.timer.after(100, () => r()));
  if (find(layout(), TERM)?.content?.terminal !== addr) throw new Error("Herdr didn't load the layout with this terminal.");
}

export class PanelHost {
  // Two copies: the header (head: true) and the body, which holds the nested chat.
  constructor(Chat, head) {
    this.Chat = Chat;
    this.head = head === true;
    this.termReqAt = shared("tasks.thread.termreq")?.at ?? null;
    this.restartReqAt = shared("chat.restartreq")?.at ?? null;
    this.busy = false;     // the header's swap to the terminal, under way
    this.cur = null;
    this.entity = null;
    this.swapping = false;
    this.rec = null;       // the shown worker's task record (its list file's entry), or null
    this.accepting = false;
    this.ticks = 0;
  }

  // The worker's task: { machine, slug, id } from its herdr.task label ("<slug>#<id>"), or null.
  taskOf(addr) {
    const key = terminals().find((k) => k.address === addr)?.labels?.["herdr.task"];
    const [slug, id] = String(key ?? "").split("#");
    return key && slug && id ? { machine: addr.includes("/") ? addr.split("/")[0] : null, slug, id: Number(id) } : null;
  }

  // Reads its task's record again (cheap: one small file; another machine's less often).
  async loadTask(addr, cx) {
    const cur = this.cur;
    // A terminal gone from the core has no labels left: the task's key, as the list sent it.
    const k = (addr && this.taskOf(addr)) || cur?.key || null;
    let rec = null;
    if (k) {
      const text = k.machine
        ? (await exec("sh", ["-c", 'cat "$HOME/.herdr/tasks/$1.json"', "sh", k.slug], { on: k.machine }).catch(() => null))?.stdout
        : await readTextFile(`${home()}/.herdr/tasks/${k.slug}.json`).catch(() => null);
      try {
        const d = JSON.parse(text || "null");
        const t = d?.tasks?.find((x) => x.id === k.id);
        rec = t ? { ...t, folder: d.folder, machine: k.machine, ref: d.prefix ? `${d.prefix}-${t.id}` : String(t.id) } : null;
      } catch {}
    }
    if (this.cur !== cur) return;
    // Where the task's side views look (taskwhere.js): its worktree, else its list's folder.
    if (this.head) {
      const w = rec ? { terminal: addr, ref: rec.ref, folder: rec.worktree || rec.folder || null, machine: rec.machine ?? null,
        branch: rec.branch ?? null, base: rec.base ?? null, start: rec.start ?? null, pr: rec.pr ?? null } : null;
      if (JSON.stringify(w) !== JSON.stringify(shared("tasks.thread.where") ?? null)) setShared("tasks.thread.where", w);
    }
    if (JSON.stringify(rec) !== JSON.stringify(this.rec)) { this.rec = rec; cx.notify(); }
  }

  // Ready and nothing in the way (as the list's Ready group): not asking, no problem, not already merging, not
  // back at work.
  acceptable(st, addr) {
    const r = this.rec;
    return Boolean(r && r.state === "ready" && !r.attention && st !== "blocked" && !r.merge_requested && !(r.auto_merge && r.pr && !r.merged))
      && !this.again(st, addr);
  }

  // Its worker took up work again since it said ready (core/tasks.js busyAgain()): Working, no Accept.
  again(st, addr) {
    const r = this.rec, k = addr ? terminals().find((x) => x.address === addr) : null;
    return Boolean(r && k) && busyAgain(r, [{ address: addr, status: st, turn: k.turn, role: k.labels?.["herdr.role"] ?? "worker" }]);
  }

  // Accept shows what you approve first: the Accept card (mods/accept-card) runs herdr-task
  // accept from its own Accept; the header reads the task again on its timer.
  accept(_cx) {
    const r = this.rec;
    openOverlay({ mod: "accept-card", kind: "dialog", modal: true, width: 640, height: 640,
      props: { ref: r.ref, folder: r.folder, machine: r.machine ?? null, title: r.title } });
  }

  // Another worker asked for: the old chat is closed and released, a new one made for it.
  async swap(want, cx) {
    const old = this.entity, oldChat = inner.chat;
    this.entity = null;
    inner.chat = null;
    if (old) {
      try { await oldChat?.close(cx); } catch {}
      old.release();
    }
    this.cur = want;
    this.rec = null;
    this.loadTask(want?.terminal, cx);
    if (want?.terminal) this.entity = cx.new(this.Chat, { inner: true, thread: true, terminal: want.terminal, task: want.task, title: want.title,
      log: want.log ?? null, key: want.key ?? null });
    this.swapping = false;
    cx.notify();
  }

  async close(cx) {
    if (!this.head) await inner.chat?.close(cx);
  }

  // The task's status dot, by the Tasks list's rules (mods/tasks place()): its record, then its
  // worker's own status. Nothing (an empty spot the dot's size) until its record is read.
  dot(st, addr) {
    const r = this.rec, s = this.stateOf(st, addr);
    if (!s) return div();
    return taskDot(s, { pct: ownProgress([addr])?.pct ?? r.progress?.done, halo: true });
  }

  // Its state by those rules (the dot's, the banner's), or null until its record is read.
  stateOf(st, addr) {
    const r = this.rec;
    if (!r) return null;
    const live = terminals().find((x) => x.address === addr)?.state === "live";
    const last = r.agents?.[r.agents.length - 1];
    const starting = !last?.ended && Date.now() - Math.max(0, ...[r.started, last?.at].filter((x) => typeof x === "number")) < 90000;
    return ["todo", "queued", "done"].includes(r.state) ? r.state
      : r.attention || st === "blocked" || r.retry?.over ? "needs"
      : r.state === "ready" && !this.again(st, addr) ? ((r.merge_requested && live) || (r.auto_merge && r.pr && !r.merged) ? "merging" : "ready")
      : st === "working" || r.retry || starting ? "working" : "needs";
  }

  status(addr) {
    const a = agents().find((x) => x.address === addr);
    if (a) return a.status;
    const k = terminals().find((x) => x.address === addr);
    return ["working", "blocked", "done", "idle"].includes(k?.status) ? k.status : null;
  }

  // Chat → Terminal: the body stack shows the worker's terminal block, pointed at it first, and
  // the keyboard goes to it (typing reaches the worker, as in the main chat's Terminal).
  toTerminal(addr, cx) {
    if (this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (find(layout(), TERM)?.content?.terminal !== addr) await pointTerm(addr, cx);
        run("layout.select", { stack: BODY, child: TERM });
        run("pane.focus", { terminal: addr });
      } catch (e) {
        toast({ title: "Terminal didn't open", body: plainError(e), level: "error" });
      }
      this.busy = false;
      cx.notify();
    });
  }

  // ⋯ (App 02): the task row's own menu (mods/tasks-menu "row": Pin / Unpin in shared "tasks.pinned", keyed as the
  // Tasks list keys it, "<machine, empty here>:<folder>#<id>"), at the pointer as the row's right-click opens it.
  moreButton(t) {
    const r = this.rec, key = `${r.machine ?? ""}:${r.folder}#${r.id}`;
    const pins = Array.isArray(shared("tasks.pinned")) ? shared("tasks.pinned") : [];
    const on = pins.includes(key);
    return h_flex().id("thread-more").size(24).flex_none().items_center().justify_center().rounded(RADIUS.control).cursor_pointer()
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(on ? "Pinned" : "More")
      .on_click((_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "tasks-menu", kind: "popup", at: "pointer", width: 160, height: 8 + 32, props: { menu: "row", key, on } });
      })
      .child(svg("mods/tasks/more.svg").size(14).flex_none());
  }

  // Stop (App 02): ends the task's worker, as an agent pane's × does (pane-chat: terminal.kill), asked first in its
  // place (this.ending). The task stays; its chat offers Resume.
  stopButton() {
    const label = h_flex().gap(6).items_center()
      .child(svg("mods/chat/stop-chip.svg").size(8).flex_none().text_color(red()))
      .child("Stop");
    return button("thread-stop", label, { onClick: () => { this.ending = true; } });
  }

  endWorker(addr, cx) {
    this.ending = false;
    if (addr) run("terminal.kill", { terminal: addr });
    cx.spawn(async (cx) => this.loadTask(addr, cx));
  }

  // A pill on the banner (App 02 .chip): a dark well with a faint edge; with onClick, a hover.
  pill(id, label, t, { icon = null, onClick = null, tip = null } = {}) {
    const d = isDark();
    return h_flex().id(id).h(24).px(9).gap(6).flex_none().items_center().rounded(7).whitespace_nowrap()
      .bg(d ? "#00000059" : t.background).border_1().border_color(d ? "#FFFFFF17" : t.border)
      .text_size(11.5).font_medium().text_color(t.muted)
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .when(Boolean(onClick), (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); }))
      .when(Boolean(icon), (el) => el.child(svg(icon).size(12).flex_none()))
      .child(label);
  }

  // Chat | Terminal | Files | Changes | Pull request | Browser: the main chat's header switch
  // (ui.js pillTabs: its pill slides to the shown one). segs: { key, label, on, dead (can't open now), tip, fn }.
  switcher(t, segs) {
    this.tabSizes ??= new Map();
    return pillTabs("thread-mode", segs.map((x) => [x.key, x.label, { disabled: x.dead, tip: x.tip }]),
      segs.find((x) => x.on)?.key ?? null, (v, _e, cx) => segs.find((x) => x.key === v)?.fn(cx), this.tabSizes);
  }

  render(cx) {
    return this.head ? this.renderHead(cx) : this.renderBody(cx);
  }

  // The body: the worker's chat (its terminal is the layout's own block beside it).
  renderBody(cx) {
    const want = shared("tasks.thread") ?? null;
    if (wantId(want) !== wantId(this.cur) && !this.swapping) {
      this.swapping = true;
      cx.timer.after(0, (cx) => cx.spawn(async (cx) => this.swap(want, cx)));
    }
    // The model picker's Restart (shared "chat.restartreq"): a nested view isn't drawn again
    // when shared state changes, so the chat is asked to; it checks whether it's for it.
    const rr = shared("chat.restartreq");
    if (this.entity && rr?.at && rr.at !== this.restartReqAt) {
      this.restartReqAt = rr.at;
      const e = this.entity;
      cx.timer.after(0, (cx) => cx.notify(e));
    }
    const t = theme();
    return this.entity
      ? v_flex().id("task-thread").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13).child(this.entity)
      : v_flex().id("task-thread").size_full().items_center().justify_center().px(18).bg(t.background).text_size(TEXT.label).text_color(t.dim)
        .child(want?.note ?? (want ? "Opening…" : "Pick a task to see its chat."));
  }

  // What its agent is doing now (herdr-task status) or a provider retry's line: App 02's hint at the switcher's right,
  // its spinner while it works, dim and still while it waits on the person (the minutes are the progress pill's).
  // It gives way first: the switcher keeps its width.
  reportHint(st, t) {
    const r = this.rec, addr = this.cur?.terminal;
    if (!r || r.state !== "running") return null;
    let text = null, paused = false;
    if (r.retry && r.retry.address === addr && !r.retry.over && st !== "blocked") text = retryLine(r.retry);
    else if (r.progress?.text) { text = r.progress.text; paused = st !== "working"; }
    if (!text) return null;
    return h_flex().id("thread-report").flex_1().min_w(0).gap(6).justify_end().items_center()
      .font_family(ID_FONT).text_size(TEXT.id).text_color(paused ? t.dim : t.muted)
      .when(!paused, (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(working()).spin(900)))
      .child(div().min_w(0).truncate().child(text));
  }

  renderHead(cx) {
    const want = shared("tasks.thread") ?? null;
    if (wantId(want) !== wantId(this.cur)) {
      this.cur = want;
      this.rec = null;
      this.ending = false;
      cx.timer.after(0, (cx) => cx.spawn(async (cx) => this.loadTask(want?.terminal, cx)));
    }
    // The task's record, again every 3 s while a worker shows (12 s on another machine).
    if (!this.polling) {
      this.polling = true;
      cx.timer.every(3000, (cx) => {
        const addr = this.cur?.terminal, key = this.cur?.key;
        const remote = addr ? addr.includes("/") : Boolean(key?.machine);
        if ((addr || key) && (!remote || ++this.ticks % 4 === 0)) cx.spawn(async (cx) => this.loadTask(addr, cx));
        // Its minutes left count down: a redraw every 30 s while it reports some.
        if (this.rec?.progress && (this.redraws = (this.redraws ?? 0) + 1) % 10 === 0) cx.notify();
      });
    }
    const t = theme();
    const addr = want?.terminal ?? null;
    const k = addr ? terminals().find((x) => x.address === addr) : null;
    const st = addr ? this.status(addr) : null;
    const live = k?.state === "live";
    const term = terminalShown();
    // The worker ended (or none shows) while its terminal was up: back to its chat, which stays to read.
    if (term && !live && !this.busy) cx.timer.after(0, () => showWorkerChat());
    // The chat's own way to the terminal (requestWorkerTerminal()).
    const rq = shared("tasks.thread.termreq");
    if (rq && rq.at !== this.termReqAt && rq.terminal === addr && live && Date.now() - rq.at < 5000) {
      this.termReqAt = rq.at;
      cx.timer.after(0, (cx) => this.toTerminal(addr, cx));
    }
    // The second row, one switcher: Chat, Terminal (dim when the worker has ended), then the task's own views.
    const shownNow = this.busy ? TERM : find(layout(), BODY)?.active ?? CHAT;
    const pick = (child) => () => run("layout.select", { stack: BODY, child });
    const hasPr = Boolean(this.rec?.pr) || (addr && shared("tasks.thread.pr")?.terminal === addr);
    // Pull request only once the task has one; shown while it lost it, back to its chat.
    if (shownNow === PR && !hasPr && this.rec) cx.timer.after(0, () => showWorkerChat());
    const segs = [
      { key: "chat", label: "Chat", on: shownNow === CHAT, fn: () => showWorkerChat() },
      { key: "term", label: "Terminal", on: shownNow === TERM, dead: !live, tip: live ? null : "Not running", fn: (cx) => this.toTerminal(addr, cx) },
      { key: "files", label: "Files", on: shownNow === FILES, fn: pick(FILES) },
      { key: "changes", label: "Changes", on: shownNow === CHANGES, fn: pick(CHANGES) },
      ...(hasPr ? [{ key: "pr", label: "Pull request", on: shownNow === PR, fn: pick(PR) }] : []),
      // The task's own browser, watched live (mods/task-browser), when the layout has it.
      ...(find(layout(), BROWSER) && addonOn("browser") ? [{ key: "browser", label: "Browser", on: shownNow === BROWSER, fn: pick(BROWSER) }] : []),
    ];
    // Two rows on one left edge (EDGE), Doop App 02: the banner (‹ Tasks and the task's controls over its dot, title
    // and line), then the switcher with what its agent is doing at the right. BANNER_H + VIEWS_H + the border are the
    // "tasks-thread-head" block's size in layouts/shepherdr.json (133): keep them in step.
    return v_flex().id("thread-head-rows").size_full().bg(t.background).border_b(1).border_color(t.border)
      // Its width, for the pills that give way (measured zoomed: unzoomed here).
      .on_size_change((size, cx) => {
        const w = size.width / (Number(settings()?.zoom) || 1);
        if (Math.abs((this.width ?? 0) - w) > 0.5) { this.width = w; cx.notify(); }
      })
      .child(this.banner(t, { want, st, addr, live, hasPr, openPr: pick(PR) }))
      .child(h_flex().id("thread-views").h(VIEWS_H).flex_none().px(EDGE).gap(10).items_center()
        .child(h_flex().id("thread-views-scroll").min_w(0).overflow_x_scroll().child(this.switcher(t, segs)))
        .child(this.reportHint(st, t) ?? div()));
  }

  // The banner (App 02 .bn.half .hd): the wash and dots of the task's state in dark (light keeps the plain header).
  // Its top row: ‹ Tasks back to the list (its chevron on the shared edge, its hover reaching past it), the task's own
  // base, then its progress and pull request pills, Accept (Ready) or Stop (a live worker), and ⋯; Stop's question
  // and its two buttons in their place while it asks. Under it the task: its dot (as its Tasks row, Needs you with
  // its halo), the title in the serif and its line. No agent logo: the chat input's model button says which agent.
  banner(t, { want, st, addr, live, hasPr, openPr }) {
    const r = this.rec, w = this.width ?? Infinity, s = this.stateOf(st, addr);
    const tone = isDark() ? BANNER[s] ?? "neutral" : null;
    const progress = r && s ? progressPill(reportOf(r, s, ownProgress([addr]))) : null;
    // The task's PR (its record's), else the one the Pull request view found for its branch; merged once it is.
    const pr = r ? prPill(r.pr ?? (hasPr ? shared("tasks.thread.pr") : null), r.merged ? "merged" : null) : null;
    const accept = this.acceptable(st, addr);
    const stop = Boolean(r && r.state === "running" && live && !accept);
    if (this.ending && !stop) this.ending = false;
    const last = r?.agents?.[r.agents.length - 1];
    const ask = endAgent(NAMES[last?.agent] ?? "the agent");
    const base = r?.base_set && r?.base ? r.base : null;
    const bar = h_flex().id("thread-bar").h(24).flex_none().pl(EDGE - 6).pr(EDGE).gap(6).items_center()
      .child(h_flex().id("thread-back").h(24).pl(2).pr(8).gap(2).flex_none().items_center().rounded(RADIUS.control).cursor_pointer()
        .text_size(TEXT.label).text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); backToTasks(); })
        .child(svg("mods/workspace-chrome/chevron-left.svg").size(14).flex_none())
        .child("Tasks"))
      // A task's own base (herdr-task add --base), where it merges into; the folder's default isn't shown. It gives way first.
      .child(h_flex().flex_1().min_w(0).justify_end()
        .when(Boolean(base) && !this.ending, (el) => el.child(div().id("thread-base").min_w(0).truncate().pr(2)
          .text_size(TEXT.label).text_color(t.muted).tooltip(`Merges into ${base}`).child(`→ ${base}`))))
      .when(this.ending, (el) => el
        .child(div().flex_none().whitespace_nowrap().text_size(TEXT.label).text_color(t.foreground).child(ask.ask))
        .child(button("thread-end-no", ask.cancel, { kind: "plain", onClick: () => { this.ending = false; } }))
        .child(button("thread-end", ask.verb, { kind: "primary", onClick: (_e, cx) => this.endWorker(addr, cx) })))
      .when(!this.ending, (el) => el
        .when(Boolean(progress) && w >= PROGRESS_PILL_W, (el) => el.child(this.pill("thread-progress", progress, t)))
        .when(Boolean(pr) && w >= PR_PILL_W, (el) => el.child(this.pill("thread-pr", pr, t,
          { icon: "mods/task-pr/git-pull-request.svg", onClick: () => openPr(), tip: "Pull request" })))
        // Accept: the header's one primary button (merges first when there's something to merge).
        .when(accept, (el) => el.child(button("thread-accept", this.accepting ? "Accepting…" : "Accept",
          { kind: "primary", disabled: this.accepting, onClick: (_e, cx) => this.accept(cx) })))
        .when(stop, (el) => el.child(this.stopButton()))
        // Not an archived task's (as its row in the list).
        .when(Boolean(r && !(r.archived && r.state === "done")), (el) => el.child(this.moreButton(t))));
    const title = want?.title ?? r?.title ?? "";
    // "SHE-12 · work/12-usage-popover · Opus 5.5 · High · Default": what its agent was started on (left out when
    // its argv doesn't say), and the Claude account when there's more than one. Both lines keep their height.
    const line = taskLine({ ref: want?.task ?? r?.ref, branch: r?.branch, ...runsOn(last), account: accountName(r) });
    const task = h_flex().id("thread-task").flex_none().px(EDGE).gap(10).items_start().text_color(t.foreground)
      .child(h_flex().w(16).h(24).flex_none().items_center().justify_center().child(this.dot(st, addr)))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().h(24).min_w(0).items_center()
          .child(div().id("thread-title").min_w(0).truncate()
            .when(isDark(), (el) => el.font_family(SERIF).text_size(HEAD.title))
            .when(!isDark(), (el) => el.text_size(TEXT.title).font_medium())
            .when(Boolean(title), (el) => el.tooltip(title)).child(title)))
        .child(div().h(14).min_w(0).truncate().font_family(ID_FONT).text_size(TEXT.id).text_color(t.muted).child(line)));
    return v_flex().id("thread-banner").relative().overflow_hidden().w_full().h(BANNER_H).flex_none().pt(8).pb(12).gap(8)
      .when(Boolean(tone), (el) => el.bg(bannerBg(tone)).child(bannerDots(tone)).border_b(1).border_color(t.border))
      .child(bar)
      .child(task);
  }
}
