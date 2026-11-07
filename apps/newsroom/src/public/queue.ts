import type { Payload, PayloadRequest } from "payload";

/**
 * The public snapshot's place on Payload's Jobs Queue. There is one public
 * snapshot state per publication, so every job shares one concurrency key:
 * exclusive (one runs at a time) with `supersedes` (a newer queued job deletes
 * older pending ones). A job that is already running may finish collecting;
 * its conditional promotion keeps it from publishing stale output.
 *
 * The queue is owned by the dedicated publication worker (`npm run
 * jobs:publication`), never by the media worker or a Next request.
 */
export const PREPARE_PUBLIC_SNAPSHOT_TASK = "prepare-public-snapshot";
export const PUBLICATION_QUEUE = "publication";
export const PUBLIC_SNAPSHOT_CONCURRENCY_KEY = "public-snapshot";

/** Diagnostics only: the job always prepares whatever revision is current when it runs. */
export type PreparePublicSnapshotInput = { revision: number; reason: string };

/**
 * Queues snapshot preparation as the system. With `req`, the job row (and the
 * `supersedes` cleanup) joins the caller's transaction, so it exists exactly
 * when the public change that needs it commits. Awaited; never fire-and-forget.
 */
export async function queuePublicSnapshot(payload: Payload, input: PreparePublicSnapshotInput, req?: PayloadRequest) {
  const jobs = payload.jobs as unknown as { queue: (args: Record<string, unknown>) => Promise<{ id: number | string }> };
  return jobs.queue({
    task: PREPARE_PUBLIC_SNAPSHOT_TASK,
    queue: PUBLICATION_QUEUE,
    input: { revision: input.revision, reason: input.reason.slice(0, 120) } satisfies PreparePublicSnapshotInput,
    overrideAccess: true,
    ...(req ? { req } : {})
  });
}
