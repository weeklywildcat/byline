/**
 * Planning's addresses. Every destination is a WordPress sidebar entry
 * (`page=byline-planning&tab=...`); Stories is deep-linkable with `&scope=`
 * (Working, Published, All) and, in Working, `&view=` (Board, List, Calendar).
 */
import { preferredStoriesView, storiesViewFromRoute, type StoriesView } from "@byline/newsroom-screens/planning/stories-view";
import { applyStoriesLocation, type StoryScope } from "@byline/newsroom-screens/planning/stories-scope";

export const PLANNING_DESTINATIONS = ["stories", "collections", "media", "content-health", "feedback"] as const;
export type PlanningDestination = (typeof PLANNING_DESTINATIONS)[number];

/** The sidebar's Calendar entry is Stories opened on its Calendar view; unknown tabs are Stories. */
export function destinationForTab(tab: string | undefined): PlanningDestination {
  if (tab === "coverage") return "collections";
  if (tab === "contentHealth") return "content-health";
  return PLANNING_DESTINATIONS.includes(tab as PlanningDestination) ? tab as PlanningDestination : "stories";
}

/**
 * The view to open: an explicit `view=` always wins, the Calendar sidebar entry
 * opens Calendar, and a bare Stories link restores the reader's last view.
 */
export function initialStoriesView(tab: string | undefined, requestedView: string | undefined, storage?: Storage | null): StoriesView {
  const explicit = storiesViewFromRoute(requestedView);
  if (explicit) return explicit;
  if (tab === "calendar") return "calendar";
  return preferredStoriesView("board", storage);
}

/**
 * The address of a Stories location, derived from the current one so unrelated
 * parameters survive. Working is `view=`, a library scope is `scope=`.
 */
export function storiesLocationHref(currentHref: string, location: { scope: StoryScope; view: StoriesView }): string {
  const url = new URL(currentHref, typeof window === "undefined" ? "http://localhost/wp-admin/" : window.location.href);
  url.searchParams.set("page", "byline-planning");
  url.searchParams.set("tab", "stories");
  applyStoriesLocation(url, location);
  ["story", "appointment"].forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}`;
}
