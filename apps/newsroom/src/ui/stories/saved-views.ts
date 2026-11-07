import type { PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import type { SavedPlanningView } from "@byline/newsroom-screens/planning/planning-model";
import { normalizeSavedPlanningViews, SAVED_VIEW_LIMIT, SAVED_VIEW_NAME_MAX_LENGTH } from "@byline/newsroom-screens/planning/story-views";

/**
 * Stories saved views in Payload's Preferences: the signed-in account's own
 * persistent admin UI state, which Payload keeps per user (`payload-preferences`,
 * read and written only for the requesting user). No collection, no field, no
 * migration and no Byline endpoint: these are the reader's preferences, not
 * newsroom records and not a security boundary.
 *
 * The value is versioned by its key. Every read is normalized (stored data is
 * untrusted: an older shape, a hand edit), and every write stores the whole
 * normalized list.
 */
export const SAVED_VIEWS_PREFERENCE_KEY = "byline:stories:saved-views:v1";

/** What `usePreferences()` from `@payloadcms/ui` provides. Always written whole (never merged): the value is a list. */
export type PreferenceStore = {
  getPreference: <T>(key: string) => Promise<T>;
  setPreference: <T>(key: string, value: T) => Promise<void>;
};

type SavedViewMethods = Required<Pick<PlanningFetchers, "getSavedViews" | "saveSavedView" | "deleteSavedView">>;

const failure = (message: string, status: number) => ({ message, code: `byline_saved_view_${status}`, data: { status } });

export function createPreferenceSavedViews(store: PreferenceStore, newId: () => string = () => crypto.randomUUID()): SavedViewMethods {
  const read = async () => normalizeSavedPlanningViews(await store.getPreference<unknown>(SAVED_VIEWS_PREFERENCE_KEY));
  const write = (views: SavedPlanningView[]) => store.setPreference(SAVED_VIEWS_PREFERENCE_KEY, normalizeSavedPlanningViews(views));

  return {
    getSavedViews: read,

    /**
     * Create (no id), update or rename (a known id), or restore (an id no
     * longer stored: Undo after a delete puts the same view back).
     */
    saveSavedView: async (input) => {
      const name = String(input.name ?? "").trim().slice(0, SAVED_VIEW_NAME_MAX_LENGTH).trim();
      if (!name) throw failure("Give the view a name.", 400);
      const views = await read();
      const index = input.id ? views.findIndex((view) => view.id === input.id) : -1;
      if (index < 0 && views.length >= SAVED_VIEW_LIMIT) throw failure(`You can keep up to ${SAVED_VIEW_LIMIT} saved views. Delete one first.`, 400);
      const [view] = normalizeSavedPlanningViews([{ id: index >= 0 || input.id ? input.id : newId(), name, filters: input.filters, sort: input.sort, updatedAt: new Date().toISOString() }]);
      if (!view) throw failure("That view could not be saved.", 400);
      const next = index >= 0 ? views.map((item, position) => (position === index ? view : item)) : [view, ...views];
      await write(next);
      return view;
    },

    deleteSavedView: async (viewId) => {
      const views = await read();
      if (!views.some((view) => view.id === viewId)) throw failure("That saved view no longer exists.", 404);
      await write(views.filter((view) => view.id !== viewId));
    }
  };
}
