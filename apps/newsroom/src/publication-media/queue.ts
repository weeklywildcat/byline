import { PUBLICATION_MEDIA_RECIPE_VERSION } from "@byline/content";
import type { Payload, PayloadRequest } from "payload";
import { markPreparationFailed } from "./state";

/** Payload Jobs Queue task and queue for publication media (one worker process runs `jobs:media`). */
export const PREPARE_PUBLICATION_MEDIA_TASK = "prepare-publication-media";
export const MEDIA_QUEUE = "media";

/** The generation a job prepares: an asset at one revision under one recipe. */
export type PreparePublicationMediaInput = { mediaId: number; revision: number; recipeVersion: number };

/** One running preparation per asset; a newer queued generation replaces an obsolete pending one. */
export const preparationConcurrencyKey = (input: { mediaId: number | string }) => `publication-media:${String(input.mediaId)}`;

/**
 * Queues preparation as the system (never through the person's Jobs access,
 * which stays administrator-only). With `req`, the job row joins that request's
 * transaction, so it exists exactly when the Media change that needs it does.
 */
export async function queuePublicationMediaPreparation(payload: Payload, input: { mediaId: number; revision: number }, req?: PayloadRequest) {
  const jobs = payload.jobs as unknown as { queue: (args: Record<string, unknown>) => Promise<{ id: number | string }> };
  return jobs.queue({
    task: PREPARE_PUBLICATION_MEDIA_TASK,
    queue: MEDIA_QUEUE,
    input: { mediaId: input.mediaId, revision: input.revision, recipeVersion: PUBLICATION_MEDIA_RECIPE_VERSION } satisfies PreparePublicationMediaInput,
    overrideAccess: true,
    ...(req ? { req } : {})
  });
}

/**
 * Queues and, if queuing itself fails, leaves the asset Failed with a reason
 * someone can act on (Retry), never a silent "preparing" forever.
 */
export async function queueOrRecordFailure(payload: Payload, input: { mediaId: number; revision: number }, req?: PayloadRequest): Promise<boolean> {
  try {
    await queuePublicationMediaPreparation(payload, input, req);
    return true;
  } catch (error) {
    payload.logger.error({ err: error, msg: `Could not queue publication media preparation for Media ${input.mediaId}` });
    await markPreparationFailed(payload, { id: input.mediaId, revision: input.revision, code: "queue-failed", message: "Byline couldn't queue this file for preparation. Retry it from Media." }, req).catch(() => undefined);
    return false;
  }
}
