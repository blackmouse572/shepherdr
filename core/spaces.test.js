import { expect, test } from "bun:test";
import { spaceName, tilde, sharedNames, midCut, parentOf, foldList, parseWorktrees } from "./spaces.js";

test("two spaces with one name on a machine each show their folder, from ~ (the sidebar's rows, both sides)", () => {
  // built, so the repo's no-home-paths rule has nothing to find
  expect(tilde(["", "home", "u", "dev", "app"].join("/"))).toBe("~/dev/app");
  expect(tilde(["", "Users", "u"].join("/"))).toBe("~");
  expect(tilde("/srv/app")).toBe("/srv/app");
  const rows = [
    { id: "a", machine: null, name: "Home" }, { id: "b", machine: null, name: "home" }, { id: "c", machine: "vm", name: "Home" },
    { id: "d", machine: null, name: "app" }, { id: "e", machine: null, name: "app", linked: true },
  ];
  expect([...sharedNames(rows)].sort()).toEqual(["a", "b"]);
});

test("a space is called as the window's sidebar calls it, never ~", () => {
  expect(spaceName({ name: "web", folder: "/x/y" })).toBe("web");
  expect(spaceName({ name: "~", folder: "/srv/u" }, { home: "/srv/u" })).toBe("Home");
  expect(spaceName({ name: "~", folder: "/tmp/abc/tt-repo" })).toBe("tt-repo");
  expect(spaceName({ name: "~", folder: "/root/" })).toBe("Home");
  expect(spaceName({ name: "", folder: "/srv/app" }, { repo: "app-repo" })).toBe("app-repo");
  expect(spaceName({ name: "dev", folder: "/srv/app" }, { named: false, repo: "app" })).toBe("app");
});

test("paths and branches are cut in the middle, and a space's row shows its parent folder (overflow R2)", () => {
  expect(midCut("work/12-usage-popover", 40)).toBe("work/12-usage-popover");
  const cut = midCut("work/128-account-switch-toast-for-the-status-bar", 20);
  expect(cut.length).toBe(20);
  expect(cut.startsWith("work/128")).toBe(true);
  expect(cut.endsWith("status-bar")).toBe(true);
  expect(cut).toContain("…");
  expect(parentOf(["", "home", "u", "dev", "app"].join("/"))).toBe("~/dev");
  expect(parentOf(["", "home", "u"].join("/"))).toBe("");
  expect(parentOf("/srv/api/")).toBe("/srv");
  expect(parentOf("/srv")).toBe("/");
});

test("a long list folds after 5, but what needs you and the shown space never fold away (R4, R5)", () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: i, needs: i === 7 }));
  const folded = foldList(items, { keep: (x) => x.needs });
  expect(folded.shown.map((x) => x.id)).toEqual([0, 1, 2, 3, 4, 7]);
  expect(folded.hidden).toBe(3);
  expect(foldList(items, { open: true }).hidden).toBe(0);
  expect(foldList(items.slice(0, 5)).hidden).toBe(0);
});

test("a repo's worktrees come from git's porcelain list, its own folder and pruned ones left out", () => {
  const out = ["worktree /srv/app", "HEAD aaa", "branch refs/heads/main", "",
    "worktree /srv/wt/feature", "HEAD bbb", "branch refs/heads/work/12-usage", "",
    "worktree /srv/wt/detached", "HEAD ccc", "detached", "",
    "worktree /srv/wt/gone", "HEAD ddd", "branch refs/heads/old", "prunable gitdir file points to non-existent location", ""].join("\n");
  expect(parseWorktrees(out)).toEqual([
    { path: "/srv/wt/feature", branch: "work/12-usage", head: "bbb" },
    { path: "/srv/wt/detached", branch: null, head: "ccc" },
  ]);
  expect(parseWorktrees("")).toEqual([]);
});
