import { describe, expect, it } from "vitest";
import { addDays, appointmentLine, appointmentTiming, formatTimeRange, formatWindow, quickWindow, schedulingNeed, splitAppointments, upcomingConfirmed, windowRelativeLabel, type SchedulableAppointment } from "./schedule-model";

const timezone = "America/New_York";
// Tuesday, Oct 20, 2026, 12:00 UTC (08:00 in New York).
const now = new Date("2026-10-20T12:00:00Z");

function appointment(patch: Partial<SchedulableAppointment> = {}): SchedulableAppointment {
  return { id: "a", title: "Interview", status: "planned", scheduleMode: "unscheduled", windowStart: null, windowEnd: null, startAt: null, endAt: null, ...patch };
}

describe("appointment timing", () => {
  it("reads an exact time in the site timezone, not the browser's", () => {
    const exact = appointment({ scheduleMode: "exact", startAt: "2026-10-27T14:15:00Z", endAt: "2026-10-27T14:35:00Z" });
    expect(appointmentTiming(exact, timezone)).toMatchObject({ exact: true, secondary: expect.stringMatching(/10:15.*10:35\s?AM/) });
    // The same instant is the previous evening in Los Angeles; the site still wins.
    expect(appointmentTiming({ ...exact, startAt: "2026-10-28T02:30:00Z", endAt: null }, timezone).primary).toContain("27");
  });
  it("never fabricates a time for a target window", () => {
    const line = appointmentLine(appointment({ scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30" }), timezone);
    expect(line).toBe("Target Oct 26–30 · Time to be set");
    expect(line).not.toMatch(/AM|PM|\d:\d\d/);
  });
  it("says so when there is no date at all", () => {
    expect(appointmentTiming(appointment(), timezone)).toEqual({ primary: "Not scheduled", secondary: "Date to be set", exact: false });
  });
  it("formats ranges compactly", () => {
    expect(formatWindow("2026-10-26", "2026-10-30")).toBe("Oct 26–30");
    expect(formatWindow("2026-10-29", "2026-10-29")).toBe("Oct 29");
    expect(formatWindow("2026-10-30", "2026-11-02")).toBe("Oct 30–Nov 2");
    expect(formatTimeRange("2026-10-27T14:15:00Z", "2026-10-27T14:35:00Z", timezone)).toMatch(/^10:15–10:35\sAM$/);
    expect(formatTimeRange("2026-10-27T15:30:00Z", "2026-10-27T17:00:00Z", timezone)).toMatch(/11:30\sAM–1:00\sPM/);
  });
});

describe("quick target windows", () => {
  it("offers Monday–Friday of next week", () => {
    expect(quickWindow("next-week", timezone, now)).toEqual({ start: "2026-10-26", end: "2026-10-30" });
  });
  it("starts this week today, never in the past", () => {
    expect(quickWindow("this-week", timezone, now)).toEqual({ start: "2026-10-20", end: "2026-10-23" });
    expect(quickWindow("this-week", timezone, new Date("2026-10-19T12:00:00Z"))).toEqual({ start: "2026-10-19", end: "2026-10-23" });
  });
  it("rolls a weekend's 'this week' to the end of the weekend", () => {
    expect(quickWindow("this-week", timezone, new Date("2026-10-24T15:00:00Z"))).toEqual({ start: "2026-10-24", end: "2026-10-25" });
  });
  it("describes windows in plain words", () => {
    expect(windowRelativeLabel("2026-10-26", "2026-10-30", timezone, now)).toBe("next week");
    expect(windowRelativeLabel("2026-10-20", "2026-10-23", timezone, now)).toBe("this week");
    expect(windowRelativeLabel("2026-11-09", "2026-11-13", timezone, now)).toBe("Nov 9–13");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("what appears where", () => {
  const exact = appointment({ id: "x", scheduleMode: "exact", status: "confirmed", startAt: "2026-10-27T14:15:00Z", endAt: "2026-10-27T14:35:00Z" });
  const fuzzy = appointment({ id: "f", title: "Interview local reporter", scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30" });
  const idea = appointment({ id: "i", title: "Someday" });
  it("keeps exact appointments on their day and sends fuzzy ones to needs scheduling", () => {
    const split = splitAppointments([fuzzy, exact, idea, appointment({ id: "d", status: "completed", scheduleMode: "exact", startAt: "2026-10-01T14:00:00Z" })], timezone);
    expect(split.days).toEqual([{ day: "2026-10-27", items: [exact] }]);
    expect(split.toSchedule.map((a) => a.id)).toEqual(["f", "i"]);
    expect(split.past.map((a) => a.id)).toEqual(["d"]);
  });
  it("lists only confirmed exact appointments as coming up, never a window", () => {
    expect(upcomingConfirmed([exact, fuzzy, { ...exact, id: "t", status: "tentative" }, { ...exact, id: "far", startAt: "2026-12-01T14:00:00Z" }], timezone, now).map((a) => a.id)).toEqual(["x"]);
  });
  it("nags only when a target window is near", () => {
    expect(schedulingNeed(fuzzy, timezone, now)?.label).toBe("Needs scheduling for next week");
    expect(schedulingNeed({ ...fuzzy, windowStart: "2026-11-23", windowEnd: "2026-11-27" }, timezone, now)).toBeNull();
    expect(schedulingNeed(idea, timezone, now)).toBeNull();
    expect(schedulingNeed({ ...fuzzy, status: "confirmed" }, timezone, now)).toBeNull();
    expect(schedulingNeed({ ...fuzzy, windowStart: "2026-10-12", windowEnd: "2026-10-16" }, timezone, now)).toEqual({ label: "Target window has passed", urgent: true });
    expect(schedulingNeed({ ...fuzzy, windowStart: "2026-09-01", windowEnd: "2026-09-05" }, timezone, now)).toBeNull();
  });
});
