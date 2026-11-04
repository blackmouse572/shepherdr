// Settings > Accounts (Doop "App 05 · Settings › Accounts"): the Claude accounts on this computer (~/.claude and every
// ~/.claude-<id>) and the Codex sign-in, each with its provider's logo (never an avatar), plan and folder, and its
// meters with the switch tick. The account new tasks start on (herdr-task, herdr_task/accounts.py) has the filled
// amber ACTIVE badge and an amber edge; the others have "Use for new work". Each Claude account can be renamed (a
// name of the person's own: the folder stays, since a Mac keeps its sign-in under the folder's path), signed in again
// (a terminal over the window), and removed from Shepherdr (hidden: the folder stays; never the default or the active
// one), with an inline Remove / Keep. Then "Switch above", and a new account: a name, its folder made with
// Shepherdr's hooks, then the terminal to sign in.
// What it shows is what the status bar's engine last read (usage-data.js, herdr-usage); Refresh reads again.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { shared } from "herdr";
import { TEXT, RADIUS, H, button, need, red, toast, plainError } from "./ui.js";
import { usage, accounts, prefs, setPrefs, loadPrefs, refresh, signIn, addAccount, renameAccount, hideAccount, showAccount,
  logo, meterBar, activeBadge, MONO, PREFS } from "./usage-data.js";
import { WORDS, pctText, resetsLine, activeOf, switchLine, accountSub, updatedLine, errorLine, midCut, hiddenOf, addProblem,
  accountId } from "./core/usage.js";
import { SECTIONS } from "./core/settings.js";

const METER_W = 220;

// The section's state, made in the window's init (boxes need a live host call).
export function accountsInit(cx) {
  const s = { name: InputState.new({ placeholder: WORDS.addPlaceholder }), rename: InputState.new({ placeholder: "" }),
    renaming: null, confirm: null, err: "", busy: false };
  s.name.on("change", (_e, cx) => { s.err = ""; cx.notify(); });
  s.name.on("submit", (_e, cx) => add(s, cx));
  s.rename.on("submit", (_e, cx) => { saveRename(s); cx.notify(); });
  if (!shared(PREFS)) loadPrefs().catch(() => {});
  return s;
}

function add(s, cx) {
  const name = s.name.value();
  if (s.busy) return;
  const why = addProblem(name, usage()?.claude ?? []);
  if (why) { s.err = why; cx.notify(); return; }
  s.busy = true;
  cx.notify();
  cx.spawn(async (cx) => {
    try { await addAccount(name); s.name.set_value(""); s.err = ""; } catch (e) { s.err = plainError(e) || "Couldn't add it."; }
    s.busy = false;
    cx.notify();
  });
}

function saveRename(s) {
  if (s.renaming) renameAccount(s.renaming, s.rename.value());
  s.renaming = null;
}

const signInNow = (a) => signIn(a.id, a.name).catch((e) => toast({ title: "Couldn't open the sign-in", body: plainError(e), level: "error" }));

function meters(t, id, a) {
  if (a.error) return div().text_size(TEXT.label).text_color(t.dim).child(errorLine(a));
  if (!(a.meters ?? []).length) return div().text_size(TEXT.label).text_color(t.dim).child(WORDS.loading);
  return v_flex().gap(8).children(a.meters.map((m) => h_flex().h(14).gap(12).items_center().whitespace_nowrap()
    .child(div().w(72).flex_none().truncate().text_size(TEXT.label).text_color(t.muted).child(m.label))
    .child(meterBar(`${id}-${m.id}`, m.pct, { width: METER_W }))
    .child(div().w(40).flex_none().text_right().font_family(MONO).text_size(TEXT.id).text_color(t.foreground).child(pctText(m.pct)))
    .child(div().w(100).flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(resetsLine(m.resets_at)))));
}

// One account: logo, name (or the rename box), plan · folder, the badge or button at the right, its meters, and
// for a Claude account its actions underneath.
function accountCard(t, s, a, provider, active, right) {
  const sub = provider === "codex" ? [a.plan, midCut(a.folder, 40)].filter(Boolean).join(" · ") : accountSub(a, 40);
  const renaming = provider === "claude" && s?.renaming === a.id;
  const nameEl = renaming
    ? div().h(H.sm).w(220).px(8).flex().items_center().rounded(RADIUS.control).border_1().border_color(t.input).bg(t.background)
      .child(Input.new(s.rename).w_full().text_size(TEXT.body).text_color(t.foreground))
    : div().min_w(0).truncate().text_size(TEXT.body).font_medium().text_color(t.foreground).tooltip(a.name).child(a.name);
  const confirming = s?.confirm === a.id;
  const actions = provider !== "claude" ? null : renaming
    ? h_flex().gap(6).child(button(`acc-rn-save-${a.id}`, WORDS.save, { kind: "primary", onClick: () => saveRename(s) }))
      .child(button(`acc-rn-no-${a.id}`, WORDS.cancel, { kind: "plain", onClick: () => { s.renaming = null; } }))
    : confirming
      ? h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).text_size(TEXT.label).line_height("17px").text_color(t.dim).child(WORDS.removeAbout(a.folder)))
        .child(button(`acc-rm-yes-${a.id}`, WORDS.removeYes, { onClick: () => { s.confirm = null; hideAccount(a.id); } }))
        .child(button(`acc-rm-no-${a.id}`, WORDS.keep, { kind: "plain", onClick: () => { s.confirm = null; } }))
      : h_flex().gap(4).items_center()
        .child(button(`acc-rn-${a.id}`, WORDS.rename, { kind: "plain", onClick: () => {
          s.renaming = a.id; s.confirm = null; s.rename.set_value(a.name); s.rename.focus();
        } }))
        .child(button(`acc-si-${a.id}`, a.error === "signed-out" ? WORDS.signIn : WORDS.signInAgain, { kind: "plain", onClick: () => signInNow(a) }))
        .when(a.id !== "default" && !active, (el) => el.child(button(`acc-rm-${a.id}`, WORDS.remove, { kind: "plain", onClick: () => {
          s.confirm = a.id; s.renaming = null;
        } })));
  return v_flex().id(`acc-${provider}-${a.id}`).w_full().gap(12).p(14).rounded(RADIUS.card + 2).bg(t.raised)
    .border_1().border_color(active ? need() : t.border)
    .child(h_flex().w_full().gap(12).items_center()
      .child(logo(provider, 18))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(nameEl)
        .child(div().min_w(0).truncate().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(sub)))
      .when(Boolean(right), (el) => el.child(right)))
    .child(meters(t, `acc-m-${provider}-${a.id}`, a))
    .when(Boolean(actions), (el) => el.child(div().pt(2).border_t(1).border_color(t.border).child(div().pt(8).child(actions))));
}

export function accountsSection(view, t) {
  const s = view.acc;
  const u = usage();
  const pr = prefs();
  const list = accounts();
  const gone = hiddenOf(u?.claude ?? [], pr);
  const active = activeOf(list, pr);
  const at = pr.switch_at;
  const stepper = h_flex().h(28).flex_none().items_center().gap(4)
    .child(button("acc-sw-minus", "−", { disabled: at <= 50, onClick: () => setPrefs({ switch_at: at - 5 }) }))
    .child(div().w(48).text_center().font_family(MONO).text_size(TEXT.label).font_medium().text_color(t.foreground).child(at >= 100 ? "Off" : `${at}%`))
    .child(button("acc-sw-plus", "+", { disabled: at >= 100, onClick: () => setPrefs({ switch_at: at + 5 }) }));
  const cx = u?.codex;
  const dim = (x) => div().text_size(TEXT.label).line_height("17px").text_color(t.dim).child(x);
  const typed = s ? s.name.value() : "";
  const canAdd = Boolean(s) && !s.busy && !addProblem(typed, u?.claude ?? []);
  const form = !s ? null : v_flex().gap(8).py(12).border_b(1).border_color(t.border)
    .child(h_flex().gap(8).items_end()
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(div().text_size(TEXT.label).text_color(t.dim).child(WORDS.addField))
        .child(div().h(H.lg).w_full().px(9).flex().items_center().rounded(RADIUS.control).border_1().border_color(t.input).bg(t.background)
          .child(Input.new(s.name).w_full().text_size(TEXT.body).text_color(t.foreground))))
      .child(button("acc-add", s.busy ? "Adding…" : WORDS.addButton, { kind: "primary", size: "lg", disabled: !canAdd, onClick: (_e, cx) => add(s, cx) })))
    .child(div().text_size(TEXT.label).line_height("17px").text_color(s.err ? red() : t.dim)
      .child(s.err || WORDS.addHint(typed.trim() ? accountId(typed) : "")));
  return v_flex()
    .child(h_flex().w_full().gap(12).items_center()
      .child(div().flex_1().child(view.title(t, SECTIONS.find((x) => x.id === "accounts").title)))
      .child(div().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(updatedLine(u?.at)))
      .child(button("acc-refresh", "Refresh", { kind: "plain", onClick: () => refresh() })))
    .child(dim(WORDS.accountsAbout))
    .child(view.heading(t, WORDS.claude))
    .child(v_flex().gap(10).pt(6)
      .when(!u, (el) => el.child(dim(WORDS.loading)))
      .when(Boolean(u) && !list.length, (el) => el.child(dim(WORDS.noAccounts)))
      .children(list.map((a) => accountCard(t, s, a, "claude", a.id === active?.id, a.id === active?.id ? activeBadge(WORDS.active)
        : button(`acc-use-${a.id}`, "Use for new work", { disabled: Boolean(a.error), onClick: () => setPrefs({ active: a.id }) })))))
    .when(gone.length > 0, (el) => el.child(h_flex().pt(10).gap(8).items_center().flex_wrap()
      .child(dim(WORDS.hidden(gone.map((a) => a.name).join(", "))))
      .children(gone.map((a) => button(`acc-show-${a.id}`, gone.length > 1 ? `${WORDS.showAgain}: ${a.name}` : WORDS.showAgain,
        { kind: "plain", onClick: () => showAccount(a.id) })))))
    .child(div().pt(10).child(dim(WORDS.newWork)))
    .child(view.row(t, WORDS.switchAbove, switchLine(list, pr), stepper))
    .child(view.heading(t, WORDS.add))
    .when(Boolean(form), (el) => el.child(form))
    .child(view.heading(t, WORDS.codex))
    .child(div().pt(6).child(cx?.signed_in ? accountCard(t, s, { id: "codex", name: "Codex", ...cx }, "codex", false, null) : dim(WORDS.codexOut)));
}
