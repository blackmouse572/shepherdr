// New space, on this computer or another machine: a dialog opened by coordinator.js newSpace (the
// + menu, the Spaces sidebar's +, a machine's + and New space there, Ctrl+Shift+N, through the tab
// bar), which finds that machine's recent folders and home first (props { recent, machine, home }).
// It draws its own panel (frame "none"), centered and as tall as what it shows; the sizes are
// coordinator.js NEWSPACE.
// On another machine, folders are looked up there, and Browse… lists the field's folder's
// subfolders under the field (there is no system picker for it): a click goes into one.
// The field is the one truth: it holds the folder the space is made in. Picking a row (click,
// arrows) or Choose folder… puts that folder in it; typing edits it and filters the rows. The row
// that matches it exactly is the selected one. A typed path no row has gets a "Use …" row first,
// or a "New folder" row for one that doesn't exist yet (made on Create). It starts at where the
// person works now (defaultFolder), never a builder's scratch folder.
// Left of the field, the space's icon: "#" until an emoji is picked in the Rename dialog's own
// picker (mods/spaces-chat icon.js, opened as that mod's popup; its pick comes back through
// shared "spaces-chat.iconpick"), saved for the new space as Rename saves it (coordinator.js
// createSpace).
// As Doop App 06: the Machine (with another one connected; a pick opens New space there), the icon and
// folder, the Name (empty: from the folder), "Start a coordinator" (the Assistant chat, on Shepherdr
// settings' coordinator, else the CLI's default; this computer only) and "Open a terminal tab too"
// (keeps Herdr's first shell tab beside it). The model is changed in the chat's own model button. Task
// IDs aren't asked: herdr-task picks the folder's prefix and the coordinator may change it. Beside the Name, the
// Section (when the machine has any): the sidebar's sections (mods/spaces-chat, read from shared "spaces-chat"),
// None by default; createSpace files the new space there.
// A folder that isn't in a git repo (one made on Create too, never home) offers "Make it a git
// repo", on by default (Shepherdr makes every such folder one): Create runs git init on main with
// an empty first commit, so tasks get worktrees; files already there stay uncommitted. The line
// under the field always keeps its room, so nothing moves as the field changes.
// Create space has the tab bar make the space in the field's folder and its Assistant tab
// (coordinator.js createSpace), and lands in it; the assistant starts on the first message.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Popup } from "gpui-base";
import { props, theme, home, exec, pickFolder, closeOverlay, openOverlay, shared, setShared, spaces, focused } from "herdr";
import { dialogFooter, dialogTitle, DIALOG_ICON, TITLE_SHIFT, button, toggleSwitch, segmented, fieldFrame, MONO, TEXT, RADIUS, submitKeys, isSubmitKey } from "./ui.js";
import { NEWSPACE as K, readShepherdr, shepherdrFor, LOCAL_MACHINE, autoCoordinator, newSpace, newSpaceMachines } from "./coordinator.js";
import * as N from "./core/newspace.js";

// The suggestions' width (the field's: the dialog's 460 less its padding, the icon, Browse… and the gaps).
const LIST_W = 290;
// The Section's list: its column's width (the dialog's 460 less its padding and the gap, halved).
const SECTION_W = 206;
// The icon picker's answer (mods/spaces-chat rename.js PICK): { for (this overlay), emoji, at }.
const PICK = "spaces-chat.iconpick";
// The home folder paths are shown from: the dialog's machine's (props.home).
let HOME = home();
// Builders' scratch folders, paths from HOME, a new repo (main, one empty commit), a folder's
// subfolders and the words: core/newspace.js, shared with the web app's New space.
const tilde = (p) => N.tilde(p, HOME);
const base = (p) => N.base(p, HOME);
const pathOf = (text) => N.pathOf(text, HOME);
const { scratch, parent, NEW_REPO, SUBFOLDERS, WORDS: W } = N;

export default class NewSpace extends View {
  init(_props, cx) {
    this.machine = props()?.machine ?? null; // null: this computer
    HOME = props()?.home ?? home();
    this.recent = (props()?.recent ?? []).filter((p) => !scratch(p));
    this.browse = null; // another machine's Browse…: { dir, rows } (rows null while listing)
    this.extra = []; // folders from Choose folder…, listed first
    this.exists = new Map(this.recent.map((p) => [p, true]));
    this.repo = new Map(); // folder -> in a git repo (null: couldn't ask)
    this.makeRepo = true; // "Make it a git repo", where it's offered
    this.listOpen = false; // the suggestions under the field
    this.hi = -1; // the suggestion Up/Down is on
    this.busy = false;
    this.error = "";
    this.icon = null; // an emoji, null: "#"
    this.section = props()?.section ?? null; // the sidebar section picked (its id), null: none; a section's + fills it
    this.sectionOpen = false; // the Section's list
    // "Start a coordinator": the Assistant chat, on as Shepherdr settings' "Open the Assistant" says; this computer only.
    this.assistant = autoCoordinator() && !this.machine;
    this.shell = false; // "Open a terminal tab too": keep Herdr's first shell tab beside the Assistant
    // The space's name: empty, createSpace names it from the folder (its repo's top, "Home" at home).
    this.name = InputState.new({ placeholder: W.namePlaceholder });
    this.name.on("submit", (e, cx) => this.create(cx));
    this.name.on("focus", (_e, cx) => { this.nameFocused = true; cx.notify(); });
    this.name.on("blur", (_e, cx) => { this.nameFocused = false; cx.notify(); });
    this.picked = shared(PICK)?.at ?? 0;
    this.input = InputState.new({ placeholder: W.placeholder, value: tilde(this.defaultFolder()) });
    this.text = this.input.value();
    // Typing opens the suggestions (a combobox): they close once one is picked, or on Esc.
    this.input.on("change", (_e, cx) => {
      const v = this.input.value();
      if (v === this.text) return;
      this.text = v; this.listOpen = true; this.browse = null; this.hi = -1; this.error = ""; this.check(cx); cx.notify();
    });
    // Enter picks a suggestion or creates; Cmd+Enter (the primary's keycaps) always creates.
    this.input.on("submit", (e, cx) => (e?.secondary ? this.create(cx) : this.enter(cx)));
    this.input.on("focus", (_e, cx) => { this.focused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.focused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.check(cx);
  }

  // Where the person works now: the focused pane's folder, else the shown space's; as its repo's
  // top when that's a recent folder. A scratch folder, or a space on another machine than the
  // dialog's: that machine's home.
  defaultFolder() {
    const here = spaces().find((s) => s.active);
    if ((here?.machine ?? null) !== this.machine) return HOME;
    const at = [focused()?.cwd, here?.folder].find((p) => p && !scratch(p));
    if (!at) return HOME;
    return this.recent.find((r) => at === r || at.startsWith(r + "/")) ?? at;
  }

  // Whether the field's folder exists, and whether it's in a git repo, asked once per path.
  check(cx) {
    const p = pathOf(this.text);
    if (!p || this.repo.has(p)) return;
    this.repo.set(p, undefined);
    cx.spawn(async (cx) => {
      if (!this.exists.has(p) || this.exists.get(p) === undefined) {
        this.exists.set(p, undefined);
        this.exists.set(p, (await exec("test", ["-d", p], this.on()).catch(() => ({ code: 1 }))).code === 0);
        cx.notify();
      }
      if (!this.exists.get(p)) { this.repo.set(p, false); return cx.notify(); }
      const r = await exec("git", ["rev-parse", "--is-inside-work-tree"], { ...this.on(), cwd: p }).catch(() => null);
      // No git to ask there: nothing offered.
      this.repo.set(p, r ? r.code === 0 && r.stdout.trim() === "true" : null);
      cx.notify();
    });
  }

  // Whether "Make it a git repo" shows for the field's folder: known not to be in one, not home.
  offersRepo() {
    const p = this.folder();
    return N.offersRepo(p, this.repo.get(p), HOME);
  }

  // Where exec runs: the dialog's machine.
  on() {
    return this.machine ? { on: this.machine } : {};
  }

  // Puts a folder in the field and closes the suggestions.
  set(path, cx) {
    this.text = tilde(path);
    this.input.set_value(this.text);
    this.listOpen = false;
    this.browse = null;
    this.hi = -1;
    this.error = "";
    this.check(cx);
    cx.notify();
  }

  // The suggestions: recent folders matching what's typed (all of them for an empty field), at
  // most core's SHOWN (coordinator.js NEWSPACE_SHOWN, the height's), the field's own folder left out.
  rows() {
    if (this.browse) return this.browse.rows ?? [];
    const all = [...this.extra, ...this.recent.filter((p) => !this.extra.includes(p))];
    return N.suggestions(all, this.text, HOME).map((path) => ({ path }));
  }

  // The folder Create space makes the space in: the field's, once it's known whether it exists
  // (a missing one is made on Create).
  folder() {
    const p = pathOf(this.text);
    return p && typeof this.exists.get(p) === "boolean" ? p : null;
  }

  close() {
    closeOverlay(props().overlay);
  }

  // Browse…: the system's folder picker here; on another machine, the field's folder's subfolders.
  choose(cx) {
    if (this.machine) {
      const p = pathOf(this.text);
      return this.list(p && this.exists.get(p) ? p : HOME, cx);
    }
    cx.spawn(async (cx) => {
      const f = await pickFolder({ prompt: "Choose" });
      if (f) { this.exists.set(f, true); if (!this.recent.includes(f)) this.extra = [f, ...this.extra.filter((x) => x !== f)]; this.set(f, cx); }
      this.input.focus();
      cx.notify();
    });
  }

  // Another machine's Browse…: `dir` in the field, its subfolders under it (and the folder above
  // first), the list kept open so a click goes on into one.
  list(dir, cx) {
    this.exists.set(dir, true);
    this.text = tilde(dir);
    this.input.set_value(this.text);
    this.browse = { dir, rows: null };
    this.listOpen = true;
    this.hi = -1;
    this.error = "";
    this.input.focus();
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", SUBFOLDERS, "x", dir], this.on()).catch(() => null);
      if (this.browse?.dir !== dir) return;
      if (!r || r.code !== 0) { this.browse = null; this.listOpen = false; this.error = W.cantList(tilde(dir), this.machine); return cx.notify(); }
      const kids = r.stdout.split("\n").filter(Boolean).map((n) => `${dir.replace(/\/+$/, "")}/${n}`);
      for (const k of kids) this.exists.set(k, true);
      this.browse.rows = [...(dir === "/" ? [] : [{ path: parent(dir), up: true }]), ...kids.map((path) => ({ path }))];
      cx.notify();
    });
  }

  // A suggestion picked: into the field; while browsing, the list goes on into it.
  pick(path, cx) {
    if (this.browse) return this.list(path, cx);
    this.set(path, cx);
  }

  // The icon picker, under the icon button (at: where it is, from the press on it).
  pickIcon(at) {
    this.listOpen = false; this.browse = null; this.hi = -1;
    openOverlay({ mod: "spaces-chat", kind: "popup", width: 360, height: 420, at: at ? { x: at.x, y: at.y + at.height + 4 } : "pointer",
      props: { view: "icon", for: props()?.overlay, current: this.icon, section: false, width: 360, height: 420 } });
  }

  // Enter picks the highlighted suggestion, else makes the space.
  enter(cx) {
    const rows = this.listOpen ? this.rows() : [];
    if (this.hi >= 0 && rows[this.hi]) return this.pick(rows[this.hi].path, cx);
    this.create(cx);
  }

  create(cx) {
    const folder = this.folder();
    if (this.busy || !folder) return;
    this.busy = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (this.exists.get(folder) === false) {
          const r = await exec("mkdir", ["-p", "--", folder], this.on());
          if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || W.cantMake(tilde(folder)));
          this.exists.set(folder, true);
        }
        if (this.offersRepo() && this.makeRepo) {
          for (const args of NEW_REPO) {
            const r = await exec("git", args, { ...this.on(), cwd: folder });
            if (r.code !== 0) throw new Error(W.cantRepo(r.stderr.trim().split("\n").pop()));
          }
          this.repo.set(folder, true);
        }
        // Shepherdr settings' coordinator (this computer's, else Everywhere's) when set; {}: the
        // template's own agent.
        const choice = { ...(shepherdrFor(await readShepherdr(), `m:${LOCAL_MACHINE}`).coordinator ?? {}) };
        // The tab bar makes it (coordinator.js watchNewSpaces): this dialog goes as the view moves.
        // "Start a coordinator" off (it starts as Shepherdr settings' "Open the Assistant"), or a space
        // on another machine (the Assistant runs on this computer only): settings null, so the
        // space keeps Herdr's own first tab and gets no Assistant.
        const assistant = this.assistant && !this.machine;
        setShared("newspace.createreq", { folder, machine: this.machine, settings: assistant ? choice : null, icon: this.icon,
          name: this.name.value().trim(), shell: this.shell, section: this.pickedSection()?.id ?? null, at: Date.now() });
        this.close();
        return;
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      this.busy = false;
      cx.notify();
    });
  }

  // The sidebar's sections on the dialog's machine (mods/spaces-chat sections.js keeps them).
  sections() {
    return (shared("spaces-chat")?.sections ?? []).filter((s) => (s.machine ?? null) === this.machine);
  }

  pickedSection() {
    return this.sections().find((s) => s.id === this.section) ?? null;
  }

  // The Section: a select (the design's .in.sel) whose list hangs under it, None first.
  sectionPicker(t) {
    const picked = this.pickedSection();
    const look = (s) => (s?.icon ? div().w(14).flex_none().text_size(13).child(s.icon)
      : svg("mods/workspace-chrome-shepherdr/folder.svg").size(14).flex_none().text_color(t.muted));
    const trigger = h_flex().id("section").w_full().h(K.field).px(10).gap(8).items_center().rounded(RADIUS.field)
      .border_1().border_color(t.border).bg(t.raised).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.sectionOpen = !this.sectionOpen; this.listOpen = false; this.browse = null; this.hi = -1; cx.notify(); })
      .child(look(picked))
      .child(div().flex_1().min_w(0).truncate().text_color(picked ? t.foreground : t.muted).child(picked?.name ?? W.noSection))
      .child(svg("mods/workspace-chrome-shepherdr/chevron-down.svg").size(14).flex_none().text_color(t.muted));
    const row = (s) => h_flex().id(`section-${s?.id ?? "none"}`).h(K.row).flex_none().px(9).gap(10).rounded(6).items_center().cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.section = s?.id ?? null; this.sectionOpen = false; cx.notify(); })
      .child(look(s))
      .child(div().flex_1().min_w(0).truncate().text_color(s ? t.foreground : t.muted).child(s?.name ?? W.noSection))
      .when((s?.id ?? null) === (picked?.id ?? null), (el) => el.child(svg("mods/workspace-chrome-shepherdr/check.svg").size(14).flex_none().text_color(t.foreground)));
    return Popup.new("section-list", trigger).w_full().anchor("top_left")
      .when(this.sectionOpen, (el) => el.content(v_flex().id("section-rows").w(SECTION_W).max_h(K.row * 8 + 8).overflow_y_scrollbar().mt(4).p(4)
        .rounded(8).border(1).border_color(t.border).bg(t.popover).shadow_lg().text_size(13)
        .children([null, ...this.sections()].map(row))));
  }

  // Esc closes the suggestions (or the Section's list) first, then the dialog. Up and Down open them and walk them.
  key(e, cx) {
    if (isSubmitKey(e)) { cx.stop_propagation(); return this.create(cx); }
    if (e.key === "escape" && this.sectionOpen) { this.sectionOpen = false; cx.stop_propagation(); cx.notify(); return; }
    if (e.key === "escape") {
      if (!this.listOpen) return this.close();
      this.listOpen = false; this.browse = null; this.hi = -1; cx.stop_propagation(); cx.notify(); return;
    }
    if (e.key !== "down" && e.key !== "up") return;
    const n = this.rows().length;
    if (!this.listOpen) { this.listOpen = true; this.hi = -1; }
    if (n) this.hi = e.key === "down" ? (this.hi + 1) % n : (this.hi <= 0 ? n - 1 : this.hi - 1);
    cx.stop_propagation();
    cx.notify();
  }

  // A suggestion, as Herdr's menus draw rows: the folder's name, its path dim. `up`: the folder
  // above, while browsing ("..").
  row(t, id, on, path, onClick, up = false) {
    return h_flex().id(id).h(K.row).flex_none().px(9).gap(10).rounded(6).items_center().cursor_pointer()
      .when(on, (el) => el.bg(t.hover))
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(svg(up ? "mods/newspace/corner-left-up.svg" : "mods/workspace-chrome/folder.svg").size(14).flex_none().text_color(t.muted))
      .child(div().flex_none().max_w(200).truncate().text_color(t.foreground).child(up ? ".." : base(path)))
      .child(div().flex_1().min_w(0).truncate().font_family(MONO).text_size(11.5).text_color(t.dim).child(tilde(path)));
  }

  // Another machine picked: New space again, there (its recent folders and home are looked up first).
  pickMachine(m) {
    if ((m || null) === this.machine || this.busy) return;
    this.busy = true;
    newSpace({ machine: m || null }).finally(() => this.close());
  }

  // A switch row (Doop App 06's .tr): an icon, the words and a dim line under them, the switch at the right; the
  // whole row toggles unless it's `off` (then dim, the switch showing what happens anyway).
  toggleRow(t, id, icon, title, about, on, set, off = false) {
    return h_flex().id(id).h(K.toggle).flex_none().gap(12).items_center()
      .when(!off, (el) => el.cursor_pointer().on_click((_e, cx) => { set(!on); cx.notify(); }))
      .child(svg(icon).size(16).flex_none().text_color(t.muted))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_color(off ? t.dim : t.foreground).child(title))
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(about)))
      .child(toggleSwitch(`${id}-switch`, on, (v) => set(v), { disabled: off }));
  }

  // Under the field: "Make it a git repo" (a switch) for a folder outside git, a quiet word
  // for one in a repo, else empty; always the same height.
  repoLine(t, folder) {
    const line = h_flex().h(20).flex_none().gap(8).items_center().text_size(12.5);
    if (this.offersRepo()) {
      const on = this.makeRepo;
      // The design's switch row (App 06): the words, then the switch at the right; the whole row toggles.
      return line.id("make-repo").cursor_pointer().on_click((_e, cx) => { this.makeRepo = !this.makeRepo; cx.notify(); })
        .child(div().flex_none().text_color(t.foreground).child(W.makeRepo))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(W.makeRepoWhy))
        .child(toggleSwitch("make-repo-switch", on, (v) => { this.makeRepo = v; }));
    }
    if (folder && this.repo.get(folder) === true)
      return line.text_color(t.dim).child(svg("mods/workspace-chrome/git-branch.svg").size(13).flex_none())
        .child(div().min_w(0).truncate().child(W.isRepo));
    return line;
  }

  render(cx) {
    const t = theme();
    const rq = shared(PICK);
    if (rq?.for === props()?.overlay && rq.at > this.picked) {
      this.picked = rq.at;
      this.icon = rq.emoji ?? null;
      cx.timer.after(0, () => this.input.focus());
    }
    const rows = this.listOpen ? this.rows() : [];
    // Browsing another machine: its folder is listing, or has no subfolders.
    const empty = this.listOpen && this.browse && !rows.some((r) => !r.up) ? (this.browse.rows ? W.empty : W.loading) : "";
    const field = pathOf(this.text);
    const folder = this.folder();
    // Under the field, one quiet line: a folder that isn't there yet is made on Create. Its room is
    // kept, so the dialog keeps its height either way; an error goes beside the buttons, in red.
    const note = field && this.exists.get(field) === false ? W.missing : "";
    const machineList = newSpaceMachines(this.machine);
    const withAssistant = this.assistant && !this.machine;
    // The folder as typed, in the monospace (a path), in the design's sunken field.
    const input = fieldFrame(Input.new(this.input).w_full().h(K.field).px(10).items_center(), { focused: this.focused })
      .font_family(MONO).text_size(12.5).text_color(t.foreground);
    // The suggestions hang under the field in the window's top layer, only while they're open.
    const list = Popup.new("folder-list", input).flex_1().min_w(0).anchor("top_left")
      .when(rows.length > 0 || Boolean(empty), (el) => el.content(v_flex().id("folder-rows").w(LIST_W).max_h(K.row * 8 + 8).overflow_y_scrollbar().mt(4).p(4).rounded(8).border(1).border_color(t.border).bg(t.popover).shadow_lg().text_size(13)
        .children(rows.map((r, i) => this.row(t, `folder-${i}`, i === this.hi, r.path, (cx) => this.pick(r.path, cx), r.up)))
        .when(Boolean(empty), (el) => el.child(div().h(K.row).flex_none().px(9).flex().items_center().text_color(t.dim).child(empty)))));
    const panel = v_flex().id("newspace").w_full().flex_none().p(K.pad).rounded(RADIUS.dialog).border(1).border_color(t.border).bg(t.chrome).shadow_lg().text_size(13)
      .on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down("left", (_e, cx) => {
        if (this.listOpen) { this.listOpen = false; this.browse = null; this.hi = -1; cx.notify(); }
        if (this.sectionOpen) { this.sectionOpen = false; cx.notify(); }
      })
      // The design's banner header (ui.js dialogTitle), its machine at the right; the space under it gives up what
      // the banner adds, so newSpaceHeight() holds.
      .child(dialogTitle("newspace-title", W.title, { pad: K.pad, radius: RADIUS.dialog - 1, lead: DIALOG_ICON.folder, sub: W.sub, onClose: () => this.close(),
        right: this.machine ? div().min_w(0).max_w(200).truncate().text_size(TEXT.label).text_color(t.muted).child(W.on(this.machine)) : null }))
      .child(div().h(K.section - TITLE_SHIFT).flex_none())
      // Machine (with another machine connected): picking one opens New space there.
      .when(machineList.length > 1, (el) => el
        .child(div().h(K.label).flex_none().text_size(TEXT.label).text_color(t.dim).child(W.machine))
        .child(div().h(K.gap).flex_none())
        .child(segmented("machine", machineList.map((m) => [m ?? "", m ?? W.thisComputer]), this.machine ?? "", (v) => this.pickMachine(v), { size: "lg", fill: true }))
        .child(div().h(K.section).flex_none()))
      .child(div().h(K.label).flex_none().text_size(TEXT.label).text_color(t.dim).child(W.label))
      .child(div().h(K.gap).flex_none())
      // The icon (as the Rename dialog's), the field and Browse…: the desktop's own folder picker
      // here, the list on another machine.
      .child(h_flex().h(K.field).flex_none().gap(8).items_center()
        .child(fieldFrame(h_flex().id("icon").size(K.field).flex_none().justify_center().items_center())
          .cursor_pointer().hover((s) => s.bg(t.hover))
          .on_mouse_down("left", (e) => { this.iconAt = { x: e.position.x - (e.local_position?.x ?? 0), y: e.position.y - (e.local_position?.y ?? 0), width: e.bounds?.width ?? 0, height: e.bounds?.height ?? 0 }; })
          .on_click((_e, cx) => { this.pickIcon(this.iconAt); cx.notify(); })
          .child(this.icon ? div().text_size(16).child(this.icon) : div().text_size(16).text_color(t.muted).child("#")))
        .child(list)
        .child(button("browse", W.browse, { size: "lg", onClick: (_e, cx) => this.choose(cx) })))
      .child(div().h(20).flex_none().pt(4).text_size(TEXT.label).text_color(t.dim).child(note))
      .child(div().h(4).flex_none())
      .child(this.repoLine(t, folder))
      .child(div().h(K.section).flex_none())
      // The Name and, when the machine has sections, the Section beside it (App 06): one row, the same height.
      .child(h_flex().flex_none().gap(12).items_start()
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().h(K.label).flex_none().text_size(TEXT.label).text_color(t.dim)
            .child(div().flex_1().child(W.name))
            .child(div().font_family(MONO).text_size(TEXT.id).child(W.nameFrom)))
          .child(div().h(K.gap).flex_none())
          .child(fieldFrame(Input.new(this.name).w_full().h(K.field).px(10).items_center(), { focused: this.nameFocused }).text_color(t.foreground)))
        .when(this.sections().length > 0, (el) => el.child(v_flex().flex_1().min_w(0)
          .child(div().h(K.label).flex_none().text_size(TEXT.label).text_color(t.dim).child(W.section))
          .child(div().h(K.gap).flex_none())
          .child(this.sectionPicker(t)))))
      .child(div().h(K.section).flex_none())
      .child(this.toggleRow(t, "start-assistant", "mods/shepherdr-settings/bot.svg", W.assistant, this.machine ? W.assistantOff : W.assistantWhy,
        withAssistant, (v) => { this.assistant = v; }, Boolean(this.machine)))
      .child(div().h(K.gap).flex_none())
      .child(this.toggleRow(t, "open-shell", "mods/workspace-chrome-shepherdr/terminal.svg", W.shell, W.shellWhy(folder ? tilde(folder) : W.theFolder),
        withAssistant ? this.shell : true, (v) => { this.shell = v; }, !withAssistant))
      .child(div().h(K.section).flex_none())
      .child(dialogFooter({ radius: RADIUS.dialog - 1, onCancel: () => this.close(), note: this.error, error: true,
        primary: { id: "create", label: this.busy ? W.creating : W.create, disabled: !folder || this.busy, onClick: (_e, cx) => this.create(cx),
          keys: submitKeys() } }));
    // The overlay is the panel at its tallest; the panel sits in its middle.
    return v_flex().size_full().justify_center().child(panel);
  }
}
