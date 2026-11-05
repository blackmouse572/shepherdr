import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// a throwaway app home: never the real data/chat-asks
const home = mkdtempSync(join(tmpdir(), "shep-asks-"));
process.env.HERDR_APP_HOME = home;
const dir = join(home, "data", "chat-asks");
for (const d of ["req", "ans", "end", "open"]) mkdirSync(join(dir, d), { recursive: true });
const { Asks } = await import("./asks.ts");
const { Compat } = await import("./compat.ts");

const put = (id: string, req: unknown) => writeFileSync(join(dir, "req", `${id}.json`), JSON.stringify(req));

test("a permission becomes a card, and Allow answers the hook as the window's card does", () => {
  put("t5.100.1", { tool_name: "Bash", tool_input: { command: "npm test", description: "Run the tests" }, cwd: "/x" });
  const asks = new Asks();
  asks.start();
  expect(asks.of("t5").length).toBe(1);
  const q = new Compat().question(asks.of("t5")[0], "p:sp1");
  expect(q).toMatchObject({ title: "Run: npm test", kind: "Question", choices: [{ label: "Allow" }, { label: "Deny" }] });
  asks.answer("t5.100.1", { choice: 0 });
  expect(JSON.parse(readFileSync(join(dir, "ans", "t5.100.1.json"), "utf8")).hookSpecificOutput.decision.behavior).toBe("allow");
  expect(readFileSync(join(dir, "end", "t5.100.1"), "utf8")).toBe("Allowed on the web\n");
  expect(asks.of("t5").length).toBe(0);
});

test("a question's pick goes back as its answer; a plan sent back says why", () => {
  put("t6.100.1", { tool_name: "AskUserQuestion", tool_input: { questions: [{ question: "Which color?", header: "Color", options: [{ label: "Red (Recommended)" }, { label: "Blue" }] }] } });
  put("t7.100.1", { tool_name: "ExitPlanMode", tool_input: { plan: "1. Do it" } });
  const asks = new Asks();
  asks.start();
  const q = new Compat().question(asks.of("t6")[0], "x/worker");
  expect(q.choices.map((c) => c.label)).toEqual(["Red", "Blue"]);
  asks.answer("t6.100.1", { choice: 1 });
  const a = JSON.parse(readFileSync(join(dir, "ans", "t6.100.1.json"), "utf8"));
  expect(a.hookSpecificOutput.decision.updatedInput.answers).toEqual({ "Which color?": "Blue" });
  asks.answer("t7.100.1", { choice: 1 });
  const p = JSON.parse(readFileSync(join(dir, "ans", "t7.100.1.json"), "utf8"));
  expect(p.hookSpecificOutput.decision).toMatchObject({ behavior: "deny" });
  expect(() => asks.answer("t7.100.1", { choice: 0 })).toThrow();
  expect(existsSync(join(dir, "end", "t7.100.1"))).toBe(true);
});

test("several questions: one card with a part for each, answered all at once in order", () => {
  put("t9.100.1", { tool_name: "AskUserQuestion", tool_input: { questions: [
    { question: "Which color?", header: "Color", options: [{ label: "Red (Recommended)" }, { label: "Blue" }] },
    { question: "Which sizes?", header: "Size", multiSelect: true, options: [{ label: "S" }, { label: "M" }] }] } });
  const asks = new Asks();
  asks.start();
  const q = new Compat().question(asks.of("t9")[0], "p:sp1");
  expect(q).toMatchObject({ title: "2 questions", parts: [{ title: "Which color?", header: "Color", choices: [{ label: "Red", recommended: true }, { label: "Blue" }] }, { title: "Which sizes?", multi: true }] });
  expect(() => asks.answer("t9.100.1", { answers: ["Red"] })).toThrow();
  asks.answer("t9.100.1", { answers: ["Red", "S, M"] });
  const out = JSON.parse(readFileSync(join(dir, "ans", "t9.100.1.json"), "utf8")).hookSpecificOutput.decision;
  expect(out.updatedInput.answers).toEqual({ "Which color?": "Red", "Which sizes?": "S, M" });
});

test("Always in this space keeps the ask's rule for its agent's space, then allows it; Deny stays choice 1", () => {
  put("t21.100.1", { tool_name: "Bash", tool_input: { command: "npm test" }, cwd: "/x" });
  put("t22.100.1", { tool_name: "Bash", tool_input: { command: "npm test" }, cwd: "/x" });
  const asks = new Asks();
  asks.spaceOf = (t) => (t === "t21" ? { id: "sp1" } : null);
  // never ~/.herdr/shepherdr.json
  const kept: any[] = [];
  asks.keep = (sp, rule) => { kept.push({ space: sp.id, rule }); };
  asks.start();
  const c = new Compat();
  c.asks = asks;
  expect(c.question(asks.of("t21")[0], "p:sp1").choices.map((x: any) => x.label)).toEqual(["Allow", "Deny", "Always in this space"]);
  // no space: no rule to keep, and no way to ask for one
  expect(c.question(asks.of("t22")[0], "x").choices.map((x: any) => x.label)).toEqual(["Allow", "Deny"]);
  expect(() => asks.answer("t22.100.1", { choice: 2 })).toThrow();
  asks.answer("t21.100.1", { choice: 2 });
  expect(JSON.parse(readFileSync(join(dir, "ans", "t21.100.1.json"), "utf8")).hookSpecificOutput.decision.behavior).toBe("allow");
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ space: "sp1", rule: { tool: "Bash" } });
});
