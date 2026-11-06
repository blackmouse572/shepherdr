// The tab bar's branch chip's menu (Doop App 02b): where the shown code lives, ways to open it, and the repo's other
// checkouts: go to one, or work in two at once (one in a new tab, or beside this one). The tab bar (tabs-tasks) reads the git (core/worktree.js BRANCH_STATE) and opens this mod as a
// popup with props { view: "branch", state (branchState()), branch, machine, files (the Files panel is on),
// editor (the command to open it with there, else null), update (Update from its base shows), pr ({ number, state, url }),
// task (the id of the task whose worktree this is: in the header, and the footer says it goes once merged)}.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, run, spaces, panes, terminals, exec, knownAgents } from "herdr";
import { BRANCH_MENU as M, otherTrees, baseLine, changesLine, editorName, updateLabel, updateArgv, prLine, agentEntry } from "./core/worktree.js";
import { tilde, midCut } from "./core/spaces.js";
import { bannerBg, bannerDots, isDark, green, red, working, MONO, SERIF, HEAD, TEXT, RADIUS } from "./ui.js";

const BRANCH = "mods/workspace-chrome-shepherdr/git-branch.svg";
const inside = (p, f) => p === f || String(p ?? "").startsWith(`${f}/`);

export class BranchMenu {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = 0;
    // The agents there, for New tab and Beside (read now: the menu closes as one is pressed).
    this.known = [];
    const m = props().machine ?? null;
    cx.spawn(async () => { this.known = await knownAgents(m ? { on: m } : {}).catch(() => []); });
  }

  close() { closeOverlay(props().overlay); }

  // A checkout: the space open in it, else a new space there.
  goTo(tree, machine) {
    const ps = panes();
    const s = spaces().find((x) => (x.machine ?? null) === (machine ?? null)
      && (inside(x.folder, tree.path) || x.tabs.some((c) => ps.some((p) => p.tab === c.id && p.cwd && inside(p.cwd, tree.path)))));
    if (s) run("space.select", { id: s.id });
    else run("space.new", { folder: tree.path, name: tree.branch, ...(machine ? { machine } : {}) });
  }

  // Two checkouts at once: another one in its own tab of this space, or in a pane beside the focused one (this
  // computer's only: a pane opens here), running a fresh copy of the agent the focused pane runs, else a shell.
  openTree(tree, machine, place) {
    const k = terminals().find((x) => x.address === panes().find((p) => p.focused)?.terminal);
    const a = agentEntry(k, this.known);
    const argv = a && a.installed !== false ? { argv: a.run } : {};
    if (place === "tab") run("tab.new", { space: spaces().find((x) => x.active)?.id, folder: tree.path, name: tree.branch, ...argv });
    else run("terminal.open", { folder: tree.path, place: "right", ...argv });
  }

  render() {
    const t = theme();
    const p = props();
    const s = p.state;
    const dark = isDark();
    const actions = [
      { id: "terminal", label: "Open a terminal here", icon: "mods/workspace-chrome-shepherdr/terminal.svg", fn: () => run("terminal.open", { folder: s.top, place: "tab" }) },
      ...(p.editor ? [{ id: "editor", label: "Open in editor", icon: "mods/spaces-chat/code.svg", hint: editorName(p.editor),
        fn: () => exec(p.editor, [s.top], { on: p.machine ?? null }).catch(() => {}) }] : []),
      ...(p.update ? [{ id: "update", label: updateLabel(s.base), icon: "mods/spaces-chat/arrow-down.svg", hint: s.behind ? `${s.behind} behind` : null,
        fn: () => run("terminal.open", { folder: s.top, place: "tab", argv: updateArgv(s.base) }) }] : []),
      { id: "copy", label: "Copy path", icon: "mods/spaces-chat/copy.svg", fn: (cx) => cx.write_to_clipboard(s.top) },
      ...(p.files ? [{ id: "files", label: "Show in Files", icon: "mods/workspace-chrome-shepherdr/files.svg",
        fn: () => { run("layout.select", { stack: "panel-body", child: "files" }); run("layout.show", { id: "panel" }); } }] : []),
    ];
    const others = otherTrees(s).map((x) => ({ id: `tree-${x.path}`, tree: x }));
    const rows = [...actions, ...others];
    const beside = !p.machine;
    // A checkout: Enter goes to it, Cmd+Enter opens it in a new tab, Shift+Enter beside this one.
    const pick = (i, cx, how = null) => {
      const r = rows[i];
      if (!r) return;
      if (r.tree && how && (how === "tab" || beside)) this.openTree(r.tree, p.machine, how);
      else if (r.tree) this.goTo(r.tree, p.machine);
      else r.fn(cx);
      this.close();
    };
    const open = (i, how, icon, tip) => h_flex().id(`bm-${how}-${i}`).size(24).flex_none().items_center().justify_center().rounded(RADIUS.control)
      .text_color(t.dim).cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); pick(i, cx, how); })
      .child(svg(icon).size(14).flex_none());
    const row = (r, i, child) => h_flex().id(`bm-${i}`).h(M.row).px(10).gap(10).items_center().rounded(RADIUS.row).whitespace_nowrap()
      .cursor_pointer().when(i === this.at, (el) => el.bg(t.selected)).when(i !== this.at, (el) => el.hover((st) => st.bg(t.hover)))
      .on_click((_e, cx) => pick(i, cx)).child(child);
    const kv = (k, v) => [div().w(70).flex_none().text_color(t.dim).child(k), h_flex().flex_1().min_w(0).gap(6).children(Array.isArray(v) ? v : [v])];
    const sec = (label, n = null) => h_flex().h(M.sec).px(16).pt(8).items_center().border_t(1).border_color(t.border)
      .font_family(MONO).text_size(TEXT.id - 0.5).text_color(t.dim).child(div().flex_1().child(label.toUpperCase()))
      .when(n !== null, (el) => el.child(String(n)));
    const sub = [s.linked ? `Worktree of ${s.repo}` : `Checkout of ${s.repo}`, p.task, p.machine ?? "This computer"].filter(Boolean).join(" · ");
    // Note: a popup is as tall as its content, so the menu sets its own size (props.height from tabs-tasks).
    return v_flex().id("branch-menu").track_focus(this.handle).w(M.width).h(p.height ?? 420).min_h(0).bg(dark ? t.chrome : t.popover).text_size(TEXT.body)
      .on_key_down((e, cx) => {
        if (e.key === "escape") this.close();
        else if (e.key === "down") this.at = (this.at + 1) % rows.length;
        else if (e.key === "up") this.at = (this.at + rows.length - 1) % rows.length;
        else if (e.key === "enter") pick(this.at, cx, e.modifiers.platform || e.modifiers.control ? "tab" : e.modifiers.shift ? "right" : null);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().relative().flex_none().h(M.head).px(14).gap(10).items_center().overflow_hidden().border_b(1).border_color(t.border)
        .when(dark, (el) => el.bg(bannerBg("working")).child(bannerDots("working")))
        .child(svg(BRANCH).size(16).flex_none().text_color(working()))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(div().truncate().text_color(t.foreground).when(dark, (el) => el.font_family(SERIF).text_size(HEAD.small))
            .when(!dark, (el) => el.font_semibold()).child(p.branch ?? s.base))
          .child(div().truncate().font_family(MONO).text_size(TEXT.id).text_color(t.muted).child(sub))))
      .child(div().flex_none().h(M.kv + (p.pr ? M.kvLine : 0)).px(16).py(12).flex().flex_col().gap(8).font_family(MONO).text_size(TEXT.id + 0.5).text_color(t.foreground)
        .child(h_flex().children(kv("Base", baseLine(s))))
        .child(h_flex().children(kv("Path", div().truncate().child(midCut(tilde(s.top), 44)))))
        .child(h_flex().children(kv("Changes", [
          ...(s.add || s.del ? [div().text_color(green()).child(`+${s.add}`), div().text_color(red()).child(`-${s.del}`)] : []),
          div().truncate().text_color(t.dim).child(changesLine(s))])))
        .when(Boolean(p.pr), (el) => el.child(h_flex().id("bm-pr").rounded(RADIUS.control).cursor_pointer().hover((st) => st.bg(t.hover))
          .on_click((_e, cx) => { cx.open_url(p.pr.url); this.close(); }).children(kv("PR", div().truncate().child(prLine(p.pr)))))))
      .child(sec("Actions"))
      .child(v_flex().px(6).pb(M.pad).children(actions.map((a, i) => row(a, i, h_flex().flex_1().gap(10).items_center()
        .child(svg(a.icon).size(16).flex_none().text_color(t.dim)).child(div().flex_none().child(a.label))
        .when(Boolean(a.hint), (el) => el.child(div().flex_1().min_w(0).truncate().font_family(MONO).text_size(TEXT.id + 0.5).text_color(t.dim).child(a.hint)))))))
      .when(others.length > 0, (el) => el.child(sec("Other worktrees", others.length))
        .child(v_flex().px(6).pb(M.pad).children(others.map((o, k) => row(o, actions.length + k, h_flex().flex_1().min_w(0).gap(10).items_center()
          .child(svg(BRANCH).size(16).flex_none().text_color(t.dim))
          .child(div().flex_none().font_family(MONO).text_size(TEXT.label).child(o.tree.branch))
          .child(div().flex_1().min_w(0).truncate().font_family(MONO).text_size(TEXT.id + 0.5).text_color(t.dim)
            .child(o.tree.main ? "main checkout" : midCut(tilde(o.tree.path), 28)))
          .when(o.tree.ahead > 0, (el) => el.child(div().flex_none().font_family(MONO).text_size(TEXT.id).text_color(t.dim).child(`↑${o.tree.ahead}`)))
          .child(open(actions.length + k, "tab", "mods/workspace-chrome-shepherdr/plus.svg", "Open in a new tab (⌘↵)"))
          .when(beside, (el) => el.child(open(actions.length + k, "right", "mods/jump/columns.svg", "Open beside this one (⇧↵)")))))))
      // A task's worktree: herdr-task removes it once its branch merges (App 02b's footer).
      .when(Boolean(p.task), (el) => el.child(h_flex().h(M.foot).flex_none().px(16).items_center().border_t(1).border_color(t.border)
        .text_size(TEXT.label).text_color(t.dim).child("Removed after its PR merges"))));
  }
}
