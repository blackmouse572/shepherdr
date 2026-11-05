import { expect, test } from "bun:test";
import { readingPrefs, withChoice, stepSize, proseMetrics, readingSig, codeLines, fontOptions, fontFamily, READING_DEFAULTS } from "./reading.js";

test("stored reading choices come back whole and valid", () => {
  expect(readingPrefs(null)).toEqual(READING_DEFAULTS);
  expect(readingPrefs("x")).toEqual(READING_DEFAULTS);
  expect(readingPrefs({ size: 17, leading: "loose", width: "wide", font: "serif", fold: "yes" }))
    .toEqual({ size: 14, leading: "comfy", width: "wide", font: "serif", fold: true });
  expect(readingPrefs({ size: 13, fold: false }).fold).toBe(false);
  expect(withChoice({ size: 15 }, "leading", "airy")).toEqual({ ...READING_DEFAULTS, size: 15, leading: "airy" });
  expect(withChoice(null, "size", 99).size).toBe(14);
});

test("Cmd + / Cmd - step the size and stop at the ends", () => {
  expect(stepSize(null, 1).size).toBe(15);
  expect(stepSize({ size: 15 }, 1).size).toBe(15);
  expect(stepSize({ size: 14 }, -1).size).toBe(13);
  expect(stepSize({ size: 13 }, -1).size).toBe(13);
  expect(stepSize({ size: 13, width: "wide" }, 1)).toEqual({ ...READING_DEFAULTS, size: 14, width: "wide" });
});

test("the numbers the chat draws with", () => {
  const m = proseMetrics(null);
  expect([m.size, m.leading, m.line, m.measure, m.column]).toEqual([14, 1.6, 22, 540, 700]);
  expect(proseMetrics({ width: "narrow", leading: "snug", size: 13 })).toMatchObject({ measure: 480, line: 19, leading: 1.45 });
  expect(readingSig(readingPrefs(null))).not.toBe(readingSig(readingPrefs({ font: "serif" })));
  // fold doesn't change a row's measured words
  expect(readingSig(readingPrefs({ fold: false }))).toBe(readingSig(readingPrefs(null)));
});

test("code lines in soft colour runs", () => {
  const [a, b] = codeLines('const lock = await acquire(account, { ttl: "10m" })\nif (!lock) return // skip', "js");
  expect(a).toEqual([["k", "const"], [null, " lock = "], ["k", "await"], [null, " "], ["f", "acquire"], [null, "(account, { ttl: "], ["s", '"10m"'], [null, " })"]]);
  expect(b).toEqual([["k", "if"], [null, " (!lock) "], ["k", "return"], [null, " "], ["c", "// skip"]]);
  // a block comment carried over lines; its "/*/" isn't its end
  expect(codeLines("x /*/ a\nb */ y", "ts")).toEqual([[[null, "x "], ["c", "/*/ a"]], [["c", "b */"], [null, " y"]]]);
  expect(codeLines("echo 'hi' # note", "sh")).toEqual([[[null, "echo "], ["s", "'hi'"], [null, " "], ["c", "# note"]]]);
  expect(codeLines("a#b", "sh")).toEqual([[[null, "a#b"]]]);
  expect(codeLines("+ added\n- gone", "diff")).toEqual([[[null, "+ added"]], [[null, "- gone"]]]);
  expect(codeLines("", "js")).toEqual([[[null, ""]]]);
  expect(codeLines('"open', "js")).toEqual([[["s", '"open']]]);
});

test("any font on this computer can be the chat's", () => {
  expect(readingPrefs({ font: "Iowan Old Style" }).font).toBe("Iowan Old Style");
  expect(readingPrefs({ font: "" }).font).toBe("sans");
  expect(readingPrefs({ font: 3 }).font).toBe("sans");
  const all = fontOptions(["Menlo", "Avenir", "Geist", "Avenir"]);
  expect(all.map((o) => o[0])).toEqual(["sans", "serif", "Avenir", "Menlo"]);
  expect(fontOptions(["Menlo", "Avenir"], "men").map((o) => o[1])).toEqual(["Menlo"]);
  expect([fontFamily("sans", "S"), fontFamily("serif", "S"), fontFamily("Menlo", "S")]).toEqual([null, "S", "Menlo"]);
});
