import path from "node:path";
import { publicationMediaDir } from "../../publication-media/paths";
import { ImmutableArtifactStore } from "../artifacts/store";
import { PublicSnapshotError } from "./errors";
import { PUBLIC_SNAPSHOT_SCHEMA_VERSION, SNAPSHOT_FILENAME_PATTERN, snapshotFilename } from "./version";

/**
 * Immutable public snapshot artifacts on the publication volume, beside (but
 * separate from) the prepared media object store:
 *
 *   <BYLINE_PUBLICATION_MEDIA_DIR>/snapshots/v<schema>/snapshot-v<schema>-r<R>-<sha256>.json
 *
 * Writing, verification and lookup are the shared immutable artifact store
 * (`public/artifacts/store.ts`, also behind Data releases). This adds the
 * snapshot naming and retention.
 */
export const SNAPSHOT_RETENTION = {
  /** Newest completed artifacts always kept, besides the current one. */
  keepNewest: 4,
  /** Older artifacts stay this long so a build that already discovered one can finish. */
  readerGraceMs: 24 * 60 * 60 * 1000,
  /** Never more than this many artifacts kept, however fast revisions arrive. */
  maxRetained: 20,
  /** Abandoned temp files older than this are removed. */
  tempMaxAgeMs: 60 * 60 * 1000
} as const;

export type StoredSnapshot = { filename: string; sha256: string; bytes: number };

export function snapshotDirectory(env: Record<string, string | undefined> = process.env): string {
  return path.join(publicationMediaDir(env), "snapshots", `v${PUBLIC_SNAPSHOT_SCHEMA_VERSION}`);
}

export class SnapshotStore extends ImmutableArtifactStore<number> {
  constructor(directory = snapshotDirectory()) {
    super(directory, {
      filename: (sha256, revision) => snapshotFilename(revision, sha256),
      pattern: SNAPSHOT_FILENAME_PATTERN,
      digestOf: (match) => match[2],
      failure: (message) => new PublicSnapshotError("storage-failure", message.startsWith("Could not store") ? message.replace("the artifact", "the public snapshot") : message)
    });
  }

  /** Writes exact bytes as an immutable artifact (or reuses an identical one). */
  write(bytes: Uint8Array, revision: number): Promise<StoredSnapshot> {
    return this.writeArtifact(bytes, revision);
  }

  /** Completed artifacts, newest first. */
  async list(): Promise<Array<{ filename: string; revision: number; sha256: string; mtimeMs: number; bytes: number }>> {
    return (await this.listArtifacts())
      .map(({ filename, match, sha256, mtimeMs, bytes }) => ({ filename, revision: Number(match[1]), sha256, mtimeMs, bytes }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs || b.revision - a.revision);
  }

  /**
   * Retention, run only after a pointer has been promoted. Keeps the current
   * artifact always, the newest `keepNewest`, and anything inside the reader
   * grace period, up to `maxRetained` in all; removes temp files abandoned
   * for over an hour. Returns the removed names.
   */
  async prune(current: string | null, now = Date.now()): Promise<string[]> {
    const removed = await this.removeAbandonedTemps(SNAPSHOT_RETENTION.tempMaxAgeMs, now);
    const expired: string[] = [];
    const artifacts = (await this.list()).filter((entry) => entry.filename !== current);
    artifacts.forEach((entry, index) => {
      const retainedSoFar = index + (current ? 1 : 0);
      if (index < SNAPSHOT_RETENTION.keepNewest) return;
      const old = now - entry.mtimeMs > SNAPSHOT_RETENTION.readerGraceMs;
      if (old || retainedSoFar >= SNAPSHOT_RETENTION.maxRetained) expired.push(entry.filename);
    });
    await this.remove(expired);
    return [...removed, ...expired];
  }
}
