import { describe, expect, it } from "vitest";
import {
  collectionActions,
  edgeChanges,
  visibleCollections,
  type Collection,
} from "../src/collections/collection-model";
import { interviewAppointment } from "../src/collections/interview-schedule";
import { appointmentToForm } from "../src/workspace/appointment-form";
import type { Interview } from "../src/collections/collection-model";
import { createCollectionApi } from "../src/collections/collection-api";
const collection = (patch: Partial<Collection> = {}): Collection => ({
  id: 1,
  name: "2026 SCBDA State Championships",
  brief: "",
  type: "event",
  status: "active",
  lead: { id: 1, name: "Caroline" },
  members: [{ id: 2, name: "Alex" }],
  startDate: "2026-10-24",
  endDate: "",
  archived: false,
  createdAt: "",
  updatedAt: "2026-10-25",
  storyIds: [1, 2],
  storyCount: 2,
  storySummary: { Published: 1, Reporting: 1 },
  interviewCount: 6,
  openTaskCount: 3,
  canEdit: true,
  canDuplicate: true,
  ...patch,
});
const filters = {
  search: "",
  status: "",
  person: "",
  archive: "active",
  sort: "updated",
};
describe("Collection planning contracts", () => {
  it("filters search, status, leads/members and archive independently, then sorts", () => {
    const items = [
      collection(),
      collection({
        id: 2,
        name: "Election",
        status: "planning",
        lead: null,
        members: [],
        startDate: "",
        updatedAt: "2026-10-26",
      }),
      collection({
        id: 3,
        name: "Archive",
        status: "archived",
        archived: true,
      }),
    ];
    expect(visibleCollections(items, filters).map((c) => c.id)).toEqual([2, 1]);
    expect(
      visibleCollections(items, { ...filters, search: "  sCbDa " }).map(
        (c) => c.id,
      ),
    ).toEqual([1]);
    expect(
      visibleCollections(items, { ...filters, person: "2" }).map((c) => c.id),
    ).toEqual([1]);
    expect(
      visibleCollections(items, { ...filters, person: "1" }).map((c) => c.id),
    ).toEqual([1]);
    expect(
      visibleCollections(items, { ...filters, status: "planning" }).map(
        (c) => c.id,
      ),
    ).toEqual([2]);
    expect(
      visibleCollections(items, { ...filters, archive: "archived" }).map(
        (c) => c.id,
      ),
    ).toEqual([3]);
    expect(
      visibleCollections(items, { ...filters, sort: "date" }).map((c) => c.id),
    ).toEqual([1, 2]);
  });
  it("provides one complete action definition for overflow and context menus", () => {
    expect(collectionActions(collection()).map((a) => a.id)).toEqual([
      "open",
      "story",
      "interview",
      "edit",
      "duplicate",
      "archive",
    ]);
    expect(
      collectionActions(collection({ canEdit: false })).map((a) => a.id),
    ).toEqual(["open"]);
    expect(
      collectionActions(collection({ canDuplicate: false })).some(
        (a) => a.id === "duplicate",
      ),
    ).toBe(false);
    expect(
      collectionActions(collection({ archived: true })).at(-1)?.label,
    ).toBe("Restore collection");
  });
  it("changes only selected edges, preserving other Collections and interview links", () => {
    expect(edgeChanges([1, 2], [2, 3])).toEqual([
      { target: 1, linked: false },
      { target: 3, linked: true },
    ]);
    expect(edgeChanges([1, 2], [2, 1])).toEqual([]);
    expect(edgeChanges([], [])).toEqual([]);
  });
  it("loads every Collection list page before filtering", async () => {
    const calls: string[] = [];
    const api = createCollectionApi(async <T>({ path }: { path: string }) => {
      calls.push(path);
      return {
        collections: [collection({ id: calls.length })],
        pages: 2,
        total: 2,
      } as T;
    });
    expect((await api.list()).collections.map((c) => c.id)).toEqual([1, 2]);
    expect(calls).toEqual([
      "/byline/v1/editorial/collections",
      "/byline/v1/editorial/collections?page=2",
    ]);
  });
  it("uses idempotent edge endpoints without replacing serialized ID lists", async () => {
    const calls: unknown[] = [];
    const api = createCollectionApi(async <T>(options: unknown) => {
      calls.push(options);
      return {} as T;
    });
    await api.link(12, "story", 34, true);
    await api.link(12, "interview-story", 34, false, 56);
    expect(calls).toEqual([
      {
        path: "/byline/v1/editorial/collections/12/links/story/34",
        method: "POST",
      },
      {
        path: "/byline/v1/editorial/collections/12/interviews/56/links/interview-story/34",
        method: "DELETE",
      },
    ]);
  });
  it("reuses exact and fuzzy appointment timing without creating story copies", () => {
    const base = {
      id: 8,
      collectionId: 1,
      interviewee: "Director",
      status: "scheduled",
      scheduledAt: "2026-10-25T01:00:00Z",
      interviewers: [],
      notes: "",
    } as unknown as Interview;
    const form = appointmentToForm(
      interviewAppointment(base),
      "America/New_York",
    );
    expect(form.date).toBe("2026-10-24");
    expect(form.startTime).toBe("21:00");
    const window = interviewAppointment({
      ...base,
      scheduleMode: "window",
      scheduledAt: "",
      windowStart: "2026-10-24",
      windowEnd: "2026-10-30",
    });
    expect(window.startAt).toBeNull();
    expect(window.windowStart).toBe("2026-10-24");
  });
});
