// Usage and accounts: the words and the sums behind the status bar's usage pill, its popover and detail panel
// (mods/workspace-status-chat/usage.js) and Settings > Accounts (mods/shepherdr-settings/accounts-section.js).
// The numbers come from herdr-usage (mods/workspace-status-chat/bin/herdr-usage): per Claude account its meters
// ({ id, label, pct, resets_at }), its last 7 days of tokens and their split by space; and the Codex sign-in.
// Plain JS, no Herdr imports: copied into the mods by bin/sync-shared.

export const WORDS = {
  title: "Usage",
  claude: "Claude",
  codex: "Codex",
  active: "ACTIVE",
  use: "Use",
  switchAbove: "Switch above",
  manage: "Manage accounts",
  openSettings: "Open in Settings",
  weekChart: "Weekly use · last 7 days",
  bySpace: "This week by space",
  detail: "Usage detail",
  checks: "checks every 5 min",
  loading: "Reading usage…",
  noAccounts: "No Claude account on this computer yet. Sign in with claude, and it shows here.",
  codexOut: "Codex isn't signed in here. Run codex login.",
  addHow: "Another account is another Claude folder: run CLAUDE_CONFIG_DIR=~/.claude-<name> claude and sign in. It shows here within 5 minutes.",
  accounts: "Accounts",
  accountsAbout: "The Claude accounts and the Codex sign-in on this computer, what each has used, and which one new work starts on.",
  newWork: "New tasks start on the Default ★ account; a task you resume stays on the account it started on.",
  add: "Add an account",
  addField: "Name",
  addPlaceholder: "Work",
  addButton: "Add and sign in",
  addHint: (id) => (id ? `Its folder is ~/.claude-${id}. A terminal opens to sign in.` : "A Claude Code folder of its own, and a terminal to sign in."),
  signIn: "Sign in",
  signInAgain: "Sign in again",
  rename: "Rename",
  save: "Save",
  cancel: "Cancel",
  remove: "Remove",
  removeYes: "Remove from Shepherdr",
  keep: "Keep",
  removeAbout: (folder) => `Hides it here and in the popover. ${folder} and its sign-in stay; Show again brings it back.`,
  hidden: (names) => `Removed from Shepherdr: ${names}`,
  showAgain: "Show again",
  signInTitle: (name) => `Sign in to ${name}`,
  signInBody: "Finish in the terminal that opened, then close it. The account's meters show within a minute.",
  setDefault: "Set as default",
  openFolder: "Open folder",
  skip: "Skip when switching",
  unskip: "Use when switching",
  moveUp: "Move up",
  moveDown: "Move down",
  removeMenu: "Remove…",
  keepsFolder: "keeps folder",
  badgeDefault: "Default",
  badgeNext: "Next",
  badgeSkipped: "Skipped",
  skippedLine: "not used for switching",
  claudeSub: (n) => `${n} ${n === 1 ? "folder" : "folders"} · drag to set the switch order`,
  addAccount: "Add account",
  switching: "Switching",
  switchingSub: (where) => `One rule for every space on ${where}`,
  auto: "Switch automatically",
  autoAbout: "Past the limit, new work goes to the next account",
  switchAboutRow: "Measured on the 5h session window",
  running: "Work already running",
  stays: "Stays",
  moves: "Moves",
  runningStays: "Keeps the account it started on",
  runningMoves: "Between turns, running tasks resume on the new account; a working turn finishes first",
  undoToast: "Toast with Undo",
  undoAbout: "Undo stays open for 10 seconds",
  undo: "Undo",
  view: "View",
  codexSub: "One sign-in · no folders",
  signedIn: "Signed in",
  signOut: "Sign out",
  signOutAbout: "Codex stops working on this computer until you sign in again.",
  codexAbout: "Codex has one sign-in, so it can't switch accounts: it pauses at its limit.",
  remoteNote: (m) => `${m}'s own accounts, read with herdr-task there. Changes here are made on ${m}; its usage meters show on ${m} itself.`,
  remoteNone: (m) => `Nothing read from ${m} yet. Its plan usage shows here once Settings > Machines has read it.`,
  remoteReading: (m) => `Reading ${m}'s accounts…`,
  remoteFailed: (m, why) => `Couldn't read ${m}'s accounts${why ? `: ${why}` : ""}. Its ~/.claude and Codex, as Settings > Machines reads them:`,
  remoteSwitch: "On another machine, new work starts on its default; switching by usage runs where a window reads it.",
  signedOutRow: "signed out",
  moveTo: (name) => `Move to ${name}`,
  moved: (r, to) => [r.moved?.length ? `Moved ${r.moved.join(", ")} to ${to}.` : "", r.repointed?.length ? `${r.repointed.join(", ")} resume on ${to}.` : "",
    r.waiting?.length ? `${r.waiting.join(", ")} still working: they move once they finish (Move again).` : ""].filter(Boolean).join(" ") || "Nothing ran on that account.",
};

// ---- names, hidden accounts, new accounts ------------------------------------------------------------------------
// The person's own names for accounts (prefs.names: { id: name }) and the ones removed from Shepherdr (prefs.hidden):
// a renamed account keeps its folder (a Mac keeps its sign-in under the folder's path), a removed one stays on disk.
export function shown(accounts, prefs) {
  const names = prefs?.names ?? {}, hidden = new Set(prefs?.hidden ?? []);
  return (accounts ?? []).filter((a) => !hidden.has(a.id)).map((a) => (names[a.id] ? { ...a, name: names[a.id] } : a));
}
export function hiddenOf(accounts, prefs) {
  const names = prefs?.names ?? {}, hidden = new Set(prefs?.hidden ?? []);
  return (accounts ?? []).filter((a) => hidden.has(a.id)).map((a) => (names[a.id] ? { ...a, name: names[a.id] } : a));
}

// A new account's id from the name typed: lowercase letters, digits and dashes, at most 24 (herdr_task/accounts.py ID).
export function accountId(name) {
  return String(name ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/, "");
}
// Why a name can't be a new account, or "" when it can.
export function addProblem(name, accounts) {
  const id = accountId(name);
  if (!String(name ?? "").trim()) return "Give it a name.";
  if (!id) return "Use letters or digits in the name.";
  if (id === "default") return "Default is ~/.claude itself.";
  if ((accounts ?? []).some((a) => a.id === id)) return `There is already an account in ~/.claude-${id}.`;
  return "";
}
// A rename's name: trimmed, one line, at most 40; "" keeps the folder's own name.
export const cleanName = (name) => String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

// An account's error as a short line.
export const ERRORS = {
  "signed-out": "Signed out",
  "no-plan": "No plan limits",
  "no-cli": "Not installed here",
  error: "Usage unavailable",
};
// An account's error line: herdr-usage's reason when it gave one ("Its sign-in is due for renewal: ..."), else ours.
export const errorLine = (a) => (a?.error ? (a.why || ERRORS[a.error] || ERRORS.error) : "");

const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const pctText = (p) => (n(p) === null ? "–" : `${Math.round(p)}%`);

// "resets 3h 12m": days and hours past a day, hours and minutes under it, minutes under an hour.
export function resetsIn(iso, now = Date.now()) {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return "";
  const m = Math.max(0, Math.round((at - now) / 60000));
  if (m < 1) return "now";
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return mm ? `${h}h ${mm}m` : `${h}h`;
  return `${mm}m`;
}
export const resetsLine = (iso, now) => {
  const r = resetsIn(iso, now);
  return r ? (r === "now" ? "resets now" : `resets ${r}`) : "";
};

// "Sat 09:00" in local time: when the week starts again.
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function resetsWhen(iso) {
  const at = iso ? new Date(iso) : null;
  if (!at || !Number.isFinite(at.getTime())) return "";
  const hh = String(at.getHours()).padStart(2, "0"), mm = String(at.getMinutes()).padStart(2, "0");
  return `${DAY[at.getDay()]} ${hh}:${mm}`;
}

// Kept numbers (keepGood's `stale`) as "as of 10:42", with the day once it isn't today; "" when they're fresh.
export function staleLine(a, now = Date.now()) {
  const at = a?.stale ? new Date(a.stale) : null;
  if (!at || !Number.isFinite(at.getTime())) return "";
  const hm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return new Date(now).toDateString() === at.toDateString() ? `as of ${hm}` : `as of ${DAY[at.getDay()]} ${hm}`;
}

// The switch point: 50 to 95 in steps of 5. Whether it switches at all is its own pick (prefs.auto).
export const SWITCH_DEFAULT = 95;
export const clampSwitch = (v) => Math.min(95, Math.max(50, Math.round((n(v) ?? SWITCH_DEFAULT) / 5) * 5));
// Amber this far under the switch point (Doop App 02/04: 59% is amber, 51% green at 95).
export const AMBER_WITHIN = 40;

// A meter's colour: red at or past the switch point, amber within AMBER_WITHIN of it, else green.
export function meterTone(pct, switchAt = SWITCH_DEFAULT) {
  if (n(pct) === null) return "none";
  if (pct >= switchAt) return "red";
  if (pct >= switchAt - AMBER_WITHIN) return "amber";
  return "green";
}

const strs = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
// ~/.herdr/accounts.json as the window uses it. Note: switch_at 100 used to mean "never switch"; it reads as auto off.
export function normPrefs(p) {
  const d = p && typeof p === "object" ? p : {};
  const old = n(d.switch_at) !== null && d.switch_at >= 100;
  const names = d.names && typeof d.names === "object"
    ? Object.fromEntries(Object.entries(d.names).filter(([, v]) => typeof v === "string")) : {};
  return {
    active: typeof d.active === "string" ? d.active : null,
    switch_at: old ? SWITCH_DEFAULT : clampSwitch(d.switch_at),
    auto: typeof d.auto === "boolean" ? d.auto : !old,
    running: d.running === "moves" ? "moves" : "stays",
    undo: typeof d.undo === "boolean" ? d.undo : true,
    names, hidden: strs(d.hidden), order: strs(d.order), skipped: strs(d.skipped),
    moving: movingOf(d.moving),
  };
}

// The move the switch rule asked herdr-task for (running "moves"): { from: [ids], to, at }, else null.
function movingOf(m) {
  if (!m || typeof m !== "object" || typeof m.to !== "string" || n(m.at) === null) return null;
  const from = strs(m.from).filter((x) => x !== m.to);
  return from.length ? { from, to: m.to, at: m.at } : null;
}
// After an automatic switch with running "moves": tasks leave the old account, and the accounts an earlier move was
// still emptying when this one switches on from where that move went.
export function movingAfter(prev, d, at = Date.now()) {
  const before = prev && prev.to === d.from.id ? prev.from : [];
  return movingOf({ from: [...new Set([...before, d.from.id])], to: d.to.id, at });
}

const meter = (a, id) => (a?.meters ?? []).find((m) => m.id === id) ?? null;
export const session = (a) => meter(a, "session");
export const weekly = (a) => meter(a, "weekly");
// The model weeks (Fable, Opus, ...), as the endpoint names them.
export const models = (a) => (a?.meters ?? []).filter((m) => m.id !== "session" && m.id !== "weekly");

// What decides a switch: the 5h session window only (Doop App 05).
export const binding = (a) => n(session(a)?.pct);

// The accounts in the person's switch order (prefs.order), the ones not in it after, as found.
export function ordered(accounts, prefs) {
  const at = new Map((prefs?.order ?? []).map((id, i) => [id, i]));
  return (accounts ?? []).map((a, i) => [a, at.has(a.id) ? at.get(a.id) : 1e6 + i]).sort((x, y) => x[1] - y[1]).map(([a]) => a);
}
// The order with `id` moved by `delta` places (Move up / down).
export function moved(accounts, prefs, id, delta) {
  const ids = ordered(accounts, prefs).map((a) => a.id);
  const i = ids.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}
// Which edge of `to`'s row a dragged `from` lands on: below it when coming from above, else above it.
export function dropEdge(accounts, prefs, from, to) {
  const ids = ordered(accounts, prefs).map((a) => a.id);
  const i = ids.indexOf(from), j = ids.indexOf(to);
  return i >= 0 && i < j ? "bottom" : "top";
}
// The order with `from` dropped on `to`'s row (Settings > Accounts' drag), at dropEdge's side.
export function dropped(accounts, prefs, from, to) {
  const ids = ordered(accounts, prefs).map((a) => a.id);
  if (from === to || !ids.includes(from) || !ids.includes(to)) return ids;
  const below = dropEdge(accounts, prefs, from, to) === "bottom";
  const rest = ids.filter((id) => id !== from);
  rest.splice(rest.indexOf(to) + (below ? 1 : 0), 0, from);
  return rest;
}
export const skipped = (a, prefs) => (prefs?.skipped ?? []).includes(a?.id);

// The account new work starts on: the one picked, else the first that works, else the first.
export function activeOf(accounts, prefs) {
  const list = accounts ?? [];
  return list.find((a) => a.id === prefs?.active) ?? list.find((a) => !a.error) ?? list[0] ?? null;
}

// Where new work goes once the active one passes the switch point: the first in the switch order that isn't
// skipped, works, and has room in its 5h window.
export function nextAccount(accounts, activeId, switchAt = SWITCH_DEFAULT, prefs = null) {
  return ordered(accounts, prefs).find((a) => a.id !== activeId && !a.error && !skipped(a, prefs)
    && binding(a) !== null && binding(a) < switchAt) ?? null;
}

// An automatic switch due now: switching on, the active account's 5h window at or past the point, another with room.
export function dueSwitch(accounts, prefs) {
  const at = clampSwitch(prefs?.switch_at);
  const from = activeOf(accounts, prefs);
  if (!from || prefs?.auto === false || binding(from) === null || binding(from) < at) return null;
  const to = nextAccount(accounts, from.id, at, prefs);
  if (!to) return null;
  return { from, to, at, why: `${from.name} passed ${at}% of its 5h window` };
}

// The rule row's second line.
export function switchLine(accounts, prefs) {
  if (prefs?.auto === false) return "Never switches by itself";
  const at = clampSwitch(prefs?.switch_at);
  const from = activeOf(accounts, prefs);
  const to = from && nextAccount(accounts, from.id, at, prefs);
  if ((accounts ?? []).length < 2) return "Add a second account to switch to";
  return to ? `Then new work goes to ${to.name}` : "No other account has room";
}

// The status bar's rule: "switch at 95% · Personal next"; null with one account.
export function statusSwitch(accounts, prefs) {
  if ((accounts ?? []).length < 2) return null;
  if (prefs?.auto === false) return "switching off";
  const at = clampSwitch(prefs?.switch_at);
  const from = activeOf(accounts, prefs);
  const to = from && nextAccount(accounts, from.id, at, prefs);
  return `switch at ${at}% · ${to ? `${to.name} next` : "none next"}`;
}

// A row's badge in Settings > Accounts: "default" (new work starts there), "next", "skipped", or null.
export function badgeOf(a, accounts, prefs) {
  const active = activeOf(accounts, prefs);
  if (a.id === active?.id) return "default";
  if (skipped(a, prefs)) return "skipped";
  if (prefs?.auto !== false && active && nextAccount(accounts, active.id, clampSwitch(prefs?.switch_at), prefs)?.id === a.id) return "next";
  return null;
}

// The switch toast (Doop App 04): who passed the point, and what starts where now. `ref`: the next queued task.
export function switchToast(d, ref = null, running = "stays") {
  const first = ref ? `${ref} will start on ${d.to.name}.` : `New tasks start on ${d.to.name}.`;
  const rest = running === "moves" ? `Running tasks move to ${d.to.name} between turns.` : `Running tasks stay on ${d.from.name}.`;
  return { title: `New work now goes to ${d.to.name}`, sub: d.why, body: `${first} ${rest}` };
}

// The next task to start: the earliest queued one in these task lists (~/.herdr/tasks/*.json), as "SHE-15".
export function nextQueued(lists) {
  const q = [];
  for (const l of lists ?? []) {
    for (const t of l?.tasks ?? []) if (t?.state === "queued") q.push({ at: String(t.queued_at ?? ""), ref: l.prefix ? `${l.prefix}-${t.id}` : String(t.id) });
  }
  return q.sort((x, y) => x.at.localeCompare(y.at))[0]?.ref ?? null;
}

// An account's initial, for its avatar.
export const initial = (name) => (String(name ?? "").trim()[0] ?? "?").toUpperCase();
// A row's usage words: "59% 5h · 51% wk".
export const usageShort = (a) => [session(a) ? `${pctText(session(a).pct)} 5h` : null, weekly(a) ? `${pctText(weekly(a).pct)} wk` : null]
  .filter(Boolean).join(" · ");

// Another machine's plan windows (lib/machines.js stats: { name, used, resets_at ms }) as meters.
export function metersOf(windows) {
  const out = [];
  for (const w of windows ?? []) {
    const p = n(w?.used);
    if (p === null) continue;
    const at = n(w.resets_at) !== null ? new Date(w.resets_at).toISOString() : null;
    const name = String(w.name ?? "");
    const label = (/^Weekly \((.+?)(?: only)?\)$/.exec(name)?.[1] ?? /^(.+?) · (?:Weekly|5-hour)$/.exec(name)?.[1] ?? name).trim().slice(0, 24) || "Limit";
    const m = name === "5-hour" ? { id: "session", label: "Session" }
      : name === "Weekly" || name === "Weekly (all models)" ? { id: "weekly", label: "Weekly" }
      : { id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "limit", label, model: true };
    if (!out.some((x) => x.id === m.id)) out.push({ ...m, pct: p, resets_at: at });
  }
  const rank = (m) => (m.id === "session" ? 0 : m.id === "weekly" ? 1 : 2);
  return out.sort((x, y) => rank(x) - rank(y));
}

// A path cut in the middle so both ends show (overflow rule R2): "~/.claude-…/work-account".
export function midCut(s, max = 28) {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  const keep = max - 1, head = Math.ceil(keep / 2);
  return `${t.slice(0, head)}…${t.slice(t.length - (keep - head))}`;
}

// A card's second line: "Max · ~/.claude-personal", the path cut in the middle.
export const accountSub = (a, max = 28) => [a?.plan, midCut(a?.folder, max)].filter(Boolean).join(" · ");

// The 7-day chart: one bar per day, oldest first, heights in px out of `tall`; today's labelled "Today".
export function weekBars(days, tall = 60) {
  const list = (days ?? []).slice(-7);
  const max = Math.max(0, ...list.map((d) => d.tokens || 0));
  return list.map((d, i) => {
    const at = new Date(`${d.date}T12:00:00`);
    const label = i === list.length - 1 ? "Today" : DAY[at.getDay()] ?? "";
    const h = max > 0 && d.tokens > 0 ? Math.max(3, Math.round((d.tokens / max) * tall)) : 2;
    return { label, h, today: i === list.length - 1, tokens: d.tokens || 0 };
  });
}

// The week by space: each space's share of the week's tokens as its part of the weekly meter (or of 100 when the
// week is unknown), most first. Five rows, then "N more" (overflow rule R4). frac is the bar against the biggest.
export function spaceSplit(spaces, weeklyPct = null, limit = 5) {
  const list = (spaces ?? []).filter((s) => s.tokens > 0);
  const total = list.reduce((x, s) => x + s.tokens, 0);
  if (!total) return { rows: [], more: 0 };
  const scale = n(weeklyPct) ?? 100;
  const top = list[0].tokens;
  const rows = list.slice(0, limit).map((s) => ({ name: s.name, pct: (s.tokens / total) * scale, frac: s.tokens / top }));
  return { rows, more: Math.max(0, list.length - limit) };
}

// The status bar's pill: the active account's name, its session, its week and its first model week.
export function pillParts(a) {
  if (!a) return null;
  const m = models(a)[0];
  return {
    name: a.name,
    session: session(a) ? `${pctText(session(a).pct)} 5h` : null,
    sessionPct: session(a)?.pct ?? null,
    rest: [weekly(a) ? `${pctText(weekly(a).pct)} wk` : null, m ? `${pctText(m.pct)} ${m.label}` : null].filter(Boolean).join(" · "),
    error: a.error ? ERRORS[a.error] ?? ERRORS.error : null,
  };
}

// "Updated just now", "Updated 4 min ago".
export function updatedLine(iso, now = Date.now()) {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return WORDS.loading;
  const m = Math.floor((now - at) / 60000);
  return m < 1 ? "Updated just now" : m < 60 ? `Updated ${m} min ago` : `Updated ${Math.floor(m / 60)}h ago`;
}

// Sizes the popover is drawn with, so the overlay is as tall as it (mods/workspace-status-chat/usage.js).
export const POP = { width: 420, detail: 360, gap: 8, head: 64, seg: 46, card: 56, meterRow: 20, cardPad: 22,
  gapCards: 10, rule: 66, foot: 54, maxShare: 0.7 };
export function popoverHeight(accounts, tab = "claude") {
  const list = tab === "codex" ? [{ meters: [1, 2] }] : accounts ?? [];
  const cards = list.reduce((h, a) => h + POP.card + POP.cardPad + Math.max(1, (a.meters ?? []).length) * POP.meterRow, 0)
    + Math.max(0, list.length - 1) * POP.gapCards;
  const rule = tab === "claude" && list.length ? POP.rule + POP.gapCards : 0;
  return POP.head + POP.seg + 12 + Math.max(cards, 64) + rule + POP.foot;
}
// The overlay's height: the popover's, at most 70% of the window (overflow rule R8); the list scrolls inside.
export const capHeight = (px, windowHeight) => Math.round(Math.min(px, (n(windowHeight) ?? 860) * POP.maxShare));

// A read that failed for a moment keeps an account's last good numbers (`stale`: when they were read); signed out
// still shows as such, since the person must act.
export function keepGood(prev, next) {
  if (!prev || !next) return next;
  const hold = (a, old) => (!a || !a.error || a.error === "signed-out" || (a.meters ?? []).length || !(old?.meters ?? []).length ? a
    : { ...a, meters: old.meters, plan: a.plan ?? old.plan, error: null, why: null, stale: old.stale ?? prev.at ?? null });
  const was = new Map((prev.claude ?? []).map((a) => [a.id, a]));
  return { ...next, claude: (next.claude ?? []).map((a) => hold(a, was.get(a.id))), codex: hold(next.codex, prev.codex) };
}

// ---- another machine's accounts ----------------------------------------------------------------------------------
// Settings > Accounts' machine switch and Settings > Machines' cards read and change another machine's accounts by
// running herdr-task there (`accounts list | set | move`, herdr_task/accounts.py) with herdr's exec on that machine.
// exec(cmd, args, { on }) -> { code, stdout, stderr }: herdr's exec, or a fake in tests.
const ON_MACHINE = 'exec "$HOME/.local/bin/herdr-task" "$@"';
export async function remoteTask(exec, machine, argv) {
  const r = await exec("sh", ["-c", ON_MACHINE, "herdr-task", ...argv, "--json"], { on: machine });
  const line = String(r?.stdout ?? "").split("\n").filter((l) => l.startsWith("{")).pop();
  let out = null;
  try { out = line ? JSON.parse(line) : null; } catch { out = null; }
  if (r?.code !== 0 || !out || out.error) {
    throw new Error(out?.error || String(r?.stderr ?? "").trim().split("\n").pop() || "herdr-task didn't answer there");
  }
  return out;
}
// What `accounts list` printed, as the local view's accounts and prefs: a signed-out account carries its tasks.
export function remoteView(d) {
  const list = (Array.isArray(d?.accounts) ? d.accounts : []).filter((a) => typeof a?.id === "string").map((a) => ({
    id: a.id, name: String(a.name ?? a.id), folder: String(a.folder ?? ""), plan: null, meters: [], account: a.account ?? null,
    error: a.signed_in ? null : "signed-out", tasks: (Array.isArray(a.tasks) ? a.tasks : []).filter((t) => typeof t?.ref === "string"),
  }));
  return { accounts: list, prefs: normPrefs(d) };
}
export const readRemote = async (exec, machine) => remoteView(await remoteTask(exec, machine, ["accounts", "list"]));
// One change to that machine's picks (Set as default, Skip, the order, ...): what it holds after.
export const setRemote = async (exec, machine, change) => remoteView(await remoteTask(exec, machine, ["accounts", "set", JSON.stringify(change)]));
// Its running tasks on `from` move to `to` there (idle ones now, stopped ones resume there, working ones are listed).
export const moveRemote = (exec, machine, from, to = "default") => remoteTask(exec, machine, ["accounts", "move", "--from", from, "--to", to]);

// A signed-out account's line: "EVL-3 and EVL-4 in eval-runner are paused until it signs in".
export function pausedLine(tasks) {
  const list = (tasks ?? []).map((t) => t.ref);
  if (!list.length) return "";
  const names = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  const where = [...new Set((tasks ?? []).map((t) => t.folder).filter(Boolean))];
  return `${names}${where.length === 1 ? ` in ${where[0]}` : ""} ${list.length === 1 ? "is" : "are"} paused until it signs in`;
}
