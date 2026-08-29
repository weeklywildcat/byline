import type {
  HomeNavigationCapabilities,
  HomeNavigationFeatures,
  HomeNavigationUrls
} from "./home-model";

export const STORIES_VIEW_PREFERENCE_KEY = "byline:stories-view";
export const STORIES_VIEW_IDS = ["board", "list", "calendar"] as const;
export type StoriesView = (typeof STORIES_VIEW_IDS)[number];

export type AdminNavigationItem = {
  id: string;
  label: string;
  href: string;
  activeRoutes?: string[];
};

export type AdminNavigationGroup = {
  id: string;
  label: string;
  items: AdminNavigationItem[];
};

function enabled(features: HomeNavigationFeatures, feature: string): boolean {
  return features[feature] !== false;
}

function item(id: string, label: string, href: string | undefined, activeRoutes?: string[]): AdminNavigationItem | null {
  return href ? { id, label, href, activeRoutes } : null;
}

function group(id: string, label: string, items: Array<AdminNavigationItem | null>): AdminNavigationGroup | null {
  const available = items.filter((value): value is AdminNavigationItem => value !== null);
  return available.length ? { id, label, items: available } : null;
}

/**
 * Keep the product's primary destinations small and grouped. Visibility is a
 * presentation hint only; each WordPress page and REST route still enforces
 * its own capability on the server.
 */
export function buildAdminNavigation(
  urls: HomeNavigationUrls,
  capabilities: HomeNavigationCapabilities,
  features: HomeNavigationFeatures = {}
): AdminNavigationGroup[] {
  const homeHref = capabilities.manage ? urls.dashboard : capabilities.editPosts ? urls.planning?.today : undefined;
  const homeActiveRoutes = capabilities.manage ? ["/dashboard", "/home"] : ["/home"];
  const groups = [
    group("home", "Home", [
      item("home", "Home", homeHref, homeActiveRoutes)
    ]),
    group("work", "Work", [
      capabilities.editPosts ? item("stories", "Stories", urls.planning?.stories, ["/planning/stories"]) : null,
      capabilities.editPosts ? item("calendar", "Calendar", urls.planning?.calendar, ["/planning/calendar"]) : null,
      capabilities.editPosts ? item("coverage", "Coverage", urls.planning?.coverage, ["/planning/coverage"]) : null
    ]),
    group("desk", "Desk", [
      capabilities.editPosts ? item("media", "Media", urls.planning?.media, ["/planning/media"]) : null,
      capabilities.editOthersPosts || capabilities.manage ? item("feedback", "Feedback", urls.planning?.feedback, ["/planning/feedback"]) : null
    ]),
    group("insights", "Insights", [
      capabilities.editPosts ? item("performance", "Performance", urls.planning?.performance, ["/planning/performance"]) : null,
      capabilities.editPosts ? item("content-health", "Content Health", urls.planning?.contentHealth, ["/planning/content-health"]) : null
    ]),
    group("design", "Design", [
      capabilities.editDesign ? item("studio", "Studio", urls.studio, ["/design/studio"]) : null,
      capabilities.editPosts && enabled(features, "newsletter") ? item("newsletters", "Newsletters", urls.newsletters?.issues, ["/newsletters/issues", "/newsletters/settings"]) : null
    ]),
    group("settings", "Settings", [
      capabilities.manage ? item("publication", "Publication", urls.publication?.identity, ["/publication/identity", "/publication/branding", "/publication/navigation", "/publication/features", "/publication/social"]) : null,
      capabilities.manageIntegrations ? item("integrations", "Integrations", urls.integrations?.deployment, ["/integrations/deployment", "/integrations/discord"]) : null,
      capabilities.manage ? item("settings", "Settings", urls.settings?.access, ["/advanced/access", "/advanced/api", "/advanced/compatibility"]) : null,
      capabilities.manage ? item("doctor", "Byline Doctor", urls.settings?.diagnostics, ["/advanced/diagnostics"]) : null
    ])
  ];

  return groups.filter((value): value is AdminNavigationGroup => value !== null);
}

function storageAvailable(storage: Storage | null | undefined): storage is Storage {
  return Boolean(storage && typeof storage.getItem === "function" && typeof storage.setItem === "function");
}

export function readStoriesViewPreference(storage?: Storage | null): StoriesView | null {
  if (!storageAvailable(storage)) return null;
  try {
    const value = storage.getItem(STORIES_VIEW_PREFERENCE_KEY);
    return STORIES_VIEW_IDS.includes(value as StoriesView) ? value as StoriesView : null;
  } catch {
    return null;
  }
}

export function writeStoriesViewPreference(view: StoriesView, storage?: Storage | null): void {
  if (!storageAvailable(storage)) return;
  try {
    storage.setItem(STORIES_VIEW_PREFERENCE_KEY, view);
  } catch {
    // Private browsing and locked-down admin browsers can reject storage. The
    // current view remains usable for the session in that case.
  }
}

export function preferredStoriesView(initial: StoriesView = "board", storage?: Storage | null): StoriesView {
  return readStoriesViewPreference(storage) || initial;
}

export function storiesViewFromRoute(value: string | undefined): StoriesView | null {
  return STORIES_VIEW_IDS.includes(value as StoriesView) ? value as StoriesView : null;
}
