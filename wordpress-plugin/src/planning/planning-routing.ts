/**
 * Planning's addresses. Every destination is a WordPress sidebar entry
 * (`page=byline-planning&tab=...`); Board, List and Calendar are three views
 * of Stories and are deep-linkable with `&view=`.
 */
import { preferredStoriesView, storiesViewFromRoute, type StoriesView } from "../home/navigation-model";

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

/** The address of a Stories view, derived from the current one so unrelated parameters survive. */
export function storiesViewHref(currentHref: string, view: StoriesView): string {
  const url = new URL(currentHref, typeof window === "undefined" ? "http://localhost/wp-admin/" : window.location.href);
  url.searchParams.set("page", "byline-planning");
  url.searchParams.set("tab", "stories");
  url.searchParams.set("view", view);
  ["story", "appointment"].forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}`;
}
