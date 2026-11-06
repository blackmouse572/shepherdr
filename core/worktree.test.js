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

test("the branch menu's extras: the editor, the PR line and Update from its base", async () => {
  const { branchExtras, prLine, editorTries, editorShown, editorName, installedEditors, canUpdate, updateArgv, updateLabel,
    branchActions, branchMenuHeight, BRANCH_MENU: M } = await import("./worktree.js");
  const out = 'editor\tzed\n{"isDraft":true,"number":48,"state":"OPEN","url":"https://github.com/o/r/pull/48"}\n';
  expect(branchExtras(out)).toEqual({ editor: "zed", pr: { number: 48, url: "https://github.com/o/r/pull/48", state: "draft" } });
  expect(prLine(branchExtras(out).pr)).toBe("#48 · draft");
  expect(branchExtras('editor\t\n{"number":3,"state":"MERGED","isDraft":false,"url":"u"}').pr.state).toBe("merged");
  // No editor there, no gh or no PR: neither shows.
  expect(branchExtras("editor\t\n")).toEqual({ editor: null, pr: null });
  expect(branchExtras("editor\topen\nno pull requests found")).toEqual({ editor: "open", pr: null });
  // Unset: the first installed, else the system's.
  expect(editorTries(undefined)).toEqual(["code", "cursor", "zed", "system"]);
  expect(editorTries("zed")).toEqual(["zed"]);
  expect(editorShown(null, ["cursor", "zed"])).toBe("cursor");
  expect(editorShown(null, [])).toBe("system");
  expect(editorShown("zed", [])).toBe("zed");
  expect(installedEditors("code\nzed\nbogus\n")).toEqual(["code", "zed"]);
  expect([editorName("zed"), editorName("xdg-open"), editorName("code")]).toEqual(["Zed", "System default", "VS Code"]);
  // Not on the base itself.
  expect(canUpdate({ base: "main" }, "work/12")).toBe(true);
  expect(canUpdate({ base: "main" }, "main")).toBe(false);
  expect(canUpdate({ base: "main" }, null)).toBe(false);
  expect(updateLabel("main")).toBe("Update from main");
  expect(updateArgv("main").slice(-2)).toEqual(["sh", "main"]);
  expect(branchActions({ files: true, editor: "zed", update: true })).toBe(5);
  expect(branchActions({})).toBe(2);
  const s = { top: "/a", trees: [] };
  expect(branchMenuHeight(s, 2, true) - branchMenuHeight(s, 2)).toBe(M.kvLine);
});

test("the extras script finds a command and stays quiet without gh", async () => {
  const { BRANCH_EXTRAS, branchExtras } = await import("./worktree.js");
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("sh", ["-c", BRANCH_EXTRAS, "sh", "nope-editor sh", ""], { encoding: "utf8" });
  expect(r.status).toBe(0);
  expect(branchExtras(r.stdout)).toEqual({ editor: "sh", pr: null });
});

test("a checkout opened beside starts the agent the focused terminal runs, fresh", async () => {
  const { agentEntry } = await import("./worktree.js");
  const known = [{ key: "claude", run: ["/usr/local/bin/claude"] }, { key: "codex", run: ["codex"] }];
  expect(agentEntry({ labels: { "herdr.agent": "codex" } }, known)?.key).toBe("codex");
  expect(agentEntry({ program: { key: "claude" } }, known)?.run).toEqual(["/usr/local/bin/claude"]);
  // its own argv (a --resume) is never copied: only the entry's run
  expect(agentEntry({ foreground: { argv: ["claude", "--resume", "x"] } }, known)?.run).toEqual(["/usr/local/bin/claude"]);
  expect(agentEntry({ foreground: { argv: ["zsh"] } }, known)).toBe(null);
  expect(agentEntry(null, known)).toBe(null);
});
