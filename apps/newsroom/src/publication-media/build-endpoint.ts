import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { isSha256 } from "@byline/content";
import type { Endpoint, PayloadRequest } from "payload";
import { publicationStore } from "./blob-store";

/**
 * `GET /api/byline/build/media/:sha256`: the static build's only way to
 * acquire prepared publication files. Not part of the signed-in newsroom:
 * it accepts only the dedicated `BYLINE_BUILD_TOKEN` (bearer), compared in
 * constant time and never logged. Without a configured token the endpoint
 * does not exist (404), and the newsroom runs normally.
 *
 * It serves exactly one content-addressed object from
 * `BYLINE_PUBLICATION_MEDIA_DIR/objects`: the path is built from a validated
 * 64-character SHA-256, so nothing else (no listing, no traversal, no Media
 * ID, never `BYLINE_MEDIA_LOCAL_DIR` originals) can be named. The store holds
 * only publication-safe bytes, so no database read is needed per download.
 * The build verifies the hash, size and type itself.
 */
export const BUILD_MEDIA_PATH = "/byline/build/media/:sha256";
const MIN_TOKEN_LENGTH = 32;
const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Constant-time comparison of a presented bearer credential with the configured one. */
export function buildTokenMatches(presented: string | null | undefined, configured: string | undefined): boolean {
  if (!configured || configured.length < MIN_TOKEN_LENGTH || !presented) return false;
  return timingSafeEqual(digest(presented), digest(configured));
}

function bearer(req: PayloadRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

const refuse = (status: number, message: string) => Response.json({ message }, { status, headers: NO_STORE });

export async function serveBuildMedia(req: PayloadRequest, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const configured = env.BYLINE_BUILD_TOKEN;
  if (!configured || configured.length < MIN_TOKEN_LENGTH) return refuse(404, "Not found.");
  if (!buildTokenMatches(bearer(req), configured)) return refuse(401, "A build credential is required.");
  const sha256 = String(req.routeParams?.sha256 ?? "");
  if (!isSha256(sha256)) return refuse(400, "Expected a SHA-256.");
  const file = publicationStore().objectPath(sha256);
  if (!file) return refuse(400, "Expected a SHA-256.");
  let size: number;
  try {
    const info = await stat(file);
    if (!info.isFile()) return refuse(404, "No such prepared file.");
    size = info.size;
  } catch {
    return refuse(404, "No such prepared file.");
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "application/octet-stream", "Content-Length": String(size), "X-Byline-Sha256": sha256 }
  });
}

export const buildMediaEndpoint: Endpoint = { path: BUILD_MEDIA_PATH, method: "get", handler: (req) => serveBuildMedia(req) };
