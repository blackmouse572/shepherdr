// A task's status mark: Shepherdr's task dots (src/ui.tsx Dot, src/styles.css .dot.*), every one
// in a 14px box so nothing moves when a status changes.
// Shared: the source is lib/dot.js; bin/sync-shared copies it into each mod in lib/COPIES.
// Edit lib/dot.js, never a mod's copy, then run bin/sync-shared.
//   working  the ring in blue, a pie inside filling with the % done (5% steps,
//            min 5%; half full while it reports none)
//   needs    a 10px amber dot (halo: a faint ring around it, as Shepherdr's chat header)
//   ready    green, a white tick        done     the same in grey
//   merging  the green ring with a quarter gap, turning
//   queued   the grey ring with a clock's two hands      todo  the grey ring      off  dashed
import { div, svg } from "gpui-kit";
import { theme, terminals } from "herdr";
import { need, working, green } from "./ui.js";

// The design's need, working and ready colours, light and dark: one source for the app, in ui.js. The
// greys are the theme's.
const needColor = need;
const readyColor = green;

// The pie: the ring with a solid wedge inside, from twelve o'clock clockwise, radius 3.5 of 14
// (Shepherdr's inset 3.5px), one picture per 5% in mods/tasks/pie/. Pictures, not paint_path: its
// arcs drew only the wedge's outline at this size, which read as a clock's hands.
const pie = (pct) => `mods/tasks/pie/${Math.min(100, Math.max(5, Math.round(pct / 5) * 5))}.svg`;

const box = () => div().relative().size(14).flex_none();
const ring = (color, file = "circle") => svg(`mods/tasks/${file}.svg`).size(14).flex_none().text_color(color);

// s: needs, working, merging, ready, queued, todo, done, off. pct: the % done (working).
export function taskDot(s, { pct = null, halo = false } = {}) {
  const t = theme();
  switch (s) {
    case "working": return svg(pie(Number.isFinite(pct) ? pct : 50)).size(14).flex_none().text_color(working());
    case "needs": return box().items_center().justify_center().flex()
      .child(div().size(10).flex_none().rounded(5).bg(needColor()))
      .when(halo, (el) => el.child(div().absolute().top(-1).left(-1).size(16).rounded(8).border(1.5).border_color(needColor() + "4d")));
    case "ready":
    case "done": return box().rounded(7).bg(s === "ready" ? readyColor() : t.dim)
      .child(svg("mods/tasks/tick.svg").size(14).flex_none().text_color("#ffffff"));
    case "merging": return ring(readyColor(), "merging").spin(1400);
    case "queued": return ring(t.dim, "queued");
    case "off": return ring(t.dim, "off");
  }
  return ring(t.dim);
}

// An agent's status mark (Doop App 02 .dot), the sidebar's rows and the tab bar's tabs: needs you (amber, pulsing),
// working (blue, an arc going round it; a task's pie once it reports its %), ready (taskDot's tick), done (green),
// idle (hollow). 14 square, so nothing moves when it changes.
export function statusDot(kind, pct = null) {
  const t = theme();
  const box = () => div().relative().size(14).flex_none().flex().items_center().justify_center();
  if (kind === "working" && Number.isFinite(pct)) return taskDot("working", { pct });
  if (kind === "ready") return taskDot("ready");
  if (kind === "needs") return box()
    .child(div().absolute().top(1).left(1).size(12).rounded(6).bg(needColor()).loop("opacity", { from: 0.1, to: 0.45, period: 2000 }))
    .child(div().size(8).rounded(4).bg(needColor()));
  if (kind === "working") return box().child(div().size(6).rounded(3).bg(working()))
    .child(div().absolute().inset_0().child(svg("mods/workspace-chrome/spinner.svg").size(14).text_color(working()).spin(1200)));
  if (kind === "done") return box().child(div().size(8).rounded(4).bg(readyColor()));
  return box().child(div().size(8).rounded(4).border(1.5).border_color(t.dim));
}

// The % done an agent reports itself (OSC 7501 progress: its terminal's `report`), the first of
// these terminals that does, else null; with its message.
export function ownProgress(addresses) {
  for (const a of addresses) {
    const r = terminals().find((k) => k.address === a)?.report;
    if (typeof r?.progress === "number" && r.progress >= 0) return { pct: r.progress, msg: r.msg || null };
  }
  return null;
}

// Minutes left show only once they're a real estimate (core/tasks.js, shared with the web app).
export { ESTIMATE_PCT, estimated } from "./core/tasks.js";
