import { lifecyclePhase } from "@byline/newsroom-screens/story/lifecycle";
import { APIError } from "payload";
import { atLeast, relationId, relationIds } from "../access/user";
import { workloadRows, type WorkloadRow, type WorkloadStory } from "../domain/workload";
import { writerIds } from "./attention";
import { loadPeople, type ScreenContext } from "./screen-models";

/**
 * Factual workload for editors (docs/newsroom-roles.md#workload): what is on
 * each person's plate right now. Counts only; no scores, rankings or time.
 * The same rows feed the assignment pickers' advisory hints, which never block
 * an assignment.
 */

const system = { overrideAccess: true as const, depth: 0, pagination: false as const };

export type WorkloadView = { generatedAt: string; rows: WorkloadRow[] };

export async function workload(ctx: ScreenContext): Promise<WorkloadView> {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors see workload.", 403);
  const people = await loadPeople(ctx);
  const [plans, runs, production] = await Promise.all([
    ctx.req.payload.find({ collection: "story-plans", select: { story: true, workflow: true, editor: true, deadline: true, createdBy: true }, ...system, req: ctx.req }),
    ctx.req.payload.find({ collection: "review-runs", where: { status: { equals: "active" } }, select: { story: true, reviewers: true }, ...system, req: ctx.req }),
    ctx.req.payload.find({ collection: "production-assignments", where: { status: { in: ["needed", "assigned", "in-progress"] } }, select: { assignees: true, status: true }, ...system, req: ctx.req })
  ]);
  const storyIds = plans.docs.map((plan) => Number(relationId(plan.story))).filter((id) => Number.isSafeInteger(id));
  const stories = storyIds.length
    ? await ctx.req.payload.find({ collection: "stories", draft: true, where: { id: { in: storyIds } }, select: { contributors: true, _status: true }, ...system, req: ctx.req })
    : { docs: [] };
  const byId = new Map(stories.docs.map((story) => [story.id, story]));

  const workStories: WorkloadStory[] = [];
  for (const plan of plans.docs) {
    const story = byId.get(Number(relationId(plan.story)));
    if (!story) continue;
    const editor = relationId(plan.editor);
    workStories.push({
      id: story.id,
      phase: lifecyclePhase(plan.workflow, story._status),
      deadline: plan.deadline ?? null,
      writerIds: writerIds(people, story, plan),
      editorId: editor === null ? null : Number(editor)
    });
  }
  const rows = workloadRows({
    now: ctx.now,
    timeZone: ctx.timeZone,
    people: [...people.users.values()].map((user) => ({ id: user.id, name: user.name, role: user.role })),
    stories: workStories,
    reviews: runs.docs.map((run) => ({ storyId: Number(relationId(run.story)), userIds: relationIds(run.reviewers).map(Number) })),
    media: production.docs.map((row) => ({ status: row.status, assigneeIds: relationIds(row.assignees).map(Number) }))
  });
  return { generatedAt: ctx.now.toISOString(), rows };
}
