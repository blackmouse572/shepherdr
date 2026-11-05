import { expect, test } from "bun:test";
import { keepGood, resetsIn, resetsLine, pctText, clampSwitch, meterTone, binding, activeOf, nextAccount, dueSwitch, switchLine,
  midCut, accountSub, weekBars, spaceSplit, pillParts, updatedLine, capHeight, popoverHeight } from "./usage.js";

const now = Date.parse("2026-11-04T12:00:00Z");
const at = (min) => new Date(now + min * 60000).toISOString();
const acct = (id, s, w, extra = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), folder: `~/.claude-${id}`, plan: "Max",
  meters: [{ id: "session", label: "Session", pct: s, resets_at: at(192) }, { id: "weekly", label: "Weekly", pct: w, resets_at: at(4440) },
    { id: "fable", label: "Fable", pct: 37, resets_at: at(4440), model: true }], error: null, ...extra });

test("reset times read short and never cut", () => {
  expect(resetsIn(at(192), now)).toBe("3h 12m");
  expect(resetsIn(at(4440), now)).toBe("3d 2h");
  expect(resetsIn(at(12), now)).toBe("12m");
  expect(resetsIn(at(-5), now)).toBe("now");
  expect(resetsIn(null, now)).toBe("");
  expect(resetsLine(at(60), now)).toBe("resets 1h");
  expect(pctText(59.4)).toBe("59%");
  expect(pctText(null)).toBe("–");
});

test("the switch point and the meters' colours", () => {
  expect(clampSwitch(93)).toBe(95);
  expect(clampSwitch(20)).toBe(50);
  expect(clampSwitch(100)).toBe(95);
  expect(clampSwitch(undefined)).toBe(95);
  // Doop App 02/04: 59% amber, 51% green with the switch at 95.
  expect(meterTone(59, 95)).toBe("amber");
  expect(meterTone(51, 95)).toBe("green");
  expect(meterTone(55, 95)).toBe("amber");
  expect(meterTone(95, 95)).toBe("red");
  expect(meterTone(45, 80)).toBe("amber");
});

test("prefs: switch_at 100 reads as switching off, and the new picks get defaults", async () => {
  const { normPrefs } = await import("./usage.js");
  expect(normPrefs({ switch_at: 100 })).toMatchObject({ auto: false, switch_at: 95 });
  expect(normPrefs({ switch_at: 80 })).toMatchObject({ auto: true, switch_at: 80, running: "stays", undo: true, order: [], skipped: [] });
  expect(normPrefs({ auto: false, switch_at: 70, running: "moves", undo: false, order: ["b", 3], skipped: ["c"] }))
    .toMatchObject({ auto: false, switch_at: 70, running: "moves", undo: false, order: ["b"], skipped: ["c"] });
  expect(normPrefs(null)).toMatchObject({ active: null, auto: true, switch_at: 95 });
});

test("which account is active, and where new work goes next", () => {
  const list = [acct("default", 59, 51), acct("personal", 27, 50), acct("work", 10, 99)];
  expect(binding(list[0])).toBe(59);
  expect(binding(acct("x", 10, 99))).toBe(10);
  expect(activeOf(list, { active: "personal" }).id).toBe("personal");
  expect(activeOf(list, { active: "gone" }).id).toBe("default");
  expect(activeOf([{ id: "a", error: "signed-out" }, { id: "b", error: null }], {}).id).toBe("b");
  expect(nextAccount(list, "default", 95).id).toBe("personal");
  expect(switchLine(list, { active: "default", switch_at: 95 })).toBe("Then new work goes to Personal");
  expect(switchLine([list[0]], {})).toBe("Add a second account to switch to");
  expect(switchLine(list, { auto: false })).toBe("Never switches by itself");
});

test("the switch order, skipped accounts and the badges", async () => {
  const { ordered, moved, badgeOf, statusSwitch } = await import("./usage.js");
  const list = [acct("default", 59, 51), acct("personal", 27, 50), acct("work", 10, 99), acct("client", 5, 5)];
  // The 5h window only: work (99% of its week) still has room.
  expect(nextAccount(list, "default", 95).id).toBe("personal");
  const pr = { active: "default", order: ["work", "default"], skipped: ["personal"] };
  expect(ordered(list, pr).map((a) => a.id)).toEqual(["work", "default", "personal", "client"]);
  expect(nextAccount(list, "default", 95, pr).id).toBe("work");
  expect(nextAccount(list, "default", 95, { skipped: ["personal", "work"] }).id).toBe("client");
  expect(moved(list, pr, "client", -1)).toEqual(["work", "default", "client", "personal"]);
  expect(moved(list, pr, "work", -1)).toEqual(["work", "default", "personal", "client"]);
  expect(badgeOf(list[0], list, pr)).toBe("default");
  expect(badgeOf(list[2], list, pr)).toBe("next");
  expect(badgeOf(list[1], list, pr)).toBe("skipped");
  expect(badgeOf(list[3], list, pr)).toBe(null);
  expect(badgeOf(list[2], list, { ...pr, auto: false })).toBe(null);
  expect(statusSwitch(list, pr)).toBe("switch at 95% · Work next");
  expect(statusSwitch(list, { auto: false })).toBe("switching off");
  expect(statusSwitch([list[0]], {})).toBe(null);
});

test("an automatic switch only past the point and only to an account with room", () => {
  const list = [acct("default", 96, 51), acct("personal", 27, 50)];
  const d = dueSwitch(list, { active: "default", switch_at: 95 });
  expect(d.to.id).toBe("personal");
  expect(d.why).toBe("Default passed 95% of its 5h window");
  expect(dueSwitch(list, { active: "default", auto: false })).toBe(null);
  expect(dueSwitch([acct("default", 96, 51), acct("personal", 97, 50)], { active: "default" })).toBe(null);
  // The week alone never switches.
  expect(dueSwitch([acct("default", 40, 99), acct("personal", 27, 50)], { active: "default" })).toBe(null);
  expect(dueSwitch(list, { active: "default", skipped: ["personal"] })).toBe(null);
});

test("the switch toast, the next queued task and another machine's meters", async () => {
  const { switchToast, nextQueued, metersOf, initial, usageShort } = await import("./usage.js");
  const d = dueSwitch([acct("default", 96, 51), acct("personal", 27, 50)], { active: "default" });
  expect(switchToast(d, "SHE-15")).toEqual({ title: "New work now goes to Personal", sub: "Default passed 95% of its 5h window",
    body: "SHE-15 will start on Personal. Running tasks stay on Default." });
  expect(switchToast(d).body).toBe("New tasks start on Personal. Running tasks stay on Default.");
  const lists = [{ prefix: "SHE", tasks: [{ id: 15, state: "queued", queued_at: "2026-11-04T10:12:00" }, { id: 9, state: "todo" }] },
    { prefix: "", tasks: [{ id: 3, state: "queued", queued_at: "2026-11-04T09:00:00" }] }];
  expect(nextQueued(lists)).toBe("3");
  expect(nextQueued([lists[0]])).toBe("SHE-15");
  expect(nextQueued([])).toBe(null);
  const ms = metersOf([{ name: "Weekly (all models)", used: 51 }, { name: "5-hour", used: 59, resets_at: now }, { name: "Weekly (Fable only)", used: 37 }]);
  expect(ms.map((m) => [m.id, m.label, m.pct])).toEqual([["session", "Session", 59], ["weekly", "Weekly", 51], ["fable", "Fable", 37]]);
  expect(ms[0].resets_at).toBe(new Date(now).toISOString());
  expect(initial(" personal")).toBe("P");
  expect(usageShort(acct("default", 59, 51))).toBe("59% 5h · 51% wk");
});

test("paths are cut in the middle, names and numbers are not", () => {
  expect(midCut("~/.claude-personal", 28)).toBe("~/.claude-personal");
  const cut = midCut("~/.claude-a-very-long-account-name-for-work", 20);
  expect(cut.length).toBe(20);
  expect(cut.startsWith("~/.claude")).toBe(true);
  expect(cut.endsWith("work")).toBe(true);
  expect(accountSub(acct("personal", 1, 1))).toBe("Max · ~/.claude-personal");
});

test("the week's bars and the split by space", () => {
  const days = ["10-29", "10-30", "10-31", "11-01", "11-02", "11-03", "11-04"].map((d, i) => ({ date: `2026-${d}`, tokens: i * 10 }));
  const bars = weekBars(days, 60);
  expect(bars.length).toBe(7);
  expect(bars[6]).toMatchObject({ label: "Today", h: 60, today: true });
  expect(bars[0].h).toBe(2);
  expect(bars[0].label).toBe("Thu");
  const sp = spaceSplit([{ name: "a", tokens: 60 }, { name: "b", tokens: 30 }, { name: "c", tokens: 10 }, { name: "d", tokens: 0 }], 50, 2);
  expect(sp.rows.map((r) => Math.round(r.pct))).toEqual([30, 15]);
  expect(sp.rows[1].frac).toBe(0.5);
  expect(sp.more).toBe(1);
  expect(spaceSplit([], 50)).toEqual({ rows: [], more: 0 });
});

test("the pill, the updated line and the popover's height", () => {
  expect(pillParts(acct("default", 59, 51))).toMatchObject({ name: "Default", session: "59% 5h", rest: "51% wk · 37% Fable" });
  expect(pillParts({ name: "X", meters: [], error: "signed-out" }).error).toBe("Signed out");
  expect(updatedLine(at(-0.5), now)).toBe("Updated just now");
  expect(updatedLine(at(-4), now)).toBe("Updated 4 min ago");
  const many = Array.from({ length: 12 }, (_, i) => acct(`a${i}`, 1, 1));
  expect(capHeight(popoverHeight(many), 900)).toBe(630);
  expect(capHeight(popoverHeight([acct("a", 1, 1)]), 900)).toBe(popoverHeight([acct("a", 1, 1)]));
});

test("names of the person's own, accounts removed from Shepherdr, and new accounts' ids", async () => {
  const { shown, hiddenOf, accountId, addProblem, cleanName } = await import("./usage.js");
  const list = [acct("default", 1, 1), acct("personal", 1, 1), acct("work", 1, 1)];
  const pr = { names: { default: "Company", work: "Side" }, hidden: ["personal"] };
  expect(shown(list, pr).map((a) => a.name)).toEqual(["Company", "Side"]);
  expect(hiddenOf(list, pr).map((a) => a.id)).toEqual(["personal"]);
  expect(accountId("  My Work Account!! ")).toBe("my-work-account");
  expect(accountId("Café")).toBe("cafe");
  expect(accountId("a".repeat(40)).length).toBe(24);
  expect(addProblem("", list)).toBe("Give it a name.");
  expect(addProblem("!!!", list)).toBe("Use letters or digits in the name.");
  expect(addProblem("Default", list)).toBe("Default is ~/.claude itself.");
  expect(addProblem("Work", list)).toBe("There is already an account in ~/.claude-work.");
  expect(addProblem("Client A", list)).toBe("");
  expect(cleanName("  a\n  b ")).toBe("a b");
});

test("keepGood holds the last numbers through a failed read, not through a sign-out", () => {
  const good = { at: "t1", claude: [{ id: "default", meters: [{ id: "session", pct: 25 }], plan: "Max", error: null }] };
  const failed = { at: "t2", claude: [{ id: "default", meters: [], plan: null, error: "error", why: "no limits" }] };
  const kept = keepGood(good, failed).claude[0];
  expect(kept.meters).toEqual(good.claude[0].meters);
  expect(kept.error).toBe(null);
  expect(kept.stale).toBe("t1");
  const out = { at: "t2", claude: [{ id: "default", meters: [], error: "signed-out" }] };
  expect(keepGood(good, out).claude[0].error).toBe("signed-out");
  expect(keepGood(null, failed)).toBe(failed);
});

test("kept numbers say when they were read", async () => {
  const { staleLine } = await import("./usage.js");
  const read = new Date(2026, 10, 4, 10, 42);
  expect(staleLine({ stale: read.toISOString() }, new Date(2026, 10, 4, 11, 5).getTime())).toBe("as of 10:42");
  expect(staleLine({ stale: read.toISOString() }, new Date(2026, 10, 5, 9, 0).getTime())).toBe("as of Wed 10:42");
  expect(staleLine({ stale: null })).toBe("");
  expect(staleLine({ stale: "nope" })).toBe("");
  expect(staleLine(null)).toBe("");
});

test("a dragged account lands on the row it's dropped on", async () => {
  const { dropped, dropEdge } = await import("./usage.js");
  const list = ["a", "b", "c", "d"].map((id) => acct(id, 1, 1));
  const pr = { order: [] };
  // Down: below the target; up: above it.
  expect(dropEdge(list, pr, "a", "c")).toBe("bottom");
  expect(dropEdge(list, pr, "d", "b")).toBe("top");
  expect(dropped(list, pr, "a", "c")).toEqual(["b", "c", "a", "d"]);
  expect(dropped(list, pr, "d", "b")).toEqual(["a", "d", "b", "c"]);
  expect(dropped(list, pr, "b", "b")).toEqual(["a", "b", "c", "d"]);
  expect(dropped(list, pr, "x", "b")).toEqual(["a", "b", "c", "d"]);
  // The person's order counts, not the order found.
  expect(dropped(list, { order: ["d", "c", "b", "a"] }, "d", "a")).toEqual(["c", "b", "a", "d"]);
});

test("Moves: the switch asks herdr-task to move running work, chained switches keep emptying the old ones", async () => {
  const { normPrefs, movingAfter, switchToast } = await import("./usage.js");
  const d = dueSwitch([acct("default", 96, 51), acct("personal", 27, 50)], { active: "default" });
  expect(switchToast(d, null, "moves").body).toBe("New tasks start on Personal. Running tasks move to Personal between turns.");
  const m = movingAfter(null, d, 5);
  expect(m).toEqual({ from: ["default"], to: "personal", at: 5 });
  const next = { from: { id: "personal" }, to: { id: "client" } };
  expect(movingAfter(m, next, 9)).toEqual({ from: ["default", "personal"], to: "client", at: 9 });
  expect(movingAfter({ from: ["x"], to: "other", at: 1 }, next, 9).from).toEqual(["personal"]);
  expect(normPrefs({ moving: m }).moving).toEqual(m);
  expect(normPrefs({ moving: { from: ["a"], to: "a", at: 1 } }).moving).toBe(null);
  expect(normPrefs({ moving: "x" }).moving).toBe(null);
});

test("another machine's accounts go through herdr-task there (a fake exec)", async () => {
  const { readRemote, setRemote, moveRemote, pausedLine } = await import("./usage.js");
  const calls = [];
  const listed = { accounts: [{ id: "default", name: "Default", folder: "~/.claude", signed_in: true, account: "a@b.c", tasks: [] },
    { id: "personal", name: "Personal", folder: "~/.claude-personal", signed_in: false, tasks: [{ ref: "EVL-3", folder: "eval-runner" }, { ref: "EVL-4", folder: "eval-runner" }] }],
    active: "personal", auto: true, switch_at: 95, running: "stays", order: [], skipped: [], names: {}, hidden: [] };
  const exec = async (cmd, args, opts) => {
    calls.push({ cmd, args, on: opts?.on });
    if (args.includes("move")) return { code: 0, stdout: JSON.stringify({ moved: ["EVL-3"], waiting: ["EVL-4"], repointed: [] }), stderr: "" };
    if (args.includes("set")) return { code: 0, stdout: `noise\n${JSON.stringify({ ...listed, active: "default" })}\n`, stderr: "" };
    return { code: 0, stdout: JSON.stringify(listed), stderr: "" };
  };
  const r = await readRemote(exec, "build-box");
  expect(calls[0]).toEqual({ cmd: "sh", args: ["-c", 'exec "$HOME/.local/bin/herdr-task" "$@"', "herdr-task", "accounts", "list", "--json"], on: "build-box" });
  expect(r.accounts.map((a) => [a.id, a.error])).toEqual([["default", null], ["personal", "signed-out"]]);
  expect(r.prefs.active).toBe("personal");
  expect(pausedLine(r.accounts[1].tasks)).toBe("EVL-3 and EVL-4 in eval-runner are paused until it signs in");
  expect(pausedLine([])).toBe("");
  expect((await setRemote(exec, "build-box", { active: "default" })).prefs.active).toBe("default");
  expect(calls[1].args.slice(3)).toEqual(["accounts", "set", '{"active":"default"}', "--json"]);
  expect(await moveRemote(exec, "build-box", "personal")).toEqual({ moved: ["EVL-3"], waiting: ["EVL-4"], repointed: [] });
  expect(calls[2].args.slice(3)).toEqual(["accounts", "move", "--from", "personal", "--to", "default", "--json"]);
  const bad = async () => ({ code: 1, stdout: JSON.stringify({ error: "'x' isn't an account here." }), stderr: "" });
  await expect(setRemote(bad, "build-box", { active: "x" })).rejects.toThrow("isn't an account here");
  const old = async () => ({ code: 2, stdout: "", stderr: "usage: herdr-task ...\ninvalid choice: 'list'" });
  await expect(readRemote(old, "build-box")).rejects.toThrow("invalid choice");
});
