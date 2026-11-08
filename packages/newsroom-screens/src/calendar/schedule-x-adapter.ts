/**
 * The one place Byline calendar events become Schedule-X events.
 *
 * Byline's schedule models (`calendar-model`, `planning-model`) stay canonical;
 * Schedule-X only presents them. Nothing here is ever written back: dates change
 * through the story, appointment, production and publishing records they belong
 * to. Byline's own drag (`calendar-drag`) saves through those records; Schedule-X's
 * premium drag-and-drop is not used, so its `_options` stay off.
 *
 * Date rules (see `workspace/schedule-model`):
 * - A `date` event is a newsroom-local calendar day -> `Temporal.PlainDate`.
 * - A `timed` event is a real timestamp -> `Temporal.ZonedDateTime` in the
 *   NEWSROOM timezone, never the browser's. A naive `YYYY-MM-DDTHH:mm`
 *   value is already newsroom-local; a value with `Z` or an offset is an instant.
 * - A fuzzy appointment window has no day and is never an event. It lives in
 *   "Needs scheduling" (`needsSchedulingItems`), and nothing here can produce it.
 */
import "temporal-polyfill/global";
import { decodeEntities } from "@byline/newsroom-ui/lib/text";
import type { CalendarEvent, CalendarType } from "@schedule-x/calendar";
import type { CalendarEventType, PlanningCalendarEvent } from "../planning/planning-model";
import type { CalendarCategoryFilter } from "./calendar-model";

/** Schedule-X "calendars": a small, stable set. Never one per story. */
export const SCHEDULE_X_CATEGORIES = ["appointment", "story-deadline", "production", "planned-publication", "publication", "task-deadline"] as const;
export type ScheduleXCategory = (typeof SCHEDULE_X_CATEGORIES)[number];

export const CATEGORY_BY_EVENT_TYPE: Record<CalendarEventType, ScheduleXCategory> = {
  appointment: "appointment",
  deadline: "story-deadline",
  media: "production",
  task: "task-deadline",
  planned: "planned-publication",
  scheduled: "publication",
  published: "publication"
};

export const CATEGORY_LABELS: Record<ScheduleXCategory, string> = {
  appointment: "Appointment",
  "story-deadline": "Story deadline",
  production: "Production",
  "planned-publication": "Planned publication",
  publication: "Publication",
  "task-deadline": "Task due"
};

/** The category each filter toggle shows, so a control can carry its events' colour. */
export const FILTER_CATEGORY: Record<CalendarCategoryFilter, ScheduleXCategory> = {
  appointments: "appointment",
  deadlines: "story-deadline",
  production: "production",
  plannedPublication: "planned-publication",
  publication: "publication",
  tasks: "task-deadline"
};

/** Colour is never the only signal: renderers also show a label and icon. These feed Schedule-X's own per-calendar tokens. */
const palette = (main: string, container: string, onContainer: string): CalendarType => ({
  colorName: "", lightColors: { main, container, onContainer }, darkColors: { main, container, onContainer }
});

export const SCHEDULE_X_CALENDARS: Record<ScheduleXCategory, CalendarType> = {
  appointment: { ...palette("#0369a1", "#e0f2fe", "#082f49"), colorName: "appointment", label: CATEGORY_LABELS.appointment },
  "story-deadline": { ...palette("#a16207", "#fef3c7", "#451a03"), colorName: "story-deadline", label: CATEGORY_LABELS["story-deadline"] },
  production: { ...palette("#6d28d9", "#ede9fe", "#2e1065"), colorName: "production", label: CATEGORY_LABELS.production },
  "planned-publication": { ...palette("#047857", "#d1fae5", "#022c22"), colorName: "planned-publication", label: CATEGORY_LABELS["planned-publication"] },
  publication: { ...palette("#475569", "#e2e8f0", "#0f172a"), colorName: "publication", label: CATEGORY_LABELS.publication },
  "task-deadline": { ...palette("#52525b", "#f4f4f5", "#18181b"), colorName: "task-deadline", label: CATEGORY_LABELS["task-deadline"] }
};

/** A point in time (a scheduled publication, a planned time) has no duration; give it a short, honest block. */
export const POINT_EVENT_MINUTES = 30;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/**
 * A timestamp read in the newsroom timezone. Naive values are newsroom-local
 * wall time (an hour skipped by daylight saving moves forward);
 * anything with `Z` or an offset is an instant shown in newsroom time.
 */
export function parseSiteTimestamp(value: string, timezone: string): Temporal.ZonedDateTime | null {
  try {
    if (DAY.test(value)) return null;
    if (NAIVE.test(value)) return Temporal.PlainDateTime.from(value.replace(" ", "T")).toZonedDateTime(timezone);
    return Temporal.Instant.from(value).toZonedDateTimeISO(timezone);
  } catch {
    return null;
  }
}

/** The Schedule-X start and end for an event, or null when the value cannot be read. */
export function scheduleXTimes(event: Pick<PlanningCalendarEvent, "timing">, timezone: string): { start: Temporal.ZonedDateTime | Temporal.PlainDate; end: Temporal.ZonedDateTime | Temporal.PlainDate } | null {
  const timing = event.timing;
  if (timing.kind === "date") {
    if (!DAY.test(timing.date)) return null;
    const day = Temporal.PlainDate.from(timing.date);
    return { start: day, end: day };
  }
  const start = parseSiteTimestamp(timing.start, timezone);
  if (!start) return null;
  const parsedEnd = timing.end ? parseSiteTimestamp(timing.end, timezone) : null;
  const end = parsedEnd && Temporal.ZonedDateTime.compare(parsedEnd, start) > 0 ? parsedEnd : start.add({ minutes: POINT_EVENT_MINUTES });
  return { start, end };
}

/** What the custom renderers need beyond Schedule-X's own fields. All plain data. */
export type BylineEventData = {
  bylineType: CalendarEventType;
  /** The Byline event's id, for finding it again when it is dropped on a day. */
  bylineId: string;
  storyId: number;
  /** The appointment or production item's own id, for events saved through it. */
  recordId?: string;
  storyTitle: string;
  /** Short label for the kind of date: "Deadline", "Production due"... */
  typeLabel: string;
  /** The appointment or production item on its story, when the event has one. */
  editHref: string | null;
  timed: boolean;
  completed: boolean;
  assignees: string[];
  tooltip: string;
};

export type BylineScheduleXEvent = CalendarEvent & BylineEventData;

/** One Byline event as a Schedule-X event, or null when its date cannot be read. */
export function toScheduleXEvent(event: PlanningCalendarEvent, timezone: string): BylineScheduleXEvent | null {
  const times = scheduleXTimes(event, timezone);
  if (!times) return null;
  return {
    id: event.id,
    start: times.start,
    end: times.end,
    title: decodeEntities(event.title || event.storyTitle),
    calendarId: CATEGORY_BY_EVENT_TYPE[event.type],
    // Schedule-X's own dragging stays off: Byline moves events by whole days itself (`calendar-drag`), through their records.
    _options: { disableDND: true, disableResize: true },
    bylineType: event.type,
    bylineId: event.id,
    storyId: event.storyId,
    recordId: event.recordId,
    storyTitle: decodeEntities(event.storyTitle),
    typeLabel: event.label,
    editHref: event.href || null,
    timed: event.timing.kind === "timed",
    completed: Boolean(event.completed),
    assignees: event.assigneeNames || [],
    tooltip: decodeEntities(event.tooltip) || `${event.label}: ${decodeEntities(event.title || event.storyTitle)}`
  };
}

export function toScheduleXEvents(events: PlanningCalendarEvent[], timezone: string): BylineScheduleXEvent[] {
  return events.flatMap((event) => {
    const converted = toScheduleXEvent(event, timezone);
    return converted ? [converted] : [];
  });
}

/** The newsroom-day range Schedule-X is showing, as the `YYYY-MM-DD` pair the schedule feed takes. */
export function visibleRangeDays(range: { start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime }): { from: string; to: string } {
  return { from: range.start.toPlainDate().toString(), to: range.end.toPlainDate().toString() };
}
