import { isStoredStage, lifecyclePhase, phaseLabel, storedStage, type EffectivePhase, type StoredStage } from "@byline/newsroom-screens/story/lifecycle";

/** A stored workflow value (`story-plans.workflow`). Readers project it with `effectiveWorkflow`. */
export function isWorkflowStage(value: unknown): value is StoredStage {
  return isStoredStage(value);
}

/**
 * The lifecycle phase a story reads as (docs/story-lifecycle.md): Pitch,
 * Reporting, Drafting, Review, Ready, On Hold or Dropped, or Published when it
 * is live. The stored stage stays put, so unpublishing recovers it; a story
 * with no stage reads as Pitch, and nothing writes that default back.
 *
 * Workflow lives on the story's unversioned plan (`story-plans`), so neither
 * autosave, a draft save nor a version restore can move it: it changes only
 * when someone (or the review engine) changes it.
 */
export function effectiveWorkflow(stage: unknown, publicationStatus: unknown): EffectivePhase {
  return lifecyclePhase(stage, publicationStatus);
}

export function workflowLabel(phase: EffectivePhase | string): string {
  const resolved = typeof phase === "string" && phase !== "published" ? lifecyclePhase(phase) : (phase as EffectivePhase);
  return phaseLabel(resolved);
}

/** The value to store for a phase id or any legacy stage id, or null. */
export function workflowToStore(phase: unknown): StoredStage | null {
  return storedStage(phase);
}
