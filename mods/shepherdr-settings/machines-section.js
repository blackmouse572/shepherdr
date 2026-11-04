// Settings > Machines (HERD-40), as Shepherdr's Machine settings and its health and plan-limits
// views. Machine-only settings live here as rows (there is no machine scope any more):
// - When new tasks wait, for all machines: start limits ("machine" in Everywhere's layer of
//   ~/.herdr/shepherdr.json: { start_load (× cores, shown as a percent of all cores),
//   start_memory, start_disk }; herdr-task's tick holds queued tasks by them), and how task agents
//   run (low_priority, worker_memory; HERD-61, herdr-task's machine_option()).
// - Then each machine: its health and what is left of each agent CLI's plan (machines.js), its
//   Home Assistant, and its own limits (machines[key].machine) when it sets any ("Set its own").
// Values a machine set for all its spaces before (agents, tasks: the old machine scope) still
// apply there (herdr-task's settings_for and coordinator.js read them); they show on that
// machine with Reset, and nothing new is written there.

// Doop App 09: the page is a card per machine (its banner, Connected / Needs you, its spaces, terminals, agents and
// accounts, and what needs the person there: a signed-out account, a waiting core), then the limits for every machine.
// Note: the design drops the health, plan usage, Home Assistant and limit rows; they stay, inside each card.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { machines, spaces, updates, run, home, readTextFile, setShared, hc } from "herdr";
import { HOLD, machineDetails, pollNow, statsOf } from "./machines.js";
import { LOCAL_MACHINE } from "./coordinator.js";
import { TEXT, button, link, toggleSwitch, need, green, working, toast, plainError } from "./ui.js";
import { accounts, prefs, signIn, logo, MONO } from "./usage-data.js";
import { skipped as isSkipped } from "./core/usage.js";
import { machineCard, machineCounts, cardNeedsYou } from "./core/machines.js";
import { card } from "./accounts-section.js";
// The rows' words, a machine block's and Home Assistant's lines: core/settings.js, shared with the web app.
import { MACHINES, OLD_NAMES, SECTIONS, CHANGED_HERE, RESET, SAME_AS_ALL_MACHINES, machinesOwn, homeAbout, machineLabel } from "./core/settings.js";

const I = (name) => `mods/shepherdr-settings/${name}.svg`;

const pct = (v) => (v == null ? "Off" : `${v}%`);
const words = (field) => MACHINES.limits.find((l) => l.field === field);
const LIMITS = [
  { ...words("start_memory"), step: 5, lo: 10, hi: 100, fmt: pct },
  { ...words("start_load"), step: 0.25, lo: 0.25, hi: 4, fmt: (v) => (v == null ? "Off" : `${Math.round(v * 100)}%`) },
  { ...words("start_disk"), step: 5, lo: 10, hi: 100, fmt: pct },
];
const CAPS = [0, 1, 2, 4, 8, 16, 32];
const OPTION_DEFAULTS = { low_priority: true, worker_memory: 0 };
const FIELDS = [...LIMITS.map((l) => l.field), "low_priority", "worker_memory"];

const toMachine = (key) => (key === LOCAL_MACHINE ? null : key); // machines.js: null is this computer
const label = machineLabel;
const keysNow = () => [LOCAL_MACHINE, ...machines().filter((m) => m.name && !m.temporary).map((m) => m.name)];

// How each machine is reached (hc machine ls: target, via) and how long this computer's core is up (hc server status),
// for the cards' lines: every 30 s while the page shows.
let reach = { machines: {}, uptime: null, at: 0 };
function readReach(cx) {
  if (Date.now() - reach.at < 30000) return;
  reach.at = Date.now();
  cx.spawn(async (cx) => {
    const json = async (args) => { try { const r = await hc([...args, "--json"]); return r.code === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } };
    const [ls, st] = await Promise.all([json(["machine", "ls"]), json(["server", "status"])]);
    const at = Date.now();
    reach = { machines: Object.fromEntries((ls?.machines ?? []).map((m) => [m.name, m])), uptime: st?.uptime_ms ?? null, upAt: at, at };
    cx.notify();
  });
}

// Reads plan limits older than a minute the first time the section shows.
function askOnce(view, cx) {
  if (view._machinesAsked) return;
  view._machinesAsked = true;
  cx.spawn(async (cx) => { await pollNow({ limitsOlder: 60000 }); cx.notify(); });
}

// Home Assistant (HERD-51), as Shepherdr's home spaces: a machine's home space (its ~) has an
// Assistant that also looks after the machine; this computer's keeps every machine's overview.
// Per machine in ~/.herdr/shepherdr.json machines[key].home; unset, on for this computer only.
// What herdr-task's home round last found (~/.herdr/tasks/.home.json) says how each is now.
export const homeOn = (cfg, key) => {
  const v = cfg?.machines?.[key]?.home;
  return typeof v === "boolean" ? v : key === LOCAL_MACHINE;
};
function readHome(view, cx) {
  if (view._homeAt && Date.now() - view._homeAt < 15000) return;
  view._homeAt = Date.now();
  cx.spawn(async (cx) => {
    try { view._home = JSON.parse((await readTextFile(`${home()}/.herdr/tasks/.home.json`)) ?? "{}") ?? {}; } catch { view._home = {}; }
    cx.notify();
  });
}
function homeRow(view, t, k) {
  const on = homeOn(view.cfg, k), st = view._home?.machines?.[k];
  const make = () => setShared("home.makereq", { machine: toMachine(k), at: Date.now() });
  const set = (_next, _e, cx) => {
    view.change((next) => {
      const layer = ((next.machines ??= {})[k] ??= {});
      // Kept only where it differs from the default (on for this computer only).
      if (!on === (k === LOCAL_MACHINE)) delete layer.home;
      else layer.home = !on;
      if (!Object.keys(layer).length) delete next.machines[k];
    }, cx);
    if (!on) make();
    view._homeAt = 0;
  };
  const about = homeAbout(on, st);
  const missing = on && !st?.space && !st?.error && view._home;
  return view.row(t, MACHINES.home.title, about, h_flex().gap(10).items_center()
    .when(Boolean(missing), (el) => el.child(button(`home-make-${k}`, MACHINES.home.make, { onClick: () => make() })))
    .child(toggleSwitch(`home-${k}`, on, set)));
}

// Writes one machine setting: for all machines (key null) or one machine's own; undefined drops it.
function write(view, key, field, value, cx) {
  view.change((next) => {
    const layer = key ? ((next.machines ??= {})[key] ??= {}) : (next.everywhere ??= {});
    const m = { ...(layer.machine ?? {}) };
    if (value === undefined) delete m[field];
    else m[field] = value;
    if (Object.keys(m).length) layer.machine = m;
    else delete layer.machine;
    if (key && !Object.keys(layer).length) delete next.machines[key];
  }, cx);
}

// The five rows, for all machines (key null) or one machine's own. Under each: on all machines,
// how many set their own; on a machine, "Same as all machines" or "Changed here · Reset".
function limitRows(view, t, key) {
  const every = view.cfg.everywhere?.machine ?? {};
  const own = key ? view.cfg.machines?.[key]?.machine ?? {} : every;
  const base = (f) => (f in every ? every[f] : f in HOLD ? HOLD[f] : OPTION_DEFAULTS[f]);
  const valueOf = (f) => (f in own ? own[f] : base(f));
  const id = (f) => `${key ?? "all"}-${f}`;
  const line = (f) => {
    const row = h_flex().gap(6).items_center().text_size(TEXT.label);
    if (key) {
      return f in own
        ? row.child(div().text_color(t.muted).child(CHANGED_HERE)).child(div().text_color(t.dim).child("·"))
          .child(link(`ml-reset-${id(f)}`, RESET, (_e, cx) => write(view, key, f, undefined, cx)))
        : row.child(div().text_color(t.dim).child(SAME_AS_ALL_MACHINES));
    }
    const n = Object.values(view.cfg.machines ?? {}).filter((m) => f in (m?.machine ?? {})).length;
    return n ? row.child(div().text_color(t.dim).child(machinesOwn(n))) : null;
  };
  // Set to what it would be anyway: on a machine, it follows all machines again.
  const put = (f, v, cx) => write(view, key, f, key && JSON.stringify(v) === JSON.stringify(base(f)) ? undefined : v, cx);
  const rows = LIMITS.map((l) => {
    const v = valueOf(l.field);
    const step = (d) => (_e, cx) => put(l.field, Math.round(Math.max(l.lo, Math.min(l.hi, (v ?? HOLD[l.field]) + d)) * 100) / 100, cx);
    return view.row(t, l.title, l.about, view.stepper(t, `ml-${id(l.field)}`, l.fmt(v), step(-l.step), step(l.step)), null, null, line(l.field));
  });
  const low = valueOf("low_priority") !== false;
  const cap = Number(valueOf("worker_memory")) || 0;
  const capStep = (d) => (_e, cx) => put("worker_memory", CAPS[Math.max(0, Math.min(CAPS.length - 1, CAPS.findIndex((c) => c >= cap) + d))], cx);
  rows.push(
    view.row(t, MACHINES.low.title, MACHINES.low.about,
      toggleSwitch(`ml-${id("low")}`, low, (next, _e, cx) => put("low_priority", next, cx)), null, null, line("low_priority")),
    view.row(t, MACHINES.cap.title, MACHINES.cap.about,
      view.stepper(t, `ml-${id("cap")}`, cap ? `${cap} GB` : "Off", capStep(-1), capStep(1)), null, null, line("worker_memory")));
  return rows;
}

// One machine: its health and plans, its Home Assistant, its own limits, and what it set before.
function machineBlock(view, t, k) {
  const layer = view.cfg.machines?.[k] ?? {};
  const ownLimits = FIELDS.some((f) => f in (layer.machine ?? {}));
  view._machOpen ??= {};
  const open = ownLimits || view._machOpen[k];
  const old = Object.entries(layer).filter(([key]) => !["machine", "home"].includes(key))
    .flatMap(([key, v]) => (["tasks", "automations"].includes(key) && v && typeof v === "object" ? Object.keys(v).map((f) => (key === "automations" ? key : f)) : [key]));
  const oldNames = [...new Set(old.map((x) => OLD_NAMES[x] ?? x))];
  const dropOld = (_e, cx) => view.change((next) => {
    const l = next.machines?.[k];
    if (!l) return;
    for (const key of Object.keys(l)) if (!["machine", "home"].includes(key)) delete l[key];
    if (!Object.keys(l).length) delete next.machines[k];
  }, cx);
  const m = toMachine(k), local = k === LOCAL_MACHINE;
  const info = cardOf(k);
  const attention = cardNeedsYou(info);
  const rows = v_flex().w_full().px(14)
    .child(homeRow(view, t, k))
    .when(!open, (el) => el.child(view.row(t, MACHINES.own.title, MACHINES.own.about,
      button(`ml-own-${k}`, MACHINES.own.button, { onClick: () => { view._machOpen[k] = true; } }))))
    .when(Boolean(open), (el) => el.children(limitRows(view, t, k)))
    .when(oldNames.length > 0, (el) => el.child(view.row(t, MACHINES.old.title, MACHINES.old.about(oldNames),
      button(`ml-old-${k}`, RESET, { onClick: dropOld }))));
  return card(t, `mach-${k}`, {
    lead: svg(I(local ? "monitor" : "server")).size(16).flex_none().text_color(attention ? need() : t.muted),
    title: label(k), sub: info.sub, right: stateBadge(t, k, info), state: attention ? "attention" : "neutral",
  }, [
    ...(info.state === "offline" || info.state === "connecting"
      ? [alertRow(t, `${k}-wait`, null, info.state === "offline" ? MACHINES.offline : MACHINES.connecting, null, null, true)] : []),
    ...info.alerts.map((a, i) => alertFor(t, k, a, i)),
    statsRow(t, k, m, local),
    div().w_full().px(14).py(12).border_t(1).border_color(t.border).child(machineDetails(t, m)),
    rows,
  ]);
}

// What a machine's card says now (core/machines.js machineCard).
function cardOf(k) {
  const local = k === LOCAL_MACHINE, m = toMachine(k);
  const link = local ? null : reach.machines[m];
  return machineCard({ local, layout: machines().find((x) => x.name === m)?.layout ?? "ready", stats: statsOf(m),
    core: local ? updates()?.core : null, accounts: local ? accounts() : [],
    uptime: local && reach.uptime != null ? reach.uptime + Date.now() - reach.upAt : null, target: link?.target ?? null, via: Boolean(link?.via) });
}

// Some machine needs the person (a signed-out account, out of reach): the nav's Machines gets a dot.
export const machinesNeedYou = () => keysNow().some((k) => cardNeedsYou(cardOf(k)));

// The header's badge: a dot and its state's word (a ring spinning while it connects).
function stateBadge(t, k, info) {
  const tone = info.state === "connected" ? green() : info.state === "connecting" ? working() : need();
  const attention = info.state !== "connected" && info.state !== "connecting";
  return h_flex().id(`mach-badge-${k}`).h(20).px(8).gap(5).flex_none().items_center().rounded(10).border_1()
    .border_color(attention ? `${need()}73` : t.input).font_family(MONO).text_size(TEXT.id - 0.5).font_medium()
    .text_color(attention ? need() : t.muted)
    .child(info.state === "connecting"
      ? svg(I("spinner")).size(11).flex_none().text_color(tone).spin(900)
      : div().size(7).flex_none().rounded(4).bg(tone))
    .child(info.words);
}

// One thing that needs the person, on the card: its icon, what and why, then its fix.
function alertRow(t, id, icon, title, about, control, quiet = false) {
  return h_flex().id(`mach-al-${id}`).w_full().px(14).py(11).gap(12).items_center().border_b(1).border_color(t.border)
    .when(Boolean(icon), (el) => el.child(svg(I(icon)).size(16).flex_none().text_color(icon === "login" ? need() : t.muted)))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().text_size(TEXT.body).text_color(quiet ? t.muted : t.foreground).child(title))
      .when(Boolean(about), (el) => el.child(div().text_size(TEXT.label - 0.5).line_height("16px").text_color(t.dim).child(about))))
    .when(Boolean(control), (el) => el.child(div().flex_none().child(control)));
}

function alertFor(t, k, a, i) {
  const local = k === LOCAL_MACHINE;
  if (a.kind === "core") {
    const busy = Boolean(updates()?.core?.updating);
    return alertRow(t, `${k}-${i}`, "download", MACHINES.coreReady(a.ready), updates()?.core?.error || MACHINES.coreAbout(a.version),
      button(`mach-core-${k}`, busy ? MACHINES.updating : MACHINES.updateCore, { disabled: busy, onClick: () => run("app.update_core", {}) }));
  }
  const fix = local && a.id
    ? button(`mach-signin-${k}-${a.id}`, MACHINES.signIn, { icon: I("login"),
      onClick: () => signIn(a.id, a.name).catch((e) => toast({ title: "Couldn't open the sign-in", body: plainError(e), level: "error" })) })
    : null;
  return alertRow(t, `${k}-${i}`, "login", MACHINES.signedOut(a.name, local ? null : label(k)), MACHINES.signedOutAbout(local), fix);
}

// A small rounded word: an agent (with its logo) or an account; `off` in the lantern colours (signed out).
function pill(t, id, words, { lead = null, off = false, dim = false } = {}) {
  return h_flex().id(id).h(22).px(8).gap(5).flex_none().items_center().rounded(11).border_1()
    .border_color(off ? `${need()}73` : t.input).when(off, (el) => el.bg(`${need()}14`))
    .font_family(MONO).text_size(TEXT.id).text_color(off ? need() : dim ? t.dim : t.muted).whitespace_nowrap()
    .when(Boolean(lead), (el) => el.child(lead)).child(words);
}

// Its spaces, terminals, the agents installed there and the accounts it uses.
function statsRow(t, k, m, local) {
  const W = MACHINES.stats;
  const n = machineCounts(spaces(), m);
  const st = statsOf(m);
  const agents = (st?.agents ?? []).map((a) => pill(t, `mach-ag-${k}-${a.key}`, a.name,
    { lead: a.key === "claude" || a.key === "codex" ? logo(a.key, 13) : null }));
  const pr = prefs();
  const accs = local
    ? accounts().map((a) => pill(t, `mach-acc-${k}-${a.id}`, a.error === "signed-out" ? `${a.name} · signed out` : isSkipped(a, pr) ? `${a.name} · skipped` : a.name,
      { off: a.error === "signed-out", dim: isSkipped(a, pr) }))
    : Object.entries(st?.limits ?? {}).map(([cli, r]) => {
      const name = cli === "claude" ? "Default" : cli === "codex" ? "Codex" : cli;
      return pill(t, `mach-acc-${k}-${cli}`, r.state === "signed-out" ? `${name} · signed out` : name, { off: r.state === "signed-out" });
    });
  const none = () => div().text_size(TEXT.label).text_color(t.dim).child(W.none);
  const col = (id, title, value, w = null) => v_flex().id(`mach-st-${k}-${id}`).gap(7).min_w(0)
    .when(Boolean(w), (el) => el.w(w).flex_none()).when(!w, (el) => el.flex_1())
    .child(div().font_family(MONO).text_size(TEXT.id - 0.5).text_color(t.dim).child(title))
    .child(value);
  const num = (v, extra) => h_flex().gap(6).items_center().flex_wrap()
    .child(div().text_size(TEXT.body).text_color(t.foreground).child(String(v)))
    .when(Boolean(extra), (el) => el.child(div().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(extra)));
  const wrap = (list) => (list.length ? h_flex().gap(6).flex_wrap().children(list) : none());
  return h_flex().w_full().px(14).py(12).gap(16).items_start()
    .child(col("spaces", W.spaces, num(n.spaces), 72))
    .child(col("terminals", W.terminals, num(n.terminals, n.settled ? W.settled(n.settled) : null), 104))
    .child(col("agents", W.agents, wrap(agents)))
    .child(col("accounts", W.accounts, wrap(accs)));
}

export function machinesSection(view, t, cx) {
  readHome(view, cx);
  readReach(cx);
  askOnce(view, cx);
  const head = h_flex().w_full().gap(12).items_center()
    .child(div().flex_1().child(view.title(t, SECTIONS.find((s) => s.id === "machines").title)))
    .child(button("mach-add", MACHINES.add, { kind: "primary", icon: I("plus"), onClick: () => run("mod.open", { name: "machine-add-chat" }) }));
  return v_flex()
    .child(head)
    .child(div().text_size(TEXT.label).line_height("17px").text_color(t.dim).child(MACHINES.about))
    .child(v_flex().pt(14).gap(14).children(keysNow().map((k) => machineBlock(view, t, k))))
    .child(view.heading(t, MACHINES.heading))
    .children(limitRows(view, t, null));
}
