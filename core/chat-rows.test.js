import { expect, mock, test } from "bun:test";
import { join } from "node:path";
import { proseMetrics } from "./reading.js";

// The window's chat (mods/chat/main.js) loaded without Herdr: its host modules stubbed. Elements take any style;
// a handler (on_*) registered while the list's item renderer runs throws, as Herdr's does ("cannot be registered
// from a virtual list's item renderer"), and the list then draws nothing: the chat goes blank.
let inRenderer = false;
const sized = [];
const el = () => {
  const self = new Proxy(function () {}, {
    get: (_t, k) => (k === "then" ? undefined : (...a) => {
      if (k === "when") return a[0] ? a[1](self) : self;
      if (typeof k === "string" && k.startsWith("on_")) {
        if (inRenderer) throw new Error(`\`${k}\` cannot be registered from a virtual list's item renderer`);
        if (k === "on_size_change") sized.push(a[0]);
      }
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
  exec: async () => ({ stdout: "", stderr: "" }), shared: none, setShared: none, watchFolder: async () => {}, window: () => ({}),
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
