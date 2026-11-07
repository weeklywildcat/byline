import type { Payload } from "payload";
import { promoteCompletedSnapshot, readCurrentRevision, readPublicationState, type CompletedSnapshotPointer, type PublicationStateRow } from "../../db/publication-state";
import { collectPublicSnapshot, type PublicSnapshotV1 } from "./collect";
import { isPublicSnapshotError, PublicSnapshotError } from "./errors";
import { assertPublicSafe } from "./privacy";
import { SnapshotStore } from "./store";
import { PUBLIC_SNAPSHOT_SCHEMA_VERSION, PUBLIC_SNAPSHOT_V1_PRODUCER_VERSION } from "./version";

/**
 * Snapshot preparation with a revision fence instead of a global lock
 * (docs/payload-build-snapshots.md#the-revision-fence):
 *
 *   read current revision R
 *   → collect the complete public projection for R (no transaction held, no
 *     rows locked, reporters keep publishing)
 *   → validate projection, media and privacy
 *   → serialize the exact artifact bytes
 *   → reread the revision: changed → stale, nothing promoted
 *   → write the immutable artifact
 *   → promote the pointer WHERE current_revision = R (one statement)
 *   → retention.
 *
 * A public transaction is atomic (content + revision become visible
 * together), so a collector sees either all of it or none of it; if the
 * revision moved while collecting, the fence stops a mixed result from ever
 * becoming current. A stale outcome is normal coalescing: the newer revision
 * has its own queued job.
 */

/** Exact UTF-8 bytes of a snapshot: the one serialization the digest, the store and the endpoints share. */
export function serializePublicSnapshot(snapshot: PublicSnapshotV1): Buffer {
  return Buffer.from(JSON.stringify(snapshot), "utf8");
}

export type SnapshotBuildResult = { snapshot: PublicSnapshotV1; bytes: Buffer };

/**
 * Collects, validates, privacy-checks and serializes the projection for
 * `revision`, then proves the public revision is still `revision`. Shared by
 * the job and the direct-source recovery endpoint: one projection.
 */
export async function buildPublicSnapshotBytes(payload: Payload, revision: number, options: { afterCollect?: () => Promise<void>; afterRead?: () => Promise<void>; now?: () => Date } = {}): Promise<SnapshotBuildResult> {
  let snapshot: PublicSnapshotV1;
  try {
    snapshot = await collectPublicSnapshot(payload, { revision, afterRead: options.afterRead, now: options.now });
  } catch (error) {
    // A collector that raced a public change can see inconsistent inputs; that is staleness, not a fault.
    if ((await readCurrentRevision(payload)) !== revision) throw new PublicSnapshotError("stale-revision", `Public revision moved past ${revision} while collecting.`);
    throw error;
  }
  await options.afterCollect?.();
  const bytes = serializePublicSnapshot(snapshot);
  assertPublicSafe(snapshot, bytes.toString("utf8"));
  const current = await readCurrentRevision(payload);
  if (current !== revision) throw new PublicSnapshotError("stale-revision", `Public revision moved from ${revision} to ${current} while collecting.`);
  return { snapshot, bytes };
}

/** A completed pointer the current producer may advertise for the current revision. */
export function usableCompletedPointer(state: PublicationStateRow): CompletedSnapshotPointer | null {
  const pointer = state.completed;
  if (!pointer || state.pointerCorrupt) return null;
  return pointer.revision === state.currentRevision && pointer.schemaVersion === PUBLIC_SNAPSHOT_SCHEMA_VERSION && pointer.producerVersion === PUBLIC_SNAPSHOT_V1_PRODUCER_VERSION ? pointer : null;
}

export type PreparationOutcome =
  | { outcome: "ready" | "reused"; revision: number; pointer: CompletedSnapshotPointer; pruned?: string[] }
  | { outcome: "stale"; revision: number; code: "stale-revision" | "promotion-lost"; message: string }
  | { outcome: "not-ready"; revision: number; code: "media-not-ready" | "public-input-not-ready"; message: string; details: string[] };

export type PreparationHooks = {
  /** After the inputs are read, before the projection is built (tests: deterministic races). */
  afterRead?: () => Promise<void>;
  /** After collection and serialization, before the fence (tests). */
  afterCollect?: () => Promise<void>;
  /** After the artifact is written, before the conditional promotion (tests). */
  beforePromote?: () => Promise<void>;
};

/**
 * Prepares (or confirms) the completed snapshot for the CURRENT public
 * revision. Throws `PublicSnapshotError` for problems a person or the
 * infrastructure must fix (invalid projection, unsupported story content,
 * storage); returns `stale` and `not-ready` outcomes, which resolve on their
 * own (a newer job, a finished media preparation re-queues this task).
 */
export async function runPublicSnapshotPreparation(payload: Payload, options: { store?: SnapshotStore; hooks?: PreparationHooks; now?: () => Date } = {}): Promise<PreparationOutcome> {
  const store = options.store ?? new SnapshotStore();
  const state = await readPublicationState(payload);
  const revision = state.currentRevision;
  const usable = usableCompletedPointer(state);
  if (usable && (await store.verify(usable.filename, usable.sha256, usable.bytes))) return { outcome: "reused", revision, pointer: usable };

  let built: SnapshotBuildResult;
  try {
    built = await buildPublicSnapshotBytes(payload, revision, { afterRead: options.hooks?.afterRead, afterCollect: options.hooks?.afterCollect, now: options.now });
  } catch (error) {
    if (isPublicSnapshotError(error) && error.code === "stale-revision") return { outcome: "stale", revision, code: "stale-revision", message: error.message };
    if (isPublicSnapshotError(error) && (error.code === "media-not-ready" || error.code === "public-input-not-ready")) {
      return { outcome: "not-ready", revision, code: error.code, message: error.message, details: error.details };
    }
    throw error;
  }

  const stored = await store.write(built.bytes, revision);
  await options.hooks?.beforePromote?.();
  const pointer: CompletedSnapshotPointer = {
    revision,
    schemaVersion: PUBLIC_SNAPSHOT_SCHEMA_VERSION,
    sha256: stored.sha256,
    bytes: stored.bytes,
    generatedAt: built.snapshot.generatedAt,
    filename: stored.filename,
    producerVersion: PUBLIC_SNAPSHOT_V1_PRODUCER_VERSION
  };
  // The orphaned artifact of a lost promotion is harmless; retention removes it later.
  if (!(await promoteCompletedSnapshot(payload, pointer))) return { outcome: "stale", revision, code: "promotion-lost", message: `Public revision moved past ${revision} before promotion.` };
  const pruned = await store.prune(stored.filename).catch((error) => {
    payload.logger.warn({ err: error, msg: "Public snapshot retention could not run; it will retry after the next promotion." });
    return [] as string[];
  });
  return { outcome: "ready", revision, pointer, pruned };
}
