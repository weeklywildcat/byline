import { roleAllows } from "../../domain/navigation";
import type { Role } from "../../domain/vocabulary";
import type { TourAnchor } from "./tour-targets";
import { WELCOME_ONBOARDING_PREFERENCE } from "./tour-preferences";
import { welcomeTourSteps } from "./welcome-tour";

/**
 * What a tour knows about the reader when it starts: the role, the
 * destinations their navigation really shows (`navigationFor`, so a tour never
 * mentions somewhere they cannot go), which anchors are on screen in this
 * layout, and the platform's shortcut modifier.
 */
export type TourContext = {
  role: Role;
  navigation: ReadonlySet<string>;
  publishDesks: readonly string[];
  visible: (anchor: TourAnchor) => boolean;
  modifier: string;
};

export type TourStepDefinition = {
  /** Stable and semantic: a step is only ever stored or resumed by this ID, never its position. */
  id: string;
  /** Progress counts moments: opening a screen and the screen itself are one. */
  moment: string;
  title: string;
  description: string | ((context: TourContext) => string);
  /** Anchors in order of preference; the first one visible is highlighted. */
  targets?: readonly TourAnchor[];
  /** The screen (path below the admin route) this step explains; the step waits for it to render. */
  screen?: string;
  /** The screen's name while it opens ("Opening Stories…"). */
  place?: string;
  /** The reader moves on by using the highlighted control itself, which opens `to` through the shell. */
  action?: { instruction: string; to: string };
  minimumRole?: Role;
  include?: (context: TourContext) => boolean;
  /** The closing moment: a centred dialog, no target. */
  final?: boolean;
};

export type TourStep = Omit<TourStepDefinition, "description" | "include" | "minimumRole"> & { description: string };

export type TourDefinition = {
  id: string;
  /** The account's Payload Preference that records finishing or skipping this tour (versioned). */
  preferenceKey: string;
  minimumRole: Role;
  steps: readonly TourStepDefinition[];
};

export const TOURS = {
  welcome: { id: "welcome", preferenceKey: WELCOME_ONBOARDING_PREFERENCE, minimumRole: "staff", steps: welcomeTourSteps }
} as const satisfies Record<string, TourDefinition>;

export type TourId = keyof typeof TOURS;

export function isTourId(value: string): value is TourId {
  return Object.hasOwn(TOURS, value);
}

/** The steps this reader gets, decided before the tour starts: role, navigation and the current layout. */
export function stepsFor(tour: TourId, context: TourContext): TourStep[] {
  const definition: TourDefinition = TOURS[tour];
  if (!roleAllows(context.role, definition.minimumRole)) return [];
  return definition.steps
    .filter((step) => (!step.minimumRole || roleAllows(context.role, step.minimumRole)) && (!step.include || step.include(context)))
    .map(({ include: _include, minimumRole: _minimumRole, description, ...step }) => ({ ...step, description: typeof description === "function" ? description(context) : description }));
}

/** "4 / 8": the step's moment among the tour's moments (the closing dialog is not counted). */
export function tourProgress(steps: readonly TourStep[], index: number): { current: number; total: number } {
  const moments: string[] = [];
  for (const step of steps) if (!step.final && !moments.includes(step.moment)) moments.push(step.moment);
  const step = steps[index];
  return { current: step ? moments.indexOf(step.moment) + 1 : 0, total: moments.length };
}
