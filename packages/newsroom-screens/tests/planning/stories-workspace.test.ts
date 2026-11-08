import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PLANNING_SORT, DEFAULT_WORKFLOW_STATUSES, EMPTY_PLANNING_FILTERS } from "../../src/planning/planning-model";
import { createStoriesWorkspace, hasPlanningFilters, type StoriesWorkspaceData } from "../../src/planning/stories-workspace";
import { activeStoryView, applyBuiltInView, builtInStoryView, builtInViewFilters, thisWeekDeadlines } from "../../src/planning/story-views";

const data = (patch: Partial<StoriesWorkspaceData> = {}): StoriesWorkspaceData => ({
  stories: [], workflowStatuses: DEFAULT_WORKFLOW_STATUSES, timezone: "America/New_York", currentUserId: 7, savedViews: [], canSaveViews: true, savedViewsFull: false, ...patch
});

describe("the Stories workspace", () => {
  it("applies a view as normalized filters, its sort and its saved view", () => {
    const workspace = createStoriesWorkspace();
    workspace.applyView({ filters: { workflow: "reporting" } as never, sort: { key: "story", direction: "desc" }, savedViewId: "abc" });
    expect(workspace.getState()).toMatchObject({ filters: { ...EMPTY_PLANNING_FILTERS, workflow: "reporting" }, sort: { key: "story", direction: "desc" }, savedViewId: "abc" });
  });

  it("toggles one stage as the Workflow filter, keeping the other filters and the saved view", () => {
    const workspace = createStoriesWorkspace({ filters: { mine: true } });
    workspace.applyView({ filters: { ...EMPTY_PLANNING_FILTERS, mine: true }, sort: DEFAULT_PLANNING_SORT, savedViewId: "mine-view" });
    workspace.toggleWorkflow("reporting");
    expect(workspace.getState().filters).toEqual({ ...EMPTY_PLANNING_FILTERS, mine: true, workflow: "reporting" });
    workspace.toggleWorkflow("editing");
    expect(workspace.getState().filters.workflow).toBe("editing");
    workspace.toggleWorkflow("editing");
    expect(workspace.getState().filters).toEqual({ ...EMPTY_PLANNING_FILTERS, mine: true });
    expect(workspace.getState().savedViewId).toBe("mine-view");
  });

  it("toggles a writer, and Unassigned separately", () => {
    const workspace = createStoriesWorkspace();
    workspace.toggleWriter(4);
    expect(workspace.getState().filters.writerId).toBe(4);
    workspace.toggleWriter(5);
    expect(workspace.getState().filters.writerId).toBe(5);
    workspace.toggleWriter(5);
    expect(workspace.getState().filters.writerId).toBeNull();
    workspace.toggleWriter("unassigned");
    expect(workspace.getState().filters).toEqual({ ...EMPTY_PLANNING_FILTERS, unassigned: true });
    workspace.toggleWriter("unassigned");
    expect(workspace.getState().filters).toEqual(EMPTY_PLANNING_FILTERS);
  });

  it("notifies subscribers when data is published, and only when it changed", () => {
    const workspace = createStoriesWorkspace();
    const listener = vi.fn();
    const off = workspace.subscribe(listener);
    const published = data();
    workspace.publishData(published);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(workspace.getState().data).toBe(published);
    workspace.publishData({ ...published });
    expect(listener).toHaveBeenCalledTimes(1);
    workspace.publishData({ ...published, savedViewsFull: true });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    workspace.toggleWorkflow("pitch");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("applies an address's filters as a fresh view, and keeps the reader's view for an address that names none", () => {
    const workspace = createStoriesWorkspace();
    workspace.applyView({ filters: { ...EMPTY_PLANNING_FILTERS, workflow: "editing" }, sort: { key: "story", direction: "asc" }, savedViewId: "x" });
    expect(workspace.applyInitialFilters(undefined)).toBe(false);
    expect(workspace.applyInitialFilters({})).toBe(false);
    expect(workspace.getState().filters.workflow).toBe("editing");
    expect(workspace.applyInitialFilters({ needsReview: true })).toBe(true);
    expect(workspace.getState()).toMatchObject({ filters: { ...EMPTY_PLANNING_FILTERS, needsReview: true }, sort: DEFAULT_PLANNING_SORT, savedViewId: null });
    expect(hasPlanningFilters({ collectionId: 3 })).toBe(true);
  });

  it("opens the screen's saved-view dialogs only while the screen registered them", () => {
    const workspace = createStoriesWorkspace();
    const openSave = vi.fn();
    const openManage = vi.fn();
    workspace.openSaveView();
    workspace.setViewCommands({ openSave, openManage });
    workspace.openSaveView();
    workspace.openManageViews();
    workspace.setViewCommands(null);
    workspace.openManageViews();
    expect(openSave).toHaveBeenCalledTimes(1);
    expect(openManage).toHaveBeenCalledTimes(1);
  });
});

describe("Due this week", () => {
  it("runs from today through Sunday in the newsroom timezone", () => {
    expect(thisWeekDeadlines("2026-11-04")).toEqual({ deadlineFrom: "2026-11-04", deadlineTo: "2026-11-08" }); // Wednesday
    expect(thisWeekDeadlines("2026-11-08")).toEqual({ deadlineFrom: "2026-11-08", deadlineTo: "2026-11-08" }); // Sunday
    expect(thisWeekDeadlines("2026-11-09")).toEqual({ deadlineFrom: "2026-11-09", deadlineTo: "2026-11-15" }); // Monday
    // 03:00 UTC on Monday is still Sunday evening in New York.
    const now = new Date("2026-11-09T03:00:00Z");
    expect(builtInViewFilters(builtInStoryView("due-week")!, { now, timezone: "America/New_York" })).toMatchObject({ deadlineFrom: "2026-11-08", deadlineTo: "2026-11-08" });
  });

  it("is resolved when applied and stays active only while its dates are this week's", () => {
    const view = builtInStoryView("due-week")!;
    const now = new Date("2026-11-04T15:00:00Z");
    const applied = applyBuiltInView(view, { now, timezone: "UTC" });
    expect(applied.filters).toMatchObject({ deadlineFrom: "2026-11-04", deadlineTo: "2026-11-08" });
    expect(activeStoryView(applied.filters, applied.sort, [], null, { now, timezone: "UTC" })).toMatchObject({ kind: "built-in", view: { id: "due-week" } });
    expect(activeStoryView(applied.filters, applied.sort, [], null, { now: new Date("2026-11-10T15:00:00Z"), timezone: "UTC" }).kind).toBe("custom");
    // Its fixed filters are empty, and All stories still wins for no filters at all.
    expect(activeStoryView(EMPTY_PLANNING_FILTERS, DEFAULT_PLANNING_SORT, [], null, { now, timezone: "UTC" })).toMatchObject({ view: { id: "all" } });
  });
});
