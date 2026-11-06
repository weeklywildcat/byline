import { WORKFLOW_OPTIONS, WORKFLOW_STAGES, type EffectiveWorkflow, type WorkflowStage } from "./vocabulary";

export function isWorkflowStage(value: unknown): value is WorkflowStage {
  return typeof value === "string" && (WORKFLOW_STAGES as readonly string[]).includes(value);
}

/**
 * The stage a story reads as. A published story reads Published; the stored
 * stage stays put, so unpublishing recovers it. A story with no stage reads as
 * Pitch, and nothing writes that default back.
 *
 * Workflow lives on the story's unversioned plan (`story-plans`), so neither
 * autosave, a draft save nor a version restore can move it: it changes only
 * when someone changes it.
 */
export function effectiveWorkflow(stage: unknown, publicationStatus: unknown): EffectiveWorkflow {
  if (publicationStatus === "published") return "published";
  return isWorkflowStage(stage) ? stage : "pitch";
}

export function workflowLabel(stage: EffectiveWorkflow): string {
  if (stage === "published") return "Published";
  return WORKFLOW_OPTIONS.find((option) => option.value === stage)?.label ?? "Pitch";
}
