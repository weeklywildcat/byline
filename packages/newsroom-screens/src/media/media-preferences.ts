import { isMediaSort, type MediaLibrarySort } from "./media-library-model";

/**
 * The reader's own Media preferences: Grid or List, the Library sort, and
 * the inspector's width. Never the search text, the selected asset or
 * temporary filters (those are this visit only), and never where the reader
 * was: a bare Media address always means Library → All media.
 */
export type MediaPreferences = { layout: "grid" | "list"; sort: MediaLibrarySort; inspectorSize: number };

export const DEFAULT_MEDIA_PREFERENCES: MediaPreferences = { layout: "grid", sort: "newest", inspectorSize: 32 };

/** The inspector's share of the content area, in percent (the resizable panel's units). */
export const INSPECTOR_SIZE = { min: 24, max: 50 } as const;

/** Stored data is untrusted (an older shape, a hand edit): every read is normalized. */
export function normalizeMediaPreferences(value: unknown): MediaPreferences {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const size = Number(record.inspectorSize);
  return {
    layout: record.layout === "list" ? "list" : "grid",
    sort: isMediaSort(record.sort) ? record.sort : DEFAULT_MEDIA_PREFERENCES.sort,
    inspectorSize: Number.isFinite(size) ? Math.min(INSPECTOR_SIZE.max, Math.max(INSPECTOR_SIZE.min, Math.round(size))) : DEFAULT_MEDIA_PREFERENCES.inspectorSize
  };
}

export type MediaPreferenceStorage = {
  load: () => Promise<MediaPreferences>;
  save?: (preferences: MediaPreferences) => Promise<unknown> | unknown;
};

export type MediaPreferencesStore = {
  subscribe: (listener: () => void) => () => void;
  getState: () => MediaPreferences;
  /** Whether the stored preferences have been read (until then the defaults show). */
  loaded: () => boolean;
  load: () => Promise<void>;
  update: (patch: Partial<MediaPreferences>) => void;
  /** Resolves once every pending save has been written (tests, and a host that must flush). */
  settled: () => Promise<void>;
};

/**
 * One owner of the preferences, shared by the screen and the shell. Writes
 * are serialized and coalesced (the Calendar's pattern): one save at a time,
 * always of the newest state, so quick changes (dragging the inspector,
 * flipping Grid/List) can never land out of order and overwrite newer state.
 */
export function createMediaPreferencesStore(storage: MediaPreferenceStorage): MediaPreferencesStore {
  let state = DEFAULT_MEDIA_PREFERENCES;
  let isLoaded = false;
  let loading: Promise<void> | null = null;
  let touched = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  let saving: Promise<void> | null = null;
  let again = false;
  const persist = () => {
    if (!storage.save) return;
    if (saving) {
      again = true;
      return;
    }
    saving = (async () => {
      do {
        again = false;
        try {
          await storage.save!(state);
        } catch {
          // A preference that can't be saved still applies for this visit.
        }
      } while (again);
      saving = null;
    })();
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getState: () => state,
    loaded: () => isLoaded,
    load: () => {
      loading ??= (async () => {
        try {
          const stored = normalizeMediaPreferences(await storage.load());
          // A choice made while the stored value was on its way wins.
          if (!touched) state = stored;
        } catch {
          // Defaults.
        }
        isLoaded = true;
        emit();
      })();
      return loading;
    },
    update: (patch) => {
      const next = normalizeMediaPreferences({ ...state, ...patch });
      if (next.layout === state.layout && next.sort === state.sort && next.inspectorSize === state.inspectorSize) return;
      touched = true;
      state = next;
      emit();
      persist();
    },
    settled: () => saving ?? Promise.resolve()
  };
}
