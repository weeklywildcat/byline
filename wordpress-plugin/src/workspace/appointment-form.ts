/**
 * Appointment form <-> API mapping.
 *
 * Timing is one of three mutually exclusive modes. The form keeps only the
 * fields of the active mode, so a stale value from another mode can never be
 * sent. Exact times are exchanged as site-local wall time (`YYYY-MM-DDTHH:mm`,
 * no offset): the server reads them in the WordPress site timezone, and the
 * form reads stored instants back in the same timezone. The browser's own
 * timezone never takes part.
 */
import { quickWindow } from "./schedule-model";
import type { AppointmentInput, AppointmentKind, AppointmentStatus, ScheduleMode, StoryAppointment } from "./workspace-types";

export type AppointmentForm = {
  title: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  sourceId: string;
  assigneeIds: number[];
  location: string;
  notes: string;
  mode: ScheduleMode;
  windowStart: string;
  windowEnd: string;
  date: string;
  startTime: string;
  /** Only differs from `date` for an appointment that ends after midnight. */
  endDate: string;
  endTime: string;
};

export type AppointmentFormErrors = Partial<Record<"title" | "windowStart" | "windowEnd" | "date" | "startTime" | "endTime" | "assignees" | "notes", string>>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
export const isDayValue = (value: string) => DAY.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
export const isTimeValue = (value: string) => TIME.test(value) && Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60;

/** A local `Date` (what react-day-picker hands back) as `YYYY-MM-DD`, never via UTC. */
export function dayFromLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` as a local noon `Date`, safe from any DST edge. */
export function localDateFromDay(day: string): Date | undefined {
  if (!isDayValue(day)) return undefined;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12, 0, 0, 0);
}

/** The calendar day and clock time of an instant in the site timezone. */
export function siteWallParts(instant: string | null | undefined, timezone: string): { date: string; time: string } | null {
  if (!instant) return null;
  const when = new Date(instant);
  if (Number.isNaN(when.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(when);
  const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const hour = part("hour") === "24" ? "00" : part("hour");
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${hour}:${part("minute")}` };
}

export const emptyAppointmentForm = (patch: Partial<AppointmentForm> = {}): AppointmentForm => ({
  title: "",
  kind: "interview",
  status: "planned",
  sourceId: "",
  assigneeIds: [],
  location: "",
  notes: "",
  mode: "unscheduled",
  windowStart: "",
  windowEnd: "",
  date: "",
  startTime: "",
  endDate: "",
  endTime: "",
  ...patch
});

export function appointmentToForm(appointment: StoryAppointment, timezone: string): AppointmentForm {
  const base = emptyAppointmentForm({
    title: appointment.title,
    kind: appointment.kind,
    status: appointment.status,
    sourceId: appointment.sourceId || "",
    assigneeIds: [...appointment.assigneeIds],
    location: appointment.location,
    notes: appointment.notes,
    mode: appointment.scheduleMode
  });
  if (appointment.scheduleMode === "window") return { ...base, windowStart: appointment.windowStart || "", windowEnd: appointment.windowEnd || "" };
  if (appointment.scheduleMode === "exact") {
    const start = siteWallParts(appointment.startAt, timezone);
    const end = siteWallParts(appointment.endAt, timezone);
    return { ...base, date: start?.date || "", startTime: start?.time || "", endDate: end?.date || start?.date || "", endTime: end?.time || "" };
  }
  return base;
}

/** Choose a schedule mode. The other modes' fields are cleared, not hidden. */
export function setScheduleMode(form: AppointmentForm, mode: ScheduleMode): AppointmentForm {
  if (form.mode === mode) return form;
  return { ...form, mode, windowStart: "", windowEnd: "", date: "", startTime: "", endDate: "", endTime: "" };
}

/** Moving the day moves an end that was on the same day with it. */
export function setExactDate(form: AppointmentForm, date: string): AppointmentForm {
  return { ...form, date, endDate: !form.endDate || form.endDate === form.date ? date : form.endDate };
}

export function applyQuickWindow(form: AppointmentForm, kind: "this-week" | "next-week", timezone: string, now = new Date()): AppointmentForm {
  const range = quickWindow(kind, timezone, now);
  return { ...form, mode: "window", windowStart: range.start, windowEnd: range.end, date: "", startTime: "", endDate: "", endTime: "" };
}

export function validateAppointmentForm(form: AppointmentForm, maxAssignees = 4): AppointmentFormErrors {
  const errors: AppointmentFormErrors = {};
  if (!form.title.trim()) errors.title = "Add a title, like “Interview Mrs. Hamby”.";
  else if (form.title.trim().length > 160) errors.title = "Keep the title under 160 characters.";
  if (form.notes.length > 2000) errors.notes = "Notes can be up to 2000 characters.";
  if (form.assigneeIds.length > maxAssignees) errors.assignees = `Choose up to ${maxAssignees} people.`;

  if (form.mode === "window") {
    if (!isDayValue(form.windowStart)) errors.windowStart = "Choose the first day of the target dates.";
    else if (form.windowEnd && !isDayValue(form.windowEnd)) errors.windowEnd = "Choose a valid last day.";
    else if (form.windowEnd && form.windowEnd < form.windowStart) errors.windowEnd = "The last day can't be before the first day.";
  } else if (form.mode === "exact") {
    if (!isDayValue(form.date)) errors.date = "Choose a date.";
    if (!isTimeValue(form.startTime)) errors.startTime = "Choose a start time.";
    if (form.endTime) {
      if (!isTimeValue(form.endTime)) errors.endTime = "Choose a valid end time.";
      else if (!errors.date && !errors.startTime && `${form.endDate || form.date}T${form.endTime}` < `${form.date}T${form.startTime}`) errors.endTime = "The end can't be before the start.";
    }
  }
  return errors;
}

/** True when no field of `errors` is set. */
export const isValid = (errors: object) => Object.values(errors).every((value) => !value);

type Timing = Pick<AppointmentInput, "scheduleMode" | "windowStart" | "windowEnd" | "startAt" | "endAt">;

/** The timing fields for the active mode and nothing from any other mode. */
export function timingInput(form: AppointmentForm): Timing {
  if (form.mode === "window") return { scheduleMode: "window", windowStart: form.windowStart, windowEnd: form.windowEnd || null, startAt: null, endAt: null };
  if (form.mode === "exact") {
    return {
      scheduleMode: "exact",
      windowStart: null,
      windowEnd: null,
      startAt: `${form.date}T${form.startTime}`,
      endAt: form.endTime ? `${form.endDate || form.date}T${form.endTime}` : null
    };
  }
  return { scheduleMode: "unscheduled", windowStart: null, windowEnd: null, startAt: null, endAt: null };
}

const timingKey = (form: AppointmentForm) => JSON.stringify(timingInput(form));

/**
 * The request body. For an existing appointment whose timing was not touched,
 * the timing is omitted so a stored instant is never re-read through a wall
 * clock (an hour that happens twice at a DST change would otherwise drift).
 */
export function appointmentFormToInput(form: AppointmentForm, original?: StoryAppointment, timezone = "UTC"): AppointmentInput {
  const input: AppointmentInput = {
    title: form.title.trim(),
    kind: form.kind,
    status: form.status,
    sourceId: form.sourceId || null,
    assigneeIds: form.assigneeIds,
    location: form.location.trim(),
    notes: form.notes
  };
  if (!original) return { ...input, ...timingInput(form) };
  const untouched = timingKey(form) === timingKey(appointmentToForm(original, timezone));
  return { ...input, ...(untouched ? {} : timingInput(form)), expectedUpdatedAt: original.updatedAt };
}
