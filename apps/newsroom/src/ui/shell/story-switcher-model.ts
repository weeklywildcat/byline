import { DEFAULT_PLANNING_SORT, filterPlanningStories, normalizePlanningFilters, sortPlanningStories, type PlanningFilters, type PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import { storiesInScope } from "@byline/newsroom-screens/planning/stories-scope";
import { builtInStoryView, type BuiltInStoryView } from "@byline/newsroom-screens/planning/story-views";
import type { Role } from "../../domain/vocabulary";

/**
 * The Story switcher's queues: a few of Stories' built-in views, for moving
 * between stories while working. Their filters are the canonical Planning
 * presets (story-views.ts), never a second definition of "My stories" or
 * "Ready for review". Everything else (workflow, writer, dates, Published,
 * On hold, saved views) belongs on the full Stories screen.
 */
export type StorySwitcherQueueId = "mine" | "review" | "all";

export const STORY_SWITCHER_DEFAULT_QUEUE: StorySwitcherQueueId = "mine";

const QUEUE_ORDER: readonly StorySwitcherQueueId[] = ["mine", "review", "all"];

/** Reviewing is an editor's job, so staff do not get "Ready for review". */
export function storySwitcherQueues(role: Role): BuiltInStoryView[] {
  return QUEUE_ORDER
    .filter((id) => id !== "review" || role !== "staff")
    .map((id) => builtInStoryView(id)!)
    .filter(Boolean);
}

/** A stored or requested queue, if this account has it; otherwise My stories. */
export function storySwitcherQueue(value: unknown, queues: readonly BuiltInStoryView[]): StorySwitcherQueueId {
  return queues.some((queue) => queue.id === value) ? (value as StorySwitcherQueueId) : STORY_SWITCHER_DEFAULT_QUEUE;
}

/** The Planning filters for a queue and the search text: the queue's preset plus Planning's own `query`. */
export function storySwitcherFilters(queue: StorySwitcherQueueId, query: string): PlanningFilters {
  return normalizePlanningFilters({ ...builtInStoryView(queue)!.filters, query: query.trim() });
}

/**
 * The stories to list, as Stories' Working scope shows them: the same filtering and
 * the default (deadline) order, without finished published stories, which
 * reappear when searched for by name.
 */
export function storySwitcherRows(stories: PlanningStory[], filters: PlanningFilters, currentUserId: number | null): PlanningStory[] {
  const matching = sortPlanningStories(filterPlanningStories(stories, filters, currentUserId ?? undefined), DEFAULT_PLANNING_SORT);
  return filters.query ? matching : storiesInScope(matching, "working");
}

/** The open story, shown above the queue when the queue does not include it, so it never disappears from the list. */
export function pinnedCurrentStory(rows: readonly PlanningStory[], current: PlanningStory | null | undefined): PlanningStory | null {
  if (!current || rows.some((story) => story.id === current.id)) return null;
  return current;
}

/** A calendar day ("2026-11-08") or an instant, as "Nov 8" in the newsroom's timezone. */
export function shortDay(value: string | null | undefined, timeZone: string): string {
  if (!value) return "";
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = day ? new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: day ? "UTC" : timeZone }).format(date);
}

/**
 * A row's one line of context: where the story is (its workflow stage, or
 * Published), then its deadline, or else who has it, or else when it last
 * changed. Never a grid of badges.
 */
export function storySwitcherMeta(story: PlanningStory, timeZone: string): string {
  const stage = story.publicationState.isPublished ? "Published" : story.workflow.label;
  const detail = story.deadline
    ? shortDay(story.deadline, timeZone)
    : story.writer?.name || story.editor?.name || (story.modifiedAt ? `Updated ${shortDay(story.modifiedAt, timeZone)}` : "");
  return [stage, detail].filter(Boolean).join(" · ");
}
