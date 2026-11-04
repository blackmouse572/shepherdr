import { expect, test } from "bun:test";
import { planRows, meterWords, windowWords, whyWords, freshWords, healthReadWords, noHealthWords, noPlanWords, cliTitle, readOld,
  meterSub, healthErrorWords, span, machineCounts, machineCard, cardNeedsYou } from "./machines.js";

const NOW = Date.UTC(2026, 10, 4, 12, 0);
const health = { cpu: 12, load: 0.5, cores: 8, memory: 40, mem_used: 8 * 2 ** 30, mem_total: 32 * 2 ** 30, disk: 22, disks: [{ path: "/", pct: 22, free_gb: 300 }] };

test("a machine's meter says its health, then each plan's least left", () => {
  const s = { health, limits: { claude: { state: "ok", at: NOW, windows: [{ name: "5-hour", used: 30, resets_at: NOW + 3600e3 }, { name: "Weekly", used: 81 }] } } };
  expect(meterWords(s)).toBe("CPU 12% · Memory 40% · Disk 22% · Claude Code 19% left");
});

test("an agent with no usage source says so; one with a source is never listed twice", () => {
  const rows = planRows({ limits: {}, agents: [{ key: "pi", name: "Pi" }, { key: "claude", name: "Claude Code" }] });
  expect(rows).toEqual([{ cli: "pi", name: "Pi", none: true }]);
});

test("the details' words, as the window's popup says them", () => {
  expect(freshWords(NOW - 5000, false, NOW)).toBe("Updated just now");
  expect(freshWords(NOW - 5 * 60e3, false, NOW)).toBe("Updated 5m ago");
  expect(freshWords(NOW, true, NOW)).toBe("Updating…");
  expect(healthReadWords({ error: "x" }, NOW)).toBe("Couldn't read it now");
  expect(healthReadWords({ at: NOW - 120e3 }, NOW)).toBe("Read 2m ago");
  expect(noHealthWords({ error: "timed out" })).toBe("Couldn't read it: timed out");
  expect(noPlanWords({ limitsAt: 1 })).toBe("No agent CLIs here.");
  expect(noPlanWords({})).toBe("Reading plan usage…");
  expect(whyWords({ state: "signed-out" })).toBe("Not signed in on this machine.");
  expect(whyWords({ state: "no-plan" })).toBe("No plan limits: not signed in to a subscription.");
  expect(cliTitle({ name: "Codex", read: { plan: "pro" } })).toBe("Codex · Pro");
  expect(readOld({ at: NOW - 20 * 60e3 }, NOW)).toBe(true);
  expect(meterSub({ detail: "Load 9.0 on 8 cores", level: "over" })).toBe("Load 9.0 on 8 cores · Over its alert limit");
  expect(healthErrorWords("No answer")).toBe("Couldn't read its health: No answer");
  expect(span(3 * 3600e3 + 10 * 60e3)).toBe("3h 10m");
});

test("a plan window: its numbers and refill, or that it refilled since", () => {
  const w = windowWords({ name: "Weekly", used: 81.4, resets: "Nov 9" }, NOW);
  expect(w).toEqual({ name: "Weekly", pct: 19, level: "busy", words: "19% left · 81% used", refill: "Refills Nov 9" });
  expect(windowWords({ name: "5-hour", used: 10 }, NOW).refill).toBe("No refill time reported");
  expect(windowWords({ name: "5-hour", used: 10, resets_at: NOW - 1 }, NOW).dead).toMatch(/^5-hour: refilled .+, not read since\.$/);
});

test("a machine's counts: its spaces, the terminals in their tabs, and those in settled tabs", () => {
  const spaces = [
    { machine: null, tabs: [{ panes: 2 }, { panes: 1, settled: true }] },
    { machine: "vps", tabs: [{ panes: 4 }] },
    { tabs: [{ panes: 3 }] },
  ];
  expect(machineCounts(spaces, null)).toEqual({ spaces: 2, terminals: 6, settled: 1 });
  expect(machineCounts(spaces, "vps")).toEqual({ spaces: 1, terminals: 4, settled: 0 });
  expect(machineCounts([], "x")).toEqual({ spaces: 0, terminals: 0, settled: 0 });
});

test("a machine's card: signed out needs you, a waiting core is offered, offline and connecting say so", () => {
  const local = machineCard({ local: true, stats: { health }, core: { version: "0.1.16", ready: "0.1.17", managed: null },
    accounts: [{ id: "default", name: "Default" }, { id: "personal", name: "Personal", error: "signed-out" }] });
  expect(local.state).toBe("needs");
  expect(local.words).toBe("Needs you");
  expect(local.sub).toBe("local · core 0.1.16 · load 0.50");
  expect(local.alerts).toEqual([{ kind: "signed-out", id: "personal", name: "Personal" }, { kind: "core", ready: "0.1.17", version: "0.1.16" }]);
  expect(cardNeedsYou(local)).toBe(true);
  // A core a package manager owns is never offered; up to date says Connected.
  const quiet = machineCard({ local: true, core: { version: "1", ready: "2", managed: "homebrew" } });
  expect(quiet).toEqual({ state: "connected", words: "Connected", alerts: [], sub: "local · core 1" });
  expect(cardNeedsYou(quiet)).toBe(false);
  const remote = machineCard({ layout: "ready", stats: { limits: { codex: { state: "signed-out" }, claude: { state: "ok" } } } });
  expect(remote.alerts).toEqual([{ kind: "signed-out", cli: "codex", name: "Codex" }]);
  expect(remote.sub).toBe("ssh");
  expect(machineCard({ layout: "unavailable" }).state).toBe("offline");
  expect(machineCard({ layout: "loading" }).words).toBe("Connecting");
});
