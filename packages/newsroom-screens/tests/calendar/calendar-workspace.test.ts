import "temporal-polyfill/global";
import { describe, expect, it, vi } from "vitest";
import { calendarHeading, createCalendarController, type SxApp } from "../../src/calendar/calendar-controller";
import { DEFAULT_CALENDAR_FILTERS } from "../../src/calendar/calendar-model";
import { createCalendarWorkspace, normalizeCalendarPreferences, selectedDay, viewForPreference } from "../../src/calendar/calendar-workspace";

/** A Preact-style signal: what Schedule-X's app singleton exposes. */
function signal<T>(initial: T) {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get value() { return current; },
    set value(next: T) { current = next; listeners.forEach((listener) => listener(next)); },
    subscribe(listener: (value: T) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
  };
}

const view = (name: string, small: boolean, wide: boolean, unit: "days" | "weeks" | "months", units = 1) => ({
  name, hasSmallScreenCompat: small, hasWideScreenCompat: wide, backwardForwardUnits: units,
  backwardForwardFn: (date: Temporal.PlainDate, n: number) => date.add({ [unit]: n })
});

/** Just enough of Schedule-X for the controller: views, the selected date, the range, the size class. */
function fakeSchedule(start = "2026-11-06", timezone = "America/New_York") {
  const app = {
    calendarState: {
      view: signal("month-grid"),
      range: signal<{ start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime } | null>(null),
      isCalendarSmall: signal<boolean | undefined>(false),
      setView: vi.fn((name: string) => { app.calendarState.view.value = name; })
    },
    datePickerState: { selectedDate: signal(Temporal.PlainDate.from(start)) },
    config: {
      timezone: signal(timezone),
      views: signal([view("month-grid", false, true, "months"), view("month-agenda", true, false, "months"), view("week", false, true, "weeks"), view("week-agenda", true, false, "weeks"), view("day", true, true, "days"), view("list", true, true, "days")])
    }
  };
  return app;
}

function mounted(start?: string) {
  const app = fakeSchedule(start);
  const controller = createCalendarController();
  controller.plugin.onRender!(app as unknown as SxApp as never);
  return { app, controller };
}

describe("the Calendar controller", () => {
  it("offers Month / Week / Day / List on a wide screen, and the agenda equivalents on a narrow one", () => {
    const { app, controller } = mounted();
    expect(controller.getSnapshot().views.map((item) => [item.name, item.label])).toEqual([["month-grid", "Month"], ["week", "Week"], ["day", "Day"], ["list", "List"]]);
    app.calendarState.isCalendarSmall.value = true;
    expect(controller.getSnapshot().views.map((item) => [item.name, item.label])).toEqual([["month-agenda", "Month"], ["week-agenda", "Week"], ["day", "Day"], ["list", "List"]]);
  });

  it("moves by the view's own unit: a month, a week, a day", () => {
    const { app, controller } = mounted("2026-11-17");
    controller.step(1);
    expect(app.datePickerState.selectedDate.value.toString()).toBe("2026-12-17");
    controller.setView("week");
    controller.step(-1);
    expect(app.datePickerState.selectedDate.value.toString()).toBe("2026-12-10");
    controller.setView("day");
    controller.step(1);
    expect(app.datePickerState.selectedDate.value.toString()).toBe("2026-12-11");
  });

  it("jumps to a chosen day without changing the view", () => {
    const { app, controller } = mounted();
    controller.setView("week");
    controller.setDate(Temporal.PlainDate.from("2026-11-17"));
    expect(controller.getSnapshot()).toMatchObject({ view: "week" });
    expect(app.datePickerState.selectedDate.value.toString()).toBe("2026-11-17");
  });

  it("goes to today in the newsroom timezone, not the browser's", () => {
    vi.useFakeTimers();
    // 03:30 UTC on Nov 7 is still Nov 6 in New York, and already Nov 7 in Tokyo.
    vi.setSystemTime(new Date("2026-11-07T03:30:00Z"));
    try {
      const { app, controller } = mounted("2026-01-01");
      controller.today();
      expect(app.datePickerState.selectedDate.value.toString()).toBe("2026-11-06");
      app.config.timezone.value = "Asia/Tokyo";
      controller.today();
      expect(app.datePickerState.selectedDate.value.toString()).toBe("2026-11-07");
    } finally {
      vi.useRealTimers();
    }
  });

  it("names what the view shows", () => {
    const date = Temporal.PlainDate.from("2026-11-17");
    expect(calendarHeading({ view: "month-grid", date, range: null }, "en-US")).toBe("November 2026");
    expect(calendarHeading({ view: "day", date, range: null }, "en-US")).toBe("Tuesday, November 17, 2026");
    const range = { start: Temporal.ZonedDateTime.from("2026-11-16T00:00[America/New_York]"), end: Temporal.ZonedDateTime.from("2026-11-22T23:59[America/New_York]") };
    expect(calendarHeading({ view: "week", date, range }, "en-US")).toBe("Nov 16 – Nov 22, 2026");
  });
});

describe("the Calendar workspace: one selected date, one filter state, one view", () => {
  it("a day picked in the controls moves the mounted calendar", () => {
    const workspace = createCalendarWorkspace();
    const { app, controller } = mounted();
    workspace.attach(controller);
    workspace.setDate(Temporal.PlainDate.from("2026-11-17"));
    expect(app.datePickerState.selectedDate.value.toString()).toBe("2026-11-17");
    expect(workspace.getState().date).toBe("2026-11-17");
  });

  it("navigating the main calendar moves the controls' selected date (and so the mini calendar's month)", () => {
    const workspace = createCalendarWorkspace();
    const { controller } = mounted("2026-11-17");
    workspace.attach(controller);
    workspace.step(1);
    expect(workspace.getState().date).toBe("2026-12-17");
    expect(selectedDay(workspace.getState(), "America/New_York").month).toBe(12);
    workspace.today();
    expect(workspace.getState().calendar.date?.toString()).toBe(workspace.getState().date);
  });

  it("keeps the date while no calendar is mounted, so a calendar mounted later opens there", () => {
    const workspace = createCalendarWorkspace();
    const { controller } = mounted("2026-11-17");
    const detach = workspace.attach(controller);
    detach();
    expect(workspace.getState()).toMatchObject({ date: "2026-11-17", calendar: { ready: false } });
    workspace.setDate(Temporal.PlainDate.from("2027-01-04"));
    expect(selectedDay(workspace.getState(), "America/New_York").toString()).toBe("2027-01-04");
  });

  it("opens on today in the newsroom timezone when nothing was chosen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T03:30:00Z"));
    try {
      expect(selectedDay(createCalendarWorkspace().getState(), "America/New_York").toString()).toBe("2026-11-06");
    } finally {
      vi.useRealTimers();
    }
  });

  it("has one filter state, and remembers it with the view (never the date)", async () => {
    const save = vi.fn();
    const workspace = createCalendarWorkspace({ load: async () => null, save });
    await workspace.load();
    workspace.setFilter("tasks", true);
    workspace.setFilter("mine", true);
    workspace.setFilter("mine", true);
    expect(workspace.getState().filters).toEqual({ ...DEFAULT_CALENDAR_FILTERS, tasks: true, mine: true });
    expect(save).toHaveBeenCalledTimes(2);
    workspace.setDate(Temporal.PlainDate.from("2026-12-01"));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ view: null, filters: { ...DEFAULT_CALENDAR_FILTERS, tasks: true, mine: true } });
  });

  it("waits for stored preferences once, and survives storage that fails", async () => {
    const load = vi.fn(async () => { throw new Error("offline"); });
    const workspace = createCalendarWorkspace({ load, save: () => { throw new Error("offline"); } });
    expect(workspace.getState().ready).toBe(false);
    await Promise.all([workspace.load(), workspace.load()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(workspace.getState()).toMatchObject({ ready: true, view: null, filters: DEFAULT_CALENDAR_FILTERS });
    expect(() => workspace.setFilter("tasks", true)).not.toThrow();
  });

  it("the reader's view is shown and remembered; Schedule-X's own narrow fallback is not a choice", async () => {
    const save = vi.fn();
    const workspace = createCalendarWorkspace({ load: () => ({ view: "week" }), save });
    await workspace.load();
    const { app, controller } = mounted();
    workspace.attach(controller);
    app.calendarState.isCalendarSmall.value = true;
    app.calendarState.view.value = "month-agenda";
    expect(workspace.getState().view).toBe("week");
    expect(save).not.toHaveBeenCalled();
    workspace.setView("day");
    expect(app.calendarState.setView).toHaveBeenCalledWith("day", expect.anything());
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ view: "day" }));
  });
});

describe("view preferences against what fits", () => {
  const wide = [{ name: "month-grid" }, { name: "week" }, { name: "day" }, { name: "list" }];
  const narrow = [{ name: "month-agenda" }, { name: "week-agenda" }, { name: "day" }, { name: "list" }];
  it("uses the agenda equivalent on a narrow screen and the grid on a wide one", () => {
    expect(viewForPreference("week", narrow, true)).toBe("week-agenda");
    expect(viewForPreference("week", wide, false)).toBe("week");
    expect(viewForPreference("day", narrow, true)).toBe("day");
    expect(viewForPreference(null, wide, false)).toBeNull();
    expect(viewForPreference("year", wide, false)).toBeNull();
  });

  it("reads stored preferences of any shape", () => {
    expect(normalizeCalendarPreferences({ view: "week-agenda", filters: { tasks: true } })).toEqual({ view: "week", filters: { ...DEFAULT_CALENDAR_FILTERS, tasks: true } });
    expect(normalizeCalendarPreferences({ view: "<script>" })).toEqual({ view: null, filters: DEFAULT_CALENDAR_FILTERS });
    expect(normalizeCalendarPreferences("month-grid")).toEqual({ view: null, filters: DEFAULT_CALENDAR_FILTERS });
  });
});
