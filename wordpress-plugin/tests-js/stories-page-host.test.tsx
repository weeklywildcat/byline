import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { defaultStoriesViewHref, StoriesPage, type StoriesPageProps } from "@byline/newsroom-screens/planning/StoriesPage";
import { availableStoriesViews, supportedStoriesView } from "@byline/newsroom-screens/planning/stories-view";
import { StoryPeekHost } from "@byline/newsroom-screens/story/StoryPeekHost";
import type { PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { readSource } from "./source-files";

const fetchers = {
  getPlanning: vi.fn(() => new Promise(() => {}))
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
