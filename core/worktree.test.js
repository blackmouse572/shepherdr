import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { VIEW_WORDS, CHANGE_WORDS, CHECK_WORDS, PR_STATES, LIST_DIR, dirEntries, markOf, noChanges, againstLine, filesCount } from "./worktree.js";

// The window's task views say what the web app's Files, Changes and Pull request say: the words live here, and the
// mods must still show each of them (word for word), so the two can't drift apart.
const mod = (name) => readFileSync(new URL(`../mods/${name}/main.js`, import.meta.url), "utf8");
const window = ["task-files", "task-changes", "task-pr"].map(mod).join("\n");

describe("the task views' words are the window's", () => {
  test("every word of Files, Changes and Pull request is in the window's mods", () => {
    for (const [k, w] of Object.entries({ ...VIEW_WORDS, ...CHANGE_WORDS, ...CHECK_WORDS, ...PR_STATES })) expect([k, window.includes(w)]).toEqual([k, true]);
  });
  test("the templated lines read as the window's", () => {
    expect(noChanges("main")).toBe("No changes against main");
    expect(noChanges(null)).toBe("No uncommitted changes");
    expect(againstLine("main")).toBe("Against main");
    expect(againstLine(null)).toBe("Uncommitted");
    expect(filesCount(1)).toBe("1 file");
    expect(filesCount(1200)).toBe("1,200 files");
    expect(window).toContain("No changes against ${this.vs.label}");
    expect(window).toContain("`Against ${this.vs.label}`");
  });
});

describe("Files lists a folder as the window's", () => {
  test("the same listing script as mods/task-files", () => {
    expect(mod("task-files")).toContain(LIST_DIR.replaceAll("\\0", "\\\\0"));
  });
  test("folders first, then by name", () => {
    expect(dirEntries("f\0b.txt\0d\0src\0f\0a.txt\0")).toEqual([{ name: "src", dir: true }, { name: "a.txt", dir: false }, { name: "b.txt", dir: false }]);
  });
  test("a change's letter", () => {
    expect(["??", "A ", "UU", " D", " M"].map(markOf)).toEqual(["A", "A", "U", "D", "M"]);
  });
});

test("the branch menu reads a worktree's base, how far ahead, its changes and the other checkouts", async () => {
  const { branchState, baseLine, changesLine } = await import("./worktree.js");
  const out = ["/w/12-usage", "/r/shepherdr/.git", "main", "3", "0", "1", " 4 files changed, 86 insertions(+), 9 deletions(-)",
    "tree\t/r/shepherdr\tmain\t0", "tree\t/w/12-usage\twork/12-usage\t3", "tree\t/w/13-meter\twork/13-meter\t5", ""].join("\n");
  const s = branchState(out);
  expect(s).toMatchObject({ top: "/w/12-usage", repo: "shepherdr", linked: true, base: "main", ahead: 3, behind: 0, dirty: 1, files: 4, add: 86, del: 9 });
  expect(s.trees.map((x) => [x.branch, x.ahead, x.main])).toEqual([["main", 0, true], ["work/12-usage", 3, false], ["work/13-meter", 5, false]]);
  expect(baseLine(s)).toBe("main · 3 ahead · 0 behind");
  expect(changesLine(s)).toBe("in 4 files · 1 not committed");
  expect(changesLine({ files: 1, dirty: 0 })).toBe("in 1 file");
  expect(changesLine({ files: 0, dirty: 0 })).toBe("No changes");
  expect(branchState("/r/shepherdr\n/r/shepherdr/.git\nmain\n0\n0\n0\n\n").linked).toBe(false);
  expect(branchState("")).toBe(null);
});

test("the branch menu is as tall as its rows, the shown checkout left out of the others", async () => {
  const { branchMenuHeight, otherTrees, BRANCH_MENU: M } = await import("./worktree.js");
  const s = { top: "/a", trees: [{ path: "/r" }, { path: "/a" }, { path: "/b" }] };
  expect(otherTrees(s).map((x) => x.path)).toEqual(["/r", "/b"]);
  expect(branchMenuHeight(s, 3)).toBe(M.head + M.kv + M.sec + 3 * M.row + M.pad + M.sec + 2 * M.row + M.pad + 2);
  expect(branchMenuHeight({ top: "/a", trees: [{ path: "/a" }] }, 2)).toBe(M.head + M.kv + M.sec + 2 * M.row + M.pad + 2);
});
