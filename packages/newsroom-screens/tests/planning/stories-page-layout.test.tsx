// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import { StoriesPage, type StoriesPageProps } from "../../src/planning/StoriesPage";
import { BOARD_LAYOUT_PREFERENCE_KEY } from "../../src/planning/stories-board-layout";
import { StoryPeekHost } from "../../src/story/StoryPeekHost";
import type { PlanningFetchers } from "../../src/planning/planning-api";
import type { StoryFetchers } from "../../src/story/story-fetchers";

/**
 * The board layout is a reader preference: it appears only on Board, and
 * choosing one changes neither the address, the filters nor the saved view.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;
let fetchers: PlanningFetchers & StoryFetchers;
const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function click(element: HTMLElement | null | undefined) {
  expect(element).toBeTruthy();
  await act(async () => { element!.click(); });
  await settle();
}
async function mount(props: Partial<StoriesPageProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  await act(async () => {
    root!.render(<AdminPortalContext value={document.body}><QueryClientProvider client={client}><StoryPeekHost fetchers={fetchers}>
      <StoriesPage fetchers={fetchers} currentUserId={1} initialView="board" workspaceUrl={(id) => `/stories/${id}`} {...props} />
    </StoryPeekHost></QueryClientProvider></AdminPortalContext>);
  });
  await settle();
}

beforeEach(() => {
  (window as { PointerEvent?: unknown }).PointerEvent ??= window.MouseEvent;
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  window.localStorage.clear();
  window.history.replaceState(null, "", "/stories?view=board&writer=4");
  fetchers = {
    getPlanning: vi.fn(() => new Promise(() => {})),
    getSavedViews: vi.fn(async () => []),
    saveSavedView: vi.fn(),
    deleteSavedView: vi.fn()
  } as unknown as PlanningFetchers & StoryFetchers;
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
});

describe("the board layout control", () => {
  it("appears beside the tabs only on Board", async () => {
    await mount();
    const picker = $("[data-board-layout-picker]");
    expect(picker?.getAttribute("aria-label")).toBe("Board, Lanes layout");
    expect(picker?.textContent).toBe("Board");
    expect(picker?.closest("[role=tablist]")).not.toBeNull();
    await click($$("[role=tab]").find((tab) => tab.textContent === "List"));
    expect($("[data-board-layout-picker]")).toBeNull();
  });

  it("is not offered on List", async () => {
    await mount({ initialView: "list" });
    expect($("[data-board-layout-picker]")).toBeNull();
  });

  it("remembers the chosen layout without touching the address, the filters or the saved view", async () => {
    await mount();
    const before = { href: window.location.href, history: window.history.length, fetches: vi.mocked(fetchers.getPlanning).mock.calls.length, view: $("[aria-label^='Story view:']")?.getAttribute("aria-label") };
    await click($("[data-board-layout-picker]"));
    const options = $$("[role=menuitemradio]");
    expect(options.map((option) => option.textContent)).toEqual(["LanesColumns with compact cards", "DenseOne-line rows", "StackedStages top to bottom"]);
    await click(options.find((option) => option.textContent?.startsWith("Dense")));
    expect($("[data-board-layout-picker]")?.getAttribute("aria-label")).toBe("Board, Dense layout");
    expect(window.localStorage.getItem(BOARD_LAYOUT_PREFERENCE_KEY)).toBe("dense");
    expect(window.location.href).toBe(before.href);
    expect(window.history.length).toBe(before.history);
    expect(vi.mocked(fetchers.getPlanning).mock.calls.length).toBe(before.fetches);
    expect($("[aria-label^='Story view:']")?.getAttribute("aria-label")).toBe(before.view);
    expect(fetchers.saveSavedView).not.toHaveBeenCalled();
  });

  it("opens on the layout this browser remembers", async () => {
    window.localStorage.setItem(BOARD_LAYOUT_PREFERENCE_KEY, "stacked");
    await mount();
    expect($("[data-board-layout-picker]")?.getAttribute("aria-label")).toBe("Board, Stacked layout");
  });
});

describe("the Stories workspace", () => {
  const stage = (id: string, label: string) => ({ id, label, group: "main" as const, selectable: true });
  const loaded = (workflow: string, id: number) => ({ id, title: `Story ${id}`, editUrl: `/e/${id}`, authors: [], writer: null, editor: null, workflow: stage(workflow, workflow), publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: null, plannedPublication: null, modifiedAt: null, visual: { type: "none", status: "done" }, openTaskCount: 0, featuredImage: null });
  const response = { stories: [loaded("pitch", 1), loaded("reporting", 2)], workflowStatuses: [stage("pitch", "Pitch"), stage("reporting", "Reporting")], capabilities: { canMoveStories: false, canAssign: false, canManageSavedViews: false, canManageMedia: false, canManageFeedback: false } };

  it("hides the views picker only when the host's pane shows the views", async () => {
    const { createStoriesWorkspace } = await import("../../src/planning/stories-workspace");
    await mount({ workspace: createStoriesWorkspace(), showViewsPicker: false });
    expect($("[aria-label^='Story view:']")).toBeNull();
  });

  it("keeps the picker when the host passes a workspace but no pane is showing", async () => {
    const { createStoriesWorkspace } = await import("../../src/planning/stories-workspace");
    await mount({ workspace: createStoriesWorkspace() });
    expect($("[aria-label^='Story view:']")).not.toBeNull();
  });

  it("drives Board from filters set in the pane, and publishes what it loaded", async () => {
    const { createStoriesWorkspace } = await import("../../src/planning/stories-workspace");
    const workspace = createStoriesWorkspace();
    fetchers.getPlanning = vi.fn(async (filters) => ({ ...response, stories: response.stories.filter((item) => !filters?.workflow || item.workflow.id === filters.workflow) })) as never;
    await mount({ workspace, showViewsPicker: false });
    expect(workspace.getState().data?.stories).toHaveLength(2);
    await act(async () => { workspace.toggleWorkflow("reporting"); });
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await settle();
    expect(workspace.getState().filters.workflow).toBe("reporting");
    const shown = $$("[role=listitem]").map((item) => item.textContent).join(" ");
    expect(shown).toContain("Story 2");
    expect(shown).not.toContain("Story 1");
    // The pane still counts every story in scope, not only the filtered ones.
    expect(workspace.getState().data?.stories).toHaveLength(2);
  });

  it("starts the view an address names", async () => {
    const { createStoriesWorkspace } = await import("../../src/planning/stories-workspace");
    const workspace = createStoriesWorkspace();
    await mount({ workspace, initialFilters: { needsReview: true } });
    expect(workspace.getState().filters.needsReview).toBe(true);
  });

  it("keeps its own filters without a workspace (WordPress)", async () => {
    await mount({ initialFilters: { workflow: "editing" } });
    expect($("[aria-label='Story view: Custom view']")).not.toBeNull();
  });
});
