import path from "node:path";
import { PUBLICATION_MEDIA_RECIPE_VERSION, publicationManifestBlobs } from "@byline/content";
import type { Payload, TaskConfig } from "payload";
import { publicationStore, type PublicationStore } from "./blob-store";
import { privateMediaDir } from "./paths";
import { preparePublicationMedia, PreparationError } from "./prepare";
import { MEDIA_QUEUE, PREPARE_PUBLICATION_MEDIA_TASK, preparationConcurrencyKey, type PreparePublicationMediaInput } from "./queue";
import { markPreparationFailed, markPreparationStarted, promotePreparedGeneration } from "./state";
import { readCurrentRevision } from "../db/publication-state";
import { queuePublicSnapshot } from "../public/queue";

/**
 * A newly ready generation may be exactly what the current public snapshot was
 * waiting for (a published photo whose crop changed advances the public
 * revision, and that revision's snapshot cannot complete until the media is
 * ready). Re-queue snapshot preparation for the CURRENT revision without
 * advancing it; when nothing references the asset, or the snapshot is
 * already current, the snapshot job no-ops. A failure to queue is logged, not
 * fatal: the media itself is ready, and `publication:snapshot:prepare` recovers.
 */
async function requeuePublicSnapshot(payload: Payload, mediaId: number) {
  try {
    await queuePublicSnapshot(payload, { revision: await readCurrentRevision(payload), reason: `media ${mediaId} prepared` });
  } catch (error) {
    payload.logger.error({ err: error, msg: `Media ${mediaId} is ready, but the public snapshot could not be re-queued. Run publication:snapshot:prepare.` });
  }
}

export type PreparationOutcome = "ready" | "failed" | "stale" | "missing" | "worker-outdated";

type MediaRow = { id: number; filename?: string | null; mimeType?: string | null; artDirection?: unknown; publicationRevision?: number | null };

async function currentMedia(payload: Payload, id: number): Promise<MediaRow | null> {
  const found = await payload.find({ collection: "media", where: { id: { equals: id } }, depth: 0, limit: 1, overrideAccess: true, select: { filename: true, mimeType: true, artDirection: true, publicationRevision: true } });
  return (found.docs[0] as MediaRow | undefined) ?? null;
}

/**
 * Prepares one generation: an asset at one `publicationRevision`. Stale work
 * is never trusted: the revision is checked when the job starts, again after
 * the expensive part, and the promotion itself is conditional on it in one
 * SQL statement (`state.ts`), so an older running job can never replace a
 * newer result. Files written by a stale job stay unreferenced in the
 * content-addressed store (harmless; identical bytes are reused later).
 */
export async function runPublicationMediaPreparation(payload: Payload, input: PreparePublicationMediaInput, options: { store?: PublicationStore; afterPrepare?: () => Promise<void> } = {}): Promise<PreparationOutcome> {
  // A worker older than the code that queued this job must not produce older files.
  if (input.recipeVersion > PUBLICATION_MEDIA_RECIPE_VERSION) return "worker-outdated";
  const media = await currentMedia(payload, input.mediaId);
  if (!media) return "missing";
  if (media.publicationRevision !== input.revision) return "stale";
  if (!(await markPreparationStarted(payload, input.mediaId, input.revision))) return "stale";

  const fail = async (code: string, message: string) => {
    await markPreparationFailed(payload, { id: input.mediaId, revision: input.revision, code, message });
    return "failed" as const;
  };
  if (!media.filename || !media.mimeType) return fail("source-missing", "This Media record has no file.");

  let result;
  try {
    const store = options.store ?? publicationStore();
    const prepare = (row: MediaRow & { filename: string; mimeType: string }) => preparePublicationMedia({ path: path.join(privateMediaDir(), path.basename(row.filename)), mimeType: row.mimeType, filename: row.filename, artDirection: row.artDirection }, store);
    try {
      result = await prepare({ ...media, filename: media.filename, mimeType: media.mimeType });
    } catch (error) {
      // Renamed while this job was starting: the same bytes under the new name (a rename never moves the revision).
      const renamed = error instanceof PreparationError && error.code === "source-missing" ? await currentMedia(payload, input.mediaId) : null;
      if (!renamed?.filename || renamed.filename === media.filename || renamed.publicationRevision !== input.revision) throw error;
      result = await prepare({ ...media, filename: renamed.filename, mimeType: media.mimeType });
    }
    // Every named object must exist with its exact size before anything is promoted.
    for (const blob of publicationManifestBlobs(result.manifest)) {
      if (!(await store.has(blob.sha256, blob.bytes))) return fail("store-incomplete", "A prepared file is missing from the publication store.");
    }
  } catch (error) {
    if (error instanceof PreparationError) return fail(error.code, error.message);
    payload.logger.error({ err: error, msg: `Publication media preparation failed for Media ${input.mediaId}` });
    return fail("preparation-error", "Byline couldn't prepare this file. Retry it; if it fails again, re-upload the original.");
  }

  await options.afterPrepare?.();
  // Reread before promoting: an edit during preparation makes this generation obsolete.
  const after = await currentMedia(payload, input.mediaId);
  if (!after || after.publicationRevision !== input.revision) return "stale";
  const promoted = await promotePreparedGeneration(payload, { id: input.mediaId, revision: input.revision, recipeVersion: PUBLICATION_MEDIA_RECIPE_VERSION, sourceHash: result.sourceHash, manifest: result.manifest });
  if (!promoted) return "stale";
  await requeuePublicSnapshot(payload, input.mediaId);
  return "ready";
}

/**
 * `prepare-publication-media` on the `media` queue. One job per asset runs at
 * a time (exclusive key per Media ID); a newer queued generation deletes
 * older pending ones (`supersedes`). Run by the separate worker process
 * (`npm run jobs:media`), never inside a Next request.
 */
export const preparePublicationMediaTask: TaskConfig = {
  slug: PREPARE_PUBLICATION_MEDIA_TASK,
  label: "Prepare publication media",
  inputSchema: [
    { name: "mediaId", type: "number", required: true },
    { name: "revision", type: "number", required: true },
    { name: "recipeVersion", type: "number", required: true }
  ],
  outputSchema: [{ name: "outcome", type: "text" }],
  concurrency: { key: ({ input }) => preparationConcurrencyKey(input as PreparePublicationMediaInput), exclusive: true, supersedes: true },
  // Failures are recorded on the Media record and retried by a person (Retry); transient crashes retry once.
  retries: { attempts: 1 },
  handler: async ({ input, req }) => {
    const outcome = await runPublicationMediaPreparation(req.payload, input as PreparePublicationMediaInput);
    return { output: { outcome } };
  }
};

export { MEDIA_QUEUE };
