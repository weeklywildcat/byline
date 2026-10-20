/**
 * A narrow bridge between Schedule-X's own state and Byline's Nova toolbar.
 *
 * Schedule-X owns layout, views and responsive behaviour; the toolbar above it
 * (Today, previous/next, the view menu, the heading) is Byline's and is driven
 * through the library's own signals and view definitions. Nothing here reads or
 * writes a newsroom date.
 */
import type { PluginBase } from "@schedule-x/calendar";

type Signal<T> = { value: T; subscribe: (callback: (value: T) => void) => () => void };
type SxView = { name: string; hasSmallScreenCompat: boolean; hasWideScreenCompat: boolean; backwardForwardFn: (date: Temporal.PlainDate, units: number) => Temporal.PlainDate; backwardForwardUnits: number };
/** The few parts of Schedule-X's app singleton the bridge touches. */
type SxApp = {
  calendarState: { view: Signal<string>; range: Signal<{ start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime } | null>; isCalendarSmall: Signal<boolean | undefined>; setView: (view: string, date: Temporal.PlainDate) => void };
  datePickerState: { selectedDate: Signal<Temporal.PlainDate> };
  config: { views: Signal<SxView[]>; timezone: Signal<string> };
};

export type CalendarViewOption = { name: string; label: string };
export type CalendarSnapshot = {
  ready: boolean;
  view: string;
  date: Temporal.PlainDate | null;
  range: { start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime } | null;
  /** True when Schedule-X has switched to its small-screen set of views. */
  small: boolean;
  views: CalendarViewOption[];
};

/** Schedule-X's views, named for a newsroom. Month and Week mean the grid on wide screens and the agenda on narrow ones. */
export const VIEW_LABELS: Record<string, string> = { "month-grid": "Month", "month-agenda": "Month", week: "Week", "week-agenda": "Week", day: "Day", list: "List" };

const EMPTY: CalendarSnapshot = { ready: false, view: "", date: null, range: null, small: false, views: [] };

export function createCalendarController() {
  let app: SxApp | null = null;
  let snapshot = EMPTY;
  let unsubscribe: Array<() => void> = [];
  const listeners = new Set<() => void>();
  const emit = () => {
    if (app) {
      const small = Boolean(app.calendarState.isCalendarSmall.value);
      snapshot = {
        ready: true,
        view: app.calendarState.view.value,
        date: app.datePickerState.selectedDate.value,
        range: app.calendarState.range.value,
        small,
        views: app.config.views.value.filter((view) => (small ? view.hasSmallScreenCompat : view.hasWideScreenCompat)).map((view) => ({ name: view.name, label: VIEW_LABELS[view.name] || view.name }))
      };
    } else snapshot = EMPTY;
    listeners.forEach((listener) => listener());
  };

  const plugin: PluginBase<"byline-controller"> = {
    name: "byline-controller",
    onRender($app: SxApp) {
      app = $app;
      unsubscribe = [$app.calendarState.view, $app.calendarState.range, $app.calendarState.isCalendarSmall, $app.datePickerState.selectedDate, $app.config.views].map((signal) => (signal as Signal<unknown>).subscribe(emit));
      emit();
    },
    destroy() {
      unsubscribe.forEach((off) => off());
      unsubscribe = [];
      app = null;
      emit();
    }
  };

  return {
    plugin,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    /** Today in the SITE timezone, as Schedule-X's own Today button does. */
    today: () => { if (app) app.datePickerState.selectedDate.value = Temporal.Now.plainDateISO(app.config.timezone.value); },
    /** One step backward (-1) or forward (1) in whatever the current view counts in: a day, a week or a month. */
    step: (direction: -1 | 1) => {
      if (!app) return;
      const view = app.config.views.value.find((item) => item.name === app!.calendarState.view.value);
      if (view) app.datePickerState.selectedDate.value = view.backwardForwardFn(app.datePickerState.selectedDate.value, direction * view.backwardForwardUnits);
    },
    setView: (name: string) => { if (app) app.calendarState.setView(name, app.datePickerState.selectedDate.value); }
  };
}

export type CalendarController = ReturnType<typeof createCalendarController>;

/** "October 2026", "Oct 26 – Nov 1, 2026" or "Tuesday, October 27, 2026", matching what the view shows. */
export function calendarHeading(snapshot: Pick<CalendarSnapshot, "view" | "date" | "range">, locale?: string): string {
  const { date, view, range } = snapshot;
  if (!date) return "";
  const format = (value: Temporal.PlainDate, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(`${value.toString()}T12:00:00Z`));
  if (view === "day") return format(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if ((view === "week" || view === "week-agenda") && range) {
    const start = range.start.toPlainDate();
    const end = range.end.toPlainDate();
    return `${format(start, { month: "short", day: "numeric" })} – ${format(end, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return format(date, { month: "long", year: "numeric" });
}
