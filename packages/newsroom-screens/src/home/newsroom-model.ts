import type { CollectionHref } from "../collections/collection-model";
import type { EditorialTask, ContributorEntry } from "../editorial/editorial-model";
import type { EditorialActivityRecord } from "../editorial/activity-model";
import type { PlanningPerson, PlanningStory } from "../planning/planning-model";
import { schedulingNeed, upcomingConfirmed } from "../workspace/schedule-model";
import type { HomeAppointment, MediaAssignmentStatus, MediaAssignmentType, ResourcePurpose } from "../workspace/workspace-types";

/** One production assignment, as Home receives it (one row per assignment, not per story). */
export type HomeVisualWork = {
  id: string;
  story: { id: number; title: string; editUrl: string };
  title: string;
  type: MediaAssignmentType;
  status: MediaAssignmentStatus;
  assignee: PlanningPerson | null;
  dueAt: string | null;
  notes: string;
  attachmentIds: number[];
};

export type HomeBootstrap = {
  currentUser: PlanningPerson;
  people?: ContributorEntry[];
  timezone: string;
  now: string;
  capabilities: { review: boolean; createStory: boolean; uploadMedia: boolean };
  stories: PlanningStory[];
  tasks: EditorialTask[];
  visualWork: HomeVisualWork[];
  /** The signed-in user's open appointments. Windows carry no instant; Home never invents one. */
  appointments: HomeAppointment[];
  activity: EditorialActivityRecord[];
  errors: Partial<Record<"stories" | "tasks" | "visualWork" | "appointments" | "activity", string>>;
  limits: { stories: number; tasks: number; visualWork: number; appointments: number; activity: number };
};

export const mediaTypeLabels: Record<MediaAssignmentType, string> = { photo: "Photo", gallery: "Gallery", graphic: "Graphic", video: "Video", audio: "Audio", other: "Visual" };
export const mediaStatusLabels: Record<MediaAssignmentStatus, string> = { needed: "Needed", assigned: "Assigned", "in-progress": "In progress", uploaded: "Uploaded", selected: "Selected", done: "Done" };

const GENERIC_MEDIA_TITLES = new Set(["visual request", "photo request", "media request"]);

/** Keep custom assignment titles, but replace legacy generic request labels with useful newsroom copy. */
export function mediaAssignmentTitle(media: Pick<HomeVisualWork, "title" | "type" | "status">): string {
  const custom = media.title.trim();
  if (custom && !GENERIC_MEDIA_TITLES.has(custom.toLowerCase())) return custom;
  const kind = mediaTypeLabels[media.type] || "Visual";
  return media.status === "needed" ? `${kind} needed` : `${kind} assignment`;
}
export const resourcePurposeLabels: Record<ResourcePurpose, string> = { draft: "Draft", "interview-notes": "Interview notes", transcript: "Transcript", research: "Research", data: "Data", folder: "Folder", other: "Other" };
const appointmentKindLabels: Record<string, string> = { interview: "Interview", meeting: "Meeting", event: "Event", photo: "Photo shoot", "press-conference": "Press conference", game: "Game", performance: "Performance", reporting: "Reporting", other: "Appointment" };

/** `…&tab=stories` becomes `…&story=<id>`: the full Story Workspace on the same Planning page. */
export function workspaceUrlFor(storiesUrl: string, storyId: number, base = typeof window === "undefined" ? "http://localhost/wp-admin/" : window.location.href): string {
  const url = new URL(storiesUrl, base);
  url.searchParams.delete("tab");
  url.searchParams.delete("mine");
  url.searchParams.set("story", String(storyId));
  return url.toString();
}

const DAY = 86_400_000;
/** Date-only newsroom deadlines are calendar values, never browser-local instants. */
export function siteDay(value: string | Date, timezone: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dayDistance(value: string | null | undefined, timezone: string, now = new Date()): number {
  if (!value) return Infinity;
  const key = siteDay(value, timezone);
  return key ? Math.round((Date.parse(key) - Date.parse(siteDay(now, timezone))) / DAY) : Infinity;
}

export function dateLabel(value: string | null | undefined, timezone: string, now = new Date()): string {
  const distance = dayDistance(value, timezone, now);
  if (!Number.isFinite(distance)) return "No date";
  if (distance < 0) return `${Math.abs(distance)}d overdue`;
  if (distance === 0) return "Today";
  if (distance === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", ...(distance > 6 ? { month: "short", day: "numeric" } as const : {}), timeZone: "UTC" }).format(new Date(`${siteDay(value!, timezone)}T12:00:00Z`));
}

/** "5m ago", "3h ago", then a site-timezone date. The exact time belongs in a title, not here. */
export function relativeTime(value: string, timezone: string, now = new Date()): string {
  const elapsed = now.getTime() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: timezone }).format(new Date(value));
}

export function exactDate(value: string | null | undefined, timezone: string): string {
  if (!value) return "Not set";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const siteWallTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : siteWallTime ? `${value}Z` : value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", ...(!dateOnly ? { timeStyle: "short" } as const : {}), timeZone: dateOnly || siteWallTime ? "UTC" : timezone }).format(date);
}

/** "Oct 21 · 2:00 PM", or just "Oct 21" for a date-only value. Site timezone, no year. */
export function shortDateTime(value: string | null | undefined, timezone: string): string {
  if (!value) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const siteWallTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : siteWallTime ? `${value}Z` : value);
  if (Number.isNaN(date.getTime())) return "";
  const zone = dateOnly || siteWallTime ? "UTC" : timezone;
  const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: zone }).format(date);
  return dateOnly ? day : `${day} · ${new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: zone }).format(date)}`;
}

const priorities = { urgent: 0, high: 1, normal: 2, low: 3 };
export function taskUrgency(task: EditorialTask, timezone: string, now = new Date()): number {
  const d = dayDistance(task.dueAt, timezone, now);
  return d < 0 ? 0 : d === 0 ? 1 : d === 1 ? 2 : d <= 7 ? 3 : Number.isFinite(d) ? 4 : 5;
}
export function myOpenTasks(tasks: EditorialTask[], userId: number, timezone: string, now = new Date()): EditorialTask[] {
  return tasks.filter((task) => task.state === "open" && (task.assigneeId ?? task.assignee?.id) === userId).sort((a, b) =>
    taskUrgency(a, timezone, now) - taskUrgency(b, timezone, now)
    || priorities[a.priority] - priorities[b.priority]
    || (a.dueAt || "9999").localeCompare(b.dueAt || "9999")
    || a.order - b.order || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

export type HomeWorkGroup = "attention" | "today" | "tomorrow" | "week" | "later";
export const HOME_WORK_GROUPS: Array<{ id: HomeWorkGroup; label: string }> = [
  { id: "attention", label: "Needs attention" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" }
];

export type HomeWorkItem =
  | { id: string; kind: "task"; group: HomeWorkGroup; task: EditorialTask }
  | { id: string; kind: "review"; group: "attention"; story: PlanningStory }
  | { id: string; kind: "attention"; group: "attention"; item: AttentionItem }
  | { id: string; kind: "media"; group: HomeWorkGroup; media: HomeVisualWork };

function workGroup(value: string | null | undefined, timezone: string, now: Date, urgent = false): HomeWorkGroup {
  const distance = dayDistance(value, timezone, now);
  if (urgent || distance < 0) return "attention";
  if (distance === 0) return "today";
  if (distance === 1) return "tomorrow";
  if (distance <= 7) return "week";
  return "later";
}

export function activeStory(story: PlanningStory): boolean {
  return !story.publicationState.isPublished && !["published", "trash", "auto-draft"].includes(story.publicationState.id) && !["published", "dropped"].includes(story.workflow.id);
}
export function myStory(story: PlanningStory, userId: number): boolean {
  return story.editor?.id === userId || story.writer?.id === userId || story.authors.some((person) => (person as PlanningPerson & { kind?: string }).kind !== "guest" && person.id === userId);
}
export function myActiveStories(stories: PlanningStory[], userId: number, timezone: string, now = new Date()): PlanningStory[] {
  return stories.filter((s) => activeStory(s) && myStory(s, userId)).sort((a, b) =>
    Number(dayDistance(b.deadline, timezone, now) < 0) - Number(dayDistance(a.deadline, timezone, now) < 0)
    || (a.deadline || "9999").localeCompare(b.deadline || "9999")
    || (a.plannedPublication || "9999").localeCompare(b.plannedPublication || "9999")
    || (b.modifiedAt || "").localeCompare(a.modifiedAt || "") || a.id - b.id);
}

/** Which of the calendar's fixed categories an agenda entry belongs to: the icon (and hue) it is shown with. */
export type AgendaCategory = "publication" | "deadline" | "appointment" | "photo";
/** `label` is the kind of commitment ("Story deadline", "Interview"); `title`/`detail` identify the work. */
export type AgendaEvent = { href?: string; id: string; storyId: number | null; title: string; detail: string; label: string; date: string; day: string; category: AgendaCategory };

/**
 * Whose commitments Home shows: the reader's own stories, or every visible
 * newsroom story. Only an editor (`capabilities.review`) can choose Newsroom;
 * everyone else always sees their own. Personal work (My Work) is never scoped.
 */
export type HomeScope = "mine" | "newsroom";
export const homeScope = (preferred: HomeScope | null | undefined, canReview: boolean): HomeScope => canReview ? preferred ?? "newsroom" : "mine";

/** Story commitments and confirmed appointments on the site days `inRange` accepts. */
function collectAgenda(data: HomeBootstrap, inRange: (day: string) => boolean, appointments: HomeAppointment[], scope?: HomeScope, collectionHref?: CollectionHref): AgendaEvent[] {
  const { timezone, currentUser, capabilities } = data;
  const newsroom = capabilities.review && scope !== "mine";
  const entries: AgendaEvent[] = [];
  const add = (id: string, storyId: number | null, title: string, detail: string, label: string, category: AgendaCategory, date?: string | null, href?: string) => {
    if (!date) return;
    const day = siteDay(date, timezone);
    if (day && inRange(day)) entries.push({ id, storyId, title, detail, label, date, day, category, ...(href ? { href } : {}) });
  };
  data.stories.filter(activeStory).forEach((story) => {
    if (!newsroom && !myStory(story, currentUser.id)) return;
    add(`deadline-${story.id}`, story.id, story.title, "", "Story deadline", "deadline", story.deadline);
    const scheduled = story.publicationState.scheduledAt;
    if (story.publicationState.isScheduled) add(`scheduled-${story.id}`, story.id, story.title, "", "Scheduled publication", "publication", scheduled);
    // One day's publication commitment appears once. The distinct editorial
    // target and actual schedule remain visible in Story Peek.
    if (!scheduled || !story.plannedPublication || siteDay(scheduled, timezone) !== siteDay(story.plannedPublication, timezone)) {
      add(`planned-${story.id}`, story.id, story.title, "", "Planned publication", "publication", story.plannedPublication);
    }
  });
  appointments.forEach((appointment) => add(`appointment-${appointment.id}`, appointment.storyId, appointment.title, appointment.storyTitle, appointmentKindLabels[appointment.kind] || "Appointment", appointment.kind === "photo" ? "photo" : "appointment", appointment.startAt, appointment.collectionId && collectionHref ? collectionHref(appointment.collectionId, { interviewId: appointment.interviewId }) : undefined));
  return entries.sort((a, b) => a.day.localeCompare(b.day) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** `collectionHref`: the host's Collection address, for shared interviews (absent: no link). */
export function homeAgenda(data: HomeBootstrap, now = new Date(), collectionHref?: CollectionHref, scope?: HomeScope): AgendaEvent[] {
  const today = siteDay(now, data.timezone);
  const last = addDays(today, 14);
  // Only a confirmed, exact appointment has a day and a time. A target window or
  // an unscheduled idea is work to schedule, not a calendar commitment.
  return collectAgenda(data, (day) => day >= today && day <= last, upcomingConfirmed(data.appointments || [], data.timezone, now), scope, collectionHref);
}

/** `YYYY-MM-DD` plus whole days, as a calendar date (never an instant). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 (Sunday) to 6 (Saturday) for a site day. */
export const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** The ISO 8601 week number of a site day ("Week 45"). */
export function isoWeek(day: string): number {
  const date = new Date(`${day}T12:00:00Z`);
  // The ISO week is the one holding that week's Thursday.
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4, 12));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * DAY));
}

export type WeekAgendaDay = {
  day: string;
  isToday: boolean;
  isPast: boolean;
  /** Monday to Friday: a day the newsroom expects to publish. */
  isWeekday: boolean;
  events: AgendaEvent[];
  /** Planned or scheduled publications that day. */
  toPublish: number;
  /** A weekday, today or later, with no planned or scheduled publication. */
  nothingPlanned: boolean;
};

export type WeekAgenda = { start: string; end: string; days: WeekAgendaDay[]; nextWeekCount: number };

/**
 * One site week, Sunday to Saturday, with Home's commitments bucketed by site
 * day. `offset` moves whole weeks from the current one. Confirmed appointments
 * earlier this week still show on their day.
 */
export function weekAgenda(data: HomeBootstrap, now = new Date(), scope?: HomeScope, options: { offset?: number; collectionHref?: CollectionHref } = {}): WeekAgenda {
  const { timezone } = data;
  const today = siteDay(now, timezone);
  const start = addDays(today, -weekdayOf(today) + 7 * (options.offset ?? 0));
  const end = addDays(start, 6);
  const nextEnd = addDays(end, 7);
  const confirmed = (data.appointments || []).filter((a) => a.status === "confirmed" && a.scheduleMode === "exact" && a.startAt);
  const events = collectAgenda(data, (day) => day >= start && day <= nextEnd, confirmed, scope, options.collectionHref);
  const days = Array.from({ length: 7 }, (_, index): WeekAgendaDay => {
    const day = addDays(start, index);
    const dayEvents = events.filter((event) => event.day === day);
    const toPublish = dayEvents.filter((event) => event.category === "publication").length;
    const weekday = index > 0 && index < 6;
    return { day, isToday: day === today, isPast: day < today, isWeekday: weekday, events: dayEvents, toPublish, nothingPlanned: weekday && day >= today && toPublish === 0 };
  });
  return { start, end, days, nextWeekCount: events.filter((event) => event.day > end).length };
}

/** `reason`: why it needs attention, so a row can say so with the right badge. */
export type AttentionItem = { href?: string; id: string; storyId: number | null; title: string; detail: string; urgent?: boolean; reason?: "late-story" | "scheduling" | "unassigned-production" };
export function waitingForMe(data: HomeBootstrap, now = new Date(), collectionHref?: CollectionHref): AttentionItem[] {
  const items: AttentionItem[] = [];
  // Ordinary tasks are already first-class My Work items. These attention signals
  // are reserved for decisions, assignment or scheduling actions instead of
  // duplicating the same overdue task as a second kind of work.
  data.stories.filter((s) => activeStory(s) && myStory(s, data.currentUser.id) && dayDistance(s.deadline, data.timezone, now) < 0).slice(0, 2).forEach((s) => items.push({ id: `late-story-${s.id}`, storyId: s.id, title: s.title, detail: "Story deadline has passed", urgent: true, reason: "late-story" }));
  // A reporting appointment whose target window is about to open, is open, or only just lapsed.
  // An unscheduled idea or a far-off window never appears here.
  (data.appointments || []).flatMap((a) => { const need = schedulingNeed(a, data.timezone, now); return need ? [{ a, need }] : []; })
    .sort((x, y) => Number(y.need.urgent) - Number(x.need.urgent) || (x.a.windowStart || "").localeCompare(y.a.windowStart || "") || x.a.id.localeCompare(y.a.id)).slice(0, 2)
    .forEach(({ a, need }) => items.push({ id: `schedule-${a.id}`, storyId: a.storyId, title: a.title, detail: need.label, urgent: need.urgent, reason: "scheduling", ...(a.collectionId && collectionHref ? { href: collectionHref(a.collectionId, { interviewId: a.interviewId }) } : {}) }));
  if (data.capabilities.review) {
    data.visualWork.filter((v) => !v.assignee && v.status === "needed" && dayDistance(v.dueAt, data.timezone, now) <= 1).slice(0, 2).forEach((v) => items.push({ id: `unassigned-${v.story.id}-${v.id}`, storyId: v.story.id, title: mediaAssignmentTitle(v), detail: `${v.story.title} · urgent visual work needs an assignee`, urgent: true, reason: "unassigned-production" }));
  }
  // Urgent items first (stable), so a few scheduling nudges cannot push other decision work out of the bound.
  return [...items.filter((i) => i.urgent), ...items.filter((i) => !i.urgent)].slice(0, 5);
}

export function reviewStories(data: HomeBootstrap): PlanningStory[] {
  return data.capabilities.review ? data.stories.filter((s) => activeStory(s) && (s.needsReview || s.workflow.id === "review")).sort((a, b) => (a.modifiedAt || "").localeCompare(b.modifiedAt || "") || a.id - b.id) : [];
}

/**
 * One personal queue for every kind of work the signed-in user has to act on.
 * The source objects stay distinct; Home only normalizes their urgency and order.
 */
export function myWork(data: HomeBootstrap, now = new Date(), collectionHref?: CollectionHref): HomeWorkItem[] {
  const items: HomeWorkItem[] = [];
  const reviews = reviewStories(data);
  const reviewStoryIds = new Set(reviews.map((story) => story.id));

  for (const task of myOpenTasks(data.tasks, data.currentUser.id, data.timezone, now)) {
    items.push({ id: `task-${task.id}`, kind: "task", group: workGroup(task.dueAt, data.timezone, now, task.priority === "urgent"), task });
  }

  for (const story of reviews) {
    items.push({ id: `review-${story.id}`, kind: "review", group: "attention", story });
  }

  for (const item of waitingForMe(data, now, collectionHref)) {
    // A ready story that is also late has one clearer action: review it.
    if (item.id.startsWith("late-story-") && item.storyId && reviewStoryIds.has(item.storyId)) continue;
    items.push({ id: `attention-${item.id}`, kind: "attention", group: "attention", item });
  }

  for (const media of data.visualWork) {
    if (media.status === "done" || media.assignee?.id !== data.currentUser.id) continue;
    items.push({ id: `media-${media.story.id}-${media.id}`, kind: "media", group: workGroup(media.dueAt, data.timezone, now), media });
  }

  const groupRank: Record<HomeWorkGroup, number> = { attention: 0, today: 1, tomorrow: 2, week: 3, later: 4 };
  const kindRank: Record<HomeWorkItem["kind"], number> = { attention: 0, review: 1, task: 2, media: 3 };
  const dateOf = (item: HomeWorkItem) => item.kind === "task" ? item.task.dueAt : item.kind === "media" ? item.media.dueAt : item.kind === "review" ? item.story.modifiedAt : null;
  const attentionRank = (item: HomeWorkItem) => {
    if (item.group !== "attention") return 0;
    if (item.kind === "task") return dayDistance(item.task.dueAt, data.timezone, now) < 0 ? 0 : 1;
    if (item.kind === "media") return dayDistance(item.media.dueAt, data.timezone, now) < 0 ? 0 : 3;
    if (item.kind === "attention") return item.item.urgent ? 1 : 4;
    return 2;
  };

  return items.sort((a, b) =>
    groupRank[a.group] - groupRank[b.group]
    || attentionRank(a) - attentionRank(b)
    || kindRank[a.kind] - kindRank[b.kind]
    || (dateOf(a) || "9999").localeCompare(dateOf(b) || "9999")
    || a.id.localeCompare(b.id, undefined, { numeric: true })
  );
}

export function activityCopy(item: EditorialActivityRecord): string {
  const actor = item.actor?.name;
  const context = item.context || {};
  if (item.action === "task_completed" && context.taskTitle) return `${actor || "Someone"} completed “${context.taskTitle}”`;
  if (item.action === "workflow_changed" && context.to) {
    const labels: Record<string, string> = { pitch: "Pitch", assigned: "Assigned", reporting: "Reporting", writing: "Writing", editing: "Editing", ready: "Ready for Review", "on-hold": "On Hold", dropped: "Dropped" };
    return `${actor || "Someone"} moved the story to ${labels[String(context.to)] || "another stage"}`;
  }
  return actor ? `${actor} · ${item.summary}` : item.summary;
}
