import { expect, test } from "bun:test";
import { needFilter, atMs, waitingLine, REASONS } from "./needs.js";

test("an item's filter: an ask by what it asks, a signed-out agent, a blocked one's permission, the rest other", () => {
  expect(needFilter({ kind: "ask" }, { ask: "plan" })).toBe("plan");
  expect(needFilter({ kind: "ask" }, { ask: "permission" })).toBe("permission");
  expect(needFilter({ kind: "ask" }, { ask: "questions" })).toBe("other");
  expect(needFilter({ kind: "ask" })).toBe("other");
  expect(needFilter({ kind: "blocked" }, { report: "auth" })).toBe("signin");
  expect(needFilter({ kind: "provider", why: REASONS.signedOut })).toBe("signin");
  expect(needFilter({ kind: "blocked" }, { report: "permission" })).toBe("permission");
  expect(needFilter({ kind: "check" })).toBe("other");
});

test("times in seconds, ms or ISO all come out in ms", () => {
  expect(atMs(1700000000)).toBe(1700000000000);
  expect(atMs(1700000000000)).toBe(1700000000000);
  expect(atMs("2026-11-04T10:00:00Z")).toBe(Date.parse("2026-11-04T10:00:00Z"));
  expect(atMs(0)).toBe(null);
  expect(atMs(undefined)).toBe(null);
});

test("the drawer's line says how many, across how many spaces, and the oldest", () => {
  expect(waitingLine(3, 3, "9m")).toBe("3 waiting across 3 spaces · oldest 9m");
  expect(waitingLine(1, 1, "2m")).toBe("1 waiting in 1 space · oldest 2m");
  expect(waitingLine(2, 0)).toBe("2 waiting");
  expect(waitingLine(0, 0)).toBe("Nothing waits for you");
});
