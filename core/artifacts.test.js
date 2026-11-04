import { expect, test } from "bun:test";
import { byTask, shortTitle, listLine, NO_TASK } from "./artifacts.js";

const items = [
  { id: "a", task: "SHE-12", title: "SHE-12: Usage popover", at: 10 },
  { id: "b", title: "Notes", at: 50 },
  { id: "c", task: "SHE-13", title: "SHE-13: Meter states", at: 30 },
  { id: "d", task: "SHE-12", title: "SHE-12: Review notes", at: 40 },
];

test("artifacts group by their task, the newest task first, those from no task last", () => {
  const g = byTask(items);
  expect(g.map((x) => x.task)).toEqual(["SHE-12", "SHE-13", null]);
  expect(g[0].items.map((a) => a.id)).toEqual(["d", "a"]);
  expect(byTask([])).toEqual([]);
  expect(typeof NO_TASK).toBe("string");
});

test("a title drops its task under that task's heading", () => {
  expect(shortTitle(items[0])).toBe("Usage popover");
  expect(shortTitle(items[1])).toBe("Notes");
  expect(shortTitle({ task: "SHE-1", title: "she-1: lower case" })).toBe("lower case");
  expect(shortTitle({ task: "SHE-1", title: "Other" })).toBe("Other");
});

test("the header's line counts artifacts and the tasks that made them", () => {
  expect(listLine("shepherdr", items)).toBe("shepherdr · 4 from 2 tasks");
  expect(listLine("shepherdr", [items[1]])).toBe("shepherdr · 1 artifact");
  expect(listLine("shepherdr", [])).toBe("shepherdr");
});
