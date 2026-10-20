export type TimelineItem = { label: string; title: string; body: string; /** The most recent event; at most one. */ current?: boolean };
export type TimelineChange = { items: TimelineItem[]; focusIndex: number };
export const MAX_TIMELINE_ITEMS = 25;

const blank = (): TimelineItem => ({ label: '', title: '', body: '' });

/** A new, empty event at `index` (after the last event when omitted). */
export function addEvent(items: TimelineItem[], index = items.length): TimelineChange {
  if (items.length >= MAX_TIMELINE_ITEMS) return { items, focusIndex: Math.min(index, items.length - 1) };
  const at = Math.max(0, Math.min(index, items.length));
  return { items: [...items.slice(0, at), blank(), ...items.slice(at)], focusIndex: at };
}

/** A copy of an event directly after it. The copy is never marked as the latest. */
export function duplicateEvent(items: TimelineItem[], index: number): TimelineChange {
  if (items.length >= MAX_TIMELINE_ITEMS || !items[index]) return { items, focusIndex: Math.max(0, index) };
  const { current, ...copy } = items[index];
  return { items: [...items.slice(0, index + 1), copy, ...items.slice(index + 1)], focusIndex: index + 1 };
}

/** The last event cannot be removed: a timeline keeps one empty event for the writer to fill. */
export function removeEvent(items: TimelineItem[], index: number): TimelineChange {
  if (!items[index]) return { items, focusIndex: 0 };
  if (items.length === 1) return { items: [blank()], focusIndex: 0 };
  const next = items.filter((_, i) => i !== index);
  return { items: next, focusIndex: Math.min(index, next.length - 1) };
}

export function moveEvent(items: TimelineItem[], index: number, direction: -1 | 1): TimelineChange {
  const to = index + direction;
  if (!items[index] || to < 0 || to >= items.length) return { items, focusIndex: Math.max(0, Math.min(index, items.length - 1)) };
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return { items: next, focusIndex: to };
}

/** Mark one event as the latest (or clear it). Only one event can be. */
export function setCurrentEvent(items: TimelineItem[], index: number, current: boolean): TimelineItem[] {
  return items.map(({ current: _previous, ...item }, i) => (current && i === index ? { ...item, current: true } : item));
}

/** Whether markup holds any visible text, read character by character (no tag-stripping regex to get wrong). */
function hasText(html: string): boolean {
  let inTag = false;
  for (const character of html) {
    if (character === '<') inTag = true;
    else if (character === '>') inTag = false;
    else if (!inTag && character.trim() !== '') return true;
  }
  return false;
}

/** An event needs a headline or reporting; a date label alone is a stub that is not published. */
export function isStub(item: TimelineItem): boolean {
  return !item.title.trim() && !hasText(item.body);
}

/** The first four-digit year in a label ("Fall 2027", "Oct. 17, 2026"), as includes/content/story-blocks.php reads it. */
export function labelYear(label: string): string | null {
  return /\b(1[5-9]\d{2}|20\d{2})\b/.exec(label)?.[1] ?? null;
}

/** Which events begin a new year, comparing each with the previous published event that names one. */
export function periodStarts(items: TimelineItem[]): boolean[] {
  let previous: string | null = null;
  return items.map((item) => {
    if (isStub(item)) return false;
    const year = labelYear(item.label);
    if (!year) return false;
    const starts = previous !== null && year !== previous;
    previous = year;
    return starts;
  });
}
