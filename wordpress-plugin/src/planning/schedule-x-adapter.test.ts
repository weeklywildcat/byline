import { describe, expect, it } from "vitest";
import "temporal-polyfill/global";
import { createWorkspaceUrlBuilder, needsSchedulingItems, scheduleCalendarEvents } from "./calendar-model";
import { planningCalendarEvents, type PlanningStory } from "./planning-model";
import { CATEGORY_BY_EVENT_TYPE, SCHEDULE_X_CALENDARS, SCHEDULE_X_CATEGORIES, parseSiteTimestamp, toScheduleXEvent, toScheduleXEvents, visibleRangeDays } from "./schedule-x-adapter";
import type { ScheduleAppointment, ScheduleResponse } from "../workspace/workspace-types";

const timezone = "America/New_York";
const workspaceUrl = createWorkspaceUrlBuilder("http://example.test/wp-admin/admin.php?page=byline-planning&tab=stories");

const appointment = (patch: Partial<ScheduleAppointment> = {}): ScheduleAppointment => ({
  id: "appt-1", title: "Interview Mrs. Hamby", kind: "interview", status: "confirmed", scheduleMode: "exact", windowStart: null, windowEnd: null,
  startAt: "2026-10-27T14:15:00Z", endAt: "2026-10-27T14:35:00Z", assigneeIds: [7], assignees: [{ id: 7, name: "Riley Reporter" }], sourceId: null, sourceLabel: null, location: "",
  storyId: 41, storyTitle: "Cafeteria changes", ...patch
});
const schedule = (patch: Partial<ScheduleResponse> = {}): ScheduleResponse => ({ timezone, from: "2026-10-20", to: "2026-11-20", appointments: [], needsScheduling: [], mediaDeadlines: [], taskDeadlines: [], ...patch });
const story = (patch: Partial<PlanningStory> = {}): PlanningStory => ({
  id: 41, title: "Cafeteria changes", editUrl: "/wp-admin/post.php?post=41&action=edit", authors: [], writer: null, editor: null,
  workflow: { id: "writing", label: "Writing", group: "main", selectable: true },
  wordpressState: { id: "future", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-11-03T15:00:00Z", publishedAt: null },
  deadline: "2026-10-30", plannedPublication: "2026-11-02", modifiedAt: null, visual: { type: "photo", status: "needed" }, openTaskCount: 0, coverage: [], featuredImage: null, ...patch
});
const one = (event: ReturnType<typeof scheduleCalendarEvents>[number]) => toScheduleXEvent(event, timezone)!;

describe("exact appointments", () => {
  it("become a ZonedDateTime in the WordPress site timezone, not the browser's", () => {
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment()] }), workspaceUrl);
    const mapped = one(event);
    expect(mapped.start).toBeInstanceOf(Temporal.ZonedDateTime);
    const start = mapped.start as Temporal.ZonedDateTime;
    expect(start.timeZoneId).toBe(timezone);
    expect(start.toPlainDate().toString()).toBe("2026-10-27");
    expect(start.toPlainTime().toString()).toBe("10:15:00");
    expect((mapped.end as Temporal.ZonedDateTime).toPlainTime().toString()).toBe("10:35:00");
    expect(mapped).toMatchObject({ title: "Interview Mrs. Hamby", calendarId: "appointment", storyId: 41, bylineType: "appointment", timed: true });
    expect(mapped.editHref).toBe("http://example.test/wp-admin/admin.php?page=byline-planning&story=41&appointment=appt-1");
  });

  it("lands on the site day, not the UTC day, for an evening appointment", () => {
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment({ startAt: "2026-10-28T02:30:00Z", endAt: "2026-10-28T03:00:00Z" })] }), workspaceUrl);
    const start = one(event).start as Temporal.ZonedDateTime;
    expect(start.toPlainDate().toString()).toBe("2026-10-27");
    expect(start.toPlainTime().toString()).toBe("22:30:00");
  });

  it("keeps a multi-day appointment as one multi-day event", () => {
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment({ startAt: "2026-10-27T14:00:00Z", endAt: "2026-10-28T20:00:00Z" })] }), workspaceUrl);
    const mapped = one(event);
    expect((mapped.start as Temporal.ZonedDateTime).toPlainDate().toString()).toBe("2026-10-27");
    expect((mapped.end as Temporal.ZonedDateTime).toPlainDate().toString()).toBe("2026-10-28");
  });

  it("gives an appointment with no end, or an end before its start, a short block rather than a zero-length one", () => {
    const [open] = scheduleCalendarEvents(schedule({ appointments: [appointment({ endAt: null })] }), workspaceUrl);
    const [backwards] = scheduleCalendarEvents(schedule({ appointments: [appointment({ endAt: "2026-10-27T13:00:00Z" })] }), workspaceUrl);
    for (const event of [open, backwards]) {
      const mapped = one(event);
      expect((mapped.end as Temporal.ZonedDateTime).since(mapped.start as Temporal.ZonedDateTime).total("minutes")).toBe(30);
    }
  });
});

describe("a fuzzy appointment window", () => {
  const fuzzy = appointment({ id: "appt-2", title: "Interview reporter", scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30", startAt: null, endAt: null });

  it("never becomes a Schedule-X event, on any day", () => {
    const events = scheduleCalendarEvents(schedule({ appointments: [], needsScheduling: [fuzzy] }), workspaceUrl);
    expect(events).toEqual([]);
    expect(toScheduleXEvents(events, timezone)).toEqual([]);
    // Even if a window row is handed to the appointments feed it is not placed.
    expect(scheduleCalendarEvents(schedule({ appointments: [fuzzy] }), workspaceUrl)).toEqual([]);
  });

  it("appears under Needs scheduling with its target window and the appointment deep link", () => {
    const [item] = needsSchedulingItems(schedule({ needsScheduling: [fuzzy] }), workspaceUrl);
    expect(item).toMatchObject({ title: "Interview reporter", target: "Target: Oct 26–30", hasTarget: true });
    expect(item.href).toContain("story=41&appointment=appt-2");
  });
});

describe("dates stay dates", () => {
  const events = planningCalendarEvents([story()], timezone);
  const byType = (type: string) => toScheduleXEvent(events.find((event) => event.type === type)!, timezone)!;

  it("maps a story deadline to a PlainDate with no invented midnight", () => {
    const deadline = byType("deadline");
    expect(deadline.start).toBeInstanceOf(Temporal.PlainDate);
    expect(deadline.start.toString()).toBe("2026-10-30");
    expect(deadline.end.toString()).toBe("2026-10-30");
    expect(deadline).toMatchObject({ calendarId: "story-deadline", timed: false });
  });

  it("keeps a date-only planned publication a PlainDate, distinct from the WordPress schedule", () => {
    const planned = byType("planned");
    const scheduled = byType("scheduled");
    expect(planned.start).toBeInstanceOf(Temporal.PlainDate);
    expect(planned.start.toString()).toBe("2026-11-02");
    expect(planned.calendarId).toBe("planned-publication");
    expect(scheduled.start).toBeInstanceOf(Temporal.ZonedDateTime);
    expect((scheduled.start as Temporal.ZonedDateTime).toPlainTime().toString()).toBe("10:00:00");
    expect(scheduled.calendarId).toBe("wordpress-scheduled");
    expect(planned.id).not.toBe(scheduled.id);
  });

  it("reads the picker's noon placeholder as a day, not as a 12:00 PM event", () => {
    const [planned] = planningCalendarEvents([story({ plannedPublication: "2026-11-02T12:00:00" })], timezone).filter((event) => event.type === "planned");
    const mapped = toScheduleXEvent(planned, timezone)!;
    expect(mapped.start).toBeInstanceOf(Temporal.PlainDate);
    expect(mapped.start.toString()).toBe("2026-11-02");
  });

  it("reads noon in the site timezone as the placeholder even when it arrives as an instant", () => {
    // Noon in New York in November is 17:00 UTC; noon UTC is 7:00 AM in New York, a real time.
    const noonLocal = planningCalendarEvents([story({ plannedPublication: "2026-11-02T17:00:00Z" })], timezone).find((event) => event.type === "planned")!;
    const noonUtc = planningCalendarEvents([story({ plannedPublication: "2026-11-02T12:00:00Z" })], timezone).find((event) => event.type === "planned")!;
    expect(toScheduleXEvent(noonLocal, timezone)!.start).toBeInstanceOf(Temporal.PlainDate);
    expect((toScheduleXEvent(noonUtc, timezone)!.start as Temporal.ZonedDateTime).toPlainTime().toString()).toBe("07:00:00");
  });

  it("treats a planned publication that carries a site-local time as a real timestamp", () => {
    const [planned] = planningCalendarEvents([story({ plannedPublication: "2026-11-02T08:30:00", wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false } })], timezone).filter((event) => event.type === "planned");
    const mapped = toScheduleXEvent(planned, timezone)!;
    expect((mapped.start as Temporal.ZonedDateTime).toPlainTime().toString()).toBe("08:30:00");
    expect(mapped.timed).toBe(true);
  });

  it("keeps a published date as a WordPress event, separate from the schedule", () => {
    const [published] = planningCalendarEvents([story({ wordpressState: { id: "publish", label: "Published", isPublished: true, isScheduled: false, publishedAt: "2026-10-31T16:00:00Z" } })], timezone).filter((event) => event.type === "published");
    const mapped = toScheduleXEvent(published, timezone)!;
    expect((mapped.start as Temporal.ZonedDateTime).toPlainDate().toString()).toBe("2026-10-31");
    expect(mapped.calendarId).toBe("wordpress-scheduled");
    expect(mapped.bylineType).toBe("published");
  });

  it("maps production and task due dates to PlainDates on the site day", () => {
    const events = scheduleCalendarEvents(schedule({
      mediaDeadlines: [{ id: "m1", storyId: 41, storyTitle: "Cafeteria changes", title: "Photo", type: "photo", status: "assigned", dueAt: "2026-10-29T18:00:00Z", assignee: { id: 7, name: "Riley Reporter" } }],
      taskDeadlines: [{ id: 5, storyId: 41, storyTitle: "Cafeteria changes", title: "Draft", dueAt: "2026-10-29T03:00:00Z", assignee: null }]
    }), workspaceUrl);
    const media = one(events.find((event) => event.type === "media")!);
    const task = one(events.find((event) => event.type === "task")!);
    expect(media.start).toBeInstanceOf(Temporal.PlainDate);
    expect(media.start.toString()).toBe("2026-10-29");
    expect(media.calendarId).toBe("production");
    // 03:00 UTC on Oct 29 is still Oct 28 evening in New York.
    expect(task.start.toString()).toBe("2026-10-28");
  });
});

describe("daylight saving time", () => {
  it("shows the same wall-clock hour twice on the fall-back night as two different instants", () => {
    const first = parseSiteTimestamp("2026-11-01T05:30:00Z", timezone)!;
    const second = parseSiteTimestamp("2026-11-01T06:30:00Z", timezone)!;
    expect(first.toPlainTime().toString()).toBe("01:30:00");
    expect(second.toPlainTime().toString()).toBe("01:30:00");
    expect(first.offset).toBe("-04:00");
    expect(second.offset).toBe("-05:00");
  });

  it("moves a site-local time that does not exist on the spring-forward night to the next valid time", () => {
    const skipped = parseSiteTimestamp("2026-03-08T02:30:00", timezone)!;
    expect(skipped.toPlainDate().toString()).toBe("2026-03-08");
    expect(skipped.toPlainTime().toString()).toBe("03:30:00");
    expect(skipped.offset).toBe("-04:00");
  });

  it("keeps an appointment's real duration across the fall-back hour", () => {
    // 01:30 EDT to 01:30 EST is one real hour, though the wall clock shows no change.
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment({ startAt: "2026-11-01T05:30:00Z", endAt: "2026-11-01T06:30:00Z" })] }), workspaceUrl);
    const mapped = one(event);
    expect((mapped.end as Temporal.ZonedDateTime).since(mapped.start as Temporal.ZonedDateTime).total("hours")).toBe(1);
  });
});

describe("the adapter boundary", () => {
  it("rejects values it cannot read instead of inventing a date", () => {
    expect(parseSiteTimestamp("not a date", timezone)).toBeNull();
    expect(parseSiteTimestamp("2026-10-27", timezone)).toBeNull();
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment()] }), workspaceUrl);
    expect(toScheduleXEvent({ ...event, timing: { kind: "timed", start: "garbage", end: null } }, timezone)).toBeNull();
    expect(toScheduleXEvent({ ...event, timing: { kind: "date", date: "10/27/2026" } }, timezone)).toBeNull();
  });

  it("is presentation only: every event is locked against drag and resize", () => {
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment()] }), workspaceUrl);
    expect(one(event)._options).toEqual({ disableDND: true, disableResize: true });
  });

  it("uses a small fixed set of categories, each configured for Schedule-X", () => {
    expect(Object.keys(SCHEDULE_X_CALENDARS).sort()).toEqual([...SCHEDULE_X_CATEGORIES].sort());
    for (const category of Object.values(CATEGORY_BY_EVENT_TYPE)) expect(SCHEDULE_X_CALENDARS[category].colorName).toBe(category);
  });

  it("reads the visible site-day range from Schedule-X", () => {
    const start = Temporal.ZonedDateTime.from("2026-09-28T00:00:00-04:00[America/New_York]");
    const end = Temporal.ZonedDateTime.from("2026-11-01T23:59:59-05:00[America/New_York]");
    expect(visibleRangeDays({ start, end })).toEqual({ from: "2026-09-28", to: "2026-11-01" });
  });
});
