import { describe, expect, it } from "vitest";
import { mediaFormToInput, mediaReadinessHints, mediaToForm, emptyMediaForm } from "./media-form";
import type { StoryMediaAssignment } from "./workspace-types";

const timezone = "America/New_York";
const assignment: StoryMediaAssignment = {
  id: "m1", title: "Portrait", type: "photo", status: "assigned", assigneeId: 7, assignee: { id: 7, name: "Pat" }, dueAt: "2026-10-28T21:00:00Z",
  notes: "", attachmentIds: [11], attachments: [], invalidAttachmentIds: [], mediaReadiness: null, featuredAttachmentId: null, order: 0, isLegacy: false, createdAt: "", updatedAt: "2026-10-02T12:00:00Z"
};

describe("media assignment form", () => {
  it("reads the due day in the site timezone and keeps the clock time", () => {
    expect(mediaToForm(assignment, timezone)).toMatchObject({ dueDay: "2026-10-28", dueTime: "17:00" });
    expect(mediaToForm({ ...assignment, dueAt: "2026-10-29T02:00:00Z" }, timezone)).toMatchObject({ dueDay: "2026-10-28", dueTime: "22:00" });
  });
  it("sends a new due day at 17:00 site-local, without an offset", () => {
    const form = { ...emptyMediaForm(7), dueDay: "2026-10-30" };
    expect(mediaFormToInput(form, undefined, { manage: true, assign: true }, timezone).dueAt).toBe("2026-10-30T17:00");
  });
  it("omits unchanged due date, assignee and files so a re-save changes nothing else", () => {
    const form = { ...mediaToForm(assignment, timezone), notes: "Needs a vertical" };
    const input = mediaFormToInput(form, assignment, { manage: true, assign: true }, timezone);
    expect(input).not.toHaveProperty("dueAt");
    expect(input).not.toHaveProperty("assigneeId");
    expect(input).not.toHaveProperty("attachmentIds");
    expect(input).toMatchObject({ notes: "Needs a vertical", expectedUpdatedAt: assignment.updatedAt });
  });
  it("clears a due date with null", () => {
    const form = { ...mediaToForm(assignment, timezone), dueDay: "" };
    expect(mediaFormToInput(form, assignment, { manage: true, assign: true }, timezone).dueAt).toBeNull();
  });
  it("lets a participant send only status, notes and changed files", () => {
    const form = { ...mediaToForm(assignment, timezone), status: "uploaded" as const, title: "Hacked", assigneeId: 1, dueDay: "2030-01-01", attachmentIds: [11, 12] };
    const input = mediaFormToInput(form, assignment, { manage: false, assign: false }, timezone);
    expect(Object.keys(input).sort()).toEqual(["attachmentIds", "expectedUpdatedAt", "notes", "status"]);
    expect(Object.keys(mediaFormToInput(mediaToForm(assignment, timezone), assignment, { manage: false, assign: false }, timezone)).sort()).toEqual(["expectedUpdatedAt", "notes", "status"]);
  });
  it("does not let someone without assign rights reassign an existing assignment", () => {
    const form = { ...mediaToForm(assignment, timezone), assigneeId: 1 };
    expect(mediaFormToInput(form, assignment, { manage: true, assign: false }, timezone)).not.toHaveProperty("assigneeId");
  });
  it("describes readiness in short hints", () => {
    expect(mediaReadinessHints({ ...assignment, mediaReadiness: { missingAltIds: [1, 2], missingCreditIds: [1] } })).toEqual(["Missing alt text · 2", "Missing credit"]);
    expect(mediaReadinessHints(assignment)).toEqual([]);
  });
});
