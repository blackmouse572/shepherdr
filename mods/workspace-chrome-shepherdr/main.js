import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, keys } from "herdr";
import { openSettings, TEXT, RADIUS } from "./ui.js";
import { keyCaps } from "./core/keys.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
const mac = () => window()?.platform === "macos";

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : mac() ? 76 : 44 });
}

// The key bound to an action as caps (the shown layout's first, then a global one); on macOS a cmd key first.
function capsOf(action) {
  const shown = `layout:${shared("layout") ?? ""}`;
  const all = keys().filter((b) => b.action === action && (b.section === shown || b.section === "global"));
  const pick = all.sort((a, b) => (a.section === shown ? 0 : 1) - (b.section === shown ? 0 : 1)
    || (mac() ? (b.keys.startsWith("cmd") ? 1 : 0) - (a.keys.startsWith("cmd") ? 1 : 0) : 0))[0];
  return pick ? keyCaps(pick.keys, mac()) : null;
}

// Small caps for the sidebar (Doop App 02 .kbd, 19 tall); ui.js keycaps() is the command bar's 22.
function kbd(caps, t) {
  return h_flex().flex_none().gap(3).items_center().children((caps ?? []).map((c) =>
    div().h(19).min_w(19).px(5).flex_none().flex().items_center().justify_center().rounded(5)
      .border_1().border_color(t.border).bg(t.background).font_family("JetBrains Mono").text_size(10.5).font_medium()
      .text_color(t.muted).whitespace_nowrap().child(c)));
}

export default class WorkspaceChrome extends View {
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer().text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }

  // The design's Jump field (Doop App 02 .jump): a sunken box with its words and ⌘K; a click opens Jump.
  jumpField(t) {
    const caps = capsOf("mod.open:jump");
    return h_flex().id("jump-field").flex_1().min_w(0).h(26).pl(10).pr(4).gap(8).items_center().rounded(RADIUS.card)
      .bg(t.background).border_1().border_color(t.border).text_size(TEXT.label).text_color(t.dim).cursor_pointer()
      .hover(s => s.border_color(t.input ?? t.border).text_color(t.muted))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("mod.open", { name: "jump" }))
      .child(svg("mods/workspace-chrome-shepherdr/search.svg").size(14).flex_none())
      // Note: short words, the brand row leaves ~120 after the traffic lights (design's 380 titlebar field has no room here)
      .child(div().flex_1().min_w(0).truncate().child("Jump"))
      .when(Boolean(caps), el => el.child(kbd(caps, t)));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      // New space, as the design's footer (Doop App 01): the accent +, the words bright, a chevron, since it opens
      // the sidebar's menu (spaces-chat: New space, New worktree, New section, Add machine) at the pointer.
      const add = h_flex().id("new-space").h(28).px(8).gap(9).items_center().rounded(8).text_color(t.foreground).when(collapsed, el => el.justify_center().tooltip("New space"))
        .hover(s => s.bg(t.hover)).cursor_pointer().on_click(() => run("spaces-chat.new-menu"))
        .child(svg("mods/workspace-chrome-shepherdr/plus.svg").size(14).text_color(t.accent))
        .when(!collapsed, el => el.child(div().flex_1().min_w(0).truncate().child("New space"))
          .child(svg("mods/workspace-chrome-shepherdr/chevron-down.svg").size(12).text_color(t.muted)));
      // Settings (App 02's one row): Shepherdr's, with its key. An app update waiting: its dot, and Herdr's Updates.
      // Note: Herdr's own settings moved off this foot; Jump's "Herdr settings" and the palette reach them.
      const update = Boolean(updates().app.ready);
      const caps = capsOf("tabs-tasks.settings");
      const settings = h_flex().id("settings").h(28).px(8).gap(9).items_center().rounded(8).when(collapsed, el => el.justify_center().tooltip("Settings"))
        .text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(() => (update ? run("app.settings", { section: "updates" }) : openSettings()))
        .child(svg("mods/workspace-chrome-shepherdr/settings.svg").size(14))
        .when(!collapsed, el => el.child(div().flex_1().min_w(0).truncate().child("Settings"))
          .when(update, el => el.child(div().size(6).rounded_full().bg(t.accent)))
          .when(!update && Boolean(caps), el => el.child(kbd(caps, t))))
        .when(collapsed && update, el => el.child(div().size(6).rounded_full().bg(t.accent)));
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
        .child(add)
        .child(settings);
    }
    // The brand row: the traffic lights' room on macOS, the Jump field, the sidebar's toggle.
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(8).items_center().text_size(13.5)
      .when(mac() && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(this.jumpField(t)))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && mac()), el => el.child(this.button("sidebar-toggle", svg("mods/workspace-chrome-shepherdr/sidebar.svg").size(15), toggleSidebar)));
  }
}
