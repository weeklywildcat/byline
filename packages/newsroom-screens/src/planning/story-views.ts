/**
 * Built-in Stories views: common filter sets promoted to first-class
 * destinations (All stories, My stories, Ready for review…). They are presets
 * of the shared PlanningFilters, not stored records; choosing one applies its
 * filters, and a view is "active" only while the current filters still match
 * it exactly. Saved views are the reader's own presets, stored by the host.
 */
import { DEFAULT_PLANNING_SORT, EMPTY_PLANNING_FILTERS, normalizePlanningFilters, samePlanningFilters, sanitizePlanningFilters, sanitizePlanningSort, type PlanningFilters, type PlanningSort, type SavedPlanningView } from "./planning-model";

export type BuiltInStoryViewId = "all" | "mine" | "review" | "overdue" | "unassigned" | "published" | "on-hold";

export type BuiltInStoryView = { id: BuiltInStoryViewId; label: string; filters: PlanningFilters };

const preset = (id: BuiltInStoryViewId, label: string, patch: Partial<PlanningFilters>): BuiltInStoryView => ({ id, label, filters: { ...EMPTY_PLANNING_FILTERS, ...patch } });

/** In menu order. Dropped stays reachable through the Workflow filter, never a prominent view. */
export const BUILT_IN_STORY_VIEWS: readonly BuiltInStoryView[] = [
  preset("all", "All stories", {}),
  preset("mine", "My stories", { mine: true }),
  preset("review", "Ready for review", { needsReview: true }),
  preset("overdue", "Overdue", { overdue: true }),
  preset("unassigned", "Unassigned", { unassigned: true }),
  preset("published", "Published", { publicationState: "published" }),
  preset("on-hold", "On hold", { workflow: "on-hold" })
];

export function builtInStoryView(id: string): BuiltInStoryView | null {
  return BUILT_IN_STORY_VIEWS.find((view) => view.id === id) ?? null;
}

/** What the reader is looking at. A saved view stays selected while edited ("modified"); a built-in only while it matches. */
export type ActiveStoryView =
  | { kind: "built-in"; view: BuiltInStoryView }
  | { kind: "saved"; view: SavedPlanningView; modified: boolean }
  | { kind: "custom" };

const sameSort = (left: PlanningSort, right: PlanningSort) => left.key === right.key && left.direction === right.direction;

export function activeStoryView(filters: Partial<PlanningFilters>, sort: PlanningSort, savedViews: readonly SavedPlanningView[], selectedSavedId: string | null): ActiveStoryView {
  const selected = selectedSavedId ? savedViews.find((view) => view.id === selectedSavedId) : undefined;
  if (selected) return { kind: "saved", view: selected, modified: !samePlanningFilters(selected.filters, filters) || !sameSort(selected.sort, sort) };
  const builtIn = BUILT_IN_STORY_VIEWS.find((view) => samePlanningFilters(view.filters, filters));
  return builtIn ? { kind: "built-in", view: builtIn } : { kind: "custom" };
}

/** The current view's name, for the compact picker and announcements. */
export function activeStoryViewLabel(active: ActiveStoryView): string {
  if (active.kind === "built-in") return active.view.label;
  if (active.kind === "saved") return active.modified ? `${active.view.name} (modified)` : active.view.name;
  return "Custom view";
}

export type AppliedView = { filters: PlanningFilters; sort: PlanningSort; savedViewId: string | null };

export function applyBuiltInView(view: BuiltInStoryView): AppliedView {
  return { filters: normalizePlanningFilters(view.filters), sort: { ...DEFAULT_PLANNING_SORT }, savedViewId: null };
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
