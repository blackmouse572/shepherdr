// "Always in this space", the window's side: a space's allow rules (core/allow.js) in ~/.herdr/shepherdr.json, and the
// engine that answers a matching permission ask "allow" by the same path the cards use (data/chat-asks: end/<id> says
// how, then ans/<id>.json holds the hook's decision; mods/chat/ask-hook.sh prints it to Claude).
//   alwaysAllow(space, req)    Needs you's "Always in this space": the ask's rule is kept for its space
//   removeRule(space, rule)    Settings > Agents' list
//   startAllowRules(cx)        from the sidebar's init (always loaded): every waiting ask (shared "inbox.asks", which
//                              the tab bar's engine keeps) whose space has a matching rule is allowed
// Only permission asks: a plan or a question always waits for the person. An agent shown as a terminal asks there
// (the hook doesn't ask the chat), so no rule answers it.
// Shared: the source is lib/allow.js; bin/sync-shared copies it into each mod in lib/COPIES.
// Edit lib/allow.js, never a mod's copy, then run bin/sync-shared.

import { appHome, home, shared, terminals, spaces, readTextFile, writeTextFile } from "herdr";
import { ruleOf, findRule, rulesIn, withRule, withoutRule, ALLOWED_BY_RULE } from "./core/allow.js";
import { words, allow } from "./core/asks.js";
import { spaceOfTerminal } from "./core/notify.js";

const FILE = () => `${home()}/.herdr/shepherdr.json`;
const ASKS = () => `${appHome()}/data/chat-asks`;

async function load() {
  const raw = await readTextFile(FILE()).catch(() => null);
  let cfg = {};
  try { cfg = raw ? JSON.parse(raw) ?? {} : {}; } catch { cfg = null; }
  return { raw, cfg };
}

// Read, change, write only if nobody changed it meanwhile (as Settings does). A file that isn't JSON is left alone.
async function change(edit) {
  for (let i = 0; i < 3; i++) {
    const { raw, cfg } = await load();
    if (!cfg) throw new Error("~/.herdr/shepherdr.json isn't readable JSON; fix it first.");
    try {
      await writeTextFile(FILE(), `${JSON.stringify(edit(cfg), null, 2)}\n`, raw);
      return true;
    } catch {}
  }
  throw new Error("Couldn't save the rule: the settings file kept changing.");
}

// The ask's terminal's space, as the chat and Needs you name it.
export const spaceOfAsk = (ask) => spaceOfTerminal(terminals().find((k) => k.address === ask?.terminal));

export async function alwaysAllow(space, req) {
  const rule = ruleOf(req);
  if (!space || !rule) throw new Error("This ask can't have a rule.");
  const s = spaces().find((x) => x.id === space);
  await change((cfg) => withRule(cfg, space, rule, { name: s?.name, machine: s?.machine }));
  return rule;
}

export const removeRule = (space, rule) => change((cfg) => withoutRule(cfg, space, rule));

// ---- the engine --------------------------------------------------------------------------------------------------

let started = false;

export function startAllowRules(cx) {
  if (started) return;
  started = true;
  const seen = new Map(); // ask id -> the settings text it was checked against (a new rule checks waiting asks again)
  let busy = false, raw = null, cfg = {}, readAt = 0;
  cx.timer.every(1000, (cx) => {
    const waiting = shared("inbox.asks") ?? [];
    for (const id of [...seen.keys()]) if (!waiting.some((a) => a.id === id)) seen.delete(id);
    const fresh = Date.now() - readAt < 3000;
    const asks = waiting.filter((a) => a?.id && (!fresh || seen.get(a.id) !== raw));
    if (busy || !asks.length) return;
    busy = true;
    cx.spawn(async () => {
      try {
        if (!fresh) { ({ raw, cfg } = await load()); cfg ??= {}; readAt = Date.now(); }
        for (const a of asks) {
          if (seen.get(a.id) === raw) continue;
          seen.set(a.id, raw);
          const space = spaceOfAsk(a);
          const rules = space ? rulesIn(cfg, space) : [];
          if (!rules.length) continue;
          let req = null;
          try { req = JSON.parse((await readTextFile(`${ASKS()}/req/${a.id}.json`)) ?? ""); } catch { req = null; }
          if (!req || words(req).kind !== "permission" || !findRule(rules, req)) continue;
          await writeTextFile(`${ASKS()}/end/${a.id}`, `${ALLOWED_BY_RULE}\n`, null).catch(() => {});
          await writeTextFile(`${ASKS()}/ans/${a.id}.json`, allow(), null).catch(() => {});
        }
      } finally {
        busy = false;
      }
    });
  });
}
