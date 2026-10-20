/** Small presentation-free helpers shared by the Story Workspace sections. */
import type { ContributorEntry, EditorialTask } from "../editorial/editorial-model";
import type { EditorialActivityRecord } from "../editorial/activity-model";
import type { AvatarPerson } from "../admin-ui/components/people-avatars";
import { activityCopy, dayDistance, siteDay } from "../home/newsroom-model";
import { appointmentTiming } from "./schedule-model";
import type { Assignee, ReportingSummary, StoryWorkspace } from "./workspace-types";

const REPORTING_ACTIONS = /^(source|appointment|media_assignment|resource|brief)_/;

/** Reporting/production summaries already name the actor; older actions are phrased by Home's helper. */
export function workspaceActivityCopy(item: EditorialActivityRecord): string {
  return REPORTING_ACTIONS.test(item.action) && item.summary ? item.summary : activityCopy(item);
}

/** Selectable people for a picker: `people`, plus anyone already on the record. */
export function peopleOptions(people: ContributorEntry[], extra: Assignee[] = []): ContributorEntry[] {
  const options = new Map<number, ContributorEntry>();
  for (const person of people) {
    const id = Number(person.id);
    if (id > 0 && person.kind !== "guest") options.set(id, { ...person, id, kind: "user" });
  }
  for (const person of extra) if (!options.has(person.id)) options.set(person.id, { id: person.id, kind: "user", name: person.name });
  return Array.from(options.values());
}

export function peopleForIds(ids: number[], options: ContributorEntry[]): ContributorEntry[] {
  return ids.map((id) => options.find((person) => Number(person.id) === id)).filter((person): person is ContributorEntry => Boolean(person));
}

/** Assignees (id and name only) with their pictures looked up from the people the workspace already loaded. */
export function assigneeAvatars(assignees: Assignee[], people: ContributorEntry[]): AvatarPerson[] {
  return assignees.map((assignee) => ({ name: assignee.name, imageUrl: people.find((person) => Number(person.id) === assignee.id)?.imageUrl }));
}

export function names(people: Array<{ name: string }>): string {
  return people.map((person) => person.name).join(", ");
}

/** "Reporting · News" */
export function stateLine(data: Pick<StoryWorkspace, "story" | "sections">): string {
  return [data.story.workflow.label, data.sections.join(", ")].filter(Boolean).join(" · ");
}

export function writerNames(data: Pick<StoryWorkspace, "story" | "contributors">): string[] {
  const listed = data.contributors.contributors.map((person) => person.name);
  return listed.length ? listed : data.story.authors.map((person) => person.name);
}

/** The one-paragraph reporting situation shown first on a phone. */
export function reportingHeadline(summary: ReportingSummary | null, timezone: string): { counts: string; next: string } | null {
  if (!summary) return null;
  const counts: string[] = [];
  if (summary.sources) counts.push(`${summary.interviewed} of ${summary.sources} ${summary.sources === 1 ? "source" : "sources"} interviewed`);
  if (summary.toSchedule) counts.push(`${summary.toSchedule} to schedule`);
  const next = summary.nextAppointment;
  let line = "";
  if (next) {
    const timing = appointmentTiming({ ...next, status: "planned", endAt: null }, timezone);
    line = `${next.title} · ${timing.primary}${timing.exact ? ` · ${timing.secondary}` : ""}`;
  }
  return counts.length || line ? { counts: counts.join(" · "), next: line } : null;
}

export function openTasks(tasks: EditorialTask[]): EditorialTask[] {
  return tasks.filter((task) => task.state === "open").sort((a, b) => a.order - b.order);
}

export function completedTasks(tasks: EditorialTask[]): EditorialTask[] {
  return tasks.filter((task) => task.state === "completed").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
}

export const isOverdue = (value: string | null | undefined, timezone: string, now = new Date()) => dayDistance(value, timezone, now) < 0;
export const todaySite = (timezone: string, now = new Date()) => siteDay(now, timezone);

/** "Tue, Oct 27, 2026" for a `YYYY-MM-DD` day, read as a calendar value (never a timezone instant). */
export function formatLongDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/** "Due Wed", "Due today", "3d overdue" for a production or task due value. */
export function dueText(value: string | null | undefined, timezone: string, now = new Date()): string {
  const distance = dayDistance(value, timezone, now);
  if (!Number.isFinite(distance)) return "";
  if (distance < 0) return `${Math.abs(distance)}d overdue`;
  if (distance === 0) return "Due today";
  if (distance === 1) return "Due tomorrow";
  const day = siteDay(value!, timezone);
  return `Due ${new Intl.DateTimeFormat(undefined, { weekday: "short", ...(distance > 6 ? { month: "short", day: "numeric" } as const : {}), timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}`;
}
