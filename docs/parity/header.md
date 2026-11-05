# Tab bar, + menu, tab menu and pane header

Window: `mods/tabs-tasks/main.js` (TB), `mods/new-menu-tasks/main.js` (NM), `mods/menu-tasks/main.js` (MT),
`mods/coordinator/main.js` (CO: Switch agent, Close the Assistant), `mods/pane-chat/main.js` (PC) and
`mods/pane-chat/autopilot.js` (AP), `lib/coordinator.js` (LC: closeTab, renameTab, closeSpace). Web:
`web/plugins/coordinators/client.tsx` (C), `web/plugins/terminal/client.tsx` (T), `web/src/App.tsx` (A),
`service/compat.ts` (each space's `tabs`, `assistantTab`, `pilot`), `service/actions.ts` (`tab-rename`, `tab-close`,
`tab-move`, `tab-end`, `tab-agents`, `tab-new`).

Shared: `core/menus.js` holds the + menu's words and rows (`NEW_MENU`, `assistantRow`, `agentChoices`, `agentHint`), a
tab's menu (`tabMenu`), Switch agent's words (`SWITCH_AGENT`), a tab's name (`tabName`) and the header's End agent
(`endAgent`) and the app menu (`appMenu`); the window's mods (NM, MT, CO, TB, PC) and the web (C, and the service's `tabName`) read them.
`core/autopilot.js` `headerDetail` is the Autopilot switch's words on both sides; `core/confirm.js` the Rename tab and
Close space dialogs'. `core/menus.test.js` checks the lists, `test/test_repo.py` (`test_tab_bar_from_one_list`) that no
side keeps its own copy.

**The web form.** Desktop and tablet: the tab bar sits over the middle column (A:522 Middle), as the window's sits over
its panes: the shown space's tabs, its +, and the side panels' buttons; the side panel's own header then just names it
(A:375). The window has moved those buttons into the side panel (a segmented over it, Doop App 02) and keeps one panel
toggle in the bar. Phone: no room for a bar, so the header's ⋯ holds the space's tabs, Chat or Terminal, the shown tab's menu and
the + menu's items (◇ phone navigation); the phone's bottom bar (Chat, Tasks, Artifacts) is its side panels.

State: ✓ matches, ◇ web-only form (why), ✗ still differs (why).

## Tab bar (desktop, tablet)

| Element | Window (file:line, exact words/control) | Web (file:line) | State |
|---|---|---|---|
| Where | TB:191 a bar over the panes, right of the sidebar | A:522 over the middle column; C:388 TabBar | ✓ |
| Tabs, Assistant's first | TB:127 the coordinator tab pinned first | C:263 barTabs: `assistantTab` then `tabs` (service: the doc's tabs) | ✓ |
| Tab name | TB:146 `tabName(name, program)`: given name, else (Herdr's "tb3") the program, else "Terminal" | service `tabName` (core) | ✓ |
| Program icon | TB the Assistant's compass, else the program table's icon (not a shell's), else a terminal | C:288 ModelIcon for an agent, TermIcon for a shell, none on an Assistant still waiting for its first message | ◇ the web's icon set (2.1's), no brand logos |
| Name truncates at 170 px | TB:158 | C:288 `max-w-[170px] truncate` | ✓ |
| " Z" on a zoomed tab | TB:158 | none | ◇ one pane per tab on the web: Herdr's own pane layout (splits, zoom) isn't drawn, so nothing zooms |
| Status while working | TB dot.js `statusDot`: the working arc, a task's pie | C:89 Spin, C:288 | ✓ |
| Task id on a task's tab | TB the task's ref in mono, its title unless the tab is named (task lists, every 20 s) | none | ◇ 2.1's bar on the web (the window follows Doop App 02): the web's bar shows the tab's name only |
| Red / green counts | TB the needs-you / ready dot, the count beside it past one: items in that tab, Tasks' Ready | C:273 countsOf: the Assistant's tab its space's needs and Ready tasks, another tab its own waiting agent; AttentionBadge | ◇ 2.1's bar on the web (the window follows Doop App 02): the web keeps the badge |
| Dot when no counts | TB:161 blocked / done | C:288 Dot need / done | ✓ |
| Red / Green counts off | TB:137 shared counts.red / counts.green | C:288 `snap.look.red/green` | ✓ |
| × on a tab | TB every tab's, the Assistant's only while shown; closeTab | C:288 × "Close tab" on the shown tab → C:540 closeTab | ◇ 2.1's bar on the web (the window follows Doop App 02): the web's only on the shown tab |
| Shown tab look | TB 28 tall pill, ui.js `raisedLook` (the design's slate) | C:288 2.1's picked segment | ✓ |
| Click shows it | TB:155 tab.select | C:278 showTab: the Assistant's chat (as it was, chat or terminal), another's terminal | ✓ |
| Double-click renames | TB:150 renameTab | C:288 onDoubleClick → TabRename | ✓ |
| F2 renames | keys.json F2 → rename-tab (TB:58) | C:288 F2 on the focused tab | ✓ |
| Right-click: tab menu | TB:156 menu-tasks popup | C:288 onContextMenu → C:505 TabMenu at the pointer | ✓ |
| Touch: tab menu | (right-click only) | C:288 ⋯ on the shown tab, coarse pointers only | ◇ touch has no right-click |
| Drag a tab onto another | TB:150-155 tab.move | C:288 pointer down on one, up on another → `tab-move` | ✓ (mouse; a finger scrolls the bar) |
| Wheel goes to the next tab | TB:196 | C:388 wheel | ✓ |
| Settings › Window › Show tabs off | TB the bar keeps +, the panel toggle | C:388 `look.tabs` | ✓ |
| + | TB a 28 px + right after the tabs | C:231 PlusButton | ✓ |
| N settled | TB eye-off "N settled" at the right when tabs are settled (`tab.settle`); a click shows them dimmed, a click on one brings it back | none | ◇ 2.1's bar on the web (the window follows Doop App 02): the web lists settled tabs as others |
| Files, Changes buttons | TB panelSwitch: segments over the side panel (layout block `panel-switch`), Herdr's Files and Changes panels as shared "workspace.panels" has them (unset: both); Changes counts files not committed | C:394 PanelButton files / changes (FolderIcon, DiffIcon), `snap.panels` (service: the same shared key) | ✓ |
| Files panel | Herdr's mods/files: the focused pane's folder, one folder at a time (.git left out, 500 per folder, 5,000 in all), each changed file's letter, a file's preview in place of the list (←), "Loading files…", "No files", "No folder" | A:379 SideList → C:563 SpacePanel → the task view's FilesView (web/plugins/worktree) asked of the space's folder (`/api/worktree?space=`, service/main.ts; errors in Herdr's words) | ✓ (the space's folder, where Herdr's follows the focused pane's: the same folder unless a terminal `cd`'d elsewhere) |
| Changes panel | Herdr's mods/changes: uncommitted changes against HEAD in the folder's repo, "N files", +added −removed, the first file's diff under the list, "No uncommitted changes", "Not a git repository", "Select a file to view its changes", "Showing the first 1,000 changed files" | C:563 the task view's DiffView on the space's folder (core/worktree.js `against`: no base, so HEAD) | ✓ (its bar also says "Uncommitted", the task view's line) |
| Changes' commit box | Herdr's mods/changes: "Commit message", Commit / "Committing…" (git add -A, commit), "Commit failed: …" | C:575 Commit → `space-commit` (service/actions.ts) | ✓ |
| Files, Changes on a phone | (the window has no phone) | none: the phone's bottom bar holds Chat, Tasks and Artifacts | ◇ phone navigation: no room for two more tabs in its bar |
| App menu | MT:151 (no tab under the pointer) `appMenu`: New space, Keybinds, Theme: Graphite / Ink / Moss / Atom One Dark | C:539 right-click on the bar's empty part: New space (openAddSpace), Keybinds (openKeybinds, the keyboard plugin's dialog) | ✓ (themes ◇: Herdr's own look; the web follows the device's light or dark) |
| Tasks button with counts | TB panelSwitch's Tasks segment: icon, "Tasks", red (everything that needs you) and green (every Ready task); the bar's panel toggle carries them while the panel is shut | C:348 PanelButton, C:380 TasksCount | ◇ 2.1's bar on the web (the window follows Doop App 02): the web keeps its buttons in the bar |
| Artifacts button (add-on on) | TB panelSwitch's Artifacts segment | C:348, when the artifacts plugin is on | ✓ |
| Words only where roomy, the open one keeps its word | TB panelSwitch: every segment's word from 400 px of panel, else the shown one's | C:388 roomy = bar to window edge ≥ 1100; C:348 | ✓ |
| Hiding the panel | TB the bar's panel toggle (layout.hide / show; shut with no panel picked: Tasks) | C:348 `sideShut`; A:720 the right column goes (Frame without it) | ✓ |
| Panel remembered per space | TB:92 syncPanel | C:388 `shepherdr.panels` per space, this device | ✓ |
| Opening a task shows the panel | inbox.js showInbox | A:720 a task opened while shut opens Tasks | ✓ |
| Minimize, maximize, close | TB:203 | none | ◇ no window chrome on the web |

## + menu

| Element | Window | Web | State |
|---|---|---|---|
| Terminal | NM:66 `NEW_MENU.terminal`, key hint (tab.new) | C:188 `NEW_MENU.terminal` → `tab-new` | ✓ |
| Terminal's key hint | NM:66 Ctrl+Shift+T | none | ◇ a key the browser keeps |
| Assistant row | NM:67 `assistantRow`: "Show Assistant" with its tab, else "Assistant" hint C; another machine's space "This computer only", greyed | C:188 the same row (`assistantOpen`: its tab, or its agent running) | ✓ |
| Assistant row does | NM:53 tab.select, or a new Assistant tab | C:188 shows the space's chat (its first message starts the Assistant, as the window's new tab does) | ✓ |
| C and 1–9 | NM:58 | C:164 useMenuKeys | ✓ |
| "Start an agent" | NM:69 | C:188 MenuLabel | ✓ |
| Agents offered | NM:50 `agentChoices`: installed first, then at most two that aren't; hint `agentHint` ("1".."9", "Not installed"), greyed | C:188 the same | ✓ |
| Which agents | NM:33 Herdr's program table (knownAgents) on the space's machine | service `knownAgents` (actions.ts): what the window keeps in shared "machines.stats" per machine (lib/machines.js now adds each one's `run` and the first two not installed); `tab-new` starts one with its `run` | ✓ (◇ while no window runs: only the window can ask Herdr, so the service falls back to Claude Code and Codex, looked for on that machine) |
| Loading / failed | NM:73 "Checking installed agents…", "Couldn't load agents" | C:188 | ✓ |
| New space | NM:75, key hint | C:188 openAddSpace on the space's machine | ✓ (hint ◇ a key the browser keeps) |
| New worktree…, Open worktree… | NM:76-77 the worktree dialog | C:188 openWorktree new / open | ✓ (dialog: [dialogs](dialogs.md)) |
| Icons | NM network, branch | C ModelIcon, SplitIcon (the sidebar's git-branch) | ◇ the web's icon set |

## Tab menu

| Element | Window | Web | State |
|---|---|---|---|
| Rows | MT:69 `tabMenu`: Rename…, Edit instructions… (Assistant's tab), Switch agent (an agent here, one installed), Restart, line, Close tab | C:437 TabMenuItems from `tabMenu`, for every tab | ✓ |
| Switch agent's hint | MT `›` | C:437 `›` | ✓ |
| Rename… | LC:393 prompt "Rename tab", label "Name", field the given name (empty if unnamed), placeholder its name, "Save" | C:570 TabRename (`RENAME_TAB`); `tab-rename` by tab id | ✓ |
| Edit instructions… | MT:166 the assistant template beside the chat | C:437 openRole assistant.md | ✓ |
| Switch agent submenu | CO:147 "Switch agent", "Checking installed agents…", installed agents, the running one greyed "Current", 1–9 | C:453 the same list in the menu's place (`SWITCH_AGENT`; the tab's agent from `machines.stats`) → `tab-switch`: restart.sh with that agent's `run`, as the window's | ✓ (◇ in place of the menu, not beside it: menus on the web don't open side submenus, a phone has no room) |
| Restart | MT:183 at once, as it was (restart.sh; an Assistant from its template again) | C:453 `tab-switch` without an agent: restart.sh the same way | ✓ |
| Remote agents | MT:57 no Switch/Restart for another machine's agent | C:437 `remote` | ✓ |
| Close tab | LC:380 an Assistant with workers asks (CO:182 "Close the Assistant?", Stop its workers / Let them finish, "Close Assistant"); the last tab asks "Close “name”?" | C:540 closeTab: the same order; C:628 CloseAssistant, C:604 CloseSpace (`CLOSE_SPACE`) | ✓ |
| Keyboard ↑ ↓ Enter Esc | MT:192 | Menu (ui.tsx) | ✓ |
| Space menu | MT:144 the sidebar's | [sidebar](sidebar.md) | ✓ |
| Pane menu | MT:106 Split right/down, Zoom, right-clicks, Send back, Close pane | none | ◇ one pane per tab on the web: Herdr's own pane layout isn't drawn (the web's split view holds spaces and tasks, not terminals) |

## Pane header

| Element | Window | Web | State |
|---|---|---|---|
| Name | PC:215 "Assistant · Claude Code" (just "Assistant" before it starts); another tab its program | A:301 `place.header`; another tab `prog` | ✓ |
| Folder, ~ for home | PC:240 | A:301 `place.where` / the tab's `where` | ✓ |
| The space's name | (not in the header: the sidebar and the tab) | desktop: same; phone: its top names the space | ◇ phone: no sidebar or tab bar |
| Autopilot switch | AP:86 knob + "Autopilot" + `headerDetail` ("Next 09:30", "Queued", "Waking" pulsing, "On events", "Run now only") | C:42 Switch + word + `headerDetail` (`place.pilot`), "Waking" pulses | ✓ |
| Narrow header: switch only, tooltip | AP:21 below 480 px, tooltip "Autopilot" | C:42 container below 30rem / phone: switch only, title "Autopilot" | ✓ |
| Flips at once; refusal toasts | AP:132 "Autopilot didn't turn on/off" | C:42 the same toast | ✓ |
| "Write a heartbeat" | AP:128 on with an empty heartbeat → Settings › Autopilot | C:42 `pilot.blank` → Settings › Autopilot for the space | ✓ |
| Status | PC:244-246 spinner; "Needs you" pill; done dot | C:103 StatusMark | ✓ |
| × on hover: End agent | PC:249-258 "End Claude Code?" Cancel / End agent (`endAgent`), tooltip "End Claude Code" | C:116 PaneEnd, same words → `tab-end` | ✓ |
| Split right, Split down, Zoom | PC:254-256 | none | ◇ one pane per tab on the web: Herdr's own pane layout isn't drawn |
| Chat \| Terminal | PC:259 the Assistant's and every Claude Code / Codex pane's | T:337 the Assistant's, and another Claude Code / Codex tab's (`ui.tabView`); phone: ⋯ › Show | ✓ (◇ phone) |
| Chat for another agent tab | PC:217 its chat: the agent's own session log, "Message Claude Code" | A:301 the chat view on the tab's key (t:<address>; the service follows any agent terminal), placeholder `Message <agent>`; its terminal while Terminal (the window's default for a tab from +) | ✓ (◇ which one shows is the web's own: switching here doesn't move the window's pane) |
| Hover order (buttons before the switch) | PC:252 | A:301 placeHeader by order | ✓ |
| Header ⋯ (2.1's) | (none) | phone only | ✓ (◇ phone) |
