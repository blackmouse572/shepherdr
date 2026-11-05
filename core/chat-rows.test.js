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
