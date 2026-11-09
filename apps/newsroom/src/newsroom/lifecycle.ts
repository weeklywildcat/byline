import { LIFECYCLE_TRANSITIONS, lifecyclePhase, phaseLabel, storedStage, type LifecyclePhase, type LifecycleTransition } from "@byline/newsroom-screens/story/lifecycle";
import { APIError } from "payload";
import { scopeManages, storyScope } from "../access/story-context";
import { atLeast, sameId } from "../access/user";
import { inTransaction, lockRow } from "../db/locks";
import { planFor, type ScreenContext } from "./screen-models";

/**
 * Semantic lifecycle moves (docs/story-lifecycle.md): `POST
 * /api/byline/stories/:id/lifecycle` with `{ transition, expectedRevision? }`.
 *
 * Reporters press actions, never choose stages. Submit, resubmit and approval
 * belong to the review engine (newsroom/review.ts), which moves a Story into
 * Review and Ready itself; nothing here can. Typing or autosave never moves a
 * Story: only these calls, the review engine and an editor's override do.
 *
 * Who may:
 * - Accept pitch, Put on hold, Drop, Resume: editors and the Story's assigned editor.
 * - Start drafting: anyone who manages the Story (its writers).
 */

export type LifecycleResult = { phase: string; label: string; revision: number };

const EDITORIAL: ReadonlySet<LifecycleTransition> = new Set(["accept-pitch", "put-on-hold", "drop", "resume"]);

export function isTransition(value: unknown): value is LifecycleTransition {
  return typeof value === "string" && Object.hasOwn(LIFECYCLE_TRANSITIONS, value);
}

export async function moveLifecycle(ctx: ScreenContext, storyId: number, input: { transition?: unknown; expectedRevision?: unknown }): Promise<LifecycleResult> {
  if (!isTransition(input.transition)) throw new APIError("That isn't something a Story can do.", 400);
  const transition = input.transition;
  const scope = await storyScope(ctx.req);
  if (!scopeManages(scope, storyId)) throw new APIError("You can't change this story.", 403);

  return inTransaction(ctx.req, async () => {
    const plan = await planFor(ctx, storyId);
    await lockRow(ctx.req, "story_plans", plan.id);
    const current = await ctx.req.payload.findByID({ collection: "story-plans", id: plan.id, depth: 0, req: ctx.req, overrideAccess: true });
    const revision = Date.parse(current.updatedAt);
    if (typeof input.expectedRevision === "number" && input.expectedRevision > 0 && input.expectedRevision !== revision) {
      throw new APIError("Someone else changed this story. Reload to see where it is now.", 409);
    }
    const editorial = atLeast(ctx.user, "editor") || sameId(current.editor, ctx.user.id);
    if (EDITORIAL.has(transition) && !editorial) throw new APIError("Only the story's editor can do that.", 403);

    const phase = lifecyclePhase(current.workflow) as LifecyclePhase;
    const rule = LIFECYCLE_TRANSITIONS[transition];
    if (!rule.from.includes(phase)) {
      throw new APIError(`This story is in ${phaseLabel(phase)}, so it can't do that now.`, 409);
    }
    let target: LifecyclePhase;
    if (rule.to === "previous") {
      const before = lifecyclePhase(current.sidelinedFrom ?? "reporting") as LifecyclePhase;
      // A review that was open when the Story was sidelined is not reopened: it goes back to Drafting to be resubmitted.
      target = before === "on-hold" || before === "dropped" ? "reporting" : before === "review" ? "drafting" : before;
    } else {
      target = rule.to;
    }
    const data: Record<string, unknown> = { workflow: storedStage(target) };
    if (target === "on-hold" || target === "dropped") data.sidelinedFrom = phase === "on-hold" || phase === "dropped" ? current.sidelinedFrom ?? null : current.workflow;
    else data.sidelinedFrom = null;
    const updated = await ctx.req.payload.update({
      collection: "story-plans",
      id: plan.id,
      data,
      depth: 0,
      req: ctx.req,
      // Workflow access is checked above; sidelinedFrom is system-owned.
      overrideAccess: true,
      context: { bylineSystem: true, bylineActor: ctx.user.id }
    });
    return { phase: target, label: phaseLabel(target), revision: Date.parse(updated.updatedAt) };
  });
}
