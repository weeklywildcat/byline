import { describe, expect, it } from "vitest";
import {
  applyPlanningMove,
  deserializeSavedPlanningView,
  EMPTY_PLANNING_FILTERS,
  filterPlanningStories,
  filterSavedViewsForUser,
  planningCalendarEvents,
  replacePlanningStory,
  serializeSavedPlanningView,
  sortPlanningStories,
  storyDateSemantics,
  type PlanningStory,
  type SavedPlanningView
} from "./planning-model";

function story(overrides: Partial<PlanningStory> = {}): PlanningStory {
  return {
    id: 1,
    title: "Campus story",
    editUrl: "/wp-admin/post.php?post=1&action=edit",
    authors: [{ id: 2, name: "Writer" }],
    writer: { id: 2, name: "Writer" },
    editor: null,
    workflow: { id: "writing", label: "Writing", group: "main", selectable: true },
    wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false },
    deadline: "2026-08-28",
    plannedPublication: "2026-08-30",
    modifiedAt: "2026-08-27T12:00:00Z",
    visual: { type: "photo", status: "needed" },
    openTaskCount: 2,
    coverage: [],
    featuredImage: null,
    ...overrides
  };
}

describe("planning model", () => {
  it("keeps deadline, planned, scheduled, and published dates distinct", () => {
    const value = story({
      wordpressState: {
        id: "future",
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
    expect(applyPlanningMove(story({ wordpressState: { ...draft.wordpressState, isPublished: true } }), "ready", statuses).moved).toBe(false);
  });

  it("rolls back only the failed story and ignores a late response for a newer story state", () => {
    const target = story({ id: 1, title: "Target" });
    const sibling = story({ id: 2, title: "Sibling" });
    const optimisticTarget = { ...target, deadline: "2026-09-01" };
    const updatedSibling = { ...sibling, title: "Sibling updated elsewhere" };

    expect(replacePlanningStory([optimisticTarget, updatedSibling], target.id, target, optimisticTarget)).toEqual([target, updatedSibling]);
    expect(replacePlanningStory([{ ...optimisticTarget, deadline: "2026-09-02" }, updatedSibling], target.id, target, optimisticTarget)).toEqual([{ ...optimisticTarget, deadline: "2026-09-02" }, updatedSibling]);
  });

  it("isolates saved views by owner and round-trips their normalized payload", () => {
    const views: SavedPlanningView[] = [
      { id: "mine", name: "Mine", ownerId: 7, filters: { ...EMPTY_PLANNING_FILTERS }, sort: { key: "deadline" as const, direction: "asc" as const } },
      { id: "other", name: "Other", ownerId: 8, filters: { ...EMPTY_PLANNING_FILTERS }, sort: { key: "story" as const, direction: "desc" as const } }
    ];
    expect(filterSavedViewsForUser(views, 7).map((item) => item.id)).toEqual(["mine"]);
    expect(deserializeSavedPlanningView(serializeSavedPlanningView(views[0]), 7)?.name).toBe("Mine");
    expect(deserializeSavedPlanningView(serializeSavedPlanningView(views[1]), 7)).toBeNull();
  });

  it("emits separate calendar events for editorial and WordPress dates", () => {
    const events = planningCalendarEvents([story({ wordpressState: { id: "future", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-08-31T12:00:00Z", publishedAt: null } })]);
    expect(events.map((event) => event.type)).toEqual(["deadline", "planned", "scheduled"]);
  });
});
