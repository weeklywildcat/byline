import { normalizeStep, workflowProblems, type NewsroomRoleScope, type RoleScopeMode, type WorkflowStep } from "./newsroom-roles";

/**
 * Editing Newsroom Roles and review workflows (docs/newsroom-roles.md): the
 * validation the server enforces and the editor's reordering, kept pure so the
 * Roles screen, the workflow builder and the tests share one set of rules.
 * Newsroom Roles are operational ("Sports Editor routes Sports review"); they
 * never grant access: Payload's security roles stay separate.
 */

export type AssignmentInput = { userId?: unknown; scopeMode?: unknown; sectionIds?: unknown; mediaTypes?: unknown };
export type CleanAssignment = { userId: number; scopeMode: RoleScopeMode; sectionIds: number[]; mediaTypes: string[] };

const positive = (value: unknown): number | null => (Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);
const unique = <T>(values: T[]) => [...new Set(values)];

/**
 * A role assignment as it will be stored, or the reasons it can't be. A role
 * that has no scope can only be global; a scoped assignment must name at least
 * one Section (section roles) or media type (media roles), and only the scope
 * its role has.
 */
export function cleanAssignment(
  role: { scopeKind: NewsroomRoleScope; name: string },
  input: AssignmentInput,
  valid: { sections: ReadonlySet<number>; mediaTypes: ReadonlySet<string> }
): { ok: true; value: CleanAssignment } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const userId = positive(input.userId);
  if (userId === null) problems.push("Choose a person.");
  const scopeMode: RoleScopeMode = input.scopeMode === "scoped" ? "scoped" : "global";
  const sectionIds = unique(Array.isArray(input.sectionIds) ? input.sectionIds.map(positive).filter((id): id is number => id !== null) : []);
  const mediaTypes = unique(Array.isArray(input.mediaTypes) ? input.mediaTypes.filter((type): type is string => typeof type === "string") : []);

  if (scopeMode === "scoped") {
    if (role.scopeKind === "none") problems.push(`${role.name} isn't scoped to Sections or media, so everyone in it covers everything.`);
    if (role.scopeKind === "section") {
      if (!sectionIds.length) problems.push("Choose at least one Section.");
      if (sectionIds.some((id) => !valid.sections.has(id))) problems.push("One of those Sections doesn't exist.");
      if (mediaTypes.length) problems.push(`${role.name} is scoped by Section, not media type.`);
    }
    if (role.scopeKind === "media") {
      if (!mediaTypes.length) problems.push("Choose at least one media type.");
      if (mediaTypes.some((type) => !valid.mediaTypes.has(type))) problems.push("One of those media types doesn't exist.");
      if (sectionIds.length) problems.push(`${role.name} is scoped by media type, not Section.`);
    }
  } else if (sectionIds.length || mediaTypes.length) {
    problems.push("A role that covers everything has no Sections or media types.");
  }
  if (problems.length || userId === null) return { ok: false, problems };
  return { ok: true, value: { userId, scopeMode, sectionIds: scopeMode === "scoped" ? sectionIds : [], mediaTypes: scopeMode === "scoped" ? mediaTypes : [] } };
}

/** Stable key from a role's name: "Sports Desk" becomes sports-desk. */
export function roleKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "role";
}

/**
 * The problems that stop a workflow being saved: shape problems plus steps
 * that point at a role that doesn't exist (or was archived) or at someone who
 * can't sign in. Failures at routing time are a different thing: they depend
 * on who is in each role this year, and show in the routing preview.
 */
export function workflowSaveProblems(
  steps: readonly WorkflowStep[],
  known: { roles: ReadonlyMap<number, { name: string; archived: boolean; scopeKind: NewsroomRoleScope }>; users: ReadonlySet<number>; sections: ReadonlySet<number> }
): string[] {
  const problems = workflowProblems(steps);
  for (const step of steps) {
    if (step.resolver === "role" && step.roleId !== null) {
      const role = known.roles.get(step.roleId);
      if (!role) problems.push(`${step.label} uses a newsroom role that doesn't exist.`);
      else if (role.archived) problems.push(`${step.label} uses ${role.name}, which is archived.`);
      else if (step.roleMatch === "story-section" && role.scopeKind !== "section") problems.push(`${step.label} matches the Story's Section, but ${role.name} isn't scoped by Section.`);
      else if (step.roleMatch === "story-media" && role.scopeKind !== "media") problems.push(`${step.label} matches the Story's media, but ${role.name} isn't scoped by media type.`);
    }
    if (step.resolver === "person" && step.userId !== null && !known.users.has(step.userId)) problems.push(`${step.label} is routed to someone who can't sign in.`);
    for (const section of step.conditions.sections) if (!known.sections.has(section)) problems.push(`${step.label} refers to a Section that doesn't exist.`);
  }
  return problems;
}

/** A client's raw steps as stored steps: invalid ones are rejected with their position, not silently dropped. */
export function parseSteps(raw: unknown): { steps: WorkflowStep[]; problems: string[] } {
  if (!Array.isArray(raw)) return { steps: [], problems: ["Steps must be a list."] };
  const steps: WorkflowStep[] = [];
  const problems: string[] = [];
  raw.forEach((candidate, index) => {
    const step = normalizeStep(candidate);
    if (step) steps.push(step);
    else problems.push(`Step ${index + 1} needs a name.`);
  });
  return { steps, problems };
}

/** Move one step to a new position. Out-of-range moves leave the order alone. */
export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return [...steps];
  const next = [...steps];
  const [step] = next.splice(from, 1);
  next.splice(to, 0, step as T);
  return next;
}

/** A step id not used yet: "step-2", "step-3"… */
export function newStepId(steps: readonly Pick<WorkflowStep, "stepId">[]): string {
  const used = new Set(steps.map((step) => step.stepId));
  for (let n = steps.length + 1; ; n += 1) if (!used.has(`step-${n}`)) return `step-${n}`;
}

export function blankStep(steps: readonly Pick<WorkflowStep, "stepId">[]): WorkflowStep {
  return {
    stepId: newStepId(steps),
    label: "New step",
    target: "whole",
    resolver: "story-editor",
    roleId: null,
    roleMatch: "any",
    userId: null,
    conditions: { sections: [], formats: [], onlyWithVisuals: false, mediaTypes: [] },
    selfReview: "exclude-writers",
    fallback: "none"
  };
}
