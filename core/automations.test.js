import { expect, test } from "bun:test";
import { recentWakes, spaceWord, autoMeta, clock, agoWords } from "./automations.js";

const NOW = new Date(2026, 10, 4, 12, 0).getTime();

test("recent wakes: every space's, newest first, named as the screens name spaces", () => {
  const file = { spaces: {
    s1: { name: "shepherdr", wakes: [{ at: NOW - 3e5, reason: "schedule", outcome: "Turn ended, progress saved" }, { at: NOW - 1e5, reason: "ready", outcome: "Delivered" }] },
    s2: { name: "~", folder: "/h", wakes: [{ at: NOW - 2e5, reason: "schedule", outcome: "Turn ended" }] },
    s3: { folder: "/h/code/app/", wakes: [{ reason: "no time" }] },
  } };
  const w = recentWakes(file, 6, "/h");
  expect(w.map((x) => [x.space, x.reason])).toEqual([["shepherdr", "ready"], ["Home", "schedule"], ["shepherdr", "schedule"]]);
  expect(recentWakes(file, 1, "/h").length).toBe(1);
  expect(recentWakes(null)).toEqual([]);
  expect(spaceWord({ folder: "/h/code/app/" }, "/h")).toBe("app");
});

test("an automation's line: a failure, its last run and task, or not yet", () => {
  expect(autoMeta({ last_error: { message: "No agent" }, last_run: NOW })).toEqual({ tone: "error", words: "No agent" });
  expect(autoMeta({ last_run: NOW - 3600e3, last_task: "HAT-4" }, NOW)).toEqual({ tone: "done", words: "Ran 1h ago · added HAT-4" });
  expect(autoMeta({ last_run: NOW - 10e3 }, NOW).words).toBe("Ran just now");
  expect(autoMeta({}).words).toBe("Hasn't run yet");
  expect(agoWords(NOW - 3 * 86400e3, NOW)).toBe("3d ago");
});

test("a wake's time: the clock today, the weekday before", () => {
  expect(clock(new Date(2026, 10, 4, 9, 5).getTime(), new Date(NOW))).toBe("09:05");
  expect(clock(new Date(2026, 10, 2, 22, 0).getTime(), new Date(NOW))).toBe("Mon 22:00");
});
