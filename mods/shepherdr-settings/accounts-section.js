// Settings > Accounts (Doop "App 05 · Settings › Accounts"): the Claude accounts on this computer (~/.claude and every
// ~/.claude-<id>) and the Codex sign-in.
//   header     the page title, when usage was read, Refresh, and This Mac | <machine> ... when there are machines:
//              another machine shows read-only, as Settings > Machines reads it (its ~/.claude and Codex).
//   Claude     a card: its header with Add account (the name field opens under it), then one compact row per account
//              in the switch order: its grip, initial avatar, name and folder (mono), plan, a small meter with the
//              switch tick and "59% 5h · 51% wk", a badge (Default ★ where new work starts, Next, Skipped) and ⋯.
//              Drag a row by its grip to set the switch order (the line shows where it lands).
//              ⋯: Rename, Set as default, Sign in again, Open folder, Move up / down (the order without a drag),
//              Skip when switching, Remove… (hidden from Shepherdr; the folder stays).
//   Switching  Switch automatically, Switch above (the 5h window), Work already running (Stays | Moves: stored,
//              running work stays for now), Toast with Undo.
//   Codex      signed in and its plan, a meter, Sign in again (codex login in a terminal) and Sign out.
// What it shows is what the status bar's engine last read (usage-data.js, herdr-usage); Refresh reads again.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Popup } from "gpui-base";
import { shared, machines, window as win } from "herdr";
import { TEXT, RADIUS, H, button, need, red, green, onStatus, toast, plainError, toggleSwitch, segmented, isDark, bannerBg, bannerDots, SERIF } from "./ui.js";
import { usage, accounts, prefs, setPrefs, loadPrefs, refresh, signIn, addAccount, renameAccount, hideAccount, showAccount,
  setDefault, setSkipped, openFolder, codexSignIn, codexSignOut, logo, meterBar, avatar, MONO, PREFS } from "./usage-data.js";
import { WORDS, pctText, resetsLine, activeOf, updatedLine, errorLine, hiddenOf, addProblem, accountId, ordered, moved,
  dropped, dropEdge, staleLine, badgeOf, usageShort, session, weekly, metersOf, clampSwitch, skipped as isSkipped } from "./core/usage.js";
import { statsOf, pollNow } from "./machines.js";
import { SECTIONS } from "./core/settings.js";

const I = (name) => `mods/shepherdr-settings/${name}.svg`;
const ROW_H = 52, MENU_W = 228;
const COL = { grip: 14, avatar: 26, plan: 64, usage: 168, badge: 104, more: 28 };

// The section's state, made in the window's init (boxes need a live host call).
export function accountsInit(cx) {
  const s = { name: InputState.new({ placeholder: WORDS.addPlaceholder }), rename: InputState.new({ placeholder: "" }),
    renaming: null, confirm: null, menu: null, adding: false, codexOut: false, machine: null, err: "", busy: false,
    pressed: null, over: null }; // pressed: the account dragged by its grip; over: the row it would land on
  s.name.on("change", (_e, cx) => { s.err = ""; cx.notify(); });
  s.name.on("submit", (_e, cx) => add(s, cx));
  s.rename.on("submit", (_e, cx) => { saveRename(s); cx.notify(); });
  if (!shared(PREFS)) loadPrefs().catch(() => {});
  return s;
}

// Esc: closes what's open here first. True when it did.
export function accountsEscape(s) {
  if (!s || !(s.renaming || s.confirm || s.menu || s.adding || s.codexOut || s.pressed)) return false;
  Object.assign(s, { renaming: null, confirm: null, menu: null, adding: false, codexOut: false, pressed: null, over: null });
  return true;
}

function add(s, cx) {
  const name = s.name.value();
  if (s.busy) return;
  const why = addProblem(name, usage()?.claude ?? []);
  if (why) { s.err = why; cx.notify(); return; }
  s.busy = true;
  cx.notify();
  cx.spawn(async (cx) => {
    try { await addAccount(name); s.name.set_value(""); s.err = ""; s.adding = false; } catch (e) { s.err = plainError(e) || "Couldn't add it."; }
    s.busy = false;
    cx.notify();
  });
}

function saveRename(s) {
  if (s.renaming) renameAccount(s.renaming, s.rename.value());
  s.renaming = null;
}

const failed = (title) => (e) => toast({ title, body: plainError(e), level: "error" });
const signInNow = (a) => signIn(a.id, a.name).catch(failed("Couldn't open the sign-in"));

// A card with the design's banner header: icon, title in the serif, a dim mono line, controls at the right.
// state: the banner's ("attention" gets the lantern wash and an amber edge; Settings > Machines uses it too).
export function card(t, id, { lead, title, sub, right = null, state = "neutral" }, body) {
  const d = isDark();
  return v_flex().id(id).w_full().rounded(RADIUS.card + 4).overflow_hidden().bg(t.raised).border_1()
    .border_color(state === "attention" ? `${need()}66` : t.border)
    .child(div().relative().w_full().h(54).flex_none().overflow_hidden().border_b(1).border_color(t.border)
      .when(d, (el) => el.bg(bannerBg(state)).child(bannerDots(state)))
      .child(h_flex().absolute().inset_0().px(14).gap(10).items_center()
        .child(lead)
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().truncate().text_color(t.foreground).when(d, (el) => el.font_family(SERIF).text_size(16))
            .when(!d, (el) => el.text_size(TEXT.body).font_semibold()).child(title))
          .when(Boolean(sub), (el) => el.child(div().truncate().font_family(MONO).text_size(TEXT.id).text_color(t.muted).child(sub))))
        .when(Boolean(right), (el) => el.child(right))))
    .children(body);
}

// The small meter with the switch tick and its words ("59% 5h · 51% wk").
function usageCell(t, a, pr) {
  const cell = h_flex().w(COL.usage).flex_none().gap(8).items_center().whitespace_nowrap().font_family(MONO).text_size(TEXT.id).text_color(t.dim);
  if (isSkipped(a, pr)) return cell.child(WORDS.skippedLine);
  if (a.error) return cell.child(div().truncate().text_size(TEXT.label).tooltip(errorLine(a)).child(errorLine(a)));
  if (!session(a) && !weekly(a)) return cell.child(WORDS.loading);
  const s = session(a);
  // Kept from an earlier read (keepGood): dimmer, and when they were read on hover.
  const old = staleLine(a);
  return cell.when(Boolean(old), (el) => el.id(`acc-us-${a.id}`).opacity(0.6).tooltip(`Usage ${old}`))
    .child(meterBar(`acc-sm-${a.id}`, s?.pct ?? null, { width: 52, height: 5, switchAt: clampSwitch(pr.switch_at) }))
    .child(div().truncate().child(usageShort(a)));
}

function badge(t, kind) {
  if (!kind) return div().w(COL.badge).flex_none();
  const look = kind === "default"
    ? (el) => el.bg(need()).text_color(onStatus())
    : (el) => el.border_1().border_color(kind === "next" ? t.input : t.border).text_color(kind === "next" ? t.muted : t.dim);
  const words = { default: WORDS.badgeDefault, next: WORDS.badgeNext, skipped: WORDS.badgeSkipped }[kind];
  return h_flex().w(COL.badge).flex_none().child(look(h_flex().h(20).px(8).gap(5).flex_none().items_center().rounded(10)
    .font_family(MONO).text_size(TEXT.id - 0.5).font_medium()
    .when(kind === "default", (el) => el.child(svg(I("star")).size(11)))
    .child(words)));
}

// One row of the ⋯ menu: pressing it acts at once (the menu closes on any press outside it).
function menuItem(t, id, label, icon, onPick, { hint = null, danger = false, disabled = false } = {}) {
  return h_flex().id(id).h(30).w_full().flex_none().px(9).gap(9).items_center().rounded(RADIUS.control)
    .text_size(TEXT.body - 0.5).text_color(disabled ? t.dim : danger ? red() : t.foreground)
    .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); onPick(cx); cx.notify(); }))
    .child(div().size(14).flex_none().when(Boolean(icon), (el) => el.child(svg(I(icon)).size(14).text_color(danger ? red() : t.muted))))
    .child(div().flex_1().min_w(0).truncate().child(label))
    .when(Boolean(hint), (el) => el.child(div().flex_none().font_family(MONO).text_size(10).text_color(t.dim).child(hint)));
}

function menu(t, s, a, list, pr, active) {
  const close = () => { s.menu = null; };
  const ids = ordered(list, pr).map((x) => x.id);
  const at = ids.indexOf(a.id);
  const sep = () => div().h(1).mx(6).my(4).flex_none().bg(t.border);
  const skip = isSkipped(a, pr);
  return v_flex().id(`acc-menu-${a.id}`).w(MENU_W).mt(4).p(5).rounded(11).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(menuItem(t, "am-rename", WORDS.rename, "pencil", () => { close(); s.renaming = a.id; s.rename.set_value(a.name); s.rename.focus(); }))
    .child(menuItem(t, "am-default", WORDS.setDefault, "star", () => { close(); setDefault(a.id); }, { disabled: active || Boolean(a.error) }))
    .child(menuItem(t, "am-signin", a.error === "signed-out" ? WORDS.signIn : WORDS.signInAgain, "login", () => { close(); signInNow(a); }))
    .child(menuItem(t, "am-folder", WORDS.openFolder, "folder", () => { close(); openFolder(a.id).catch(failed("Couldn't open the folder")); }))
    .child(sep())
    .child(menuItem(t, "am-up", WORDS.moveUp, "arrow-up", () => { setPrefs({ order: moved(list, pr, a.id, -1) }); }, { disabled: at <= 0 }))
    .child(menuItem(t, "am-down", WORDS.moveDown, "arrow-down", () => { setPrefs({ order: moved(list, pr, a.id, 1) }); }, { disabled: at < 0 || at >= ids.length - 1 }))
    .child(menuItem(t, "am-skip", skip ? WORDS.unskip : WORDS.skip, "skip", () => { close(); setSkipped(a.id, !skip); }))
    .when(a.id !== "default" && !active, (el) => el.child(sep())
      .child(menuItem(t, "am-remove", WORDS.removeMenu, "trash", () => { close(); s.confirm = a.id; s.renaming = null; }, { hint: WORDS.keepsFolder, danger: true })));
}

// Released: the dragged account takes the row the line shows; a press without a move changes nothing.
function release(s, list, pr, cx) {
  const from = s.pressed, to = s.over;
  if (!from) return;
  s.pressed = null;
  s.over = null;
  if (to && to !== from) setPrefs({ order: dropped(list, pr, from, to) });
  cx.notify();
}

// Where a dragged account would land.
const dropLine = (t, edge) => div().absolute().left(0).right(0).h(2).bg(t.accent).when(edge === "top", (l) => l.top(0)).when(edge === "bottom", (l) => l.bottom(0));

// One compact row (App 05): grip, avatar, name and folder, plan, usage, badge, ⋯.
function accountRow(t, s, a, i, list, pr) {
  const active = activeOf(list, pr)?.id === a.id;
  const dim = isSkipped(a, pr);
  const renaming = s?.renaming === a.id;
  const open = s?.menu === a.id;
  const nameEl = renaming
    ? div().h(H.sm).w_full().max_w(220).px(8).flex().items_center().rounded(RADIUS.control).border_1().border_color(t.input).bg(t.background)
      .child(Input.new(s.rename).w_full().text_size(TEXT.body).text_color(t.foreground))
    : div().min_w(0).truncate().text_size(TEXT.body).font_medium().text_color(dim ? t.muted : t.foreground).tooltip(a.name).child(a.name);
  const dots = div().id(`acc-more-${a.id}`).size(COL.more).flex_none().flex().items_center().justify_center().rounded(RADIUS.control)
    .text_color(open ? t.foreground : t.muted).when(open, (el) => el.bg(t.hover))
    .cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground)).tooltip("More")
    .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); s.menu = open ? null : a.id; s.confirm = null; cx.notify(); })
    .child(svg(I("dots")).size(16));
  const more = Popup.new(`acc-pop-${a.id}`, dots).anchor("top_right").when(open, (el) => el.content(menu(t, s, a, list, pr, active)));
  const dragging = Boolean(s?.pressed);
  const grip = div().id(`acc-grip-${a.id}`).w(COL.grip).h(ROW_H).flex_none().flex().items_center().justify_center()
    .text_color(t.dim).when(Boolean(s) && list.length > 1, (el) => el.cursor_grab().hover((st) => st.text_color(t.foreground)).tooltip("Drag to reorder")
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); Object.assign(s, { pressed: a.id, over: a.id, menu: null }); cx.notify(); }))
    .child(svg(I("grip")).size(13));
  const row = h_flex().relative().id(`acc-row-${a.id}`).w_full().h(ROW_H).flex_none().px(14).gap(12).items_center()
    .when(i > 0, (el) => el.border_t(1).border_color(t.border))
    .when(open, (el) => el.bg(t.hover))
    .when(dragging, (el) => el.cursor_grabbing().on_mouse_move((_e, cx) => { if (s.pressed && s.over !== a.id) { s.over = a.id; cx.notify(); } }))
    .when(dragging && s.pressed === a.id && s.over !== a.id, (el) => el.opacity(0.5))
    .when(dragging && s.pressed !== a.id && s.over === a.id, (el) => el.child(dropLine(t, dropEdge(list, pr, s.pressed, a.id))))
    .child(grip)
    .child(avatar(a.name, COL.avatar, dim))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(nameEl)
      .child(div().min_w(0).truncate().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(a.folder ?? "")))
    .child(div().w(COL.plan).flex_none().truncate().text_size(TEXT.body).text_color(dim ? t.dim : t.muted).child(a.plan ?? ""))
    .child(usageCell(t, a, pr))
    .child(badge(t, badgeOf(a, list, pr)))
    .child(more);
  const under = renaming
    ? h_flex().gap(6).justify_end().child(button(`acc-rn-save-${a.id}`, WORDS.save, { kind: "primary", onClick: () => saveRename(s) }))
      .child(button(`acc-rn-no-${a.id}`, WORDS.cancel, { kind: "plain", onClick: () => { s.renaming = null; } }))
    : s?.confirm === a.id
      ? h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).text_size(TEXT.label).line_height("17px").text_color(t.dim).child(WORDS.removeAbout(a.folder)))
        .child(button(`acc-rm-yes-${a.id}`, WORDS.removeYes, { onClick: () => { s.confirm = null; hideAccount(a.id); } }))
        .child(button(`acc-rm-no-${a.id}`, WORDS.keep, { kind: "plain", onClick: () => { s.confirm = null; } }))
      : null;
  return v_flex().w_full().child(row).when(Boolean(under), (el) => el.child(div().px(14).pb(10).child(under)));
}

function addForm(t, s, u) {
  const typed = s.name.value();
  const canAdd = !s.busy && !addProblem(typed, u?.claude ?? []);
  return v_flex().gap(8).px(14).py(12).border_b(1).border_color(t.border)
    .child(h_flex().gap(8).items_center()
      .child(div().h(H.lg).flex_1().min_w(0).px(9).flex().items_center().rounded(RADIUS.control).border_1().border_color(t.input).bg(t.background)
        .child(Input.new(s.name).w_full().text_size(TEXT.body).text_color(t.foreground)))
      .child(button("acc-add", s.busy ? "Adding…" : WORDS.addButton, { kind: "primary", size: "lg", disabled: !canAdd, onClick: (_e, cx) => add(s, cx) }))
      .child(button("acc-add-no", WORDS.cancel, { kind: "plain", size: "lg", onClick: () => { s.adding = false; s.err = ""; } })))
    .child(div().text_size(TEXT.label).line_height("17px").text_color(s.err ? red() : t.dim)
      .child(s.err || WORDS.addHint(typed.trim() ? accountId(typed) : "")));
}

// A settings row inside a card (App 05's Switching rows): words left, the control right.
function cardRow(t, i, title, about, control) {
  return h_flex().w_full().min_h(54).px(14).py(8).gap(14).items_center().when(i > 0, (el) => el.border_t(1).border_color(t.border))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().text_size(TEXT.body).text_color(t.foreground).child(title))
      .child(div().text_size(TEXT.label - 0.5).line_height("16px").text_color(t.dim).child(about)))
    .child(div().flex_none().child(control));
}

function switchingCard(t, pr, where) {
  const at = clampSwitch(pr.switch_at);
  const stepper = h_flex().h(28).flex_none().items_center().rounded(RADIUS.control + 2).bg(t.background).border_1().border_color(t.border)
    .child(stepBtn(t, "acc-sw-minus", "minus", at <= 50, () => setPrefs({ switch_at: at - 5 })))
    .child(div().w(44).text_center().font_family(MONO).text_size(TEXT.label).font_medium().text_color(t.foreground).child(`${at}%`))
    .child(stepBtn(t, "acc-sw-plus", "plus", at >= 95, () => setPrefs({ switch_at: at + 5 })));
  return card(t, "acc-switching", { lead: svg(I("switch")).size(16).flex_none().text_color(need()), title: WORDS.switching, sub: WORDS.switchingSub(where) }, [
    cardRow(t, 0, WORDS.auto, WORDS.autoAbout, toggleSwitch("acc-auto", pr.auto, (v) => setPrefs({ auto: v }))),
    cardRow(t, 1, WORDS.switchAbove, WORDS.switchAboutRow, stepper),
    cardRow(t, 2, WORDS.running, pr.running === "moves" ? WORDS.runningMoves : WORDS.runningStays,
      segmented("acc-running", [["stays", WORDS.stays], ["moves", WORDS.moves]], pr.running, (v) => setPrefs({ running: v }))),
    cardRow(t, 3, WORDS.undoToast, WORDS.undoAbout, toggleSwitch("acc-undo", pr.undo, (v) => setPrefs({ undo: v }))),
  ]);
}

function stepBtn(t, id, icon, off, onClick) {
  return div().id(id).size(28).flex().items_center().justify_center().text_color(off ? t.dim : t.muted)
    .when(!off, (el) => el.cursor_pointer().hover((st) => st.text_color(t.foreground).bg(t.hover))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(); cx.notify(); }))
    .child(svg(I(icon)).size(13));
}

// The Codex card: signed in and its plan, its meter, then Sign in again and Sign out (with a confirm).
function codexCard(t, s, cx, readOnly = false) {
  const on = Boolean(cx?.signed_in);
  const ses = session(cx), wk = weekly(cx);
  const dim = (x) => div().text_size(TEXT.label).line_height("17px").text_color(t.dim).child(x);
  const body = v_flex().p(14).gap(12)
    .child(h_flex().gap(10).items_center()
      .child(div().size(7).flex_none().rounded(4).bg(on ? green() : t.dim))
      .child(div().text_size(TEXT.body).font_medium().text_color(t.foreground).child(on ? WORDS.signedIn : "Signed out"))
      .when(on && Boolean(cx.plan), (el) => el.child(div().text_size(TEXT.body).text_color(t.dim).child(`ChatGPT ${cx.plan}`))))
    .when(on && Boolean(ses || wk), (el) => el.child(h_flex().gap(8).items_center().whitespace_nowrap().font_family(MONO).text_size(TEXT.id).text_color(t.dim)
      .child(meterBar("acc-codex-m", ses?.pct ?? null, { width: 120, height: 5 }))
      .child(usageShort(cx))))
    .when(on && Boolean(cx.error), (el) => el.child(dim(errorLine(cx))))
    .child(dim(on ? WORDS.codexAbout : WORDS.codexOut))
    .when(!readOnly && !s.codexOut, (el) => el.child(h_flex().gap(8)
      .child(button("acc-codex-in", on ? WORDS.signInAgain : WORDS.signIn, { icon: I("login"), onClick: () => codexSignIn().catch(failed("Couldn't open the sign-in")) }))
      .when(on, (el) => el.child(button("acc-codex-out", WORDS.signOut, { kind: "plain", onClick: () => { s.codexOut = true; } })))))
    .when(!readOnly && s.codexOut, (el) => el.child(v_flex().gap(8)
      .child(dim(WORDS.signOutAbout))
      .child(h_flex().gap(8)
        .child(button("acc-codex-out-yes", WORDS.signOut, { onClick: () => { s.codexOut = false; codexSignOut().catch(failed("Couldn't sign out of Codex")); } }))
        .child(button("acc-codex-out-no", WORDS.keep, { kind: "plain", onClick: () => { s.codexOut = false; } })))));
  return card(t, "acc-codex", { lead: logo("codex", 16), title: WORDS.codex, sub: WORDS.codexSub }, [body]);
}

// Another machine, read-only: its ~/.claude and Codex as Settings > Machines reads them (lib/machines.js).
function remoteView(t, name) {
  const st = statsOf(name);
  const read = (cli) => st?.limits?.[cli] ?? null;
  const asAccount = (cli) => {
    const r = read(cli);
    return r ? { id: cli, name: cli === "claude" ? "Default" : "Codex", folder: cli === "claude" ? "~/.claude" : "~/.codex",
      plan: r.plan ? String(r.plan)[0].toUpperCase() + String(r.plan).slice(1) : null, signed_in: r.state === "ok",
      meters: r.state === "ok" ? metersOf(r.windows) : [], error: r.state === "ok" ? null : r.state === "signed-out" ? "signed-out" : "error" } : null;
  };
  const dim = (x) => div().text_size(TEXT.label).line_height("17px").text_color(t.dim).child(x);
  const cl = asAccount("claude"), co = asAccount("codex");
  if (!cl && !co) return v_flex().gap(10).pt(10).child(dim(WORDS.remoteNone(name)));
  const meters = (a) => v_flex().gap(8).p(14).children(a.error ? [dim(errorLine(a))] : a.meters.map((m) => h_flex().h(14).gap(12).items_center().whitespace_nowrap()
    .child(div().w(72).flex_none().truncate().text_size(TEXT.label).text_color(t.muted).child(m.label))
    .child(meterBar(`acc-r-${a.id}-${m.id}`, m.pct, { width: 200 }))
    .child(div().w(40).flex_none().text_right().font_family(MONO).text_size(TEXT.id).text_color(t.foreground).child(pctText(m.pct)))
    .child(div().w(100).flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(resetsLine(m.resets_at)))));
  return v_flex().gap(14).pt(10)
    .child(dim(WORDS.remoteNote(name)))
    .when(Boolean(cl), (el) => el.child(card(t, "acc-r-claude", { lead: logo("claude", 16), title: WORDS.claude,
      sub: [cl.name, cl.plan, cl.folder].filter(Boolean).join(" · ") }, [meters(cl)])))
    .when(Boolean(co), (el) => el.child(card(t, "acc-r-codex", { lead: logo("codex", 16), title: WORDS.codex,
      sub: [co.plan, co.folder].filter(Boolean).join(" · ") }, [meters(co)])));
}

export function accountsSection(view, t, cx) {
  const s = view.acc;
  const u = usage();
  const pr = prefs();
  const list = accounts();
  const rows = ordered(list, pr);
  const gone = hiddenOf(u?.claude ?? [], pr);
  const dim = (x) => div().text_size(TEXT.label).line_height("17px").text_color(t.dim).child(x);
  const here = win()?.platform === "macos" ? "This Mac" : "This computer";
  const others = (machines() ?? []).filter((m) => m.name && !m.temporary).map((m) => m.name);
  const remote = s?.machine && others.includes(s.machine) ? s.machine : null;
  const pickMachine = (v, _e, cx) => {
    s.machine = v || null;
    s.menu = null;
    if (s.machine) cx.spawn(async (cx) => { await pollNow({ limits: true, only: s.machine, limitsOlder: 60000 }).catch(() => {}); cx.notify(); });
  };
  const head = h_flex().w_full().gap(12).items_center()
    .child(div().flex_1().child(view.title(t, SECTIONS.find((x) => x.id === "accounts").title)))
    .when(!remote, (el) => el.child(div().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(updatedLine(u?.at)))
      .child(button("acc-refresh", "Refresh", { kind: "plain", onClick: () => refresh() })))
    .when(Boolean(s) && others.length > 0, (el) => el.child(segmented("acc-machine", [["", here], ...others.map((m) => [m, m])], remote ?? "", pickMachine)));
  const root = v_flex().on_mouse_down("left", (_e, cx) => { if (s?.menu) { s.menu = null; cx.notify(); } })
    .child(head)
    .child(dim(WORDS.accountsAbout));
  if (remote) return root.child(remoteView(t, remote));
  const addBtn = s ? button("acc-add-open", WORDS.addAccount, { kind: "primary", icon: I("plus"), onClick: () => { s.adding = !s.adding; if (s.adding) s.name.focus(); } }) : null;
  const claude = card(t, "acc-claude", { lead: logo("claude", 16), title: WORDS.claude, sub: WORDS.claudeSub(list.length), right: addBtn }, [
    ...(s?.adding ? [addForm(t, s, u)] : []),
    ...(!u ? [div().p(14).child(dim(WORDS.loading))] : !list.length ? [div().p(14).child(dim(WORDS.noAccounts))] : []),
    ...rows.map((a, i) => accountRow(t, s, a, i, list, pr)),
  ])
    // A drag ends on release over the card; leaving the card drops nothing.
    .when(Boolean(s?.pressed), (el) => el.on_mouse_up("left", (_e, cx) => release(s, list, pr, cx))
      .on_hover((hovered, cx) => { if (!hovered && s.pressed) { s.pressed = null; s.over = null; cx.notify(); } }));
  return root
    .child(div().pt(12).child(claude))
    .when(gone.length > 0, (el) => el.child(h_flex().pt(8).gap(8).items_center().flex_wrap()
      .child(dim(WORDS.hidden(gone.map((a) => a.name).join(", "))))
      .children(gone.map((a) => button(`acc-show-${a.id}`, gone.length > 1 ? `${WORDS.showAgain}: ${a.name}` : WORDS.showAgain,
        { kind: "plain", onClick: () => showAccount(a.id) })))))
    .child(div().pt(8).child(dim(WORDS.newWork)))
    .child(h_flex().w_full().pt(14).gap(14).items_start()
      .child(div().flex_1().min_w(0).child(switchingCard(t, pr, here)))
      .child(div().w(300).flex_none().child(s ? codexCard(t, s, u?.codex) : div())));
}
