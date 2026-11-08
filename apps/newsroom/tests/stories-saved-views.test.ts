import { DEFAULT_PLANNING_SORT, EMPTY_PLANNING_FILTERS } from "@byline/newsroom-screens/planning/planning-model";
import { SAVED_VIEW_LIMIT } from "@byline/newsroom-screens/planning/story-views";
import { describe, expect, it } from "vitest";
import { createPreferenceSavedViews, SAVED_VIEWS_PREFERENCE_KEY, type PreferenceStore } from "../src/ui/stories/saved-views";

/** Payload Preferences as `usePreferences()` presents them to one signed-in account. */
function memoryStore(initial?: unknown) {
  const values = new Map<string, unknown>(initial === undefined ? [] : [[SAVED_VIEWS_PREFERENCE_KEY, initial]]);
  const writes: unknown[] = [];
  const store: PreferenceStore = {
    getPreference: async <T,>(key: string) => (values.get(key) ?? null) as T,
    setPreference: async <T,>(key: string, value: T) => { writes.push(value); values.set(key, structuredClone(value)); }
  };
  return { store, writes, stored: () => values.get(SAVED_VIEWS_PREFERENCE_KEY) };
}

let counter = 0;
const ids = () => `view-${++counter}`;
const sort = { key: "story" as const, direction: "desc" as const };

describe("Stories saved views in Payload Preferences", () => {
  it("is an empty list when the account has no preference yet", async () => {
    const { store } = memoryStore();
    expect(await createPreferenceSavedViews(store, ids).getSavedViews()).toEqual([]);
  });

  it("sanitizes a malformed stored value instead of trusting it", async () => {
    const { store } = memoryStore([
      { id: "ok", name: " Mine ", filters: { mine: "true", writerId: "x", workflow: "<script>" }, sort: { key: "secret", direction: "up" } },
      { id: "ok", name: "Duplicate" },
      { name: "No id", filters: {} },
      42
    ]);
    expect(await createPreferenceSavedViews(store, ids).getSavedViews()).toEqual([
      { id: "ok", name: "Mine", filters: { ...EMPTY_PLANNING_FILTERS, mine: true }, sort: DEFAULT_PLANNING_SORT }
    ]);
    expect(await createPreferenceSavedViews(memoryStore({ not: "a list" }).store, ids).getSavedViews()).toEqual([]);
  });

  it("creates a view with a new id, normalizing its filters and sort, and stores the whole normalized list", async () => {
    const { store, stored } = memoryStore();
    const views = createPreferenceSavedViews(store, () => "fresh-id");
    const saved = await views.saveSavedView({ name: "  Due this week  ", filters: { ...EMPTY_PLANNING_FILTERS, deadlineFrom: "2026-11-09", deadlineTo: "nope", query: "  budget " }, sort: { key: "bogus", direction: "asc" } as never });
    expect(saved).toMatchObject({ id: "fresh-id", name: "Due this week", filters: { ...EMPTY_PLANNING_FILTERS, deadlineFrom: "2026-11-09", query: "budget" }, sort: DEFAULT_PLANNING_SORT });
    expect(stored()).toEqual([saved]);
  });

  it("updates and renames in place", async () => {
    const { store } = memoryStore();
    const views = createPreferenceSavedViews(store, ids);
    const first = await views.saveSavedView({ name: "First", filters: EMPTY_PLANNING_FILTERS, sort });
    const second = await views.saveSavedView({ name: "Second", filters: EMPTY_PLANNING_FILTERS, sort });
    await views.saveSavedView({ id: first.id, name: "First, renamed", filters: { ...EMPTY_PLANNING_FILTERS, overdue: true }, sort });
    const list = await views.getSavedViews();
    expect(list.map((view) => [view.id, view.name])).toEqual([[second.id, "Second"], [first.id, "First, renamed"]]);
    expect(list[1].filters.overdue).toBe(true);
  });

  it("deletes, and Undo restores the same view", async () => {
    const { store } = memoryStore();
    const views = createPreferenceSavedViews(store, ids);
    const view = await views.saveSavedView({ name: "Mine", filters: { ...EMPTY_PLANNING_FILTERS, mine: true }, sort });
    await views.deleteSavedView(view.id);
    expect(await views.getSavedViews()).toEqual([]);
    await expect(views.deleteSavedView(view.id)).rejects.toMatchObject({ data: { status: 404 } });
    const restored = await views.saveSavedView({ id: view.id, name: view.name, filters: view.filters, sort: view.sort });
    expect(restored.id).toBe(view.id);
    expect((await views.getSavedViews()).map((item) => item.id)).toEqual([view.id]);
  });

  it(`keeps at most ${SAVED_VIEW_LIMIT}, and still lets the last one be renamed`, async () => {
    const { store } = memoryStore();
    const views = createPreferenceSavedViews(store, ids);
    for (let index = 0; index < SAVED_VIEW_LIMIT; index += 1) await views.saveSavedView({ name: `View ${index}`, filters: EMPTY_PLANNING_FILTERS, sort });
    await expect(views.saveSavedView({ name: "One too many", filters: EMPTY_PLANNING_FILTERS, sort })).rejects.toMatchObject({ data: { status: 400 } });
    const [latest] = await views.getSavedViews();
    await expect(views.saveSavedView({ id: latest.id, name: "Renamed", filters: EMPTY_PLANNING_FILTERS, sort })).resolves.toMatchObject({ name: "Renamed" });
    expect(await views.getSavedViews()).toHaveLength(SAVED_VIEW_LIMIT);
  });

  it("refuses a nameless view", async () => {
    const views = createPreferenceSavedViews(memoryStore().store, ids);
    await expect(views.saveSavedView({ name: "   ", filters: EMPTY_PLANNING_FILTERS, sort })).rejects.toMatchObject({ data: { status: 400 } });
  });
});
