import type { EditorialTask, ContributorEntry } from "../editorial/editorial-model";
import type { EditorialActivityRecord } from "../editorial/activity-model";
import type { ContributorPayload } from "../editorial/editorial-rest";
import type { MediaRequest, PlanningPerson, PlanningStory } from "../planning/planning-model";

export type HomeBootstrap = {
  currentUser: PlanningPerson;
  people?: ContributorEntry[];
  timezone: string;
  now: string;
  capabilities: { review: boolean; createStory: boolean; uploadMedia: boolean };
  stories: PlanningStory[];
  tasks: EditorialTask[];
  visualWork: MediaRequest[];
  activity: EditorialActivityRecord[];
  errors: Partial<Record<"stories" | "tasks" | "visualWork" | "activity", string>>;
  limits: { stories: number; tasks: number; visualWork: number; activity: number };
};

export type StoryResource = { id: string; label: string; url: string; kind: string };
export type HomeStoryContext = {
  story: PlanningStory;
  contributors: ContributorPayload;
  resources: StoryResource[];
  sections: string[];
  previewUrl: string;
};
export type HomePeek = {
  story: { revision?: number };
  statuses: PlanningStory["workflow"][];
  capabilities: { changeStatus: boolean; assign: boolean };
  tasks: { tasks: EditorialTask[]; people: ContributorEntry[]; capabilities: { canAssign: boolean; canEditLinkedStory: boolean } };
  media: { type: string; status: string; dueAt?: string; notes?: string; assigneeId?: number };
  activity: { activity: EditorialActivityRecord[] };
  homeContext: HomeStoryContext;
};

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

export function exactDate(value: string | null | undefined, timezone: string): string {
  if (!value) return "Not set";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const siteWallTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : siteWallTime ? `${value}Z` : value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", ...(!dateOnly ? { timeStyle: "short" } as const : {}), timeZone: dateOnly || siteWallTime ? "UTC" : timezone }).format(date);
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

export type AgendaEvent = { id: string; storyId: number | null; title: string; detail: string; date: string; day: string };
export function homeAgenda(data: HomeBootstrap, now = new Date()): AgendaEvent[] {
  const { timezone, currentUser, capabilities } = data;
  const today = siteDay(now, timezone);
  const entries: AgendaEvent[] = [];
  const storyMap = new Map(data.stories.map((s) => [s.id, s]));
  const add = (id: string, storyId: number | null, title: string, detail: string, date?: string | null) => {
    if (!date) return;
    const day = siteDay(date, timezone);
    const delta = dayDistance(date, timezone, now);
    if (day >= today && delta <= 14) entries.push({ id, storyId, title, detail, date, day });
  };
  myOpenTasks(data.tasks, currentUser.id, timezone, now).forEach((task) => add(`task-${task.id}`, task.storyId ?? null, storyMap.get(task.storyId || 0)?.title || task.title, task.storyId ? task.title : "Task deadline", task.dueAt));
  data.stories.filter(activeStory).forEach((story) => {
    if (!capabilities.review && !myStory(story, currentUser.id)) return;
    add(`deadline-${story.id}`, story.id, story.title, "Story deadline", story.deadline);
    const scheduled = story.wordpressState.scheduledAt;
    if (story.wordpressState.isScheduled) add(`scheduled-${story.id}`, story.id, story.title, "WordPress publication", scheduled);
    // One day's publication commitment appears once. The distinct editorial
    // target and actual schedule remain visible in Story Peek.
    if (!scheduled || !story.plannedPublication || siteDay(scheduled, timezone) !== siteDay(story.plannedPublication, timezone)) {
      add(`planned-${story.id}`, story.id, story.title, "Planned publication", story.plannedPublication);
    }
  });
  data.visualWork.forEach((media) => {
    if (media.status !== "done" && (capabilities.review || media.assignee?.id === currentUser.id)) {
      add(`media-${media.id}`, media.story.id, media.story.title, `${media.type === "photo" ? "Photo" : "Visual"} assignment`, media.dueAt);
    }
  });
  return entries.sort((a, b) => a.day.localeCompare(b.day) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export type AttentionItem = { id: string; storyId: number | null; title: string; detail: string; urgent?: boolean };
export function waitingForMe(data: HomeBootstrap, now = new Date()): AttentionItem[] {
  const overdue = myOpenTasks(data.tasks, data.currentUser.id, data.timezone, now).filter((t) => dayDistance(t.dueAt, data.timezone, now) < 0);
  const items: AttentionItem[] = [];
  if (overdue.length) items.push({ id: "overdue-work", storyId: overdue[0].storyId || null, title: `${overdue.length} overdue ${overdue.length === 1 ? "task" : "tasks"}`, detail: "Review your deadlines in Up Next", urgent: true });
  data.stories.filter((s) => activeStory(s) && myStory(s, data.currentUser.id) && dayDistance(s.deadline, data.timezone, now) < 0).slice(0, 2).forEach((s) => items.push({ id: `late-story-${s.id}`, storyId: s.id, title: s.title, detail: "Story deadline has passed", urgent: true }));
  data.visualWork.filter((v) => v.assignee?.id === data.currentUser.id && v.status === "assigned").slice(0, 2).forEach((v) => items.push({ id: `assigned-media-${v.id}`, storyId: v.story.id, title: v.story.title, detail: "Visual assignment waiting to be started" }));
  if (data.capabilities.review) {
    data.visualWork.filter((v) => !v.assignee && v.status === "needed" && dayDistance(v.dueAt, data.timezone, now) <= 1).slice(0, 2).forEach((v) => items.push({ id: `unassigned-${v.id}`, storyId: v.story.id, title: v.story.title, detail: "Urgent visual work needs an assignee", urgent: true }));
  }
  return items.slice(0, 5);
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
