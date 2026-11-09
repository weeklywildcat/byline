/**
 * Newsroom Roles and review routing (docs/newsroom-roles.md).
 *
 * Pure: the server loads roles, assignments, the active school year and the
 * Story's facts, and these functions decide. Production submission and the
 * workflow builder's "Preview with Story…" call exactly the same
 * `resolveWorkflow` / `resolveStep`, so a preview never disagrees with what
 * submitting would do.
 *
 * Resolution is deterministic. Nobody is ever chosen at random: one eligible
 * reviewer is assigned; several form a role queue anyone in it may claim; none
 * is a routing failure with a reason an editor can fix.
 */

export const SCHOOL_YEAR_STATUSES = ["planned", "active", "archived"] as const;
export type SchoolYearStatus = (typeof SCHOOL_YEAR_STATUSES)[number];

/** What a role's assignments may be scoped to. */
export const NEWSROOM_ROLE_SCOPES = ["none", "section", "media"] as const;
export type NewsroomRoleScope = (typeof NEWSROOM_ROLE_SCOPES)[number];

export const ROLE_SCOPE_MODES = ["global", "scoped"] as const;
export type RoleScopeMode = (typeof ROLE_SCOPE_MODES)[number];

export const REVIEW_TARGETS = ["whole", "copy", "visuals"] as const;
export type ReviewTarget = (typeof REVIEW_TARGETS)[number];
export const REVIEW_TARGET_LABELS: Record<ReviewTarget, string> = { whole: "Whole story", copy: "Copy", visuals: "Visuals" };

export const RESOLVER_TYPES = ["story-editor", "role", "person"] as const;
export type ResolverType = (typeof RESOLVER_TYPES)[number];

/** For a role step: which of the role's scoped assignments apply to a Story. */
export const ROLE_MATCHES = ["story-section", "story-media", "any"] as const;
export type RoleMatch = (typeof ROLE_MATCHES)[number];

export const SELF_REVIEW_POLICIES = ["exclude-writers", "allow"] as const;
export type SelfReviewPolicy = (typeof SELF_REVIEW_POLICIES)[number];

export const STEP_FALLBACKS = ["none", "editors"] as const;
export type StepFallback = (typeof STEP_FALLBACKS)[number];

/** The newsroom's default roles, created once by the migration with no members. */
export const DEFAULT_NEWSROOM_ROLES = [
  { key: "section-editor", name: "Section Editor", description: "Edits stories in their sections first.", scopeKind: "section", waitingLabel: "{scope} Editor" },
  { key: "copy-desk", name: "Copy Desk", description: "Checks copy: style, spelling, facts in the text.", scopeKind: "none", waitingLabel: null },
  { key: "visual-desk", name: "Visual Desk", description: "Reviews photos, video and graphics.", scopeKind: "media", waitingLabel: null },
  { key: "final-review", name: "Final Review", description: "The last read before a story is ready.", scopeKind: "none", waitingLabel: null }
] as const satisfies ReadonlyArray<{ key: string; name: string; description: string; scopeKind: NewsroomRoleScope; waitingLabel: string | null }>;

/* ------------------------------------------------------------------ types */

export type RoutingStory = {
  id: number;
  title: string;
  sectionId: number | null;
  sectionName: string | null;
  format: string;
  /** A lead image, media in the body, a video, or media work on the Story. */
  hasVisuals: boolean;
  /** Media types the Story carries (photo, video, graphic…), from its media work and video. */
  mediaTypes: string[];
  editorId: number | null;
  /** Byline accounts and the Story's creator: who "self-review" means. */
  writerIds: number[];
};

export type StepConditions = { sections: number[]; formats: string[]; onlyWithVisuals: boolean; mediaTypes: string[] };

export type WorkflowStep = {
  stepId: string;
  label: string;
  target: ReviewTarget;
  resolver: ResolverType;
  roleId: number | null;
  roleMatch: RoleMatch;
  userId: number | null;
  conditions: StepConditions;
  selfReview: SelfReviewPolicy;
  fallback: StepFallback;
};

export type ReviewWorkflowDef = {
  id: number;
  name: string;
  isDefault: boolean;
  archived: boolean;
  appliesTo: { sections: number[]; formats: string[] };
  steps: WorkflowStep[];
};

export type RoleDef = { id: number; key: string; name: string; scopeKind: NewsroomRoleScope; waitingLabel: string | null; archived: boolean };

export type RoleAssignmentDef = { id: number; roleId: number; userId: number; yearId: number; scopeMode: RoleScopeMode; sectionIds: number[]; mediaTypes: string[] };

export type RoutingDirectory = {
  roles: ReadonlyMap<number, RoleDef>;
  assignments: readonly RoleAssignmentDef[];
  /** Enabled accounts only: a disabled account never receives a review. */
  users: ReadonlyMap<number, { id: number; name: string; role: "staff" | "editor" | "administrator" }>;
  sections: ReadonlyMap<number, string>;
  year: { id: number; name: string } | null;
};

export type StepResolution =
  | { kind: "skipped"; reason: string }
  | { kind: "person"; userId: number; name: string; waitingFor: string; via: string }
  | { kind: "queue"; userIds: number[]; waitingFor: string; via: string; roleId: number | null }
  | { kind: "failed"; failure: string; fix: RoutingFix };

/** What an editor should open to fix a failure. */
export type RoutingFix = { kind: "role"; roleId: number } | { kind: "workflow"; workflowId?: number } | { kind: "story-editor" } | { kind: "school-year" };

export type ResolvedStep = { step: WorkflowStep; resolution: StepResolution };

/* -------------------------------------------------------------- selection */

/**
 * Which workflow a Story uses: the most specific active workflow whose
 * "applies to" matches (sections and formats both count), then the default.
 * Ties go to the lower id, so the answer never depends on load order.
 */
export function selectWorkflow(workflows: readonly ReviewWorkflowDef[], story: RoutingStory): ReviewWorkflowDef | null {
  const live = workflows.filter((workflow) => !workflow.archived && workflow.steps.length > 0);
  const matching = live
    .filter((workflow) => specificity(workflow) > 0)
    .filter((workflow) => matches(workflow.appliesTo.sections, story.sectionId) && matchesText(workflow.appliesTo.formats, story.format))
    .sort((a, b) => specificity(b) - specificity(a) || a.id - b.id);
  if (matching[0]) return matching[0];
  return live.filter((workflow) => workflow.isDefault).sort((a, b) => a.id - b.id)[0] ?? null;
}

const specificity = (workflow: ReviewWorkflowDef) => (workflow.appliesTo.sections.length ? 2 : 0) + (workflow.appliesTo.formats.length ? 1 : 0);
const matches = (allowed: readonly number[], value: number | null) => allowed.length === 0 || (value !== null && allowed.includes(value));
const matchesText = (allowed: readonly string[], value: string) => allowed.length === 0 || allowed.includes(value);

/** Why a step does not apply to this Story, or null when it does. */
export function stepSkipReason(step: WorkflowStep, story: RoutingStory, directory: Pick<RoutingDirectory, "sections">): string | null {
  const { conditions } = step;
  if (conditions.onlyWithVisuals && !story.hasVisuals) return "Only for stories with visuals";
  if (conditions.sections.length && !matches(conditions.sections, story.sectionId)) {
    const names = conditions.sections.map((id) => directory.sections.get(id)).filter(Boolean);
    return `Only for ${names.length ? names.join(", ") : "other sections"}`;
  }
  if (conditions.formats.length && !matchesText(conditions.formats, story.format)) return `Only for ${conditions.formats.join(", ")} stories`;
  if (conditions.mediaTypes.length && !conditions.mediaTypes.some((type) => story.mediaTypes.includes(type))) return `Only for stories with ${conditions.mediaTypes.join(" or ")}`;
  return null;
}

/* ------------------------------------------------------------- resolution */

function eligible(ids: readonly number[], step: WorkflowStep, story: RoutingStory, directory: RoutingDirectory): number[] {
  const unique = [...new Set(ids)].filter((id) => directory.users.has(id));
  const filtered = step.selfReview === "allow" ? unique : unique.filter((id) => !story.writerIds.includes(id));
  return filtered.sort((a, b) => a - b);
}

function result(ids: number[], waitingFor: string, via: string, directory: RoutingDirectory, roleId: number | null): StepResolution {
  if (ids.length === 1) return { kind: "person", userId: ids[0]!, name: directory.users.get(ids[0]!)!.name, waitingFor, via };
  return { kind: "queue", userIds: ids, waitingFor, via, roleId };
}

function fallbackToEditors(step: WorkflowStep, story: RoutingStory, directory: RoutingDirectory, failure: string, fix: RoutingFix): StepResolution {
  if (step.fallback !== "editors") return { kind: "failed", failure, fix };
  const editors = eligible([...directory.users.values()].filter((user) => user.role !== "staff").map((user) => user.id), step, story, directory);
  if (!editors.length) return { kind: "failed", failure, fix };
  return result(editors, "an editor", "Editors (fallback)", directory, null);
}

/**
 * Who reviews one step for one Story right now. Scoped role assignments win
 * over global ones (Jeremy → Sports beats Maycie → everywhere); global
 * assignments are the fallback for a section nobody covers.
 */
export function resolveStep(step: WorkflowStep, story: RoutingStory, directory: RoutingDirectory): StepResolution {
  const skip = stepSkipReason(step, story, directory);
  if (skip) return { kind: "skipped", reason: skip };

  if (step.resolver === "person") {
    const user = step.userId === null ? undefined : directory.users.get(step.userId);
    if (!user) return fallbackToEditors(step, story, directory, `${step.label} is routed to someone who can no longer sign in.`, { kind: "workflow" });
    const ids = eligible([user.id], step, story, directory);
    if (!ids.length) return fallbackToEditors(step, story, directory, `${user.name} wrote this story and can't review it.`, { kind: "workflow" });
    return result(ids, user.name, user.name, directory, null);
  }

  if (step.resolver === "story-editor") {
    const user = story.editorId === null ? undefined : directory.users.get(story.editorId);
    if (!user) return fallbackToEditors(step, story, directory, "This story has no assigned editor.", { kind: "story-editor" });
    const ids = eligible([user.id], step, story, directory);
    if (!ids.length) return fallbackToEditors(step, story, directory, `${user.name} wrote this story and can't edit it.`, { kind: "story-editor" });
    return result(ids, user.name, "Story editor", directory, null);
  }

  const role = step.roleId === null ? undefined : directory.roles.get(step.roleId);
  if (!role || role.archived) return { kind: "failed", failure: `${step.label} uses a newsroom role that no longer exists.`, fix: { kind: "workflow" } };
  if (!directory.year) return { kind: "failed", failure: "There is no active school year.", fix: { kind: "school-year" } };
  const current = directory.assignments.filter((assignment) => assignment.roleId === role.id && assignment.yearId === directory.year!.id);
  const scoped = current.filter((assignment) => assignment.scopeMode === "scoped");
  const global = current.filter((assignment) => assignment.scopeMode === "global");

  let scopeName: string | null = null;
  let chosen: RoleAssignmentDef[] = [];
  if (step.roleMatch === "story-section" && story.sectionId !== null) {
    chosen = scoped.filter((assignment) => assignment.sectionIds.includes(story.sectionId!));
    if (chosen.length) scopeName = story.sectionName;
  } else if (step.roleMatch === "story-media" && story.mediaTypes.length) {
    const ordered = [...story.mediaTypes].sort();
    for (const type of ordered) {
      chosen = scoped.filter((assignment) => assignment.mediaTypes.includes(type));
      if (chosen.length) {
        scopeName = type.charAt(0).toUpperCase() + type.slice(1);
        break;
      }
    }
  } else if (step.roleMatch === "any") {
    chosen = scoped;
  }

  const waitingLabel = (scope: string | null) => (scope && role.waitingLabel ? role.waitingLabel.replace("{scope}", scope) : role.name);
  const scopedIds = eligible(chosen.map((assignment) => assignment.userId), step, story, directory);
  if (scopedIds.length) return result(scopedIds, waitingLabel(scopeName), `${role.name}${scopeName ? ` · ${scopeName}` : ""}`, directory, role.id);
  const globalIds = eligible(global.map((assignment) => assignment.userId), step, story, directory);
  if (globalIds.length) return result(globalIds, role.name, role.name, directory, role.id);

  const where = step.roleMatch === "story-section" ? story.sectionName ?? "This story's section" : null;
  const failure = where
    ? `${where} has no active ${role.name} for ${directory.year.name}.`
    : `${role.name} has no active members for ${directory.year.name}.`;
  return fallbackToEditors(step, story, directory, failure, { kind: "role", roleId: role.id });
}

/** Every step of a workflow for a Story: the routing preview, and what submission snapshots. */
export function resolveWorkflow(workflow: ReviewWorkflowDef, story: RoutingStory, directory: RoutingDirectory): ResolvedStep[] {
  return workflow.steps.map((step) => ({ step, resolution: resolveStep(step, story, directory) }));
}

/** The first step at or after `from` that applies to the Story, or -1 when none remain. */
export function nextApplicableStep(steps: readonly WorkflowStep[], from: number, story: RoutingStory, directory: RoutingDirectory): number {
  for (let index = from; index < steps.length; index += 1) {
    if (!stepSkipReason(steps[index]!, story, directory)) return index;
  }
  return -1;
}

/* ---------------------------------------------------------- normalization */

/** A stored workflow step (JSON from the collection or a client) as a valid step, or null. */
export function normalizeStep(value: unknown): WorkflowStep | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const stepId = typeof raw.stepId === "string" && /^[a-z0-9-]{1,40}$/.test(raw.stepId) ? raw.stepId : null;
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
  if (!stepId || !label) return null;
  const pick = <T extends string>(list: readonly T[], candidate: unknown, fallback: T): T => (list as readonly unknown[]).includes(candidate) ? (candidate as T) : fallback;
  const numbers = (list: unknown) => Array.isArray(list) ? [...new Set(list.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))] : [];
  const strings = (list: unknown) => Array.isArray(list) ? [...new Set(list.filter((item): item is string => typeof item === "string" && /^[a-z-]{1,30}$/.test(item)))] : [];
  const conditions = (raw.conditions ?? {}) as Record<string, unknown>;
  const id = (candidate: unknown) => (Number.isSafeInteger(Number(candidate)) && Number(candidate) > 0 ? Number(candidate) : null);
  return {
    stepId,
    label,
    target: pick(REVIEW_TARGETS, raw.target, "whole"),
    resolver: pick(RESOLVER_TYPES, raw.resolver, "story-editor"),
    roleId: id(raw.roleId),
    roleMatch: pick(ROLE_MATCHES, raw.roleMatch, "any"),
    userId: id(raw.userId),
    conditions: { sections: numbers(conditions.sections), formats: strings(conditions.formats), onlyWithVisuals: conditions.onlyWithVisuals === true, mediaTypes: strings(conditions.mediaTypes) },
    selfReview: pick(SELF_REVIEW_POLICIES, raw.selfReview, "exclude-writers"),
    fallback: pick(STEP_FALLBACKS, raw.fallback, "none")
  };
}

/** Problems an editor must fix before a workflow can be saved. */
export function workflowProblems(steps: readonly WorkflowStep[]): string[] {
  const problems: string[] = [];
  if (!steps.length) problems.push("Add at least one review step.");
  const ids = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.stepId)) problems.push(`Two steps share the id ${step.stepId}.`);
    ids.add(step.stepId);
    if (step.resolver === "role" && step.roleId === null) problems.push(`Choose a newsroom role for ${step.label}.`);
    if (step.resolver === "person" && step.userId === null) problems.push(`Choose a person for ${step.label}.`);
  }
  return problems;
}

/** The school year that contains a day, as "2026–27" (school years start in August). */
export function schoolYearFor(day: string): { name: string; startsOn: string; endsOn: string } {
  const [year, month] = day.split("-").map(Number) as [number, number];
  const start = month >= 8 ? year : year - 1;
  return { name: `${start}–${String((start + 1) % 100).padStart(2, "0")}`, startsOn: `${start}-08-01`, endsOn: `${start + 1}-07-31` };
}

/** The default workflow's steps: the Story's editor, falling back to the editors' queue. */
export const DEFAULT_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    stepId: "edit",
    label: "Edit",
    target: "whole",
    resolver: "story-editor",
    roleId: null,
    roleMatch: "any",
    userId: null,
    conditions: { sections: [], formats: [], onlyWithVisuals: false, mediaTypes: [] },
    selfReview: "exclude-writers",
    fallback: "editors"
  }
];
