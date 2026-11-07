import { describe, expect, it } from "vitest";
import {
  applyPlanningMove,
  EMPTY_PLANNING_FILTERS,
  filterPlanningStories,
  planningCalendarEvents,
  replacePlanningStory,
  sortPlanningStories,
  storyDateSemantics,
  type PlanningStory
} from "@byline/newsroom-screens/planning/planning-model";
import { normalizeSavedPlanningViews, SAVED_VIEW_LIMIT, SAVED_VIEW_NAME_MAX_LENGTH } from "@byline/newsroom-screens/planning/story-views";

function story(overrides: Partial<PlanningStory> = {}): PlanningStory {
  return {
    id: 1,
    title: "Campus story",
    editUrl: "/wp-admin/post.php?post=1&action=edit",
    authors: [{ id: 2, name: "Writer" }],
    writer: { id: 2, name: "Writer" },
    editor: null,
    workflow: { id: "writing", label: "Writing", group: "main", selectable: true },
    publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false },
    deadline: "2026-08-28",
    plannedPublication: "2026-08-30",
    modifiedAt: "2026-08-27T12:00:00Z",
    visual: { type: "photo", status: "needed" },
    openTaskCount: 2,
    featuredImage: null,
    ...overrides
  };
}

describe("planning model", () => {
  it("keeps deadline, planned, scheduled, and published dates distinct", () => {
    const value = story({
      publicationState: {
        id: "scheduled",
        label: "Scheduled",
        isPublished: false,
        isScheduled: true,
        scheduledAt: "2026-08-31T14:00:00Z",
        publishedAt: null
      }
    });
    const dates = storyDateSemantics(value);
    expect(dates.deadline.value).toBe("2026-08-28");
    expect(dates.plannedPublication.value).toBe("2026-08-30");
    expect(dates.scheduled.value).toBe("2026-08-31T14:00:00Z");
    expect(dates.published.value).toBeNull();
  });

  it("filters by mine and does not mutate the source when sorting", () => {
    const first = story({ id: 1, title: "Zebra" });
    const second = story({ id: 2, title: "Alpha", writer: { id: 8, name: "Other" }, authors: [{ id: 8, name: "Other" }] });
    const source = [first, second];
    expect(filterPlanningStories(source, { mine: true }, 2)).toEqual([first]);
    expect(sortPlanningStories(source, { key: "story", direction: "asc" }).map((item) => item.id)).toEqual([2, 1]);
    expect(source.map((item) => item.id)).toEqual([1, 2]);
  });

  it("rejects derived Published as a move target and preserves optimistic move semantics", () => {
    const statuses = [
      { id: "writing", label: "Writing", group: "main" as const, selectable: true },
      { id: "ready", label: "Ready for Review", group: "main" as const, selectable: true },
      { id: "published", label: "Published", group: "derived" as const, selectable: false }
    ];
    const draft = story();
    expect(applyPlanningMove(draft, "ready", statuses).story.workflow.id).toBe("ready");
    expect(applyPlanningMove(draft, "published", statuses).moved).toBe(false);
    expect(applyPlanningMove(story({ publicationState: { ...draft.publicationState, isPublished: true } }), "ready", statuses).moved).toBe(false);
  });

  it("rolls back only the failed story and ignores a late response for a newer story state", () => {
    const target = story({ id: 1, title: "Target" });
    const sibling = story({ id: 2, title: "Sibling" });
    const optimisticTarget = { ...target, deadline: "2026-09-01" };
    const updatedSibling = { ...sibling, title: "Sibling updated elsewhere" };

    expect(replacePlanningStory([optimisticTarget, updatedSibling], target.id, target, optimisticTarget)).toEqual([target, updatedSibling]);
    expect(replacePlanningStory([{ ...optimisticTarget, deadline: "2026-09-02" }, updatedSibling], target.id, target, optimisticTarget)).toEqual([{ ...optimisticTarget, deadline: "2026-09-02" }, updatedSibling]);
  });

  it("normalizes stored saved views: drops malformed records, sanitizes filters and sort, enforces the limits", () => {
    const sort = { key: "story" as const, direction: "desc" as const };
    expect(normalizeSavedPlanningViews(null)).toEqual([]);
    expect(normalizeSavedPlanningViews({ id: "a" })).toEqual([]);
    const views = normalizeSavedPlanningViews([
      { id: "a", name: "  Mine  ", filters: { mine: "1", workflow: "<b>", writerId: "-4", deadlineFrom: "2026-13-40", publicationState: "publish" }, sort, ownerId: 8 },
      { id: "a", name: "Duplicate id", filters: {}, sort },
      { id: "../b", name: "Unsafe id", filters: {}, sort },
      { id: "c", name: "   ", filters: {}, sort },
      { id: "d", name: "No filters", sort },
      { id: "e", name: "x".repeat(200), filters: {}, sort: { key: "secret", direction: "sideways" } },
      "not a view"
    ]);
    expect(views.map((view) => view.id)).toEqual(["a", "e"]);
    expect(views[0]).toEqual({ id: "a", name: "Mine", filters: { ...EMPTY_PLANNING_FILTERS, mine: true }, sort });
    expect(views[1].name).toHaveLength(SAVED_VIEW_NAME_MAX_LENGTH);
    expect(views[1].sort).toEqual({ key: "deadline", direction: "asc" });
    const many = Array.from({ length: SAVED_VIEW_LIMIT + 5 }, (_, index) => ({ id: `v${index}`, name: `View ${index}`, filters: {}, sort }));
    expect(normalizeSavedPlanningViews(many)).toHaveLength(SAVED_VIEW_LIMIT);
  });

  it("emits separate calendar events for editorial and WordPress dates", () => {
    const events = planningCalendarEvents([story({ publicationState: { id: "scheduled", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-08-31T12:00:00Z", publishedAt: null } })]);
    expect(events.map((event) => event.type)).toEqual(["deadline", "planned", "scheduled"]);
  });
});
