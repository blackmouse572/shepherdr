// "Always in this space" (Needs you's permission card, Doop App 03): a space's standing allow rules for Claude's
// permission asks. A rule is exactly what one ask asked, never broader:
//   Bash, one plain command        { tool: "Bash", prefix: [words] }   that command, or it with more words after
//   Bash, anything else            { tool: "Bash", command }           only that exact command (pipes, ;, $(), > ...)
//   Edit / Write / MultiEdit / Read / NotebookEdit   { tool, path }    that one file
//   WebFetch                       { tool, url }                       that exact URL
//   any other tool (an app's, WebSearch, Glob, Grep) { tool }          that tool by its exact name
// Plans and questions never get one. Kept in ~/.herdr/shepherdr.json under the space: spaces[<id>].allow =
// [{ ...rule, at }]; the sidebar's engine (lib/allow.js) answers a matching ask "allow" the way the card does.
// Shared core: the source is core/allow.js; bin/sync-shared copies it into the mods in lib/COPIES.

// One plain word: no expansion, redirect, separator or line break outside quotes, nor $ or ` inside (as herdr-task's
// own_command, herdr_task/launch.py WORD).
const WORD = /(?:[\w@%+=:,./-]+|'[^']*'|"(?:[^"\\$`]|\\["\\])*")+/y;
const UNQUOTE = /'([^']*)'|"((?:[^"\\]|\\.)*)"/g;

// A plain command's words, unquoted; null when it's anything more (a pipe, ;, &&, $(...), a redirect, a newline).
export function plainWords(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const out = [];
  let at = 0;
  while (at < s.length) {
    if (s[at] === " " || s[at] === "\t") { at++; continue; }
    WORD.lastIndex = at;
    const m = WORD.exec(s);
    if (!m) return null;
    out.push(m[0].replace(UNQUOTE, (_x, a, b) => (a !== undefined ? a : b.replace(/\\(.)/g, "$1"))));
    at = WORD.lastIndex;
  }
  return out.length ? out : null;
}

const FILE_TOOLS = { Edit: "file_path", Write: "file_path", MultiEdit: "file_path", Read: "file_path", NotebookEdit: "notebook_path" };
const NEVER = new Set(["ExitPlanMode", "AskUserQuestion"]);

// The rule an ask would make ("Always in this space"), or null when it can't have one.
export function ruleOf(req) {
  const tool = typeof req?.tool_name === "string" ? req.tool_name : "";
  const v = req?.tool_input && typeof req.tool_input === "object" ? req.tool_input : {};
  if (!tool || NEVER.has(tool)) return null;
  if (tool === "Bash") {
    const command = String(v.command ?? "").trim();
    if (!command) return null;
    const w = plainWords(command);
    return w ? { tool, prefix: w } : { tool, command };
  }
  if (FILE_TOOLS[tool]) {
    const path = v[FILE_TOOLS[tool]];
    return typeof path === "string" && path ? { tool, path } : null;
  }
  if (tool === "WebFetch") return typeof v.url === "string" && v.url ? { tool, url: v.url } : null;
  return { tool };
}

// A stored rule as a rule, or null when it isn't a whole one (a Bash rule needs its command, a file tool its file).
export function cleanRule(r) {
  if (!r || typeof r !== "object" || typeof r.tool !== "string" || !r.tool || NEVER.has(r.tool)) return null;
  if (r.tool === "Bash") {
    if (Array.isArray(r.prefix) && r.prefix.length && r.prefix.every((w) => typeof w === "string")) return { tool: r.tool, prefix: r.prefix };
    return typeof r.command === "string" && r.command.trim() ? { tool: r.tool, command: r.command.trim() } : null;
  }
  if (FILE_TOOLS[r.tool]) return typeof r.path === "string" && r.path ? { tool: r.tool, path: r.path } : null;
  if (r.tool === "WebFetch") return typeof r.url === "string" && r.url ? { tool: r.tool, url: r.url } : null;
  return { tool: r.tool };
}

const key = (r) => JSON.stringify(cleanRule(r));
export const sameRule = (a, b) => key(a) !== "null" && key(a) === key(b);

// Whether a rule answers this ask: the exact tool, and the same command (its words first, nothing chained), file or URL.
export function matches(rule, req) {
  const r = cleanRule(rule), q = ruleOf(req);
  if (!r || !q || r.tool !== q.tool) return false;
  if (r.prefix) return Boolean(q.prefix) && q.prefix.length >= r.prefix.length && r.prefix.every((w, i) => q.prefix[i] === w);
  if (r.command) return q.command === r.command;
  if (r.path) return q.path === r.path;
  if (r.url) return q.url === r.url;
  return Object.keys(q).length === 1;
}

export const findRule = (rules, req) => (rules ?? []).find((r) => matches(r, req)) ?? null;

// A rule in words, for Settings' list: "Run: npm test …", "Edit /repo/a.js", "Use mcp__github__create_issue".
export function ruleWords(rule) {
  const r = cleanRule(rule);
  if (!r) return "";
  if (r.prefix) return `Run: ${r.prefix.join(" ")} …`;
  if (r.command) return `Run exactly: ${r.command}`;
  if (r.path) return `${r.tool === "Read" ? "Read" : r.tool === "Write" ? "Write" : "Edit"} ${r.path}`;
  if (r.url) return `Fetch ${r.url}`;
  return `Use ${r.tool}`;
}

// ---- in ~/.herdr/shepherdr.json ---------------------------------------------------------------------------------

export const rulesIn = (cfg, space) => (Array.isArray(cfg?.spaces?.[space]?.allow) ? cfg.spaces[space].allow : []).filter((r) => cleanRule(r));

// Every space's rules: [{ space, name, rule }], for Everywhere's list.
export function allRules(cfg) {
  return Object.entries(cfg?.spaces ?? {}).flatMap(([space, v]) => rulesIn(cfg, space).map((rule) => ({ space, name: v?.name ?? space, rule })));
}

// The file's object with the rule added to the space (once). meta: { name, machine } of the space, kept beside it.
export function withRule(cfg, space, rule, meta = {}, at = Date.now()) {
  const r = cleanRule(rule);
  const next = JSON.parse(JSON.stringify(cfg ?? {}));
  if (!r || !space) return next;
  next.version ??= 1;
  next.spaces ??= {};
  const own = (next.spaces[space] ??= {});
  if (meta.name && !own.name) own.name = meta.name;
  if (meta.machine && !own.machine) own.machine = meta.machine;
  const list = Array.isArray(own.allow) ? own.allow : [];
  if (!list.some((x) => sameRule(x, r))) list.push({ ...r, at });
  own.allow = list;
  return next;
}

export function withoutRule(cfg, space, rule) {
  const next = JSON.parse(JSON.stringify(cfg ?? {}));
  const own = next.spaces?.[space];
  if (!own || !Array.isArray(own.allow)) return next;
  own.allow = own.allow.filter((x) => !sameRule(x, rule));
  if (!own.allow.length) delete own.allow;
  return next;
}

// The quiet line on an ask a rule answered.
export const ALLOWED_BY_RULE = "Allowed by a rule in this space";
export const ALWAYS = "Always in this space";
