import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, open, readdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * A directory of immutable, content-addressed artifacts on the publication
 * volume: the store behind public snapshots and Data releases.
 *
 * Every name embeds the SHA-256 of the exact stored bytes. A write stages a
 * uniquely named temp file in the same directory (created exclusively,
 * written, fsynced, closed), then hard-links it to its final name: a link
 * never replaces an existing file, so an artifact is never overwritten. If
 * the final name already exists, its size and digest must match (it is then
 * reused); anything else is a storage failure. Callers promote a database
 * pointer only after `write` returns.
 */
export type StoredArtifact = { filename: string; sha256: string; bytes: number };

export type ArtifactNaming<Meta> = {
  /** The final name for these bytes. Must match `pattern`. */
  filename: (sha256: string, meta: Meta) => string;
  /** Recognizes a completed artifact name; `digestOf` reads its SHA-256 back. */
  pattern: RegExp;
  digestOf: (match: RegExpExecArray) => string;
  /** The error a storage failure becomes (each store has its own error vocabulary). */
  failure: (message: string) => Error;
};

const sha256Of = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function fileDigest(file: string): Promise<{ sha256: string; bytes: number } | null> {
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

export class ImmutableArtifactStore<Meta> {
  readonly directory: string;
  protected readonly naming: ArtifactNaming<Meta>;

  constructor(directory: string, naming: ArtifactNaming<Meta>) {
    this.directory = directory;
    this.naming = naming;
  }

  /** The absolute path of a well-formed artifact name, or null for anything else. */
  pathFor(filename: string): string | null {
    if (!this.naming.pattern.test(filename)) return null;
    return path.join(this.directory, filename);
  }

  /** Writes exact bytes as an immutable artifact (or reuses an identical one). */
  async writeArtifact(bytes: Uint8Array, meta: Meta): Promise<StoredArtifact> {
    const sha256 = sha256Of(bytes);
    const filename = this.naming.filename(sha256, meta);
    const final = path.join(this.directory, filename);
    const ours = new WeakSet<Error>();
    const fail = (message: string) => {
      const error = this.naming.failure(message);
      ours.add(error);
      return error;
    };
    try {
      await mkdir(this.directory, { recursive: true });
      const existing = await fileDigest(final);
      if (existing) {
        if (existing.sha256 === sha256 && existing.bytes === bytes.byteLength) return { filename, sha256, bytes: bytes.byteLength };
        throw fail(`The store already holds different bytes under ${filename}.`);
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
        if (!raced || raced.sha256 !== sha256 || raced.bytes !== bytes.byteLength) throw fail(`A different file appeared under ${filename}.`);
      } finally {
        await unlink(temp).catch(() => undefined);
      }
      await syncDirectory(this.directory);
      const written = await fileDigest(final);
      if (!written || written.sha256 !== sha256 || written.bytes !== bytes.byteLength) throw fail(`The stored artifact ${filename} does not match the bytes written.`);
      return { filename, sha256, bytes: bytes.byteLength };
    } catch (error) {
      if (error instanceof Error && ours.has(error)) throw error;
      throw this.naming.failure(`Could not store the artifact: ${(error as Error).message}`);
    }
  }

  /** True when the named artifact exists with exactly this size and digest. */
  async verify(filename: string, sha256: string, bytes: number): Promise<boolean> {
    const file = this.pathFor(filename);
    if (!file) return false;
    const found = await fileDigest(file);
    return Boolean(found && found.sha256 === sha256 && found.bytes === bytes);
  }

  /** The verified bytes of an artifact, or null when it is missing or does not match. */
  async readVerified(filename: string, sha256: string, bytes: number): Promise<Buffer | null> {
    const file = this.pathFor(filename);
    if (!file) return null;
    const content = await readFile(file).catch(() => null);
    return content && content.byteLength === bytes && sha256Of(content) === sha256 ? content : null;
  }

  /** The artifact filename for a digest. */
  async findByDigest(sha256: string): Promise<string | null> {
    if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
    const names = await readdir(this.directory).catch(() => [] as string[]);
    return names.find((name) => {
      const match = this.naming.pattern.exec(name);
      return match ? this.naming.digestOf(match) === sha256 : false;
    }) ?? null;
  }

  /** Completed artifacts, newest first. */
  async listArtifacts(): Promise<Array<{ filename: string; match: RegExpExecArray; sha256: string; mtimeMs: number; bytes: number }>> {
    const names = await readdir(this.directory).catch(() => [] as string[]);
    const entries = await Promise.all(names.map(async (filename) => {
      const match = this.naming.pattern.exec(filename);
      if (!match) return null;
      const info = await stat(path.join(this.directory, filename)).catch(() => null);
      return info?.isFile() ? { filename, match, sha256: this.naming.digestOf(match), mtimeMs: info.mtimeMs, bytes: info.size } : null;
    }));
    return entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null).sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  /** Removes temp files abandoned for longer than `maxAgeMs`. Returns their names. */
  async removeAbandonedTemps(maxAgeMs: number, now = Date.now()): Promise<string[]> {
    const removed: string[] = [];
    for (const name of await readdir(this.directory).catch(() => [] as string[])) {
      if (!name.startsWith(".tmp-")) continue;
      const info = await stat(path.join(this.directory, name)).catch(() => null);
      if (info && now - info.mtimeMs > maxAgeMs) {
        await unlink(path.join(this.directory, name)).catch(() => undefined);
        removed.push(name);
      }
    }
    return removed;
  }

  protected async remove(names: string[]): Promise<void> {
    for (const name of names) if (this.pathFor(name)) await unlink(path.join(this.directory, name)).catch(() => undefined);
  }
}
