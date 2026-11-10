import { APIError, type PayloadRequest } from "payload";
import { relationId, relationIds } from "../access/user";
import {
  normalizeStep,
  resolveWorkflow,
  selectWorkflow,
  type ResolvedStep,
  type ReviewWorkflowDef,
  type RoleAssignmentDef,
  type RoleDef,
  type RoutingDirectory,
  type RoutingStory,
  type WorkflowStep
} from "../domain/newsroom-roles";
import type { ReviewWorkflow, Section, Story, StoryPlan } from "../payload-types";
import { loadPeople, type ScreenContext } from "./screen-models";
import { writerIds } from "./attention";

/**
 * Loads what review routing decides with (domain/newsroom-roles.ts). These
 * reads are the engine's own: callers authorize the person first (submitting
 * a Story they manage, previewing as an editor), then routing reads roles,
 * assignments and workflows with system access. Nothing here is returned to a
 * reporter except a waiting-for label and, on failure, a reason.
 */

const system = (req: PayloadRequest) => ({ req, depth: 0, pagination: false as const, overrideAccess: true as const });

export async function activeYear(req: PayloadRequest): Promise<{ id: number; name: string } | null> {
  const found = await req.payload.find({ collection: "school-years", where: { status: { equals: "active" } }, limit: 1, depth: 0, req, overrideAccess: true });
  const year = found.docs[0];
  return year ? { id: year.id, name: year.name } : null;
}

export async function routingDirectory(req: PayloadRequest): Promise<RoutingDirectory> {
  const [roles, users, sections, year] = await Promise.all([
    req.payload.find({ collection: "newsroom-roles", ...system(req) }),
    req.payload.find({ collection: "users", where: { enabled: { not_equals: false } }, select: { name: true, role: true }, ...system(req) }),
    req.payload.find({ collection: "sections", select: { name: true }, ...system(req) }),
    activeYear(req)
  ]);
  const assignments = year
    ? await req.payload.find({ collection: "role-assignments", where: { schoolYear: { equals: year.id } }, ...system(req) })
    : { docs: [] };
  return {
    roles: new Map(roles.docs.map((role): [number, RoleDef] => [role.id, { id: role.id, key: role.key, name: role.name, scopeKind: role.scopeKind, waitingLabel: role.waitingLabel ?? null, archived: Boolean(role.archived) }])),
    assignments: assignments.docs.map((row): RoleAssignmentDef => ({
      id: row.id,
      roleId: Number(relationId(row.role)),
      userId: Number(relationId(row.user)),
      yearId: Number(relationId(row.schoolYear)),
      scopeMode: row.scopeMode,
      sectionIds: relationIds(row.sections).map(Number),
      mediaTypes: [...(row.mediaTypes ?? [])]
    })),
    users: new Map(users.docs.map((user) => [user.id, { id: user.id, name: user.name, role: user.role }])),
    sections: new Map((sections.docs as Section[]).map((section) => [section.id, section.name])),
    year
  };
}

export function workflowDef(row: ReviewWorkflow): ReviewWorkflowDef {
  const steps = Array.isArray(row.steps) ? (row.steps as unknown[]).map(normalizeStep).filter((step): step is WorkflowStep => step !== null) : [];
  return {
    id: row.id,
    name: row.name,
    isDefault: Boolean(row.isDefault),
    archived: Boolean(row.archived),
    appliesTo: { sections: relationIds(row.appliesTo?.sections).map(Number), formats: [...(row.appliesTo?.formats ?? [])] },
    steps
  };
}

export async function workflowDefs(req: PayloadRequest): Promise<ReviewWorkflowDef[]> {
  const found = await req.payload.find({ collection: "review-workflows", where: { archived: { not_equals: true } }, sort: "id", ...system(req) });
  return found.docs.map(workflowDef);
}

const VISUAL = /^(upload|image|gallery|video|embed|chart|map|interactive|audio)$/i;

function bodyMedia(node: unknown, types: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  const blockType = String((record.fields as { blockType?: unknown } | undefined)?.blockType ?? "");
  const kind = VISUAL.test(type) ? type : VISUAL.test(blockType) ? blockType : "";
  if (kind) types.add(/video/i.test(kind) ? "video" : /audio/i.test(kind) ? "audio" : /chart|map|interactive/i.test(kind) ? "graphic" : "photo");
  if (Array.isArray(record.children)) for (const child of record.children) bodyMedia(child, types);
}

/**
 * The facts routing needs about a Story, from its current draft (what is
 * being submitted) and its plan and media work.
 */
export async function routingStory(req: PayloadRequest, storyId: number, people?: Awaited<ReturnType<typeof loadPeople>>, ctx?: ScreenContext): Promise<RoutingStory> {
  const story = (await req.payload.findByID({ collection: "stories", id: storyId, draft: true, depth: 1, req, overrideAccess: true })) as Story;
  if (!story) throw new APIError("Unknown story.", 404);
  const [plans, production] = await Promise.all([
    req.payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, limit: 1, depth: 0, req, overrideAccess: true }),
    req.payload.find({ collection: "production-assignments", where: { story: { equals: storyId } }, select: { type: true }, ...system(req) })
  ]);
  const plan = (plans.docs[0] ?? null) as StoryPlan | null;
  const types = new Set<string>(production.docs.map((row) => row.type));
  if (story.featuredMedia) types.add("photo");
  if (story.format === "video" || story.video?.url) types.add("video");
  bodyMedia((story.body as { root?: unknown } | undefined)?.root, types);
  const section = story.section && typeof story.section === "object" ? (story.section as Section) : null;
  const everyone = people ?? (ctx ? await loadPeople(ctx) : null);
  return {
    id: story.id,
    title: story.headline?.trim() || "Untitled story",
    sectionId: section?.id ?? (typeof story.section === "number" ? story.section : null),
    sectionName: section?.name ?? null,
    format: story.format ?? "standard",
    hasVisuals: types.size > 0,
    mediaTypes: [...types].sort(),
    editorId: relationId(plan?.editor) === null ? null : Number(relationId(plan?.editor)),
    writerIds: everyone ? writerIds(everyone, story, plan) : relationId(plan?.createdBy) === null ? [] : [Number(relationId(plan?.createdBy))]
  };
}

export type RoutingPlan = { workflow: ReviewWorkflowDef | null; steps: ResolvedStep[]; story: RoutingStory; directory: RoutingDirectory };

/** Which workflow a Story would use and who each step would go to now: submission and preview alike. */
export async function routeStory(ctx: ScreenContext, storyId: number, workflowOverride?: ReviewWorkflowDef): Promise<RoutingPlan> {
  const [story, directory, workflows] = await Promise.all([routingStory(ctx.req, storyId, undefined, ctx), routingDirectory(ctx.req), workflowOverride ? Promise.resolve([]) : workflowDefs(ctx.req)]);
  const workflow = workflowOverride ?? selectWorkflow(workflows, story);
  return { workflow, steps: workflow ? resolveWorkflow(workflow, story, directory) : [], story, directory };
}
