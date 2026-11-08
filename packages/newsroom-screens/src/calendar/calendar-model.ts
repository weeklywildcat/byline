/**
 * Pure model behind the newsroom Calendar's schedule layer. CMS-independent:
 * each host supplies the schedule feed and the links an event opens.
 *
 * The calendar has two sources of events:
 *
 * - Story-derived dates from the Stories collection (`planningCalendarEvents`):
 *   deadline, planned publication, scheduled publication and published date.
 *   These stay four distinct events and are never merged.
 * - The protected schedule feed (`ScheduleResponse`): exact appointments,
 *   production deadlines and (optionally) task deadlines.
 *
 * Date rules follow `workspace/schedule-model.ts`: an exact appointment is a UTC
 * instant read in the newsroom timezone; a target window is date-only and is
 * NEVER given a day cell or a time. Windows go to the "Needs scheduling" list.
 */
import { siteDay } from "../home/newsroom-model";
import {
  addDays,
  appointmentDay,
  appointmentLine,
  formatTime,
  formatTimeRange,
  formatWindow,
  splitAppointments
} from "../workspace/schedule-model";
import type { ScheduleAppointment, ScheduleMediaDeadline, ScheduleResponse, ScheduleTaskDeadline } from "../workspace/workspace-types";
import type { CalendarEventType, PlanningCalendarEvent } from "../planning/planning-model";

/**
 * What the calendar shows. One state, whichever presentation (a contextual
 * sidebar, a temporary sheet) renders the controls.
 */
export type CalendarFilters = {
  appointments: boolean;
  /** Story deadlines. */
  deadlines: boolean;
  /** Production due dates. */
  production: boolean;
  /** Planned publication targets (a plan, not a schedule). */
  plannedPublication: boolean;
  /** Actual publication: scheduled and published dates. */
  publication: boolean;
  /** Task due dates. Off by default: they are loaded only when asked for. */
  tasks: boolean;
  /** Limit appointments, production and task due dates to the signed-in user. */
  mine: boolean;
};

export type CalendarCategoryFilter = Exclude<keyof CalendarFilters, "mine">;

export const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  appointments: true,
  deadlines: true,
  production: true,
  plannedPublication: true,
  publication: true,
  tasks: false,
  mine: false
};

/** The category toggles, in display order. */
export const CALENDAR_CATEGORY_FILTERS: ReadonlyArray<{ key: CalendarCategoryFilter; label: string; scheduleFeed: boolean }> = [
  { key: "appointments", label: "Appointments", scheduleFeed: true },
  { key: "deadlines", label: "Story deadlines", scheduleFeed: false },
  { key: "production", label: "Production", scheduleFeed: true },
  { key: "plannedPublication", label: "Planned publication", scheduleFeed: false },
  { key: "publication", label: "Publication", scheduleFeed: false },
  { key: "tasks", label: "Task due dates", scheduleFeed: true }
];

/**
 * Stored filters (a host preference, any age) as the current shape: known
 * boolean keys only, defaults for the rest. Never throws.
 */
export function normalizeCalendarFilters(value: unknown): CalendarFilters {
  const stored = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const next = { ...DEFAULT_CALENDAR_FILTERS };
  (Object.keys(next) as Array<keyof CalendarFilters>).forEach((key) => {
    if (typeof stored[key] === "boolean") next[key] = stored[key] as boolean;
  });
  return next;
}

/** Which filter toggle controls each event type. */
export const CALENDAR_EVENT_CATEGORY: Record<CalendarEventType, CalendarCategoryFilter> = {
  deadline: "deadlines",
  planned: "plannedPublication",
  scheduled: "publication",
  published: "publication",
  appointment: "appointments",
  media: "production",
  task: "tasks"
};

export const CALENDAR_EVENT_LABELS: Record<CalendarEventType, string> = {
  appointment: "Appointment",
  deadline: "Deadline",
  media: "Production due",
  task: "Task due",
  planned: "Planned publication",
  scheduled: "Scheduled publication",
  published: "Published"
};

/** Order inside the legend and, for all-day events, inside a day cell. */
export const CALENDAR_EVENT_ORDER: CalendarEventType[] = ["deadline", "media", "task", "planned", "scheduled", "published", "appointment"];

/** Types whose "My schedule" filter is the assignee. Story-derived dates are unaffected. */
const ASSIGNED_TYPES: CalendarEventType[] = ["appointment", "media", "task"];

/**
 * Where calendar items lead. Each host builds its own addresses.
 * - `story`: the story's own screen; with an appointment id it opens that
 *   appointment so an exact time can be set.
 * - `collection`: a shared coverage interview, for hosts that have them.
 *   Without it such an item links to its story.
 */
export type CalendarLinks = {
  story: (storyId: number, appointmentId?: string) => string;
  collection?: (collectionId: number, interviewId?: number) => string;
};

function appointmentHref(appointment: ScheduleAppointment, links: CalendarLinks): string {
  if (appointment.collectionId && links.collection) return links.collection(appointment.collectionId, appointment.interviewId);
  return links.story(appointment.storyId, appointment.id);
}

// --- Fetch window ----------------------------------------------------------

export type ScheduleRange = { from: string; to: string };
export type LoadedSchedule = ScheduleRange & { includeTasks: boolean };

/** The feed range for the visible days, padded by a week either side. */
export function scheduleRangeFor(days: ReadonlyArray<{ key: string }>, padDays = 7): ScheduleRange | null {
  if (!days.length) return null;
  return { from: addDays(days[0].key, -padDays), to: addDays(days[days.length - 1].key, padDays) };
}

/** Does the loaded feed already cover everything visible (and tasks, when asked for)? */
export function scheduleCoversVisible(loaded: LoadedSchedule | null, days: ReadonlyArray<{ key: string }>, includeTasks: boolean): boolean {
  if (!loaded || !days.length) return false;
  if (includeTasks && !loaded.includeTasks) return false;
  return loaded.from <= days[0].key && loaded.to >= days[days.length - 1].key;
}

// --- Events ------------------------------------------------------------------

const nameList = (people: Array<{ name: string }> | null | undefined) => (people || []).map((person) => person.name).filter(Boolean);

function tooltip(lines: Array<string | null | false | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function appointmentEvent(appointment: ScheduleAppointment, timezone: string, links: CalendarLinks): PlanningCalendarEvent | null {
  if (appointment.status === "cancelled" || appointment.scheduleMode !== "exact" || !appointment.startAt) return null;
  const date = appointmentDay(appointment, timezone);
  if (!date) return null;
  const names = nameList(appointment.assignees);
  const timeRange = formatTimeRange(appointment.startAt, appointment.endAt, timezone);
  return {
    id: `appointment-${appointment.id}`,
    timing: { kind: "timed", start: appointment.startAt, end: appointment.endAt },
    storyId: appointment.storyId,
    storyTitle: appointment.storyTitle,
    storyUrl: appointment.collectionId && links.collection ? links.collection(appointment.collectionId) : links.story(appointment.storyId),
    type: "appointment",
    recordId: appointment.id,
    date,
    exactDate: appointmentLine(appointment, timezone),
    label: CALENDAR_EVENT_LABELS.appointment,
    title: appointment.title,
    timeLabel: formatTime(appointment.startAt, timezone),
    sortTime: appointment.startAt,
    tooltip: tooltip([
      `${timeRange} · ${appointment.title}${appointment.status === "completed" ? " (completed)" : appointment.status === "tentative" ? " (tentative)" : ""}`,
      appointment.storyTitle && `Story: ${appointment.storyTitle}`,
      names.length ? `With: ${names.join(", ")}` : "Unassigned",
      appointment.sourceLabel && `Source: ${appointment.sourceLabel}`,
      appointment.location && `Location: ${appointment.location}`
    ]),
    assigneeIds: (appointment.assignees || []).map((person) => person.id),
    assigneeNames: names,
    href: appointmentHref(appointment, links),
    completed: appointment.status === "completed"
  };
}

function mediaEvent(item: ScheduleMediaDeadline, timezone: string, links: CalendarLinks): PlanningCalendarEvent | null {
  const date = siteDay(item.dueAt, timezone);
  if (!date) return null;
  return {
    id: `media-${item.storyId}-${item.id}`,
    // Production due dates are picked as days; the stored time is a placeholder, so this stays a date.
    timing: { kind: "date", date },
    storyId: item.storyId,
    storyTitle: item.storyTitle,
    storyUrl: links.story(item.storyId),
    type: "media",
    recordId: item.id,
    date,
    exactDate: date,
    label: CALENDAR_EVENT_LABELS.media,
    title: `${item.title || "Production"} due`,
    tooltip: tooltip([
      `${item.title || "Production"} due`,
      item.storyTitle && `Story: ${item.storyTitle}`,
      item.assignee ? `Assigned to: ${item.assignee.name}` : "Unassigned",
      `Status: ${item.status}`
    ]),
    assigneeIds: item.assignee ? [item.assignee.id] : [],
    assigneeNames: item.assignee ? [item.assignee.name] : [],
    href: links.story(item.storyId)
  };
}

function taskEvent(item: ScheduleTaskDeadline, timezone: string, links: CalendarLinks): PlanningCalendarEvent | null {
  const date = siteDay(item.dueAt, timezone);
  if (!date) return null;
  return {
    id: `task-${item.id}`,
    timing: { kind: "date", date },
    storyId: item.storyId ?? 0,
    storyTitle: item.storyTitle,
    storyUrl: item.storyId ? links.story(item.storyId) : "",
    type: "task",
    date,
    exactDate: date,
    label: CALENDAR_EVENT_LABELS.task,
    title: item.title,
    tooltip: tooltip([
      `Task due: ${item.title}`,
      item.storyTitle && `Story: ${item.storyTitle}`,
      item.assignee ? `Assigned to: ${item.assignee.name}` : "Unassigned"
    ]),
    assigneeIds: item.assignee ? [item.assignee.id] : [],
    assigneeNames: item.assignee ? [item.assignee.name] : [],
    href: item.storyId ? links.story(item.storyId) : item.collectionId && links.collection ? links.collection(item.collectionId) : undefined
  };
}

/**
 * Events from the schedule feed: exact appointments (on their site-local day,
 * with a time), production deadlines and task deadlines. `needsScheduling` is
 * deliberately NOT read here: a target window has no day to sit on.
 */
export function scheduleCalendarEvents(schedule: ScheduleResponse | null | undefined, links: CalendarLinks, timezone?: string): PlanningCalendarEvent[] {
  if (!schedule) return [];
  const zone = timezone || schedule.timezone;
  const events: PlanningCalendarEvent[] = [];
  (schedule.appointments || []).forEach((item) => {
    const event = appointmentEvent(item, zone, links);
    if (event) events.push(event);
  });
  (schedule.mediaDeadlines || []).forEach((item) => {
    const event = mediaEvent(item, zone, links);
    if (event) events.push(event);
  });
  (schedule.taskDeadlines || []).forEach((item) => {
    const event = taskEvent(item, zone, links);
    if (event) events.push(event);
  });
  return events;
}

/** Day, then all-day events (by type, then title), then timed events by time. */
export function compareCalendarEvents(left: PlanningCalendarEvent, right: PlanningCalendarEvent): number {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  const leftTimed = Boolean(left.sortTime);
  const rightTimed = Boolean(right.sortTime);
  if (leftTimed !== rightTimed) return leftTimed ? 1 : -1;
  if (leftTimed && left.sortTime !== right.sortTime) return (left.sortTime as string).localeCompare(right.sortTime as string);
  const byType = CALENDAR_EVENT_ORDER.indexOf(left.type) - CALENDAR_EVENT_ORDER.indexOf(right.type);
  if (byType) return byType;
  return (left.title || left.storyTitle).localeCompare(right.title || right.storyTitle) || left.id.localeCompare(right.id);
}

/**
 * Apply the toggle row. "My schedule" only narrows events that have an
 * assignee (appointments, production and tasks); a story deadline or
 * publication date belongs to the story, not to a person.
 */
export function filterCalendarEvents(events: PlanningCalendarEvent[], filters: CalendarFilters, currentUserId?: number | null): PlanningCalendarEvent[] {
  return events.filter((event) => {
    if (!filters[CALENDAR_EVENT_CATEGORY[event.type]]) return false;
    if (filters.mine && ASSIGNED_TYPES.includes(event.type)) return Boolean(currentUserId) && (event.assigneeIds || []).includes(currentUserId as number);
    return true;
  });
}

/** The visible, ordered events for the grid: story dates plus the schedule feed. */
export function mergeCalendarEvents(storyEvents: PlanningCalendarEvent[], scheduleEvents: PlanningCalendarEvent[], filters: CalendarFilters, currentUserId?: number | null): PlanningCalendarEvent[] {
  return filterCalendarEvents([...storyEvents, ...scheduleEvents], filters, currentUserId).sort(compareCalendarEvents);
}

// --- Needs scheduling --------------------------------------------------------

export type NeedsSchedulingItem = {
  id: string;
  title: string;
  storyId: number;
  storyTitle: string;
  assigneeNames: string[];
  /** "Target: Oct 26–30" or "No target date". Never a time. */
  target: string;
  hasTarget: boolean;
  href: string;
};

/**
 * Open appointments that still need an exact date and time. They are shown
 * beside the calendar, never inside a day cell, and carry no fake time. Each
 * links to its story with the appointment open for scheduling.
 */
export function needsSchedulingItems(
  schedule: ScheduleResponse | null | undefined,
  links: CalendarLinks,
  options: { mine?: boolean; currentUserId?: number | null } = {}
): NeedsSchedulingItem[] {
  if (!schedule) return [];
  const { toSchedule } = splitAppointments(schedule.needsScheduling || [], schedule.timezone);
  return toSchedule
    .filter((appointment) => !options.mine || (Boolean(options.currentUserId) && (appointment.assignees || []).some((person) => person.id === options.currentUserId)))
    .map((appointment) => {
      const hasTarget = appointment.scheduleMode === "window" && /^\d{4}-\d{2}-\d{2}$/.test(appointment.windowStart || "");
      return {
        id: appointment.id,
        title: appointment.title,
        storyId: appointment.storyId,
        storyTitle: appointment.storyTitle,
        assigneeNames: nameList(appointment.assignees),
        target: hasTarget ? `Target: ${formatWindow(appointment.windowStart as string, appointment.windowEnd)}` : "No target date",
        hasTarget,
        href: appointmentHref(appointment, links)
      };
    });
}
