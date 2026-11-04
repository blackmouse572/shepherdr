// Usage and accounts in the status bar (Doop "App 04 · Usage and accounts"): the pill at the bar's right, and the
// popover it opens above itself.
//   pill      the active account's provider logo, name, session use with a small meter, then its week and first
//             model week ("59% 5h ▬ 51% wk · 37% Fable"). The name gives way first; numbers are never cut.
//   popover   banner header ("Usage", when it last read, Refresh, Close); Claude | Codex; one card per account
//             (logo, name in the serif, plan · folder, the filled amber ACTIVE badge and an amber edge on the one new
//             work starts on, "Use" on the others, a chevron for its detail); every card's meters with the switch
//             tick; "Switch above" with its stepper; Manage accounts. At most 70% of the window tall: the header and
//             footer stay, the cards scroll (overflow rule R8).
//   detail    a second panel beside the popover for one account: Session / Weekly / model tiles, the last 7 days as
//             bars, this week by space (5 rows, then "N more"), when the week resets, Open in Settings.
// The popover is this mod opened again as a frameless popup (props.view "usage"); the detail panel reopens it wider.
// Data and picks: usage-data.js (lib/usage-data.js) and core/usage.js.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, props, openOverlay, closeOverlay, window } from "herdr";
import { TEXT, RADIUS, button, segmented, isDark, bannerBg, bannerDots, SERIF, openSettings, heading, green, need } from "./ui.js";
import { usage, prefs, setPrefs, refresh, logo, meterBar, activeBadge, MONO } from "./usage-data.js";
import { WORDS, POP, pctText, resetsLine, resetsWhen, activeOf, switchLine, accountSub, weekBars, spaceSplit,
  pillParts, updatedLine, popoverHeight, capHeight, session, weekly, models, errorLine, midCut } from "./core/usage.js";

const I = (name) => `mods/workspace-status-chat/${name}.svg`;
const DETAIL_H = 470;

// ---- the pill --------------------------------------------------------------------------------------------------

let anchor = null; // the pill's bounds when last pressed: the popover sits above it

export function usagePill() {
  const t = theme();
  const u = usage();
  const list = u?.claude ?? [];
  if (!u || (!list.length && !u.codex?.signed_in)) return null;
  const a = activeOf(list, prefs());
  const p = pillParts(a);
  const mono = (s, c = t.muted) => div().flex_none().whitespace_nowrap().font_family(MONO).text_size(TEXT.id).text_color(c).child(s);
  return h_flex().id("usage-pill").h(20).min_w(0).px(8).gap(7).items_center().rounded(RADIUS.control).cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (e) => { anchor = e.bounds ?? (e.position ? { x: e.position.x - 60, y: e.position.y - 10, width: 120, height: 20 } : null); })
    .on_click((_e, cx) => { cx.stop_propagation(); openUsage({ at: anchor }); })
    .child(logo(a ? "claude" : "codex", 12))
    .when(Boolean(p), (el) => el
      .child(div().min_w(0).max_w(120).truncate().text_size(TEXT.label).font_medium().text_color(t.foreground).child(p.name))
      .when(Boolean(p.error), (el) => el.child(mono(p.error, t.dim)))
      .when(!p.error && Boolean(p.session), (el) => el.child(mono(p.session)).child(meterBar("pill-meter", p.sessionPct, { width: 46, height: 4 })))
      .when(!p.error && Boolean(p.rest), (el) => el.child(mono(p.rest, t.dim))))
    .when(!p, (el) => el.child(div().text_size(TEXT.label).child(WORDS.codex)));
}

// The popover above the pill, its left edge on the pill's; with `detail`, the detail panel beside it.
export function openUsage({ at = null, detail = null, tab = "claude" } = {}) {
  const u = usage();
  const winH = at ? at.y + at.height : window()?.height ?? null;
  const popH = popoverHeight(u?.claude ?? [], tab);
  const H = capHeight(Math.max(popH, detail ? DETAIL_H : 0), winH);
  const W = POP.width + (detail ? POP.gap + POP.detail : 0);
  const where = at ? { x: Math.max(8, at.x), y: Math.max(8, at.y - H - 6) } : "pointer";
  openOverlay({ mod: "workspace-status-chat", kind: "popup", frame: "none", width: W, height: H, at: where,
    props: { view: "usage", at, detail, tab, height: H } });
}

// ---- the popover -------------------------------------------------------------------------------------------------

export class UsagePopover {
  constructor(cx) {
    const p = props() ?? {};
    this.p = p;
    this.tab = p.tab === "codex" ? "codex" : "claude";
    this.detail = p.detail ?? null;
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => this.handle.focus());
    // What the engine reads and the "Updated" line change on their own.
    cx.timer.every(1000, (cx) => cx.notify());
  }

  close() { closeOverlay(this.p.overlay); }

  reopen(change) {
    const next = { at: this.p.at, detail: this.detail, tab: this.tab, ...change };
    closeOverlay(this.p.overlay);
    openUsage(next);
  }

  iconButton(id, icon, tip, onClick, on = false) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(RADIUS.control)
      .text_color(on ? t.foreground : t.muted).when(on, (el) => el.bg(t.hover))
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); cx.notify(); })
      .child(svg(I(icon)).size(16));
  }

  // A banner header: the wash and dots in dark, the title in the serif, a dim mono line, controls at the right.
  header(id, { title, sub, lead = null, right = [], tall = 62, size = TEXT.title + 3 }) {
    const t = theme();
    const d = isDark();
    return div().id(id).relative().w_full().h(tall).flex_none().overflow_hidden().border_b(1).border_color(t.border)
      .when(d, (el) => el.bg(bannerBg("neutral")).child(bannerDots("neutral")))
      .child(h_flex().absolute().inset_0().px(14).gap(10).items_center()
        .when(Boolean(lead), (el) => el.child(lead))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().min_w(0).truncate().text_color(t.foreground)
            .when(d, (el) => el.font_family(SERIF).text_size(size))
            .when(!d, (el) => el.text_size(TEXT.title).font_semibold())
            .child(title))
          .when(Boolean(sub), (el) => el.child(div().min_w(0).truncate().font_family(MONO).text_size(TEXT.id).text_color(t.muted).child(sub))))
        .children(right));
  }

  // One meter row: label, meter, percent, reset; the last three fixed so nothing is cut (overflow rule R3).
  meterRow(id, m, w) {
    const t = theme();
    return h_flex().h(14).gap(10).items_center().whitespace_nowrap()
      .child(div().w(56).flex_none().truncate().text_size(TEXT.label).text_color(t.muted).child(m.label))
      .child(meterBar(id, m.pct, { width: w }))
      .child(div().w(34).flex_none().text_right().font_family(MONO).text_size(TEXT.id).text_color(t.foreground).child(pctText(m.pct)))
      .child(div().w(92).flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(resetsLine(m.resets_at)));
  }

  card(a, provider, active) {
    const t = theme();
    const open = this.detail === a.id && provider === "claude";
    const right = [];
    if (provider === "claude") {
      right.push(active ? activeBadge(WORDS.active)
        : button(`use-${a.id}`, WORDS.use, { kind: "plain", size: "xs", disabled: Boolean(a.error), onClick: () => setPrefs({ active: a.id }) }));
      right.push(this.iconButton(`more-${a.id}`, "chevron-right", WORDS.detail,
        () => this.reopen({ detail: open ? null : a.id }), open));
    }
    const sub = provider === "codex" ? [a.plan, midCut(a.folder, 26)].filter(Boolean).join(" · ") : accountSub(a, 26);
    const meters = a.meters ?? [];
    return v_flex().id(`acct-${provider}-${a.id}`).w_full().flex_none().rounded(10).overflow_hidden().bg(t.raised)
      .border_1().border_color(active ? need() : t.border)
      .child(this.header(`acct-h-${provider}-${a.id}`, { title: a.name, sub, lead: logo(provider, 16), right, tall: POP.card, size: 16 }))
      .child(v_flex().px(12).py(11).gap(6)
        .when(Boolean(a.error), (el) => el.child(div().text_size(TEXT.label).text_color(t.dim).child(errorLine(a))))
        .when(!a.error && !meters.length, (el) => el.child(div().text_size(TEXT.label).text_color(t.dim).child(WORDS.loading)))
        .children(a.error ? [] : meters.map((m) => this.meterRow(`m-${provider}-${a.id}-${m.id}`, m, 150))));
  }

  rule(list, pr) {
    const t = theme();
    const at = pr.switch_at;
    const step = (id, icon, v, off) => div().id(id).size(28).flex().items_center().justify_center().text_color(off ? t.dim : t.muted)
      .when(!off, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground).bg(t.hover))
        .on_click((_e, cx) => { cx.stop_propagation(); setPrefs({ switch_at: v }); cx.notify(); }))
      .child(svg(I(icon)).size(13));
    return h_flex().w_full().flex_none().px(12).py(12).gap(12).items_center().rounded(10).bg(t.background).border_1().border_color(t.border)
      .child(svg(I("switch")).size(16).flex_none().text_color(need()))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().text_size(TEXT.body).font_medium().text_color(t.foreground).child(WORDS.switchAbove))
        .child(div().truncate().text_size(TEXT.label).text_color(t.dim).child(switchLine(list, pr))))
      .child(h_flex().h(28).flex_none().items_center().rounded(RADIUS.control).bg(t.raised).border_1().border_color(t.border)
        .child(step("sw-minus", "minus", at - 5, at <= 50))
        .child(div().w(44).text_center().font_family(MONO).text_size(TEXT.label).font_medium().text_color(t.foreground)
          .child(at >= 100 ? "Off" : `${at}%`))
        .child(step("sw-plus", "plus", at + 5, at >= 100)));
  }

  popover(H) {
    const t = theme();
    const u = usage();
    const list = u?.claude ?? [];
    const pr = prefs();
    const active = activeOf(list, pr);
    const cx = u?.codex;
    const tabLabel = (provider, name, count) => h_flex().gap(7).items_center().child(logo(provider, 14)).child(name)
      .child(div().font_family(MONO).text_size(TEXT.id - 0.5).text_color(t.dim).child(count));
    const claudeCount = `${list.length} ${list.length === 1 ? "account" : "accounts"}`;
    const codexCount = cx?.signed_in ? "1 sign-in" : "signed out";
    const codexHint = cx?.signed_in ? [WORDS.codex, cx.plan, session(cx) ? `${pctText(session(cx).pct)} 5h` : null].filter(Boolean).join(" · ") : "";
    const body = this.tab === "codex"
      ? (cx?.signed_in ? [this.card({ id: "codex", name: "Codex", ...cx }, "codex", false)]
        : [div().p(12).text_size(TEXT.label).text_color(t.dim).child(WORDS.codexOut)])
      : !u ? [div().p(12).text_size(TEXT.label).text_color(t.dim).child(WORDS.loading)]
      : !list.length ? [div().p(12).text_size(TEXT.label).text_color(t.dim).child(WORDS.noAccounts)]
      : [...list.map((a) => this.card(a, "claude", a.id === active?.id)), this.rule(list, pr)];
    return v_flex().id("usage-pop").w(POP.width).max_h(H).flex_none().rounded(12).overflow_hidden().bg(t.popover)
      .border_1().border_color(t.border).shadow_lg()
      .on_click((_e, cx) => cx.stop_propagation())
      .child(this.header("usage-head", {
        title: WORDS.title, sub: `${updatedLine(u?.at)} · ${WORDS.checks}`,
        right: [this.iconButton("usage-refresh", "refresh", "Refresh", () => refresh()), this.iconButton("usage-close", "x", "Close", () => this.close())],
      }))
      .child(div().px(14).pt(12).flex_none().child(segmented("usage-tab",
        [["claude", tabLabel("claude", WORDS.claude, claudeCount)], ["codex", tabLabel("codex", WORDS.codex, codexCount)]],
        this.tab, (v) => { this.reopen({ tab: v, detail: null }); }, { size: "lg", fill: true })))
      .child(div().id("usage-list").flex_1().min_h(0).overflow_y_scroll()
        .child(v_flex().px(14).pt(12).pb(2).gap(POP.gapCards).children(body)))
      .child(h_flex().h(POP.foot).flex_none().px(14).gap(10).items_center()
        .child(button("usage-manage", WORDS.manage, { icon: I("users"), onClick: () => { this.close(); openSettings({ section: "accounts" }); } }))
        .child(div().flex_1())
        .when(this.tab === "claude" && Boolean(codexHint), (el) => el.child(h_flex().min_w(0).gap(5).items_center()
          .child(logo("codex", 12)).child(div().min_w(0).truncate().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(codexHint)))));
  }

  detailPanel(H) {
    const t = theme();
    const a = (usage()?.claude ?? []).find((x) => x.id === this.detail);
    if (!a) return null;
    const tiles = [session(a), weekly(a), models(a)[0]].filter(Boolean);
    const tile = (m, i) => v_flex().flex_1().min_w(0).px(12).py(10).gap(3).when(i > 0, (el) => el.border_l(1).border_color(t.border))
      .child(div().truncate().text_size(TEXT.label).text_color(t.muted).child(m.label))
      .child(div().font_family(MONO).text_size(18).font_medium().text_color(t.foreground).child(pctText(m.pct)))
      .child(div().whitespace_nowrap().font_family(MONO).text_size(TEXT.id - 0.5).text_color(t.dim).child(resetsLine(m.resets_at)));
    const bars = weekBars(a.days, 60);
    const anyUse = bars.some((b) => b.tokens > 0);
    const split = spaceSplit(a.spaces, weekly(a)?.pct ?? null, 5);
    const BAR_W = POP.detail - 28 - 96 - 34 - 20 - 2;
    const wk = weekly(a);
    const dim = (s) => div().text_size(TEXT.label).text_color(t.dim).child(s);
    return v_flex().id("usage-detail").w(POP.detail).max_h(H).flex_none().rounded(12).overflow_hidden().bg(t.popover)
      .border_1().border_color(t.border).shadow_lg()
      .on_click((_e, cx) => cx.stop_propagation())
      .child(this.header("detail-head", { title: a.name, sub: [WORDS.detail, accountSub(a, 22)].filter(Boolean).join(" · "),
        lead: logo("claude", 16), tall: 52, size: 16, right: [this.iconButton("detail-close", "x", "Close", () => this.reopen({ detail: null }))] }))
      .child(div().id("detail-body").flex_1().min_h(0).overflow_y_scroll()
        .child(v_flex().p(14).gap(14)
          .when(tiles.length > 0, (el) => el.child(h_flex().w_full().rounded(RADIUS.card).bg(t.background).border_1().border_color(t.border)
            .children(tiles.map(tile))))
          .when(Boolean(a.error), (el) => el.child(dim(errorLine(a))))
          .child(v_flex().gap(6)
            .child(heading(WORDS.weekChart))
            .child(anyUse
              ? h_flex().h(80).gap(8).items_end().children(bars.map((b, i) => v_flex().flex_1().h_full().gap(5).items_center().justify_end()
                .child(div().w_full().h(b.h).rounded(3).bg(green()).opacity(b.today ? 1 : 0.4))
                .child(div().font_family(MONO).text_size(10).text_color(b.today ? t.foreground : t.dim).child(b.label))))
              : dim("No use on this computer in the last 7 days.")))
          .when(split.rows.length > 0, (el) => el.child(v_flex().gap(6)
            .child(heading(WORDS.bySpace))
            .children(split.rows.map((r, i) => h_flex().id(`sp-${i}`).h(16).gap(10).items_center().whitespace_nowrap()
              .child(div().w(96).flex_none().truncate().text_size(TEXT.label).text_color(t.muted).tooltip(r.name).child(r.name))
              .child(div().relative().w(BAR_W).h(5).flex_none().rounded(3).bg(t.background).border_1().border_color(t.border)
                .child(div().absolute().left(0).top(0).bottom(0).w(Math.max(2, Math.round(BAR_W * r.frac))).rounded(3).bg(green()).opacity(0.75)))
              .child(div().w(34).flex_none().text_right().font_family(MONO).text_size(TEXT.id).text_color(t.foreground).child(pctText(r.pct)))))
            .when(split.more > 0, (el) => el.child(dim(`${split.more} more`)))))))
      .child(h_flex().h(POP.foot).flex_none().px(14).gap(10).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().font_family(MONO).text_size(TEXT.id).text_color(t.dim)
          .child(wk?.resets_at ? `Weekly resets ${resetsWhen(wk.resets_at)}` : ""))
        .child(button("detail-settings", WORDS.openSettings, { onClick: () => { this.close(); openSettings({ section: "accounts" }); } })));
  }

  render() {
    const H = this.p.height ?? 600;
    return h_flex().id("usage-root").size_full().items_end().gap(POP.gap).track_focus(this.handle)
      .on_key_down((e) => { if (e.key === "escape") this.close(); })
      .on_click(() => this.close())
      .child(this.popover(H))
      .when(Boolean(this.detail), (el) => el.child(this.detailPanel(H) ?? div()));
  }
}

