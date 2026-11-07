import { describe, expect, it } from "vitest";
import { createMediaPreferencesStore, DEFAULT_MEDIA_PREFERENCES, INSPECTOR_SIZE, normalizeMediaPreferences, type MediaPreferences } from "../../src/media/media-preferences";

describe("Media preferences", () => {
  it("normalize anything stored to grid/list, a known sort and a bounded inspector width", () => {
    expect(normalizeMediaPreferences(null)).toEqual(DEFAULT_MEDIA_PREFERENCES);
    expect(normalizeMediaPreferences({ layout: "list", sort: "name", inspectorSize: 40.4, search: "band", selected: 3 })).toEqual({ layout: "list", sort: "name", inspectorSize: 40 });
    expect(normalizeMediaPreferences({ layout: "masonry", sort: "-id", inspectorSize: 99 })).toEqual({ ...DEFAULT_MEDIA_PREFERENCES, inspectorSize: INSPECTOR_SIZE.max });
  });

  it("save one at a time, always the newest state, so quick changes never land out of order", async () => {
    const saved: MediaPreferences[] = [];
    let release: () => void = () => {};
    const store = createMediaPreferencesStore({
      load: async () => DEFAULT_MEDIA_PREFERENCES,
      save: (value) => new Promise<void>((resolve) => { release = () => { saved.push(value); resolve(); }; })
    });
    store.update({ layout: "list" });
    store.update({ inspectorSize: 30 });
    store.update({ inspectorSize: 41 });
    store.update({ sort: "captured" });
    expect(store.getState()).toEqual({ layout: "list", sort: "captured", inspectorSize: 41 });
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await store.settled();
    expect(saved).toEqual([{ layout: "list", sort: "newest", inspectorSize: 32 }, { layout: "list", sort: "captured", inspectorSize: 41 }]);
  });

  it("let a choice made while the stored value loads win, and skip saving what didn't change", async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    const saves: MediaPreferences[] = [];
    const store = createMediaPreferencesStore({ load: () => new Promise((resolve) => { resolveLoad = resolve as never; }) as never, save: (value) => { saves.push(value); } });
    const loading = store.load();
    store.update({ layout: "list" });
    resolveLoad({ layout: "grid", sort: "name", inspectorSize: 45 });
    await loading;
    expect(store.loaded()).toBe(true);
    expect(store.getState().layout).toBe("list");
    store.update({ layout: "list" });
    expect(saves).toHaveLength(1);
  });
});
