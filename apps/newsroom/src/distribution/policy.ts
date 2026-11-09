import type { CollectionAfterChangeHook, PayloadRequest } from "payload";
import { relationId } from "../access/user";
import { missingIntents, policyFor } from "./model";
import { readDistributionSettings } from "./settings";

/**
 * Policy seeding (docs/distribution.md#policy): when a Story goes live for
 * the first time, create the Distribution intents its configured policy
 * expects, so nobody files the same Story into the same channels by hand.
 *
 * - Only the save that publishes the Story (the main document goes from not
 *   published to published) seeds. Drafts and autosaves never do.
 * - Once per Story: the plan's `distributionSeededAt` records it, so a
 *   republish, an unpublish/republish or a later policy change never re-seeds
 *   or brings back something skipped.
 * - Idempotent and additive: an existing destination is never duplicated
 *   (and the unique index forbids it) or overwritten.
 * - It never sends, assigns or notifies. New intents are owned by nobody.
 *
 * Runs inside the publishing request's transaction, after `syncPlan` has
 * created the plan and `afterStoryActivity` has noted that the Story went live.
 */
export const seedDistributionAfterStoryChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  const key = `bylineWentLive:${doc.id}`;
  const wentLive = req.context?.[key] === true;
  if (req.context) delete req.context[key];
  if (!wentLive || req.context?.bylineImport === true) return doc;
  try {
    await seedDistribution(req, Number(doc.id), relationId(doc.section));
  } catch (error) {
    // Distribution never blocks publishing; an editor can still add destinations on the Story.
    req.payload.logger.warn({ err: error, msg: `Could not seed Distribution for story ${doc.id}.` });
  }
  return doc;
};

/** Creates the missing configured intents for a Story once. Returns how many it created. */
export async function seedDistribution(req: PayloadRequest, storyId: number, section: unknown): Promise<number> {
  const { payload } = req;
  const system = { req, depth: 0, overrideAccess: true as const };
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, limit: 1, select: { preset: true, distributionSeededAt: true }, ...system })).docs[0];
  if (!plan || plan.distributionSeededAt) return 0;
  const settings = await readDistributionSettings(req);
  const sectionId = Number(relationId(section));
  const expected = policyFor(settings, { preset: plan.preset ?? null, section: Number.isSafeInteger(sectionId) && sectionId > 0 ? sectionId : null });
  const existing = await payload.find({ collection: "distribution-items", where: { story: { equals: storyId } }, pagination: false, select: { destination: true }, ...system });
  const create = missingIntents(expected, existing.docs.map((item) => String(item.destination)));
  for (const intent of create) {
    await payload.create({ collection: "distribution-items", data: { story: storyId, destination: intent.kind, expectation: intent.level, state: "planned", headlineMode: "story", textMode: "story", mediaMode: "story" }, ...system });
  }
  // Not a newsroom edit: no plan hooks, activity or notifications.
  await payload.db.updateOne({ collection: "story-plans", id: plan.id, data: { distributionSeededAt: new Date().toISOString() }, req });
  return create.length;
}
