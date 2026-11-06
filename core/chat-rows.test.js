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
  focused: none, props: () => ({}), run: none, theme: () => ({}), home: () => "/nohome", hc: async () => ({ stdout: "" }),
  exec: async (cmd, args) => { ran.push([cmd, ...args]); return runs(cmd, args); }, shared: none, setShared: none, watchFolder: async () => {},
  window: () => ({ platform }),
  settings: () => ({}), playSound: none, notify: none, appHome: () => "/noapp", readTextFile: async () => "", writeTextFile: async () => {},
  nextCommand: () => new Promise(() => {}), openOverlay: none, knownAgents: list, terminals: list, spaces: list, panes: list,
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
  c.records = lines.map((l) => { const r = { off, kind: "J", data: JSON.stringify(l) }; off += r.data.length + 1; return r; });
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
});
