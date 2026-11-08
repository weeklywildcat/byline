// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@byline/newsroom-ui/ui/sidebar";
import { DEFAULT_WORKFLOW_STATUSES, EMPTY_PLANNING_FILTERS, type PlanningPerson, type PlanningStory } from "../../src/planning/planning-model";
import { StoriesNavigator, StoriesNavigatorCount, STORIES_NAVIGATOR_WRITER_LIMIT } from "../../src/planning/StoriesNavigator";
import { createStoriesWorkspace, type StoriesWorkspace, type StoriesWorkspaceData } from "../../src/planning/stories-workspace";
import { builtInStoryView, storyViewCount } from "../../src/planning/story-views";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stage = (id: string) => DEFAULT_WORKFLOW_STATUSES.find((status) => status.id === id)!;
const person = (id: number, name: string): PlanningPerson => ({ id, name, kind: "user" });
const maya = person(5, "Maya Torres");
const jordan = person(4, "Jordan Lee");
const story = (id: number, workflow: string, patch: Partial<PlanningStory> = {}): PlanningStory => ({
  id, title: `Story ${id}`, editUrl: `/edit/${id}`, authors: [], writer: null, editor: null, workflow: stage(workflow),
  publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: null, plannedPublication: null, modifiedAt: null,
  visual: { type: "none", status: "done" }, openTaskCount: 0, featuredImage: null, ...patch
});
const editor = person(9, "Editor");
const stories = [
  story(1, "pitch", { writer: maya, editor }),
  story(2, "reporting", { writer: maya, editor: null }),
  story(3, "reporting", { writer: jordan, editor, deadline: "2020-01-01" }),
  story(4, "on-hold", { writer: jordan, editor }),
  story(5, "dropped", { writer: maya, editor })
];
const data = (patch: Partial<StoriesWorkspaceData> = {}): StoriesWorkspaceData => ({
  stories, workflowStatuses: DEFAULT_WORKFLOW_STATUSES, timezone: "UTC", currentUserId: 5, savedViews: [], canSaveViews: true, savedViewsFull: false, ...patch
});

let host: HTMLDivElement;
let root: Root | null = null;
let workspace: StoriesWorkspace;
const $ = (selector: string) => host.querySelector<HTMLElement>(selector);
const countOf = (selector: string) => $(selector)?.parentElement?.querySelector<HTMLElement>("[data-count]");

function render(onChosen?: () => void) {
  root = createRoot(host);
  act(() => root!.render(<SidebarProvider><StoriesNavigatorCount workspace={workspace} /><StoriesNavigator workspace={workspace} onChosen={onChosen} /></SidebarProvider>));
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  host = document.createElement("div");
  document.body.append(host);
  workspace = createStoriesWorkspace();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("the Stories navigator", () => {
  it("waits for the screen's stories before counting", () => {
    render();
    expect(host.querySelector("[role=status]")?.getAttribute("aria-label")).toBe("Loading story views");
    expect(host.querySelector("nav")).toBeNull();
  });

  it("counts each view as storyViewCount does, over the published stories", () => {
    workspace.publishData(data());
    render();
    expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe("Stories views");
    for (const id of ["all", "mine", "overdue", "unassigned"]) {
      expect(Number(countOf(`[data-stories-view="${id}"]`)?.textContent)).toBe(storyViewCount(stories, builtInStoryView(id)!, 5, new Date(), "UTC"));
    }
    expect(countOf('[data-stories-view="all"]')?.textContent).toBe("4");
    expect(countOf('[data-stories-view="overdue"]')?.getAttribute("aria-label")).toBe("1 overdue story");
    expect(host.textContent).toContain("4 stories");
  });

  it("hides views that hold nothing, except All stories, My stories and the active view", () => {
    workspace.publishData(data({ currentUserId: 99 }));
    render();
    expect($('[data-stories-view="mine"]')).not.toBeNull();
    expect(countOf('[data-stories-view="mine"]')?.textContent).toBe("0");
    expect($('[data-stories-view="review"]')).toBeNull();
    expect($('[data-stories-view="art-needed"]')).toBeNull();
    act(() => workspace.applyView({ filters: { ...EMPTY_PLANNING_FILTERS, needsReview: true }, sort: workspace.getState().sort, savedViewId: null }));
    expect($('[data-stories-view="review"]')?.getAttribute("aria-current")).toBe("true");
  });

  it("colours Overdue as a warning only when it holds stories", () => {
    workspace.publishData(data());
    render();
    expect(countOf('[data-stories-view="overdue"]')?.className).toContain("text-warning");
    act(() => workspace.publishData(data({ stories: stories.filter((item) => item.id !== 3) })));
    expect($('[data-stories-view="overdue"]')).toBeNull();
    act(() => workspace.applyView({ filters: { ...EMPTY_PLANNING_FILTERS, overdue: true }, sort: workspace.getState().sort, savedViewId: null }));
    expect(countOf('[data-stories-view="overdue"]')?.textContent).toBe("0");
    expect(countOf('[data-stories-view="overdue"]')?.className).not.toContain("text-warning");
  });

  it("lists every stage in board order, empty ones quietly, and toggles one as the Workflow filter", () => {
    workspace.publishData(data());
    const onChosen = vi.fn();
    render(onChosen);
    const stages = Array.from(host.querySelectorAll<HTMLElement>("[data-stories-stage]")).map((item) => item.dataset.storiesStage);
    expect(stages).toEqual(["pitch", "assigned", "reporting", "writing", "editing", "ready", "on-hold", "dropped"]);
    expect(countOf('[data-stories-stage="reporting"]')?.textContent).toBe("2");
    expect(countOf('[data-stories-stage="dropped"]')?.textContent).toBe("1");
    expect(countOf('[data-stories-stage="assigned"]')?.className).toContain("text-muted-foreground/60");
    act(() => $('[data-stories-stage="reporting"]')!.click());
    expect(workspace.getState().filters.workflow).toBe("reporting");
    expect($('[data-stories-stage="reporting"]')?.getAttribute("aria-current")).toBe("true");
    expect(onChosen).toHaveBeenCalledTimes(1);
    act(() => $('[data-stories-stage="reporting"]')!.click());
    expect(workspace.getState().filters.workflow).toBe("");
  });

  it("lists writers by their active stories, then Unassigned, and toggles them", () => {
    workspace.publishData(data());
    render();
    const writers = Array.from(host.querySelectorAll<HTMLElement>("[data-stories-writer]")).map((item) => item.dataset.storiesWriter);
    expect(writers).toEqual(["4", "5", "unassigned"]);
    expect(countOf('[data-stories-writer="5"]')?.getAttribute("aria-label")).toBe("2 stories by Maya Torres");
    expect(countOf('[data-stories-writer="unassigned"]')?.textContent).toBe("1");
    act(() => $('[data-stories-writer="5"]')!.click());
    expect(workspace.getState().filters.writerId).toBe(5);
    expect($('[data-stories-writer="5"]')?.getAttribute("aria-current")).toBe("true");
    act(() => $('[data-stories-writer="unassigned"]')!.click());
    expect(workspace.getState().filters).toMatchObject({ writerId: 5, unassigned: true });
  });

  it("shows at most eight writers until asked for all of them", () => {
    const many = Array.from({ length: STORIES_NAVIGATOR_WRITER_LIMIT + 2 }, (_, index) => story(100 + index, "pitch", { writer: person(100 + index, `Writer ${index}`) }));
    workspace.publishData(data({ stories: many }));
    render();
    const listed = () => host.querySelectorAll('[data-stories-writer]:not([data-stories-writer="unassigned"])').length;
    expect(listed()).toBe(STORIES_NAVIGATOR_WRITER_LIMIT);
    act(() => Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.startsWith("Show all"))!.click());
    expect(listed()).toBe(STORIES_NAVIGATOR_WRITER_LIMIT + 2);
  });

  it("lists saved views, marks a modified one, and opens the screen's dialogs", () => {
    const saved = { id: "mine-reporting", name: "Reporting", filters: { ...EMPTY_PLANNING_FILTERS, workflow: "reporting" }, sort: workspace.getState().sort };
    const openSave = vi.fn();
    const openManage = vi.fn();
    workspace.setViewCommands({ openSave, openManage });
    workspace.publishData(data({ savedViews: [saved] }));
    render();
    act(() => $('[data-stories-saved-view="mine-reporting"]')!.click());
    expect(workspace.getState()).toMatchObject({ savedViewId: "mine-reporting", filters: { workflow: "reporting" } });
    act(() => workspace.toggleWriter(4));
    expect($('[data-stories-saved-view="mine-reporting"]')?.textContent).toBe("Reporting (modified)");
    const button = (label: string) => Array.from(host.querySelectorAll("button")).find((item) => item.textContent === label)!;
    act(() => button("Save current view…").click());
    act(() => button("Manage views…").click());
    expect(openSave).toHaveBeenCalledTimes(1);
    expect(openManage).toHaveBeenCalledTimes(1);
  });
});
