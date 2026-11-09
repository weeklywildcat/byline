/**
 * A Story's visible lifecycle (docs/story-lifecycle.md).
 *
 * Reporters see five phases — Pitch, Reporting, Drafting, Review, Ready — plus
 * two sidelined exceptions (On Hold, Dropped). Published is never a phase
 * anyone chooses: it is derived from the Story's publication state.
 *
 * Storage keeps the older workflow values (`story-plans.workflow`, the
 * WordPress `ww_*` meta, saved filters and history all use them), so this file
 * is a projection, not a migration:
 *
 *   pitch → Pitch · assigned, reporting → Reporting · writing → Drafting ·
 *   editing → Review · ready → Ready · on-hold → On Hold · dropped → Dropped
 *
 * New writes use one canonical stored value per phase; `assigned` is never
 * written again (assignment is an attribute, not a phase). Every reader and
 * every incoming phase id goes through `lifecyclePhase` / `storedStage`, so an
 * old link, saved view or API caller that still says `writing` keeps working.
 */

export const LIFECYCLE_PHASES = ["pitch", "reporting", "drafting", "review", "ready"] as const;
export const SIDELINED_PHASES = ["on-hold", "dropped"] as const;
export type MainPhase = (typeof LIFECYCLE_PHASES)[number];
export type SidelinedPhase = (typeof SIDELINED_PHASES)[number];
export type LifecyclePhase = MainPhase | SidelinedPhase;
export type EffectivePhase = LifecyclePhase | "published";

/** The stored workflow values (Payload `story-plans.workflow`, WordPress workflow meta). */
export const STORED_STAGES = ["pitch", "assigned", "reporting", "writing", "editing", "ready", "on-hold", "dropped"] as const;
export type StoredStage = (typeof STORED_STAGES)[number];

export const PHASE_LABELS: Record<EffectivePhase, string> = {
  pitch: "Pitch",
  reporting: "Reporting",
  drafting: "Drafting",
  review: "Review",
  ready: "Ready",
  "on-hold": "On Hold",
  dropped: "Dropped",
  published: "Published"
};

const FROM_STORED: Record<StoredStage, LifecyclePhase> = {
  pitch: "pitch",
  assigned: "reporting",
  reporting: "reporting",
  writing: "drafting",
  editing: "review",
  ready: "ready",
  "on-hold": "on-hold",
  dropped: "dropped"
};

const TO_STORED: Record<LifecyclePhase, StoredStage> = {
  pitch: "pitch",
  reporting: "reporting",
  drafting: "writing",
  review: "editing",
  ready: "ready",
  "on-hold": "on-hold",
  dropped: "dropped"
};

/** Old ids that still arrive from links, saved views and API callers. `ready-for-review` is WordPress's. */
const ALIASES: Record<string, LifecyclePhase> = { ...FROM_STORED, drafting: "drafting", review: "review", "ready-for-review": "review" };

export function isLifecyclePhase(value: unknown): value is LifecyclePhase {
  return typeof value === "string" && ((LIFECYCLE_PHASES as readonly string[]).includes(value) || (SIDELINED_PHASES as readonly string[]).includes(value));
}

export function isStoredStage(value: unknown): value is StoredStage {
  return typeof value === "string" && (STORED_STAGES as readonly string[]).includes(value);
}

/** Any phase id or stored/legacy stage id → the phase it means, or null when it means nothing. */
export function phaseFromId(value: unknown): LifecyclePhase | null {
  return typeof value === "string" && Object.hasOwn(ALIASES, value) ? ALIASES[value]! : null;
}

/**
 * The phase a Story reads as. A published Story reads Published; the stored
 * stage stays put, so unpublishing recovers it. A missing or unknown stage
 * reads as Pitch, and nothing writes that default back.
 */
export function lifecyclePhase(stored: unknown, publicationStatus?: unknown): EffectivePhase {
  if (publicationStatus === "published") return "published";
  return phaseFromId(stored) ?? "pitch";
}

/** The canonical stored value for a phase (or for any id `phaseFromId` understands). */
export function storedStage(phase: unknown): StoredStage | null {
  const resolved = phaseFromId(phase);
  return resolved ? TO_STORED[resolved] : null;
}

export function phaseLabel(phase: EffectivePhase): string {
  return PHASE_LABELS[phase];
}

export function isSidelined(phase: EffectivePhase): phase is SidelinedPhase {
  return phase === "on-hold" || phase === "dropped";
}

export type PhaseStatus = { id: EffectivePhase; label: string; group: "main" | "sidelined" | "derived"; selectable: boolean };

/** The phases as Planning/Board columns: five main, two sidelined, Published derived. */
export const PHASE_STATUSES: readonly PhaseStatus[] = [
  ...LIFECYCLE_PHASES.map((id) => ({ id, label: PHASE_LABELS[id], group: "main" as const, selectable: true })),
  ...SIDELINED_PHASES.map((id) => ({ id, label: PHASE_LABELS[id], group: "sidelined" as const, selectable: true })),
  { id: "published", label: "Published", group: "derived", selectable: false }
];

/**
 * The one normal next step for a phase, as reporters see it. Review's step
 * depends on the review run (Waiting for…, Changes requested, Resubmit), so it
 * is decided by the review state, not here.
 */
export type LifecycleAction = "accept-pitch" | "start-drafting" | "submit-for-review" | "publish";

export const LIFECYCLE_ACTION_LABELS: Record<LifecycleAction, string> = {
  "accept-pitch": "Accept pitch",
  "start-drafting": "Start drafting",
  "submit-for-review": "Submit for review",
  publish: "Publish"
};

/**
 * Semantic transitions that are not review. Each says which phases it starts
 * from and where it goes. Submit/resubmit/approve live in the review engine,
 * which moves the Story into Review and Ready itself.
 */
export const LIFECYCLE_TRANSITIONS: Record<"accept-pitch" | "start-drafting" | "put-on-hold" | "drop" | "resume", { from: readonly LifecyclePhase[]; to: LifecyclePhase | "previous" }> = {
  "accept-pitch": { from: ["pitch"], to: "reporting" },
  "start-drafting": { from: ["pitch", "reporting"], to: "drafting" },
  "put-on-hold": { from: ["pitch", "reporting", "drafting", "review", "ready"], to: "on-hold" },
  drop: { from: ["pitch", "reporting", "drafting", "review", "ready", "on-hold"], to: "dropped" },
  resume: { from: ["on-hold", "dropped"], to: "previous" }
};
export type LifecycleTransition = keyof typeof LIFECYCLE_TRANSITIONS;

/**
 * Whether a Story's workflow id matches a filter id. Saved views and links
 * made before the projection still say `writing`/`editing`; those match the
 * Drafting/Review phases. WordPress ids compare exactly, as before.
 */
export function workflowMatches(storyWorkflowId: string, filterId: string): boolean {
  if (storyWorkflowId === filterId) return true;
  return (storyWorkflowId === "drafting" || storyWorkflowId === "review") && phaseFromId(filterId) === storyWorkflowId;
}
