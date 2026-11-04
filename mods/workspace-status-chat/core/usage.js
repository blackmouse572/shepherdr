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
  weekChart: "Weekly use, last 7 days",
  bySpace: "This week by space",
  detail: "Usage detail",
  checks: "checks every 5 min",
  loading: "Reading usage…",
  noAccounts: "No Claude account on this computer yet. Sign in with claude, and it shows here.",
  codexOut: "Codex isn't signed in here. Run codex login.",
  addHow: "Another account is another Claude folder: run CLAUDE_CONFIG_DIR=~/.claude-<name> claude and sign in. It shows here within 5 minutes.",
  accounts: "Accounts",
  accountsAbout: "The Claude accounts and the Codex sign-in on this computer, what each has used, and which one new work starts on.",
  newWork: "New tasks start on the ACTIVE account; a task you resume stays on the account it started on.",
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

// The switch point: 50 to 100 in steps of 5; 100 is "never switch".
export const SWITCH_DEFAULT = 95;
export const clampSwitch = (v) => Math.min(100, Math.max(50, Math.round((n(v) ?? SWITCH_DEFAULT) / 5) * 5));

// A meter's colour: red at or past the switch point, amber within 20 of it, else green.
export function meterTone(pct, switchAt = SWITCH_DEFAULT) {
  if (n(pct) === null) return "none";
  if (pct >= switchAt) return "red";
  if (pct >= switchAt - 20) return "amber";
  return "green";
}

const meter = (a, id) => (a?.meters ?? []).find((m) => m.id === id) ?? null;
export const session = (a) => meter(a, "session");
export const weekly = (a) => meter(a, "weekly");
// The model weeks (Fable, Opus, ...), as the endpoint names them.
export const models = (a) => (a?.meters ?? []).filter((m) => m.id !== "session" && m.id !== "weekly");

// What decides a switch: the fuller of the session and the week.
export function binding(a) {
  const ps = [session(a)?.pct, weekly(a)?.pct].filter((p) => n(p) !== null);
  return ps.length ? Math.max(...ps) : null;
}

// The account new work starts on: the one picked, else the first that works, else the first.
export function activeOf(accounts, prefs) {
  const list = accounts ?? [];
  return list.find((a) => a.id === prefs?.active) ?? list.find((a) => !a.error) ?? list[0] ?? null;
}

// Where new work goes once the active one passes the switch point: the emptiest other working account under it.
export function nextAccount(accounts, activeId, switchAt = SWITCH_DEFAULT) {
  return (accounts ?? []).filter((a) => a.id !== activeId && !a.error && n(binding(a)) !== null && binding(a) < switchAt)
    .sort((x, y) => binding(x) - binding(y))[0] ?? null;
}

// An automatic switch due now: the active account at or past the point and another under it. 100 never switches.
export function dueSwitch(accounts, prefs) {
  const at = clampSwitch(prefs?.switch_at);
  const from = activeOf(accounts, prefs);
  if (!from || at >= 100 || n(binding(from)) === null || binding(from) < at) return null;
  const to = nextAccount(accounts, from.id, at);
  if (!to) return null;
  const which = (session(from)?.pct ?? -1) >= at ? "5h window" : "week";
  return { from, to, at, why: `${from.name} passed ${at}% of its ${which}` };
}

// The rule row's second line.
export function switchLine(accounts, prefs) {
  const at = clampSwitch(prefs?.switch_at);
  if (at >= 100) return "Never switches by itself";
  const from = activeOf(accounts, prefs);
  const to = from && nextAccount(accounts, from.id, at);
  if ((accounts ?? []).length < 2) return "Add a second account to switch to";
  return to ? `Then new work goes to ${to.name}` : "No other account has room";
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
export const POP = { width: 420, detail: 360, gap: 8, head: 64, seg: 46, card: 44, meterRow: 20, cardPad: 22,
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
