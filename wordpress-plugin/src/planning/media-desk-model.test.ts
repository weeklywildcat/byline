import { describe, expect, it } from "vitest";
import { createPlanningFetchers, mediaAssignmentPath, type PlanningRequestOptions } from "./planning-api";
import { EMPTY_MEDIA_DESK_FILTERS, filterMediaRows, mediaDeskRows, mediaReadinessHint, sortMediaRows } from "./media-desk-model";
import type { MediaAssignmentRow, MediaRequest } from "./planning-model";

function assignment(patch: Partial<MediaAssignmentRow> = {}): MediaAssignmentRow {
  return {
    id: "a1",
    story: { id: 41, title: "Cafeteria changes", editUrl: "/wp-admin/post.php?post=41&action=edit" },
    title: "Cafeteria photos",
    type: "photo",
    status: "assigned",
    assignee: { id: 9, name: "Pat" },
    dueAt: "2026-10-30T03:00:00Z",
    notes: "",
    attachmentIds: [],
    ...patch
  };
}

describe("media desk rows", () => {
  it("makes one row per production assignment and marks the primary one per story", () => {
    const rows = mediaDeskRows({
      requests: [],
      assignments: [
        assignment({ id: "a1", status: "done" }),
        assignment({ id: "a2", title: "Principal portrait" }),
        assignment({ id: "b1", story: { id: 50, title: "Other", editUrl: "" }, status: "done" })
      ]
    });
    expect(rows.map((row) => [row.id, row.source, row.isPrimary])).toEqual([["a1", "assignment", false], ["a2", "assignment", true], ["b1", "assignment", true]]);
  });

  it("falls back to the legacy per-story requests on an older server", () => {
    const request: MediaRequest = { id: 41, story: { id: 41, title: "Cafeteria changes", editUrl: "" }, type: "photo", status: "needed", assignee: null, dueAt: null, notes: "Need a lead photo", attachmentIds: [3] };
    const rows = mediaDeskRows({ requests: [request] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "request", id: "41", notes: "Need a lead photo", isPrimary: true, attachmentIds: [3] });
  });
});

describe("media desk filters", () => {
  const rows = mediaDeskRows({
    requests: [],
    assignments: [
      assignment({ id: "p", type: "photo", dueAt: "2026-10-30T03:00:00Z" }),
      assignment({ id: "a", type: "audio", title: "Podcast cut", status: "needed", assignee: null, dueAt: "2026-11-05" }),
      assignment({ id: "n", type: "video", dueAt: null, status: "done" })
    ]
  });
  const ids = (list: ReturnType<typeof mediaDeskRows>) => list.map((row) => row.id);

  it("filters by type (including Audio), status and assignee", () => {
    expect(ids(filterMediaRows(rows, { ...EMPTY_MEDIA_DESK_FILTERS, type: "audio" }))).toEqual(["a"]);
    expect(ids(filterMediaRows(rows, { ...EMPTY_MEDIA_DESK_FILTERS, status: "done" }))).toEqual(["n"]);
    expect(ids(filterMediaRows(rows, { ...EMPTY_MEDIA_DESK_FILTERS, assigneeId: "9" }))).toEqual(["p", "n"]);
  });

  it("filters by due range in the site timezone and excludes undated rows from a range", () => {
    // 03:00 UTC Oct 30 is Oct 29 in New York.
    expect(ids(filterMediaRows(rows, { ...EMPTY_MEDIA_DESK_FILTERS, dueTo: "2026-10-29" }, "America/New_York"))).toEqual(["p"]);
    expect(ids(filterMediaRows(rows, { ...EMPTY_MEDIA_DESK_FILTERS, dueFrom: "2026-10-30" }, "America/New_York"))).toEqual(["a"]);
    expect(ids(filterMediaRows(rows, { ...EMPTY_MEDIA_DESK_FILTERS, dueFrom: "2026-01-01" }, "America/New_York"))).not.toContain("n");
  });

  it("searches story and assignment titles, and sorts earliest due first with undated last", () => {
    expect(ids(filterMediaRows(rows, { ...EMPTY_MEDIA_DESK_FILTERS, story: "podcast" }))).toEqual(["a"]);
    expect(ids(sortMediaRows(rows, "America/New_York"))).toEqual(["p", "a", "n"]);
  });
});

describe("readiness hint", () => {
  it("is honest about missing and invalid media", () => {
    expect(mediaReadinessHint({ attachmentIds: [], attachments: [], invalidAttachmentIds: [], mediaReadiness: null })).toEqual({ label: "No media linked", tone: "neutral" });
    expect(mediaReadinessHint({ attachmentIds: [1], invalidAttachmentIds: [2] }).tone).toBe("warning");
    expect(mediaReadinessHint({ attachmentIds: [1], attachments: [{ id: 1, checks: { alt: false, credit: true, rights: false } }] }).label).toBe("Needs alt text, rights");
    expect(mediaReadinessHint({ attachmentIds: [1], attachments: [{ id: 1, checks: { alt: true, credit: true, rights: true } }], mediaReadiness: { ready: true } })).toEqual({ label: "Metadata ready", tone: "success" });
  });
});

describe("per-assignment routes", () => {
  it("updates an assignment (including legacy-v1) and reads the schedule feed through the protected routes", async () => {
    const requests: PlanningRequestOptions[] = [];
    const api = createPlanningFetchers(async <T>(options: PlanningRequestOptions): Promise<T> => {
      requests.push(options);
      return {} as T;
    });
    await api.updateMediaAssignment?.(41, "9f8e", { status: "done", dueAt: "2026-10-30" });
    await api.updateMediaAssignment?.(41, "legacy-v1", { assigneeId: 0 });
    await api.getSchedule?.("2026-10-12", "2026-11-01");
    await api.getSchedule?.("2026-10-12", "2026-11-01", true);
    expect(requests.map(({ path, method, data }) => ({ path, method, data }))).toEqual([
      { path: "/byline/v1/editorial/stories/41/media-assignments/9f8e", method: "POST", data: { status: "done", dueAt: "2026-10-30" } },
      { path: "/byline/v1/editorial/stories/41/media-assignments/legacy-v1", method: "POST", data: { assigneeId: 0 } },
      { path: "/byline/v1/editorial/schedule?from=2026-10-12&to=2026-11-01", method: undefined, data: undefined },
      { path: "/byline/v1/editorial/schedule?from=2026-10-12&to=2026-11-01&includeTasks=1", method: undefined, data: undefined }
    ]);
    expect(mediaAssignmentPath(3, "a b")).toBe("/byline/v1/editorial/stories/3/media-assignments/a%20b");
  });
});
