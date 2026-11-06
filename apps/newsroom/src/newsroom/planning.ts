import { filterPlanningStories, type PlanningFilters, type PlanningResponse, type PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import type { Where } from "payload";
import { inIds } from "../access/story-context";
import { atLeast, relationId, relationIds } from "../access/user";
import { localDay } from "../domain/dates";
import { effectiveWorkflow } from "../domain/workflow";
import type { StoryPlan } from "../payload-types";
import { loadPeople, localToday, planningStory, STATUSES, storiesWithExtras, userPerson, type ScreenContext } from "./screen-models";

/**
 * The Stories collection (`GET /api/byline/planning`): the shared
 * `PlanningResponse` read model behind Board and List, never raw Payload
 * documents.
 *
 * The collection is the stories whose plans this user may read (Story Plans
 * access: editors every story, staff the stories they manage or hold work on),
 * read in full with `overrideAccess: false`. It is never a first page: Payload
 * applies a `limit` even with pagination off, so none is given. Filters run on
 * the server in the newsroom timezone, then the screen applies the same shared
 * filter again as the reader types.
 */

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });

/** The stories in a coverage, from its ordered `stories` list: the one truth about membership. */
export async function coverageStoryIds(ctx: ScreenContext, coverageId: number): Promise<Array<number | string>> {
  const found = await ctx.req.payload.find({ collection: "coverages", where: { id: { equals: coverageId } }, depth: 0, limit: 1, select: { stories: true }, ...asUser(ctx) });
  return relationIds(found.docs[0]?.stories);
}

/**
 * Plan fields that can only narrow the set: every condition here is implied by
 * the full filter, so loading fewer stories never changes the answer.
 */
function planMayMatch(plan: StoryPlan, filters: PlanningFilters, timeZone: string): boolean {
  if (filters.workflow && filters.workflow !== "published" && effectiveWorkflow(plan.workflow, "draft") !== filters.workflow) return false;
  if (filters.editorId !== null && Number(relationId(plan.editor)) !== filters.editorId) return false;
  if (filters.unassigned && relationId(plan.editor) !== null) return false;
  if (filters.deadlineFrom && (!plan.deadline || plan.deadline < filters.deadlineFrom)) return false;
  if (filters.deadlineTo && (!plan.deadline || plan.deadline > filters.deadlineTo)) return false;
  if ((filters.plannedFrom || filters.plannedTo) && !inDayRange(plan.plannedPublication, filters.plannedFrom, filters.plannedTo, timeZone)) return false;
  return true;
}

function inDayRange(instant: string | null | undefined, from: string, to: string, timeZone: string): boolean {
  if (!instant) return false;
  const day = localDay(instant, timeZone);
  return (!from || day >= from) && (!to || day <= to);
}

/**
 * The shared filter, with the date rules read in the newsroom timezone rather
 * than the server's: a planned publication's day and "overdue" (a deadline
 * before today, on a story not yet published).
 */
export function filterInNewsroomTime(stories: PlanningStory[], filters: PlanningFilters, ctx: ScreenContext): PlanningStory[] {
  const today = localToday(ctx);
  const shared = filterPlanningStories(stories, { ...filters, plannedFrom: "", plannedTo: "", overdue: false }, Number(ctx.user.id), ctx.now);
  return shared.filter((story) => {
    if ((filters.plannedFrom || filters.plannedTo) && !inDayRange(story.plannedPublication, filters.plannedFrom, filters.plannedTo, ctx.timeZone)) return false;
    if (filters.overdue && (story.publicationState.isPublished || !story.deadline || story.deadline >= today)) return false;
    return true;
  });
}

export async function planningResponse(ctx: ScreenContext, filters: PlanningFilters): Promise<PlanningResponse> {
  const where: Where[] = [];
  if (filters.collectionId) where.push(inIds("story", await coverageStoryIds(ctx, filters.collectionId)));
  const [people, plans] = await Promise.all([
    loadPeople(ctx),
    ctx.req.payload.find({ collection: "story-plans", where: where.length ? { and: where } : undefined, depth: 0, pagination: false, ...asUser(ctx) })
  ]);
  const planByStory = new Map<number, StoryPlan>();
  for (const plan of plans.docs) {
    const storyId = Number(relationId(plan.story));
    if (Number.isSafeInteger(storyId) && planMayMatch(plan, filters, ctx.timeZone)) planByStory.set(storyId, plan);
  }
  const { stories, extras } = await storiesWithExtras(ctx, [...planByStory.keys()]);
  const rows: PlanningStory[] = stories.map((story) => planningStory(ctx, people, story, planByStory.get(story.id) ?? null, extras.get(story.id)!));
  const matching = filterInNewsroomTime(rows, filters, ctx);
  const editor = atLeast(ctx.user, "editor");
  return {
    stories: matching,
    timezone: ctx.timeZone,
    workflowStatuses: STATUSES.map((status) => ({ ...status, group: status.group as PlanningResponse["workflowStatuses"][number]["group"] })),
    capabilities: { canMoveStories: true, canAssign: editor, canManageSavedViews: true, canManageMedia: false, canManageFeedback: false },
    currentUser: userPerson(people, ctx.user.id),
    total: matching.length,
    nextPage: null
  };
}
