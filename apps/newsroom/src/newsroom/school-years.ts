import { lifecyclePhase } from "@byline/newsroom-screens/story/lifecycle";
import { APIError } from "payload";
import { atLeast, relationId } from "../access/user";
import { localDay, newsroomTimeZone } from "../domain/dates";
import { inTransaction, lockRow } from "../db/locks";
import type { RoleAssignmentDef, RoutingDirectory } from "../domain/newsroom-roles";
import { carriedAssignments, cleanPlan, cleanYear, departing, routingCheck, suggestYear, unfinishedWork, type OpenStory, type RolloverPlan, type RoutingIssue, type Unfinished, type YearInput } from "../domain/rollover";
import { PRODUCTION_TYPE_OPTIONS } from "../domain/vocabulary";
import { writerIds } from "./attention";
import { routingDirectory, workflowDefs } from "./routing";
import { loadPeople, type ScreenContext } from "./screen-models";

/**
 * Starting a new school year (docs/newsroom-roles.md#school-years). Editors
 * plan the year (a planned year changes nothing), preview what the plan means
 * (who leaves, what work is left, whether review routing still works), and
 * activate it once. Activation archives the old year and activates the new one
 * in one transaction; the old year's memberships, role assignments and every
 * review stay as they were, so history never changes.
 */

const system = { overrideAccess: true as const, depth: 0, pagination: false as const };

function requireEditor(ctx: ScreenContext): void {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors manage school years.", 403);
}

export type YearRow = { id: number; name: string; startsOn: string; endsOn: string; status: "planned" | "active" | "archived"; activatedAt: string | null; revision: number };

export type StaffRow = {
  userId: number;
  name: string;
  securityRole: "staff" | "editor" | "administrator";
  title: string;
  /** Their responsibilities in the active year. */
  assignments: Array<{ id: number; roleId: number; roleName: string; scope: string }>;
};

export type YearsOverview = {
  years: YearRow[];
  active: YearRow | null;
  planned: YearRow | null;
  suggestion: { name: string; startsOn: string; endsOn: string };
  staff: StaffRow[];
};

const yearRow = (row: { id: number; name: string; startsOn: string; endsOn: string; status: YearRow["status"]; activatedAt?: string | null; revision?: number | null }): YearRow => ({ id: row.id, name: row.name, startsOn: row.startsOn, endsOn: row.endsOn, status: row.status, activatedAt: row.activatedAt ?? null, revision: row.revision ?? 1 });

export async function yearsOverview(ctx: ScreenContext): Promise<YearsOverview> {
  requireEditor(ctx);
  const years = (await ctx.req.payload.find({ collection: "school-years", sort: "-startsOn", ...system, req: ctx.req })).docs.map(yearRow);
  const active = years.find((year) => year.status === "active") ?? null;
  const planned = years.find((year) => year.status === "planned") ?? null;
  const [users, roles, assignments, memberships, sections] = await Promise.all([
    ctx.req.payload.find({ collection: "users", where: { enabled: { not_equals: false } }, select: { name: true, role: true }, sort: "name", ...system, req: ctx.req }),
    ctx.req.payload.find({ collection: "newsroom-roles", ...system, req: ctx.req }),
    active ? ctx.req.payload.find({ collection: "role-assignments", where: { schoolYear: { equals: active.id } }, ...system, req: ctx.req }) : Promise.resolve({ docs: [] }),
    active ? ctx.req.payload.find({ collection: "staff-memberships", where: { schoolYear: { equals: active.id } }, ...system, req: ctx.req }) : Promise.resolve({ docs: [] }),
    ctx.req.payload.find({ collection: "sections", select: { name: true }, ...system, req: ctx.req })
  ]);
  const roleNames = new Map(roles.docs.map((role) => [role.id, role]));
  const sectionNames = new Map(sections.docs.map((section) => [section.id, section.name]));
  const titles = new Map(memberships.docs.filter((row) => row.status !== "departed").map((row) => [Number(relationId(row.user)), row.title ?? ""]));
  const staff = users.docs.map((user): StaffRow => ({
    userId: user.id,
    name: user.name,
    securityRole: user.role,
    title: titles.get(user.id) ?? "",
    assignments: assignments.docs.filter((row) => Number(relationId(row.user)) === user.id).map((row) => {
      const role = roleNames.get(Number(relationId(row.role)));
      const sectionIds = (Array.isArray(row.sections) ? row.sections : []).map((section) => Number(relationId(section)));
      const scope = row.scopeMode === "global" ? "" : role?.scopeKind === "section" ? sectionIds.map((id) => sectionNames.get(id) ?? "Removed section").join(", ") : (row.mediaTypes ?? []).join(", ");
      return { id: row.id, roleId: Number(relationId(row.role)), roleName: role?.name ?? "Removed role", scope };
    })
  }));
  return { years, active, planned, suggestion: suggestYear(active, localDay(ctx.now, newsroomTimeZone())), staff };
}

/** Create the planned year. One planned year at a time: finish or discard it first. */
export async function planYear(ctx: ScreenContext, input: YearInput): Promise<YearsOverview> {
  requireEditor(ctx);
  const existing = (await ctx.req.payload.find({ collection: "school-years", ...system, req: ctx.req })).docs;
  if (existing.some((year) => year.status === "planned")) throw new APIError("A school year is already planned. Finish it or discard it first.", 409);
  const clean = cleanYear(input, existing);
  if (!clean.ok) throw new APIError(clean.problems[0] ?? "That school year isn't valid.", 422, { problems: clean.problems });
  await ctx.req.payload.create({ collection: "school-years", data: { ...clean.value, status: "planned", revision: 1 }, ...system, req: ctx.req });
  return yearsOverview(ctx);
}

export async function discardYear(ctx: ScreenContext, id: number): Promise<YearsOverview> {
  requireEditor(ctx);
  const year = await ctx.req.payload.findByID({ collection: "school-years", id, ...system, req: ctx.req }).catch(() => null);
  if (!year) throw new APIError("Unknown school year.", 404);
  if (year.status !== "planned") throw new APIError("Only a planned school year can be discarded. Earlier years are kept as history.", 422);
  await ctx.req.payload.delete({ collection: "school-years", id, ...system, req: ctx.req });
  return yearsOverview(ctx);
}

/* ------------------------------------------------------------------ preview */

export type RolloverPreview = {
  plan: RolloverPlan;
  returning: Array<{ userId: number; name: string }>;
  departing: Array<{ userId: number; name: string }>;
  carried: number;
  unfinished: Array<Unfinished & { name: string }>;
  routing: RoutingIssue[];
};

async function loadFacts(ctx: ScreenContext, yearId: number) {
  const year = await ctx.req.payload.findByID({ collection: "school-years", id: yearId, ...system, req: ctx.req }).catch(() => null);
  if (!year) throw new APIError("Unknown school year.", 404);
  const active = (await ctx.req.payload.find({ collection: "school-years", where: { status: { equals: "active" } }, limit: 1, ...system, req: ctx.req })).docs[0] ?? null;
  const previous = active ? (await ctx.req.payload.find({ collection: "role-assignments", where: { schoolYear: { equals: active.id } }, ...system, req: ctx.req })).docs : [];
  const users = (await ctx.req.payload.find({ collection: "users", where: { enabled: { not_equals: false } }, select: { name: true, role: true }, ...system, req: ctx.req })).docs;
  return { year, active, previous, users };
}

const asDef = (row: { id: number; role: unknown; user: unknown; schoolYear: unknown; scopeMode: "global" | "scoped"; sections?: unknown; mediaTypes?: string[] | null }): RoleAssignmentDef => ({
  id: row.id,
  roleId: Number(relationId(row.role)),
  userId: Number(relationId(row.user)),
  yearId: Number(relationId(row.schoolYear)),
  scopeMode: row.scopeMode,
  sectionIds: (Array.isArray(row.sections) ? row.sections : []).map((section) => Number(relationId(section))),
  mediaTypes: [...(row.mediaTypes ?? [])]
});

async function openStories(ctx: ScreenContext): Promise<OpenStory[]> {
  const people = await loadPeople(ctx);
  const plans = (await ctx.req.payload.find({ collection: "story-plans", select: { story: true, workflow: true, editor: true, deadline: true, createdBy: true }, ...system, req: ctx.req })).docs;
  const ids = plans.map((plan) => Number(relationId(plan.story))).filter((id) => Number.isSafeInteger(id));
  const stories = ids.length ? (await ctx.req.payload.find({ collection: "stories", draft: true, where: { id: { in: ids } }, select: { headline: true, contributors: true, _status: true }, ...system, req: ctx.req })).docs : [];
  const byId = new Map(stories.map((story) => [story.id, story]));
  const result: OpenStory[] = [];
  for (const plan of plans) {
    const story = byId.get(Number(relationId(plan.story)));
    if (!story) continue;
    const editor = relationId(plan.editor);
    result.push({ id: story.id, title: story.headline?.trim() || "Untitled story", phase: lifecyclePhase(plan.workflow, story._status), deadline: plan.deadline ?? null, writerIds: writerIds(people, story, plan), editorId: editor === null ? null : Number(editor) });
  }
  return result;
}

/** What a plan means, before anything changes: the same routing resolver as submission runs against the year as it would be. */
export async function previewRollover(ctx: ScreenContext, yearId: number, input: Record<string, unknown>): Promise<RolloverPreview> {
  requireEditor(ctx);
  const { year, previous, users } = await loadFacts(ctx, yearId);
  if (year.status !== "planned") throw new APIError("Only a planned school year can be started.", 409);
  const plan = cleanPlan(input, { users: new Set(users.map((user) => user.id)), assignments: new Map(previous.map((row) => [row.id, { userId: Number(relationId(row.user)) }])) });
  const names = new Map(users.map((user) => [user.id, user.name]));
  const staff = users.map((user) => user.id);
  const leaving = departing(staff, plan);
  const directory = await routingDirectory(ctx.req);
  const stays = new Set(users.filter((user) => !plan.disable.includes(user.id)).map((user) => user.id));
  const planned: RoutingDirectory = {
    ...directory,
    year: { id: year.id, name: year.name },
    assignments: carriedAssignments(previous.map(asDef), plan, year.id).filter((assignment) => stays.has(assignment.userId)),
    users: new Map([...directory.users].filter(([id]) => stays.has(id)))
  };
  const workflows = await workflowDefs(ctx.req);
  return {
    plan,
    returning: plan.returning.map((userId) => ({ userId, name: names.get(userId) ?? "Someone" })),
    departing: leaving.map((userId) => ({ userId, name: names.get(userId) ?? "Someone" })),
    carried: plan.carry.length,
    unfinished: unfinishedWork(await openStories(ctx), leaving).map((entry) => ({ ...entry, name: names.get(entry.userId) ?? "Someone" })),
    routing: routingCheck(workflows, planned, PRODUCTION_TYPE_OPTIONS.map((option) => option.value))
  };
}

/* ----------------------------------------------------------------- activate */

/**
 * Start the year. Idempotent: starting a year that is already active changes
 * nothing. Routing problems don't block it (review routing reports its own
 * failures), but they must be acknowledged with `confirmed`.
 */
export async function activateYear(ctx: ScreenContext, yearId: number, input: Record<string, unknown> & { confirmed?: unknown }): Promise<YearsOverview> {
  requireEditor(ctx);
  const current = await ctx.req.payload.findByID({ collection: "school-years", id: yearId, ...system, req: ctx.req }).catch(() => null);
  if (!current) throw new APIError("Unknown school year.", 404);
  if (current.status === "active") return yearsOverview(ctx);
  if (current.status !== "planned") throw new APIError("An earlier school year can't be started again.", 409);

  const preview = await previewRollover(ctx, yearId, input);
  if (preview.routing.length && input.confirmed !== true) {
    throw new APIError("Review routing has problems in the new year. Confirm to start it anyway.", 422, { problems: preview.routing.map((issue) => issue.message), routing: preview.routing });
  }

  await inTransaction(ctx.req, async () => {
    // Lock every school year, in id order, so two editors starting years never interleave.
    const years = (await ctx.req.payload.find({ collection: "school-years", sort: "id", ...system, req: ctx.req })).docs;
    for (const row of years) await lockRow(ctx.req, "school_years", row.id);
    const target = years.find((row) => row.id === yearId);
    if (!target || target.status !== "planned") return; // someone else already did it
    const old = years.find((row) => row.status === "active") ?? null;
    const now = new Date().toISOString();
    const plan = preview.plan;

    const previous = old ? (await ctx.req.payload.find({ collection: "role-assignments", where: { schoolYear: { equals: old.id } }, ...system, req: ctx.req })).docs.map(asDef) : [];
    const oldMemberships = old ? (await ctx.req.payload.find({ collection: "staff-memberships", where: { schoolYear: { equals: old.id } }, ...system, req: ctx.req })).docs : [];
    const titleOf = new Map(oldMemberships.map((row) => [Number(relationId(row.user)), row.title ?? ""]));

    for (const assignment of carriedAssignments(previous, plan, yearId)) {
      await ctx.req.payload.create({ collection: "role-assignments", data: { role: assignment.roleId, user: assignment.userId, schoolYear: yearId, scopeMode: assignment.scopeMode, sections: assignment.sectionIds, mediaTypes: assignment.mediaTypes } as never, ...system, req: ctx.req });
    }
    for (const userId of plan.returning) {
      await ctx.req.payload.create({ collection: "staff-memberships", data: { schoolYear: yearId, user: userId, title: plan.titles[String(userId)] ?? titleOf.get(userId) ?? "", status: "active" } as never, ...system, req: ctx.req });
    }
    if (old) {
      // The old year keeps its people: leaving is recorded on it, never by deleting it.
      for (const row of oldMemberships) {
        if (row.status !== "departed" && !plan.returning.includes(Number(relationId(row.user)))) await ctx.req.payload.update({ collection: "staff-memberships", id: row.id, data: { status: "departed", departedAt: now } as never, ...system, req: ctx.req });
      }
      const recorded = new Set(oldMemberships.map((row) => Number(relationId(row.user))));
      for (const person of preview.departing) {
        if (!recorded.has(person.userId)) await ctx.req.payload.create({ collection: "staff-memberships", data: { schoolYear: old.id, user: person.userId, title: "", status: "departed", departedAt: now } as never, ...system, req: ctx.req });
      }
      await ctx.req.payload.update({ collection: "school-years", id: old.id, data: { status: "archived", revision: (old.revision ?? 1) + 1 } as never, ...system, req: ctx.req });
    }
    // Never lock out the person starting the year, or any administrator.
    for (const userId of plan.disable) {
      const user = await ctx.req.payload.findByID({ collection: "users", id: userId, ...system, req: ctx.req });
      if (user.role === "administrator" || userId === Number(ctx.user.id)) continue;
      await ctx.req.payload.update({ collection: "users", id: userId, data: { enabled: false } as never, ...system, req: ctx.req });
    }
    await ctx.req.payload.update({ collection: "school-years", id: yearId, data: { status: "active", activatedAt: now, activatedBy: Number(ctx.user.id), revision: (target.revision ?? 1) + 1 } as never, ...system, req: ctx.req });
  });
  return yearsOverview(ctx);
}
