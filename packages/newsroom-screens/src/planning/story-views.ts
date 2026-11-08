/**
 * Built-in Stories views: common filter sets promoted to first-class
 * destinations (All stories, My stories, Ready for review…). They are presets
 * of the shared PlanningFilters, not stored records; choosing one applies its
 * filters, and a view is "active" only while the current filters still match
 * it exactly. Saved views are the reader's own presets, stored by the host.
 */
import { activeStory, siteDay } from "../home/newsroom-model";
import { DEFAULT_PLANNING_SORT, EMPTY_PLANNING_FILTERS, filterPlanningStories, normalizePlanningFilters, samePlanningFilters, sanitizePlanningFilters, sanitizePlanningSort, type PlanningFilters, type PlanningSort, type PlanningStory, type SavedPlanningView } from "./planning-model";

export type BuiltInStoryViewId = "all" | "mine" | "review" | "overdue" | "due-week" | "unassigned" | "art-needed" | "published" | "on-hold";

export type BuiltInStoryView = {
  id: BuiltInStoryViewId;
  label: string;
  /** The view's fixed filters. A relative view's dates are added by `resolve`; read them with builtInViewFilters. */
  filters: PlanningFilters;
  /** A view relative to the newsroom's today (Due this week): its dates, resolved when it is applied or matched. */
  resolve?: (today: string) => Partial<PlanningFilters>;
};

/** When a relative view is read: now, in the newsroom timezone (never the browser's). */
export type StoryViewContext = { now?: Date; timezone?: string };

const preset = (id: BuiltInStoryViewId, label: string, patch: Partial<PlanningFilters>, resolve?: BuiltInStoryView["resolve"]): BuiltInStoryView => ({ id, label, filters: { ...EMPTY_PLANNING_FILTERS, ...patch }, ...(resolve ? { resolve } : {}) });

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Today through the coming Sunday (the newsroom's week ends on Sunday; on a Sunday, just today). */
export function thisWeekDeadlines(today: string): Pick<PlanningFilters, "deadlineFrom" | "deadlineTo"> {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return { deadlineFrom: today, deadlineTo: addDays(today, (7 - weekday) % 7) };
}

/** In menu order. Dropped stays reachable through the Workflow filter, never a prominent view. */
export const BUILT_IN_STORY_VIEWS: readonly BuiltInStoryView[] = [
  preset("all", "All stories", {}),
  preset("mine", "My stories", { mine: true }),
  preset("review", "Ready for review", { needsReview: true }),
  preset("overdue", "Overdue", { overdue: true }),
  preset("due-week", "Due this week", {}, thisWeekDeadlines),
  preset("unassigned", "Unassigned", { unassigned: true }),
  preset("art-needed", "Art needed", { visualStatus: "needed" }),
  preset("published", "Published", { publicationState: "published" }),
  preset("on-hold", "On hold", { workflow: "on-hold" })
];

export function builtInStoryView(id: string): BuiltInStoryView | null {
  return BUILT_IN_STORY_VIEWS.find((view) => view.id === id) ?? null;
}

/** The built-in views the sidebar promotes as shortcuts, each with its count. */
export const SIDEBAR_STORY_VIEWS: readonly BuiltInStoryViewId[] = ["review", "unassigned", "art-needed"];

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** A built-in view's filters, with a relative view's dates resolved for today in the newsroom timezone. */
export function builtInViewFilters(view: BuiltInStoryView, context: StoryViewContext = {}): PlanningFilters {
  if (!view.resolve) return view.filters;
  return { ...view.filters, ...view.resolve(siteDay(context.now ?? new Date(), context.timezone || browserTimeZone())) };
}

/** How many active (unpublished, not dropped) stories a built-in view holds: work still to do. */
export function storyViewCount(stories: readonly PlanningStory[], view: BuiltInStoryView, currentUserId?: number, now = new Date(), timezone?: string): number {
  return filterPlanningStories([...stories], builtInViewFilters(view, { now, timezone }), currentUserId, now).filter(activeStory).length;
}

/** What the reader is looking at. A saved view stays selected while edited ("modified"); a built-in only while it matches. */
export type ActiveStoryView =
  | { kind: "built-in"; view: BuiltInStoryView }
  | { kind: "saved"; view: SavedPlanningView; modified: boolean }
  | { kind: "custom" };

const sameSort = (left: PlanningSort, right: PlanningSort) => left.key === right.key && left.direction === right.direction;

export function activeStoryView(filters: Partial<PlanningFilters>, sort: PlanningSort, savedViews: readonly SavedPlanningView[], selectedSavedId: string | null, context: StoryViewContext = {}): ActiveStoryView {
  const selected = selectedSavedId ? savedViews.find((view) => view.id === selectedSavedId) : undefined;
  if (selected) return { kind: "saved", view: selected, modified: !samePlanningFilters(selected.filters, filters) || !sameSort(selected.sort, sort) };
  // A relative view matches only while its dates are still this week's.
  const builtIn = BUILT_IN_STORY_VIEWS.find((view) => samePlanningFilters(builtInViewFilters(view, context), filters));
  return builtIn ? { kind: "built-in", view: builtIn } : { kind: "custom" };
}

/** The current view's name, for the compact picker and announcements. */
export function activeStoryViewLabel(active: ActiveStoryView): string {
  if (active.kind === "built-in") return active.view.label;
  if (active.kind === "saved") return active.modified ? `${active.view.name} (modified)` : active.view.name;
  return "Custom view";
}

export type AppliedView = { filters: PlanningFilters; sort: PlanningSort; savedViewId: string | null };

export function applyBuiltInView(view: BuiltInStoryView, context: StoryViewContext = {}): AppliedView {
  return { filters: normalizePlanningFilters(builtInViewFilters(view, context)), sort: { ...DEFAULT_PLANNING_SORT }, savedViewId: null };
}

export function applySavedView(view: SavedPlanningView): AppliedView {
  return { filters: normalizePlanningFilters(view.filters), sort: view.sort, savedViewId: view.id };
}

/** The most saved views one account keeps. Hosts enforce it on the server too. */
export const SAVED_VIEW_LIMIT = 25;
export const SAVED_VIEW_NAME_MAX_LENGTH = 80;

/** A saved view's id: what a host generated (a UUID, a WordPress key), never markup or a path. */
const SAVED_VIEW_ID = /^[A-Za-z0-9_-]{1,64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Untrusted stored saved views (a preference value, a server response) as a
 * valid list: an array, each record with a safe unique id, a trimmed name of
 * at most SAVED_VIEW_NAME_MAX_LENGTH, sanitized filters and sort; malformed
 * records are dropped and at most SAVED_VIEW_LIMIT are kept.
 */
export function normalizeSavedPlanningViews(value: unknown): SavedPlanningView[] {
  if (!Array.isArray(value)) return [];
  const views: SavedPlanningView[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (views.length === SAVED_VIEW_LIMIT) break;
    if (!isRecord(item) || typeof item.id !== "string" || !SAVED_VIEW_ID.test(item.id) || seen.has(item.id)) continue;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, SAVED_VIEW_NAME_MAX_LENGTH).trim() : "";
    if (!name || !isRecord(item.filters)) continue;
    seen.add(item.id);
    views.push({ id: item.id, name, filters: sanitizePlanningFilters(item.filters), sort: sanitizePlanningSort(item.sort), ...(typeof item.updatedAt === "string" ? { updatedAt: item.updatedAt } : {}) });
  }
  return views;
}
