import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, open, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { publicationMediaDir } from "../../publication-media/paths";
import { PublicSnapshotError } from "./errors";
import { SNAPSHOT_FILENAME_PATTERN, snapshotFilename } from "./version";

/**
 * Immutable public snapshot artifacts on the publication volume, beside (but
 * separate from) the prepared media object store:
 *
 *   <BYLINE_PUBLICATION_MEDIA_DIR>/snapshots/v2/snapshot-v2-r<R>-<sha256>.json
 *
 * The name is the SHA-256 of the exact stored UTF-8 bytes. A write stages a
 * uniquely named temp file in the same directory (created exclusively,
 * written, fsynced, closed), then hard-links it to its final name: a link
 * never replaces an existing file, so an artifact is never overwritten. If
 * the final name already exists, its size and digest must match (it is then
 * reused); anything else is a storage failure. The database pointer is only
 * promoted after this returns.
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
  return path.join(publicationMediaDir(env), "snapshots", "v2");
}

const sha256Of = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function fileDigest(file: string): Promise<{ sha256: string; bytes: number } | null> {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return null;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return { sha256: hash.digest("hex"), bytes: info.size };
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, "r").catch(() => null);
  if (!handle) return;
  try {
    await handle.sync().catch(() => undefined);
  } finally {
    await handle.close();
  }
}

export class SnapshotStore {
  readonly directory: string;

  constructor(directory = snapshotDirectory()) {
    this.directory = directory;
  }

  /** The absolute path of a well-formed artifact name, or null for anything else. */
  pathFor(filename: string): string | null {
    if (!SNAPSHOT_FILENAME_PATTERN.test(filename)) return null;
    return path.join(this.directory, filename);
  }

  /** Writes exact bytes as an immutable artifact (or reuses an identical one). */
  async write(bytes: Uint8Array, revision: number): Promise<StoredSnapshot> {
    const sha256 = sha256Of(bytes);
    const filename = snapshotFilename(revision, sha256);
    const final = path.join(this.directory, filename);
    try {
      await mkdir(this.directory, { recursive: true });
      const existing = await fileDigest(final);
      if (existing) {
        if (existing.sha256 === sha256 && existing.bytes === bytes.byteLength) return { filename, sha256, bytes: bytes.byteLength };
        throw new PublicSnapshotError("storage-failure", `The snapshot store already holds different bytes under ${filename}.`);
      }
      const temp = path.join(this.directory, `.tmp-${randomUUID()}.json`);
      const handle = await open(temp, "wx", 0o644);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temp, final);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        // Another writer finished the same artifact first: it must be byte-identical.
        const raced = await fileDigest(final);
        if (!raced || raced.sha256 !== sha256 || raced.bytes !== bytes.byteLength) throw new PublicSnapshotError("storage-failure", `A different file appeared under ${filename}.`);
      } finally {
        await unlink(temp).catch(() => undefined);
      }
      await syncDirectory(this.directory);
      const written = await fileDigest(final);
      if (!written || written.sha256 !== sha256 || written.bytes !== bytes.byteLength) throw new PublicSnapshotError("storage-failure", `The stored snapshot ${filename} does not match the bytes written.`);
      return { filename, sha256, bytes: bytes.byteLength };
    } catch (error) {
      if (error instanceof PublicSnapshotError) throw error;
      throw new PublicSnapshotError("storage-failure", `Could not store the public snapshot: ${(error as Error).message}`);
    }
  }

  /** True when the named artifact exists with exactly this size and digest. */
  async verify(filename: string, sha256: string, bytes: number): Promise<boolean> {
    const file = this.pathFor(filename);
    if (!file) return false;
    const found = await fileDigest(file);
    return Boolean(found && found.sha256 === sha256 && found.bytes === bytes);
  }

  /** The artifact filename for a digest (artifacts are few: retention bounds them). */
  async findByDigest(sha256: string): Promise<string | null> {
    if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
    const names = await readdir(this.directory).catch(() => [] as string[]);
    return names.find((name) => SNAPSHOT_FILENAME_PATTERN.exec(name)?.[2] === sha256) ?? null;
  }

  /** Completed artifacts, newest first. */
  async list(): Promise<Array<{ filename: string; revision: number; sha256: string; mtimeMs: number; bytes: number }>> {
    const names = await readdir(this.directory).catch(() => [] as string[]);
    const entries = await Promise.all(names.map(async (filename) => {
      const match = SNAPSHOT_FILENAME_PATTERN.exec(filename);
      if (!match) return null;
      const info = await stat(path.join(this.directory, filename)).catch(() => null);
      return info?.isFile() ? { filename, revision: Number(match[1]), sha256: match[2], mtimeMs: info.mtimeMs, bytes: info.size } : null;
    }));
    return entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null).sort((a, b) => b.mtimeMs - a.mtimeMs || b.revision - a.revision);
  }

  /**
   * Retention, run only after a pointer has been promoted. Keeps the current
   * artifact always, the newest `keepNewest`, and anything inside the reader
   * grace period, up to `maxRetained` in all; removes temp files abandoned
   * for over an hour. Returns the removed names.
   */
  async prune(current: string | null, now = Date.now()): Promise<string[]> {
    const removed: string[] = [];
    const names = await readdir(this.directory).catch(() => [] as string[]);
    for (const name of names) {
      if (!name.startsWith(".tmp-")) continue;
      const info = await stat(path.join(this.directory, name)).catch(() => null);
      if (info && now - info.mtimeMs > SNAPSHOT_RETENTION.tempMaxAgeMs) {
        await unlink(path.join(this.directory, name)).catch(() => undefined);
        removed.push(name);
      }
    }
    const artifacts = (await this.list()).filter((entry) => entry.filename !== current);
    artifacts.forEach((entry, index) => {
      const retainedSoFar = index + (current ? 1 : 0);
      if (index < SNAPSHOT_RETENTION.keepNewest) return;
      const expired = now - entry.mtimeMs > SNAPSHOT_RETENTION.readerGraceMs;
      if (expired || retainedSoFar >= SNAPSHOT_RETENTION.maxRetained) removed.push(entry.filename);
    });
    for (const name of removed.filter((entry) => !entry.startsWith(".tmp-"))) await unlink(path.join(this.directory, name)).catch(() => undefined);
    return removed;
  }
}
