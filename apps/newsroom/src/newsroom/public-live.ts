import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { LiveCoverage } from "@byline/core";
import type { Endpoint, Payload, PayloadRequest } from "payload";
import { readCurrentRevision } from "../db/publication-state";
import type { PreparedMediaCatalog } from "../public/snapshot/media";
import { loadPublicLive } from "./live-coverage";

/**
 * What a reader's browser reads straight from the newsroom while a Story's
 * coverage is live (docs/live-coverage.md). The static site still carries the
 * whole timeline and its `/_byline/live/<id>.json` archive; these routes only
 * close the gap between a published update and the next deploy, and once
 * coverage ends the page stops calling them.
 *
 * - `GET /api/byline/live/:id`: the published projection, the same contract
 *   the static build validates. Anonymous, no cookies, any origin.
 * - `GET /api/byline/live/:id/media?path=/_byline/media/...`: one prepared
 *   publication file that this projection names (an update photo or a byline
 *   portrait), for a photo whose deploy has not landed yet. Nothing else can
 *   be named: no Media IDs, no originals, no other Story's files.
 *
 * Every reader polls, so a Story's projection is reused while the public
 * revision is unchanged (any public write advances it), for at most
 * `MAX_AGE_MS`, and concurrent requests share one read.
 */

export const PUBLIC_LIVE_FEED_PATH = "/byline/live/:id";
export const PUBLIC_LIVE_MEDIA_PATH = "/byline/live/:id/media";

const MAX_AGE_MS = 30_000;
const MAX_ENTRIES = 64;
const PUBLIC_HEADERS = { "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" } as const;
const NO_STORE = { ...PUBLIC_HEADERS, "Cache-Control": "no-store" } as const;

type Loaded = { coverage: LiveCoverage; catalog: PreparedMediaCatalog } | null;
type Entry = { revision: number; at: number; value: Promise<Loaded> };
const cache = new Map<number, Entry>();

/** Test hook: forget every cached projection. */
export function clearPublicLiveCache() {
  cache.clear();
}

export async function cachedPublicLive(payload: Payload, storyId: number, now = Date.now()): Promise<Loaded> {
  const revision = await readCurrentRevision(payload);
  const entry = cache.get(storyId);
  if (entry && entry.revision === revision && now - entry.at < MAX_AGE_MS) return entry.value;
  const value = loadPublicLive(payload, storyId);
  cache.delete(storyId);
  cache.set(storyId, { revision, at: now, value });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  // A failed read is never reused.
  value.catch(() => { if (cache.get(storyId)?.value === value) cache.delete(storyId); });
  return value;
}

function storyId(req: PayloadRequest): number | null {
  const id = Number((req.routeParams as { id?: string } | undefined)?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const reply = (body: unknown, status: number, headers: Record<string, string>) => Response.json(body, { status, headers });

export async function servePublicLiveFeed(req: PayloadRequest): Promise<Response> {
  try {
    const id = storyId(req);
    const live = id ? await cachedPublicLive(req.payload, id) : null;
    // A short shared lifetime lets a CDN in front of the newsroom absorb the polling.
    return live
      ? reply(live.coverage, 200, { ...PUBLIC_HEADERS, "Cache-Control": "public, max-age=5" })
      : reply({ message: "Coverage not found." }, 404, NO_STORE);
  } catch (error) {
    req.payload.logger.error({ err: error, msg: "Public live feed failed" });
    return reply({ message: "Live coverage is unavailable." }, 502, NO_STORE);
  }
}

/** The public paths the projection itself names: update photos and byline portraits. */
function namedPaths(coverage: LiveCoverage): Set<string> {
  return new Set(coverage.updates.flatMap((update) => [update.image?.url, update.authorPhoto?.url].filter((url): url is string => Boolean(url))));
}

export async function servePublicLiveMedia(req: PayloadRequest): Promise<Response> {
  const missing = () => reply({ message: "No such file." }, 404, NO_STORE);
  try {
    const id = storyId(req);
    const path = req.searchParams?.get("path") ?? "";
    if (!id || !path.startsWith("/_byline/media/")) return missing();
    const live = await cachedPublicLive(req.payload, id);
    if (!live || !namedPaths(live.coverage).has(path)) return missing();
    const blob = live.catalog.blobAt(path);
    const file = blob ? live.catalog.objectPath(blob.sha256) : null;
    if (!blob || !file) return missing();
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size !== blob.bytes) return missing();
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        ...PUBLIC_HEADERS,
        "Content-Type": blob.mimeType,
        "Content-Length": String(info.size),
        // The path is content-addressed, exactly like the static copy the next deploy serves.
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch (error) {
    req.payload.logger.error({ err: error, msg: "Public live media failed" });
    return reply({ message: "Live coverage is unavailable." }, 502, NO_STORE);
  }
}

export const publicLiveEndpoints: Endpoint[] = [
  { path: PUBLIC_LIVE_FEED_PATH, method: "get", handler: servePublicLiveFeed },
  { path: PUBLIC_LIVE_MEDIA_PATH, method: "get", handler: servePublicLiveMedia }
];
