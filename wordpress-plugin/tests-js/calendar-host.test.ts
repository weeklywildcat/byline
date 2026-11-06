import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsSchedulingItems, scheduleCalendarEvents } from "@byline/newsroom-screens/calendar/calendar-model";
import { createCalendarWorkspace } from "@byline/newsroom-screens/calendar/calendar-workspace";
import type { ScheduleAppointment, ScheduleResponse } from "@byline/newsroom-screens/workspace/workspace-types";
import { CALENDAR_VIEW_STORAGE_KEY, createWorkspaceUrlBuilder, localCalendarStorage, wordPressCalendarLinks } from "../src/planning/calendar-host";

/**
 * WordPress's side of the shared newsroom Calendar: wp-admin addresses, the
 * view remembered in localStorage, and nothing of the calendar itself.
 */
const appointment = (patch: Partial<ScheduleAppointment> = {}): ScheduleAppointment => ({
  id: "appt-1", title: "Interview Mrs. Hamby", kind: "interview", status: "confirmed", scheduleMode: "exact", windowStart: null, windowEnd: null,
  startAt: "2026-10-27T14:15:00Z", endAt: "2026-10-27T14:35:00Z", assigneeIds: [7], assignees: [{ id: 7, name: "Riley Reporter" }], sourceId: null, sourceLabel: null, location: "",
  storyId: 41, storyTitle: "Cafeteria changes", ...patch
});
const schedule = (patch: Partial<ScheduleResponse> = {}): ScheduleResponse => ({ timezone: "America/New_York", from: "2026-10-20", to: "2026-11-20", appointments: [], needsScheduling: [], mediaDeadlines: [], taskDeadlines: [], ...patch });
const links = wordPressCalendarLinks(createWorkspaceUrlBuilder("http://example.test/wp-admin/admin.php?page=byline-planning&tab=stories"));

describe("WordPress Calendar links", () => {
  it("builds Story Workspace links from a localized Planning URL, dropping the tab, without hardcoding wp-admin", () => {
    const build = createWorkspaceUrlBuilder("/custom-admin/admin.php?page=byline-planning&tab=calendar");
    expect(build(12)).toBe("/custom-admin/admin.php?page=byline-planning&story=12");
    expect(build(12, "abc-123")).toBe("/custom-admin/admin.php?page=byline-planning&story=12&appointment=abc-123");
    expect(createWorkspaceUrlBuilder()(3)).toBe("admin.php?page=byline-planning&story=3");
  });

  it("opens an appointment's scheduling dialog from the calendar and from Needs scheduling, as before the extraction", () => {
    expect(scheduleCalendarEvents(schedule({ appointments: [appointment()] }), links)[0].href).toBe("http://example.test/wp-admin/admin.php?page=byline-planning&story=41&appointment=appt-1");
    const waiting = appointment({ id: "w", scheduleMode: "window", windowStart: "2026-10-26", startAt: null, endAt: null, status: "planned" });
    expect(needsSchedulingItems(schedule({ needsScheduling: [waiting] }), links)[0].href).toBe("http://example.test/wp-admin/admin.php?page=byline-planning&story=41&appointment=w");
  });

  it("keeps shared collection interviews on their collection", () => {
    const shared = appointment({ id: "i", collectionId: 3, interviewId: 9 });
    expect(scheduleCalendarEvents(schedule({ appointments: [shared] }), links)[0].href).toBe("admin.php?page=byline-planning&tab=collections&collection=3&interview=9");
  });
});

describe("WordPress Calendar preferences", () => {
  const memory = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial));
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
  };

  it("reads the view a reader chose before the extraction, under the same key", async () => {
    const storage = memory({ [CALENDAR_VIEW_STORAGE_KEY]: "week" });
    const workspace = createCalendarWorkspace(localCalendarStorage(storage));
    expect(workspace.getState().ready).toBe(false);
    await workspace.load();
    expect(workspace.getState()).toMatchObject({ ready: true, view: "week" });
  });

  it("remembers a newly chosen view by its wide-screen name", async () => {
    const storage = memory();
    const workspace = createCalendarWorkspace(localCalendarStorage(storage));
    await workspace.load();
    workspace.setView("month-agenda");
    expect(storage.values.get(CALENDAR_VIEW_STORAGE_KEY)).toBe("month-grid");
  });

  it("works without storage at all", async () => {
    const workspace = createCalendarWorkspace(localCalendarStorage(null));
    await workspace.load();
    workspace.setView("day");
    expect(workspace.getState().view).toBe("day");
  });
});

describe("one Calendar implementation", () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  it("WordPress mounts the shared NewsroomCalendar with its controls in a temporary sheet", () => {
    const host = source("../src/planning/calendar-host.tsx");
    expect(host).toContain("<NewsroomCalendar ");
    expect(host).toContain('controls="sheet"');
    expect(host).not.toMatch(/@schedule-x|useCalendarApp|createViewMonthGrid/);
  });
});
