import type { TourId } from "./tour-registry";

/**
 * A tour crosses screens (open Stories, then explain it), so it can outlive
 * the page it started on: a reload, or a remount while Next renders the new
 * screen. As each step shows, and just before a step that opens another
 * screen, this tab notes where the tour is (or is going) in `sessionStorage`
 * (this tab only, gone when it closes, expired after a few minutes). It is
 * never the record of whether onboarding was finished; that is the Payload
 * Preference.
 */
export type PendingTourNavigation = {
  tour: TourId;
  stepId: string;
  /** The full pathname the step lives on (admin route included). */
  expectedPath: string;
  replay: boolean;
  savedAt: number;
};

export const TOUR_HANDOFF_KEY = "byline:onboarding:handoff";
/** An abandoned handoff never reopens a tour later than this. */
export const TOUR_HANDOFF_TTL_MS = 3 * 60_000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function session(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const samePath = (left: string, right: string) => left.replace(/\/+$/, "") === right.replace(/\/+$/, "");

export function saveTourHandoff(value: Omit<PendingTourNavigation, "savedAt">, now = Date.now(), store: Store | null = session()): void {
  try {
    store?.setItem(TOUR_HANDOFF_KEY, JSON.stringify({ ...value, savedAt: now }));
  } catch {
    // Private mode or full storage: the tour still runs; it just won't survive a reload.
  }
}

export function clearTourHandoff(store: Store | null = session()): void {
  try {
    store?.removeItem(TOUR_HANDOFF_KEY);
  } catch {
    // Nothing to clear.
  }
}

function parse(raw: string | null, isTour: (id: string) => id is TourId): PendingTourNavigation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object") return null;
    const { tour, stepId, expectedPath, replay, savedAt } = value;
    if (typeof tour !== "string" || !isTour(tour) || typeof stepId !== "string" || !stepId || typeof expectedPath !== "string" || !expectedPath.startsWith("/") || typeof savedAt !== "number") return null;
    return { tour, stepId, expectedPath, replay: replay === true, savedAt };
  } catch {
    return null;
  }
}

/**
 * The handoff for this page, consumed: it is removed whatever it says, and
 * returned only while fresh and for the page the tour was going to. A stale,
 * malformed or elsewhere handoff is simply dropped.
 */
export function takeTourHandoff(pathname: string, isTour: (id: string) => id is TourId, now = Date.now(), store: Store | null = session()): PendingTourNavigation | null {
  let raw: string | null = null;
  try {
    raw = store?.getItem(TOUR_HANDOFF_KEY) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  clearTourHandoff(store);
  const value = parse(raw, isTour);
  if (!value || now - value.savedAt > TOUR_HANDOFF_TTL_MS || now < value.savedAt - 5_000) return null;
  return samePath(value.expectedPath, pathname) ? value : null;
}
