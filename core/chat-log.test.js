import { expect, test } from "bun:test";
import { Conversation } from "./chat-log.js";

const J = (off, obj) => ({ off, kind: "J", data: JSON.stringify(obj) });
const launch = (off, id, desc) => [
  J(off, { isSidechain: false, type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: "Agent", input: { description: desc } }] }, timestamp: new Date().toISOString() }),
  { off: off + 1, kind: "R", data: ` ${id} ASYNC` },
];
const note = (id) => `<task-notification>\n<task-id>x</task-id>\n<tool-use-id>${id}</tool-use-id>\n<status>completed</status>\n</task-notification>`;

test("a helper is done when its notification comes as a user line or queued mid-turn", () => {
  const c = new Conversation("claude");
  c.feed([
    ...launch(1, "toolu_a", "Idle finish"),
    ...launch(3, "toolu_b", "Mid-turn finish"),
  ]);
  expect(c.running().map((h) => h.desc)).toEqual(["Idle finish", "Mid-turn finish"]);
  c.feed([
    J(10, { isSidechain: false, type: "user", origin: { kind: "task-notification" }, message: { role: "user", content: note("toolu_a") } }),
    J(11, { isSidechain: false, type: "attachment", attachment: { type: "queued_command", prompt: note("toolu_b") } }),
  ]);
  expect(c.running()).toEqual([]);
});
