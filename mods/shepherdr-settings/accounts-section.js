// Settings > Accounts (Doop "App 05 · Settings › Accounts"): the Claude accounts on this computer (~/.claude and every
// ~/.claude-<name>) and the Codex sign-in, each with its provider's logo (never an avatar), plan and folder, and
// its meters with the switch tick. The account new work starts on has the filled amber ACTIVE badge and an amber
// edge; the others have "Use for new work". Then "Switch above" and how to add another account.
// What it shows is what the status bar's engine last read (usage-data.js, herdr-usage); Refresh reads again.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared } from "herdr";
import { TEXT, RADIUS, button, need } from "./ui.js";
import { usage, prefs, setPrefs, loadPrefs, refresh, logo, meterBar, activeBadge, MONO, PREFS } from "./usage-data.js";
import { WORDS, pctText, resetsLine, activeOf, switchLine, accountSub, updatedLine, errorLine, midCut } from "./core/usage.js";
import { SECTIONS } from "./core/settings.js";

const METER_W = 220;

function meters(t, id, a) {
  if (a.error) return div().text_size(TEXT.label).text_color(t.dim).child(errorLine(a));
  if (!(a.meters ?? []).length) return div().text_size(TEXT.label).text_color(t.dim).child(WORDS.loading);
  return v_flex().gap(8).children(a.meters.map((m) => h_flex().h(14).gap(12).items_center().whitespace_nowrap()
    .child(div().w(72).flex_none().truncate().text_size(TEXT.label).text_color(t.muted).child(m.label))
    .child(meterBar(`${id}-${m.id}`, m.pct, { width: METER_W }))
    .child(div().w(40).flex_none().text_right().font_family(MONO).text_size(TEXT.id).text_color(t.foreground).child(pctText(m.pct)))
    .child(div().w(100).flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(resetsLine(m.resets_at)))));
}

function accountCard(t, a, provider, active, right) {
  const sub = provider === "codex" ? [a.plan, midCut(a.folder, 40)].filter(Boolean).join(" · ") : accountSub(a, 40);
  return v_flex().id(`acc-${provider}-${a.id}`).w_full().gap(12).p(14).rounded(RADIUS.card + 2).bg(t.raised)
    .border_1().border_color(active ? need() : t.border)
    .child(h_flex().w_full().gap(12).items_center()
      .child(logo(provider, 18))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().min_w(0).truncate().text_size(TEXT.body).font_medium().text_color(t.foreground).tooltip(a.name).child(a.name))
        .child(div().min_w(0).truncate().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(sub)))
      .when(Boolean(right), (el) => el.child(right)))
    .child(meters(t, `acc-m-${provider}-${a.id}`, a));
}

let asked = false;

export function accountsSection(view, t) {
  if (!asked && !shared(PREFS)) { asked = true; loadPrefs().catch(() => {}); }
  const u = usage();
  const list = u?.claude ?? [];
  const pr = prefs();
  const active = activeOf(list, pr);
  const at = pr.switch_at;
  const stepper = h_flex().h(28).flex_none().items_center().gap(4)
    .child(button("acc-sw-minus", "−", { disabled: at <= 50, onClick: () => setPrefs({ switch_at: at - 5 }) }))
    .child(div().w(48).text_center().font_family(MONO).text_size(TEXT.label).font_medium().text_color(t.foreground).child(at >= 100 ? "Off" : `${at}%`))
    .child(button("acc-sw-plus", "+", { disabled: at >= 100, onClick: () => setPrefs({ switch_at: at + 5 }) }));
  const cx = u?.codex;
  const dim = (s) => div().text_size(TEXT.label).line_height("17px").text_color(t.dim).child(s);
  return v_flex()
    .child(h_flex().w_full().gap(12).items_center()
      .child(div().flex_1().child(view.title(t, SECTIONS.find((s) => s.id === "accounts").title)))
      .child(div().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(updatedLine(u?.at)))
      .child(button("acc-refresh", "Refresh", { kind: "plain", onClick: () => refresh() })))
    .child(dim(WORDS.accountsAbout))
    .child(view.heading(t, WORDS.claude))
    .child(v_flex().gap(10).pt(6)
      .when(!u, (el) => el.child(dim(WORDS.loading)))
      .when(Boolean(u) && !list.length, (el) => el.child(dim(WORDS.noAccounts)))
      .children(list.map((a) => accountCard(t, a, "claude", a.id === active?.id, a.id === active?.id ? activeBadge(WORDS.active)
        : button(`acc-use-${a.id}`, "Use for new work", { disabled: Boolean(a.error), onClick: () => setPrefs({ active: a.id }) })))))
    .child(view.row(t, WORDS.switchAbove, switchLine(list, pr), stepper))
    .child(div().pt(10).child(dim(WORDS.addHow)))
    .child(div().pt(4).child(dim(WORDS.notYet)))
    .child(view.heading(t, WORDS.codex))
    .child(div().pt(6).child(cx?.signed_in ? accountCard(t, { id: "codex", name: "Codex", ...cx }, "codex", false, null) : dim(WORDS.codexOut)));
}
