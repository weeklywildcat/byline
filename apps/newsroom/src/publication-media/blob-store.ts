import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, open, readdir, readFile, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { isSha256 } from "@byline/content";
import { privateMediaDir, publicationMediaDir } from "./paths";

/**
 * The prepared publication store: immutable, content-addressed files on the
 * newsroom's publication volume.
 *
 *   <BYLINE_PUBLICATION_MEDIA_DIR>/objects/<first two hash chars>/<full sha256>
 *   <BYLINE_PUBLICATION_MEDIA_DIR>/staging/<random>        (never served)
 *
 * Every object holds publication-safe bytes only; the key is the SHA-256 of
 * those bytes. A write stages the bytes, closes and hashes them, then promotes
 * with a hard link, which never replaces an existing object: identical bytes
 * reuse it, and different bytes can never take its name. Nothing here deletes
 * an object. A deployed or retained snapshot may still reference an older
 * generation; garbage collection waits for snapshot retention
 * (docs/publication-media.md#garbage-collection).
 *
 * This module is the only filesystem boundary for prepared files, so object
 * storage replication can be added behind it later without changing the
 * manifest or public URLs.
 */
export type StoredObject = { sha256: string; bytes: number; reused: boolean };

export class PublicationStoreError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export function publicationStore(root = publicationMediaDir()) {
  const objects = path.join(root, "objects");
  const staging = path.join(root, "staging");
  const privateRoot = privateMediaDir();
  const inside = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };
  if (inside(privateRoot, root) || inside(root, privateRoot)) {
    throw new PublicationStoreError("BYLINE_PUBLICATION_MEDIA_DIR must be a separate directory from BYLINE_MEDIA_LOCAL_DIR.", "store-misconfigured");
  }

  /** The object's location, or null for anything that is not exactly a SHA-256 (no traversal is possible). */
  const objectPath = (sha256: string): string | null => (isSha256(sha256) ? path.join(objects, sha256.slice(0, 2), sha256) : null);

  async function hashFile(file: string) {
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk as Buffer);
      bytes += (chunk as Buffer).length;
    }
    return { sha256: hash.digest("hex"), bytes };
  }

  async function sameBytes(a: string, b: string) {
    const [left, right] = await Promise.all([readFile(a), readFile(b)]);
    return left.equals(right);
  }

  return {
    root,
    objectPath,

    /** Stages bytes, verifies them after the file is closed, and promotes them under their hash. */
    async put(data: Buffer): Promise<StoredObject> {
      await mkdir(staging, { recursive: true });
      const temp = path.join(staging, `${randomUUID()}.part`);
      const handle = await open(temp, "wx", 0o644);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        const { sha256, bytes } = await hashFile(temp);
        const expected = createHash("sha256").update(data).digest("hex");
        if (sha256 !== expected || bytes !== data.length) throw new PublicationStoreError("A prepared file changed while it was written.", "store-write-mismatch");
        const target = objectPath(sha256)!;
        await mkdir(path.dirname(target), { recursive: true });
        try {
          // A hard link is atomic and refuses to replace an existing name.
          await link(temp, target);
          return { sha256, bytes, reused: false };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          if (!(await sameBytes(temp, target))) throw new PublicationStoreError(`Object ${sha256} exists with different bytes.`, "store-corrupt");
          return { sha256, bytes, reused: true };
        }
      } finally {
        await unlink(temp).catch(() => undefined);
      }
    },

    /** True when the object exists with the expected size. */
    async has(sha256: string, bytes?: number): Promise<boolean> {
      const file = objectPath(sha256);
      if (!file) return false;
      try {
        const info = await stat(file);
        return info.isFile() && (bytes === undefined || info.size === bytes);
      } catch {
        return false;
      }
    },

    /** Re-hashes an object (diagnostics and tests; the build verifies independently). */
    async verify(sha256: string): Promise<boolean> {
      const file = objectPath(sha256);
      if (!file) return false;
      try {
        return (await hashFile(file)).sha256 === sha256;
      } catch {
        return false;
      }
    },

    /** Removes staging files a crashed worker abandoned (older than an hour, so live writes are safe). Objects are never touched. */
    async clearAbandonedStaging(olderThanMs = 60 * 60 * 1000) {
      let names: string[] = [];
      try {
        names = await readdir(staging);
      } catch {
        return;
      }
      const cutoff = Date.now() - olderThanMs;
      await Promise.all(names.map(async (name) => {
        const file = path.join(staging, name);
        const info = await stat(file).catch(() => null);
        if (info && info.mtimeMs < cutoff) await rm(file, { force: true });
      }));
    }
  };
}

export type PublicationStore = ReturnType<typeof publicationStore>;
