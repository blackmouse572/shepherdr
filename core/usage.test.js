import { expect, test } from "bun:test";
import { resetsIn, resetsLine, pctText, clampSwitch, meterTone, binding, activeOf, nextAccount, dueSwitch, switchLine,
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
  expect(clampSwitch(undefined)).toBe(95);
  expect(meterTone(59, 95)).toBe("green");
  expect(meterTone(80, 95)).toBe("amber");
  expect(meterTone(95, 95)).toBe("red");
});

test("which account is active, and where new work goes next", () => {
  const list = [acct("default", 59, 51), acct("personal", 27, 50), acct("work", 10, 99)];
  expect(binding(list[0])).toBe(59);
  expect(activeOf(list, { active: "personal" }).id).toBe("personal");
  expect(activeOf(list, { active: "gone" }).id).toBe("default");
  expect(activeOf([{ id: "a", error: "signed-out" }, { id: "b", error: null }], {}).id).toBe("b");
  expect(nextAccount(list, "default", 95).id).toBe("personal");
  expect(switchLine(list, { active: "default", switch_at: 95 })).toBe("Then new work goes to Personal");
  expect(switchLine([list[0]], {})).toBe("Add a second account to switch to");
  expect(switchLine(list, { switch_at: 100 })).toBe("Never switches by itself");
});

test("an automatic switch only past the point and only to an account with room", () => {
  const list = [acct("default", 96, 51), acct("personal", 27, 50)];
  const d = dueSwitch(list, { active: "default", switch_at: 95 });
  expect(d.to.id).toBe("personal");
  expect(d.why).toBe("Default passed 95% of its 5h window");
  expect(dueSwitch(list, { active: "default", switch_at: 100 })).toBe(null);
  expect(dueSwitch([acct("default", 96, 51), acct("personal", 97, 50)], { active: "default" })).toBe(null);
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
