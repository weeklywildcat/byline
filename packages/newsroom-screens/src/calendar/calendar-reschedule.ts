/**
 * What dropping a calendar event on another day means, as pure data.
 *
 * Dragging moves an event by whole days. A date stays a date, a time of day
 * stays the same time of day (read in the NEWSROOM timezone, never the
 * browser's), and a duration stays the same length. Nothing here talks to a
 * host: `rescheduleChange` produces the typed change a host saves through the
 * record the date belongs to, and `moveEvent` the same event on its new day so
 * the calendar can show the move while the save is in flight.
 *
 * Only some events move. Published dates are history, and task due dates were
 * deliberately left out; neither has a kind here.
 */
import "temporal-polyfill/global";
import type { CalendarEventType, PlanningCalendarEvent } from "../planning/planning-model";
import { parseSiteTimestamp } from "./schedule-x-adapter";

/** The events a reader can drag, each saved through the record it belongs to. */
export const RESCHEDULE_KINDS = ["deadline", "planned", "scheduled", "appointment", "media"] as const;
export type RescheduleKind = (typeof RESCHEDULE_KINDS)[number];

const KIND_BY_EVENT_TYPE: Partial<Record<CalendarEventType, RescheduleKind>> = {
  deadline: "deadline",
  planned: "planned",
  scheduled: "scheduled",
  appointment: "appointment",
  media: "media"
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The placeholder time stored when only a day was chosen (see `isPlannedDayOnly`). */
const DAY_ONLY_TIME = "12:00";

/** The kind of move an event allows, or null when it cannot be dragged. */
export function rescheduleKindOf(event: Pick<PlanningCalendarEvent, "type" | "storyId" | "recordId">): RescheduleKind | null {
  const kind = KIND_BY_EVENT_TYPE[event.type] ?? null;
  if (!kind || !(event.storyId > 0)) return null;
  // An appointment or production item is saved by its own id.
  if ((kind === "appointment" || kind === "media") && !event.recordId) return null;
  return kind;
}

/** A newsroom-local `YYYY-MM-DDTHH:mm` value, the form every host write takes. */
export type LocalDateTime = string;

export type RescheduleChange =
  | { kind: "deadline"; storyId: number; deadline: string }
  | { kind: "planned"; storyId: number; plannedPublication: LocalDateTime }
  | {
      kind: "scheduled";
      storyId: number;
      /** The new publish time. */
      at: LocalDateTime;
      /** The publish time being replaced (an instant), so a changed schedule is a conflict, not an overwrite. */
      expected: string;
    }
  | { kind: "appointment"; storyId: number; appointmentId: string; startAt: LocalDateTime; endAt: LocalDateTime | null }
  | { kind: "media"; storyId: number; assignmentId: string; dueAt: LocalDateTime };

const pad = (value: number) => String(value).padStart(2, "0");

/** `Temporal` wall time as the host's local string. */
function local(value: Temporal.PlainDateTime): LocalDateTime {
  return `${value.toPlainDate().toString()}T${pad(value.hour)}:${pad(value.minute)}`;
}

/** The same wall-clock time on `toDay`. */
function onDay(value: Temporal.ZonedDateTime, fromDay: string, toDay: string): Temporal.PlainDateTime {
  const days = Temporal.PlainDate.from(fromDay).until(Temporal.PlainDate.from(toDay), { largestUnit: "days" }).days;
  return value.toPlainDateTime().add({ days });
}

/** Whole days between two newsroom days. */
export function daysBetween(fromDay: string, toDay: string): number {
  return Temporal.PlainDate.from(fromDay).until(Temporal.PlainDate.from(toDay), { largestUnit: "days" }).days;
}

/** The newsroom day a timed event's start is on. */
function startDay(start: Temporal.ZonedDateTime): string {
  return start.toPlainDate().toString();
}

/**
 * The save that drops `event` on `toDay`, or null when it cannot move there
 * (not draggable, already on that day, unreadable date).
 */
export function rescheduleChange(event: PlanningCalendarEvent, toDay: string, timezone: string): RescheduleChange | null {
  const kind = rescheduleKindOf(event);
  if (!kind || !DAY.test(toDay) || toDay === event.date) return null;

  if (kind === "deadline") return { kind, storyId: event.storyId, deadline: toDay };
  if (kind === "media") return { kind, storyId: event.storyId, assignmentId: event.recordId as string, dueAt: `${toDay}T${DAY_ONLY_TIME}` };

  if (event.timing.kind === "date") {
    // A planned publication that is only a day stays only a day.
    return kind === "planned" ? { kind, storyId: event.storyId, plannedPublication: `${toDay}T${DAY_ONLY_TIME}` } : null;
  }

  const start = parseSiteTimestamp(event.timing.start, timezone);
  if (!start) return null;
  const moved = onDay(start, startDay(start), toDay);

  if (kind === "planned") return { kind, storyId: event.storyId, plannedPublication: local(moved) };
  if (kind === "scheduled") {
    const expected = new Date(event.timing.start);
    if (Number.isNaN(expected.getTime())) return null;
    return { kind, storyId: event.storyId, at: local(moved), expected: expected.toISOString() };
  }

  const end = event.timing.end ? parseSiteTimestamp(event.timing.end, timezone) : null;
  return {
    kind,
    storyId: event.storyId,
    appointmentId: event.recordId as string,
    startAt: local(moved),
    endAt: end ? local(onDay(end, startDay(start), toDay)) : null
  };
}

/** The event as it will be once saved: the same event, on its new day. Null when it cannot move there. */
export function moveEvent(event: PlanningCalendarEvent, toDay: string, timezone: string): PlanningCalendarEvent | null {
  const change = rescheduleChange(event, toDay, timezone);
  if (!change) return null;
  if (event.timing.kind === "date") return { ...event, date: toDay, exactDate: toDay, timing: { kind: "date", date: toDay } };
  const start = parseSiteTimestamp(event.timing.start, timezone);
  if (!start) return null;
  const end = event.timing.end ? parseSiteTimestamp(event.timing.end, timezone) : null;
  const shift = (value: Temporal.ZonedDateTime) => onDay(value, startDay(start), toDay).toZonedDateTime(timezone).toInstant().toString();
  const nextStart = shift(start);
  return {
    ...event,
    date: toDay,
    timing: { kind: "timed", start: nextStart, end: end ? shift(end) : null },
    sortTime: event.sortTime ? nextStart : event.sortTime
  };
}

/** The kind a reader needs permission for. Hosts decide who may; the server always has the final word. */
export type RescheduleHost = {
  /** May the signed-in reader move this kind of event? Controls whether it can be picked up at all. */
  can: (kind: RescheduleKind) => boolean;
  /** Save the change through the record it belongs to. Rejects with the server's message. */
  apply: (change: RescheduleChange) => Promise<unknown>;
};

/** A short, honest sentence for a move: "Deadline for Cafeteria changes: Nov 17 to Nov 20". */
export function describeReschedule(event: Pick<PlanningCalendarEvent, "label" | "storyTitle" | "title">, fromDay: string, toDay: string, locale?: string): string {
  const format = (day: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  const subject = event.title && event.title !== event.storyTitle ? event.title : event.storyTitle;
  return `${event.label}${subject ? ` for ${subject}` : ""}: ${format(fromDay)} to ${format(toDay)}`;
}
