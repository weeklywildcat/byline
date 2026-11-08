import { describe, expect, it } from "vitest";
import { describeReschedule, moveEvent, rescheduleChange, rescheduleKindOf } from "../../src/calendar/calendar-reschedule";
import type { PlanningCalendarEvent } from "../../src/planning/planning-model";

const TZ = "America/New_York";

const event = (patch: Partial<PlanningCalendarEvent>): PlanningCalendarEvent => ({
  id: "41-deadline", timing: { kind: "date", date: "2026-11-17" }, storyId: 41, storyTitle: "Cafeteria changes", storyUrl: "/s/41",
  type: "deadline", date: "2026-11-17", exactDate: "2026-11-17", label: "Deadline", ...patch
});

describe("which events can be dragged", () => {
  it("allows deadlines, plans, publish times, appointments and production, never published dates or tasks", () => {
    expect(rescheduleKindOf(event({}))).toBe("deadline");
    expect(rescheduleKindOf(event({ type: "planned" }))).toBe("planned");
    expect(rescheduleKindOf(event({ type: "scheduled" }))).toBe("scheduled");
    expect(rescheduleKindOf(event({ type: "published" }))).toBeNull();
    expect(rescheduleKindOf(event({ type: "task" }))).toBeNull();
  });

  it("needs a record id for appointments and production, and a real story", () => {
    expect(rescheduleKindOf(event({ type: "appointment" }))).toBeNull();
    expect(rescheduleKindOf(event({ type: "appointment", recordId: "a1" }))).toBe("appointment");
    expect(rescheduleKindOf(event({ type: "media", recordId: "m1" }))).toBe("media");
    expect(rescheduleKindOf(event({ storyId: 0 }))).toBeNull();
  });
});

describe("what a drop saves", () => {
  it("moves a deadline to the dropped day", () => {
    expect(rescheduleChange(event({}), "2026-11-20", TZ)).toEqual({ kind: "deadline", storyId: 41, deadline: "2026-11-20" });
  });

  it("does nothing when dropped on its own day or an unreadable one", () => {
    expect(rescheduleChange(event({}), "2026-11-17", TZ)).toBeNull();
    expect(rescheduleChange(event({}), "tomorrow", TZ)).toBeNull();
  });

  it("keeps a day-only plan a day, with the day-only placeholder time", () => {
    const planned = event({ type: "planned", id: "41-planned", date: "2026-11-18", timing: { kind: "date", date: "2026-11-18" } });
    expect(rescheduleChange(planned, "2026-11-21", TZ)).toEqual({ kind: "planned", storyId: 41, plannedPublication: "2026-11-21T12:00" });
  });

  it("keeps a timed plan at the same newsroom wall-clock time", () => {
    // 15:30Z is 10:30 in New York in November.
    const planned = event({ type: "planned", id: "41-planned", date: "2026-11-18", timing: { kind: "timed", start: "2026-11-18T15:30:00Z", end: null } });
    expect(rescheduleChange(planned, "2026-11-20", TZ)).toEqual({ kind: "planned", storyId: 41, plannedPublication: "2026-11-20T10:30" });
  });

  it("keeps the wall-clock time across daylight saving", () => {
    // Nov 1 2026 is the end of daylight time in New York: 10:30 stays 10:30 either side.
    const planned = event({ type: "planned", date: "2026-10-30", timing: { kind: "timed", start: "2026-10-30T14:30:00Z", end: null } });
    expect(rescheduleChange(planned, "2026-11-03", TZ)).toEqual({ kind: "planned", storyId: 41, plannedPublication: "2026-11-03T10:30" });
  });

  it("moves an appointment by whole days, keeping its start and its length", () => {
    const appointment = event({
      type: "appointment", recordId: "a1", id: "appointment-a1", date: "2026-11-18",
      timing: { kind: "timed", start: "2026-11-18T15:00:00Z", end: "2026-11-18T16:15:00Z" }
    });
    expect(rescheduleChange(appointment, "2026-11-19", TZ)).toEqual({ kind: "appointment", storyId: 41, appointmentId: "a1", startAt: "2026-11-19T10:00", endAt: "2026-11-19T11:15" });
  });

  it("moves a production due date to a day", () => {
    const media = event({ type: "media", recordId: "m1", id: "media-41-m1", date: "2026-11-18", timing: { kind: "date", date: "2026-11-18" } });
    expect(rescheduleChange(media, "2026-11-25", TZ)).toEqual({ kind: "media", storyId: 41, assignmentId: "m1", dueAt: "2026-11-25T12:00" });
  });

  it("names the publish time being replaced, so a changed schedule is a conflict", () => {
    const scheduled = event({ type: "scheduled", id: "41-scheduled", date: "2026-11-18", timing: { kind: "timed", start: "2026-11-18T14:00:00.000Z", end: null } });
    expect(rescheduleChange(scheduled, "2026-11-19", TZ)).toEqual({ kind: "scheduled", storyId: 41, at: "2026-11-19T09:00", expected: "2026-11-18T14:00:00.000Z" });
  });
});

describe("showing the move before it is saved", () => {
  it("puts the event on its new day, with its time and length", () => {
    const appointment = event({
      type: "appointment", recordId: "a1", id: "appointment-a1", date: "2026-11-18", sortTime: "2026-11-18T15:00:00Z",
      timing: { kind: "timed", start: "2026-11-18T15:00:00Z", end: "2026-11-18T15:30:00Z" }
    });
    const moved = moveEvent(appointment, "2026-11-20", TZ)!;
    expect(moved.date).toBe("2026-11-20");
    expect(moved.timing).toEqual({ kind: "timed", start: "2026-11-20T15:00:00Z", end: "2026-11-20T15:30:00Z" });
    expect(moved.sortTime).toBe("2026-11-20T15:00:00Z");
  });

  it("moves a date event and refuses what cannot move", () => {
    expect(moveEvent(event({}), "2026-11-20", TZ)?.timing).toEqual({ kind: "date", date: "2026-11-20" });
    expect(moveEvent(event({ type: "published" }), "2026-11-20", TZ)).toBeNull();
  });

  it("describes a move in plain words", () => {
    expect(describeReschedule({ label: "Deadline", storyTitle: "Cafeteria changes" }, "2026-11-17", "2026-11-20", "en-US")).toBe("Deadline for Cafeteria changes: Nov 17 to Nov 20");
  });
});
