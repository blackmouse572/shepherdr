import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { proseMetrics } from "./reading.js";

// The window's chat (mods/chat/main.js) loaded without Herdr: its host modules stubbed. Elements take any style;
// a handler (on_*) registered while the list's item renderer runs throws, as Herdr's does ("cannot be registered
// from a virtual list's item renderer"), and the list then draws nothing: the chat goes blank.
let inRenderer = false;
const sized = [];
// The words rows draw (strings handed to child()), and the commands run (exec).
const drawn = [];
const ran = [];
let platform = "macos", runs = () => ({ code: 0, stdout: "", stderr: "" });
// Herdr's terminals, and the commands run (run()), as a test sets them.
let terms = [], runner = () => null;
const el = () => {
  const self = new Proxy(function () {}, {
    get: (_t, k) => (k === "then" ? undefined : (...a) => {
      if (k === "when") return a[0] ? a[1](self) : self;
      if (typeof k === "string" && k.startsWith("on_")) {
        if (inRenderer) throw new Error(`\`${k}\` cannot be registered from a virtual list's item renderer`);
        if (k === "on_size_change") sized.push(a[0]);
      }
      if (k === "child" && typeof a[0] === "string") drawn.push(a[0]);
      return self;
    }),
    apply: () => el(),
  });
  return self;
};
const none = () => null, list = () => [];
const host = {
  View: class {}, div: el, svg: el, image: el, PathBuilder: el(), Background: el(),
  v_flex: el, h_flex: el, TextareaState: { new: el }, Textarea: el(), Scrollbar: el(), VirtualListScrollHandle: { new: el },
  TextView: el(), v_virtual_list: el, InputState: { new: el }, Input: el(),
  focused: none, props: () => ({}), run: (...a) => runner(...a), theme: () => ({}), home: () => "/nohome", hc: async () => ({ stdout: "" }),
  exec: async (cmd, args) => { ran.push([cmd, ...args]); return runs(cmd, args); }, shared: none, setShared: none, watchFolder: async () => {},
  window: () => ({ platform }),
  settings: () => ({}), playSound: none, notify: none, appHome: () => "/noapp", readTextFile: async () => "", writeTextFile: async () => {},
  nextCommand: () => new Promise(() => {}), openOverlay: none, knownAgents: list, terminals: () => terms, spaces: list, panes: list,
  agents: list, machines: list, layout: none,
};
for (const m of ["gpui-kit", "gpui-base", "herdr"]) mock.module(m, () => host);

// A chat showing a conversation, without init(): the state rows() and row() read.
async function chat(lines) {
  const { default: Chat } = await import(join(import.meta.dir, "../mods/chat/main.js"));
  const c = Object.create(Chat.prototype);
  Object.assign(c, { kind: "claude", start: 0, replied: [], pending: [], note: null, opened: new Set(), shut: new Set(), unfolded: new Set(),
    natural: new Map(), results: new Map(), asks: [], sasks: [], wasks: [], askEnds: [], tasks: [], width: 700, views: {}, queue: [], files: [],
    rd: proseMetrics(null), codeRuns: new Map(), myReacts: new Map(), cardW: new Map() });
  let off = 0;
  // { R: "<ids>" }: a tool result's line as LOG sends it (its call ids only).
  c.records = lines.map((l) => { const r = l.R ? { off, kind: "R", data: ` ${l.R}` } : { off, kind: "J", data: JSON.stringify(l) }; off += r.data.length + 1; return r; });
  c.rebuild();
  return c;
}
const asked = (n, questions) => ({ isSidechain: false, type: "assistant", uuid: `u${n}`, timestamp: "2026-11-01T10:00:00Z",
  message: { id: `m${n}`, model: "claude", content: [{ type: "tool_use", id: `tu${n}`, name: "AskUserQuestion", input: { questions } }] } });
const answered = (n, of, questions, answers) => ({ isSidechain: false, type: "user", uuid: `r${n}`, timestamp: "2026-11-01T10:01:00Z",
  toolUseResult: { questions, answers }, message: { role: "user", content: [{ type: "tool_result", tool_use_id: `tu${of}`, content: "answered" }] } });
const typed = (n, text) => ({ isSidechain: false, type: "user", uuid: `p${n}`, timestamp: "2026-11-01T10:02:00Z", message: { role: "user", content: text } });
const said = (n, text) => ({ isSidechain: false, type: "assistant", uuid: `u${n}`, timestamp: "2026-11-01T10:00:00Z",
  message: { id: `m${n}`, model: "claude", content: [{ type: "text", text }] } });

test("a folded long reply draws in the list: its rows register no handlers there", async () => {
  const long = Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of a long reply.`).join("\n\n");
  const c = await chat([said(1, "Short."), said(2, long), said(3, "After.")]);
  const rows = c.rows();
  const folded = rows.filter((r) => r.clip);
  expect(folded.length).toBeGreaterThan(0);
  // As the list's renderer draws the rows on screen (`v<gen>-` ids): none may throw.
  inRenderer = true;
  try {
    for (const r of rows) expect(() => c.row(r, {}, "v0-")).not.toThrow();
  } finally {
    inRenderer = false;
  }
  // The measurer (outside the list) still takes the reply's drawn height, for foldOf().
  sized.length = 0;
  c.row(folded[0], {}, "m-");
  expect(sized.length).toBe(1);
  sized[0]({ width: 600, height: 480 }, { notify() {} });
  expect(c.natural.get(folded[0].id)).toBe(480);
});

test("an answered question's card is as tall as what it draws: every question, wrapped, and each choice picked", async () => {
  const long = "Which of these ways should the importer take when a row's date can't be read, given that the old files mix day-first and month-first dates and some only have a year? ".repeat(3).trim();
  const questions = [
    { question: long, header: "Dates", options: [{ label: "Skip the row" }, { label: "Guess day-first and flag every row it guessed so someone can check them later" }] },
    { question: "Keep the old files?", header: "Files", options: [{ label: "Yes" }, { label: "No" }] },
  ];
  const c = await chat([asked(1, questions), answered(2, 1, questions, { [long]: "Guess day-first and flag every row it guessed so someone can check them later", "Keep the old files?": "Yes" }), said(3, "Done.")]);
  const card = c.rows().find((r) => r.kind === "ask");
  expect(card.closed).toBe("answered");
  drawn.length = 0;
  inRenderer = true;
  try { c.row(card, {}, "v0-"); } finally { inRenderer = false; }
  for (const w of ["Asked you · Answered", long, "Keep the old files?", "Guess day-first and flag every row it guessed so someone can check them later", "Yes"]) expect(drawn).toContain(w);
  // Its height before it's measured: room for the header, both questions (the long one wraps to
  // several lines at the column) and both answers, each at least a line.
  const h = c.guess(card);
  const inner = Math.min(c.width, c.rd.column + 36) - 36 - 26;
  expect(h).toBeGreaterThan(2 * 10 + 16 + Math.ceil((long.length * 6) / inner) * 19 + 19 + 2 * 17);
  // Its height is measured again when its answers come (part of its key).
  const open = { ...card, answers: undefined, closed: undefined };
  expect(c.key(open)).not.toBe(c.key(card));
  expect(c.guess(open)).toBeLessThan(h);
});

test("a file sent with a message is a line of its own under it, and a press on it opens the file", async () => {
  const c = await chat([typed(1, "Look at this\n\n/srv/files/Documents/Q3 report.pdf\n/srv/files/notes/todo.md")]);
  const rows = c.rows();
  expect(rows.find((r) => r.kind === "user").text).toBe("Look at this");
  const files = rows.filter((r) => r.kind === "file");
  expect(files.map((f) => f.name)).toEqual(["Q3 report.pdf", "todo.md"]);
  inRenderer = true;
  try { for (const r of rows) expect(() => c.row(r, {}, "v0-")).not.toThrow(); } finally { inRenderer = false; }
  ran.length = 0;
  c.clickRow(files[0].id, rows, { notify() {}, timer: { after() {} } }, []);
  await Bun.sleep(0);
  expect(ran[0][0]).toBe("sh");
  expect(ran[0]).toContain("/srv/files/Documents/Q3 report.pdf");
  expect(ran[0].join(" ")).toContain('open "$1"');
});

describe("pasting in the box (Cmd+V)", () => {
  const box = (v = "") => ({ v, value() { return this.v; }, replace(t) { this.v += t; }, set_value(t) { this.v = t; }, set_rows() {}, focus() {} });
  const cx = (clip) => {
    const jobs = [];
    return { read_from_clipboard: () => clip, notify() {}, timer: { after() {} }, spawn: (fn) => jobs.push(fn(cx(clip))), jobs };
  };
  const ready = async (x) => { await Promise.all(x.jobs); };

  test("a link goes in as text, with no look for files", async () => {
    const c = await chat([said(1, "Hi.")]);
    c.box = box("see ");
    ran.length = 0;
    const k = cx("https://example.com/a?b=1");
    c.paste(k);
    await ready(k);
    expect(c.box.value()).toBe("see https://example.com/a?b=1");
    expect(ran).toEqual([]);
  });

  test("Finder's copy (its files' names as text) attaches the files instead", async () => {
    const c = await chat([said(1, "Hi.")]);
    c.box = box("");
    runs = (cmd) => (cmd === "osascript" ? { code: 0, stdout: "F\t/srv/files/Desktop/a.png\nF\t/srv/files/Desktop/b.txt\n" } : { code: 0, stdout: "" });
    const k = cx("a.png\rb.txt");
    try { c.paste(k); await ready(k); } finally { runs = () => ({ code: 0, stdout: "", stderr: "" }); }
    expect(c.box.value()).toBe("");
    expect(c.files.map((f) => [f.name, f.image])).toEqual([["a.png", true], ["b.txt", false]]);
  });

  test("an image alone (a screenshot) is attached", async () => {
    const c = await chat([said(1, "Hi.")]);
    c.box = box("");
    runs = (cmd, args) => (cmd === "osascript" ? { code: 0, stdout: `I\t${args[4]}\n` } : { code: 0, stdout: "" });
    const k = cx(undefined);
    try { c.paste(k); await ready(k); } finally { runs = () => ({ code: 0, stdout: "", stderr: "" }); }
    expect(c.files.length).toBe(1);
    expect(c.files[0]).toMatchObject({ image: true, temp: true });
    expect(c.files[0].path).toMatch(/\/data\/chat-attach\/pasted-.*\.png$/);
  });
});

// A card's rows (strips.js) drawn as the list draws them: none may throw (a handler there blanks the list), and each
// strip's estimate is at least what it draws (`lines` of text at `line` px each, plus its padding).
function drawsInList(c, rows) {
  inRenderer = true;
  try { for (const r of rows) expect(() => c.row(r, {}, "v0-")).not.toThrow(); } finally { inRenderer = false; }
}

describe("the Doop cards", () => {
  test("a plan to approve: its banner, its steps numbered, Approve plan and Ask for changes (App 01)", async () => {
    const { AskCards } = await import(join(import.meta.dir, "../mods/chat/cards.js"));
    const { words } = await import("./asks.js");
    const plan = "# Threshold card\n\n1. Add a Switch-above card to Settings › Accounts, with a stepper from 50% to 99%.\n2. Save it as `accounts.switchAbove` in settings.json, default 95.\n3. Draw the threshold as a tick on the status bar meter, so you can see how close the account is.\n\n## Testing\n- bun test";
    const c = await chat([said(1, "Here's my plan.")]);
    const replies = [];
    c.cards = new AskCards({ reply: (a, text) => replies.push(text), toTerminal() {}, chatAbout() {} }, { focus() {} });
    c.asks = [{ id: "a.1793000000.1", words: words({ tool_name: "ExitPlanMode", tool_input: { plan } }) }];
    const rows = c.rows().filter((r) => r.kind === "cardstrip");
    expect(rows.map((r) => r.s.kind)).toEqual(["banner", "step", "step", "step", "controls"]);
    expect(rows[0].s.title).toBe("Claude has a plan to approve");
    expect(rows[2].s.text).toBe("Save it as accounts.switchAbove in settings.json, default 95.");
    expect(rows[4].s.ctls.map((k) => k.label)).toEqual(["Approve plan", "Ask for changes"]);
    drawn.length = 0;
    drawsInList(c, rows);
    for (const w of ["Claude has a plan to approve", "Approve plan", "Ask for changes", "approve", "1", "3"]) expect(drawn).toContain(w);
    // The estimate holds the banner and every step's wrapped lines.
    const inner = Math.min(c.width, c.rd.column + 36) - 36 - 26;
    expect(c.guess(rows[0])).toBeGreaterThanOrEqual(58 + 1);
    for (const r of rows.filter((r) => r.s.kind === "step")) expect(c.guess(r)).toBeGreaterThanOrEqual(Math.ceil((r.s.text.length * 6.5) / (inner - 29)) * 20);
    // A press on Approve plan (where it is drawn: the card's left edge in) approves it.
    c.press = { x: c.edges().left + 1 + 12 + 10 };
    c.clickRow(rows[4].id, c.rows(), { notify() {}, timer: { after() {} }, spawn() {} }, []);
    expect(JSON.parse(replies[0]).hookSpecificOutput.decision.behavior).toBe("allow");
  });

  test("a queued task in its Assistant's chat: a card with what it waits for and how it will run (App 01)", async () => {
    const c = await chat([said(1, "Queued as SHE-15.")]);
    Object.assign(c, { t: { labels: { "herdr.role": "coordinator", "herdr.space": "s1" } }, accepting: new Set() });
    const at = Date.parse("2026-11-01T10:00:30Z");
    c.spaceTasks = [
      { id: 15, ref: "SHE-15", title: "Account switch toast", state: "queued", created: at, space: "s1", reason: "after SHE-12",
        agent: "claude", model: "claude-opus-5-5", effort: "high", set: { review_rounds: 2, merge: "ask" } },
      { id: 16, ref: "SHE-16", title: "Not queued", state: "todo", created: at, space: "s1" },
      { id: 17, ref: "OTH-1", title: "Another space's", state: "queued", created: at, space: "s2" },
    ];
    const rows = c.rows().filter((r) => r.kind === "cardstrip");
    expect(rows.map((r) => r.s.kind)).toEqual(["line", "chips"]);
    expect(rows[0].info).toBe(true);
    expect(rows[1].s.tags.map((g) => g.label)).toEqual(["Queued · after SHE-12", "Claude Code · Opus 5.5 · High", "Review 2 rounds", "Ask before merge"]);
    drawn.length = 0;
    drawsInList(c, rows);
    for (const w of ["SHE-15", "Account switch toast", "Open", "Queued · after SHE-12", "Ask before merge"]) expect(drawn).toContain(w);
    // Narrow, its tags wrap: the estimate has room for every line of them.
    c.width = 260;
    const inner = Math.min(c.width, c.rd.column + 36) - 36 - 26 - 20;
    const wide = rows[1].s.tags.reduce((n, g) => n + g.label.length * 6.3 + 12 + 6, 0);
    expect(c.guess(rows[1])).toBeGreaterThanOrEqual(Math.ceil(wide / inner) * 20);
    // What it was made of, only: nothing set, just why it waits.
    const { queuedChips } = await import("./chat-view.js");
    expect(queuedChips({ reason: "Starts soon" })).toEqual([{ label: "Queued · starts soon" }]);
  });

  const called = (n, name, input, id = `tu${n}`) => ({ isSidechain: false, type: "assistant", uuid: `u${n}`, timestamp: "2026-11-01T10:00:00Z",
    message: { id: `m${n}`, model: "claude", content: [{ type: "tool_use", id, name, input }] } });

  test("the working card: its steps from the newest TodoWrite, done, current and to do, with the time and Stop (App 02)", async () => {
    const todos = [
      { content: "Read the review", activeForm: "Reading the review", status: "completed" },
      { content: "Colour meters amber past the switch tick", activeForm: "Colouring meters", status: "in_progress" },
      { content: "Label the refresh button, then run the tests", activeForm: "Labelling", status: "pending" },
    ];
    const c = await chat([called(1, "TodoWrite", { todos: todos.map((x) => ({ ...x, status: "pending" })) }), called(2, "TodoWrite", { todos })]);
    expect(c.conv.todos.items.map((x) => x.status)).toEqual(["completed", "in_progress", "pending"]);
    expect(c.conv.doing).toBe("Colouring meters");
    drawn.length = 0;
    c.runningCard({}, c.conv.doing, 72, false);
    for (const w of ["Colouring meters", "1:12", "Stop", "esc", ...todos.map((x) => x.content)]) expect(drawn).toContain(w);
    // A long list keeps a window around the current step.
    const { stepRows } = await import("./chat-view.js");
    const many = { items: Array.from({ length: 12 }, (_, i) => ({ text: `Step ${i + 1}`, status: i < 6 ? "completed" : i === 6 ? "in_progress" : "pending" })) };
    const r = stepRows(many);
    expect(r.rows.map((x) => x.text)).toEqual(["Step 6", "Step 7", "Step 8", "Step 9", "Step 10", "Step 11", "Step 12"]);
    expect([r.done, r.more]).toEqual([5, 0]);
    // Every step done: no list under the working line.
    const done = await chat([called(1, "TodoWrite", { todos: todos.map((x) => ({ ...x, status: "completed" })) })]);
    drawn.length = 0;
    done.runningCard({}, "Working", 3, false);
    expect(drawn).not.toContain("Read the review");
  });

  test("a helper's report: a card where it finished, its report read from the log, Peek only with a terminal (App 02)", async () => {
    const report = "2 minor findings: meters ignore the 95% tick, and refresh has no label.";
    const notice = (n, id, text) => ({ isSidechain: false, type: "user", uuid: `n${n}`, timestamp: "2026-11-01T10:05:00Z", origin: { kind: "task-notification" },
      message: { role: "user", content: `<task-notification>\n<tool-use-id>${id}</tool-use-id>\n<status>completed</status>\n<result>${text}</result>\n</task-notification>` } });
    const c = await chat([called(1, "Agent", { description: "Review the diff" }), { R: "tu1" }, called(2, "Task", { description: "Check the tests" }), { R: "tu2 ASYNC" },
      notice(3, "tu2", "All 31 pass."), said(4, "Both helpers are done.")]);
    let rows = c.rows().filter((r) => r.kind === "cardstrip");
    expect(rows.map((r) => r.s.kind)).toEqual(["line", "text", "line", "text"]);
    expect(rows[0].s.title).toBe("Review the diff");
    expect(rows[1].s.text).toBe("Reading its report…");
    expect(rows[3].s.text).toBe("All 31 pass.");
    expect(rows.every((r) => r.info)).toBe(true);
    // No terminal to peek at for Claude Code's own helpers.
    expect(rows[0].s.links).toEqual([]);
    // Its report, read from its result line (without Claude Code's agent id and usage after it).
    const out = c.conv.items.find((x) => x.kind === "helper" && x.call === "tu1").out;
    const line = JSON.stringify({ type: "user", timestamp: "2026-11-01T10:04:00Z", message: { content: [{ type: "tool_result", tool_use_id: "tu1",
      content: [{ type: "text", text: report }, { type: "text", text: "agentId: a1b2 (for resuming)\n<usage>total_tokens: 900</usage>" }] }] } });
    c.path = "/log.jsonl";
    c.log = async (args) => { expect(args.slice(0, 3)).toEqual(["results", "/log.jsonl", String(out)]); return { stdout: `\x1e${out}\n${line}\n` }; };
    const jobs = [];
    const cx = { notify() {}, spawn: (fn) => jobs.push(fn(cx)) };
    c.loadReports(c.conv.items, cx);
    await Promise.all(jobs);
    rows = c.rows().filter((r) => r.kind === "cardstrip");
    expect(rows[1].s.text).toBe(report);
    expect(rows[0].s.sub).toMatch(/^helper · reported /);
    drawn.length = 0;
    drawsInList(c, c.rows());
    for (const w of ["Review the diff", report, "All 31 pass."]) expect(drawn).toContain(w);
    // Its estimate holds its words at the column's width.
    const inner = Math.min(c.width, c.rd.column + 36) - 36 - 26;
    expect(c.guess(rows[1])).toBeGreaterThanOrEqual(Math.ceil((report.length * 6.5) / inner) * 20);
  });

  test("a task reviewer's message is its report card, and Peek opens its terminal (App 02)", async () => {
    const msg = (n, from, text) => ({ isSidechain: false, type: "user", uuid: `p${n}`, timestamp: "2026-11-01T10:06:00Z", message: { role: "user", content: `<hc from="${from}">${text}</hc>` } });
    const long = Array.from({ length: 9 }, (_, i) => `Finding ${i + 1}: something to fix.`).join("\n");
    const c = await chat([msg(1, "t9 review", long), msg(2, "t4 other", "Not a helper.")]);
    c.addr = "t3";
    const live = [{ address: "t9", state: "live", labels: { "herdr.role": "reviewer" } }, { address: "t4", state: "live", labels: {} }];
    terms = live;
    try {
      const rows = c.rows();
      const card = rows.filter((r) => r.kind === "cardstrip");
      expect(card.map((r) => r.s.kind)).toEqual(["line", "text"]);
      expect(card[0].s.title).toBe("review");
      expect(card[0].s.links.map((k) => k.label)).toEqual(["Show more", "Peek"]);
      expect(card[1].s.text.split("\n").length).toBe(6);
      expect(rows.some((r) => r.kind === "brief")).toBe(true);
      drawsInList(c, rows);
      // Peek: the press at its place (the card's right edge in).
      const runs = [];
      runner = (...a) => runs.push(a);
      c.press = { x: c.edges().right - 1 - 12 - 4 };
      c.clickRow(card[0].id, rows, { notify() {}, timer: { after() {} } }, []);
      expect(runs).toEqual([["terminal.peek", { terminal: "t9" }]]);
    } finally { terms = []; runner = () => null; }
  });

  test("a tools row counts its calls as small tags (DS 04)", async () => {
    const { toolCounts } = await import("./chat-log.js");
    expect(toolCounts([{ kind: "read" }, { kind: "read" }, { kind: "run", count: 2 }, { kind: "search" }])).toEqual([["read", 2], ["bash", 2], ["grep", 1]]);
    const c = await chat([called(1, "Read", { file_path: "/a.js" }), called(2, "Bash", { command: "ls" })]);
    drawn.length = 0;
    drawsInList(c, c.rows());
    for (const w of ["read ×1", "bash ×1"]) expect(drawn).toContain(w);
  });
});
