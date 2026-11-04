// Needs you as a drawer beside the sidebar (Doop App 03), opened by the sidebar's Needs you: this mod as a popup with
// props { view: "needs" }. Every item inbox.js lists, as a card: who and why, where, its age and what it can do. A
// Claude ask (a plan, a permission) is answered on its card, as the chat's card does (data/chat-asks: end/<id> says
// how, ans/<id>.json is the hook's decision); everything else opens where it is (inbox.js toAlert, else the Tasks
// panel's Needs you). Filters: All, then each kind that has something. ↑/↓ pick a card, Enter takes its first
// action, Esc closes.
// Not here (no backend): "Always in this space" (no rule store), "Move to Default" (no move between accounts), the
// phone alert line.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, theme, terminals, agents, spaces, readTextFile, writeTextFile } from "herdr";
import { items, reasonOf, toAlert, showInbox, ASKS } from "./inbox.js";
import { spaceOfTerminal } from "./notify.js";
import { words, allow, deny, howAnswered } from "./core/asks.js";
import { NEED_FILTERS, needFilter, atMs, waitingLine } from "./core/needs.js";
import { ago } from "./core/tasks.js";
import { button, segmented, closeX, link, bannerBg, bannerDots, isDark, need, red, toastWho, openSettings, MONO, SERIF, HEAD, TEXT, RADIUS } from "./ui.js";

export const NEEDS_DRAWER = { width: 460, height: 640 };
const HEADER = 64, FILTERS = 44, FOOT = 40;
const ICON = { plan: null, permission: "mods/spaces-chat/shield.svg", signin: "mods/spaces-chat/login.svg", other: null };
const machineOf = (a) => (String(a ?? "").includes("/") ? String(a).split("/")[0] : null);

// Beside the sidebar, its top at the button's (r: the button's rect, rename.js rectOf).
export function openNeeds(r) {
  const at = r?.width ? { x: r.x + r.width + 16, y: Math.max(8, r.y - 2) } : "pointer";
  openOverlay({ mod: "spaces-chat", kind: "popup", frame: "none", ...NEEDS_DRAWER, at, props: { view: "needs" } });
}

export class NeedsDrawer {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.filter = "all";
    this.at = 0;
    this.asks = new Map(); // ask id -> { req, words } (null while unreadable)
    this.reading = new Set();
    this.done = new Set(); // keys answered here, gone before the hook's file is
    // Ages move on.
    cx.timer.every(30000, (cx) => cx.notify());
  }

  close() { closeOverlay(props().overlay); }

  // Each ask's request, read once.
  readAsks(list, cx) {
    for (const it of list) {
      if (it.kind !== "ask" || this.asks.has(it.id) || this.reading.has(it.id)) continue;
      this.reading.add(it.id);
      cx.spawn(async (cx) => {
        let req = null;
        try { req = JSON.parse((await readTextFile(`${ASKS()}/req/${it.id}.json`).catch(() => null)) ?? ""); } catch {}
        this.asks.set(it.id, req ? { req, words: words(req) } : null);
        this.reading.delete(it.id);
        cx.notify();
      });
    }
  }

  // An ask answered here: how it went first (the chat's copy shows it), then the decision.
  reply(it, text, cx) {
    const a = this.asks.get(it.id);
    this.done.add(it.key);
    cx.spawn(async () => {
      const how = a ? howAnswered({ words: a.words }, text, "in Needs you") : null;
      if (how) await writeTextFile(`${ASKS()}/end/${it.id}`, `${how}\n`, null).catch(() => {});
      await writeTextFile(`${ASKS()}/ans/${it.id}.json`, text, null).catch(() => {});
    });
  }

  // Where it is: an agent's or a task's.
  open(it) {
    this.close();
    const terminal = it.terminal ?? it.live?.[0];
    if (terminal) toAlert({ terminal });
    else showInbox();
  }

  // What a card says and does: { filter, title, sub, where, body, mono, remote, actions: [{ id, label, kind, fn(cx) }] }.
  card(it) {
    const k = it.terminal ? terminals().find((x) => x.address === it.terminal) : null;
    const report = k?.report?.kind ?? null;
    const a = it.kind === "ask" ? this.asks.get(it.id) : null;
    const filter = needFilter(it, { ask: a?.words.kind ?? null, report });
    const who = it.terminal ? toastWho(k) : it.title ?? it.ref ?? "A task";
    const prog = k?.program?.name ?? null;
    const reason = reasonOf(it, a?.req ?? null);
    const title = filter === "plan" ? `${who} has a plan to approve` : filter === "permission" ? `${who} asks permission`
      : filter === "signin" ? `${who} is signed out` : who;
    const sub = [it.ref && it.terminal ? null : it.ref, filter === "other" || filter === "permission" ? reason : null, prog].filter(Boolean).join(" · ");
    // Where: its space (a task's folder) and its machine.
    const m = it.machine ?? machineOf(it.terminal);
    const space = it.terminal ? agents().find((x) => x.address === it.terminal)?.space_name
      ?? spaces().find((s) => s.id === spaceOfTerminal(k))?.name : it.name;
    const where = [space, m ?? "This computer"].filter(Boolean).join(" · ");
    const detail = a?.words.detail ? a.words.detail.split("\n").slice(0, 4).join("\n") : null;
    const go = { id: "open", label: "Open", kind: "plain", fn: () => this.open(it) };
    let actions = [go];
    if (a && filter === "plan")
      actions = [{ id: "approve", label: "Approve plan", kind: "primary", fn: (cx) => this.reply(it, allow(), cx) },
        { id: "changes", label: "Ask for changes", kind: "secondary", fn: (cx) => this.reply(it, deny("The person didn't approve this plan yet. Ask them what to change."), cx) }, go];
    else if (a && filter === "permission")
      actions = [{ id: "allow", label: "Allow once", kind: "wool", fn: (cx) => this.reply(it, allow(), cx) },
        { id: "deny", label: "Deny", kind: "plain", fn: (cx) => this.reply(it, deny(), cx) }, go];
    else if (filter === "signin")
      actions = [{ id: "signin", label: "Sign in again", kind: "primary", fn: () => { this.close(); openSettings({ section: "accounts" }); } }, go];
    else if (it.kind === "ask") actions = [{ id: "answer", label: "Answer", kind: "primary", fn: () => this.open(it) }];
    const body = filter === "plan" ? detail : filter === "permission" ? null : it.attention ?? it.error?.message ?? null;
    return { filter, title, sub, where, body, mono: filter === "permission" ? detail : null, actions, remote: Boolean(m) };
  }

  render(cx) {
    const t = theme();
    const p = props();
    const all = items().filter((it) => !this.done.has(it.key)).sort((x, y) => (atMs(y.at) ?? 0) - (atMs(x.at) ?? 0));
    for (const key of [...this.done]) if (!items().some((it) => it.key === key)) this.done.delete(key);
    this.readAsks(all, cx);
    const cards = all.map((it) => ({ it, c: this.card(it) }));
    const counts = Object.fromEntries(NEED_FILTERS.map(([f]) => [f, f === "all" ? cards.length : cards.filter((x) => x.c.filter === f).length]));
    if (this.filter !== "all" && !counts[this.filter]) this.filter = "all";
    const shown = this.filter === "all" ? cards : cards.filter((x) => x.c.filter === this.filter);
    this.at = Math.min(this.at, Math.max(0, shown.length - 1));
    const places = new Set(all.map((it) => (it.terminal ? spaceOfTerminal(terminals().find((x) => x.address === it.terminal)) : it.space ?? it.folder)).filter(Boolean));
    const oldest = all.map((it) => atMs(it.at)).filter(Boolean).sort((x, y) => x - y)[0];
    const dark = isDark();
    const opts = NEED_FILTERS.filter(([f]) => f === "all" || counts[f]).map(([f, label]) => [f,
      h_flex().gap(6).items_center().child(label).child(div().font_family(MONO).text_size(TEXT.id - 0.5).text_color(t.dim).child(String(counts[f])))]);
    return v_flex().id("needs-drawer").track_focus(this.handle).size_full().min_h(0).rounded(RADIUS.dialog).overflow_hidden()
      .bg(dark ? t.chrome : t.popover).border_1().border_color(t.border).text_size(TEXT.body)
      .on_key_down((e, cx) => {
        if (e.key === "escape") this.close();
        else if (e.key === "down") this.at = Math.min(this.at + 1, shown.length - 1);
        else if (e.key === "up") this.at = Math.max(this.at - 1, 0);
        else if (e.key === "enter") shown[this.at]?.c.actions[0]?.fn(cx);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      // Header: the attention banner, the bell, the title in the serif, how many and how old.
      .child(h_flex().relative().flex_none().h(HEADER).px(18).gap(12).items_center().overflow_hidden().border_b(1).border_color(t.border)
        // Nothing waiting: the quiet wool banner and a dim bell, not the lantern.
        .when(dark, (el) => el.bg(bannerBg(all.length ? "attention" : "neutral")).child(bannerDots(all.length ? "attention" : "neutral")))
        .child(svg("mods/spaces-chat/bell.svg").size(18).flex_none().text_color(all.length ? need() : t.dim))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(div().truncate().text_color(t.foreground).when(dark, (el) => el.font_family(SERIF).text_size(HEAD.title))
            .when(!dark, (el) => el.text_size(TEXT.title).font_semibold()).child("Needs you"))
          .child(div().truncate().font_family(MONO).text_size(TEXT.id).text_color(t.muted)
            .child(waitingLine(all.length, places.size, oldest ? ago(oldest, false) : null))))
        .child(closeX("needs-close", () => this.close())))
      .child(h_flex().flex_none().h(FILTERS).px(14).items_center()
        .child(segmented("needs-filter", opts, this.filter, (f) => { this.filter = f; this.at = 0; })))
      .child(div().id("needs-cards").w_full().h(NEEDS_DRAWER.height - HEADER - FILTERS - FOOT - 2).flex_none().overflow_y_scrollbar()
        .child(v_flex().px(14).pt(4).pb(14).gap(12)
          .when(!shown.length, (el) => el.child(div().py(40).w_full().flex().justify_center().text_color(t.dim).child(all.length ? "Nothing here in this filter" : "You're all caught up")))
          .children(shown.map(({ it, c }, i) => this.cardView(it, c, i === this.at, t, dark)))))
      .child(h_flex().flex_none().h(FOOT).px(16).gap(8).items_center().border_t(1).border_color(t.border)
        .font_family(MONO).text_size(TEXT.id)
        .child(link("needs-tasks", "Show in Tasks", () => { this.close(); showInbox(); }))
        .child(div().flex_1())
        .child(link("needs-notify", "Notify settings", () => { this.close(); openSettings({ section: "notify" }); })));
  }

  cardView(it, c, on, t, dark) {
    const id = String(it.key).replace(/[^\w-]/g, "_");
    const icon = ICON[c.filter];
    const age = atMs(it.at);
    return v_flex().id(`need-${id}`).flex_none().rounded(12).overflow_hidden().border_1().border_color(on ? t.dim : t.border).bg(t.raised)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); })
      .child(h_flex().relative().flex_none().px(14).py(10).gap(10).items_center().overflow_hidden().border_b(1).border_color(t.border)
        .when(dark, (el) => el.bg(bannerBg("attention")).child(bannerDots("attention")))
        .child(icon ? svg(icon).size(15).flex_none().text_color(need()) : div().size(8).flex_none().rounded(4).bg(need()))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().truncate().text_color(t.foreground).when(dark, (el) => el.font_family(SERIF).text_size(HEAD.small))
            .when(!dark, (el) => el.font_medium()).child(c.title))
          .when(Boolean(c.sub), (el) => el.child(div().truncate().font_family(MONO).text_size(TEXT.id).text_color(t.muted).child(c.sub))))
        .when(Boolean(age), (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(ago(age, false)))))
      .child(v_flex().px(14).pt(10).gap(8)
        .child(h_flex().gap(6).items_center().font_family(MONO).text_size(TEXT.id).text_color(t.dim)
          .child(svg(`mods/workspace-chrome/${c.remote ? "server" : "folder"}.svg`).size(12).flex_none())
          .child(div().truncate().child(c.where)))
        .when(Boolean(c.body), (el) => el.child(div().text_size(TEXT.body).text_color(t.muted).child(c.body)))
        .when(Boolean(c.mono), (el) => el.child(div().px(12).py(8).rounded(RADIUS.card).border_1().border_color(t.border)
          .bg(dark ? "#0E0F0D" : t.background).font_family(MONO).text_size(TEXT.label).text_color(t.foreground).child(c.mono))))
      .child(h_flex().px(14).pt(10).pb(12).gap(8).items_center()
        .children(c.actions.map((a, i) => {
          const b = button(`need-${a.id}-${id}`, a.label, { kind: a.kind, onClick: (_e, cx) => a.fn(cx) });
          const right = a.id === "open" && i > 0;
          return (a.id === "deny" ? b.text_color(red()) : b).when(right, (el) => el.ml_auto());
        })));
  }
}
