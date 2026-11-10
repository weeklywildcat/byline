import { storyAttention, type AttentionInput, type AttentionReview, type StoryAttention } from "@byline/newsroom-screens/story/attention";
import type { EffectivePhase } from "@byline/newsroom-screens/story/lifecycle";
import type { StoryReviewSummary } from "@byline/newsroom-screens/planning/planning-model";
import { atLeast, relationId, relationIds } from "../access/user";
import { mayReview, type ReviewDecision, type RunStep } from "../domain/review";
import type { ReviewRun, Story, StoryPlan } from "../payload-types";
import type { People, ScreenContext, StoryExtras } from "./screen-models";

/**
 * The server half of Story Attention (packages/newsroom-screens/src/story/attention.ts):
 * turns the records a reader may already see into the pure function's input.
 * Home, Stories, Peek and the Story screen all receive the result through the
 * Stories read model; nothing else computes attention.
 */

const ids = (value: unknown) => relationIds(value).map(Number).filter((id) => Number.isSafeInteger(id));

/** Byline accounts on the Story's byline, plus whoever created it: the people "your story" means. */
export function writerIds(people: People, story: Pick<Story, "contributors">, plan: Pick<StoryPlan, "createdBy"> | null): number[] {
  const writers = new Set<number>();
  for (const person of relationIds(story.contributors)) {
    const user = people.personToUser.get(String(person));
    if (user !== undefined) writers.add(Number(user));
  }
  const creator = relationId(plan?.createdBy);
  if (creator !== null) writers.add(Number(creator));
  return [...writers];
}

/** The open run's steps, in order (stored JSON validated loosely: the engine wrote it). */
export function runSteps(run: Pick<ReviewRun, "steps">): RunStep[] {
  return Array.isArray(run.steps) ? (run.steps as RunStep[]) : [];
}

export function runDecisions(run: Pick<ReviewRun, "decisions">): ReviewDecision[] {
  return Array.isArray(run.decisions) ? (run.decisions as ReviewDecision[]) : [];
}

/** Reporter-facing review state for any surface, or null when nothing is open. */
export function reviewSummary(run: ReviewRun | null | undefined, viewerId: number): StoryReviewSummary | null {
  if (!run || (run.status !== "active" && run.status !== "changes-requested" && run.status !== "routing-failed")) return null;
  const steps = runSteps(run);
  const open = steps.find((step) => step.state === "active") ?? steps.find((step) => step.state === "pending");
  return {
    state: run.status === "active" ? "waiting" : run.status,
    waitingFor: open?.waitingFor ?? null,
    stepLabel: open?.label ?? null,
    since: run.statusSince ?? run.updatedAt ?? null,
    canReview: run.status === "active" && Boolean(open && mayReview(open, viewerId))
  };
}

function attentionReview(run: ReviewRun | null | undefined): AttentionReview | null {
  if (!run || (run.status !== "active" && run.status !== "changes-requested" && run.status !== "routing-failed")) return null;
  const steps = runSteps(run);
  const open = steps.find((step) => step.state === "active");
  const changes = run.status === "changes-requested" ? steps.find((step) => step.state === "pending" && step.waitingFor) ?? null : null;
  const last = runDecisions(run).at(-1) as (ReviewDecision & { comments?: number }) | undefined;
  return {
    state: run.status === "active" ? "waiting" : run.status,
    stepLabel: (open ?? changes)?.label ?? null,
    waitingFor: (open ?? changes)?.waitingFor ?? null,
    reviewerIds: open ? (open.assigneeId !== null ? [open.assigneeId] : [...(open.queue?.userIds ?? [])]) : [],
    publishedComments: run.status === "changes-requested" ? Number(last?.comments ?? 0) : 0,
    since: run.statusSince ?? run.updatedAt ?? null,
    failure: run.failure ?? null
  };
}

export function attentionFor(
  ctx: ScreenContext,
  people: People,
  story: Story,
  plan: StoryPlan | null,
  extras: StoryExtras,
  phase: EffectivePhase,
  run: ReviewRun | null | undefined
): StoryAttention {
  const input: AttentionInput = {
    storyId: story.id,
    phase,
    deadline: plan?.deadline ?? null,
    scheduledAt: extras.scheduledAt,
    writerIds: writerIds(people, story, plan),
    editorId: relationId(plan?.editor) === null ? null : Number(relationId(plan?.editor)),
    review: attentionReview(run),
    sources: extras.sources.map((source) => ({ id: source.id, label: source.label ?? "A source", status: source.status ?? "planned", since: source.updatedAt ?? null, assigneeIds: ids(source.assignees) })),
    appointments: extras.appointments.map((item) => ({ id: item.id, title: item.title, kind: item.kind, status: item.status, startAt: item.scheduleMode === "exact" ? item.startAt ?? null : null, windowStart: item.windowStart ?? null, assigneeIds: ids(item.assignees) })),
    media: extras.production.map((item) => ({ id: item.id, title: item.title, type: item.type, status: item.status, deadline: item.deadline ?? null, assigneeIds: ids(item.assignees) })),
    checklist: extras.tasks.map((task) => ({ id: task.id, title: task.title, due: task.due ?? null, done: task.state === "completed", assigneeIds: ids(task.assignees) }))
  };
  return storyAttention(input, { id: Number(ctx.user.id), isEditor: atLeast(ctx.user, "editor") }, { now: ctx.now, timeZone: ctx.timeZone });
}

/** Open review runs for these Stories, as the reader may read them. */
export async function openRuns(ctx: ScreenContext, storyIds: readonly number[]): Promise<Map<number, ReviewRun>> {
  if (!storyIds.length) return new Map();
  const found = await ctx.req.payload.find({
    collection: "review-runs",
    where: { and: [{ story: { in: [...storyIds] } }, { status: { in: ["active", "changes-requested", "routing-failed"] } }] },
    depth: 0,
    pagination: false,
    req: ctx.req,
    overrideAccess: false
  });
  return new Map(found.docs.map((run) => [Number(relationId(run.story)), run]));
}
