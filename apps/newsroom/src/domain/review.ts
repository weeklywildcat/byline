import type { ReviewTarget, StepResolution, WorkflowStep } from "./newsroom-roles";

/**
 * Review runs (docs/review.md). A run is one submission of a Story through an
 * ordered review workflow, snapshotted at submission so a later workflow edit
 * never changes a review in flight. It reviews an exact, immutable Payload
 * version; the writer may keep editing the draft.
 *
 * The engine (`newsroom/review.ts`) owns every write; these are its pure
 * rules: state shapes, transitions and staleness.
 */

export const RUN_STATUSES = ["active", "changes-requested", "routing-failed", "approved", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
/** A Story has at most one open run (a partial unique index enforces it). */
export const OPEN_RUN_STATUSES: readonly RunStatus[] = ["active", "changes-requested", "routing-failed"];

export const STEP_STATES = ["pending", "active", "approved", "skipped", "stale"] as const;
export type StepState = (typeof STEP_STATES)[number];

export type ApprovalFingerprint = { copy: string; visuals: string };

export type RunStep = {
  stepId: string;
  label: string;
  target: ReviewTarget;
  state: StepState;
  /** The routed reviewer, or the role queue's eligible members until someone claims it. */
  assigneeId: number | null;
  queue: { userIds: number[]; roleId: number | null } | null;
  waitingFor: string | null;
  via: string | null;
  skipReason: string | null;
  approval: { by: number; at: string; version: string; fingerprint: ApprovalFingerprint } | null;
  staleReason: string | null;
};

export type RunSnapshot = { workflowId: number; workflowName: string; steps: WorkflowStep[] };

export type ReviewDecision = { round: number; stepId: string; decision: "approved" | "changes-requested"; by: number; at: string; version: string; summary: string | null };

/** The steps of a fresh run, before routing activates the first one. */
export function initialSteps(snapshot: RunSnapshot): RunStep[] {
  return snapshot.steps.map((step) => ({
    stepId: step.stepId,
    label: step.label,
    target: step.target,
    state: "pending",
    assigneeId: null,
    queue: null,
    waitingFor: null,
    via: null,
    skipReason: null,
    approval: null,
    staleReason: null
  }));
}

/** Apply a routing resolution to a step being activated. */
export function activateStep(step: RunStep, resolution: StepResolution): RunStep {
  switch (resolution.kind) {
    case "skipped":
      return { ...step, state: "skipped", skipReason: resolution.reason, assigneeId: null, queue: null, waitingFor: null, via: null };
    case "person":
      return { ...step, state: "active", assigneeId: resolution.userId, queue: null, waitingFor: resolution.waitingFor, via: resolution.via, staleReason: null };
    case "queue":
      return { ...step, state: "active", assigneeId: null, queue: { userIds: resolution.userIds, roleId: resolution.roleId }, waitingFor: resolution.waitingFor, via: resolution.via, staleReason: null };
    case "failed":
      return { ...step, state: "pending", assigneeId: null, queue: null, waitingFor: null, via: null };
  }
}

/** Who may act on a step now. Editors and administrators may always step in (an override, recorded as one). */
export function mayReview(step: RunStep, userId: number): boolean {
  if (step.state !== "active") return false;
  if (step.assigneeId !== null) return step.assigneeId === userId;
  return Boolean(step.queue?.userIds.includes(userId));
}

/** Everyone who should see a review in their queue: the assignee or the queue. */
export function reviewerIds(steps: readonly RunStep[]): number[] {
  const active = steps.find((step) => step.state === "active");
  if (!active) return [];
  return active.assigneeId !== null ? [active.assigneeId] : [...(active.queue?.userIds ?? [])];
}

/* ------------------------------------------------------------ staleness */

/**
 * What a change touched. Copy is the words a reader reads (headline, deck,
 * kicker, the body's text, the reporting note); visuals are what they see
 * (lead image and caption, media and embeds in the body, the video). Planning
 * (deadline, appointments, checklist, assignments) is not on the Story
 * document at all, so it can never stale an approval.
 */
export function storyFingerprint(story: Record<string, unknown>): ApprovalFingerprint {
  const copy: string[] = [];
  const visuals: string[] = [];
  for (const key of ["headline", "deck", "kicker", "reportingNote", "legacyHtml"] as const) copy.push(`${key}:${normalizeText(story[key])}`);
  visuals.push(`lead:${idOf(story.featuredMedia)}`, `caption:${normalizeText(story.featuredCaption)}`);
  const video = story.video as { url?: unknown } | undefined;
  visuals.push(`video:${normalizeText(video?.url)}`);
  walkBody((story.body as { root?: unknown } | undefined)?.root, copy, visuals);
  return { copy: hash(copy.join("\u0001")), visuals: hash(visuals.join("\u0001")) };
}

const VISUAL_NODE = /^(upload|image|gallery|video|embed|chart|map|interactive|social|audio)$/i;

function walkBody(node: unknown, copy: string[], visuals: string[]): void {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  const blockType = typeof (record.fields as { blockType?: unknown } | undefined)?.blockType === "string" ? String((record.fields as { blockType: string }).blockType) : "";
  if (type === "text" && typeof record.text === "string") copy.push(normalizeText(record.text));
  else if (type === "linebreak" || type === "paragraph" || type === "heading" || type === "quote" || type === "listitem") copy.push(`<${type}>`);
  if (VISUAL_NODE.test(type) || (blockType && VISUAL_NODE.test(blockType))) {
    visuals.push(JSON.stringify({ type, blockType, value: idOf(record.value), fields: record.fields ?? null }));
    return;
  }
  if (type === "block" && record.fields && typeof record.fields === "object") copy.push(JSON.stringify(record.fields));
  if (Array.isArray(record.children)) for (const child of record.children) walkBody(child, copy, visuals);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function idOf(value: unknown): string {
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return value === null || value === undefined ? "" : String(value);
}

/** FNV-1a, 32-bit, hex: a stable short fingerprint, not a security boundary. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, "0");
}

export type ChangeCategory = "copy" | "visuals";

export function changedCategories(before: ApprovalFingerprint, after: ApprovalFingerprint): ChangeCategory[] {
  const changed: ChangeCategory[] = [];
  if (before.copy !== after.copy) changed.push("copy");
  if (before.visuals !== after.visuals) changed.push("visuals");
  return changed;
}

/** Whether an approval of `target` no longer holds after these changes, and why, in human terms. */
export function staleness(target: ReviewTarget, changed: readonly ChangeCategory[]): string | null {
  const copy = changed.includes("copy");
  const visuals = changed.includes("visuals");
  if (target === "copy" && copy) return "The text changed after this approval.";
  if (target === "visuals" && visuals) return "The visuals changed after this approval.";
  if (target === "whole" && (copy || visuals)) return copy && visuals ? "The text and visuals changed after this approval." : copy ? "The text changed after this approval." : "The visuals changed after this approval.";
  return null;
}

/** Human summary of what changed since a version, for "Changes since your last review". */
export function describeChanges(changed: readonly ChangeCategory[]): string {
  if (!changed.length) return "No changes to the text or visuals.";
  if (changed.length === 2) return "The text and the visuals changed.";
  return changed[0] === "copy" ? "The text changed. The visuals are the same." : "The visuals changed. The text is the same.";
}
