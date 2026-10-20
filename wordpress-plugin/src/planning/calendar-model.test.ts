import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_FILTERS,
  createWorkspaceUrlBuilder,
  filterCalendarEvents,
  mergeCalendarEvents,
  needsSchedulingItems,
  scheduleCalendarEvents,
  scheduleCoversVisible,
  scheduleRangeFor
} from "./calendar-model";
import { monthCalendarDays, planningCalendarEvents, reportingSummaryLine, weekCalendarDays, type PlanningStory } from "./planning-model";
import type { ScheduleAppointment, ScheduleResponse } from "../workspace/workspace-types";

const timezone = "America/New_York";
const workspaceUrl = createWorkspaceUrlBuilder("http://example.test/wp-admin/admin.php?page=byline-planning&tab=stories");

function appointment(patch: Partial<ScheduleAppointment> = {}): ScheduleAppointment {
  return {
    id: "appt-1",
    title: "Interview Mrs. Hamby",
    kind: "interview",
    status: "confirmed",
    scheduleMode: "exact",
    windowStart: null,
    windowEnd: null,
    startAt: "2026-10-27T14:15:00Z",
    endAt: "2026-10-27T14:35:00Z",
    assigneeIds: [7],
    assignees: [{ id: 7, name: "Riley Reporter" }],
    sourceId: null,
    sourceLabel: null,
    location: "Room 12",
    storyId: 41,
    storyTitle: "Cafeteria changes",
    ...patch
  };
}

function schedule(patch: Partial<ScheduleResponse> = {}): ScheduleResponse {
  return { timezone, from: "2026-10-20", to: "2026-11-20", appointments: [], needsScheduling: [], mediaDeadlines: [], taskDeadlines: [], ...patch };
}

function story(patch: Partial<PlanningStory> = {}): PlanningStory {
  return {
    id: 41,
    title: "Cafeteria changes",
    editUrl: "/wp-admin/post.php?post=41&action=edit",
    authors: [],
    writer: null,
    editor: null,
    workflow: { id: "writing", label: "Writing", group: "main", selectable: true },
    wordpressState: { id: "future", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-11-03T15:00:00Z", publishedAt: null },
    deadline: "2026-10-30",
    plannedPublication: "2026-11-02",
    modifiedAt: null,
    visual: { type: "photo", status: "needed" },
    openTaskCount: 0,
    coverage: [],
    featuredImage: null,
    ...patch
  };
}

describe("appointments on the calendar", () => {
  it("shows an exact appointment on its site-local day with a time, and links to its scheduling dialog", () => {
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment()] }), workspaceUrl);
    expect(event).toMatchObject({ type: "appointment", date: "2026-10-27", title: "Interview Mrs. Hamby", label: "Appointment", storyId: 41 });
    expect(event.timeLabel).toMatch(/^10:15\sAM$/);
    expect(event.href).toBe("http://example.test/wp-admin/admin.php?page=byline-planning&story=41&appointment=appt-1");
    expect(event.tooltip).toContain("Story: Cafeteria changes");
    expect(event.tooltip).toContain("With: Riley Reporter");
    expect(event.tooltip).toContain("Location: Room 12");
  });

  it("uses the site day, not the UTC day, for an evening appointment", () => {
    // 02:30 UTC on Oct 28 is 10:30 PM on Oct 27 in New York.
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment({ startAt: "2026-10-28T02:30:00Z", endAt: "2026-10-28T03:00:00Z" })] }), workspaceUrl);
    expect(event.date).toBe("2026-10-27");
    expect(event.timeLabel).toMatch(/^10:30\sPM$/);
  });

  it("never puts a target window in a day cell: windows and unscheduled items go to Needs scheduling", () => {
    const window = appointment({ id: "w", title: "Coach interview", scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30", startAt: null, endAt: null, status: "planned" });
    const undated = appointment({ id: "u", title: "Photo with principal", scheduleMode: "unscheduled", windowStart: null, windowEnd: null, startAt: null, endAt: null, status: "planned", assignees: [], assigneeIds: [] });
    const feed = schedule({ needsScheduling: [undated, window] });

    expect(scheduleCalendarEvents(feed, workspaceUrl)).toEqual([]);
    const items = needsSchedulingItems(feed, workspaceUrl);
    // Dated windows first, "someday" last.
    expect(items.map((item) => [item.title, item.target])).toEqual([
      ["Coach interview", "Target: Oct 26–30"],
      ["Photo with principal", "No target date"]
    ]);
    expect(items.every((item) => !/\d:\d\d|AM|PM/.test(item.target))).toBe(true);
    expect(items[0].href).toBe("http://example.test/wp-admin/admin.php?page=byline-planning&story=41&appointment=w");
  });

  it("defends against an exact appointment with no instant, and cancelled ones", () => {
    const events = scheduleCalendarEvents(schedule({ appointments: [appointment({ startAt: null }), appointment({ id: "x", status: "cancelled" })] }), workspaceUrl);
    expect(events).toEqual([]);
  });

  it("marks a completed appointment but still shows it", () => {
    const [event] = scheduleCalendarEvents(schedule({ appointments: [appointment({ status: "completed" })] }), workspaceUrl);
    expect(event.completed).toBe(true);
  });
});

describe("story-derived events stay distinct", () => {
  it("keeps deadline, planned publication and the WordPress schedule as three events, never merged", () => {
    const events = planningCalendarEvents([story({ plannedPublication: "2026-11-03", deadline: "2026-11-03" })], timezone);
    expect(events.map((event) => [event.type, event.label, event.date])).toEqual([
      ["deadline", "Deadline", "2026-11-03"],
      ["planned", "Planned publication", "2026-11-03"],
      ["scheduled", "Scheduled in WordPress", "2026-11-03"]
    ]);
    expect(new Set(events.map((event) => event.id)).size).toBe(3);
  });

  it("reads WordPress timestamps in the site timezone when it is known", () => {
    // 01:00 UTC on Nov 3 is 9 PM on Nov 2 in New York (EST starts Nov 1).
    const events = planningCalendarEvents([story({ wordpressState: { id: "future", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-11-03T01:00:00Z", publishedAt: null } })], timezone);
    expect(events.find((event) => event.type === "scheduled")?.date).toBe("2026-11-02");
  });
});

describe("production and task deadlines", () => {
  const feed = schedule({
    mediaDeadlines: [
      { id: "m1", storyId: 41, storyTitle: "Cafeteria changes", title: "Cafeteria photos", type: "photo", status: "assigned", dueAt: "2026-10-30T03:00:00Z", assignee: { id: 9, name: "Pat Photog" } }
    ],
    taskDeadlines: [{ id: 5, storyId: null, storyTitle: "", title: "Order press passes", dueAt: "2026-10-29", assignee: { id: 7, name: "Riley Reporter" } }]
  });

  it("emits a Production due event on the site-local day", () => {
    const events = scheduleCalendarEvents(feed, workspaceUrl);
    const media = events.find((event) => event.type === "media")!;
    // 03:00 UTC on Oct 30 is 11 PM on Oct 29 in New York.
    expect(media).toMatchObject({ date: "2026-10-29", title: "Cafeteria photos due", label: "Production due", assigneeIds: [9] });
    expect(media.href).toBe("http://example.test/wp-admin/admin.php?page=byline-planning&story=41");
    const task = events.find((event) => event.type === "task")!;
    expect(task).toMatchObject({ date: "2026-10-29", label: "Task due", storyId: 0 });
    expect(task.href).toBeUndefined();
  });
});

describe("filters and My schedule", () => {
  const feed = schedule({
    appointments: [appointment(), appointment({ id: "other", title: "Budget meeting", assigneeIds: [8], assignees: [{ id: 8, name: "Sam" }], startAt: "2026-10-27T18:00:00Z" })],
    mediaDeadlines: [{ id: "m1", storyId: 41, storyTitle: "Cafeteria changes", title: "Cafeteria photos", type: "photo", status: "assigned", dueAt: "2026-10-30", assignee: { id: 9, name: "Pat" } }],
    taskDeadlines: [{ id: 5, storyId: 41, storyTitle: "Cafeteria changes", title: "Write cutlines", dueAt: "2026-10-29", assignee: { id: 7, name: "Riley" } }]
  });
  const all = [...planningCalendarEvents([story()], timezone), ...scheduleCalendarEvents(feed, workspaceUrl)];
  const types = (events: ReturnType<typeof filterCalendarEvents>) => events.map((event) => event.type);

  it("defaults to appointments, deadlines, media, publication and the WordPress schedule, with tasks off", () => {
    expect(DEFAULT_CALENDAR_FILTERS).toEqual({ appointments: true, deadlines: true, media: true, publication: true, wordpress: true, mine: false, tasks: false });
    const visible = filterCalendarEvents(all, DEFAULT_CALENDAR_FILTERS, 7);
    expect(new Set(types(visible))).toEqual(new Set(["appointment", "deadline", "media", "planned", "scheduled"]));
  });

  it("toggles each category independently", () => {
    expect(new Set(types(filterCalendarEvents(all, { ...DEFAULT_CALENDAR_FILTERS, appointments: false }, 7)))).not.toContain("appointment");
    expect(new Set(types(filterCalendarEvents(all, { ...DEFAULT_CALENDAR_FILTERS, publication: false }, 7)))).toEqual(new Set(["appointment", "deadline", "media", "scheduled"]));
    // The WordPress schedule is its own toggle, apart from the planned publication target.
    expect(new Set(types(filterCalendarEvents(all, { ...DEFAULT_CALENDAR_FILTERS, wordpress: false }, 7)))).toEqual(new Set(["appointment", "deadline", "media", "planned"]));
    expect(types(filterCalendarEvents(all, { ...DEFAULT_CALENDAR_FILTERS, tasks: true }, 7))).toContain("task");
  });

  it("limits appointments, media and tasks to the signed-in user under My schedule, but not story dates", () => {
    const mine = filterCalendarEvents(all, { ...DEFAULT_CALENDAR_FILTERS, mine: true, tasks: true }, 7);
    expect(mine.filter((event) => event.type === "appointment").map((event) => event.id)).toEqual(["appointment-appt-1"]);
    expect(types(mine)).not.toContain("media");
    expect(types(mine)).toContain("task");
    expect(types(mine)).toContain("deadline");
    expect(types(mine)).toContain("planned");
    // With no identity, My schedule shows none of the assigned items rather than all of them.
    expect(types(filterCalendarEvents(all, { ...DEFAULT_CALENDAR_FILTERS, mine: true, tasks: true }, null))).not.toContain("appointment");
  });

  it("also limits Needs scheduling to the user's own", () => {
    const waiting = schedule({
      needsScheduling: [
        appointment({ id: "a", title: "Mine", scheduleMode: "window", windowStart: "2026-10-26", windowEnd: null, startAt: null, endAt: null, status: "planned" }),
        appointment({ id: "b", title: "Theirs", scheduleMode: "unscheduled", startAt: null, endAt: null, status: "planned", assigneeIds: [8], assignees: [{ id: 8, name: "Sam" }] })
      ]
    });
    expect(needsSchedulingItems(waiting, workspaceUrl, { mine: true, currentUserId: 7 }).map((item) => item.title)).toEqual(["Mine"]);
    expect(needsSchedulingItems(waiting, workspaceUrl).map((item) => item.title)).toEqual(["Mine", "Theirs"]);
  });
});

describe("ordering inside a day", () => {
  it("lists all-day events first, then timed events in time order", () => {
    const feed = schedule({
      appointments: [
        appointment({ id: "late", title: "Evening game", startAt: "2026-10-27T23:00:00Z" }),
        appointment({ id: "early", title: "Morning interview", startAt: "2026-10-27T13:00:00Z" })
      ],
      mediaDeadlines: [{ id: "m", storyId: 41, storyTitle: "Cafeteria changes", title: "Photos", type: "photo", status: "assigned", dueAt: "2026-10-27", assignee: null }]
    });
    const merged = mergeCalendarEvents(planningCalendarEvents([story({ deadline: "2026-10-27" })], timezone), scheduleCalendarEvents(feed, workspaceUrl), DEFAULT_CALENDAR_FILTERS, 7)
      .filter((event) => event.date === "2026-10-27");
    expect(merged.map((event) => event.type)).toEqual(["deadline", "media", "appointment", "appointment"]);
    expect(merged.slice(2).map((event) => event.title)).toEqual(["Morning interview", "Evening game"]);
  });
});

describe("schedule feed range", () => {
  it("pads the visible days by a week either side", () => {
    const week = weekCalendarDays(new Date(2026, 9, 21, 12));
    expect(scheduleRangeFor(week)).toEqual({ from: "2026-10-12", to: "2026-11-01" });
  });

  it("stays well inside the server's four-month limit for a month view", () => {
    const range = scheduleRangeFor(monthCalendarDays(new Date(2026, 9, 21, 12)))!;
    expect((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000).toBeLessThan(124);
  });

  it("refetches only when navigation leaves the loaded range, or tasks are newly requested", () => {
    const october = monthCalendarDays(new Date(2026, 9, 21, 12));
    const loaded = { ...scheduleRangeFor(october)!, includeTasks: false };
    expect(scheduleCoversVisible(null, october, false)).toBe(false);
    expect(scheduleCoversVisible(loaded, october, false)).toBe(true);
    expect(scheduleCoversVisible(loaded, weekCalendarDays(new Date(2026, 9, 14, 12)), false)).toBe(true);
    expect(scheduleCoversVisible(loaded, monthCalendarDays(new Date(2026, 10, 15, 12)), false)).toBe(false);
    expect(scheduleCoversVisible(loaded, october, true)).toBe(false);
    expect(scheduleCoversVisible({ ...loaded, includeTasks: true }, october, true)).toBe(true);
  });
});

describe("workspace links", () => {
  it("builds from a localized Planning URL, dropping the tab, without hardcoding wp-admin", () => {
    const build = createWorkspaceUrlBuilder("/custom-admin/admin.php?page=byline-planning&tab=calendar");
    expect(build(12)).toBe("/custom-admin/admin.php?page=byline-planning&story=12");
    expect(build(12, "abc-123")).toBe("/custom-admin/admin.php?page=byline-planning&story=12&appointment=abc-123");
  });

  it("falls back to a URL relative to the current admin page", () => {
    expect(createWorkspaceUrlBuilder()(3)).toBe("admin.php?page=byline-planning&story=3");
  });
});

describe("reporting summary line", () => {
  const summary = { sources: 3, interviewed: 1, needsScheduling: 1, toSchedule: 0, nextAppointment: null };
  it("reads like the Quick View line", () => {
    expect(reportingSummaryLine(summary)).toBe("3 sources · 1 interviewed · 1 needs scheduling");
    expect(reportingSummaryLine({ ...summary, sources: 1, interviewed: 0, needsScheduling: 0 })).toBe("1 source");
  });
  it("is empty when nothing is tracked, and tolerates an absent summary", () => {
    expect(reportingSummaryLine({ ...summary, sources: 0, interviewed: 0, needsScheduling: 0 })).toBe("");
    expect(reportingSummaryLine(null)).toBe("");
    expect(reportingSummaryLine(undefined)).toBe("");
  });
});
