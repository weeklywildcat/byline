/**
 * The Calendar's one state owner: the selected date, the filters and the view.
 *
 * Every presentation reads and writes this one store: the toolbar above
 * Schedule-X, a host's contextual sidebar, a temporary controls sheet. None of
 * them keeps its own copy. While a Schedule-X calendar is mounted it is
 * attached here, and the store mirrors the calendar's own selected date and
 * view (Schedule-X stays authoritative about which views fit the space);
 * without one, the store keeps the date so a calendar mounted later opens
 * where the reader left it.
 *
 * Hosts decide where preferences live (`CalendarPreferenceStorage`): an
 * account's preferences, or this browser. Only the view and the filters are
 * preferences; the date is navigation.
 */
import "temporal-polyfill/global";
import { DEFAULT_CALENDAR_FILTERS, normalizeCalendarFilters, type CalendarCategoryFilter, type CalendarFilters } from "./calendar-model";
import { EMPTY_CALENDAR_SNAPSHOT, type CalendarController, type CalendarSnapshot } from "./calendar-controller";

export type CalendarPreferences = {
  /** The view the reader chose, by its wide-screen name (Month is `month-grid`). */
  view: string | null;
  filters: CalendarFilters;
};

/** Where a host keeps Calendar preferences. Both halves are optional; failures are ignored. */
export type CalendarPreferenceStorage = {
  load?: () => Promise<unknown> | unknown;
  save?: (preferences: CalendarPreferences) => Promise<unknown> | unknown;
};

export type CalendarWorkspaceState = {
  /** False until stored preferences are read; a calendar waits so it opens in the remembered view. */
  ready: boolean;
  filters: CalendarFilters;
  /** The reader's chosen view (wide-screen name). Null: the calendar's default. */
  view: string | null;
  /** The selected day, `YYYY-MM-DD` in the newsroom timezone. Null: today. */
  date: string | null;
  /** The mounted Schedule-X calendar, as the controller sees it. */
  calendar: CalendarSnapshot;
  /** Appointments in the loaded range still needing a time (for a count or shortcut). */
  needsScheduling: number;
};

/** Schedule-X's narrow-screen views stand for the wide ones a reader chose. */
const WIDE_VIEW: Record<string, string> = { "month-agenda": "month-grid", "week-agenda": "week" };
const NARROW_VIEW: Record<string, string> = { "month-grid": "month-agenda", week: "week-agenda" };
const VIEW_NAME = /^[a-z][a-z-]{1,31}$/;

export const wideViewName = (view: string) => WIDE_VIEW[view] ?? view;

/**
 * The view to show for a preference, among the views Schedule-X offers at the
 * current size: the preference itself, its narrow-screen equivalent, or null
 * (leave Schedule-X's own choice).
 */
export function viewForPreference(preferred: string | null, offered: ReadonlyArray<{ name: string }>, small: boolean): string | null {
  if (!preferred) return null;
  const names = offered.map((view) => view.name);
  const wanted = small ? (NARROW_VIEW[preferred] ?? preferred) : wideViewName(preferred);
  return names.includes(wanted) ? wanted : null;
}

/** Stored preferences (any age, any shape) as the current shape. */
export function normalizeCalendarPreferences(value: unknown): CalendarPreferences {
  const stored = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const view = typeof stored.view === "string" && VIEW_NAME.test(stored.view) ? wideViewName(stored.view) : null;
  return { view, filters: normalizeCalendarFilters(stored.filters) };
}

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function createCalendarWorkspace(storage: CalendarPreferenceStorage = {}, initial: Partial<Pick<CalendarWorkspaceState, "date">> = {}) {
  let state: CalendarWorkspaceState = {
    ready: !storage.load,
    filters: DEFAULT_CALENDAR_FILTERS,
    view: null,
    date: initial.date && isDay(initial.date) ? initial.date : null,
    calendar: EMPTY_CALENDAR_SNAPSHOT,
    needsScheduling: 0
  };
  let controller: CalendarController | null = null;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<CalendarWorkspaceState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  // One save at a time, always of the latest state: quick toggles must not land out of order.
  let saving: Promise<void> | null = null;
  let dirty = false;
  const persist = () => {
    if (!storage.save) return;
    if (saving) {
      dirty = true;
      return;
    }
    saving = (async () => {
      do {
        dirty = false;
        try {
          await storage.save!({ view: state.view, filters: state.filters });
        } catch {
          // A preference that cannot be saved still applies for this session.
        }
      } while (dirty);
      saving = null;
    })();
  };

  const workspace = {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getState: () => state,

    /** Read stored preferences once. Safe to call from every consumer. */
    load: (): Promise<void> => {
      if (!storage.load || state.ready) return Promise.resolve();
      loading ??= (async () => {
        let stored: unknown = null;
        try {
          stored = await storage.load!();
        } catch {
          stored = null;
        }
        const preferences = normalizeCalendarPreferences(stored);
        set({ ready: true, view: preferences.view, filters: preferences.filters });
      })();
      return loading;
    },

    /**
     * Attach the mounted calendar. Its date and view become the store's; the
     * returned function detaches it (keeping the date it was on).
     */
    attach: (next: CalendarController) => {
      controller = next;
      const mirror = () => {
        const calendar = next.getSnapshot();
        set({ calendar, date: calendar.date ? calendar.date.toString() : state.date });
      };
      const off = next.subscribe(mirror);
      mirror();
      return () => {
        off();
        if (controller === next) {
          controller = null;
          set({ calendar: EMPTY_CALENDAR_SNAPSHOT });
        }
      };
    },

    /** Jump to a newsroom-local day. */
    setDate: (date: Temporal.PlainDate) => {
      if (controller?.getSnapshot().ready) controller.setDate(date);
      else set({ date: date.toString() });
    },
    today: () => controller?.today(),
    step: (direction: -1 | 1) => controller?.step(direction),

    /** The reader's choice of view: shown now, and remembered by its wide-screen name. */
    setView: (name: string) => {
      controller?.setView(name);
      const view = wideViewName(name);
      if (view !== state.view) {
        set({ view });
        persist();
      }
    },

    setFilter: (key: CalendarCategoryFilter | "mine", value: boolean) => {
      if (state.filters[key] === value) return;
      set({ filters: { ...state.filters, [key]: value } });
      persist();
    },

    setNeedsScheduling: (count: number) => { if (count !== state.needsScheduling) set({ needsScheduling: count }); }
  };
  return workspace;
}

export type CalendarWorkspace = ReturnType<typeof createCalendarWorkspace>;

/** The selected day as a PlainDate: the store's, else today in the newsroom timezone. */
export function selectedDay(state: Pick<CalendarWorkspaceState, "date">, timezone: string): Temporal.PlainDate {
  return state.date ? Temporal.PlainDate.from(state.date) : Temporal.Now.plainDateISO(timezone);
}
