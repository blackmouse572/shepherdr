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
| `H.sm` / `H.lg` | buttons 24 in panels, rows and headers; 32 in dialogs and cards |
| `H.xs` | 20: a button inside a row's 16 tall second line (a Ready row's Accept), so the row keeps its height |
| `TEXT.id` 11 | IDs, times, badges |
| `TEXT.label` 12 | second lines, labels, small headings, button words (24) |
| `TEXT.body` 13 | body, row titles, menu rows, button words (32) |
| `TEXT.title` 15 | page and dialog titles |
| `RADIUS.control` 6 | buttons, fields, segmented, menu rows |
| `RADIUS.card` 8 | cards, popovers, every hover background |
| `RADIUS.bubble` 12 | chat bubbles |

No other sizes. Use the names, not the numbers, so a change here reaches everyone.

## Colors

The design system's night-pasture status colours, light and dark, the same as the task dots (`dot.js` uses them):
`need()` needs you (lantern amber, the accent), `working()` working (dusk blue), `green()` ready and done (moss),
`red()` errors, danger and failed checks only (ember). `amber()` is `need()`'s colour, for a warning. `onStatus()` is
text on one of them (white in light, black in dark). Everything else comes from `theme()`; never write hex in a mod.

The dark look itself is a Herdr theme, `themes/shepherdr-night.json` (installed into the app's `themes/`), which the
layout picks for dark mode (`paper` stays for light). A theme the person picks in Herdr overrides it.

Dark buttons are raised: `primary` and `secondary` get an outline, a lit top hairline, a shaded bottom one and a
small drop shadow, and dim while pressed. Headers' titles use `SERIF` (Geist Serif, in `mods/pane-chat/fonts/`).

## Parts

- `button(id, label, { kind, size, icon, disabled, onClick })`: `primary` (solid, one per panel
  or dialog), `secondary` (bordered), `plain` (words only). `size` `"xs"` 20 (a row's second
  line only) / `"sm"` 24 / `"lg"` 32. Always
  as wide as its words; never truncated. Disabled: half opacity, no pointer, no hover.
- `link(id, label, onClick)`: a quiet text link (card headers, "Show all").
- `toggleSwitch(id, on, onToggle(next), { disabled })`: the on/off switch, accent when on.
- `segmented(id, [[value, label]...], value, onPick, { size, disabled, fill })`: segments sized to
  their words, never cut; `fill` stretches them over the row.
- `menuRow(id, label, { icon, hint, check, danger, disabled, onClick })`: a popup menu's 32 row:
  16 icon slot, label, dim hint, a check at the right when `check` is true (`false` keeps the slot
  so a choice list lines up).
- `heading(text, right?)`: small dim heading, 12 medium, sentence case. Never uppercase.
- `cardHeader(title, [actions])`: title left (13 medium), links or small buttons right.
- `dialogTitle(id, title, { pad, state, sub, right })`: a dialog's title as the design's header, a duotone banner
  across the dialog's top (negative margins past the root's `pad`) with the title in the serif, an optional dim line
  and a right-hand control (`radius` for a dialog that draws its own rounded frame). Dark only; light keeps the
  plain title. Content sits `TITLE_SHIFT` (8) lower: a fixed-height dialog takes it off the space under the title.
  On: confirm, prompt, Close the Assistant, Keyboard shortcuts, Accept, New space, Rename / New section, Add machine.
- `dialogFooter({ onCancel, primary: { id, label, onClick, disabled }, note, error })`: 32 tall,
  optional dim note left (red when `error`), plain Cancel, then the solid primary. No "Esc" hint.
- `clickable(el, onClick, { radius })`: pointer + rounded 8 hover + click for a whole row (`el`
  needs an id).
- `countBadge(need, ready, line)`: the red / green / split count badge (Tasks, tabs, spaces).
- `banner(id, state, height)`: the duotone header (`attention`, `working`, `done`, `neutral`): a dark wash with halftone
  dots fading toward the left, a picture pinned to the right edge (`mods/tasks/banners/`, drawn by `scripts/banners.py`).
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

Already on these parts: the count badges (`tabs-tasks`, `spaces-chat`), the task dots
(`dot.js`), the New space dialog's footer (`newspace`). Everything else moves area by area.
