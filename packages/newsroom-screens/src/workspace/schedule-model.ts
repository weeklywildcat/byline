/**
 * Shared date semantics for appointments, target windows and deadlines.
 *
 * - An exact appointment is a UTC instant; its calendar day and clock time are
 *   always read in the WordPress site timezone, never the browser's.
 * - A target window is date-only (`YYYY-MM-DD`) in the site timezone. It is never
 *   converted to an instant, so "next week" cannot become Monday at nine.
 * - Story deadlines, planned publication, WordPress schedule, task due dates,
 *   production due dates and appointments are different things. Nothing here
 *   merges them.
 */
import { dayDistance, siteDay } from "../home/newsroom-model";
import type { AppointmentStatus, ScheduleMode } from "./workspace-types";

const DAY_MS = 86_400_000;

export type SchedulableAppointment = {
  id: string;
  title: string;
  status: AppointmentStatus;
  scheduleMode: ScheduleMode;
  windowStart: string | null;
  windowEnd: string | null;
  startAt: string | null;
  endAt: string | null;
};

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Add whole days to a `YYYY-MM-DD` value without touching any timezone. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function dayFormatter(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
}

/** "Tue, Oct 27" */
export function formatDay(day: string, withWeekday = true): string {
  return dayFormatter({ ...(withWeekday ? { weekday: "short" } : {}), month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
}

/** "10:15 AM", read in the site timezone. */
export function formatTime(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(instant));
}

/** "10:15–10:35 AM", or "11:30 AM–1:00 PM" when the meridiem differs. */
export function formatTimeRange(start: string, end: string | null, timezone: string): string {
  const from = formatTime(start, timezone);
  if (!end || end === start) return from;
  const to = formatTime(end, timezone);
  const meridiem = (value: string) => value.match(/[AP]M$/i)?.[0];
  return meridiem(from) && meridiem(from) === meridiem(to) ? `${from.replace(/\s?[AP]M$/i, "")}–${to}` : `${from}–${to}`;
}

/** "Oct 26–30", "Oct 29", "Oct 30–Nov 2". */
export function formatWindow(start: string, end?: string | null): string {
  if (!end || end === start) return formatDay(start, false);
  const [, startMonth] = start.split("-");
  const [, endMonth, endDay] = end.split("-");
  return startMonth === endMonth ? `${formatDay(start, false)}–${Number(endDay)}` : `${formatDay(start, false)}–${formatDay(end, false)}`;
}

/** The site-local day of an exact appointment. */
export function appointmentDay(appointment: Pick<SchedulableAppointment, "startAt">, timezone: string): string | null {
  return appointment.startAt ? siteDay(appointment.startAt, timezone) || null : null;
}

/** "Mon, Oct 26" style relative words for a window: this week, next week, or a range. */
export function windowRelativeLabel(start: string, end: string | null | undefined, timezone: string, now = new Date()): string {
  const today = siteDay(now, timezone);
  const monday = addDays(today, -weekdayIndex(today));
  const last = end || start;
  if (start >= monday && last <= addDays(monday, 6)) return "this week";
  if (start >= addDays(monday, 7) && last <= addDays(monday, 13)) return "next week";
  return formatWindow(start, end);
}

/** The one-line statement of when an appointment happens, or honestly that it is not yet known. */
export function appointmentTiming(appointment: SchedulableAppointment, timezone: string): { primary: string; secondary: string; exact: boolean } {
  if (appointment.scheduleMode === "exact" && appointment.startAt) {
    const day = appointmentDay(appointment, timezone);
    return { primary: day ? formatDay(day) : "", secondary: formatTimeRange(appointment.startAt, appointment.endAt, timezone), exact: true };
  }
  if (appointment.scheduleMode === "window" && isDay(appointment.windowStart)) {
    return { primary: `Target ${formatWindow(appointment.windowStart, appointment.windowEnd)}`, secondary: "Time to be set", exact: false };
  }
  return { primary: "Not scheduled", secondary: "Date to be set", exact: false };
}

/** One compact line: "Tue, Oct 27 · 10:15–10:35 AM", "Target Oct 26–30 · time to be set". */
export function appointmentLine(appointment: SchedulableAppointment, timezone: string): string {
  const { primary, secondary } = appointmentTiming(appointment, timezone);
  return `${primary} · ${secondary}`;
}

/** Quick target windows, Monday–Friday of the chosen week, never starting in the past. */
export function quickWindow(kind: "this-week" | "next-week", timezone: string, now = new Date()): { start: string; end: string } {
  const today = siteDay(now, timezone);
  const monday = addDays(today, -weekdayIndex(today));
  if (kind === "next-week") return { start: addDays(monday, 7), end: addDays(monday, 11) };
  const friday = addDays(monday, 4);
  return today > friday ? { start: today, end: addDays(monday, 6) } : { start: today > monday ? today : monday, end: friday };
}

export const isOpenAppointment = (appointment: Pick<SchedulableAppointment, "status">) => ["planned", "tentative", "confirmed"].includes(appointment.status);

/** Exact appointments grouped by site day, in time order; everything else needs scheduling. */
export function splitAppointments<T extends SchedulableAppointment>(appointments: T[], timezone: string): { days: Array<{ day: string; items: T[] }>; toSchedule: T[]; past: T[] } {
  const exact = appointments.filter((a) => a.scheduleMode === "exact" && a.startAt).sort((a, b) => a.startAt!.localeCompare(b.startAt!));
  const groups = new Map<string, T[]>();
  const past: T[] = [];
  for (const appointment of exact) {
    if (!isOpenAppointment(appointment)) { past.push(appointment); continue; }
    const day = appointmentDay(appointment, timezone)!;
    groups.set(day, [...(groups.get(day) || []), appointment]);
  }
  const toSchedule = appointments.filter((a) => a.scheduleMode !== "exact" && isOpenAppointment(a)).sort((a, b) => (a.windowStart || "9999").localeCompare(b.windowStart || "9999") || a.title.localeCompare(b.title));
  past.push(...appointments.filter((a) => a.scheduleMode !== "exact" && !isOpenAppointment(a)));
  return { days: Array.from(groups, ([day, items]) => ({ day, items })), toSchedule, past };
}

/**
 * Confirmed exact appointments within the next `days` site days, today included.
 * A target window is never returned: it has no date to put on a day list.
 */
export function upcomingConfirmed<T extends SchedulableAppointment>(appointments: T[], timezone: string, now = new Date(), days = 14): T[] {
  return appointments
    .filter((a) => a.status === "confirmed" && a.scheduleMode === "exact" && a.startAt)
    .filter((a) => {
      const distance = dayDistance(a.startAt, timezone, now);
      return distance >= 0 && distance <= days;
    })
    .sort((a, b) => a.startAt!.localeCompare(b.startAt!));
}

/**
 * Is an unscheduled appointment worth interrupting someone about yet?
 * Only a target window that is about to open, is open, or only just lapsed is.
 * A "someday" appointment with no window never nags.
 */
export function schedulingNeed(appointment: SchedulableAppointment, timezone: string, now = new Date()): { label: string; urgent: boolean } | null {
  if (!["planned", "tentative"].includes(appointment.status) || appointment.scheduleMode !== "window" || !isDay(appointment.windowStart)) return null;
  const today = siteDay(now, timezone);
  const end = isDay(appointment.windowEnd) ? appointment.windowEnd : appointment.windowStart;
  if (end < today) return addDays(end, 7) >= today ? { label: "Target window has passed", urgent: true } : null;
  if (appointment.windowStart > addDays(today, 7)) return null;
  const when = windowRelativeLabel(appointment.windowStart, appointment.windowEnd, timezone, now);
  return { label: `Needs scheduling for ${when}`, urgent: appointment.windowStart <= today && end <= addDays(today, 1) };
}
