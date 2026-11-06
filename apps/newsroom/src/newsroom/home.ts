import type { PayloadRequest, Where } from "payload";
import { relationId, requestUser, atLeast } from "../access/user";
import { addDays, localDay } from "../domain/dates";
import { effectiveWorkflow, workflowLabel } from "../domain/workflow";
import { WORKFLOW_STAGES, type EffectiveWorkflow } from "../domain/vocabulary";

export type HomeStory = {
  id: number | string;
  headline: string;
  workflow: EffectiveWorkflow;
  workflowLabel: string;
  publication: "draft" | "published";
  deadline: string | null;
};

export type HomeWork = { id: number | string; title: string; detail: string; storyId: number | string | null; when: string | null };

export type NewsroomHome = {
  myStories: HomeStory[];
  dueSoon: HomeStory[];
  myProduction: HomeWork[];
  myTasks: HomeWork[];
  todaysAppointments: HomeWork[];
  /** Editors only. */
  board: { stage: EffectiveWorkflow; label: string; count: number }[] | null;
  readyForReview: HomeStory[] | null;
};

type PlanRow = { story?: unknown; workflow?: unknown; deadline?: unknown };

/** Stage counts for the board in workflow order, Published last. Dropped stories are not on the board. */
export function stageCounts(stories: ReadonlyArray<Pick<HomeStory, "workflow">>) {
  const order: EffectiveWorkflow[] = [...WORKFLOW_STAGES.filter((stage) => stage !== "dropped"), "published"];
  return order.map((stage) => ({ stage, label: workflowLabel(stage), count: stories.filter((story) => story.workflow === stage).length }));
}

/**
 * Everything Byline Home shows, read as the signed-in user: every query runs
 * with `overrideAccess: false`, so Home can never show a record the user's
 * access does not allow.
 */
export async function loadNewsroomHome(req: PayloadRequest, { now = new Date(), timeZone }: { now?: Date; timeZone: string }): Promise<NewsroomHome> {
  const user = requestUser(req);
  if (!user) throw new Error("Byline Home requires a signed-in newsroom account.");
  const asUser = { req, overrideAccess: false, depth: 0 } as const;
  const editor = atLeast(user, "editor");
  const today = localDay(now, timeZone);

  const team: Where[] = [{ createdBy: { equals: user.id } }, { editor: { equals: user.id } }];
  if (user.linkedPerson !== null) team.push({ contributors: { in: [user.linkedPerson] } });

  const [minePlans, boardPlans, production, tasks, appointments] = await Promise.all([
    req.payload.find({ collection: "story-plans", where: { or: team }, limit: 100, sort: "-updatedAt", ...asUser }),
    editor ? req.payload.find({ collection: "story-plans", where: { workflow: { not_equals: "dropped" } }, limit: 500, sort: "-updatedAt", ...asUser }) : null,
    req.payload.find({ collection: "production-assignments", where: { and: [{ assignees: { in: [user.id] } }, { status: { not_equals: "done" } }] }, limit: 20, sort: "deadline", ...asUser }),
    req.payload.find({ collection: "tasks", where: { and: [{ assignees: { in: [user.id] } }, { state: { equals: "open" } }] }, limit: 20, sort: "due", ...asUser }),
    req.payload.find({
      collection: "appointments",
      where: {
        and: [
          { scheduleMode: { equals: "exact" } },
          { status: { not_equals: "cancelled" } },
          { startAt: { greater_than_equal: new Date(now.getTime() - 36 * 3600_000).toISOString() } },
          { startAt: { less_than: new Date(now.getTime() + 36 * 3600_000).toISOString() } },
          ...(editor ? [] : [{ assignees: { in: [user.id] } } as Where])
        ]
      },
      limit: 50,
      sort: "startAt",
      ...asUser
    })
  ]);

  const plans: PlanRow[] = [...minePlans.docs, ...(boardPlans?.docs ?? [])];
  const storyIds = [...new Set(plans.map((plan) => relationId(plan.story)).filter((id): id is number | string => id !== null).map(String))];
  // Draft saves live in the versions table, so read the latest draft for headlines.
  const stories = storyIds.length
    ? await req.payload.find({ collection: "stories", where: { id: { in: storyIds } }, draft: true, limit: storyIds.length, select: { headline: true, _status: true }, ...asUser })
    : { docs: [] };
  const byId = new Map(stories.docs.map((story) => [String(story.id), story as { id: number | string; headline?: string; _status?: string }]));

  const toStory = (plan: PlanRow): HomeStory | null => {
    const story = byId.get(String(relationId(plan.story)));
    if (!story) return null;
    const workflow = effectiveWorkflow(plan.workflow, story._status);
    return {
      id: story.id,
      headline: story.headline?.trim() || "Untitled story",
      workflow,
      workflowLabel: workflowLabel(workflow),
      publication: story._status === "published" ? "published" : "draft",
      deadline: typeof plan.deadline === "string" ? plan.deadline : null
    };
  };
  const present = (story: HomeStory | null): story is HomeStory => story !== null;

  const myStories = minePlans.docs.map(toStory).filter(present).filter((story) => story.workflow !== "published" && story.workflow !== "dropped");
  const horizon = addDays(today, 3);
  const dueSoon = myStories.filter((story) => story.deadline !== null && story.deadline <= horizon).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
  const boardStories = boardPlans ? boardPlans.docs.map(toStory).filter(present) : null;

  return {
    myStories,
    dueSoon,
    myProduction: production.docs.map((row) => ({ id: row.id, title: String(row.title), detail: String(row.status), storyId: relationId(row.story), when: typeof row.deadline === "string" ? row.deadline : null })),
    myTasks: tasks.docs.map((row) => ({ id: row.id, title: String(row.title), detail: String(row.priority ?? "normal"), storyId: relationId(row.story), when: typeof row.due === "string" ? row.due : null })),
    todaysAppointments: appointments.docs
      .filter((row) => typeof row.startAt === "string" && localDay(row.startAt, timeZone) === today)
      .map((row) => ({ id: row.id, title: String(row.title), detail: String(row.kind), storyId: relationId(row.story), when: row.startAt as string })),
    board: boardStories ? stageCounts(boardStories) : null,
    readyForReview: boardStories ? boardStories.filter((story) => story.workflow === "ready") : null
  };
}
