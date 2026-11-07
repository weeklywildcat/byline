import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { defaultStoriesViewHref, StoriesPage, type StoriesPageProps } from "@byline/newsroom-screens/planning/StoriesPage";
import { availableStoriesViews, supportedStoriesView } from "@byline/newsroom-screens/planning/stories-view";
import { activeStoryView, activeStoryViewLabel, applyBuiltInView, applySavedView, BUILT_IN_STORY_VIEWS } from "@byline/newsroom-screens/planning/story-views";
import { StoryViewsPicker, type StoryViewsController } from "@byline/newsroom-screens/planning/StoryViews";
import { DEFAULT_PLANNING_SORT, EMPTY_PLANNING_FILTERS, type SavedPlanningView } from "@byline/newsroom-screens/planning/planning-model";
import { StoryPeekHost } from "@byline/newsroom-screens/story/StoryPeekHost";
import type { PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { readFileSync } from "node:fs";
import { readSource } from "./source-files";

const fetchers = {
  getPlanning: vi.fn(() => new Promise(() => {})),
  getSavedViews: vi.fn(async () => []),
  saveSavedView: vi.fn(),
  deleteSavedView: vi.fn()
} as unknown as PlanningFetchers & StoryFetchers;

function render(props: Partial<StoriesPageProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>
    <StoryPeekHost fetchers={fetchers}>
      <StoriesPage fetchers={fetchers} currentUserId={1} initialView="board" workspaceUrl={(id) => `/stories/${id}`} {...props} />
    </StoryPeekHost>
  </QueryClientProvider>);
}

const tabs = (html: string) => Array.from(html.matchAll(/role="tab"[^>]*>([^<]+)</g), (match) => match[1]);

describe("Stories views a host offers", () => {
  it("offers Calendar only when the host supplies one", () => {
    expect(availableStoriesViews(false)).toEqual(["board", "list"]);
    expect(availableStoriesViews(true)).toEqual(["board", "list", "calendar"]);
  });

  it("falls back to Board when a remembered or linked view is not offered", () => {
    expect(supportedStoriesView("calendar", false)).toBe("board");
    expect(supportedStoriesView("calendar", true)).toBe("calendar");
    expect(supportedStoriesView("list", false)).toBe("list");
  });

  it("names the view in the address by default, keeping everything else", () => {
    expect(defaultStoriesViewHref("http://localhost:3010/stories?collection=4#top", "list")).toBe("/stories?collection=4&view=list#top");
    expect(defaultStoriesViewHref("http://localhost:3010/stories?view=board", "list")).toBe("/stories?view=list");
  });
});

describe("the shared Stories screen", () => {
  it("never shows a Calendar tab without a calendar behind it", () => {
    expect(tabs(render())).toEqual(["Board", "List"]);
    expect(tabs(render({ initialView: "calendar" }))).toEqual(["Board", "List"]);
  });

  it("shows the host's calendar as a third view", () => {
    expect(tabs(render({ renderCalendar: () => <div>Host calendar</div> }))).toEqual(["Board", "List", "Calendar"]);
  });

  it("knows no CMS: no WordPress routing, Schedule-X or host calendar code", () => {
    const source = readSource("planning/StoriesPage.tsx");
    expect(source).not.toMatch(/StoryCalendar|schedule-x|calendar-model|planning-routing|navigation-model/i);
    expect(source).not.toMatch(/byline-planning|wp-admin|tab=|searchParams\.(?:set|delete|get)\("(?:page|tab|story|appointment)"/);
  });
});

const saved: SavedPlanningView = { id: "due", name: "Due this week", filters: { ...EMPTY_PLANNING_FILTERS, deadlineFrom: "2026-11-09", deadlineTo: "2026-11-15" }, sort: { key: "deadline", direction: "asc" } };

describe("which story set is active", () => {
  it("names a built-in view only while the filters match it exactly", () => {
    const mine = BUILT_IN_STORY_VIEWS.find((view) => view.id === "mine")!;
    expect(activeStoryView(applyBuiltInView(mine).filters, DEFAULT_PLANNING_SORT, [], null)).toMatchObject({ kind: "built-in", view: { id: "mine" } });
    expect(activeStoryView({ ...EMPTY_PLANNING_FILTERS, mine: true, overdue: true }, DEFAULT_PLANNING_SORT, [], null)).toEqual({ kind: "custom" });
    expect(activeStoryView({ ...EMPTY_PLANNING_FILTERS, mine: true, collectionId: 4 }, DEFAULT_PLANNING_SORT, [], null)).toEqual({ kind: "custom" });
    expect(activeStoryViewLabel(activeStoryView(EMPTY_PLANNING_FILTERS, DEFAULT_PLANNING_SORT, [], null))).toBe("All stories");
  });

  it("keeps a saved view selected, and marks it modified, once its filters or sort change", () => {
    const applied = applySavedView(saved);
    expect(activeStoryView(applied.filters, applied.sort, [saved], applied.savedViewId)).toEqual({ kind: "saved", view: saved, modified: false });
    const edited = activeStoryView({ ...applied.filters, query: "budget" }, applied.sort, [saved], applied.savedViewId);
    expect(edited).toEqual({ kind: "saved", view: saved, modified: true });
    expect(activeStoryViewLabel(edited)).toBe("Due this week (modified)");
    expect(activeStoryView(applied.filters, { key: "story", direction: "asc" }, [saved], applied.savedViewId)).toMatchObject({ modified: true });
  });
});

function controller(active = activeStoryView(EMPTY_PLANNING_FILTERS, DEFAULT_PLANNING_SORT, [saved], null), savedViews = [saved]): StoryViewsController {
  return { active, label: activeStoryViewLabel(active), builtIns: BUILT_IN_STORY_VIEWS, savedViews, canSave: true, canDelete: true, full: false, chooseBuiltIn: vi.fn(), chooseSaved: vi.fn(), updateSelected: vi.fn(), openSave: vi.fn(), openRename: vi.fn(), openManage: vi.fn(), remove: vi.fn(), dialogs: null };
}

describe("Stories views", () => {
  it("the picker names the active view", () => {
    expect(renderToStaticMarkup(<StoryViewsPicker views={controller()} />)).toContain('aria-label="Story view: All stories"');
  });

  it("Stories has one navigation column: no views rail, the picker always shown", () => {
    const html = render();
    expect(html).not.toContain("<aside");
    expect(html).not.toContain('aria-label="Story views"');
    expect(html).not.toMatch(/@min-\[\d+px\]\/stories:(flex|hidden)/);
    const pickerTag = /<button[^>]*aria-label="Story view: All stories"[^>]*>/.exec(html)?.[0] ?? "";
    expect(pickerTag).not.toBe("");
    expect(pickerTag).not.toMatch(/\bhidden\b/);
  });

  it("keeps Board and List as line tabs, apart from the story set", () => {
    const html = render();
    expect(html).toMatch(/role="tablist"[^>]*aria-label="Stories presentation"/);
    const tablist = /<div[^>]*role="tablist"[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(tablist).not.toContain("All stories");
  });

  it("offers a page-level New story only when the host has no Create of its own", () => {
    expect(render()).not.toContain("New story");
    expect(render({ onNewStory: vi.fn() })).toContain("New story");
  });
});

describe("each host's Stories", () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  it("WordPress supplies its Schedule-X calendar", () => {
    expect(source("../src/planning/PlanningApp.tsx")).toMatch(/renderCalendar=\{renderCalendar\}/);
    expect(source("../src/planning/PlanningApp.tsx")).toContain("<StoryCalendar ");
  });
  it("the Payload newsroom supplies none, so it offers Board and List only", () => {
    const payload = source("../../apps/newsroom/src/ui/stories/NewsroomStories.tsx");
    expect(payload).toContain("<StoriesPage ");
    expect(payload).not.toMatch(/renderCalendar|StoryCalendar|schedule-x/i);
  });
  it("WordPress keeps its New story; the Payload newsroom leaves it to the shell's Create", () => {
    expect(source("../src/planning/PlanningApp.tsx")).toContain("onNewStory={");
    expect(source("../../apps/newsroom/src/ui/stories/NewsroomStories.tsx")).not.toContain("onNewStory");
  });
});
