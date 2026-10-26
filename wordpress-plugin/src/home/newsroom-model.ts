import { collectionUrl } from "../collections/collection-model";
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

export function activeStory(story: PlanningStory): boolean {
  return !story.wordpressState.isPublished && !["publish", "trash", "auto-draft"].includes(story.wordpressState.id) && !["published", "dropped"].includes(story.workflow.id);
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

/** `label` is the kind of commitment ("Story deadline", "Interview"); `title`/`detail` identify the work. */
export type AgendaEvent = { href?: string; id: string; storyId: number | null; title: string; detail: string; label: string; date: string; day: string };
export function homeAgenda(data: HomeBootstrap, now = new Date()): AgendaEvent[] {
  const { timezone, currentUser, capabilities } = data;
  const today = siteDay(now, timezone);
  const entries: AgendaEvent[] = [];
  const storyMap = new Map(data.stories.map((s) => [s.id, s]));
  const add = (id: string, storyId: number | null, title: string, detail: string, label: string, date?: string | null, href?: string) => {
    if (!date) return;
    const day = siteDay(date, timezone);
    const delta = dayDistance(date, timezone, now);
    if (day >= today && delta <= 14) entries.push({ id, storyId, title, detail, label, date, day, ...(href ? { href } : {}) });
  };
  myOpenTasks(data.tasks, currentUser.id, timezone, now).forEach((task) => add(`task-${task.id}`, task.storyId ?? null, task.title, storyMap.get(task.storyId || 0)?.title || "", "Task deadline", task.dueAt));
  data.stories.filter(activeStory).forEach((story) => {
    if (!capabilities.review && !myStory(story, currentUser.id)) return;
    add(`deadline-${story.id}`, story.id, story.title, "", "Story deadline", story.deadline);
    const scheduled = story.wordpressState.scheduledAt;
    if (story.wordpressState.isScheduled) add(`scheduled-${story.id}`, story.id, story.title, "", "WordPress publication", scheduled);
    // One day's publication commitment appears once. The distinct editorial
    // target and actual schedule remain visible in Story Peek.
    if (!scheduled || !story.plannedPublication || siteDay(scheduled, timezone) !== siteDay(story.plannedPublication, timezone)) {
      add(`planned-${story.id}`, story.id, story.title, "", "Planned publication", story.plannedPublication);
    }
  });
  data.visualWork.forEach((media) => {
    if (media.status !== "done" && (capabilities.review || media.assignee?.id === currentUser.id)) {
      add(`media-${media.story.id}-${media.id}`, media.story.id, media.title || media.story.title, media.story.title, "Production due", media.dueAt);
    }
  });
  // Only a confirmed, exact appointment has a day and a time. A target window or
  // an unscheduled idea is never placed on the calendar; it is Waiting for Me's job.
  upcomingConfirmed(data.appointments || [], timezone, now).forEach((appointment) => add(`appointment-${appointment.id}`, appointment.storyId, appointment.title, appointment.storyTitle, appointmentKindLabels[appointment.kind] || "Appointment", appointment.startAt, appointment.collectionId ? `${collectionUrl(appointment.collectionId)}&interview=${appointment.interviewId}` : undefined));
  return entries.sort((a, b) => a.day.localeCompare(b.day) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export type AttentionItem = { href?: string; id: string; storyId: number | null; title: string; detail: string; urgent?: boolean };
export function waitingForMe(data: HomeBootstrap, now = new Date()): AttentionItem[] {
  const items: AttentionItem[] = [];
  // Ordinary tasks already live in Up Next. Waiting for Me is reserved for work
  // that needs a decision, assignment, or scheduling action instead of duplicating
  // the same overdue task in two Home sections.
  data.stories.filter((s) => activeStory(s) && myStory(s, data.currentUser.id) && dayDistance(s.deadline, data.timezone, now) < 0).slice(0, 2).forEach((s) => items.push({ id: `late-story-${s.id}`, storyId: s.id, title: s.title, detail: "Story deadline has passed", urgent: true }));
  // A reporting appointment whose target window is about to open, is open, or only just lapsed.
  // An unscheduled idea or a far-off window never appears here.
  (data.appointments || []).flatMap((a) => { const need = schedulingNeed(a, data.timezone, now); return need ? [{ a, need }] : []; })
    .sort((x, y) => Number(y.need.urgent) - Number(x.need.urgent) || (x.a.windowStart || "").localeCompare(y.a.windowStart || "") || x.a.id.localeCompare(y.a.id)).slice(0, 2)
    .forEach(({ a, need }) => items.push({ id: `schedule-${a.id}`, storyId: a.storyId, title: a.title, detail: need.label, urgent: need.urgent, ...(a.collectionId ? { href: `${collectionUrl(a.collectionId)}&interview=${a.interviewId}` } : {}) }));
  if (data.capabilities.review) {
    data.visualWork.filter((v) => !v.assignee && v.status === "needed" && dayDistance(v.dueAt, data.timezone, now) <= 1).slice(0, 2).forEach((v) => items.push({ id: `unassigned-${v.story.id}-${v.id}`, storyId: v.story.id, title: mediaAssignmentTitle(v), detail: `${v.story.title} · urgent visual work needs an assignee`, urgent: true }));
  }
  // Urgent items first (stable), so a few scheduling nudges cannot push other decision work out of the bound.
  return [...items.filter((i) => i.urgent), ...items.filter((i) => !i.urgent)].slice(0, 5);
}

export function reviewStories(data: HomeBootstrap): PlanningStory[] {
  return data.capabilities.review ? data.stories.filter((s) => activeStory(s) && s.workflow.id === "ready").sort((a, b) => (a.modifiedAt || "").localeCompare(b.modifiedAt || "") || a.id - b.id) : [];
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
