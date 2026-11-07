/**
 * Operational commands for the public snapshot (docs/payload-build-snapshots.md#operations).
 *
 *   npm run publication:snapshot:status --workspace @byline/newsroom
 *   npm run publication:snapshot:prepare --workspace @byline/newsroom
 *
 * `prepare` runs the SAME preparation as the `prepare-public-snapshot` job
 * (same collector, validation, revision fence and conditional promotion), in
 * this process, and prints the outcome. Use it after deploying a new producer
 * version, after the Phase 5/7 migrations, or when discovery reports
 * "not ready". It is safe beside the worker: the fence decides.
 *
 * `status` prints safe operational facts only: never the build token, private
 * media paths or account data.
 */
import { getPayload } from "payload";
import config from "../src/payload.config";
import { readPublicationState } from "../src/db/publication-state";
import { isPublicSnapshotError } from "../src/public/snapshot/errors";
import { runPublicSnapshotPreparation, usableCompletedPointer } from "../src/public/snapshot/prepare";
import { PREPARE_PUBLIC_SNAPSHOT_TASK } from "../src/public/queue";
import { SnapshotStore } from "../src/public/snapshot/store";
import { PUBLIC_SNAPSHOT_SCHEMA_VERSION, PUBLIC_SNAPSHOT_V1_PRODUCER_VERSION } from "../src/public/snapshot/version";

const command = process.argv[2];
const payload = await getPayload({ config });
const store = new SnapshotStore();

async function status() {
  const state = await readPublicationState(payload);
  const usable = usableCompletedPointer(state);
  const completed = state.completed;
  const present = completed ? await store.verify(completed.filename, completed.sha256, completed.bytes) : false;
  const jobs = await payload.find({
    collection: "payload-jobs",
    where: { and: [{ taskSlug: { equals: PREPARE_PUBLIC_SNAPSHOT_TASK } }, { completedAt: { exists: false } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { processing: true, hasError: true, totalTried: true, createdAt: true }
  });
  const artifacts = await store.list();
  return {
    currentRevision: state.currentRevision,
    ready: Boolean(usable && present),
    schemaVersion: PUBLIC_SNAPSHOT_SCHEMA_VERSION,
    producerVersion: PUBLIC_SNAPSHOT_V1_PRODUCER_VERSION,
    completed: completed
      ? { revision: completed.revision, schemaVersion: completed.schemaVersion, producerVersion: completed.producerVersion, digest: completed.sha256, bytes: completed.bytes, generatedAt: completed.generatedAt, filename: completed.filename, artifactPresent: present }
      : null,
    pointerCorrupt: state.pointerCorrupt,
    retainedArtifacts: artifacts.length,
    pendingJobs: jobs.docs.map((job) => ({ id: job.id, processing: job.processing === true, hasError: job.hasError === true, attempts: job.totalTried ?? 0, queuedAt: job.createdAt }))
  };
}

try {
  if (command === "status") {
    console.log(JSON.stringify(await status(), null, 2));
  } else if (command === "prepare") {
    const result = await runPublicSnapshotPreparation(payload, { store });
    console.log(JSON.stringify(result, null, 2));
    if (result.outcome === "not-ready") process.exitCode = 2;
    if (result.outcome === "stale") process.exitCode = 3;
  } else {
    console.error("Usage: publication-snapshot.ts <status|prepare>");
    process.exitCode = 64;
  }
} catch (error) {
  if (isPublicSnapshotError(error)) {
    console.error(JSON.stringify({ outcome: "failed", code: error.code, message: error.message, details: error.details }, null, 2));
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await payload.destroy();
}
