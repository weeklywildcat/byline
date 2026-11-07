import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  isPublicationMediaPath,
  isSha256,
  publicationManifestBlobs,
  validatePublicationMediaManifest,
  PUBLICATION_MEDIA_PATH_PREFIX,
  PUBLICATION_MEDIA_TYPES,
  PUBLICATION_STATIC_ASSET_MAX_BYTES,
  type PublicationBlob,
  type PublicationMediaManifest
} from "@byline/content";

/**
 * Build-time acquisition of prepared publication media: the consumer half of
 * docs/publication-media.md. Given a CLOSED set of descriptors (from the
 * canonical public dataset's manifests; Phase 7 supplies them), it downloads
 * each file from the newsroom's build-only endpoint, verifies SHA-256, byte
 * count and file type while streaming, stages it, and atomically promotes it
 * to its fingerprinted `publicPath` under `out/_byline/media/`.
 *
 * Only named files are written; nothing is listed or copied wholesale. Any
 * missing blob, wrong hash, wrong size, wrong type, unsafe path or
 * authentication failure fails the build: there is no fallback to a private
 * original or any other URL. No image is transformed here.
 *
 * It is not part of the WordPress `postbuild` yet: production still uses the
 * WordPress media materializers until the Payload snapshot (Phase 7) feeds it.
 */
export type MaterializeOptions = {
  descriptors: PublicationBlob[];
  /** The newsroom build endpoint base, e.g. https://newsroom.example/api/byline/build/media */
  endpoint: string;
  /** `BYLINE_BUILD_TOKEN`. Never logged. */
  token: string;
  /** The static output root (apps/web/out). */
  outDir: string;
  concurrency?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type MaterializeResult = { written: number; unchanged: number; bytes: number };

export class PublicationMediaBuildError extends Error {}

/** The distinct blobs of a set of manifests (each validated first). */
export function descriptorsFromManifests(manifests: unknown[]): PublicationBlob[] {
  const blobs: PublicationBlob[] = [];
  manifests.forEach((value, index) => {
    const validation = validatePublicationMediaManifest(value);
    if (!validation.ok) throw new PublicationMediaBuildError(`Publication media manifest ${index} is invalid: ${validation.errors.slice(0, 3).join("; ")}`);
    blobs.push(...publicationManifestBlobs(validation.manifest as PublicationMediaManifest));
  });
  return blobs;
}

/** Validates descriptors and returns them deduplicated by public path (one path never names two contents). */
export function closedDescriptorSet(descriptors: PublicationBlob[]): PublicationBlob[] {
  const byPath = new Map<string, PublicationBlob>();
  for (const blob of descriptors) {
    if (!isSha256(blob?.sha256)) throw new PublicationMediaBuildError("A publication media descriptor has an invalid SHA-256.");
    if (!Number.isSafeInteger(blob.bytes) || blob.bytes <= 0 || blob.bytes > PUBLICATION_STATIC_ASSET_MAX_BYTES) throw new PublicationMediaBuildError(`${blob.publicPath}: invalid byte count.`);
    if (!(blob.mimeType in PUBLICATION_MEDIA_TYPES)) throw new PublicationMediaBuildError(`${blob.publicPath}: unsupported type ${blob.mimeType}.`);
    if (!isPublicationMediaPath(blob.publicPath, blob.sha256, blob.mimeType)) throw new PublicationMediaBuildError(`Unsafe or mismatched publication media path: ${String(blob.publicPath).slice(0, 120)}`);
    const existing = byPath.get(blob.publicPath);
    if (existing && (existing.sha256 !== blob.sha256 || existing.bytes !== blob.bytes)) throw new PublicationMediaBuildError(`${blob.publicPath} is named for two different files.`);
    byPath.set(blob.publicPath, blob);
  }
  return [...byPath.values()].sort((a, b) => a.publicPath.localeCompare(b.publicPath));
}

/** The file's real type from its first bytes. */
export function sniffPublicationType(head: Buffer): string | null {
  const ascii = (start: number, end: number) => head.subarray(start, end).toString("latin1");
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (ascii(4, 8) === "ftyp") return "audio/mp4";
  if (ascii(0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}

/** The output file for a public path, which must stay inside `<outDir>/_byline/media/`. */
export function outputPathFor(outDir: string, publicPath: string): string {
  const root = path.resolve(outDir, PUBLICATION_MEDIA_PATH_PREFIX.slice(1));
  const target = path.resolve(outDir, `.${publicPath}`);
  if (!target.startsWith(`${root}${path.sep}`)) throw new PublicationMediaBuildError(`Publication media path escapes the output: ${publicPath}`);
  return target;
}

async function fileMatches(file: string, blob: PublicationBlob) {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size !== blob.bytes) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex") === blob.sha256;
}

async function acquire(blob: PublicationBlob, options: Required<Pick<MaterializeOptions, "endpoint" | "token" | "outDir" | "timeoutMs">> & { fetch: typeof fetch; staging: string }): Promise<"written" | "unchanged"> {
  const target = outputPathFor(options.outDir, blob.publicPath);
  // A fingerprinted path is immutable: identical bytes already there are kept.
  if (await fileMatches(target, blob)) return "unchanged";
  const url = `${options.endpoint.replace(/\/+$/, "")}/${blob.sha256}`;
  let response: Response;
  try {
    response = await options.fetch(url, { headers: { Authorization: `Bearer ${options.token}` }, redirect: "error", signal: AbortSignal.timeout(options.timeoutMs) });
  } catch (error) {
    throw new PublicationMediaBuildError(`${blob.publicPath}: the newsroom build endpoint could not be reached (${(error as Error).message}).`);
  }
  if (response.status === 401 || response.status === 403) throw new PublicationMediaBuildError("The newsroom refused the build credential (BYLINE_BUILD_TOKEN).");
  if (response.status === 404) throw new PublicationMediaBuildError(`${blob.publicPath}: prepared file ${blob.sha256.slice(0, 16)}… is missing from the newsroom.`);
  if (!response.ok || !response.body) throw new PublicationMediaBuildError(`${blob.publicPath}: the newsroom answered ${response.status}.`);
  const temp = path.join(options.staging, `${randomUUID()}.part`);
  const hash = createHash("sha256");
  let bytes = 0;
  let head = Buffer.alloc(0);
  const out = createWriteStream(temp, { flags: "wx" });
  try {
    for await (const chunk of Readable.fromWeb(response.body as never)) {
      const data = chunk as Buffer;
      bytes += data.length;
      if (bytes > blob.bytes) throw new PublicationMediaBuildError(`${blob.publicPath}: larger than its expected ${blob.bytes} bytes.`);
      if (head.length < 16) head = Buffer.concat([head, data.subarray(0, 16 - head.length)]);
      hash.update(data);
      if (!out.write(data)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
    }
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
    const handle = await open(temp, "r");
    await handle.sync().finally(() => handle.close());
    if (bytes !== blob.bytes) throw new PublicationMediaBuildError(`${blob.publicPath}: expected ${blob.bytes} bytes, received ${bytes}.`);
    if (hash.digest("hex") !== blob.sha256) throw new PublicationMediaBuildError(`${blob.publicPath}: SHA-256 does not match its descriptor.`);
    const type = sniffPublicationType(head);
    if (type !== blob.mimeType) throw new PublicationMediaBuildError(`${blob.publicPath}: content is ${type ?? "unrecognized"}, expected ${blob.mimeType}.`);
    await mkdir(path.dirname(target), { recursive: true });
    await rename(temp, target);
    return "written";
  } catch (error) {
    out.destroy();
    await rm(temp, { force: true });
    throw error;
  }
}

export async function materializePublicationMedia(options: MaterializeOptions): Promise<MaterializeResult> {
  if (!options.token) throw new PublicationMediaBuildError("BYLINE_BUILD_TOKEN is required to acquire publication media.");
  if (!/^https?:\/\//.test(options.endpoint)) throw new PublicationMediaBuildError("The newsroom build media endpoint must be an http(s) URL.");
  const descriptors = closedDescriptorSet(options.descriptors);
  const staging = path.join(options.outDir, "_byline", `.media-staging-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  const settings = { endpoint: options.endpoint, token: options.token, outDir: options.outDir, timeoutMs: options.timeoutMs ?? 60_000, fetch: options.fetch ?? fetch, staging };
  const result: MaterializeResult = { written: 0, unchanged: 0, bytes: 0 };
  const failures: Error[] = [];
  let next = 0;
  const worker = async () => {
    while (next < descriptors.length && failures.length === 0) {
      const blob = descriptors[next++];
      try {
        const outcome = await acquire(blob, settings);
        result[outcome]++;
        result.bytes += blob.bytes;
      } catch (error) {
        failures.push(error as Error);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, 16)) }, worker));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  if (failures.length) throw failures[0] instanceof PublicationMediaBuildError ? failures[0] : new PublicationMediaBuildError(failures[0].message);
  return result;
}
