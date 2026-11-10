import { addDays, localDay } from "./dates";

/**
 * Factual workload (docs/newsroom-roles.md#workload): counts an editor can
 * read at a glance when assigning or rebalancing work. Never a score, a rank
 * or a measure of anyone's output; nothing here is compared between people.
 * Pure: the server loads the facts, this function counts them.
 */

export type WorkloadStory = {
  id: number;
  /** The Story's effective phase. Only phases where someone has work to do count as active. */
  phase: "pitch" | "reporting" | "drafting" | "review" | "ready" | "on-hold" | "dropped" | "published";
  deadline: string | null;
  writerIds: readonly number[];
  editorId: number | null;
};

export type WorkloadReview = { storyId: number; userIds: readonly number[] };
export type WorkloadMedia = { status: string; assigneeIds: readonly number[] };
export type WorkloadPerson = { id: number; name: string; role: "staff" | "editor" | "administrator" };

export type WorkloadRow = {
  userId: number;
  name: string;
  role: WorkloadPerson["role"];
  activeStories: number;
  dueThisWeek: number;
  overdue: number;
  reviews: number;
  mediaAssignments: number;
};

/** Phases in which a Story is somebody's work right now. A pitch is a proposal, not a commitment. */
export const ACTIVE_PHASES = ["reporting", "drafting", "review", "ready"] as const;
const OPEN_MEDIA = new Set(["needed", "assigned", "in-progress"]);

export type WorkloadInput = {
  now: Date;
  timeZone: string;
  people: readonly WorkloadPerson[];
  stories: readonly WorkloadStory[];
  reviews: readonly WorkloadReview[];
  media: readonly WorkloadMedia[];
};

export function workloadRows(input: WorkloadInput): WorkloadRow[] {
  const today = localDay(input.now, input.timeZone);
  const weekEnd = addDays(today, 7);
  const rows = new Map<number, WorkloadRow>(input.people.map((person) => [person.id, { userId: person.id, name: person.name, role: person.role, activeStories: 0, dueThisWeek: 0, overdue: 0, reviews: 0, mediaAssignments: 0 }]));

  for (const story of input.stories) {
    if (!(ACTIVE_PHASES as readonly string[]).includes(story.phase)) continue;
    // A Story deadline is a calendar day (YYYY-MM-DD, no zone); anything else is an instant in the newsroom zone.
    const deadline = story.deadline ? (/^\d{4}-\d{2}-\d{2}$/.test(story.deadline) ? story.deadline : localDay(story.deadline, input.timeZone)) : null;
    const owners = new Set<number>(story.writerIds);
    if (story.editorId !== null) owners.add(story.editorId);
    for (const id of owners) {
      const row = rows.get(id);
      if (!row) continue;
      row.activeStories += 1;
      if (deadline === null) continue;
      if (deadline < today) row.overdue += 1;
      else if (deadline < weekEnd) row.dueThisWeek += 1;
    }
  }
  for (const review of input.reviews) {
    for (const id of new Set(review.userIds)) {
      const row = rows.get(id);
      if (row) row.reviews += 1;
    }
  }
  for (const media of input.media) {
    if (!OPEN_MEDIA.has(media.status)) continue;
    for (const id of new Set(media.assigneeIds)) {
      const row = rows.get(id);
      if (row) row.mediaAssignments += 1;
    }
  }
  // Alphabetical, never ordered by how much someone has.
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.userId - b.userId);
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "2 active Stories · 1 review · 1 due this week": advisory text for the assignment pickers. Empty when there is nothing to say. */
export function workloadHint(row: Pick<WorkloadRow, "activeStories" | "dueThisWeek" | "overdue" | "reviews" | "mediaAssignments">): string {
  const parts: string[] = [];
  if (row.activeStories) parts.push(plural(row.activeStories, "active Story", "active Stories"));
  if (row.reviews) parts.push(plural(row.reviews, "review"));
  if (row.mediaAssignments) parts.push(plural(row.mediaAssignments, "media assignment"));
  if (row.overdue) parts.push(`${row.overdue} overdue`);
  if (row.dueThisWeek) parts.push(`${row.dueThisWeek} due this week`);
  return parts.join(" · ");
}

/**
 * How much is on someone's plate, as one of four plain levels, for the Workload
 * screen only. Every active Story, review, media assignment and Story due this
 * week is a point; overdue Stories count twice. It describes load, never
 * output, and the list stays alphabetical: nobody is ordered by it, and the
 * assignment pickers keep the quiet `workloadHint` line instead.
 */
export const LOAD_LEVELS = ["light", "steady", "busy", "stretched"] as const;
export type LoadLevel = (typeof LOAD_LEVELS)[number];
export const LOAD_LABELS: Record<LoadLevel, string> = { light: "Light", steady: "Steady", busy: "Busy", stretched: "Stretched" };
/** The lowest point total for each level. */
export const LOAD_THRESHOLDS: Record<LoadLevel, number> = { light: 0, steady: 2, busy: 5, stretched: 8 };

export function loadPoints(row: Pick<WorkloadRow, "activeStories" | "dueThisWeek" | "overdue" | "reviews" | "mediaAssignments">): number {
  return row.activeStories + row.reviews + row.mediaAssignments + row.dueThisWeek + row.overdue * 2;
}

export function loadLevel(row: Pick<WorkloadRow, "activeStories" | "dueThisWeek" | "overdue" | "reviews" | "mediaAssignments">): LoadLevel {
  const points = loadPoints(row);
  return [...LOAD_LEVELS].reverse().find((level) => points >= LOAD_THRESHOLDS[level]) ?? "light";
}
