import { describe, expect, test } from "bun:test";
import { modelLabel, runsOn } from "./agents.js";

describe("what a task's agent runs on (the task header's line)", () => {
  test("Claude's aliases by its menu, ids by modelName", () => {
    expect(modelLabel("opus")).toBe("Opus 5.5");
    expect(modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(modelLabel("gpt-5")).toBe("gpt-5");
    expect(modelLabel(null)).toBe(null);
  });

  test("model and effort from the agent's argv", () => {
    expect(runsOn({ agent: "claude", argv: ["claude", "--model", "opus", "--effort", "high"] })).toEqual({ model: "Opus 5.5", effort: "High" });
    expect(runsOn({ agent: "codex", argv: ["codex", "-m", "gpt-5", "-c", 'model_reasoning_effort="medium"'] })).toEqual({ model: "gpt-5", effort: "Medium" });
  });

  test("left out when the argv doesn't say, or the agent isn't known", () => {
    expect(runsOn({ agent: "claude", argv: ["claude"] })).toEqual({ model: null, effort: null });
    expect(runsOn({ agent: "claude", argv: ["claude", "--effort", "xhigh"] })).toEqual({ model: null, effort: "Extra high" });
    expect(runsOn({ agent: "gemini", argv: ["gemini", "--model", "x"] })).toEqual({ model: null, effort: null });
    expect(runsOn(null)).toEqual({ model: null, effort: null });
  });
});
