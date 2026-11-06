import { SCHEDULE_MODES, type ScheduleMode } from "./vocabulary";

/**
 * Appointment timing, ported from `byline_story_appointment_build()`
 * (wordpress-plugin/includes/editorial/reporting.php).
 *
 * The mode decides which fields survive, so switching modes never leaves a
 * stale value active. A target window is date-only text and is never turned
 * into an instant: "next week" must not become a fabricated Monday at nine.
 */
export type AppointmentTimingInput = {
  scheduleMode?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
  startAt?: unknown;
  endAt?: unknown;
};

export type AppointmentTiming = {
  scheduleMode: ScheduleMode;
  windowStart: string | null;
  windowEnd: string | null;
  startAt: string | null;
  endAt: string | null;
};

export class TimingError extends Error {}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in `YYYY-MM-DD`, or "" when empty. */
export function dateOnly(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") throw new TimingError("Use a date like 2026-11-12.");
  const match = DATE_ONLY.exec(value.trim());
  if (!match) throw new TimingError("Use a date like 2026-11-12.");
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new TimingError("That date does not exist.");
  return value.trim();
}

/** An exact instant as an ISO UTC string, or "" when empty. Requires an explicit offset or Z. */
export function instant(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const text = value instanceof Date ? value.toISOString() : typeof value === "string" ? value.trim() : "";
  if (!/T\d{2}:\d{2}/.test(text) || !/(Z|[+-]\d{2}:?\d{2})$/.test(text)) throw new TimingError("Use a date and time with a timezone.");
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw new TimingError("Use a date and time with a timezone.");
  return new Date(time).toISOString();
}

export function normalizeAppointmentTiming(input: AppointmentTimingInput): AppointmentTiming {
  const mode = input.scheduleMode ?? "unscheduled";
  if (typeof mode !== "string" || !(SCHEDULE_MODES as readonly string[]).includes(mode)) {
    throw new TimingError("Choose whether the appointment is unscheduled, a date range, or an exact time.");
  }
  const timing: AppointmentTiming = { scheduleMode: mode as ScheduleMode, windowStart: null, windowEnd: null, startAt: null, endAt: null };
  if (mode === "window") {
    const start = dateOnly(input.windowStart);
    const end = dateOnly(input.windowEnd);
    if (!start) throw new TimingError("Choose the first day of the target window.");
    if (end && end < start) throw new TimingError("The target window cannot end before it starts.");
    timing.windowStart = start;
    timing.windowEnd = end || null;
  } else if (mode === "exact") {
    const start = instant(input.startAt);
    const end = instant(input.endAt);
    if (!start) throw new TimingError("Choose a date and start time.");
    if (end && end < start) throw new TimingError("The appointment cannot end before it starts.");
    timing.startAt = start;
    timing.endAt = end || null;
  }
  return timing;
}
