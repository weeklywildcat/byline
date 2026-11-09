import { lifecyclePhase, storedStage } from "@byline/newsroom-screens/story/lifecycle";
import { APIError, type CollectionAfterChangeHook, type PayloadRequest } from "payload";
import { scopeManages, storyScope } from "../access/story-context";
import { atLeast, relationId, relationIds, sameId } from "../access/user";
import { inTransaction, lockRow } from "../db/locks";
import { nextApplicableStep, resolveStep, selectWorkflow, type ReviewWorkflowDef, type RoutingDirectory, type RoutingStory } from "../domain/newsroom-roles";
import { buildReviewBlocks, mediaIdsOf, type SubmittedStory } from "../domain/review-blocks";
import { compareVersions, copySummary, visualSummary, type VersionComparison } from "../domain/review-diff";
import {
  activateStep,
  changedCategories,
  describeChanges,
  initialSteps,
  mayReview,
  reviewerIds,
  staleness,
  storyFingerprint,
  type ApprovalFingerprint,
  type ReviewDecision,
  type MediaStamp,
  type RunSnapshot,
  type RunStep
} from "../domain/review";
import type { ReviewComment, ReviewRun, Story, StoryPlan, User } from "../payload-types";
import { runDecisions, runSteps, writerIds } from "./attention";
import { editorRecipients, notify } from "./notifications";
import { mediaPreview } from "./media-library";
import { routingDirectory, routingStory, workflowDefs } from "./routing";
import { loadPeople, planFor, type ScreenContext } from "./screen-models";
import { recordStoryActivity } from "./story-activity";

/**
 * The review engine (docs/review.md). Every review write goes through here:
 * it authorizes the person, serializes the change (row lock on the Story's
 * plan, then compare-and-swap on the run's revision) and writes runs,
 * comments, the Story's stage, activity and notifications in one transaction.
 *
 * Reporters press Submit for review and nothing else: the engine settles the
 * version, picks the workflow, routes the first gate and moves the Story to
 * Review. A double-click or a network retry never advances a review twice.
 */

const system = { overrideAccess: true as const, depth: 0 };
const OPEN = ["active", "changes-requested", "routing-failed"] as const;
type DecisionRecord = ReviewDecision & { comments: number };

/* ------------------------------------------------------------------ reads */

async function openRun(req: PayloadRequest, storyId: number): Promise<ReviewRun | null> {
  const found = await req.payload.find({ collection: "review-runs", where: { and: [{ story: { equals: storyId } }, { status: { in: [...OPEN] } }] }, limit: 1, req, ...system });
  return found.docs[0] ?? null;
}

async function latestRun(req: PayloadRequest, storyId: number): Promise<ReviewRun | null> {
  const found = await req.payload.find({ collection: "review-runs", where: { and: [{ story: { equals: storyId } }, { status: { not_equals: "cancelled" } }] }, sort: "-createdAt", limit: 1, req, ...system });
  return found.docs[0] ?? null;
}

/** The Media a version shows, as they were when it was submitted: enough to tell later whether a file or its crop changed underneath the review. */
async function mediaStamps(req: PayloadRequest, version: Story | null): Promise<MediaStamp[]> {
  if (!version) return [];
  const ids = mediaIdsOf(buildReviewBlocks(version as unknown as SubmittedStory));
  if (!ids.length) return [];
  const found = await req.payload.find({ collection: "media", where: { id: { in: ids } }, select: { filename: true, publicationRevision: true }, pagination: false, req, ...system });
  return found.docs.map((doc) => ({ id: doc.id, filename: doc.filename ?? "", revision: doc.publicationRevision ?? 0 }));
}

const withStamps = (snapshot: RunSnapshot, version: string, stamps: MediaStamp[]): RunSnapshot => ({ ...snapshot, media: { ...(snapshot.media ?? {}), [version]: stamps } });

async function latestVersionId(req: PayloadRequest, storyId: number): Promise<string | null> {
  const found = await req.payload.findVersions({ collection: "stories", where: { parent: { equals: storyId } }, sort: ["-updatedAt", "-id"], limit: 1, select: { updatedAt: true }, req, ...system });
  return found.docs[0] ? String(found.docs[0].id) : null;
}

async function versionDoc(req: PayloadRequest, versionId: string): Promise<Story | null> {
  try {
    const row = await req.payload.findVersionByID({ collection: "stories", id: versionId, req, ...system });
    return row.version as Story;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- submission */

export type SubmissionProblem = { field: "headline" | "section" | "contributors"; message: string };

/** Ordinary, fixable Story problems that stop a submission (shown in a Dialog, never as routing errors). */
export function submissionProblems(story: Pick<Story, "headline" | "section" | "contributors">): SubmissionProblem[] {
  const problems: SubmissionProblem[] = [];
  if (!story.headline?.trim()) problems.push({ field: "headline", message: "Add a headline" });
  if (relationId(story.section) === null) problems.push({ field: "section", message: "Add a Section" });
  if (!Array.isArray(story.contributors) || story.contributors.length === 0) problems.push({ field: "contributors", message: "Add at least one writer" });
  return problems;
}

async function setStage(req: PayloadRequest, plan: StoryPlan, phase: "drafting" | "review" | "ready") {
  const stored = storedStage(phase);
  if (plan.workflow === stored) return;
  await req.payload.update({ collection: "story-plans", id: plan.id, data: { workflow: stored!, sidelinedFrom: null } as never, req, ...system, context: { bylineSystem: true, bylineReview: true } });
}

type Activation = { steps: RunStep[]; status: ReviewRun["status"]; failure: string | null; reviewers: number[] };

/**
 * Walks forward from `from`: skips steps that don't apply, activates the
 * first one that routes, or stops on a routing failure. `prefer` keeps the
 * reviewer who asked for changes when they are still eligible.
 */
function activateFrom(steps: RunStep[], snapshot: RunSnapshot, from: number, story: RoutingStory, directory: RoutingDirectory, prefer?: number | null): Activation {
  const next = steps.map((step) => ({ ...step }));
  for (let index = from; index < next.length; index += 1) {
    const definition = snapshot.steps[index];
    if (!definition) break;
    const resolution = resolveStep(definition, story, directory);
    if (resolution.kind === "failed") {
      next[index] = { ...next[index]!, state: "pending" };
      return { steps: next, status: "routing-failed", failure: resolution.failure, reviewers: [] };
    }
    if (resolution.kind === "queue" && prefer && resolution.userIds.includes(prefer)) {
      next[index] = activateStep(next[index]!, { kind: "person", userId: prefer, name: directory.users.get(prefer)?.name ?? "", waitingFor: resolution.waitingFor, via: resolution.via });
    } else {
      next[index] = activateStep(next[index]!, resolution);
    }
    if (next[index]!.state === "active") return { steps: next, status: "active", failure: null, reviewers: reviewerIds(next) };
  }
  return { steps: next, status: "approved", failure: null, reviewers: [] };
}

/** Everyone routed to or acting on a run, so they keep reading the Story while it is open. */
function participantsOf(run: Pick<ReviewRun, "participants"> | null, ...more: Array<number | number[]>): number[] {
  const known = (run?.participants ?? []).map((entry) => Number(relationId(entry)));
  return [...new Set([...known, ...more.flat()])].filter((id) => Number.isSafeInteger(id) && id > 0);
}

async function sealVersion(ctx: ScreenContext, storyId: number): Promise<string> {
  // A draft save (not an autosave) writes a new version row that later autosaves never overwrite.
  await ctx.req.payload.update({ collection: "stories", id: storyId, draft: true, data: {}, depth: 0, req: ctx.req, overrideAccess: false, overrideLock: false });
  const id = await latestVersionId(ctx.req, storyId);
  if (!id) throw new APIError("Byline couldn't save a version of this story to review.", 409);
  return id;
}

async function notifyReviewers(ctx: ScreenContext, storyId: number, run: Pick<ReviewRun, "steps">) {
  const steps = runSteps(run);
  const active = steps.find((step) => step.state === "active");
  if (active) await notify(ctx.req, { kind: "readyForReview", recipients: reviewerIds(steps), story: storyId, detail: active.label, dedupe: `review:${storyId}:${active.stepId}:${Date.now()}` });
}

async function routingFailed(ctx: ScreenContext, storyId: number, failure: string) {
  await notify(ctx.req, { kind: "reviewRouting", recipients: await editorRecipients(ctx.req), story: storyId, detail: failure });
  await recordStoryActivity(ctx.req, storyId, "review-routing-failed");
}

/**
 * Submit, resubmit or retry. Idempotent: submitting a Story that is already
 * waiting for review returns its review unchanged.
 */
export async function submitForReview(ctx: ScreenContext, storyId: number): Promise<ReviewState> {
  const scope = await storyScope(ctx.req);
  if (!scopeManages(scope, storyId)) throw new APIError("You can't send this story for review.", 403);

  await inTransaction(ctx.req, async () => {
    const plan = await planFor(ctx, storyId);
    await lockRow(ctx.req, "story_plans", plan.id);
    const current = await ctx.req.payload.findByID({ collection: "story-plans", id: plan.id, req: ctx.req, ...system });
    const phase = lifecyclePhase(current.workflow);
    const run = await openRun(ctx.req, storyId) ?? (phase === "ready" ? await latestRun(ctx.req, storyId) : null);
    if (run?.status === "active") return; // already waiting: a retry or a double-click
    if (phase === "pitch") throw new APIError("Accept the pitch before sending this story for review.", 409);
    if (phase === "on-hold" || phase === "dropped") throw new APIError("Resume this story before sending it for review.", 409);

    const draft = (await ctx.req.payload.findByID({ collection: "stories", id: storyId, draft: true, req: ctx.req, ...system })) as Story;
    const problems = submissionProblems(draft);
    if (problems.length) throw new APIError("Before sending this story", 422, { problems });

    const versionId = await sealVersion(ctx, storyId);
    const stamps = await mediaStamps(ctx.req, await versionDoc(ctx.req, versionId));
    const people = await loadPeople(ctx);
    const [story, directory] = await Promise.all([routingStory(ctx.req, storyId, people), routingDirectory(ctx.req)]);
    const now = new Date().toISOString();

    if (run && (run.status === "changes-requested" || run.status === "routing-failed" || run.status === "approved")) {
      // Resume the same run: approvals that still hold stay; the gate (or the first stale approval) reopens.
      const snapshot = run.snapshot as RunSnapshot;
      const fingerprint = storyFingerprint(draft as unknown as Record<string, unknown>);
      const steps = runSteps(run).map((step) => {
        if (step.state !== "approved" || !step.approval) return step;
        const reason = staleness(step.target, changedCategories(step.approval.fingerprint, fingerprint));
        return reason ? { ...step, state: "stale" as const, staleReason: reason } : step;
      });
      const gate = steps.findIndex((step) => step.state === "stale" || step.state === "pending" || step.state === "active");
      if (gate === -1) return; // nothing left to review: still approved
      const prefer = steps[gate]!.assigneeId;
      const reset = steps.map((step, index) => (index >= gate && step.state !== "skipped" ? { ...step, state: "pending" as const, assigneeId: index === gate ? null : step.assigneeId, queue: null } : step));
      const activation = activateFrom(reset, snapshot, gate, story, directory, prefer);
      const updated = await ctx.req.payload.update({
        collection: "review-runs", id: run.id, req: ctx.req, ...system,
        data: { steps: activation.steps, status: activation.status, failure: activation.failure, reviewers: activation.reviewers, participants: participantsOf(run, activation.reviewers), snapshot: withStamps(snapshot, versionId, stamps), submittedVersion: versionId, submittedAt: now, submittedBy: Number(ctx.user.id), round: (run.round ?? 1) + 1, revision: (run.revision ?? 1) + 1, statusSince: now }
      });
      await recordStoryActivity(ctx.req, storyId, run.status === "routing-failed" ? "review-submitted" : "review-resubmitted", run.id);
      if (activation.status === "routing-failed") {
        await setStage(ctx.req, current, "drafting");
        await routingFailed(ctx, storyId, activation.failure!);
      } else if (activation.status === "approved") {
        await setStage(ctx.req, current, "ready");
      } else {
        await setStage(ctx.req, current, "review");
        await notifyReviewers(ctx, storyId, updated);
      }
      return;
    }

    const workflow: ReviewWorkflowDef | null = selectWorkflow(await workflowDefs(ctx.req), story);
    const snapshot: RunSnapshot = workflow ? { workflowId: workflow.id, workflowName: workflow.name, steps: workflow.steps } : { workflowId: 0, workflowName: "", steps: [] };
    const activation: Activation = workflow
      ? activateFrom(initialSteps(snapshot), snapshot, 0, story, directory)
      : { steps: [], status: "routing-failed", failure: "No review workflow is set up.", reviewers: [] };
    const created = await ctx.req.payload.create({
      collection: "review-runs", req: ctx.req, ...system,
      data: {
        story: storyId, workflow: workflow?.id ?? null, snapshot: withStamps(snapshot, versionId, stamps), status: activation.status, round: 1, steps: activation.steps, reviewers: activation.reviewers, participants: activation.reviewers,
        submittedVersion: versionId, submittedAt: now, submittedBy: Number(ctx.user.id), decisions: [], failure: activation.failure, statusSince: now, revision: 1
      }
    });
    await recordStoryActivity(ctx.req, storyId, "review-submitted", created.id);
    if (activation.status === "routing-failed") {
      await setStage(ctx.req, current, "drafting");
      await routingFailed(ctx, storyId, activation.failure!);
    } else if (activation.status === "approved") {
      await setStage(ctx.req, current, "ready");
    } else {
      await setStage(ctx.req, current, "review");
      await notifyReviewers(ctx, storyId, created);
    }
  });
  return reviewState(ctx, storyId);
}

/* --------------------------------------------------------------- reviewing */

async function lockedOpenRun(ctx: ScreenContext, storyId: number, expectedRevision?: unknown) {
  const plan = await planFor(ctx, storyId);
  await lockRow(ctx.req, "story_plans", plan.id);
  const run = await openRun(ctx.req, storyId);
  if (!run || run.status !== "active") throw new APIError("This story isn't waiting for review.", 409);
  await lockRow(ctx.req, "review_runs", run.id);
  const fresh = await ctx.req.payload.findByID({ collection: "review-runs", id: run.id, req: ctx.req, ...system });
  if (typeof expectedRevision === "number" && expectedRevision !== fresh.revision) {
    throw new APIError("This review changed while you were reading it. Reload to see where it is.", 409);
  }
  const steps = runSteps(fresh);
  const index = steps.findIndex((step) => step.state === "active");
  if (index === -1) throw new APIError("This review has no open step.", 409);
  return { plan, run: fresh, steps, index };
}

/** Take a queued review. Editors may step in on any review (recorded as an override). */
function claimFor(ctx: ScreenContext, steps: RunStep[], index: number): { steps: RunStep[]; claimed: boolean; override: boolean } {
  const step = steps[index]!;
  const userId = Number(ctx.user.id);
  if (mayReview(step, userId)) {
    if (step.assigneeId === userId) return { steps, claimed: false, override: false };
    const next = steps.map((entry, at) => (at === index ? { ...entry, assigneeId: userId, queue: null } : entry));
    return { steps: next, claimed: true, override: false };
  }
  if (atLeast(ctx.user, "editor")) {
    const next = steps.map((entry, at) => (at === index ? { ...entry, assigneeId: userId, queue: null } : entry));
    return { steps: next, claimed: true, override: true };
  }
  throw new APIError("This review is waiting for someone else.", 403);
}

export async function claimReview(ctx: ScreenContext, storyId: number, input: { expectedRevision?: unknown }): Promise<ReviewState> {
  await inTransaction(ctx.req, async () => {
    const { run, steps, index } = await lockedOpenRun(ctx, storyId, input.expectedRevision);
    const claim = claimFor(ctx, steps, index);
    if (!claim.claimed) return;
    await ctx.req.payload.update({ collection: "review-runs", id: run.id, req: ctx.req, ...system, data: { steps: claim.steps, reviewers: reviewerIds(claim.steps), participants: participantsOf(run, Number(ctx.user.id)), revision: (run.revision ?? 1) + 1 } });
    await recordStoryActivity(ctx.req, storyId, claim.override ? "review-override" : "review-claimed", run.id);
  });
  return reviewState(ctx, storyId);
}

export async function addReviewComment(ctx: ScreenContext, storyId: number, input: { quote?: unknown; anchor?: unknown; body?: unknown; parent?: unknown }): Promise<ReviewState> {
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) throw new APIError("Write a comment first.", 400);
  if (body.length > 4000) throw new APIError("Keep comments under 4,000 characters.", 400);
  const parentId = Number(input.parent);
  if (Number.isSafeInteger(parentId) && parentId > 0) return replyToComment(ctx, storyId, parentId, body);
  await inTransaction(ctx.req, async () => {
    const { run, steps, index } = await lockedOpenRun(ctx, storyId);
    const claim = claimFor(ctx, steps, index);
    if (claim.claimed) {
      await ctx.req.payload.update({ collection: "review-runs", id: run.id, req: ctx.req, ...system, data: { steps: claim.steps, reviewers: reviewerIds(claim.steps), participants: participantsOf(run, Number(ctx.user.id)), revision: (run.revision ?? 1) + 1 } });
      await recordStoryActivity(ctx.req, storyId, claim.override ? "review-override" : "review-claimed", run.id);
    }
    const quote = typeof input.quote === "string" ? input.quote.trim().slice(0, 1000) : "";
    await ctx.req.payload.create({
      collection: "review-comments", req: ctx.req, ...system,
      data: { run: run.id, story: storyId, round: run.round ?? 1, stepId: steps[index]!.stepId, version: run.submittedVersion, quote: quote || null, anchor: sanitizeAnchor(input.anchor), body, author: Number(ctx.user.id), state: "pending" }
    });
  });
  return reviewState(ctx, storyId);
}

function sanitizeAnchor(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const int = (candidate: unknown) => (Number.isSafeInteger(Number(candidate)) && Number(candidate) >= 0 ? Number(candidate) : null);
  const start = int(raw.start);
  const end = int(raw.end);
  return start !== null && end !== null && end >= start ? { start, end, block: typeof raw.block === "string" ? raw.block.slice(0, 80) : null } : null;
}

async function replyToComment(ctx: ScreenContext, storyId: number, parentId: number, body: string): Promise<ReviewState> {
  const parent = await ctx.req.payload.findByID({ collection: "review-comments", id: parentId, req: ctx.req, overrideAccess: false, depth: 0 }).catch(() => null);
  if (!parent || !sameId(parent.story, storyId) || parent.state === "pending") throw new APIError("That comment isn't open for replies.", 404);
  const scope = await storyScope(ctx.req);
  const run = await ctx.req.payload.findByID({ collection: "review-runs", id: Number(relationId(parent.run)), req: ctx.req, ...system });
  const reviewer = runSteps(run).some((step) => step.assigneeId === Number(ctx.user.id) || step.approval?.by === Number(ctx.user.id));
  if (!scopeManages(scope, storyId) && !reviewer) throw new APIError("You can't reply here.", 403);
  await ctx.req.payload.create({
    collection: "review-comments", req: ctx.req, ...system,
    data: { run: run.id, story: storyId, round: parent.round, stepId: parent.stepId, version: parent.version, body, author: Number(ctx.user.id), state: "published", parent: parent.id, publishedAt: new Date().toISOString() }
  });
  return reviewState(ctx, storyId);
}

/** Edit or withdraw your own pending comment; resolve or reopen a published thread. */
export async function changeReviewComment(ctx: ScreenContext, storyId: number, commentId: number, input: { body?: unknown; resolved?: unknown; remove?: boolean }): Promise<ReviewState> {
  const comment = (await ctx.req.payload.findByID({ collection: "review-comments", id: commentId, req: ctx.req, overrideAccess: false, depth: 0 }).catch(() => null)) as ReviewComment | null;
  if (!comment || !sameId(comment.story, storyId)) throw new APIError("Unknown comment.", 404);
  const own = sameId(comment.author, ctx.user.id);
  if (comment.state === "pending") {
    if (!own) throw new APIError("Only its author can change a pending comment.", 403);
    if (input.remove) await ctx.req.payload.delete({ collection: "review-comments", id: commentId, req: ctx.req, ...system });
    else if (typeof input.body === "string" && input.body.trim()) await ctx.req.payload.update({ collection: "review-comments", id: commentId, req: ctx.req, ...system, data: { body: input.body.trim().slice(0, 4000) } });
    return reviewState(ctx, storyId);
  }
  if (typeof input.resolved === "boolean") {
    const scope = await storyScope(ctx.req);
    if (!scopeManages(scope, storyId) && !own) throw new APIError("You can't resolve this comment.", 403);
    await ctx.req.payload.update({
      collection: "review-comments", id: commentId, req: ctx.req, ...system,
      data: input.resolved ? { state: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: Number(ctx.user.id) } : { state: "published", resolvedAt: null, resolvedBy: null }
    });
  }
  return reviewState(ctx, storyId);
}

export async function decideReview(ctx: ScreenContext, storyId: number, input: { decision?: unknown; summary?: unknown; expectedRevision?: unknown }): Promise<ReviewState> {
  const decision = input.decision === "approve" ? "approved" : input.decision === "request-changes" ? "changes-requested" : null;
  if (!decision) throw new APIError("Choose Approve or Request changes.", 400);
  if (typeof input.expectedRevision !== "number") throw new APIError("Reload the review and try again.", 409);
  const summary = typeof input.summary === "string" && input.summary.trim() ? input.summary.trim().slice(0, 2000) : null;

  await inTransaction(ctx.req, async () => {
    const { plan, run, index, steps: before } = await lockedOpenRun(ctx, storyId, input.expectedRevision);
    const claim = claimFor(ctx, before, index);
    if (claim.override) await recordStoryActivity(ctx.req, storyId, "review-override", run.id);
    const now = new Date().toISOString();
    const userId = Number(ctx.user.id);
    const step = claim.steps[index]!;

    // Pending feedback from this reviewer is published together with the decision, never comment by comment.
    const pending = await ctx.req.payload.find({ collection: "review-comments", where: { and: [{ run: { equals: run.id } }, { author: { equals: userId } }, { state: { equals: "pending" } }] }, pagination: false, req: ctx.req, ...system });
    for (const comment of pending.docs) await ctx.req.payload.update({ collection: "review-comments", id: comment.id, req: ctx.req, ...system, data: { state: "published", publishedAt: now } });
    const record: DecisionRecord = { round: run.round ?? 1, stepId: step.stepId, decision, by: userId, at: now, version: run.submittedVersion, summary, comments: pending.docs.length };
    const decisions = [...runDecisions(run), record];
    const current = await ctx.req.payload.findByID({ collection: "story-plans", id: plan.id, req: ctx.req, ...system });

    if (decision === "changes-requested") {
      const steps = claim.steps.map((entry, at) => (at === index ? { ...entry, state: "pending" as const, assigneeId: userId, queue: null } : entry));
      await ctx.req.payload.update({ collection: "review-runs", id: run.id, req: ctx.req, ...system, data: { steps, status: "changes-requested", reviewers: [], participants: participantsOf(run, userId), decisions, revision: (run.revision ?? 1) + 1, statusSince: now } });
      await setStage(ctx.req, current, "drafting");
      await recordStoryActivity(ctx.req, storyId, "review-changes-requested", run.id);
      const story = (await ctx.req.payload.findByID({ collection: "stories", id: storyId, draft: true, req: ctx.req, ...system })) as Story;
      await notify(ctx.req, { kind: "storyReturned", recipients: writerIds(await loadPeople(ctx), story, current), story: storyId, detail: step.label });
      return;
    }

    const submitted = await versionDoc(ctx.req, run.submittedVersion);
    const fingerprint: ApprovalFingerprint = storyFingerprint((submitted ?? {}) as Record<string, unknown>);
    const approved = claim.steps.map((entry, at) => (at === index ? { ...entry, state: "approved" as const, assigneeId: userId, queue: null, staleReason: null, approval: { by: userId, at: now, version: run.submittedVersion, fingerprint } } : entry));
    const snapshot = run.snapshot as RunSnapshot;
    const people = await loadPeople(ctx);
    const [story, directory] = await Promise.all([routingStory(ctx.req, storyId, people), routingDirectory(ctx.req)]);
    const from = nextApplicableStep(snapshot.steps, index + 1, story, directory);
    const activation = from === -1
      ? { steps: approved.map((entry, at) => (at > index && entry.state === "pending" ? { ...entry, state: "skipped" as const, skipReason: "Did not apply" } : entry)), status: "approved" as const, failure: null, reviewers: [] }
      : activateFrom(approved.map((entry, at) => (at > index && at < from ? { ...entry, state: "skipped" as const, skipReason: "Did not apply" } : entry)), snapshot, from, story, directory);
    await ctx.req.payload.update({ collection: "review-runs", id: run.id, req: ctx.req, ...system, data: { steps: activation.steps, status: activation.status, failure: activation.failure, reviewers: activation.reviewers, participants: participantsOf(run, userId, activation.reviewers), decisions, revision: (run.revision ?? 1) + 1, statusSince: now } });
    await recordStoryActivity(ctx.req, storyId, activation.status === "approved" ? "review-approved" : "review-step-approved", run.id);
    if (activation.status === "approved") {
      await setStage(ctx.req, current, "ready");
      const draft = (await ctx.req.payload.findByID({ collection: "stories", id: storyId, draft: true, req: ctx.req, ...system })) as Story;
      await notify(ctx.req, { kind: "reviewComplete", recipients: writerIds(people, draft, current), story: storyId });
    } else if (activation.status === "routing-failed") {
      await routingFailed(ctx, storyId, activation.failure!);
    } else {
      await notifyReviewers(ctx, storyId, { steps: activation.steps });
    }
  });
  return reviewState(ctx, storyId);
}

/**
 * Close an open review because an editor moved the Story by hand, or it was
 * put on hold or dropped. Approvals already given stay in its history.
 */
export async function cancelOpenRun(req: PayloadRequest, storyId: number, why: "review-override" | "review-cancelled"): Promise<boolean> {
  const run = await openRun(req, storyId);
  if (!run) return false;
  await req.payload.update({ collection: "review-runs", id: run.id, req, ...system, data: { status: "cancelled", reviewers: [], revision: (run.revision ?? 1) + 1, statusSince: new Date().toISOString() } });
  await recordStoryActivity(req, storyId, why, run.id);
  return true;
}

/**
 * Stories afterChange: when a save changes text or visuals an approval
 * covered, that approval goes stale (once, with a human reason). Planning
 * changes never reach this hook: they live on the plan, not the Story.
 */
export const staleApprovalsAfterStoryChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (req.context?.bylineImport === true || !doc?.id) return doc;
  const found = await req.payload.find({
    collection: "review-runs",
    where: { and: [{ story: { equals: doc.id } }, { status: { in: ["active", "changes-requested", "routing-failed", "approved"] } }] },
    sort: "-createdAt", limit: 1, req, ...system
  });
  const run = found.docs[0];
  if (!run) return doc;
  const fingerprint = storyFingerprint(doc as Record<string, unknown>);
  let changed = false;
  const steps = runSteps(run).map((step) => {
    if (step.state !== "approved" || !step.approval) return step;
    const reason = staleness(step.target, changedCategories(step.approval.fingerprint, fingerprint));
    if (!reason) return step;
    changed = true;
    return { ...step, state: "stale" as const, staleReason: reason };
  });
  if (!changed) return doc;
  await req.payload.update({ collection: "review-runs", id: run.id, req, ...system, data: { steps, revision: (run.revision ?? 1) + 1 } });
  await recordStoryActivity(req, doc.id, "review-stale", run.id);
  return doc;
};

/* --------------------------------------------------------------- read model */

export type ReviewPerson = { id: number; name: string };
export type ReviewStepView = {
  stepId: string; label: string; target: RunStep["target"]; state: RunStep["state"];
  waitingFor: string | null; via: string | null; assignee: ReviewPerson | null; queueSize: number;
  approval: { by: ReviewPerson | null; at: string } | null; staleReason: string | null; skipReason: string | null;
};
export type ReviewCommentView = {
  id: number; round: number; stepId: string; quote: string | null; anchor: unknown; body: string; author: ReviewPerson | null;
  state: "pending" | "published" | "resolved"; createdAt: string; publishedAt: string | null; replies: ReviewCommentView[];
};
export type ReviewState = {
  storyId: number;
  phase: string;
  run: null | {
    id: number; status: ReviewRun["status"]; round: number; revision: number; workflowName: string;
    submittedAt: string; submittedBy: ReviewPerson | null; submittedVersion: string; failure: string | null;
    newerDraft: boolean; steps: ReviewStepView[];
    decisions: Array<{ round: number; stepId: string; decision: ReviewDecision["decision"]; by: ReviewPerson | null; at: string; summary: string | null; comments: number }>;
  };
  comments: ReviewCommentView[];
  /** For a reviewer who reviewed an earlier round: what changed since. */
  changesSinceYourReview: { version: string; categories: string[]; summary: string; /** Word-level and media comparison; null for imported (legacy HTML) stories, which only get the summary. */ comparison: VersionComparison | null; copySummary: string; visualSummary: string } | null;
  viewer: {
    isWriter: boolean; isEditor: boolean; canSubmit: boolean; submitLabel: string;
    canReview: boolean; canClaim: boolean; mustClaim: boolean;
  };
};

function person(users: Map<number, Pick<User, "id" | "name">>, id: number | null | undefined): ReviewPerson | null {
  if (id === null || id === undefined) return null;
  const user = users.get(Number(id));
  return user ? { id: user.id, name: user.name } : null;
}

export async function reviewState(ctx: ScreenContext, storyId: number): Promise<ReviewState> {
  const scope = await storyScope(ctx.req);
  const plans = await ctx.req.payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, limit: 1, depth: 0, req: ctx.req, overrideAccess: false });
  const plan = plans.docs[0];
  if (!plan) throw new APIError("You are not part of this story.", 403);
  const people = await loadPeople(ctx);
  const draft = (await ctx.req.payload.findByID({ collection: "stories", id: storyId, draft: true, select: { contributors: true, _status: true }, req: ctx.req, ...system })) as Story;
  const run = (await openRun(ctx.req, storyId)) ?? (await latestRun(ctx.req, storyId));
  const userId = Number(ctx.user.id);
  const isEditor = atLeast(ctx.user, "editor");
  const writers = writerIds(people, draft, plan);
  const isWriter = writers.includes(userId);
  const manages = scopeManages(scope, storyId);
  const phase = lifecyclePhase(plan.workflow, draft._status);

  const userIds = new Set<number>();
  const steps = run ? runSteps(run) : [];
  for (const step of steps) {
    if (step.assigneeId) userIds.add(step.assigneeId);
    if (step.approval) userIds.add(step.approval.by);
  }
  for (const decision of run ? runDecisions(run) : []) userIds.add(decision.by);
  if (run?.submittedBy) userIds.add(Number(relationId(run.submittedBy)));

  const comments = run
    ? (await ctx.req.payload.find({ collection: "review-comments", where: { run: { equals: run.id } }, sort: "createdAt", pagination: false, depth: 0, req: ctx.req, overrideAccess: false })).docs
    : [];
  for (const comment of comments) userIds.add(Number(relationId(comment.author)));
  const users = new Map([...people.users.values()].filter((user) => userIds.has(Number(user.id))).map((user) => [Number(user.id), { id: Number(user.id), name: user.name }]));

  const views = new Map<number, ReviewCommentView>();
  for (const comment of comments) {
    views.set(comment.id, {
      id: comment.id, round: comment.round, stepId: comment.stepId, quote: comment.quote ?? null, anchor: comment.anchor ?? null, body: comment.body,
      author: person(users, Number(relationId(comment.author))), state: comment.state, createdAt: comment.createdAt, publishedAt: comment.publishedAt ?? null, replies: []
    });
  }
  const threads: ReviewCommentView[] = [];
  for (const comment of comments) {
    const view = views.get(comment.id)!;
    const parent = relationId(comment.parent);
    if (parent !== null && views.has(Number(parent))) views.get(Number(parent))!.replies.push(view);
    else threads.push(view);
  }

  const active = steps.find((step) => step.state === "active");
  const gate = steps.find((step) => step.state === "pending" && step.waitingFor) ?? steps.find((step) => step.state === "stale");
  const canReview = Boolean(run?.status === "active" && active && (mayReview(active, userId) || isEditor));
  const latest = run ? await latestVersionId(ctx.req, storyId) : null;

  let changesSinceYourReview: ReviewState["changesSinceYourReview"] = null;
  if (run && canReview) {
    const mine = runDecisions(run).filter((decision) => decision.by === userId && decision.version !== run.submittedVersion).at(-1);
    if (mine) {
      const [then, now] = await Promise.all([versionDoc(ctx.req, mine.version), versionDoc(ctx.req, run.submittedVersion)]);
      if (then && now) {
        const categories = changedCategories(storyFingerprint(then as unknown as Record<string, unknown>), storyFingerprint(now as unknown as Record<string, unknown>));
        const imported = !(then as Story).body && !(now as Story).body;
        const comparison = imported ? null : compareVersions(buildReviewBlocks(then as unknown as SubmittedStory), buildReviewBlocks(now as unknown as SubmittedStory));
        changesSinceYourReview = { version: mine.version, categories, summary: describeChanges(categories), comparison, copySummary: comparison ? copySummary(comparison.counts) : "", visualSummary: comparison ? visualSummary(comparison.visuals) : "" };
      }
    }
  }

  const waiting = gate?.waitingFor;
  const submitLabel = run?.status === "changes-requested" && waiting ? `Resubmit to ${waiting}` : run && steps.some((step) => step.state === "stale") ? "Resubmit for review" : "Submit for review";
  const canSubmit = manages && phase !== "pitch" && phase !== "published" && phase !== "on-hold" && phase !== "dropped" && run?.status !== "active" && (phase !== "ready" || steps.some((step) => step.state === "stale"));

  return {
    storyId,
    phase,
    run: run ? {
      id: run.id, status: run.status, round: run.round ?? 1, revision: run.revision ?? 1, workflowName: (run.snapshot as RunSnapshot | null)?.workflowName ?? "",
      submittedAt: run.submittedAt, submittedBy: person(users, Number(relationId(run.submittedBy))), submittedVersion: run.submittedVersion, failure: run.failure ?? null,
      newerDraft: Boolean(latest && latest !== run.submittedVersion),
      steps: steps.map((step) => ({
        stepId: step.stepId, label: step.label, target: step.target, state: step.state, waitingFor: step.waitingFor, via: step.via,
        assignee: person(users, step.assigneeId), queueSize: step.queue?.userIds.length ?? 0,
        approval: step.approval ? { by: person(users, step.approval.by), at: step.approval.at } : null,
        staleReason: step.staleReason, skipReason: step.skipReason
      })),
      decisions: runDecisions(run).map((decision) => ({ round: decision.round, stepId: decision.stepId, decision: decision.decision, by: person(users, decision.by), at: decision.at, summary: decision.summary, comments: (decision as DecisionRecord).comments ?? 0 }))
    } : null,
    comments: threads,
    changesSinceYourReview,
    viewer: { isWriter, isEditor, canSubmit, submitLabel, canReview, canClaim: Boolean(canReview && active && active.assigneeId !== userId), mustClaim: Boolean(active && active.assigneeId === null && canReview) }
  };
}

export type SubmittedMedia = {
  id: number;
  filename: string;
  kind: "image" | "video" | "audio" | "document" | "other";
  mimeType: string;
  width: number | null;
  height: number | null;
  alt: string;
  credit: string;
  previewUrl: string | null;
  url: string | null;
  /** "changed": the file or its crop was edited after this version was submitted. "missing": it was deleted. "unknown": the review predates this check. */
  state: "unchanged" | "changed" | "missing" | "unknown";
};

function kindOf(mimeType: string): SubmittedMedia["kind"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "document";
  return "other";
}

/** The exact submitted version, for the immutable review view, with the Media it shows. Reviewers, the Story's managers and editors. */
export async function submittedVersion(ctx: ScreenContext, storyId: number): Promise<{ version: string; submittedAt: string; story: Story | null; byline: string[]; media: SubmittedMedia[] }> {
  const run = (await openRun(ctx.req, storyId)) ?? (await latestRun(ctx.req, storyId));
  if (!run) throw new APIError("This story hasn't been submitted for review.", 404);
  const scope = await storyScope(ctx.req);
  const involved = runSteps(run).some((step) => step.assigneeId === Number(ctx.user.id) || step.queue?.userIds.includes(Number(ctx.user.id)) || step.approval?.by === Number(ctx.user.id));
  if (!scopeManages(scope, storyId) && !involved) throw new APIError("You can't read this review.", 403);
  const story = await versionDoc(ctx.req, run.submittedVersion);
  const ids = story ? mediaIdsOf(buildReviewBlocks(story as unknown as SubmittedStory)) : [];
  // The Media this exact version names, nothing else: authorized by the review itself, not by Media access.
  const docs = ids.length ? (await ctx.req.payload.find({ collection: "media", where: { id: { in: ids } }, pagination: false, req: ctx.req, ...system })).docs : [];
  const stamps = new Map(((run.snapshot as RunSnapshot | null)?.media?.[run.submittedVersion] ?? []).map((stamp) => [stamp.id, stamp]));
  const known = (run.snapshot as RunSnapshot | null)?.media?.[run.submittedVersion] !== undefined;
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const media = ids.map((id): SubmittedMedia => {
    const doc = byId.get(id);
    if (!doc) return { id, filename: "", kind: "other", mimeType: "", width: null, height: null, alt: "", credit: "", previewUrl: null, url: null, state: "missing" };
    const stamp = stamps.get(id);
    const state: SubmittedMedia["state"] = !known || !stamp ? "unknown" : stamp.revision !== (doc.publicationRevision ?? 0) || stamp.filename !== (doc.filename ?? "") ? "changed" : "unchanged";
    return { id, filename: doc.filename ?? `File ${id}`, kind: kindOf(doc.mimeType ?? ""), mimeType: doc.mimeType ?? "", width: doc.width ?? null, height: doc.height ?? null, alt: doc.alt ?? "", credit: doc.creator || doc.credit || "", previewUrl: mediaPreview(doc), url: doc.url ?? null, state };
  });
  // The byline this version carries: the names a reader would see, in order.
  const bylineIds = relationIds(story?.contributors).map(Number).filter((id) => Number.isSafeInteger(id));
  const authors = bylineIds.length ? (await ctx.req.payload.find({ collection: "people", where: { id: { in: bylineIds } }, select: { name: true }, pagination: false, req: ctx.req, ...system })).docs : [];
  const byline = bylineIds.map((id) => authors.find((person) => person.id === id)?.name).filter((name): name is string => Boolean(name));
  return { version: run.submittedVersion, submittedAt: run.submittedAt, story, byline, media };
}
