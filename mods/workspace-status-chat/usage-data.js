// Usage and accounts, the window's side: reading herdr-usage, the account picked for new work, and the parts the
// status bar's pill and popover (mods/workspace-status-chat/usage.js) and Settings > Accounts
// (mods/shepherdr-settings/accounts-section.js) both draw.
//
// The engine (startUsage) runs in the status bar, which is always loaded: herdr-usage at start, every 5 minutes and
// when Refresh asks (shared "usage.refresh" = time asked). What it read is shared "usage" for every view; the person's
// picks are ~/.herdr/accounts.json = { active: <account id>, switch_at: 50..100 (100: never switch), names: { id: name },
// hidden: [id] }, also shared as "usage.prefs". Past the switch point the engine moves "active" to the emptiest other
// account and says so in a toast. herdr-task starts new Claude agents on "active" (herdr_task/accounts.py).
// Accounts are added (a ~/.claude-<id> folder with Shepherdr's hooks, then a terminal to sign in), renamed (a name of
// the person's own; the folder stays) and removed from Shepherdr (hidden; the folder stays) here too.
//
// Shared: the source is lib/usage-data.js; bin/sync-shared copies it into each mod in lib/COPIES.
// Edit lib/usage-data.js, never a mod's copy, then run bin/sync-shared.

import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, appHome, home, spaces, shared, setShared, readTextFile, writeTextFile, theme, run } from "herdr";
import { TEXT, need, green, red, onStatus, toast } from "./ui.js";
import { clampSwitch, dueSwitch, meterTone, shown, accountId, cleanName, WORDS, SWITCH_DEFAULT } from "./core/usage.js";

export const USAGE = "usage";
export const PREFS = "usage.prefs";
export const REFRESH = "usage.refresh";
const FAST = "usage.fast"; // until when the engine reads every 20 s (a sign-in under way)
const EVERY = 5 * 60000;
const SCRIPT = () => `${appHome()}/mods/workspace-status-chat/bin/herdr-usage`;
const FILE = () => `${home()}/.herdr/accounts.json`;
export const MONO = "JetBrains Mono";

export const usage = () => shared(USAGE) ?? null;
export const prefs = () => ({ active: null, switch_at: SWITCH_DEFAULT, names: {}, hidden: [], ...(shared(PREFS) ?? {}) });
// The Claude accounts as the person sees them: their own names, without the ones removed from Shepherdr.
export const accounts = () => shown(usage()?.claude ?? [], prefs());

export async function loadPrefs() {
  let p = {};
  try { p = JSON.parse((await readTextFile(FILE())) ?? "{}") ?? {}; } catch { p = {}; }
  const names = p.names && typeof p.names === "object" ? Object.fromEntries(Object.entries(p.names).filter(([, v]) => typeof v === "string")) : {};
  const hidden = Array.isArray(p.hidden) ? p.hidden.filter((x) => typeof x === "string") : [];
  const out = { active: typeof p.active === "string" ? p.active : null, switch_at: clampSwitch(p.switch_at), names, hidden };
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
  const d = dueSwitch(accounts(), prefs());
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
  let fastAt = 0;
  cx.timer.every(1000, (cx) => {
    const at = shared(REFRESH) ?? 0;
    const now = Date.now();
    const fast = (shared(FAST) ?? 0) > now && now - fastAt >= 20000;
    if (at === asked && !fast) return;
    asked = at;
    if (fast) fastAt = now;
    cx.spawn(async () => { await read(); });
  });
}

// ---- adding, signing in, renaming, removing ---------------------------------------------------------------------

const CLI = () => `${appHome()}/mods/tasks/bin/herdr-task`;
const folderOf = (id) => (id === "default" ? `${home()}/.claude` : `${home()}/.claude-${id}`);

// A terminal signing the account in (Claude Code's /login with that folder), shown over the window. It runs in the
// person's login shell, as herdr-task starts agents, so their PATH finds claude.
export async function signIn(id, name) {
  const sh = (await exec("sh", ["-c", 'printf %s "${SHELL:-/bin/sh}"']).catch(() => null))?.stdout?.trim() || "/bin/sh";
  const env = id === "default" ? [] : [`CLAUDE_CONFIG_DIR=${folderOf(id)}`];
  const r = await exec("hc", ["run", "--bg", "--json", "--no-parent", "--keep", "--cwd", home(), "--name", `sign-in-${id}`.slice(0, 32),
    "--", "env", ...env, sh, "-lic", `claude /login; exec ${sh} -i`]);
  let out = {};
  try { out = JSON.parse(r.stdout || "{}"); } catch {}
  if (r.code !== 0 || !out.address) throw new Error((r.stderr || r.stdout || "The terminal didn't start.").trim());
  run("terminal.peek", { terminal: out.address });
  toast({ title: WORDS.signInTitle(name ?? id), body: WORDS.signInBody, level: "info" });
  // Its meters once the person has signed in: the engine reads every 20 s for the next 5 minutes.
  setShared(FAST, Date.now() + 5 * 60000);
  return out.address;
}

// A new account: its folder (owner only) with Shepherdr's hooks (herdr-task accounts prepare), its name, then the
// terminal to sign in. Throws with herdr-task's reason.
export async function addAccount(name) {
  const id = accountId(name);
  const r = await exec(CLI(), ["accounts", "prepare", id, "--json"]);
  let out = {};
  try { out = JSON.parse(r.stdout || "{}"); } catch {}
  if (r.code !== 0 || out.error) throw new Error(out.error || r.stderr || "Couldn't make its folder.");
  const nice = cleanName(name);
  setPrefs({ names: { ...prefs().names, [id]: nice }, hidden: prefs().hidden.filter((x) => x !== id) });
  refresh();
  await signIn(id, nice);
  return id;
}

export function renameAccount(id, name) {
  const names = { ...prefs().names };
  const nice = cleanName(name);
  if (nice) names[id] = nice; else delete names[id];
  setPrefs({ names });
}
// Removed from Shepherdr: hidden from every view; its folder and sign-in stay. Never the active one.
export function hideAccount(id) {
  if (id === "default" || prefs().active === id) return;
  setPrefs({ hidden: [...new Set([...prefs().hidden, id])] });
}
export const showAccount = (id) => setPrefs({ hidden: prefs().hidden.filter((x) => x !== id) });

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
