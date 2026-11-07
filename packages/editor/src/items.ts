/**
 * Ordered-item edits shared by Gallery, Key Facts, Document pages and
 * Timeline. Pure: each returns the new list and the index that should have
 * focus, so pointer and keyboard paths make the same change.
 */
export type ItemChange<T> = { items: T[]; focus: number };

export function insertItem<T>(items: readonly T[], index: number, item: T, max: number): ItemChange<T> {
  if (items.length >= max) return { items: [...items], focus: Math.min(Math.max(index, 0), items.length - 1) };
  const at = Math.max(0, Math.min(index, items.length));
  return { items: [...items.slice(0, at), item, ...items.slice(at)], focus: at };
}

export function removeItem<T>(items: readonly T[], index: number, blank?: () => T): ItemChange<T> {
  if (index < 0 || index >= items.length) return { items: [...items], focus: 0 };
  const next = items.filter((_, i) => i !== index);
  // A list that must keep a row to type into gets a fresh blank one.
  if (!next.length && blank) return { items: [blank()], focus: 0 };
  return { items: next, focus: Math.max(0, Math.min(index, next.length - 1)) };
}

export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): ItemChange<T> {
  const to = index + direction;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return { items: [...items], focus: Math.max(0, Math.min(index, items.length - 1)) };
  const next = [...items];
  [next[index], next[to]] = [next[to] as T, next[index] as T];
  return { items: next, focus: to };
}

export function duplicateItem<T>(items: readonly T[], index: number, copy: (item: T) => T, max: number): ItemChange<T> {
  const item = items[index];
  if (item === undefined || items.length >= max) return { items: [...items], focus: Math.max(0, index) };
  return { items: [...items.slice(0, index + 1), copy(item), ...items.slice(index + 1)], focus: index + 1 };
}

/** Only one event can be the latest. */
export function setOnlyCurrent<T extends { current: boolean }>(items: readonly T[], index: number, current: boolean): T[] {
  return items.map((item, i) => ({ ...item, current: current && i === index }));
}

/** Alt+Shift+Arrow: the keyboard move every list shares. Returns -1, 1 or 0. */
export function moveDirection(event: { altKey: boolean; shiftKey: boolean; key: string }): -1 | 0 | 1 {
  if (!event.altKey || !event.shiftKey) return 0;
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") return -1;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") return 1;
  return 0;
}
