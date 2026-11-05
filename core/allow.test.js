import { expect, test } from "bun:test";
import { plainWords, ruleOf, cleanRule, matches, findRule, ruleWords, rulesIn, allRules, withRule, withoutRule, sameRule } from "./allow.js";

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

test("a plain command's words; anything more is no plain command", () => {
  expect(plainWords("npm test -- --watch")).toEqual(["npm", "test", "--", "--watch"]);
  expect(plainWords(`git commit -m "a b" 'c d'`)).toEqual(["git", "commit", "-m", "a b", "c d"]);
  for (const s of ["npm test; rm -rf /", "npm test && curl x", "npm test | sh", "echo $(id)", "echo `id`", "ls > f", "a\nb", `echo "$HOME"`, ""]) {
    expect(plainWords(s)).toBe(null);
  }
});

test("an ask's rule is exactly what it asked", () => {
  expect(ruleOf(bash("npm test"))).toEqual({ tool: "Bash", prefix: ["npm", "test"] });
  expect(ruleOf(bash("npm test | tee log"))).toEqual({ tool: "Bash", command: "npm test | tee log" });
  expect(ruleOf({ tool_name: "Edit", tool_input: { file_path: "/r/a.js" } })).toEqual({ tool: "Edit", path: "/r/a.js" });
  expect(ruleOf({ tool_name: "WebFetch", tool_input: { url: "https://x.dev/a" } })).toEqual({ tool: "WebFetch", url: "https://x.dev/a" });
  expect(ruleOf({ tool_name: "mcp__github__create_issue", tool_input: { title: "t" } })).toEqual({ tool: "mcp__github__create_issue" });
  expect(ruleOf({ tool_name: "ExitPlanMode", tool_input: { plan: "p" } })).toBe(null);
  expect(ruleOf({ tool_name: "AskUserQuestion", tool_input: {} })).toBe(null);
  expect(ruleOf({ tool_name: "Edit", tool_input: {} })).toBe(null);
  expect(ruleOf(bash("  "))).toBe(null);
});

test("a rule matches the exact tool and command prefix, never more", () => {
  const r = ruleOf(bash("npm test"));
  expect(matches(r, bash("npm test"))).toBe(true);
  expect(matches(r, bash("npm  test --watch"))).toBe(true);
  expect(matches(r, bash("npm testx"))).toBe(false);
  expect(matches(r, bash("npm"))).toBe(false);
  expect(matches(r, bash("npm test; rm -rf ~"))).toBe(false);
  expect(matches(r, bash("npm test && curl evil"))).toBe(false);
  expect(matches(r, { tool_name: "BashOutput", tool_input: { command: "npm test" } })).toBe(false);
  const exact = ruleOf(bash("npm test | tee log"));
  expect(matches(exact, bash("npm test | tee log"))).toBe(true);
  expect(matches(exact, bash("npm test | tee log; rm x"))).toBe(false);
  const file = { tool: "Edit", path: "/r/a.js" };
  expect(matches(file, { tool_name: "Edit", tool_input: { file_path: "/r/a.js" } })).toBe(true);
  expect(matches(file, { tool_name: "Edit", tool_input: { file_path: "/r/b.js" } })).toBe(false);
  expect(matches(file, { tool_name: "Write", tool_input: { file_path: "/r/a.js" } })).toBe(false);
  // A broken or hand-made broad rule answers nothing.
  expect(matches({ tool: "Bash" }, bash("ls"))).toBe(false);
  expect(matches({ tool: "Edit" }, { tool_name: "Edit", tool_input: { file_path: "/r/a.js" } })).toBe(false);
  expect(matches({ tool: "ExitPlanMode" }, { tool_name: "ExitPlanMode", tool_input: {} })).toBe(false);
  expect(cleanRule({ tool: "Bash", prefix: [] })).toBe(null);
  const app = { tool: "mcp__github__create_issue" };
  expect(matches(app, { tool_name: "mcp__github__create_issue", tool_input: { title: "x" } })).toBe(true);
  expect(matches(app, { tool_name: "mcp__github__delete_repo", tool_input: {} })).toBe(false);
  expect(findRule([file, r], bash("npm test -s"))).toEqual(r);
  expect(findRule([], bash("npm test"))).toBe(null);
});

test("rules live under their space in shepherdr.json", () => {
  const r = ruleOf(bash("npm test"));
  let cfg = withRule({ everywhere: { worker: "x" } }, "sp1", r, { name: "Web" }, 7);
  expect(cfg.spaces.sp1).toEqual({ name: "Web", allow: [{ tool: "Bash", prefix: ["npm", "test"], at: 7 }] });
  cfg = withRule(cfg, "sp1", { ...r }, {}, 8);
  expect(rulesIn(cfg, "sp1").length).toBe(1);
  expect(rulesIn(cfg, "sp2")).toEqual([]);
  expect(allRules(cfg)).toEqual([{ space: "sp1", name: "Web", rule: { tool: "Bash", prefix: ["npm", "test"], at: 7 } }]);
  expect(sameRule(rulesIn(cfg, "sp1")[0], r)).toBe(true);
  cfg = withoutRule(cfg, "sp1", r);
  expect(cfg.spaces.sp1).toEqual({ name: "Web" });
  expect(cfg.everywhere).toEqual({ worker: "x" });
  expect(ruleWords(r)).toBe("Run: npm test …");
  expect(ruleWords({ tool: "Edit", path: "/r/a.js" })).toBe("Edit /r/a.js");
  expect(ruleWords({ tool: "Bash", command: "a | b" })).toBe("Run exactly: a | b");
});
