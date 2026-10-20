import { describe, expect, it } from "vitest";
import {
  appointmentFormToInput,
  appointmentToForm,
  applyQuickWindow,
  dayFromLocalDate,
  emptyAppointmentForm,
  isValid,
  localDateFromDay,
  rangeToWindow,
  setExactDate,
  setScheduleMode,
  siteWallParts,
  validateAppointmentForm
} from "./appointment-form";
import type { StoryAppointment } from "./workspace-types";

const timezone = "America/New_York";

function stored(patch: Partial<StoryAppointment> = {}): StoryAppointment {
  return {
    id: "a1", title: "Interview Mrs. Hamby", kind: "interview", status: "planned", scheduleMode: "unscheduled",
    windowStart: null, windowEnd: null, startAt: null, endAt: null, assigneeIds: [2], assignees: [{ id: 2, name: "Gibson Bell" }],
    sourceId: null, sourceLabel: null, location: "", notes: "", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-02T12:00:00Z", ...patch
  };
}

/** What the WordPress server does with a site-local wall time: the first matching instant. */
function wallToInstant(wall: string, tz: string): string {
  const guess = Date.parse(`${wall}:00Z`);
  const matches: number[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = new Date(guess - offset * 60_000).toISOString();
    const parts = siteWallParts(candidate, tz)!;
    if (`${parts.date}T${parts.time}` === wall) matches.push(Date.parse(candidate));
  }
  return new Date(Math.min(...matches)).toISOString().replace(".000Z", "Z");
}

describe("exact time round trip in the site timezone", () => {
  it("reads a stored instant as wall time in the site timezone, not the browser's", () => {
    expect(siteWallParts("2026-10-27T14:15:00Z", timezone)).toEqual({ date: "2026-10-27", time: "10:15" });
    // 02:30 UTC is still the previous evening in New York.
    expect(siteWallParts("2026-10-28T02:30:00Z", timezone)).toEqual({ date: "2026-10-27", time: "22:30" });
    expect(siteWallParts("2026-10-27T04:00:00Z", timezone)).toEqual({ date: "2026-10-27", time: "00:00" });
  });

  it.each([
    ["just before spring forward (EST)", "2026-03-08T06:30:00Z", "2026-03-08T01:30"],
    ["just after spring forward (EDT)", "2026-03-08T07:30:00Z", "2026-03-08T03:30"],
    ["the day after fall back (EST)", "2026-11-02T15:00:00Z", "2026-11-02T10:00"],
    ["the day before fall back (EDT)", "2026-10-31T14:00:00Z", "2026-10-31T10:00"]
  ])("round-trips %s", (_label, instant, wall) => {
    const form = appointmentToForm(stored({ scheduleMode: "exact", startAt: instant, endAt: null }), timezone);
    const input = appointmentFormToInput({ ...form, mode: "exact", startTime: form.startTime }, undefined, timezone);
    expect(input.startAt).toBe(wall);
    expect(wallToInstant(input.startAt!, timezone)).toBe(instant);
  });

  it("keeps start and end across the spring-forward gap in order", () => {
    const form = appointmentToForm(stored({ scheduleMode: "exact", startAt: "2026-03-08T06:30:00Z", endAt: "2026-03-08T07:30:00Z" }), timezone);
    expect(form).toMatchObject({ date: "2026-03-08", startTime: "01:30", endDate: "2026-03-08", endTime: "03:30" });
    expect(isValid(validateAppointmentForm(form))).toBe(true);
    expect(appointmentFormToInput(form, undefined, timezone)).toMatchObject({ startAt: "2026-03-08T01:30", endAt: "2026-03-08T03:30" });
  });

  it("sends site-local wall time, never an offset or UTC marker", () => {
    const input = appointmentFormToInput(emptyAppointmentForm({ title: "Game", mode: "exact", date: "2026-10-27", startTime: "19:00", endDate: "2026-10-27", endTime: "21:00" }), undefined, timezone);
    expect(input.startAt).toBe("2026-10-27T19:00");
    expect(input.endAt).toBe("2026-10-27T21:00");
    expect(`${input.startAt}${input.endAt}`).not.toMatch(/Z|[+-]\d\d:?\d\d$/);
  });

  it("does not re-send an untouched time, so the repeated fall-back hour cannot drift", () => {
    // 06:30Z is the SECOND 01:30 on Nov 1 (EST); reading it as wall time would resolve to the first one.
    const second = stored({ scheduleMode: "exact", startAt: "2026-11-01T06:30:00Z" });
    const form = appointmentToForm(second, timezone);
    expect(wallToInstant(`${form.date}T${form.startTime}`, timezone)).not.toBe(second.startAt);
    const input = appointmentFormToInput({ ...form, title: "Renamed" }, second, timezone);
    expect(input).not.toHaveProperty("startAt");
    expect(input).not.toHaveProperty("scheduleMode");
    expect(input.title).toBe("Renamed");
    expect(input.expectedUpdatedAt).toBe(second.updatedAt);
  });

  it("sends the timing again once it is changed", () => {
    const existing = stored({ scheduleMode: "exact", startAt: "2026-10-27T14:15:00Z" });
    const form = { ...appointmentToForm(existing, timezone), startTime: "11:00" };
    expect(appointmentFormToInput(form, existing, timezone)).toMatchObject({ scheduleMode: "exact", startAt: "2026-10-27T11:00", endAt: null, windowStart: null, windowEnd: null });
  });

  it("keeps an end that falls after midnight on its own day", () => {
    const form = appointmentToForm(stored({ scheduleMode: "exact", startAt: "2026-10-27T23:00:00Z", endAt: "2026-10-28T05:00:00Z" }), timezone);
    expect(form).toMatchObject({ date: "2026-10-27", startTime: "19:00", endDate: "2026-10-28", endTime: "01:00" });
    expect(isValid(validateAppointmentForm(form))).toBe(true);
    expect(appointmentFormToInput(form, undefined, timezone).endAt).toBe("2026-10-28T01:00");
  });

  it("moves a same-day end with the date", () => {
    const form = setExactDate(emptyAppointmentForm({ mode: "exact", date: "2026-10-27", endDate: "2026-10-27", startTime: "09:00", endTime: "10:00" }), "2026-10-29");
    expect(form).toMatchObject({ date: "2026-10-29", endDate: "2026-10-29" });
  });
});

describe("window and exact modes", () => {
  it("clears the exact fields when switching to a date range, and the range when switching back", () => {
    const exact = emptyAppointmentForm({ mode: "exact", date: "2026-10-27", startTime: "10:15", endDate: "2026-10-27", endTime: "10:35" });
    const window = setScheduleMode(exact, "window");
    expect(window).toMatchObject({ mode: "window", date: "", startTime: "", endDate: "", endTime: "", windowStart: "", windowEnd: "" });
    const again = setScheduleMode({ ...window, windowStart: "2026-10-26", windowEnd: "2026-10-30" }, "exact");
    expect(again).toMatchObject({ mode: "exact", windowStart: "", windowEnd: "", date: "", startTime: "" });
    expect(setScheduleMode(again, "unscheduled")).toMatchObject({ mode: "unscheduled", windowStart: "", date: "", startTime: "", endTime: "" });
  });

  it("sends nothing from the inactive mode", () => {
    const leftover = emptyAppointmentForm({ title: "T", mode: "window", windowStart: "2026-10-26", windowEnd: "", date: "2026-10-27", startTime: "10:00" });
    expect(appointmentFormToInput(leftover)).toMatchObject({ scheduleMode: "window", windowStart: "2026-10-26", windowEnd: null, startAt: null, endAt: null });
    expect(appointmentFormToInput({ ...leftover, mode: "unscheduled" })).toMatchObject({ scheduleMode: "unscheduled", windowStart: null, windowEnd: null, startAt: null, endAt: null });
  });

  it("moving an existing exact appointment to a window explicitly clears the instants", () => {
    const existing = stored({ scheduleMode: "exact", startAt: "2026-10-27T14:15:00Z", endAt: "2026-10-27T14:35:00Z" });
    const form = { ...setScheduleMode(appointmentToForm(existing, timezone), "window"), windowStart: "2026-11-02" };
    expect(appointmentFormToInput(form, existing, timezone)).toMatchObject({ scheduleMode: "window", windowStart: "2026-11-02", windowEnd: null, startAt: null, endAt: null });
  });
});

describe("validation mirrors the server", () => {
  it("requires a title", () => {
    expect(validateAppointmentForm(emptyAppointmentForm({ title: "  " })).title).toBeTruthy();
  });
  it("lets an appointment stay unscheduled", () => {
    expect(isValid(validateAppointmentForm(emptyAppointmentForm({ title: "Call the coach" })))).toBe(true);
  });
  it("needs a start day for a date range, and the end cannot precede it", () => {
    expect(validateAppointmentForm(emptyAppointmentForm({ title: "x", mode: "window" })).windowStart).toBeTruthy();
    expect(validateAppointmentForm(emptyAppointmentForm({ title: "x", mode: "window", windowStart: "2026-10-30", windowEnd: "2026-10-26" })).windowEnd).toBeTruthy();
    expect(isValid(validateAppointmentForm(emptyAppointmentForm({ title: "x", mode: "window", windowStart: "2026-10-26" })))).toBe(true);
    expect(isValid(validateAppointmentForm(emptyAppointmentForm({ title: "x", mode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-26" })))).toBe(true);
  });
  it("needs a date and a start time for an exact time, and the end cannot precede the start", () => {
    expect(validateAppointmentForm(emptyAppointmentForm({ title: "x", mode: "exact" }))).toMatchObject({ date: expect.any(String), startTime: expect.any(String) });
    expect(validateAppointmentForm(emptyAppointmentForm({ title: "x", mode: "exact", date: "2026-10-27", startTime: "10:00", endDate: "2026-10-27", endTime: "09:30" })).endTime).toBeTruthy();
    expect(isValid(validateAppointmentForm(emptyAppointmentForm({ title: "x", mode: "exact", date: "2026-10-27", startTime: "10:00", endDate: "2026-10-27", endTime: "10:00" })))).toBe(true);
    expect(isValid(validateAppointmentForm(emptyAppointmentForm({ title: "x", mode: "exact", date: "2026-10-27", startTime: "10:00" })))).toBe(true);
  });
  it("limits assignees", () => {
    expect(validateAppointmentForm(emptyAppointmentForm({ title: "x", assigneeIds: [1, 2, 3, 4, 5] })).assignees).toBeTruthy();
  });
});

describe("quick target dates", () => {
  // Tuesday, Oct 20, 2026 08:00 in New York.
  const now = new Date("2026-10-20T12:00:00Z");
  it("fills this week and next week as site days, switching to a date range", () => {
    const base = emptyAppointmentForm({ mode: "exact", date: "2026-10-27", startTime: "10:00" });
    expect(applyQuickWindow(base, "this-week", timezone, now)).toMatchObject({ mode: "window", windowStart: "2026-10-20", windowEnd: "2026-10-23", date: "", startTime: "" });
    expect(applyQuickWindow(base, "next-week", timezone, now)).toMatchObject({ mode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30" });
  });
});

describe("calendar day conversion", () => {
  it("never shifts a day through UTC", () => {
    const date = localDateFromDay("2026-03-08")!;
    expect(dayFromLocalDate(date)).toBe("2026-03-08");
    expect(dayFromLocalDate(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
    expect(dayFromLocalDate(new Date(2026, 11, 31, 23, 55))).toBe("2026-12-31");
    expect(localDateFromDay("nope")).toBeUndefined();
  });
});

describe("target window from one range calendar", () => {
  const day = (iso: string) => localDateFromDay(iso)!;

  it("writes the same windowStart / windowEnd two separate pickers did", () => {
    expect(rangeToWindow({ from: day("2026-10-26"), to: day("2026-10-30") })).toEqual({ windowStart: "2026-10-26", windowEnd: "2026-10-30" });
  });

  it("leaves the end empty for a single day or a range that has only started", () => {
    expect(rangeToWindow({ from: day("2026-10-26"), to: day("2026-10-26") })).toEqual({ windowStart: "2026-10-26", windowEnd: "" });
    expect(rangeToWindow({ from: day("2026-10-26") })).toEqual({ windowStart: "2026-10-26", windowEnd: "" });
    expect(rangeToWindow(undefined)).toBeNull();
  });

  it("never turns a window into a timestamp, and switching modes still clears the others", () => {
    const windowForm = { ...emptyAppointmentForm(), mode: "window" as const, ...rangeToWindow({ from: day("2026-10-26"), to: day("2026-10-30") })! };
    const input = appointmentFormToInput(windowForm);
    expect(input).toMatchObject({ scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30", startAt: null, endAt: null });
    const exact = setScheduleMode(windowForm, "exact");
    expect(exact).toMatchObject({ mode: "exact", windowStart: "", windowEnd: "", date: "", startTime: "" });
  });
});
