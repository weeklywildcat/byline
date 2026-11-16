import type { Config, DriveStep, Driver } from "driver.js/headless";
import type { TourId, TourStep } from "./tour-registry";
import { resolveTourTarget } from "./tour-targets";

/**
 * One run of a tour. Driver.js (headless) owns the state machine: finding a
 * step's element, waiting for one that is still rendering, following an
 * element React replaced, advancing when the reader uses the highlighted
 * control, and moving forward and back. Byline owns everything visible
 * (BylineTour) and every decision to record an outcome (OnboardingProvider):
 * this module never persists anything, so tearing a run down while the shell
 * navigates is never mistaken for the reader skipping.
 */
export type TourPhase =
  | { kind: "loading" }
  | { kind: "step"; index: number; element: HTMLElement | null }
  | { kind: "waiting"; index: number }
  | { kind: "unavailable"; index: number }
  | { kind: "ended" };

export type TourRunState = { tour: TourId; steps: readonly TourStep[]; replay: boolean; phase: TourPhase };

export type TourRunOptions = {
  tour: TourId;
  steps: readonly TourStep[];
  replay: boolean;
  startAt?: number;
  /** How long to wait for a screen to render, and for a control (navigation remounts on every screen). */
  waitMs?: { screen: number; control: number };
  /** A step that lives on another screen started waiting for it (note a route handoff). */
  onWaitingForScreen?: (step: TourStep) => void;
  /** A step is on screen (any handoff is done). */
  onShown?: (step: TourStep) => void;
  /** Loads Driver.js; tests pass their own. */
  load?: () => Promise<(config: Config) => Driver>;
};

export type TourRun = {
  subscribe: (listener: () => void) => () => void;
  getState: () => TourRunState;
  start: () => Promise<void>;
  next: () => void;
  back: () => void;
  /** After a step could not be shown: go on with the next one. */
  skipUnavailable: () => void;
  /** Internal teardown (navigation, unmount, an outcome already recorded). Never an outcome itself. */
  dispose: () => void;
};

export const TOUR_WAIT_MS = { screen: 15_000, control: 4_000 } as const;

const loadDriver = async () => (await import("driver.js/headless")).driver;

export function createTourRun(options: TourRunOptions): TourRun {
  const { steps, waitMs = TOUR_WAIT_MS } = options;
  let state: TourRunState = { tour: options.tour, steps, replay: options.replay, phase: { kind: "loading" } };
  const listeners = new Set<() => void>();
  let driver: Driver | null = null;
  let disposed = false;

  const set = (phase: TourPhase) => {
    if (disposed && phase.kind !== "ended") return;
    state = { ...state, phase };
    for (const listener of listeners) listener();
  };
  const indexOf = (value: unknown, fallback: number) => (typeof value === "number" && steps[value] ? value : fallback);
  const current = () => (state.phase.kind === "step" || state.phase.kind === "waiting" || state.phase.kind === "unavailable" ? state.phase.index : -1);

  const driveSteps: DriveStep[] = steps.map((step) => ({
    element: step.targets ? (() => resolveTourTarget(step.targets!) as Element) : undefined,
    waitForElement: step.targets ? (step.screen !== undefined ? waitMs.screen : waitMs.control) : 0,
    // A control that went away (a layout swap) gets a moment to come back before the step gives up.
    waitForRemovedElement: step.targets ? waitMs.control : 0,
    advanceOn: step.action ? "click" : false,
    data: { id: step.id }
  }));

  const config: Config = {
    steps: driveSteps,
    animate: false,
    smoothScroll: false,
    allowClose: true,
    allowKeyboardControl: false,
    onHighlighted: (element, _step, opts) => {
      const index = indexOf(opts.index, current());
      set({ kind: "step", index, element: (element as HTMLElement | undefined) ?? null });
      const step = steps[index];
      if (step) options.onShown?.(step);
    },
    onElementReplaced: (element) => {
      if (state.phase.kind === "step") set({ ...state.phase, element: element as HTMLElement });
    },
    onWaitingForElement: (_element, _step, opts) => {
      const index = indexOf(opts.index, current());
      set({ kind: "waiting", index });
      const step = steps[index];
      if (step?.screen !== undefined) options.onWaitingForScreen?.(step);
    },
    onElementMissing: (_element, _step, opts) => {
      // Never stuck: the card explains and offers to continue or end.
      set({ kind: "unavailable", index: indexOf(opts.index, current()) });
      return false;
    }
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    start: async () => {
      const create = await (options.load ?? loadDriver)();
      if (disposed) return;
      driver = create(config);
      driver.drive(Math.max(0, Math.min(options.startAt ?? 0, steps.length - 1)));
    },
    next: () => {
      const index = current();
      if (!driver || state.phase.kind !== "step" || steps[index]?.action || index >= steps.length - 1) return;
      driver.moveNext();
    },
    back: () => {
      const index = current();
      if (!driver || state.phase.kind !== "step" || index <= 0) return;
      driver.movePrevious();
    },
    skipUnavailable: () => {
      const index = current();
      if (!driver || state.phase.kind !== "unavailable") return;
      if (index + 1 < steps.length) driver.moveTo(index + 1);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      driver?.destroy();
      driver = null;
      set({ kind: "ended" });
      listeners.clear();
    }
  };
}
