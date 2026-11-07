/**
 * Presentation-free reporting helpers: vocabulary, source rows and their
 * one-line timing, and the source form. Appointment form logic lives in
 * `appointment-form.ts` because its date handling deserves its own tests.
 */
import { formatDay, formatTime, formatWindow, isOpenAppointment, weekdayIndex, addDays, appointmentDay } from "./schedule-model";
import type { AppointmentKind, AppointmentStatus, MediaAssignmentStatus, MediaAssignmentType, ResourcePurpose, SourceInput, SourceStatus, StoryAppointment, StorySource } from "./workspace-types";

export const MAX_ASSIGNEES = 4;
export const SOURCE_NOTES_MAX = 2000;
export const APPOINTMENT_NOTES_MAX = 2000;
export const BRIEF_MAX = 4000;

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  planned: "Planned",
  contacted: "Contacted",
  waiting: "Waiting",
  "needs-scheduling": "Needs scheduling",
  scheduled: "Scheduled",
  interviewed: "Interviewed",
  declined: "Declined",
  unavailable: "Unavailable"
};

export const APPOINTMENT_KIND_LABELS: Record<AppointmentKind, string> = {
  interview: "Interview",
  meeting: "Meeting",
  event: "Event",
  photo: "Photo",
  "press-conference": "Press conference",
  game: "Game",
  performance: "Performance",
  reporting: "Reporting",
  other: "Other"
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  planned: "Planned",
  tentative: "Tentative",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled"
};

export const MEDIA_TYPE_LABELS: Record<MediaAssignmentType, string> = {
  photo: "Photo",
  gallery: "Gallery",
  graphic: "Graphic",
  video: "Video",
  audio: "Audio",
  other: "Other"
};

export const MEDIA_STATUS_LABELS: Record<MediaAssignmentStatus, string> = {
  needed: "Needed",
  assigned: "Assigned",
  "in-progress": "In progress",
  uploaded: "Uploaded",
  selected: "Selected",
  done: "Done"
};

export const RESOURCE_PURPOSE_LABELS: Record<ResourcePurpose, string> = {
  draft: "Draft",
  "interview-notes": "Interview notes",
  transcript: "Transcript",
  research: "Research",
  data: "Data",
  folder: "Folder",
  other: "Other"
};

/** Label for a stored value that may have been added by a newer server. */
export function labelFor<T extends string>(labels: Record<T, string>, value: string): string {
  return (labels as Record<string, string>)[value] ?? value.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * "Week of Oct 26" for a Monday–Friday (or Monday–Sunday) week, otherwise
 * "Target Oct 26–30". Never a time of day.
 */
export function windowSummary(start: string, end?: string | null): string {
  const last = end || start;
  if (weekdayIndex(start) === 0 && last !== start && (last === addDays(start, 4) || last === addDays(start, 6))) return `Week of ${formatDay(start, false)}`;
  return `Target ${formatWindow(start, end)}`;
}

const sortKey = (appointment: StoryAppointment, timezone: string): string => {
  if (appointment.scheduleMode === "exact" && appointment.startAt) return `${appointmentDay(appointment, timezone) || "9999"}0${appointment.startAt}`;
  if (appointment.scheduleMode === "window" && appointment.windowStart) return `${appointment.windowStart}1`;
  return "99999";
};

/** The earliest open appointment linked to a source. */
export function sourceNextAppointment(source: Pick<StorySource, "id">, appointments: StoryAppointment[], timezone: string): StoryAppointment | null {
  const linked = appointments.filter((appointment) => appointment.sourceId === source.id && isOpenAppointment(appointment));
  if (!linked.length) return null;
  return [...linked].sort((a, b) => sortKey(a, timezone).localeCompare(sortKey(b, timezone)))[0];
}

/** One-line timing for a source row, or "" when nothing is linked. */
export function sourceTimingLine(source: Pick<StorySource, "id">, appointments: StoryAppointment[], timezone: string): string {
  const next = sourceNextAppointment(source, appointments, timezone);
  if (!next) return "";
  if (next.scheduleMode === "exact" && next.startAt) {
    const day = appointmentDay(next, timezone);
    return `${day ? formatDay(day) : ""} · ${formatTime(next.startAt, timezone)}`;
  }
  if (next.scheduleMode === "window" && next.windowStart) return windowSummary(next.windowStart, next.windowEnd);
  return "Not scheduled";
}

export type SourceForm = { label: string; role: string; organization: string; status: SourceStatus; assigneeIds: number[]; notes: string };

export const emptySourceForm = (assigneeIds: number[] = []): SourceForm => ({ label: "", role: "", organization: "", status: "planned", assigneeIds, notes: "" });

export const sourceToForm = (source: StorySource): SourceForm => ({
  label: source.label,
  role: source.role,
  organization: source.organization,
  status: source.status,
  assigneeIds: [...source.assigneeIds],
  notes: source.notes
});

export function validateSourceForm(form: SourceForm): Partial<Record<"label" | "notes" | "assignees", string>> {
  const errors: Partial<Record<"label" | "notes" | "assignees", string>> = {};
  if (!form.label.trim()) errors.label = "Add a label. A role or “Name TBD” is fine.";
  else if (form.label.trim().length > 120) errors.label = "Keep the label under 120 characters.";
  if (form.notes.length > SOURCE_NOTES_MAX) errors.notes = `Notes can be up to ${SOURCE_NOTES_MAX} characters.`;
  if (form.assigneeIds.length > MAX_ASSIGNEES) errors.assignees = `Choose up to ${MAX_ASSIGNEES} people.`;
  return errors;
}

export function sourceFormToInput(form: SourceForm, original?: StorySource): SourceInput {
  return {
    label: form.label.trim(),
    role: form.role.trim(),
    organization: form.organization.trim(),
    status: form.status,
    assigneeIds: form.assigneeIds,
    notes: form.notes,
    ...(original ? { expectedUpdatedAt: original.updatedAt } : {})
  };
}
