// Reading in the chat (Doop App 14, a step smaller): how the chat's prose is set, one choice for every chat on
// this device, kept in shared "chat.reading" = { size, leading, width, font, fold }. Lists, tabs and the sidebar
// keep their own sizes. The header's Aa (mods/pane-chat) changes it; Cmd + / Cmd - in a chat steps the size.

export const READING_KEY = "chat.reading";

// The choices, in the popover's order: [value, label].
export const SIZES = [[13, "13"], [14, "14"], [15, "15"]];
export const LEADINGS = [["snug", "Snug", 1.45], ["comfy", "Comfy", 1.6], ["airy", "Airy", 1.75]];
export const WIDTHS = [["narrow", "Narrow", 480], ["comfy", "Comfy", 540], ["wide", "Wide", 680]];
export const FONTS = [["sans", "Geist"], ["serif", "Geist Serif"]];
// A font: one of FONTS' keys, or any family on this computer by its name (Herdr's fonts()).
export const fontChoice = (f) => (typeof f === "string" && f.trim() && f.length <= 120 ? f.trim() : null);
// The select's list: Geist and Geist Serif first, then this computer's families A to Z, filtered by `q`.
export function fontOptions(families, q = "") {
  const own = new Set(FONTS.map((o) => o[1]));
  const rest = [...new Set((families ?? []).filter((n) => typeof n === "string" && n.trim() && !own.has(n)))]
    .sort((a, b) => a.localeCompare(b)).map((n) => [n, n]);
  const want = q.trim().toLowerCase();
  return [...FONTS, ...rest].filter((o) => !want || o[1].toLowerCase().includes(want));
}
// A font key's family to draw with: null for Geist (the UI's own), the serif's face, or the family itself.
export const fontFamily = (f, serif) => (f === "sans" ? null : f === "serif" ? serif : f);
export const READING_DEFAULTS = { size: 14, leading: "comfy", width: "comfy", font: "sans", fold: true };

export const READING_WORDS = {
  open: "Reading",
  title: "Reading",
  sub: "Every chat on this device · Cmd + / Cmd -",
  size: "Text size",
  leading: "Line spacing",
  width: "Width",
  font: "Font",
  fold: "Fold tool steps into one line",
  live: "Changes show live behind this",
  reset: "Reset",
};

const has = (list, v) => list.some((o) => o[0] === v);

// Whatever is stored, as a whole, valid choice (unknown values fall back to the defaults).
export function readingPrefs(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = READING_DEFAULTS;
  return {
    size: has(SIZES, r.size) ? r.size : d.size,
    leading: has(LEADINGS, r.leading) ? r.leading : d.leading,
    width: has(WIDTHS, r.width) ? r.width : d.width,
    font: fontChoice(r.font) ?? d.font,
    fold: typeof r.fold === "boolean" ? r.fold : d.fold,
  };
}

// The command bar's Reading settings row (Doop App 07b): its hint, "15 px · Comfy"; and the popover's size (pane-chat).
export const readingHint = (raw) => { const p = readingPrefs(raw); return `${p.size} px · ${LEADINGS.find((l) => l[0] === p.leading)[1]}`; };
export const READING_POP = { width: 400, height: 312 };

// One choice changed (the popover), the rest kept.
export const withChoice = (raw, key, value) => readingPrefs({ ...readingPrefs(raw), [key]: value });

// Cmd + / Cmd -: the next size up (dir 1) or down (-1), stopping at the ends.
export function stepSize(raw, dir) {
  const p = readingPrefs(raw);
  const i = SIZES.findIndex((o) => o[0] === p.size);
  const j = Math.max(0, Math.min(SIZES.length - 1, i + (dir > 0 ? 1 : -1)));
  return { ...p, size: SIZES[j][0] };
}

// What a row's measured height depends on: a change measures every row again.
export const readingSig = (p) => `${p.size}|${p.leading}|${p.width}|${p.font}`;

// The numbers the chat draws with: the prose's size, its leading (a multiplier) and line in px, the measure (the
// prose's widest, about 70 letters at 14), the column around it (the measure plus room for the person's bubbles),
// an average letter's width (for estimates before a row is measured), and code: 12.5 on a 1.6 leading.
export function proseMetrics(raw) {
  const p = readingPrefs(raw);
  const leading = LEADINGS.find((o) => o[0] === p.leading)[2];
  const measure = WIDTHS.find((o) => o[0] === p.width)[2];
  return {
    ...p,
    leading,
    line: Math.round(p.size * leading),
    measure,
    column: measure + 160,
    letter: p.size * 0.54,
    code: { size: 12.5, leading: 1.6, line: 20 },
  };
}

// Code blocks' soft colours, by part: keywords (k), strings (s), comments (c) and functions (f); the rest plain.
const KEYWORDS = new Set(("as async await break case catch class const continue def default defer delete do elif else enum " +
  "export extends false finally fn for from func function go if impl import in interface is lambda let match mod mut " +
  "new nil none null of package pass private protected pub public raise return self static struct super switch this " +
  "throw trait true try type typeof undefined unless use var void where while with yield None True False").split(" "));
const HASH = new Set(["py", "python", "sh", "bash", "zsh", "shell", "console", "yaml", "yml", "toml", "rb", "ruby", "r", "perl", "make", "makefile", "dockerfile", "ini", "conf", "nix", "fish", "ps1", "powershell"]);
const DASH = new Set(["sql", "lua", "haskell", "hs"]);
const PLAIN = new Set(["text", "txt", "plain", "plaintext", "md", "markdown", "log", "output", "diff", "patch", "csv"]);

// A code block's lines as runs [kind, text] (kind null for plain), its block comments carried across lines.
// Plain text, logs and diffs stay one plain run a line.
export function codeLines(code, lang = "") {
  const l = String(lang ?? "").trim().toLowerCase();
  const lines = String(code ?? "").split("\n");
  if (PLAIN.has(l)) return lines.map((s) => [[null, s]]);
  const line = HASH.has(l) ? "#" : DASH.has(l) ? "--" : "//";
  const block = line === "//";
  let inBlock = false;
  return lines.map((s) => {
    const out = [];
    const put = (kind, text) => {
      if (!text) return;
      const last = out[out.length - 1];
      if (last && last[0] === kind) last[1] += text;
      else out.push([kind, text]);
    };
    let i = 0;
    while (i < s.length) {
      if (inBlock) {
        const end = s.indexOf("*/", i);
        if (end < 0) { put("c", s.slice(i)); i = s.length; break; }
        put("c", s.slice(i, end + 2));
        i = end + 2;
        inBlock = false;
        continue;
      }
      const ch = s[i];
      if (block && s.startsWith("/*", i)) { put("c", "/*"); i += 2; inBlock = true; continue; }
      if (s.startsWith(line, i) && (line !== "#" || i === 0 || /\s/.test(s[i - 1]))) { put("c", s.slice(i)); break; }
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        while (j < s.length && s[j] !== ch) j += s[j] === "\\" ? 2 : 1;
        put("s", s.slice(i, j + 1));
        i = j + 1;
        continue;
      }
      const w = /^[A-Za-z_$][\w$]*/.exec(s.slice(i));
      if (w) {
        const word = w[0];
        const after = s.slice(i + word.length);
        put(KEYWORDS.has(word) ? "k" : /^\s*\(/.test(after) ? "f" : null, word);
        i += word.length;
        continue;
      }
      put(null, ch);
      i++;
    }
    return out.length ? out : [[null, ""]];
  });
}
