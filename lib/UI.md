# UI building blocks (lib/ui.js)

One source for sizes, status colors and the controls every mod repeats. `lib/ui.js` is copied
into each of our mods by `bin/sync-shared` (listed in `lib/COPIES`), so a mod imports it as
`import { button, TEXT } from "./ui.js";`. Edit `lib/ui.js`, never a copy, then run
`bin/sync-shared`; `bin/sync-shared --check` must pass. A new mod of ours: add it to the
`ui.js:` line in `lib/COPIES` and sync. Shipped Herdr mods (confirm, prompt, toast, menu,
picker, peek, help, ...) are read-only: clone them first.

## Sizes

| What | Value |
|---|---|
| `H.sm` / `H.button` | buttons 24 in panels, rows and headers; 30 in dialogs and cards (radius `RADIUS.button` 8) |
| `H.lg` | 32: fields, menu rows and other rows beside a dialog's buttons |
| `H.xs` | 20: a button inside a row's 16 tall second line (a Ready row's Accept), so the row keeps its height |
| `TEXT.id` 11 | IDs, times, badges |
| `TEXT.label` 12 | second lines, labels, small headings, button words (24) |
| `TEXT.body` 13 | body, row titles, menu rows, button words (32) |
| `TEXT.title` 15 | page and dialog titles (light; dark headers use `HEAD`: 20, 16 small, 22 Settings, in the serif) |
| `RADIUS.control` 6 | small buttons, segmented, menu rows |
| `RADIUS.field` 9 | text fields (`fieldFrame`) |
| `RADIUS.card` 8 | cards, popovers, every hover background |
| `RADIUS.bubble` 12 | chat bubbles |
| `RADIUS.dialog` 16 | dialogs that draw their own frame (New space, Rename), on `theme().chrome` (the design's bg-panel) |
| `RADIUS.window` 18 | the Settings window, on `theme().chrome` |

No other sizes. Use the names, not the numbers, so a change here reaches everyone.

## Colors

The design system's night-pasture status colours, light and dark, the same as the task dots (`dot.js` uses them):
`need()` needs you (lantern amber, the accent), `working()` working (dusk blue), `green()` ready and done (moss),
`red()` errors, danger and failed checks only (ember). `amber()` is `need()`'s colour, for a warning. `onStatus()` is
text on one of them (white in light, black in dark). Everything else comes from `theme()`; never write hex in a mod.

The dark look itself is a Herdr theme, `themes/shepherdr-night.json` (installed into the app's `themes/`), which the
layout picks for dark mode (`paper` stays for light). A theme the person picks in Herdr overrides it.

Dark buttons are raised: `primary`, `wool` and `secondary` get an outline, a lit top hairline, a shaded bottom one and
a small drop shadow, and dim while pressed. The design's lantern and wool fills are gradients (#FFD27A to #EA9C27,
#FBFAF6 to #D9D6CB); mods can't draw a gradient, so they are flat (`solid`, `foreground`). Same for the switch. Headers' titles use `SERIF` (Geist Serif, in `mods/pane-chat/fonts/`).

## Parts

- `button(id, label, { kind, size, icon, disabled, onClick, keys })`: `primary` (solid accent, one per panel
  or dialog), `wool` (solid light, DS 02's `.btn.wool`: a confirm such as Merge), `secondary` (bordered), `plain`
  (words only). `size` `"xs"` 20 (a row's second line only) / `"sm"` 24 / `"lg"` 30, radius 8, 12.5 words. `keys`:
  small keycaps inside, after the words (only for a key the view handles). Always as wide as its words; never
  truncated. Disabled: half opacity, no pointer, no hover.
- `raisedLook(el, radius)`: the secondary button's raised look on something that isn't a button (outline, lit top and
  shaded bottom hairlines, small shadow, its fill; light: bordered on `raised`), for the design's slate gradient. On: the
  shown tab, the panel switcher's picked segment. Call it before adding children.
- `well(el, radius)`: a sunken track (the design's `.seg`): the field's dark well with the quiet border; light, `raised`.
- `link(id, label, onClick)`: a quiet text link (card headers, "Show all").
- `toggleSwitch(id, on, onToggle(next), { disabled })`: the on/off switch, 34 × 20 (Doop `.tg`): on, the accent
  track with a dark ring and a light knob; off, a sunken well with the strong border's ring and a gray knob.
- `segmented(id, [[value, label]...], value, onPick, { size, disabled, fill })`: segments sized to
  their words, never cut; `fill` stretches them over the row.
- `menuRow(id, label, { icon, hint, check, danger, disabled, onClick })`: a popup menu's 32 row:
  16 icon slot, label, dim hint, a check at the right when `check` is true (`false` keeps the slot
  so a choice list lines up).
- `heading(text, right?)`: small dim heading, 12 medium, sentence case. Never uppercase.
- `cardHeader(title, [actions])`: title left (13 medium), links or small buttons right.
- `dialogTitle(id, title, { pad, state, sub, right, lead, onClose, size })`: a dialog's title as the design's header, a duotone
  banner across the dialog's top (negative margins past the root's `pad`; neutral is the wool hatch) with the title in
  the serif at `HEAD.title` 20 (`HEAD.small` 16 for small headers, `HEAD.window` 22 for Settings), an optional line
  under it in `MONO` 11, secondary text, and a right-hand control (`radius` for a dialog that draws its own rounded
  frame). `lead` puts a 16 icon left of the title (`DIALOG_ICON` folder, server, branch, as Doop App 06); `onClose`
  adds the top-right X (`closeX`: 28 square, 16 icon), which closes as Cancel and Esc do. New space, Rename and Add machine have the X; New space and Add machine lead with an icon. Dark only; light keeps the
  plain title. Content sits `TITLE_SHIFT` (8) lower: a fixed-height dialog takes it off the space under the title.
  On: confirm, prompt, Close the Assistant, Keyboard shortcuts, Accept, New space, Rename / New section, Add machine,
  Settings (across the top, over its nav) and the instructions editor over Settings.
- `dialogFooter({ onCancel, primary: { id, label, onClick, disabled, keys }, note, error, pad, radius, esc })`: Doop
  App 06's footer, a full-bleed strip (negative margins past the root's `pad`) on a darker chrome with a top border:
  an Esc keycap left (`esc: false` drops it), an optional note (red when `error`), plain Cancel, then the solid
  primary, with `keys` inside it (`submitKeys()`, ⌘⏎: New space, the name prompt, Add machine's Add; the dialog
  handles it with `isSubmitKey(e)`). It takes 32 of the flow, as the old row did; `radius` rounds its
  bottom in a dialog that draws its own frame.
- `clickable(el, onClick, { radius })`: pointer + rounded 8 hover + click for a whole row (`el`
  needs an id).
- `fieldFrame(el, { focused, error })`: a text field's frame (and boxes beside one, as New space's icon), as Doop
  App 06: radius 9; in dark a sunken well (#0A0B0A, darker than the dialog) with the quiet border, the accent border while focused,
  red for an error; light keeps the plain field. Paths and hosts are typed in `MONO` (JetBrains Mono) at 12.5.
  On: New space, Rename / New section, Add machine, the name prompt.
- `countBadge(need, ready, line)`: the red / green / split count badge (Tasks, tabs, spaces).
- `banner(id, state, height)`: the duotone header (`attention`, `working`, `done`, `neutral`): a dark wash with halftone
  dots fading toward the left (`.bn.half`), or for `neutral` the wool banner's diagonal hatch at .22 (`.bn.wool.hatch`),
  a picture pinned to the right edge (`mods/tasks/banners/`, drawn by `scripts/banners.py`). The dots' fade is baked in
  px from the right; the hatch's is a share of the header's width (a gradient of the wash painted over it), so every
  width fades out toward the left as DS 03. `bannerDots(state, radius)`: `radius` keeps that fade inside a rounded top.
  Put the header's content in an `.absolute().inset_0()` child. Dark only for now.
- `keycaps(caps)`: a shortcut as caps, one key each (`core/keys.js` `keyCaps("ctrl-shift-p", mac)` gives the list), 22
  tall, never cut. The command bar's rows and foot.
- `openSettings({ space?, section? })`: Shepherdr's settings window (mods/shepherdr-settings, the foot's Shepherdr); with
  `space`, that space's own settings. Never open it with your own size.

## Rules

- Pointer and hover only where a click does something; nothing else gets either.
- Hover is a background (`theme().hover`), rounded 8 on rows, 6 on controls. Nothing moves or
  resizes on hover.
- A selected or active row is a flat fill one step lighter than its surface (`theme().selected`): no border, no amber
  edge, no glow, no gradient, no Enter cap on the row. Amber is for buttons and real attention only.
- Search matches: the primary text colour with a thin underline, never amber.
- One solid primary per panel or dialog. A dangerous action is secondary, except as the primary
  of its own confirm dialog, where its label is the verb ("Delete section"), never "Confirm".
- Labels are capitalized and sentence case; short labels have no period, full sentences do.
- No emojis in chrome. Icons are line SVGs.
- Size controls to their words: never truncate a short label.
- Tooltips are short or absent: at most a few words naming the thing or its shortcut ("Autopilot", "Stop · Esc"),
  never sentences that explain how it works. None where the name already shows, nor on a control that's off.

Already on these parts: the count badges (`tabs-tasks`' panel toggle and switcher, `spaces-chat`), the task dots
(`dot.js`), the dialog footer and header (New space, Rename, Add machine, Settings, confirm, prompt), the switch.
Everything else moves area by area. The theme has no key for the design's accent-shade (#EA9C27), so it has none.

## Usage parts (lib/usage-data.js)

The status bar's usage pill and popover and Settings > Accounts share these, not ui.js (only those two mods copy it):

- `logo(provider, size)`: Claude's logo in its colour, OpenAI's in the text colour. Account rows and usage cards show an initial avatar beside them.
- `meterBar(id, pct, { width, height, switchAt })`: a fixed-width meter, green, amber within 40 below the switch point,
  red past it, with a tick at the switch point. Its percent and reset sit in fixed mono columns beside it, never cut.
- `activeBadge()`: the filled amber ACTIVE badge on the account new work starts on (that card also gets an amber edge).

## Tab bar and panel switcher (mods/tabs-tasks)

Doop App 02's `.tabs`: a 40 tall bar (layout block `tabs`). The branch chip (App 02b) first, then the tabs as 28 tall
pills, radius 8: icon (the Assistant's compass, an agent's or program's logo, else a terminal), a task's id in `MONO`,
the name (a task's title unless someone named the tab), `dot.js` `statusDot` (needs you, working or a task's pie, ready,
done; a count past one), ×. The shown tab is `raisedLook`, the others plain. "+" after the tabs; at the right "N settled"
(eye-off) when tabs are settled (`tab.settle`), which shows them dimmed; the side panel's toggle (Tasks' counts on it
while shut); Linux and Windows' window buttons.

The side panel's Tasks / Changes / Files / Artifacts sit over the panel as a full-width segmented (`.rp .seg.fill`):
the same mod with `props.view: "panels"` in the layout's `panel-switch` block (top of the `panel` column, over the
`panel-body` stack), each segment with its icon and a count where known (Tasks: needs you and Ready; Changes: files not
committed). Only the bar's copy does the background work and remembers the panel per space. Over the segmented, the
same block draws the shown panel's banner (Doop App 02: its name, a line, its control): Tasks and Artifacts leave theirs
to it (shared "panel.head"), sending their line as shared "panel.tasks" / "panel.artifacts" and taking Artifacts' All
back as shared "artifacts.all"; Changes says its branch, Files its folder. Over a drilled-in view (a task's thread, an
artifact) the block shrinks to the segmented alone (`layout.resize`).

Motion follows Emil Kowalski's rules (github.com/emilkowalski/skills, `animate`): nothing a key does animates (Cmd+L,
Jump); things done tens of times a day move briefly. The switcher's raised pill slides to the shown segment (`left`,
`width`, 180 ms ease-in-out); the head's banner folds away over a drilled-in view (the block's height stepped each
frame, 200 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, the banner fading with it); a Tasks group folds as an accordion
(height and opacity, 200 ms ease-out, its rows kept until folded). Native `transition()` only, never `width`/`height`
elsewhere. Herdr tells a mod nothing about reduced motion yet.

