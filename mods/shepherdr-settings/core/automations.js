// Settings › Autopilot's cards (Doop App 11): the automations herdr-task keeps (`herdr-task auto list --all --json`) and
// the wakes it logged per space (~/.herdr/tasks/.autopilot.json, each space's last 10). Plain JS: bin/sync-shared copies
// it into mods/shepherdr-settings/core/.

export const CARDS = {
  beat: "Heartbeat",
  wakes: "When it wakes",
  wakesSub: "Every space it's on in",
  autos: "Automations",
  autosSub: "Saved tasks a time or an event adds again",
  noAutos: "None yet. Ask an Assistant to set one up.",
  autosOff: "Off: Run automations is off in Tasks.",
  log: "Recent wakes",
  logSub: "Every space's, newest first",
  noWakes: "No wakes yet.",
};

const span = (ms) => {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
};
export const agoWords = (at, now = Date.now()) => (now - at < 60000 ? "just now" : `${span(now - at)} ago`);

// A space as the screens call it (herdr-task's shown_name): its name, else its folder's last part, "Home" at home.
export function spaceWord(v, home = "") {
  if (v?.name && v.name !== "~") return v.name;
  const folder = String(v?.folder ?? "").replace(/\/+$/, "");
  return !folder || folder === String(home).replace(/\/+$/, "") ? "Home" : folder.split("/").pop();
}

// The newest wakes over every space: [{ at, space, reason, outcome }], at most n.
export function recentWakes(file, n = 6, home = "") {
  const out = [];
  for (const v of Object.values(file?.spaces ?? {})) {
    for (const w of v?.wakes ?? []) if (w?.at) out.push({ at: w.at, space: spaceWord(v, home), reason: w.reason ?? "", outcome: w.outcome ?? "" });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, n);
}

// "10:28", or "Mon 10:28" before today.
export function clock(at, today = new Date()) {
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === today.toDateString() ? hm : `${d.toLocaleDateString("en", { weekday: "short" })} ${hm}`;
}

// An automation's line under its prompt: its last run and the task it added, a failure, or that it hasn't run.
export function autoMeta(v, now = Date.now()) {
  if (v?.last_error?.message) return { tone: "error", words: v.last_error.message };
  if (v?.last_run) return { tone: "done", words: [`Ran ${agoWords(v.last_run, now)}`, v.last_task ? `added ${v.last_task}` : null].filter(Boolean).join(" · ") };
  return { tone: "idle", words: "Hasn't run yet" };
}
