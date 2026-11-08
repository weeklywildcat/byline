// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import { StoriesPage, type StoriesPageProps } from "../../src/planning/StoriesPage";
import { DEFAULT_WORKFLOW_STATUSES, EMPTY_PLANNING_FILTERS, type PlanningResponse, type PlanningStory, type SavedPlanningView } from "../../src/planning/planning-model";
import { STORIES_VIEW_PREFERENCE_KEY } from "../../src/planning/stories-view";
import { StoryPeekHost } from "../../src/story/StoryPeekHost";
import { storiesRouteFilters, type PlanningFetchers } from "../../src/planning/planning-api";
import type { StoryFetchers } from "../../src/story/story-fetchers";

/**
 * Stories as the reader meets it: Working, Published and All are tabs of
 * different stories; Board and List are a presentation choice that only Working
 * offers. Published stories are a record, never a workflow column.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stage = (id: string) => DEFAULT_WORKFLOW_STATUSES.find((status) => status.id === id)!;
const published = (publishedAt: string | null) => ({ id: "published", label: "Published", isPublished: true, isScheduled: false, publishedAt });
const gibson = { id: 1, name: "Gibson Bell" };
const matt = { id: 2, name: "Matt Cebedo" };
const story = (id: number, patch: Partial<PlanningStory> = {}): PlanningStory => ({
  id, title: `Story ${id}`, editUrl: `/edit/${id}`, authors: [], writer: null, editor: null, workflow: stage("reporting"),
  publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: null, plannedPublication: null, modifiedAt: "2026-11-01T12:00:00Z",
  visual: { type: "none", status: "needed" }, openTaskCount: 0, featuredImage: null, ...patch
});

const stories: PlanningStory[] = [
  story(1, { title: "Canteen could return", workflow: stage("writing"), deadline: "2026-11-12", plannedPublication: "2026-11-12", writer: gibson, authors: [gibson] }),
  story(2, { title: "Spring musical casting", workflow: stage("pitch") }),
  story(3, { title: "Redesigned website launches", workflow: stage("published"), sections: ["News"], writer: gibson, authors: [gibson], editor: matt, plannedPublication: "2026-11-15", publicationState: published("2026-06-29T18:14:00Z") }),
  story(4, { title: "Football wins homecoming", workflow: stage("published"), sections: ["Sports"], writer: matt, authors: [matt], openTaskCount: 1, publicationState: published("2026-11-03T05:15:00Z") }),
  story(5, { title: "Library hours change", workflow: stage("published"), sections: ["News"], publicationState: published("2026-10-20T14:00:00Z") })
];
const response = (patch: Partial<PlanningResponse["capabilities"]> = {}): PlanningResponse => ({
  stories, timezone: "America/New_York", workflowStatuses: DEFAULT_WORKFLOW_STATUSES, savedViews: [],
  capabilities: { canMoveStories: true, canAssign: true, canManageSavedViews: true, canManageMedia: false, canManageFeedback: false, ...patch },
  currentUser: gibson, total: stories.length, nextPage: null
});

let root: Root | null = null;
let host: HTMLDivElement;
let fetchers: PlanningFetchers & StoryFetchers;
const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const scopeTab = (id: string) => $(`[role=tab][data-scope="${id}"]`);
const selectedScope = () => $$("[role=tab]").find((tab) => tab.getAttribute("aria-selected") === "true")?.getAttribute("data-scope");
const presentation = (id: string) => $(`[data-presentation="${id}"]`);
const pressed = () => $$("[data-presentation]").find((item) => item.getAttribute("aria-pressed") === "true")?.getAttribute("data-presentation");
const titles = () => $$("[data-story-id]").map((row) => text(row.querySelector("button")));

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function click(element: HTMLElement | null | undefined) {
  expect(element).toBeTruthy();
  await act(async () => { element!.click(); });
  await settle();
}
async function mount(props: Partial<StoriesPageProps> = {}, capabilities: Partial<PlanningResponse["capabilities"]> = {}) {
  fetchers = {
    getPlanning: vi.fn(async () => response(capabilities)),
    getSavedViews: vi.fn(async () => []),
    saveSavedView: vi.fn(),
    deleteSavedView: vi.fn(),
    moveStory: vi.fn(async () => ({})),
    updateStory: vi.fn(async () => ({}))
  } as unknown as PlanningFetchers & StoryFetchers;
  if (props.fetchers) fetchers = props.fetchers as PlanningFetchers & StoryFetchers;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  await act(async () => {
    root!.render(<AdminPortalContext value={document.body}><QueryClientProvider client={client}><StoryPeekHost fetchers={fetchers}>
      <StoriesPage fetchers={fetchers} currentUserId={1} initialView="board" workspaceUrl={(id) => `/stories/${id}`} {...props} />
    </StoryPeekHost></QueryClientProvider></AdminPortalContext>);
  });
  await settle();
  await settle();
}

beforeEach(() => {
  (window as { PointerEvent?: unknown }).PointerEvent ??= window.MouseEvent;
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  window.localStorage.clear();
  window.history.replaceState(null, "", "/stories");
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("scopes", () => {
  it("opens Working, with a quiet count on each scope", async () => {
    await mount();
    expect(selectedScope()).toBe("working");
    expect($$("[role=tab]").map((tab) => text(tab))).toEqual(["Working3", "Published3", "All5"]);
    expect($("[role=tablist]")?.getAttribute("aria-label")).toBe("Stories scope");
  });

  it("is only the scope tabs that are tabs: Board and List are not", async () => {
    await mount();
    expect($$("[role=tab]")).toHaveLength(3);
    expect($$("[role=tab]").some((tab) => /^(Board|List)/.test(text(tab)))).toBe(false);
  });

  it("Working is the unfinished stories, plus a published story that still has work open", async () => {
    await mount({ initialView: "list" });
    expect(titles()).toEqual(["Canteen could return", "Spring musical casting", "Football wins homecoming"]);
  });

  it("Published is every published story, newest first, finished or not", async () => {
    await mount();
    await click(scopeTab("published"));
    expect(selectedScope()).toBe("published");
    expect(titles()).toEqual(["Football wins homecoming", "Library hours change", "Redesigned website launches"]);
  });

  it("All is every story", async () => {
    await mount();
    await click(scopeTab("all"));
    expect(titles()).toHaveLength(5);
    expect(titles()).toContain("Spring musical casting");
    expect(titles()).toContain("Library hours change");
  });

  it("moves between scopes with the keyboard roles Tabs provides", async () => {
    await mount();
    expect(scopeTab("working")?.getAttribute("tabindex")).toBe("0");
    expect(scopeTab("published")?.getAttribute("aria-selected")).toBe("false");
  });
});

describe("presentation", () => {
  it("is a labelled single-choice group, only in Working", async () => {
    await mount();
    const group = $("[data-slot=toggle-group]");
    expect(group?.getAttribute("aria-label")).toBe("Stories presentation");
    expect($$("[data-presentation]").map((item) => text(item))).toEqual(["Board", "List"]);
    expect(pressed()).toBe("board");
    expect(presentation("list")?.getAttribute("aria-pressed")).toBe("false");
    await click(presentation("list"));
    expect(pressed()).toBe("list");
  });

  it("never lets a presentation be switched off", async () => {
    await mount();
    await click(presentation("board"));
    expect(pressed()).toBe("board");
  });

  it("is not rendered at all where there is only one presentation, and Published cannot be a Board", async () => {
    await mount();
    await click(scopeTab("published"));
    expect($("[data-slot=toggle-group]")).toBeNull();
    expect($("[data-board-layout-picker]")).toBeNull();
    expect($("[data-status]")).toBeNull();
    await click(scopeTab("all"));
    expect($("[data-slot=toggle-group]")).toBeNull();
  });

  it("opens Published as a list even when the address also asks for a board", async () => {
    await mount({ initialScope: "published", initialView: "board" });
    expect(selectedScope()).toBe("published");
    expect($("[data-story-library=published]")).not.toBeNull();
    expect($("[data-status]")).toBeNull();
  });

  it("returns to the Working presentation the reader had, not Board", async () => {
    await mount();
    await click(presentation("list"));
    await click(scopeTab("published"));
    await click(scopeTab("working"));
    expect(pressed()).toBe("list");
    expect(window.location.search).toBe("?view=list");
    expect(window.localStorage.getItem(STORIES_VIEW_PREFERENCE_KEY)).toBe("list");
  });

  it("offers Calendar in Working only when the host has one", async () => {
    await mount({ renderCalendar: ({ stories: shown }) => <p data-calendar="">{shown.length} on the calendar</p> });
    expect($$("[data-presentation]").map((item) => text(item))).toEqual(["Board", "List", "Calendar"]);
    await click(presentation("calendar"));
    // The calendar plots publications too, so it is handed every refined story, not only the work queue.
    expect(text($("[data-calendar]"))).toBe("5 on the calendar");
    await click(scopeTab("published"));
    expect($("[data-calendar]")).toBeNull();
    expect($("[data-slot=toggle-group]")).toBeNull();
  });
});

describe("addresses and history", () => {
  it("writes the scope when it changes, and drops the view a library does not have", async () => {
    await mount();
    await click(scopeTab("published"));
    expect(window.location.search).toBe("?scope=published");
    await click(scopeTab("all"));
    expect(window.location.search).toBe("?scope=all");
    await click(scopeTab("working"));
    expect(window.location.search).toBe("?view=board");
  });

  it("restores the scope, and the presentation, with Back and Forward", async () => {
    await mount();
    await click(presentation("list"));
    await click(scopeTab("published"));
    expect(selectedScope()).toBe("published");
    await act(async () => { window.history.back(); });
    await settle();
    expect(selectedScope()).toBe("working");
    expect(pressed()).toBe("list");
    await act(async () => { window.history.forward(); });
    await settle();
    expect(selectedScope()).toBe("published");
    expect($("[data-story-library=published]")).not.toBeNull();
  });

  it("uses the host's address when it supplies one", async () => {
    const locationHref = vi.fn(({ scope, view }: { scope: string; view: string }) => `/wp-admin/admin.php?page=byline-planning&tab=stories&${scope === "working" ? `view=${view}` : `scope=${scope}`}`);
    await mount({ locationHref });
    await click(scopeTab("published"));
    expect(locationHref).toHaveBeenLastCalledWith({ scope: "published", view: "list", publicationState: "" });
    expect(window.location.search).toBe("?page=byline-planning&tab=stories&scope=published");
  });

  it("opens an old publication_state=published link on Published, with no stray filter chip", async () => {
    await mount({ initialFilters: { publicationState: "published" } });
    expect(selectedScope()).toBe("published");
    expect($("[aria-label='Active filters']")).toBeNull();
    expect(titles()).toHaveLength(3);
  });

  it("drops a cleared legacy publication filter when opening Published", async () => {
    window.history.replaceState(null, "", "/stories?publication_state=draft");
    await mount({ initialFilters: storiesRouteFilters(new URLSearchParams(window.location.search)) });
    await click($("[aria-label='Remove filter: Draft']"));
    await click(scopeTab("published"));
    expect(window.location.search).toBe("?scope=published");
    expect(titles()).toHaveLength(3);
  });
});

describe("the old workaround is gone", () => {
  it("has no Show published checkbox, no Showing published chip and no hidden-stories note", async () => {
    await mount({ initialView: "list" });
    await click($$("button").find((button) => /More filters/.test(text(button))));
    const everything = text(document.body);
    expect(everything).not.toMatch(/show(ing)? (finished )?published/i);
    expect(everything).not.toMatch(/nothing left to do (is|are) hidden/i);
    expect($("#story-filter-published")).toBeNull();
    expect($("#story-filter-publication")).toBeNull();
  });
});

describe("refinements follow the scope", () => {
  const openMore = async () => click($$("button").find((button) => /More filters/.test(text(button))));

  it("Working keeps stage, deadline, visual and overdue", async () => {
    await mount({ initialView: "list" });
    expect($("[aria-label=Workflow]")).not.toBeNull();
    await openMore();
    expect($("#story-filter-deadline-from")).not.toBeNull();
    expect($("#story-filter-overdue")).not.toBeNull();
    expect($("#story-filter-visual")).not.toBeNull();
    expect($("#story-filter-published-from")).toBeNull();
  });

  it("Published keeps who and when it ran, and not the workflow selector or Overdue", async () => {
    await mount();
    await click(scopeTab("published"));
    expect($("[aria-label=Workflow]")).toBeNull();
    expect($("[aria-label=Writer]")).not.toBeNull();
    expect($("[aria-label=Editor]")).not.toBeNull();
    await openMore();
    expect($("#story-filter-published-from")).not.toBeNull();
    expect($("#story-filter-mine")).not.toBeNull();
    expect($("#story-filter-overdue")).toBeNull();
    expect($("#story-filter-deadline-from")).toBeNull();
  });

  it("does not hide a filter it no longer shows: it becomes a chip, and clearing it works", async () => {
    await mount({ initialFilters: { overdue: true }, initialView: "list" });
    await click(scopeTab("published"));
    const chips = $("[aria-label='Active filters']");
    expect(text(chips)).toContain("Overdue");
    await click($("[aria-label='Remove filter: Overdue']"));
    expect($("[aria-label='Active filters']")).toBeNull();
  });

  it("says filters may be the reason when a scope is empty, and clears them", async () => {
    await mount({ initialFilters: { query: "no such headline" } });
    await click(scopeTab("published"));
    expect(text($("main, body"))).toContain("No published stories");
    expect(text(document.body)).toContain("Your filters may be hiding published stories.");
    await click($$("button").find((button) => text(button) === "Clear filters"));
    expect(titles()).toHaveLength(3);
  });
});

describe("Published", () => {
  it("keeps a story that falls on the selected day in the response timezone", async () => {
    await mount({ initialScope: "published", initialFilters: { publishedFrom: "2026-11-03", publishedTo: "2026-11-03" } });
    expect(titles()).toEqual(["Football wins homecoming"]);
  });

  it("is a table of Story, Section, People, Published and Updated, grouped by newsroom day", async () => {
    await mount();
    await click(scopeTab("published"));
    const table = $("[data-story-library=published] table");
    expect(table?.getAttribute("aria-label")).toBe("Published stories");
    const heads = $$("[data-story-library=published] th").map((head) => text(head));
    expect(heads).toEqual(["Story", "Section", "People", "Published", "Updated", "Actions"]);
    expect($$("[data-story-library=published] [aria-sort]").map((head) => head.getAttribute("aria-sort"))).toEqual(["none", "none", "descending", "none"]);
    expect($$("[data-day-group]").length).toBeGreaterThan(0);
  });

  it("has no workflow selector, deadline editor or badge soup", async () => {
    await mount();
    await click(scopeTab("published"));
    expect($$("[aria-label^='Workflow:']")).toHaveLength(0);
    expect($("[data-story-library=published] [data-slot=select-trigger]")).toBeNull();
    expect($("[data-story-library=published] [data-slot=badge]")).toBeNull();
    expect(text($("[data-story-library=published]"))).not.toMatch(/Deadline|Reporting|Writing/);
  });

  it("sorts on publication time by default, and flips with the header", async () => {
    await mount();
    await click(scopeTab("published"));
    expect(titles()).toEqual(["Football wins homecoming", "Library hours change", "Redesigned website launches"]);
    await click($$("[data-story-library=published] th button").find((button) => text(button) === "Published"));
    expect(titles()).toEqual(["Redesigned website launches", "Library hours change", "Football wins homecoming"]);
  });

  it("opens a story's Peek from its title, and keeps its actions without any workflow move", async () => {
    await mount();
    await click(scopeTab("published"));
    await click($("[data-story-actions='3']"));
    const items = $$("[role=menuitem]").map((item) => text(item));
    expect(items).toContain("Open story");
    expect(items.some((item) => /Move to/i.test(item))).toBe(false);
  });

  it("stays read-only for someone who may not move stories", async () => {
    await mount({}, { canMoveStories: false });
    await click(scopeTab("all"));
    await click($("[data-story-actions='1']"));
    expect($$("[role=menuitem]").some((item) => /Move to/i.test(text(item)))).toBe(false);
  });
});

describe("All", () => {
  it("sorts the Publication column by the dates it displays", async () => {
    await mount({ initialScope: "all" });
    const publication = $$("[data-story-library=all] th button").find((button) => text(button) === "Publication");
    await click(publication);
    expect(titles()).toEqual(["Redesigned website launches", "Library hours change", "Football wins homecoming", "Canteen could return", "Spring musical casting"]);
    await click(publication);
    expect(titles()).toEqual(["Canteen could return", "Football wins homecoming", "Library hours change", "Redesigned website launches", "Spring musical casting"]);
  });

  it("is a table of Story, State, Section, People, Publication and Updated", async () => {
    await mount();
    await click(scopeTab("all"));
    expect($$("[data-story-library=all] th").map((head) => text(head))).toEqual(["Story", "State", "Section", "People", "Publication", "Updated", "Actions"]);
    expect($$("[data-story-library=all] [aria-sort]").map((head) => head.getAttribute("aria-sort"))).toEqual(["none", "none", "none", "descending"]);
  });

  it("reads each story's state in words: Published, or Draft with its stage", async () => {
    await mount();
    await click(scopeTab("all"));
    const row = (id: number) => text($(`[data-story-library=all] [data-story-id='${id}']`));
    expect(row(3)).toContain("Published");
    expect(row(1)).toMatch(/Draft\s*Writing/);
    expect(row(1)).toContain("Gibson Bell");
  });
});

describe("compact rows", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 420, height: 100, top: 0, left: 0, right: 420, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  });

  it("Published rows carry the headline, section · people, the day and actions, not the desktop columns", async () => {
    await mount();
    await click(scopeTab("published"));
    expect($("[data-story-library=published] table")).toBeNull();
    const row = $("[data-story-library=published] [data-story-id='3']");
    expect(text(row?.querySelector("button"))).toBe("Redesigned website launches");
    expect(text(row)).toContain("News · Gibson Bell");
    expect(text(row)).toMatch(/Published Jun 29/);
    expect(text(row)).toMatch(/Updated/);
    expect(row?.querySelector("[data-story-actions]")).not.toBeNull();
  });

  it("All rows say whether a story is published or a draft", async () => {
    await mount();
    await click(scopeTab("all"));
    expect(text($("[data-story-library=all] [data-story-id='1']"))).toContain("Draft · Writing");
    expect(text($("[data-story-library=all] [data-story-id='3']"))).toMatch(/^Redesigned website launches.*Published · Jun 29/);
  });
});

describe("Working keeps its workflow surface", () => {
  it("lists a draft with an editable stage, and a published story with open work as read-only", async () => {
    await mount({ initialView: "list" });
    expect($("[data-story-id='1'] [aria-label='Workflow: Writing']")?.getAttribute("data-slot")).toBe("select-trigger");
    expect($("[data-story-id='4'] [data-slot=select-trigger][aria-label^='Workflow']")).toBeNull();
  });

  it("shows the board with a column for each stage and no published card", async () => {
    await mount();
    expect($("section[data-status='writing'] [data-story-id='1']")).not.toBeNull();
    expect($("[data-story-id='3']")).toBeNull();
    expect($("[data-story-id='4']")).toBeNull();
  });

  it("explains a read-only board to someone who cannot move stories", async () => {
    await mount({}, { canMoveStories: false });
    expect(text(document.body)).toContain("your account cannot move stories");
  });

  it("offers Move to for a draft but never for a published story", async () => {
    await mount({ initialView: "list" });
    await click($("[data-story-actions='1']"));
    expect($$("[role=menuitem]").some((item) => /Move to/i.test(text(item)))).toBe(true);
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await settle();
    await click($("[data-story-actions='4']"));
    expect($$("[role=menuitem]").some((item) => /Move to/i.test(text(item)))).toBe(false);
  });
});

describe("saved views and the Published scope", () => {
  const saved = (patch: Partial<SavedPlanningView>): SavedPlanningView => ({ id: "v1", name: "Mine, published", filters: { ...EMPTY_PLANNING_FILTERS, publicationState: "published", mine: true }, sort: { key: "deadline", direction: "asc" }, ...patch });

  async function chooseView(name: string) {
    // Choosing a view leaves the menu open, so open it only when it is closed.
    if ($("[aria-label^='Story view:']")?.getAttribute("aria-expanded") !== "true") await click($("[aria-label^='Story view:']"));
    await click($$("[role=menuitemradio]").find((item) => text(item) === name));
  }

  it("applying an old saved view for published stories opens Published, and reads as that view", async () => {
    const view = saved({});
    await mount({ fetchers: { ...(({ getPlanning: vi.fn(async () => ({ ...response(), savedViews: [view] })), getSavedViews: vi.fn(async () => [view]), saveSavedView: vi.fn(), deleteSavedView: vi.fn() }) as unknown as PlanningFetchers & StoryFetchers) } });
    expect(selectedScope()).toBe("working");
    await chooseView("Mine, published");
    expect(selectedScope()).toBe("published");
    expect(window.location.search).toBe("?scope=published");
    expect($("[aria-label='Story view: Mine, published']")).not.toBeNull();
    // The scope took over from the publication state, so it is not also a chip.
    expect(text($("[aria-label='Active filters']"))).not.toMatch(/published/i);
  });

  it("applying a saved view without a publication state leaves a library scope alone... unless the view says draft", async () => {
    const mineView = saved({ id: "v2", name: "Mine", filters: { ...EMPTY_PLANNING_FILTERS, mine: true } });
    const draftView = saved({ id: "v3", name: "Only drafts", filters: { ...EMPTY_PLANNING_FILTERS, publicationState: "draft" } });
    await mount({ fetchers: { getPlanning: vi.fn(async () => ({ ...response(), savedViews: [mineView, draftView] })), getSavedViews: vi.fn(async () => [mineView, draftView]), saveSavedView: vi.fn(), deleteSavedView: vi.fn() } as unknown as PlanningFetchers & StoryFetchers });
    await click(scopeTab("published"));
    await chooseView("Mine");
    expect(selectedScope()).toBe("published");
    await chooseView("Only drafts");
    expect(selectedScope()).toBe("working");
    expect(text($("[aria-label='Active filters']"))).toContain("Draft");
  });

  it("saves the view you are in: Published is kept as the publication state it always was", async () => {
    const saveSavedView = vi.fn(async (input) => ({ ...input, id: "new" }));
    await mount({ fetchers: { getPlanning: vi.fn(async () => response()), getSavedViews: vi.fn(async () => []), saveSavedView, deleteSavedView: vi.fn() } as unknown as PlanningFetchers & StoryFetchers });
    await click(scopeTab("published"));
    await click($("[aria-label^='Story view:']"));
    await click($$("[role=menuitem]").find((item) => /Save current view/.test(text(item))));
    const input = $("#saved-view-name") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Published all");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { input.form!.requestSubmit(); });
    await settle();
    expect(saveSavedView).toHaveBeenCalledWith(expect.objectContaining({ name: "Published all", filters: expect.objectContaining({ publicationState: "published" }), sort: { key: "published", direction: "desc" } }));
  });

  it("offers only the built-in views that answer something in the scope", async () => {
    await mount();
    await click(scopeTab("published"));
    await click($("[aria-label^='Story view:']"));
    expect($$("[role=menuitemradio]").map((item) => text(item))).toEqual(["All stories", "My stories"]);
  });
});
