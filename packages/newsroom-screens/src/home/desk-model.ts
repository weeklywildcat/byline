/**
 * Home's newsroom read of its bounded story feed: the Desk (where stories sit
 * in the workflow), the Budget (what publishes when) and the reader's scope
 * preference. Presentation-free; HomeApp renders it.
 */
import type { PlanningStory } from "../planning/planning-model";
import { activeStory, addDays, dayDistance, myActiveStories, myStory, siteDay, weekdayOf, type HomeBootstrap, type HomeScope } from "./newsroom-model";

/** The stories a scope covers: the reader's own, or every visible active newsroom story. */
export function scopedStories(data: HomeBootstrap, scope: HomeScope): PlanningStory[] {
  return data.stories.filter((story) => activeStory(story) && (scope === "newsroom" || myStory(story, data.currentUser.id)));
}

/** Days in a stage after which the stage's oldest story is a warning. Other stages never warn. */
export const DESK_STALE_DAYS: Readonly<Record<string, number>> = { reporting: 7, editing: 5 };

export type DeskStage = {
  id: string;
  label: string;
  count: number;
  /**
   * Whole site days since the least recently changed story in the stage last
   * changed. The planning feed carries no time-in-stage, so this is the
   * story's last modification, and Home labels it "Last change".
   */
  ageDays: number | null;
  stale: boolean;
};

/**
 * Lifecycle order (story/lifecycle.ts), with the stored legacy stages a
 * WordPress install still reports placed where they fall in that lifecycle.
 * Sidelined stages come last.
 */
const DESK_ORDER = ["pitch", "assigned", "reporting", "writing", "drafting", "editing", "review", "ready", "on-hold"];

/** Active stories by workflow stage, in workflow order. Only stages that hold stories are returned. */
export function deskStages(stories: PlanningStory[], timezone: string, now = new Date()): DeskStage[] {
  const stages = new Map<string, DeskStage>();
  for (const story of stories) {
    if (!activeStory(story)) continue;
    const stage = stages.get(story.workflow.id) ?? { id: story.workflow.id, label: story.workflow.label, count: 0, ageDays: null, stale: false };
    stage.count += 1;
    const distance = story.modifiedAt ? -dayDistance(story.modifiedAt, timezone, now) : NaN;
    if (Number.isFinite(distance)) stage.ageDays = Math.max(stage.ageDays ?? 0, Math.max(0, distance));
    stages.set(stage.id, stage);
  }
  const rank = (id: string) => { const index = DESK_ORDER.indexOf(id); return index < 0 ? DESK_ORDER.length : index; };
  return [...stages.values()]
    .map((stage) => ({ ...stage, stale: stage.ageDays !== null && DESK_STALE_DAYS[stage.id] !== undefined && stage.ageDays > DESK_STALE_DAYS[stage.id]! }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label));
}

export type BudgetTab = "week" | "mine" | "unscheduled";

/** When a story publishes: its actual schedule, otherwise its planned target. */
export function publishDate(story: PlanningStory): string | null {
  return story.publicationState.isScheduled && story.publicationState.scheduledAt ? story.publicationState.scheduledAt : story.plannedPublication;
}

/** The Budget's three lists. `week`: the current Sunday–Saturday site week. */
export function budgetStories(data: HomeBootstrap, scope: HomeScope, now = new Date()): Record<BudgetTab, PlanningStory[]> {
  const { timezone } = data;
  const today = siteDay(now, timezone);
  const start = addDays(today, -weekdayOf(today));
  const end = addDays(start, 6);
  const scoped = scopedStories(data, scope);
  const byPublish = (a: PlanningStory, b: PlanningStory) => (publishDate(a) || "9999").localeCompare(publishDate(b) || "9999") || a.id - b.id;
  const week = scoped.filter((story) => {
    const value = publishDate(story);
    const day = value ? siteDay(value, timezone) : "";
    return Boolean(day) && day >= start && day <= end;
  }).sort(byPublish);
  // Kordiam's "undated stories": active work with no planned or scheduled publication.
  const unscheduled = scoped.filter((story) => !publishDate(story)).sort((a, b) =>
    (a.deadline || "9999").localeCompare(b.deadline || "9999") || (b.modifiedAt || "").localeCompare(a.modifiedAt || "") || a.id - b.id);
  return { week, mine: myActiveStories(data.stories, data.currentUser.id, timezone, now), unscheduled };
}

/** The reader's remembered Home choices. Today, only the Mine | Newsroom scope. */
export type HomePreferences = { scope: HomeScope | null };

/** Where a host keeps Home preferences. Both halves are optional; failures are ignored. */
export type HomePreferenceStorage = {
  load?: () => Promise<unknown> | unknown;
  save?: (preferences: HomePreferences) => Promise<unknown> | unknown;
};

/** Stored preferences (any age, any shape) as the current shape. */
export function normalizeHomePreferences(value: unknown): HomePreferences {
  const stored = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return { scope: stored.scope === "mine" || stored.scope === "newsroom" ? stored.scope : null };
}

/** WordPress keeps Home preferences in this browser, as it does the Calendar view. */
export const HOME_PREFERENCES_STORAGE_KEY = "byline:home:preferences";

export function localHomePreferences(storage: Pick<Storage, "getItem" | "setItem"> | null): HomePreferenceStorage {
  return {
    load: () => {
      try {
        const raw = storage?.getItem(HOME_PREFERENCES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save: (preferences) => {
      try {
        storage?.setItem(HOME_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeHomePreferences(preferences)));
      } catch {
        // The choice still applies for this visit.
      }
    }
  };
}
