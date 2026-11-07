import { describe, expect, it } from "vitest";
import { EMPTY_MEDIA_DESK_FILTERS, filterMediaRows, isMediaWorkScope, mediaDeskRows, mediaReadinessHint, mediaWorkCounts, scopeMediaRows, sortMediaRows } from "../../src/media/media-desk-model";
import type { MediaAssignmentRow, MediaRequest } from "../../src/planning/planning-model";

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

describe("work scopes", () => {
  const today = "2026-11-06";
  const context = { currentUserId: 9, today, timezone: "America/New_York" };
  const rows = mediaDeskRows({
    requests: [],
    assignments: [
      assignment({ id: "mine-open", assignee: { id: 9, name: "Pat" }, dueAt: "2026-11-20T17:00:00Z" }),
      assignment({ id: "mine-done", assignee: { id: 9, name: "Pat" }, status: "done" }),
      assignment({ id: "overdue", assignee: { id: 4, name: "Lee" }, dueAt: "2026-11-01T17:00:00Z", attachmentIds: [7] }),
      // 2026-11-10 03:00 UTC is still Nov 9 in New York: inside the three-day window.
      assignment({ id: "due-local", assignee: null, dueAt: "2026-11-10T03:00:00Z" }),
      assignment({ id: "due-late", assignee: null, dueAt: "2026-11-10T17:00:00Z", attachmentIds: [8] }),
      assignment({ id: "undated", assignee: null, dueAt: null })
    ]
  });
  const ids = (scope: Parameters<typeof scopeMediaRows>[1]) => scopeMediaRows(rows, scope, context).map((row) => row.id);

  it("keeps finished work out of every scope but All", () => {
    expect(ids("all")).toHaveLength(6);
    expect(ids("mine")).toEqual(["mine-open"]);
  });

  it("finds due-soon work in the newsroom timezone, overdue included, undated excluded", () => {
    expect(ids("due")).toEqual(["overdue", "due-local"]);
  });

  it("finds open work with no files and open work nobody holds", () => {
    expect(ids("needs-files")).toEqual(["mine-open", "due-local", "undated"]);
    expect(ids("unassigned")).toEqual(["due-local", "due-late", "undated"]);
  });

  it("counts every scope from the same rows", () => {
    expect(mediaWorkCounts(rows, context)).toEqual({ all: 6, mine: 1, due: 2, "needs-files": 3, unassigned: 3 });
    expect(mediaWorkCounts(rows, { ...context, currentUserId: null }).mine).toBe(0);
  });

  it("recognises only real scopes", () => {
    expect(isMediaWorkScope("due")).toBe(true);
    expect(isMediaWorkScope("folders")).toBe(false);
  });
});
