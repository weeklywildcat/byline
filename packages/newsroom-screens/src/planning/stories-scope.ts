/**
 * Stories scopes: which stories the reader is looking at, apart from how they
 * are presented (Board | List | Calendar, stories-view.ts) and how they are
 * refined (PlanningFilters).
 *
 *  - Working   the newsroom work queue: everything unpublished, plus a published
 *              story only while it still has open work.
 *  - Published the publication record: every published story, finished or not.
 *  - All       the whole library: every story the reader may see.
 *
 * Presentation-free so the rules are tested without React and shared by every host.
 */
import { addDays, siteDay } from "../home/newsroom-model";
import { DEFAULT_PLANNING_SORT, normalizePlanningFilters, storyHasOpenWork, type PlanningFilters, type PlanningSort, type PlanningStory } from "./planning-model";
import { availableStoriesViews, storiesViewFromRoute, supportedStoriesView, type StoriesView } from "./stories-view";

export const STORY_SCOPE_IDS = ["working", "published", "all"] as const;
export type StoryScope = (typeof STORY_SCOPE_IDS)[number];

export const DEFAULT_STORY_SCOPE: StoryScope = "working";

export const STORY_SCOPE_LABELS: Record<StoryScope, string> = { working: "Working", published: "Published", all: "All" };

export function storyScopeFromRoute(value: string | null | undefined): StoryScope | null {
  return (STORY_SCOPE_IDS as readonly string[]).includes(value as string) ? (value as StoryScope) : null;
}

/** Anything that is not a scope (a stale bookmark, a typo) is the work queue. */
export function normalizeStoryScope(value: unknown): StoryScope {
  return typeof value === "string" ? storyScopeFromRoute(value) ?? DEFAULT_STORY_SCOPE : DEFAULT_STORY_SCOPE;
}

/**
 * Does a story belong in a scope? A published story is finished news, so it
 * leaves Working unless something on it is still open (a task, production,
 * an appointment to schedule, a review request).
 */
export function storyBelongsToScope(story: PlanningStory, scope: StoryScope): boolean {
  if (scope === "all") return true;
  if (scope === "published") return story.publicationState.isPublished;
  return !story.publicationState.isPublished || storyHasOpenWork(story);
}

export function storiesInScope(stories: readonly PlanningStory[], scope: StoryScope): PlanningStory[] {
  return stories.filter((story) => storyBelongsToScope(story, scope));
}

/** How many of `stories` each scope holds. The stories are whatever the screen has loaded, refinements included. */
export function storyScopeCounts(stories: readonly PlanningStory[]): Record<StoryScope, number> {
  return { working: storiesInScope(stories, "working").length, published: storiesInScope(stories, "published").length, all: stories.length };
}

/** The order each scope opens in: the queue by deadline, the record newest first, the library by last change. */
export function defaultScopeSort(scope: StoryScope): PlanningSort {
  if (scope === "published") return { key: "published", direction: "desc" };
  if (scope === "all") return { key: "modified", direction: "desc" };
  return { ...DEFAULT_PLANNING_SORT };
}

/** A column the reader meets for the first time starts in the direction that answers "what is newest?". */
export function firstSortDirection(key: PlanningSort["key"]): PlanningSort["direction"] {
  return key === "published" ? "desc" : "asc";
}

/** Only the work queue is a board (or a calendar); Published and All are libraries, listed. */
export function scopePresentations(scope: StoryScope, hasCalendar: boolean): StoriesView[] {
  return scope === "working" ? availableStoriesViews(hasCalendar) : ["list"];
}

/** The presentation to render: the reader's Working choice in Working, the list everywhere else. */
export function presentationForScope(scope: StoryScope, workingView: StoriesView, hasCalendar: boolean): StoriesView {
  return scope === "working" ? supportedStoriesView(workingView, hasCalendar) : "list";
}

/* ------------------------------------------------------------- addresses */

export type StoriesRoute = { scope: StoryScope; view: StoriesView | null };
export type StoriesLocation = { scope: StoryScope; view: StoriesView; publicationState?: string };

/**
 * What a Stories address names. `scope=` and `view=` are the two parameters;
 * the earlier `publication_state=published` always meant the published stories,
 * so an old bookmark opens Published rather than a Working tab holding them.
 * A `view=` beside a library scope is kept (it is the Working presentation to
 * return to) but never rendered there.
 */
export function resolveStoriesRoute(params: URLSearchParams): StoriesRoute {
  const scope = params.get("publication_state") === "published" ? "published" : storyScopeFromRoute(params.get("scope")) ?? DEFAULT_STORY_SCOPE;
  return { scope, view: storiesViewFromRoute(params.get("view") ?? undefined) };
}

/**
 * Write a scope and presentation into an address. Working is implicit
 * (`view=board`); a library scope is `scope=published` with no `view`, since a
 * library has one presentation. Working and All can carry a draft or scheduled
 * refinement. Published always takes its publication state from the scope.
 */
export function applyStoriesLocation(url: URL, location: StoriesLocation): URL {
  if (location.scope === "working") {
    url.searchParams.delete("scope");
    url.searchParams.set("view", location.view);
  } else {
    url.searchParams.set("scope", location.scope);
    url.searchParams.delete("view");
  }
  if (location.scope !== "published" && (location.publicationState === "draft" || location.publicationState === "scheduled")) {
    url.searchParams.set("publication_state", location.publicationState);
  } else {
    url.searchParams.delete("publication_state");
  }
  return url;
}

/* ----------------------------------------------- scope and saved filters */

/**
 * Filters that arrive from a saved view, an address or a built-in view, and the
 * scope they imply. `publicationState: "published"` is the Published scope, so it is
 * lifted out of the filters; draft and scheduled are refinements that only make
 * sense among unpublished stories, so they move a reader off Published.
 * Everything else keeps `current`.
 */
export function promoteScopeFromFilters(filters: Partial<PlanningFilters> | undefined, current: StoryScope): { scope: StoryScope; filters: PlanningFilters } {
  const normalized = normalizePlanningFilters(filters);
  if (normalized.publicationState === "published") return { scope: "published", filters: { ...normalized, publicationState: "" } };
  if (normalized.publicationState && current === "published") return { scope: "working", filters: normalized };
  return { scope: current, filters: normalized };
}

/**
 * The filters a saved view stores. Published is the only scope a stored view can
 * name (as the publication state it always had); Working and All are not stored.
 */
export function scopedViewFilters(filters: Partial<PlanningFilters>, scope: StoryScope): PlanningFilters {
  const normalized = normalizePlanningFilters(filters);
  return scope === "published" ? { ...normalized, publicationState: "published" } : normalized;
}

/* ------------------------------------------------------------ controls */

export type StoryFilterControl = "workflow" | "writer" | "editor" | "visual" | "deadline" | "planned" | "published" | "mine" | "unassigned" | "overdue" | "needsReview";

/**
 * The refinements each scope offers. A published story has no stage to steer,
 * deadline to chase or art to assign, so Published offers who and when it ran.
 * A refinement that is still on but not offered is shown as a removable chip, never silently applied.
 */
export const SCOPE_FILTER_CONTROLS: Record<StoryScope, readonly StoryFilterControl[]> = {
  working: ["workflow", "writer", "editor", "visual", "deadline", "planned", "mine", "unassigned", "overdue", "needsReview"],
  published: ["writer", "editor", "published", "mine"],
  all: ["workflow", "writer", "editor", "published", "mine", "unassigned"]
};

export const scopeOffersFilter = (scope: StoryScope, control: StoryFilterControl): boolean => SCOPE_FILTER_CONTROLS[scope].includes(control);

/* -------------------------------------------------------------- grouping */

export type PublishedDayGroup = { key: string; label: string; stories: PlanningStory[] };

/**
 * Consecutive stories published on the same newsroom-local day, labelled
 * Today / Yesterday / "Mon, Jun 29". Stories keep the order given (the list
 * is sorted by publication time); one with no time is gathered at the end.
 */
export function groupByPublishedDay(stories: readonly PlanningStory[], timezone: string, now = new Date()): PublishedDayGroup[] {
  const today = siteDay(now, timezone);
  const yesterday = today ? addDays(today, -1) : "";
  const groups: PublishedDayGroup[] = [];
  const undated: PlanningStory[] = [];
  for (const story of stories) {
    const publishedAt = story.publicationState.publishedAt;
    const day = publishedAt ? siteDay(publishedAt, timezone) : "";
    if (!day) { undated.push(story); continue; }
    const last = groups[groups.length - 1];
    if (last && last.key === day) { last.stories.push(story); continue; }
    groups.push({ key: day, label: publishedDayLabel(day, today, yesterday), stories: [story] });
  }
  if (undated.length) groups.push({ key: "undated", label: "Date unknown", stories: undated });
  return groups;
}

function publishedDayLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  const sameYear = today.slice(0, 4) === day.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}
