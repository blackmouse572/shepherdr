// A card in the conversation (DECISIONS, Chat: question/permission/plan/secret cards sit in
// the timeline where they appeared and scroll with it). The timeline is a virtual list, whose
// rows take no handlers, so a card is drawn as a run of strips, one list row each, that look
// like one card (the first has its top edge, the last its bottom). A strip is one line of
// things to press at most: the list says which strip was pressed (on_item_click) and the press
// says where along it (hit()), with each control's drawn width measured outside the list
// (measure()). A strip: { key, kind, gap (px above it), ... }:
//   head: { who, dot, tone (who's color), links: [ctl] }   who asks, quiet links at the right
//   title / text: { text, tone ("dim" | "muted" | "red" | "fg") }
//   detail: { lines, clip (px it folds to, or null) }      what is asked for, in a box
//   controls: { align ("start" | "end"), lead (words before), ctls: [ctl] }
//   option: { on, multi, num, label, tag, desc, fn }       a whole-width choice
//   review: { label, answer, missing, fn }                 an answer to check, opens its question
//   input: { state, indent, placeholder }                  a box to type in (native: no handler)
//   banner: { title, sub, state, links: [ctl] }            a card's tinted head (Doop App 01: "has a plan to approve")
//   step: { num, text }                                    a numbered step (a plan's)
//   line: { icon, tone, spin, ref, title, sub, hint, links }  a card's one-line head (a task, a helper)
//   chips: { tags: [{ label, tone }], indent }             a run of small mono tags, wrapping
// controls may end with a hint: { keys, text } ("↵ approve") at the right.
// A ctl: { id, label, look ("primary" | "secondary" | "plain" | "pill" | "link"), on, done,
// disabled, fn }. fn(cx) runs on a press.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { button, red, need, RADIUS, TEXT, MONO, SERIF, HEAD, bannerBg, bannerDots, isDark } from "./ui.js";

const PAD = 12, LINK_GAP = 12;
// Fixed heights (px), drawn and estimated alike (main.js guessBare(), height()).
export const BANNER_H = 58, STEP_LINE = 20, LINE_H = 22, CHIP_H = 20, CHIP_GAP = 6, BODY_LINE = 20;
// The design's card corner.
const R = RADIUS.bubble;
const GAPS = { controls: 6, pill: 4 };

// A control as drawn, in a strip and in measure() alike: the shared button (ui.js) with the
// pointer and hover its click would give it, a pill, or a quiet link.
export function ctlEl(t, c, pre = "") {
  const live = !c.disabled && Boolean(c.fn);
  if (c.look === "link") return h_flex().id(`${pre}${c.id}`).flex_none().gap(4).items_center().whitespace_nowrap().text_size(TEXT.label).text_color(t.muted)
    .when(live, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground)))
    .when(Boolean(c.icon), (el) => el.child(svg(c.icon).size(12).flex_none())).child(c.label)
    .when(Boolean(c.after), (el) => el.child(svg(c.after).size(12).flex_none()));
  if (c.look === "pill") return h_flex().id(`${pre}${c.id}`).h(24).px(9).gap(5).flex_none().items_center().rounded(12).whitespace_nowrap().text_size(TEXT.label)
    .when(Boolean(c.on), (el) => el.bg(t.selected).text_color(t.foreground).font_medium())
    .when(!c.on, (el) => el.text_color(t.muted).when(live, (el) => el.hover((s) => s.bg(t.hover))))
    .when(live, (el) => el.cursor_pointer())
    .when(Boolean(c.done), (el) => el.child(svg("mods/chat/check.svg").size(11).flex_none().text_color(t.dim)))
    .child(c.label);
  return button(`${pre}${c.id}`, c.label, { kind: c.look ?? "secondary", disabled: Boolean(c.disabled), icon: c.icon ?? null })
    .when(Boolean(c.after), (el) => el.child(svg(c.after).size(12).flex_none()))
    .when(live, (el) => el.cursor_pointer().hover((s) => (c.look === "primary" ? s.opacity(0.88)
      : c.look === "plain" ? s.bg(t.hover).text_color(t.foreground) : s.bg(t.hover))));
}

const tone = (t, k) => ({ dim: t.dim, muted: t.muted, red: red(), fg: t.foreground })[k] ?? t.muted;

// What a strip's height depends on (main.js key()).
export function sig(s) {
  const n = (v) => String(v ?? "").length;
  return `${s.kind}.${s.gap ?? ""}.${n(s.text)}.${n(s.who)}.${(s.links ?? []).length}.${s.lines?.length ?? ""}.${s.clip ?? ""}.${n(s.label)}.${n(s.desc)}.${n(s.answer)}.${s.tag ? 1 : 0}.${(s.ctls ?? []).length}.${n(s.title)}.${n(s.sub)}.${(s.tags ?? []).map((g) => n(g.label)).join("-")}.${s.hint ? 1 : 0}.${s.size ?? ""}`;
}

// One strip, in the card's frame. first / last: whether it draws the card's top / bottom edge.
export function strip(t, s, first, last, pre = "") {
  // A banner fills the card's top edge to edge (its own padding).
  const flush = s.kind === "banner";
  const frame = v_flex().w_full().bg(t.surface).border_1().border_color(t.border).px(flush ? 0 : PAD)
    .pt(flush ? 0 : first ? 10 : s.gap ?? 8).pb(last ? 10 : 0)
    .when(!first, (el) => el.border_t(0)).when(!last, (el) => el.border_b(0))
    .when(first, (el) => el.rounded_t(R).overflow_hidden()).when(last, (el) => el.rounded_b(R));
  return frame.child(body(t, s, pre));
}

function body(t, s, pre) {
  switch (s.kind) {
    case "head":
      return h_flex().w_full().min_h(18).gap(LINK_GAP).items_center()
        .child(h_flex().flex_1().min_w(0).gap(8).items_center()
          .child(div().size(8).flex_none().rounded(4).bg(s.dot ?? need()))
          .child(div().min_w(0).truncate().text_size(TEXT.label).font_medium().text_color(s.dot ? t.muted : need()).child(s.who)))
        .when((s.links ?? []).length > 0, (el) => el.child(h_flex().flex_none().gap(LINK_GAP).items_center().children(s.links.map((c) => ctlEl(t, c, pre)))));
    case "title":
      return div().min_w(0).text_size(TEXT.body).font_medium().text_color(t.foreground).child(s.text);
    case "text":
      // size "body": a card's main words (a helper's report), at the body size.
      return s.size === "body" ? div().min_w(0).text_size(TEXT.body).line_height(`${BODY_LINE}px`).text_color(tone(t, s.tone ?? "fg")).child(s.text)
        : div().min_w(0).text_size(TEXT.label).line_height("18px").text_color(tone(t, s.tone)).child(s.text);
    case "banner": {
      const dark = isDark(), state = s.state ?? "attention";
      return h_flex().relative().w_full().h(BANNER_H).px(14).gap(10).items_center().overflow_hidden().border_b(1).border_color(t.border)
        .when(dark, (el) => el.bg(bannerBg(state)).child(bannerDots(state)))
        .child(div().size(8).flex_none().rounded(4).bg(s.dot ?? need()))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().h(20).truncate().line_height("20px").text_color(t.foreground)
            .when(dark, (el) => el.font_family(SERIF).text_size(HEAD.small)).when(!dark, (el) => el.text_size(TEXT.body).font_medium()).child(s.title))
          .when(Boolean(s.sub), (el) => el.child(div().h(14).truncate().line_height("14px").font_family(MONO).text_size(TEXT.id).text_color(t.muted).child(s.sub))))
        .when((s.links ?? []).length > 0, (el) => el.child(h_flex().flex_none().gap(LINK_GAP).items_center().children(s.links.map((c) => ctlEl(t, c, pre)))));
    }
    case "step":
      return h_flex().w_full().gap(10).items_start()
        .child(h_flex().h(STEP_LINE).flex_none().items_center()
          .child(h_flex().size(19).items_center().justify_center().rounded(5).bg(t.raised).border_1().border_color(t.border)
            .font_family(MONO).text_size(10.5).font_medium().text_color(t.muted).child(String(s.num))))
        .child(div().flex_1().min_w(0).text_size(TEXT.body).line_height(`${STEP_LINE}px`).text_color(t.foreground).child(s.text));
    case "line":
      return h_flex().w_full().h(LINE_H).gap(8).items_center()
        .when(Boolean(s.icon), (el) => el.child(svg(s.icon).size(12).flex_none().text_color(s.tone ?? t.dim).when(Boolean(s.spin), (el) => el.spin(900))))
        .when(Boolean(s.ref), (el) => el.child(div().flex_none().font_family(MONO).text_size(11.5).font_medium().text_color(t.dim).child(s.ref)))
        .child(div().min_w(0).truncate().font_medium().text_color(t.foreground).child(s.title))
        .when(Boolean(s.sub), (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(s.sub)))
        .child(div().flex_1())
        .when(Boolean(s.hint), (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(s.hint)))
        .when((s.links ?? []).length > 0, (el) => el.child(h_flex().flex_none().gap(LINK_GAP).items_center().children(s.links.map((c) => ctlEl(t, c, pre)))));
    case "chips":
      return h_flex().w_full().pl(s.indent ?? 0).flex_wrap().gap(CHIP_GAP).children(s.tags.map((g) => h_flex().h(CHIP_H).px(6).flex_none().items_center()
        .rounded(5).border_1().border_color(t.border).bg(t.background).whitespace_nowrap()
        .font_family(MONO).text_size(10.5).font_medium().text_color(g.tone === "accent" ? need() : t.muted).child(g.label)));
    case "detail":
      return div().w_full().px(8).py(6).rounded(RADIUS.control).bg(t.background).overflow_hidden()
        .when(s.clip != null, (el) => el.max_h(s.clip))
        .text_size(TEXT.label).text_color(t.muted).children(s.lines.map((l) => div().min_w(0).child(l || " ")));
    case "controls":
      return h_flex().w_full().gap(s.ctls.every((c) => c.look === "pill") ? GAPS.pill : GAPS.controls).items_center()
        .when(s.align === "end", (el) => el.justify_end())
        .when(Boolean(s.lead), (el) => el.child(div().flex_none().pr(2).text_size(TEXT.label).text_color(t.dim).child(s.lead)))
        .children(s.ctls.map((c) => ctlEl(t, c, pre)))
        .when(Boolean(s.hint), (el) => el.child(div().flex_1()).child(h_flex().flex_none().gap(5).items_center()
          .font_family(MONO).text_size(TEXT.id).text_color(t.dim)
          .children((s.hint.keys ?? []).map((k) => div().h(18).min_w(18).px(5).flex_none().flex().items_center().justify_center().rounded(5)
            .border_1().border_color(t.border).bg(t.raised).text_size(10).font_medium().child(k)))
          .child(s.hint.text)));
    case "option": {
      const mark = s.num != null
        ? h_flex().w(18).h(19).flex_none().items_center().justify_center().rounded(5).bg(t.raised).text_size(TEXT.id).font_medium().text_color(t.muted).child(String(s.num))
        : div().size(14).flex_none().flex().items_center().justify_center().border_1().rounded(s.multi ? 3 : 7)
          .border_color(s.on ? t.accent : t.input).when(Boolean(s.on), (el) => el.bg(t.accent))
          .when(Boolean(s.on) && Boolean(s.multi), (el) => el.child(svg("mods/chat/check.svg").size(10).text_color(t.background)))
          .when(Boolean(s.on) && !s.multi, (el) => el.child(div().size(6).rounded(3).bg(t.background)));
      return h_flex().w_full().px(8).py(6).gap(10).items_start().rounded(RADIUS.row)
        .when(Boolean(s.disabled), (el) => el.opacity(0.6))
        .when(!s.disabled, (el) => el.cursor_pointer().hover((st) => st.bg(s.on ? t.selected : t.hover)))
        .when(Boolean(s.on), (el) => el.bg(t.selected))
        .child(div().pt(s.num != null ? 0 : 2).child(mark))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(h_flex().gap(6).items_center().child(div().min_w(0).text_color(t.foreground).child(s.label))
            .when(Boolean(s.tag), (el) => el.child(div().px(6).h(16).flex_none().flex().items_center().rounded(4).bg(t.raised).text_size(TEXT.id).text_color(t.muted).child(s.tag))))
          .when(Boolean(s.desc), (el) => el.child(div().text_size(TEXT.label).text_color(t.dim).child(s.desc))));
    }
    case "review":
      return h_flex().w_full().px(8).py(6).gap(10).rounded(RADIUS.row).cursor_pointer().hover((st) => st.bg(t.hover))
        .child(div().w(150).flex_none().truncate().text_size(TEXT.label).text_color(t.dim).child(s.label))
        .child(div().flex_1().min_w(0).text_color(s.missing ? red() : t.foreground).child(s.answer));
    case "input":
      return div().w_full().pl(s.indent ?? 0).child(div().h(32).px(8).flex().items_center().rounded(RADIUS.control)
        .border_1().border_color(t.input).bg(t.background)
        .child(s.state ? Input.new(s.state).w_full().text_size(TEXT.body).text_color(t.foreground)
          : div().text_size(TEXT.body).text_color(t.dim).child(s.placeholder ?? "")));
    default:
      return div();
  }
}

// The controls a press at x (in the pane) lands on, or null. inner: the card's inside edges in
// the pane ({ left, right }); widths: measured control widths by id.
export function hit(s, x, inner, widths) {
  if (x == null) return null;
  if (s.kind === "option" || s.kind === "review") return s.disabled || !s.fn ? null : s;
  if (s.kind === "input") return s;
  const w = (c) => widths.get(c.id) ?? String(c.label).length * 7 + 18;
  const run = (ctls, gap, end, from) => {
    if (end) {
      let r = from;
      for (const c of [...ctls].reverse()) { const l = r - w(c); if (x >= l - 2 && x <= r + 2) return c; r = l - gap; }
    } else {
      let l = from;
      for (const c of ctls) { const r = l + w(c); if (x >= l - 2 && x <= r + 2) return c; l = r + gap; }
    }
    return null;
  };
  let c = null;
  if (s.kind === "head" || s.kind === "line") c = run(s.links ?? [], LINK_GAP, true, inner.right);
  // A banner's own padding is 14, the card's 12.
  if (s.kind === "banner") c = run(s.links ?? [], LINK_GAP, true, inner.right - 2);
  if (s.kind === "controls") {
    const gap = s.ctls.every((k) => k.look === "pill") ? GAPS.pill : GAPS.controls;
    if (s.align === "end") c = run(s.ctls, gap, true, inner.right);
    else c = run(s.ctls, gap, false, inner.left + (s.lead ? (widths.get(`lead:${s.lead}`) ?? s.lead.length * 7 + 2) + gap : 0));
  }
  return c && !c.disabled && c.fn ? c : null;
}

// How many lines a chips strip wraps to in `width` px (as drawn: mono 10.5, px 6, a border; a little wide, so
// the estimate is never short).
export function chipRows(tags, width) {
  let rows = 1, x = 0;
  for (const g of tags ?? []) {
    const w = String(g.label).length * 6.6 + 14;
    if (x > 0 && x + CHIP_GAP + w > width) { rows++; x = w; } else x += (x > 0 ? CHIP_GAP : 0) + w;
  }
  return rows;
}

// The card's inside edges, given the column's (main.js edges()): its border and padding in.
export const innerOf = ({ left, right }) => ({ left: left + 1 + PAD, right: right - 1 - PAD });

// Every control of these strips drawn once out of sight, each reporting its width (for hit()).
// Built in render, outside the list, where handlers are allowed.
export function measure(t, strips, widths, onChange) {
  const ctls = [];
  for (const s of strips) {
    if (s.kind === "head" || s.kind === "banner" || s.kind === "line") ctls.push(...(s.links ?? []));
    if (s.kind === "controls") {
      ctls.push(...s.ctls);
      if (s.lead) ctls.push({ id: `lead:${s.lead}`, lead: s.lead });
    }
  }
  return div().absolute().top(0).left(0).h(0).overflow_hidden().opacity(0)
    .child(h_flex().items_start().children(ctls.map((c) => div().id(`mwb-${c.id}`).flex_none()
      .on_size_change((size, cx) => { if (widths.get(c.id) !== size.width) { widths.set(c.id, size.width); onChange?.(cx); } })
      .child(c.lead ? div().flex_none().pr(2).text_size(TEXT.label).child(c.lead) : ctlEl(t, c, "mw-")))));
}
