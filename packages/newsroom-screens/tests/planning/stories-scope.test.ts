import { describe, expect, it } from "vitest";
import { planningFilterParams, parsePlanningFilterParams, storiesRouteFilters } from "../../src/planning/planning-api";
import { DEFAULT_PLANNING_SORT, DEFAULT_WORKFLOW_STATUSES, EMPTY_PLANNING_FILTERS, filterPlanningStories, sanitizePlanningFilters, sanitizePlanningSort, sortPlanningStories, storyHasOpenWork, type PlanningStory, type SavedPlanningView } from "../../src/planning/planning-model";
import {
  applyStoriesLocation,
  defaultScopeSort,
  firstSortDirection,
  groupByPublishedDay,
  normalizeStoryScope,
  presentationForScope,
  promoteScopeFromFilters,
  resolveStoriesRoute,
  scopedViewFilters,
  scopeOffersFilter,
  scopePresentations,
  storiesInScope,
  storyBelongsToScope,
  storyScopeCounts,
  STORY_SCOPE_IDS
} from "../../src/planning/stories-scope";
import { activeStoryView, applyBuiltInView, applySavedView, BUILT_IN_STORY_VIEWS, builtInViewsForScope } from "../../src/planning/story-views";
import { activeFilterChips } from "../../src/planning/StoryFilters";
import { storiesEmptyCopy } from "../../src/planning/StoriesEmpty";

const stage = (id: string) => DEFAULT_WORKFLOW_STATUSES.find((status) => status.id === id)!;
const published = (publishedAt: string | null) => ({ id: "published", label: "Published", isPublished: true, isScheduled: false, publishedAt });
const story = (id: number, patch: Partial<PlanningStory> = {}): PlanningStory => ({
  id, title: `Story ${id}`, editUrl: `/edit/${id}`, authors: [], writer: null, editor: null, workflow: stage("reporting"),
  publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: null, plannedPublication: null, modifiedAt: null,
  visual: { type: "none", status: "needed" }, openTaskCount: 0, featuredImage: null, ...patch
});

const draft = story(1, { title: "Draft" });
const scheduled = story(2, { title: "Scheduled", publicationState: { id: "scheduled", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-11-12T15:00:00Z" } });
const finished = story(3, { title: "Finished", workflow: stage("published"), publicationState: published("2026-11-01T15:00:00Z") });
const withTask = story(4, { title: "Still has a task", workflow: stage("published"), openTaskCount: 1, publicationState: published("2026-11-03T15:00:00Z") });
const neverDated = story(5, { title: "No time", workflow: stage("published"), publicationState: published(null) });
const everyone = [draft, scheduled, finished, withTask, neverDated];

describe("scope normalization", () => {
  it("is the work queue unless the address names a real scope", () => {
    expect(STORY_SCOPE_IDS).toEqual(["working", "published", "all"]);
    expect(["published", "all", "working"].map(normalizeStoryScope)).toEqual(["published", "all", "working"]);
    expect([undefined, null, "", "PUBLISHED", "archive", 4].map(normalizeStoryScope)).toEqual(["working", "working", "working", "working", "working", "working"]);
  });
});

describe("which scope a story belongs to", () => {
  it("Working holds unfinished stories, and a published story only while it has open work", () => {
    expect(storiesInScope(everyone, "working").map((item) => item.title)).toEqual(["Draft", "Scheduled", "Still has a task"]);
    expect(storyBelongsToScope(draft, "working")).toBe(true);
    expect(storyBelongsToScope(withTask, "working")).toBe(true);
    expect(storyBelongsToScope(finished, "working")).toBe(false);
  });

  it("keeps the open-work rule the List always used", () => {
    expect([finished, withTask, story(6, { workflow: stage("published"), publicationState: published("2026-11-01T00:00:00Z"), needsReview: true }), story(7, { workflow: stage("published"), publicationState: published("2026-11-01T00:00:00Z"), visual: { type: "photo", status: "assigned" } })].map(storyHasOpenWork)).toEqual([false, true, true, true]);
  });

  it("Published holds every published story, finished or not, and nothing unpublished", () => {
    expect(storiesInScope(everyone, "published").map((item) => item.title)).toEqual(["Finished", "Still has a task", "No time"]);
  });

  it("All holds everything", () => {
    expect(storiesInScope(everyone, "all")).toHaveLength(5);
  });

  it("counts each scope from the stories already loaded", () => {
    expect(storyScopeCounts(everyone)).toEqual({ working: 3, published: 3, all: 5 });
    expect(storyScopeCounts([])).toEqual({ working: 0, published: 0, all: 0 });
  });
});

describe("published ordering", () => {
  const early = story(10, { workflow: stage("published"), publicationState: published("2026-10-01T12:00:00Z"), plannedPublication: "2026-12-25" });
  const late = story(11, { workflow: stage("published"), publicationState: published("2026-11-05T12:00:00Z"), plannedPublication: "2026-09-01" });
  const undated = story(12, { workflow: stage("published"), publicationState: published(null) });

  it("sorts on when the story went live, not on its plan", () => {
    expect(sortPlanningStories([early, late], { key: "published", direction: "desc" }).map((item) => item.id)).toEqual([11, 10]);
    expect(sortPlanningStories([late, early], { key: "published", direction: "asc" }).map((item) => item.id)).toEqual([10, 11]);
    expect(sortPlanningStories([early, late], { key: "planned", direction: "desc" }).map((item) => item.id)).toEqual([10, 11]);
  });

  it("puts a story with no publication time last, whichever way the dates run", () => {
    expect(sortPlanningStories([undated, early, late], { key: "published", direction: "desc" }).map((item) => item.id)).toEqual([11, 10, 12]);
    expect(sortPlanningStories([undated, early, late], { key: "published", direction: "asc" }).map((item) => item.id)).toEqual([10, 11, 12]);
  });

  it("uses the scheduled time ahead of the plan in the mixed library", () => {
    const scheduledWithPlan = { ...scheduled, plannedPublication: "2026-09-01" };
    expect(sortPlanningStories([scheduledWithPlan, late], { key: "publication", direction: "asc" }).map((item) => item.id)).toEqual([late.id, scheduled.id]);
  });

  it("opens each scope in its own order", () => {
    expect(defaultScopeSort("working")).toEqual(DEFAULT_PLANNING_SORT);
    expect(defaultScopeSort("published")).toEqual({ key: "published", direction: "desc" });
    expect(defaultScopeSort("all")).toEqual({ key: "modified", direction: "desc" });
    expect(firstSortDirection("published")).toBe("desc");
    expect(firstSortDirection("deadline")).toBe("asc");
  });

  it("is a sort a saved view may keep", () => {
    expect(sanitizePlanningSort({ key: "published", direction: "desc" })).toEqual({ key: "published", direction: "desc" });
    expect(sanitizePlanningSort({ key: "publication", direction: "asc" })).toEqual({ key: "publication", direction: "asc" });
  });
});

describe("presentations", () => {
  it("offers Board and List (and Calendar, when the host has one) only in Working", () => {
    expect(scopePresentations("working", false)).toEqual(["board", "list"]);
    expect(scopePresentations("working", true)).toEqual(["board", "list", "calendar"]);
    expect(scopePresentations("published", true)).toEqual(["list"]);
    expect(scopePresentations("all", true)).toEqual(["list"]);
  });

  it("renders the list in a library even when the Working choice was Board, and returns to that choice", () => {
    expect(presentationForScope("published", "board", false)).toBe("list");
    expect(presentationForScope("all", "calendar", true)).toBe("list");
    expect(presentationForScope("working", "board", false)).toBe("board");
    expect(presentationForScope("working", "calendar", false)).toBe("board");
    expect(presentationForScope("working", "calendar", true)).toBe("calendar");
  });
});

describe("addresses", () => {
  const route = (query: string) => resolveStoriesRoute(new URLSearchParams(query));

  it("reads scope and view; Working is implied", () => {
    expect(route("")).toEqual({ scope: "working", view: null });
    expect(route("view=list")).toEqual({ scope: "working", view: "list" });
    expect(route("scope=published")).toEqual({ scope: "published", view: null });
    expect(route("scope=all&view=list")).toEqual({ scope: "all", view: "list" });
  });

  it("treats an unknown scope as Working", () => {
    expect(route("scope=archive")).toEqual({ scope: "working", view: null });
  });

  it("keeps an impossible scope and view together for the page to settle (Published is never a board)", () => {
    expect(route("scope=published&view=board")).toEqual({ scope: "published", view: "board" });
    expect(presentationForScope(route("scope=published&view=board").scope, route("scope=published&view=board").view ?? "board", false)).toBe("list");
  });

  it("opens an old publication_state=published link on Published", () => {
    expect(route("publication_state=published")).toEqual({ scope: "published", view: null });
    expect(route("publication_state=published&view=list")).toEqual({ scope: "published", view: "list" });
    expect(route("publication_state=draft")).toEqual({ scope: "working", view: null });
    // And that link's filters, once the page lifts the state out of them, are an ordinary Published scope.
    const filters = storiesRouteFilters(new URLSearchParams("publication_state=published&writer=4"));
    expect(promoteScopeFromFilters(filters, "working")).toMatchObject({ scope: "published", filters: { publicationState: "", writerId: 4 } });
  });

  it("writes Working as view=, a library as scope=, and drops the legacy parameter", () => {
    const write = (href: string, scope: "working" | "published" | "all", view: "board" | "list" | "calendar", publicationState?: string) => { const url = applyStoriesLocation(new URL(href), { scope, view, publicationState }); return `${url.pathname}${url.search}`; };
    expect(write("http://x/stories", "working", "board")).toBe("/stories?view=board");
    expect(write("http://x/stories?scope=published", "working", "list")).toBe("/stories?view=list");
    expect(write("http://x/stories?view=board", "published", "list")).toBe("/stories?scope=published");
    expect(write("http://x/stories?view=list&collection=4", "all", "list")).toBe("/stories?collection=4&scope=all");
    expect(write("http://x/stories?publication_state=published", "working", "board")).toBe("/stories?view=board");
    expect(write("http://x/stories?publication_state=draft", "working", "board", "draft")).toBe("/stories?publication_state=draft&view=board");
    expect(write("http://x/stories?publication_state=scheduled", "published", "list")).toBe("/stories?scope=published");
    expect(write("http://x/stories?publication_state=draft", "all", "list")).toBe("/stories?scope=all");
  });

  it("round-trips: what is written is what is read", () => {
    for (const scope of STORY_SCOPE_IDS) {
      const url = applyStoriesLocation(new URL("http://x/stories?workflow=reporting"), { scope, view: "list" });
      expect(resolveStoriesRoute(url.searchParams).scope).toBe(scope);
    }
  });
});

describe("saved views and old filters", () => {
  it("lifts Published out of the filters into the scope", () => {
    expect(promoteScopeFromFilters({ publicationState: "published", writerId: 4 }, "working")).toMatchObject({ scope: "published", filters: { publicationState: "", writerId: 4 } });
    expect(promoteScopeFromFilters({ publicationState: "published" }, "all").scope).toBe("published");
  });

  it("moves a Draft or Scheduled view off Published, and leaves every other scope where it is", () => {
    expect(promoteScopeFromFilters({ publicationState: "draft" }, "published")).toMatchObject({ scope: "working", filters: { publicationState: "draft" } });
    expect(promoteScopeFromFilters({ publicationState: "scheduled" }, "all").scope).toBe("all");
    expect(promoteScopeFromFilters({ mine: true }, "published").scope).toBe("published");
    expect(promoteScopeFromFilters(undefined, "working")).toMatchObject({ scope: "working", filters: EMPTY_PLANNING_FILTERS });
  });

  it("stores Published as the publication state it always was", () => {
    expect(scopedViewFilters({ mine: true }, "published")).toMatchObject({ mine: true, publicationState: "published" });
    expect(scopedViewFilters({ mine: true }, "working").publicationState).toBe("");
    expect(scopedViewFilters({ mine: true }, "all").publicationState).toBe("");
  });

  const savedPublished: SavedPlanningView = { id: "pub", name: "Published by me", filters: { ...EMPTY_PLANNING_FILTERS, publicationState: "published", mine: true }, sort: { key: "deadline", direction: "asc" } };

  it("an old saved view for published stories opens Published and reads as unmodified there", () => {
    const applied = applySavedView(savedPublished);
    const promoted = promoteScopeFromFilters(applied.filters, "working");
    expect(promoted.scope).toBe("published");
    expect(activeStoryView(promoted.filters, applied.sort, [savedPublished], applied.savedViewId, promoted.scope)).toEqual({ kind: "saved", view: savedPublished, modified: false });
    // In Working it would be a different set of stories, so it is not silently the same view.
    expect(activeStoryView(promoted.filters, applied.sort, [savedPublished], applied.savedViewId, "working")).toMatchObject({ modified: true });
  });

  it("an old saved view without a publication state stays in the scope the reader is in", () => {
    const saved: SavedPlanningView = { id: "mine", name: "Mine", filters: { ...EMPTY_PLANNING_FILTERS, mine: true }, sort: { key: "deadline", direction: "asc" } };
    expect(promoteScopeFromFilters(applySavedView(saved).filters, "working").scope).toBe("working");
  });

  it("loads filters saved before published dates existed", () => {
    expect(sanitizePlanningFilters({ mine: true, publicationState: "published" })).toMatchObject({ mine: true, publicationState: "published", publishedFrom: "", publishedTo: "" });
  });

  it("has no Published built-in view: the scope is that", () => {
    expect(BUILT_IN_STORY_VIEWS.map((view) => view.id)).not.toContain("published");
    expect(builtInViewsForScope("published").map((view) => view.id)).toEqual(["all", "mine"]);
    expect(builtInViewsForScope("working").map((view) => view.id)).toContain("overdue");
    expect(builtInViewsForScope("all").map((view) => view.id)).not.toContain("overdue");
  });

  it("a built-in view refines the scope it is chosen in, with that scope's order", () => {
    const mine = BUILT_IN_STORY_VIEWS.find((view) => view.id === "mine")!;
    expect(applyBuiltInView(mine, "published")).toMatchObject({ scope: "published", sort: { key: "published", direction: "desc" }, savedViewId: null });
    expect(applyBuiltInView(mine)).toMatchObject({ scope: "working", sort: DEFAULT_PLANNING_SORT });
    // Published without refinements is still "All stories" among published stories, not a custom view.
    expect(activeStoryView(EMPTY_PLANNING_FILTERS, defaultScopeSort("published"), [], null, "published")).toMatchObject({ kind: "built-in", view: { id: "all" } });
  });
});

describe("published dates", () => {
  const monday = story(20, { workflow: stage("published"), publicationState: published("2026-11-02T15:00:00Z") });
  const friday = story(21, { workflow: stage("published"), publicationState: published("2026-11-06T15:00:00Z") });

  it("filters on when a story went live", () => {
    expect(filterPlanningStories([monday, friday, draft], { publishedFrom: "2026-11-05" }).map((item) => item.id)).toEqual([21]);
    expect(filterPlanningStories([monday, friday], { publishedTo: "2026-11-03" }).map((item) => item.id)).toEqual([20]);
    // A story with no publication time is never in a published range.
    expect(filterPlanningStories([draft, neverDated], { publishedFrom: "2026-01-01" })).toEqual([]);
  });

  it("filters on the publication day in the supplied newsroom timezone", () => {
    const overnight = story(22, { publicationState: published("2026-11-10T05:15:00Z") });
    const day = { publishedFrom: "2026-11-10", publishedTo: "2026-11-10" };
    expect(filterPlanningStories([overnight], day, undefined, undefined, "America/New_York")).toEqual([overnight]);
    expect(filterPlanningStories([overnight], day, undefined, undefined, "America/Los_Angeles")).toEqual([]);
  });

  it("round-trips through the query string and a saved view", () => {
    const filters = { ...EMPTY_PLANNING_FILTERS, publishedFrom: "2026-11-01", publishedTo: "2026-11-30" };
    expect(planningFilterParams(filters)).toMatchObject({ published_from: "2026-11-01", published_to: "2026-11-30" });
    expect(parsePlanningFilterParams(new URLSearchParams(planningFilterParams(filters) as Record<string, string>))).toMatchObject({ publishedFrom: "2026-11-01", publishedTo: "2026-11-30" });
    expect(sanitizePlanningFilters({ publishedFrom: "not a date", publishedTo: "2026-11-30" })).toMatchObject({ publishedFrom: "", publishedTo: "2026-11-30" });
  });
});

describe("what each scope offers to refine", () => {
  it("keeps stage and deadline controls in Working, and who and when it ran in Published", () => {
    expect(["workflow", "deadline", "overdue", "visual"].map((control) => scopeOffersFilter("working", control as never))).toEqual([true, true, true, true]);
    expect(["workflow", "deadline", "overdue", "visual", "planned"].map((control) => scopeOffersFilter("published", control as never))).toEqual([false, false, false, false, false]);
    expect(["writer", "editor", "published", "mine"].map((control) => scopeOffersFilter("published", control as never))).toEqual([true, true, true, true]);
    expect(scopeOffersFilter("all", "workflow")).toBe(true);
    expect(scopeOffersFilter("all", "overdue")).toBe(false);
  });

  it("never leaves a filter applied unseen: one the scope does not offer becomes a chip", () => {
    const context = (scope: "working" | "published") => ({ scope, statuses: DEFAULT_WORKFLOW_STATUSES, writers: [{ id: 4, name: "Matt Cebedo" }], editors: [] });
    const filters = { ...EMPTY_PLANNING_FILTERS, workflow: "reporting", overdue: true, publicationState: "draft" };
    expect(activeFilterChips(filters, context("working")).map((chip) => chip.label)).toEqual(["Draft", "Overdue"]);
    expect(activeFilterChips(filters, context("published")).map((chip) => chip.label)).toEqual(["Workflow: Reporting", "Draft", "Overdue"]);
    expect(activeFilterChips({ ...EMPTY_PLANNING_FILTERS, publicationState: "published" }, context("published")).map((chip) => chip.label)).toEqual(["published"]);
  });
});

describe("grouping Published by day", () => {
  const timezone = "America/Los_Angeles";
  const now = new Date("2026-11-08T20:00:00Z");
  const at = (id: number, publishedAt: string | null) => story(id, { workflow: stage("published"), publicationState: published(publishedAt) });

  it("labels newsroom-local days Today and Yesterday, then the date, and gathers the undated", () => {
    const groups = groupByPublishedDay([
      at(1, "2026-11-08T22:14:00Z"),
      at(2, "2026-11-08T19:42:00Z"),
      at(3, "2026-11-07T20:00:00Z"),
      at(4, "2026-06-29T18:00:00Z"),
      at(5, null),
      at(6, "2025-12-31T18:00:00Z")
    ], timezone, now);
    expect(groups.map((group) => [group.label, group.stories.map((item) => item.id)])).toEqual([
      ["Today", [1, 2]],
      ["Yesterday", [3]],
      ["Mon, Jun 29", [4]],
      ["Wed, Dec 31, 2025", [6]],
      ["Date unknown", [5]]
    ]);
  });

  it("reads the day in the newsroom's timezone, not UTC", () => {
    // 03:00 UTC on Nov 8 is still Nov 7 in Los Angeles.
    expect(groupByPublishedDay([at(1, "2026-11-08T03:00:00Z")], timezone, now)[0]?.label).toBe("Yesterday");
  });
});

describe("empty states", () => {
  it("say something true of each scope, and point at the filters when they are on", () => {
    expect(storiesEmptyCopy("working", false).title).toBe("No stories in progress");
    expect(storiesEmptyCopy("published", false).title).toBe("No published stories");
    expect(storiesEmptyCopy("all", false).title).toBe("No stories match");
    for (const scope of STORY_SCOPE_IDS) {
      expect(storiesEmptyCopy(scope, true).description).toMatch(/filters/i);
      expect(storiesEmptyCopy(scope, false).description).not.toMatch(/filters|show published/i);
    }
  });
});
