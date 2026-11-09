import { APIError } from "payload";
import { atLeast, relationId } from "../access/user";
import { inTransaction, lockRow } from "../db/locks";
import { cleanAssignment, parseSteps, roleKey, workflowSaveProblems, type AssignmentInput } from "../domain/role-admin";
import { NEWSROOM_ROLE_SCOPES, type NewsroomRoleScope, type ResolvedStep, type ReviewWorkflowDef, type RoleScopeMode, type StepResolution, type WorkflowStep } from "../domain/newsroom-roles";
import { PRODUCTION_TYPE_OPTIONS, STORY_FORMAT_OPTIONS } from "../domain/vocabulary";
import { activeYear, routeStory, workflowDef } from "./routing";
import type { ScreenContext } from "./screen-models";

/**
 * Editing Newsroom Roles, their members and review workflows, and the routing
 * preview (docs/newsroom-roles.md). Editors only; the collections refuse every
 * other write. A Newsroom Role is operational (who reviews Sports); it grants
 * no access, which stays with Payload's security roles.
 *
 * Each write locks the row it changes and compares the revision the editor
 * saw, so two editors can't silently overwrite each other.
 */

const system = { overrideAccess: true as const, depth: 0 };

function requireEditor(ctx: ScreenContext): void {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors manage newsroom roles and review workflows.", 403);
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

/* ------------------------------------------------------------------ views */

export type RoleMember = {
  id: number;
  userId: number;
  name: string;
  scopeMode: RoleScopeMode;
  sectionIds: number[];
  sections: string[];
  mediaTypes: string[];
};

export type RoleRow = {
  id: number;
  key: string;
  name: string;
  description: string;
  scopeKind: NewsroomRoleScope;
  waitingLabel: string;
  archived: boolean;
  revision: number;
  members: RoleMember[];
  /** Active workflows with a step that routes to this role. */
  usedBy: Array<{ id: number; name: string }>;
};

export type DirectoryPerson = { id: number; name: string; role: "staff" | "editor" | "administrator" };

export type RolesOverview = {
  year: { id: number; name: string } | null;
  roles: RoleRow[];
  people: DirectoryPerson[];
  sections: Array<{ id: number; name: string }>;
  mediaTypes: Array<{ value: string; label: string }>;
};

async function directory(ctx: ScreenContext) {
  const [users, sections] = await Promise.all([
    ctx.req.payload.find({ collection: "users", where: { enabled: { not_equals: false } }, select: { name: true, role: true }, sort: "name", pagination: false, ...system, req: ctx.req }),
    ctx.req.payload.find({ collection: "sections", select: { name: true }, sort: "name", pagination: false, ...system, req: ctx.req })
  ]);
  return {
    people: users.docs.map((user): DirectoryPerson => ({ id: user.id, name: user.name, role: user.role })),
    sections: sections.docs.map((section) => ({ id: section.id, name: section.name }))
  };
}

export async function rolesOverview(ctx: ScreenContext): Promise<RolesOverview> {
  requireEditor(ctx);
  const [year, found, flows, people] = await Promise.all([
    activeYear(ctx.req),
    ctx.req.payload.find({ collection: "newsroom-roles", sort: "name", pagination: false, ...system, req: ctx.req }),
    ctx.req.payload.find({ collection: "review-workflows", where: { archived: { not_equals: true } }, sort: "id", pagination: false, ...system, req: ctx.req }),
    directory(ctx)
  ]);
  const assignments = year ? await ctx.req.payload.find({ collection: "role-assignments", where: { schoolYear: { equals: year.id } }, pagination: false, ...system, req: ctx.req }) : { docs: [] };
  const names = new Map(people.people.map((person) => [person.id, person.name]));
  const sectionNames = new Map(people.sections.map((section) => [section.id, section.name]));
  const usedBy = new Map<number, Array<{ id: number; name: string }>>();
  for (const flow of flows.docs) {
    for (const step of workflowDef(flow).steps) {
      if (step.resolver !== "role" || step.roleId === null) continue;
      const list = usedBy.get(step.roleId) ?? [];
      if (!list.some((entry) => entry.id === flow.id)) list.push({ id: flow.id, name: flow.name });
      usedBy.set(step.roleId, list);
    }
  }
  const roles = found.docs.map((role): RoleRow => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description ?? "",
    scopeKind: role.scopeKind,
    waitingLabel: role.waitingLabel ?? "",
    archived: Boolean(role.archived),
    revision: role.revision ?? 1,
    usedBy: usedBy.get(role.id) ?? [],
    members: assignments.docs
      .filter((row) => Number(relationId(row.role)) === role.id)
      .map((row): RoleMember => {
        const userId = Number(relationId(row.user));
        const sectionIds = (Array.isArray(row.sections) ? row.sections : []).map((section) => Number(relationId(section)));
        return {
          id: row.id,
          userId,
          name: names.get(userId) ?? "Former staff",
          scopeMode: row.scopeMode,
          sectionIds,
          sections: sectionIds.map((id) => sectionNames.get(id) ?? "Removed section"),
          mediaTypes: [...(row.mediaTypes ?? [])]
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
  }));
  return { year, roles, people: people.people, sections: people.sections, mediaTypes: PRODUCTION_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })) };
}

/* ------------------------------------------------------------------ roles */

export type RoleInput = { name?: unknown; description?: unknown; scopeKind?: unknown; waitingLabel?: unknown; archived?: unknown; expectedRevision?: unknown };

async function uniqueKey(ctx: ScreenContext, name: string): Promise<string> {
  const base = roleKey(name);
  const taken = new Set((await ctx.req.payload.find({ collection: "newsroom-roles", select: { key: true }, pagination: false, ...system, req: ctx.req })).docs.map((role) => role.key));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base.slice(0, 56)}-${n}`)) return `${base.slice(0, 56)}-${n}`;
}

/** Create a role (id null) or change one. Returns the fresh overview. */
export async function saveRole(ctx: ScreenContext, id: number | null, input: RoleInput): Promise<RolesOverview> {
  requireEditor(ctx);
  const name = text(input.name, 80);
  if (id === null || input.name !== undefined) if (!name) throw new APIError("Give the role a name.", 422, { problems: ["Give the role a name."] });
  const scopeKind = NEWSROOM_ROLE_SCOPES.find((kind) => kind === input.scopeKind);
  if (id === null) {
    const key = await uniqueKey(ctx, name);
    await ctx.req.payload.create({ collection: "newsroom-roles", data: { key, name, description: text(input.description, 400), scopeKind: scopeKind ?? "none", waitingLabel: text(input.waitingLabel, 80) || null, archived: false, revision: 1 }, ...system, req: ctx.req });
    return rolesOverview(ctx);
  }

  await inTransaction(ctx.req, async () => {
    await lockRow(ctx.req, "newsroom_roles", id);
    const role = await ctx.req.payload.findByID({ collection: "newsroom-roles", id, ...system, req: ctx.req }).catch(() => null);
    if (!role) throw new APIError("Unknown role.", 404);
    if (typeof input.expectedRevision === "number" && input.expectedRevision !== (role.revision ?? 1)) throw new APIError("Someone else changed this role. Reload and try again.", 409);
    const data: Record<string, unknown> = { revision: (role.revision ?? 1) + 1 };
    if (input.name !== undefined) data.name = name;
    if (input.description !== undefined) data.description = text(input.description, 400);
    if (input.waitingLabel !== undefined) data.waitingLabel = text(input.waitingLabel, 80) || null;
    if (scopeKind && scopeKind !== role.scopeKind) {
      const members = await ctx.req.payload.count({ collection: "role-assignments", where: { and: [{ role: { equals: id } }, { scopeMode: { equals: "scoped" } }] }, overrideAccess: true, req: ctx.req });
      if (members.totalDocs > 0) throw new APIError("Remove this role's scoped members before changing what it is scoped to.", 422, { problems: ["Remove this role's scoped members before changing what it is scoped to."] });
      data.scopeKind = scopeKind;
    }
    if (typeof input.archived === "boolean" && input.archived !== Boolean(role.archived)) {
      if (input.archived) {
        const flows = (await ctx.req.payload.find({ collection: "review-workflows", where: { archived: { not_equals: true } }, pagination: false, ...system, req: ctx.req })).docs;
        const using = flows.filter((flow) => workflowDef(flow).steps.some((step) => step.resolver === "role" && step.roleId === id));
        if (using.length) {
          const message = `${role.name} is used by ${using.map((flow) => flow.name).join(", ")}. Change the workflow first.`;
          throw new APIError(message, 422, { problems: [message] });
        }
      }
      data.archived = input.archived;
    }
    await ctx.req.payload.update({ collection: "newsroom-roles", id, data, ...system, req: ctx.req });
  });
  return rolesOverview(ctx);
}

/* ------------------------------------------------------------ memberships */

async function validity(ctx: ScreenContext) {
  const known = await directory(ctx);
  return {
    people: new Set(known.people.map((person) => person.id)),
    sections: new Set(known.sections.map((section) => section.id)),
    mediaTypes: new Set<string>(PRODUCTION_TYPE_OPTIONS.map((option) => option.value))
  };
}

/** Add (assignmentId null) or change a person's membership in a role for the active school year. */
export async function saveAssignment(ctx: ScreenContext, roleId: number, assignmentId: number | null, input: AssignmentInput): Promise<RolesOverview> {
  requireEditor(ctx);
  const year = await activeYear(ctx.req);
  if (!year) throw new APIError("There is no active school year. Start one before adding people to roles.", 422, { problems: ["There is no active school year."] });
  const known = await validity(ctx);
  await inTransaction(ctx.req, async () => {
    await lockRow(ctx.req, "newsroom_roles", roleId);
    const role = await ctx.req.payload.findByID({ collection: "newsroom-roles", id: roleId, ...system, req: ctx.req }).catch(() => null);
    if (!role) throw new APIError("Unknown role.", 404);
    if (role.archived) throw new APIError(`${role.name} is archived.`, 422, { problems: [`${role.name} is archived.`] });
    const clean = cleanAssignment(role, input, known);
    if (!clean.ok) throw new APIError(clean.problems[0] ?? "That membership isn't valid.", 422, { problems: clean.problems });
    if (!known.people.has(clean.value.userId)) throw new APIError("That person can't sign in, so they can't review.", 422, { problems: ["That person can't sign in, so they can't review."] });

    let current = null;
    if (assignmentId !== null) {
      current = await ctx.req.payload.findByID({ collection: "role-assignments", id: assignmentId, ...system, req: ctx.req }).catch(() => null);
      if (!current || Number(relationId(current.role)) !== roleId) throw new APIError("Unknown membership.", 404);
      // Only this year's memberships are editable: earlier years are history.
      if (Number(relationId(current.schoolYear)) !== year.id) throw new APIError("That membership belongs to an earlier school year, which is kept as history.", 422);
    }
    const existing = await ctx.req.payload.find({ collection: "role-assignments", where: { and: [{ role: { equals: roleId } }, { user: { equals: clean.value.userId } }, { schoolYear: { equals: year.id } }] }, limit: 1, ...system, req: ctx.req });
    const duplicate = existing.docs[0];
    if (duplicate && duplicate.id !== assignmentId) throw new APIError("They're already in this role. Edit their membership instead.", 409);
    const data = { role: roleId, user: clean.value.userId, schoolYear: year.id, scopeMode: clean.value.scopeMode, sections: clean.value.sectionIds, mediaTypes: clean.value.mediaTypes } as never;
    if (current && assignmentId !== null) await ctx.req.payload.update({ collection: "role-assignments", id: assignmentId, data, ...system, req: ctx.req });
    else await ctx.req.payload.create({ collection: "role-assignments", data, ...system, req: ctx.req });
    await ctx.req.payload.update({ collection: "newsroom-roles", id: roleId, data: { revision: (role.revision ?? 1) + 1 }, ...system, req: ctx.req });
  });
  return rolesOverview(ctx);
}

export async function removeAssignment(ctx: ScreenContext, assignmentId: number): Promise<RolesOverview> {
  requireEditor(ctx);
  const year = await activeYear(ctx.req);
  const row = await ctx.req.payload.findByID({ collection: "role-assignments", id: assignmentId, ...system, req: ctx.req }).catch(() => null);
  if (!row) throw new APIError("Unknown membership.", 404);
  if (!year || Number(relationId(row.schoolYear)) !== year.id) throw new APIError("That membership belongs to an earlier school year, which is kept as history.", 422);
  await inTransaction(ctx.req, async () => {
    const roleId = Number(relationId(row.role));
    await lockRow(ctx.req, "newsroom_roles", roleId);
    await ctx.req.payload.delete({ collection: "role-assignments", id: assignmentId, ...system, req: ctx.req });
    const role = await ctx.req.payload.findByID({ collection: "newsroom-roles", id: roleId, ...system, req: ctx.req });
    await ctx.req.payload.update({ collection: "newsroom-roles", id: roleId, data: { revision: (role.revision ?? 1) + 1 }, ...system, req: ctx.req });
  });
  return rolesOverview(ctx);
}

/* -------------------------------------------------------------- workflows */

export type WorkflowRow = ReviewWorkflowDef & { description: string; revision: number; problems: string[] };

export type WorkflowsOverview = {
  workflows: WorkflowRow[];
  roles: Array<{ id: number; name: string; scopeKind: NewsroomRoleScope; archived: boolean }>;
  people: DirectoryPerson[];
  sections: Array<{ id: number; name: string }>;
  formats: Array<{ value: string; label: string }>;
  mediaTypes: Array<{ value: string; label: string }>;
  year: { id: number; name: string } | null;
};

async function knownForWorkflows(ctx: ScreenContext) {
  const [roles, known] = await Promise.all([
    ctx.req.payload.find({ collection: "newsroom-roles", sort: "name", pagination: false, ...system, req: ctx.req }),
    directory(ctx)
  ]);
  return { roles: roles.docs, ...known };
}

export async function workflowsOverview(ctx: ScreenContext): Promise<WorkflowsOverview> {
  requireEditor(ctx);
  const [found, known, year] = await Promise.all([
    ctx.req.payload.find({ collection: "review-workflows", where: { archived: { not_equals: true } }, sort: "id", pagination: false, ...system, req: ctx.req }),
    knownForWorkflows(ctx),
    activeYear(ctx.req)
  ]);
  const lookup = {
    roles: new Map(known.roles.map((role) => [role.id, { name: role.name, archived: Boolean(role.archived), scopeKind: role.scopeKind }])),
    users: new Set(known.people.map((person) => person.id)),
    sections: new Set(known.sections.map((section) => section.id))
  };
  return {
    workflows: found.docs.map((row): WorkflowRow => {
      const def = workflowDef(row);
      return { ...def, description: row.description ?? "", revision: row.revision ?? 1, problems: workflowSaveProblems(def.steps, lookup) };
    }),
    roles: known.roles.map((role) => ({ id: role.id, name: role.name, scopeKind: role.scopeKind, archived: Boolean(role.archived) })),
    people: known.people,
    sections: known.sections,
    formats: STORY_FORMAT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    mediaTypes: PRODUCTION_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    year
  };
}

export type WorkflowInput = {
  name?: unknown;
  description?: unknown;
  appliesTo?: { sections?: unknown; formats?: unknown };
  steps?: unknown;
  isDefault?: unknown;
  archived?: unknown;
  expectedRevision?: unknown;
};

const ids = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
const formatValues = new Set<string>(STORY_FORMAT_OPTIONS.map((option) => option.value));

function refuse(problems: string[]): never {
  throw new APIError(problems[0] ?? "That workflow can't be saved.", 422, { problems });
}

/**
 * Save a workflow (id null creates one). The steps are validated like the
 * routing engine reads them; exactly one active workflow stays the default.
 */
export async function saveWorkflow(ctx: ScreenContext, id: number | null, input: WorkflowInput): Promise<WorkflowsOverview> {
  requireEditor(ctx);
  const known = await knownForWorkflows(ctx);
  const lookup = {
    roles: new Map(known.roles.map((role) => [role.id, { name: role.name, archived: Boolean(role.archived), scopeKind: role.scopeKind }])),
    users: new Set(known.people.map((person) => person.id)),
    sections: new Set(known.sections.map((section) => section.id))
  };

  await inTransaction(ctx.req, async () => {
    // One lock order (every workflow by id) so two editors never deadlock, and "exactly one default" holds.
    const rows = (await ctx.req.payload.find({ collection: "review-workflows", sort: "id", pagination: false, ...system, req: ctx.req })).docs;
    for (const row of rows) await lockRow(ctx.req, "review_workflows", row.id);
    const current = id === null ? null : rows.find((row) => row.id === id) ?? null;
    if (id !== null && !current) throw new APIError("Unknown workflow.", 404);
    if (current && typeof input.expectedRevision === "number" && input.expectedRevision !== (current.revision ?? 1)) throw new APIError("Someone else changed this workflow. Reload and try again.", 409);

    const problems: string[] = [];
    const name = input.name === undefined && current ? current.name : text(input.name, 80);
    if (!name) problems.push("Give the workflow a name.");
    let steps: WorkflowStep[] = current ? workflowDef(current).steps : [];
    if (input.steps !== undefined || !current) {
      const parsed = parseSteps(input.steps ?? []);
      steps = parsed.steps;
      problems.push(...parsed.problems);
    }
    const archived = typeof input.archived === "boolean" ? input.archived : Boolean(current?.archived);
    if (!archived) problems.push(...workflowSaveProblems(steps, lookup));
    const sections = input.appliesTo?.sections !== undefined ? ids(input.appliesTo.sections) : (current?.appliesTo?.sections ?? []).map((section) => Number(relationId(section)));
    const formats = input.appliesTo?.formats !== undefined ? (Array.isArray(input.appliesTo.formats) ? input.appliesTo.formats : []).filter((format): format is string => typeof format === "string" && formatValues.has(format)) : [...(current?.appliesTo?.formats ?? [])];
    if (sections.some((section) => !lookup.sections.has(section))) problems.push("One of the Sections doesn't exist.");

    const wantsDefault = typeof input.isDefault === "boolean" ? input.isDefault : Boolean(current?.isDefault);
    const otherDefault = rows.find((row) => row.isDefault && !row.archived && row.id !== id);
    if (archived && current?.isDefault && !otherDefault) problems.push("Make another workflow the default before archiving this one.");
    if (!wantsDefault && current?.isDefault && !otherDefault) problems.push("Byline needs a default workflow: make another one the default instead.");
    if (wantsDefault && archived) problems.push("An archived workflow can't be the default.");
    if (problems.length) refuse([...new Set(problems)]);

    const data = {
      name,
      description: input.description !== undefined ? text(input.description, 400) : current?.description ?? "",
      // With no default anywhere, the first live workflow becomes it.
      isDefault: !archived && (wantsDefault || !otherDefault),
      archived,
      appliesTo: { sections, formats },
      steps: steps as unknown as never,
      revision: (current?.revision ?? 0) + 1
    } as never;
    if (id === null) await ctx.req.payload.create({ collection: "review-workflows", data, ...system, req: ctx.req });
    else await ctx.req.payload.update({ collection: "review-workflows", id, data, ...system, req: ctx.req });
    // The default moves, it never duplicates.
    if (wantsDefault && !archived) {
      for (const row of rows) {
        if (row.id !== id && row.isDefault) await ctx.req.payload.update({ collection: "review-workflows", id: row.id, data: { isDefault: false, revision: (row.revision ?? 1) + 1 }, ...system, req: ctx.req });
      }
    }
  });
  return workflowsOverview(ctx);
}

/* ---------------------------------------------------------------- preview */

export type PreviewStep = {
  stepId: string;
  label: string;
  target: WorkflowStep["target"];
  kind: StepResolution["kind"];
  /** Who it goes to, or why it doesn't apply, or what is wrong. */
  summary: string;
  /** How a reporter sees the wait ("Sports Editor"), exactly as submission would show it. */
  waitingFor: string | null;
  detail: string | null;
  people: string[];
  fix: { kind: "role"; roleId: number } | { kind: "workflow"; workflowId: number | null } | { kind: "story-editor" } | { kind: "school-year" } | null;
};

export type RoutingPreview = {
  story: { id: number; title: string; section: string | null };
  workflow: { id: number; name: string } | null;
  steps: PreviewStep[];
  failed: number;
};

function previewStep(resolved: ResolvedStep, names: ReadonlyMap<number, string>, workflowId: number | null): PreviewStep {
  const { step, resolution } = resolved;
  const base = { stepId: step.stepId, label: step.label, target: step.target, kind: resolution.kind };
  switch (resolution.kind) {
    case "skipped":
      return { ...base, summary: "Skipped", waitingFor: null, detail: resolution.reason, people: [], fix: null };
    case "person":
      return { ...base, summary: resolution.name, waitingFor: resolution.waitingFor, detail: resolution.via, people: [resolution.name], fix: null };
    case "queue":
      return { ...base, summary: `${resolution.waitingFor} (${resolution.userIds.length} people can claim it)`, waitingFor: resolution.waitingFor, detail: resolution.via, people: resolution.userIds.map((id) => names.get(id) ?? "Someone"), fix: null };
    case "failed": {
      const fix = resolution.fix;
      return { ...base, summary: "Can't be routed", waitingFor: null, detail: resolution.failure, people: [], fix: fix.kind === "workflow" ? { kind: "workflow", workflowId: fix.workflowId ?? workflowId } : fix };
    }
  }
}

/**
 * Who each step would go to for a Story, through the same resolver real
 * submission uses (`routeStory`). With `steps` it previews an unsaved draft of
 * a workflow, so an editor sees the effect before saving.
 */
export async function previewRouting(ctx: ScreenContext, input: { storyId?: unknown; workflowId?: unknown; steps?: unknown; appliesTo?: { sections?: unknown; formats?: unknown } }): Promise<RoutingPreview> {
  requireEditor(ctx);
  const storyId = Number(input.storyId);
  if (!Number.isSafeInteger(storyId) || storyId <= 0) throw new APIError("Choose a story to preview.", 422);
  let override: ReviewWorkflowDef | undefined;
  if (input.steps !== undefined || input.workflowId !== undefined) {
    const workflowId = Number(input.workflowId);
    const saved = Number.isSafeInteger(workflowId) && workflowId > 0 ? await ctx.req.payload.findByID({ collection: "review-workflows", id: workflowId, ...system, req: ctx.req }).catch(() => null) : null;
    if (input.workflowId !== undefined && !saved) throw new APIError("Unknown workflow.", 404);
    const base = saved ? workflowDef(saved) : { id: 0, name: "Unsaved workflow", isDefault: false, archived: false, appliesTo: { sections: [], formats: [] }, steps: [] };
    const parsed = input.steps !== undefined ? parseSteps(input.steps) : { steps: base.steps, problems: [] };
    if (parsed.problems.length) refuse(parsed.problems);
    override = { ...base, steps: parsed.steps };
  }
  let plan;
  try {
    plan = await routeStory(ctx, storyId, override);
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError("That story can't be previewed.", 404);
  }
  const names = new Map([...plan.directory.users.values()].map((user) => [user.id, user.name]));
  const steps = plan.steps.map((resolved) => previewStep(resolved, names, plan.workflow && plan.workflow.id > 0 ? plan.workflow.id : null));
  return {
    story: { id: plan.story.id, title: plan.story.title, section: plan.story.sectionName },
    workflow: plan.workflow ? { id: plan.workflow.id, name: plan.workflow.name } : null,
    steps,
    failed: steps.filter((step) => step.kind === "failed").length
  };
}
