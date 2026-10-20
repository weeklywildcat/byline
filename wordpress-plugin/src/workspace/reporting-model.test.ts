import { describe, expect, it } from "vitest";
import { sourceFormToInput, sourceNextAppointment, sourceTimingLine, validateSourceForm, windowSummary, emptySourceForm, sourceToForm } from "./reporting-model";
import type { StoryAppointment, StorySource } from "./workspace-types";

const timezone = "America/New_York";
const source: StorySource = { id: "s1", label: "Mrs. Hamby", role: "Principal", organization: "Central High", status: "needs-scheduling", assigneeIds: [2], assignees: [{ id: 2, name: "Gibson Bell" }], notes: "", createdAt: "", updatedAt: "2026-10-02T12:00:00Z" };
const appointment = (patch: Partial<StoryAppointment>): StoryAppointment => ({
  id: "a", title: "Interview", kind: "interview", status: "planned", scheduleMode: "unscheduled", windowStart: null, windowEnd: null, startAt: null, endAt: null,
  assigneeIds: [], assignees: [], sourceId: "s1", sourceLabel: "Mrs. Hamby", location: "", notes: "", createdAt: "", updatedAt: "", ...patch
});

describe("source timing", () => {
  it("shows an exact appointment as day and start time in the site timezone", () => {
    expect(sourceTimingLine(source, [appointment({ scheduleMode: "exact", startAt: "2026-10-27T14:15:00Z" })], timezone)).toMatch(/^Tue, Oct 27 · 10:15\s?AM$/);
  });
  it("shows a Monday–Friday window as a week and never invents a time", () => {
    const line = sourceTimingLine(source, [appointment({ scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30" })], timezone);
    expect(line).toBe("Week of Oct 26");
    expect(sourceTimingLine(source, [appointment({ scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-29" })], timezone)).toBe("Target Oct 26–29");
    expect(line).not.toMatch(/AM|PM/);
  });
  it("uses the earliest open linked appointment and ignores done, cancelled and other sources", () => {
    const later = appointment({ id: "later", scheduleMode: "exact", startAt: "2026-11-03T15:00:00Z" });
    const earlier = appointment({ id: "earlier", scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30" });
    const done = appointment({ id: "done", status: "completed", scheduleMode: "exact", startAt: "2026-10-01T15:00:00Z" });
    const other = appointment({ id: "other", sourceId: "s2", scheduleMode: "exact", startAt: "2026-10-21T15:00:00Z" });
    expect(sourceNextAppointment(source, [later, done, other, earlier], timezone)?.id).toBe("earlier");
    expect(sourceTimingLine(source, [done, other], timezone)).toBe("");
  });
  it("says so for an unscheduled linked appointment", () => {
    expect(sourceTimingLine(source, [appointment({})], timezone)).toBe("Not scheduled");
  });
  it("labels windows", () => {
    expect(windowSummary("2026-10-26", "2026-10-30")).toBe("Week of Oct 26");
    expect(windowSummary("2026-10-26", "2026-11-02")).toBe("Target Oct 26–Nov 2");
    expect(windowSummary("2026-10-29")).toBe("Target Oct 29");
  });
});

describe("source form", () => {
  it("requires a label and has no contact fields", () => {
    expect(validateSourceForm(emptySourceForm()).label).toBeTruthy();
    expect(validateSourceForm({ ...emptySourceForm(), label: "Name TBD" })).toEqual({});
    const input = sourceFormToInput({ ...sourceToForm(source), label: " Dr. Hamby " }, source);
    expect(Object.keys(input).sort()).toEqual(["assigneeIds", "expectedUpdatedAt", "label", "notes", "organization", "role", "status"]);
    expect(input).toMatchObject({ label: "Dr. Hamby", expectedUpdatedAt: source.updatedAt });
    expect(sourceFormToInput(emptySourceForm())).not.toHaveProperty("expectedUpdatedAt");
  });
  it("limits assignees and notes", () => {
    expect(validateSourceForm({ ...emptySourceForm(), label: "x", assigneeIds: [1, 2, 3, 4, 5] }).assignees).toBeTruthy();
    expect(validateSourceForm({ ...emptySourceForm(), label: "x", notes: "n".repeat(2001) }).notes).toBeTruthy();
  });
});
