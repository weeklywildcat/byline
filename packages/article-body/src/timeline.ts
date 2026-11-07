import type { TimelineEvent } from "./types";

/** An event needs a headline or an explanation; a date label alone is a stub that is never published. */
export function isStubEvent(event: Pick<TimelineEvent, "title" | "body">): boolean {
  return !event.title.trim() && !event.body.trim();
}

/** The first four-digit year in a label ("Fall 2027", "Oct. 17, 2026"). */
export function labelYear(label: string): string | null {
  return /\b(1[5-9]\d{2}|20\d{2})\b/.exec(label)?.[1] ?? null;
}

/**
 * Which events begin a new year, comparing each with the previous published
 * event that names one. The renderer draws a hairline across those rows.
 */
export function periodStarts(events: ReadonlyArray<Pick<TimelineEvent, "label" | "title" | "body">>): boolean[] {
  let previous: string | null = null;
  return events.map((event) => {
    if (isStubEvent(event)) return false;
    const year = labelYear(event.label);
    if (!year) return false;
    const starts = previous !== null && year !== previous;
    previous = year;
    return starts;
  });
}
