import type { TaskConfig } from "payload";
import { PREPARE_PUBLIC_SNAPSHOT_TASK, PUBLIC_SNAPSHOT_CONCURRENCY_KEY, PUBLICATION_QUEUE } from "../queue";
import { isPublicSnapshotError } from "./errors";
import { runPublicSnapshotPreparation } from "./prepare";

/**
 * `prepare-public-snapshot` on the `publication` queue, run by the dedicated
 * publication worker (`npm run jobs:publication`), never in a Next request.
 *
 * One job runs at a time (`exclusive` on the single key) and a newly queued
 * job removes older pending ones (`supersedes`). A running older job may
 * finish collecting, but its revision fence and conditional promotion keep it
 * from publishing stale output.
 *
 * Outcomes `ready`, `reused`, `stale` and `not-ready` complete the job (stale
 * work is coalescing; a not-ready snapshot is re-queued when its media
 * finishes preparing). Projection, content and storage failures fail the job
 * with a message naming the records involved, and retry.
 */
export const preparePublicSnapshotTask: TaskConfig = {
  slug: PREPARE_PUBLIC_SNAPSHOT_TASK,
  label: "Prepare public snapshot",
  inputSchema: [
    { name: "revision", type: "number", required: true },
    { name: "reason", type: "text" }
  ],
  outputSchema: [
    { name: "outcome", type: "text" },
    { name: "revision", type: "number" },
    { name: "sha256", type: "text" },
    { name: "message", type: "text" }
  ],
  concurrency: { key: () => PUBLIC_SNAPSHOT_CONCURRENCY_KEY, exclusive: true, supersedes: true },
  retries: { attempts: 2 },
  handler: async ({ req }) => {
    try {
      const result = await runPublicSnapshotPreparation(req.payload);
      switch (result.outcome) {
        case "ready":
        case "reused":
          req.payload.logger.info({ msg: `Public snapshot ${result.outcome} for revision ${result.revision} (${result.pointer.sha256.slice(0, 12)}…, ${result.pointer.bytes} bytes).` });
          return { output: { outcome: result.outcome, revision: result.revision, sha256: result.pointer.sha256, message: "" } };
        case "not-ready":
          req.payload.logger.warn({ msg: `Public snapshot for revision ${result.revision} is not ready: ${result.message} ${result.details.slice(0, 10).join(" | ")}` });
          return { output: { outcome: result.outcome, revision: result.revision, sha256: "", message: [result.message, ...result.details.slice(0, 10)].join(" | ").slice(0, 2000) } };
        case "stale":
          req.payload.logger.info({ msg: `Public snapshot for revision ${result.revision} is stale (${result.code}); the newer revision is queued.` });
          return { output: { outcome: result.outcome, revision: result.revision, sha256: "", message: result.message } };
      }
    } catch (error) {
      if (isPublicSnapshotError(error)) {
        req.payload.logger.error({ msg: `Public snapshot preparation failed (${error.code}): ${error.message} ${error.details.slice(0, 10).join(" | ")}` });
        throw new Error(`${error.code}: ${error.message} ${error.details.slice(0, 10).join(" | ")}`.slice(0, 4000));
      }
      throw error;
    }
  }
};
