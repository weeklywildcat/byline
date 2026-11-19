import { addDays, localDay } from "../domain/dates";
import type { Change, RangePreset, ResolvedRange } from "./model";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

const isDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

export const daysBetween = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * An inclusive range in the Analytics property's timezone, plus the previous period of
 * equal length (so one request with two date ranges can compare). A custom range that is
 * malformed, reversed or absurdly long falls back to the default 7 days.
 */
export function resolveRange(input: { preset?: unknown; start?: unknown; end?: unknown }, timeZone: string, now: Date = new Date()): ResolvedRange {
  const today = localDay(now, timeZone);
  let preset: RangePreset = input.preset === "today" || input.preset === "28d" || input.preset === "90d" || input.preset === "custom" ? input.preset : "7d";
  let start: string;
  let end = today;
  if (preset === "today") start = today;
  else if (preset === "28d") start = addDays(today, -27);
  else if (preset === "90d") start = addDays(today, -89);
  else if (preset === "custom" && isDay(input.start) && isDay(input.end) && input.start <= input.end && daysBetween(input.start, input.end) <= MAX_DAYS) {
    start = input.start;
    end = input.end > today ? today : input.end;
    if (start > end) start = end;
  } else {
    if (preset === "custom") preset = "7d";
    start = addDays(today, -6);
  }
  const days = daysBetween(start, end);
  return { preset, start, end, previousStart: addDays(start, -days), previousEnd: addDays(start, -1), days, includesToday: end >= today, timeZone };
}

/** A range from first publication to today, capped, for a Story's "since publication" view. */
export function rangeSince(publishedAt: string, timeZone: string, now: Date = new Date(), maxDays = 90): ResolvedRange {
  const today = localDay(now, timeZone);
  const published = localDay(publishedAt, timeZone);
  const earliest = addDays(today, -(maxDays - 1));
  const start = published > today ? today : published < earliest ? earliest : published;
  const days = daysBetween(start, today);
  return { preset: "custom", start, end: today, previousStart: addDays(start, -days), previousEnd: addDays(start, -1), days, includesToday: true, timeZone };
}

/**
 * Compares two values without inventing a percentage: nothing to compare (a missing or
 * zero previous period) has no ratio, so the interface shows "New" or nothing, never ∞%.
 */
export function change(current: number | null | undefined, previous: number | null | undefined): Change {
  const now = typeof current === "number" && Number.isFinite(current) ? current : null;
  const before = typeof previous === "number" && Number.isFinite(previous) ? previous : null;
  return { current: now, previous: before, ratio: now === null || before === null || before === 0 ? null : (now - before) / before };
}

/** GA reports `date` as YYYYMMDD. */
export function gaDate(value: string): string {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : value;
}

/** Every day in a range, so a chart shows zero-view days instead of skipping them. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end && days.length <= MAX_DAYS; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * The one definition of "Avg engagement": Google's user engagement duration divided by active
 * users, in seconds. Overview, Content and Story Performance all use it.
 */
export function averageEngagementSeconds(engagementDuration: number, activeUsers: number): number | null {
  return activeUsers > 0 && Number.isFinite(engagementDuration) ? engagementDuration / activeUsers : null;
}
