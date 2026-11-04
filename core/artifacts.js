// The Artifacts list's groups and words (Doop App 10): grouped by the task that made them, newest first.
// Plain JS (no herdr or node imports): bin/sync-shared copies it into mods/artifacts/core/.

export const NO_TASK = "Not from a task";

// [{ task, items }]: each task's artifacts (newest first), tasks by their newest; those from no task last.
export function byTask(items) {
  const groups = new Map();
  for (const a of items ?? []) {
    const k = a?.task || null;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const newest = (list) => Math.max(0, ...list.map((a) => a.at ?? 0));
  return [...groups.entries()]
    .map(([task, list]) => ({ task, items: [...list].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)) }))
    .sort((a, b) => (a.task === null) - (b.task === null) || newest(b.items) - newest(a.items));
}

// Under its task's heading the title goes without the task in front ("HAT-2: Coverage" → "Coverage").
export function shortTitle(a) {
  const title = String(a?.title ?? "");
  if (!a?.task) return title;
  const head = `${a.task}:`;
  return title.toUpperCase().startsWith(head.toUpperCase()) ? title.slice(head.length).trim() || title : title;
}

// The header's line: "shepherdr · 4 from 3 tasks".
export function listLine(name, items) {
  const n = (items ?? []).length;
  if (!n) return name ?? "";
  const tasks = new Set(items.map((a) => a.task).filter(Boolean)).size;
  const what = tasks ? `${n} from ${tasks} ${tasks === 1 ? "task" : "tasks"}` : `${n} ${n === 1 ? "artifact" : "artifacts"}`;
  return [name, what].filter(Boolean).join(" · ");
}
