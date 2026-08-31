/**
 * Byline stores the reader's last Stories view so the Stories destination
 * reopens the way they left it. Primary navigation itself is WordPress's own
 * admin menu, registered by the plugin in PHP.
 */
export const STORIES_VIEW_PREFERENCE_KEY = "byline:stories-view";
export const STORIES_VIEW_IDS = ["board", "list", "calendar"] as const;
export type StoriesView = (typeof STORIES_VIEW_IDS)[number];

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
