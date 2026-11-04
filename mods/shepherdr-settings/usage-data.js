// Usage and accounts, the window's side: reading herdr-usage, the account picked for new work, and the parts the
// status bar's pill and popover (mods/workspace-status-chat/usage.js) and Settings > Accounts
// (mods/shepherdr-settings/accounts-section.js) both draw.
//
// The engine (startUsage) runs in the status bar, which is always loaded: herdr-usage at start, every 5 minutes and
// when Refresh asks (shared "usage.refresh" = time asked). What it read is shared "usage" for every view; the person's
// picks are ~/.herdr/accounts.json = { active: <account id>, switch_at: 50..100 } (100: never switch), also shared as
// "usage.prefs". Past the switch point the engine moves "active" to the emptiest other account and says so in a toast.
// herdr-task reading "active" to start new work on that account (CLAUDE_CONFIG_DIR) comes with its accounts support.
//
// Shared: the source is lib/usage-data.js; bin/sync-shared copies it into each mod in lib/COPIES.
// Edit lib/usage-data.js, never a mod's copy, then run bin/sync-shared.

import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, appHome, home, spaces, shared, setShared, readTextFile, writeTextFile, theme } from "herdr";
import { TEXT, need, green, red, onStatus, toast } from "./ui.js";
import { clampSwitch, dueSwitch, meterTone, SWITCH_DEFAULT } from "./core/usage.js";

export const USAGE = "usage";
export const PREFS = "usage.prefs";
export const REFRESH = "usage.refresh";
const EVERY = 5 * 60000;
const SCRIPT = () => `${appHome()}/mods/workspace-status-chat/bin/herdr-usage`;
const FILE = () => `${home()}/.herdr/accounts.json`;
export const MONO = "JetBrains Mono";

export const usage = () => shared(USAGE) ?? null;
export const prefs = () => ({ active: null, switch_at: SWITCH_DEFAULT, ...(shared(PREFS) ?? {}) });

export async function loadPrefs() {
  let p = {};
  try { p = JSON.parse((await readTextFile(FILE())) ?? "{}") ?? {}; } catch { p = {}; }
  const out = { active: typeof p.active === "string" ? p.active : null, switch_at: clampSwitch(p.switch_at) };
  setShared(PREFS, out);
  return out;
}

// Change the picks: shared at once, written to ~/.herdr/accounts.json.
export function setPrefs(change) {
  const next = { ...prefs(), ...change };
  next.switch_at = clampSwitch(next.switch_at);
  setShared(PREFS, next);
  exec("sh", ["-c", 'mkdir -p "$(dirname "$1")"', "x", FILE()]).catch(() => {})
    .then(() => writeTextFile(FILE(), `${JSON.stringify(next, null, 2)}\n`, null)).catch(() => {});
  return next;
}

// Ask the engine to read again now (the popover's Refresh).
export const refresh = () => setShared(REFRESH, Date.now());

// The spaces on this computer, so the week's split names them as the sidebar does.
const localSpaces = () => (spaces() ?? []).filter((s) => !s.machine && s.folder).map((s) => ({ name: s.name, folder: s.folder }));

let reading = false;
async function read() {
  if (reading) return;
  reading = true;
  try {
    const r = await exec("python3", [SCRIPT(), "--spaces", JSON.stringify(localSpaces())]);
    const lineOut = String(r.stdout ?? "").split("\n").find((l) => l.startsWith("{"));
    if (lineOut) setShared(USAGE, JSON.parse(lineOut));
  } catch {
    // Keeps what it read last; the popover's "Updated" line shows how old that is.
  } finally {
    reading = false;
  }
  autoSwitch();
}

// Past the switch point: new work goes to the emptiest other account, once, with a toast.
function autoSwitch() {
  const d = dueSwitch(usage()?.claude ?? [], prefs());
  if (!d) return;
  setPrefs({ active: d.to.id });
  toast({ title: `New work now goes to ${d.to.name}`, body: `${d.why}. Running tasks stay on ${d.from.name}.`, level: "info" });
}

let started = false;
export function startUsage(cx) {
  if (started) return;
  started = true;
  let asked = shared(REFRESH) ?? 0;
  cx.spawn(async () => { await loadPrefs(); await read(); });
  cx.timer.every(EVERY, (cx) => cx.spawn(async () => { await read(); }));
  cx.timer.every(1000, (cx) => {
    const at = shared(REFRESH) ?? 0;
    if (at === asked) return;
    asked = at;
    cx.spawn(async () => { await read(); });
  });
}

// ---- parts ---------------------------------------------------------------------------------------------------

// A provider's logo: Claude's in its own colour, OpenAI's in the text colour.
export function logo(provider, size = 14) {
  return provider === "codex"
    ? svg("mods/workspace-status-chat/openai.svg").size(size).flex_none().text_color(theme().foreground)
    : image("mods/workspace-status-chat/claude.svg").w(size).h(size).flex_none();
}

const toneColor = (tone) => (tone === "red" ? red() : tone === "amber" ? need() : green());

// A meter: a dark track, the used part in green, amber within 20 of the switch point and red past it, and a tick
// at the switch point. Fixed width, so the numbers beside it never move or get cut. Motion: width only.
export function meterBar(id, pct, { width = 150, height = 6, switchAt = prefs().switch_at } = {}) {
  const t = theme();
  const p = typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : 0;
  const fill = Math.round((width * p) / 100);
  const tick = switchAt < 100 ? Math.min(width - 2, Math.round((width * switchAt) / 100)) : null;
  return div().id(id).relative().w(width).h(height).flex_none().rounded(height / 2).bg(t.background).border_1().border_color(t.border)
    .when(fill > 0, (el) => el.child(div().absolute().left(0).top(0).bottom(0).w(fill).rounded(height / 2).bg(toneColor(meterTone(p, switchAt)))))
    .when(tick !== null, (el) => el.child(div().absolute().top(-3).bottom(-3).left(tick).w(2).rounded(1).bg(t.foreground)));
}

// The filled amber badge on the account new work starts on.
export function activeBadge(word = "ACTIVE") {
  return h_flex().h(20).px(7).flex_none().items_center().rounded(10).bg(need()).text_color(onStatus())
    .font_family(MONO).text_size(TEXT.id - 0.5).font_medium().child(word);
}
