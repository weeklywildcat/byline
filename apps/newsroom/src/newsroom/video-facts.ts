import { isoDurationSeconds, normalizePrimaryVideo, parseYouTubeVideoId, youTubeWatchUrl, type PrimaryVideo } from "@byline/core";
import type { CollectionAfterChangeHook, Payload, PayloadRequest, TaskConfig } from "payload";

/**
 * YouTube facts for video stories (title, thumbnail, duration, upload date).
 *
 * The WordPress plugin looked these up on save and cached them in postmeta
 * (`includes/content/story-video.php`). Here they are a background job that
 * writes the private `video-facts` collection, keyed by video ID, so a lookup
 * never creates a Story version, never blocks a save, and is shared by every
 * story that uses the video. The snapshot and the Live Preview read them with
 * `videoFactsFor()`; a story without facts still renders with the embed and
 * its own headline.
 *
 * Uses the YouTube Data API when `BYLINE_YOUTUBE_API_KEY` (or
 * `YOUTUBE_API_KEY`) is set, otherwise YouTube's keyless oEmbed endpoint (title
 * and thumbnail only; no duration, so `VideoObject.duration` is omitted rather
 * than invented). Only the two fixed YouTube hosts below are ever contacted.
 */

export const VIDEO_FACTS_QUEUE = "maintenance";
export const REFRESH_VIDEO_FACTS_TASK = "refresh-video-facts";

const LOOKUP_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 262_144;
/** A video YouTube does not know is rechecked this often, at most {@link MAX_ATTEMPTS} times. */
const RETRY_AFTER_MS = 6 * 3600_000;
const MAX_ATTEMPTS = 4;
const DESCRIPTION_MAX = 5000;
const TITLE_MAX = 300;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Facts = Partial<PrimaryVideo> & { source?: "youtube-data-api" | "youtube-oembed" };
type Item = Record<string, unknown>;

const isRecord = (value: unknown): value is Item => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const httpsUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
};

/** A normalized YouTube Data API `videos` item. Live streams report `P0D`: a zero duration is omitted, never invented. */
export function factsFromDataApi(videoId: string, item: unknown): Facts | null {
  if (!isRecord(item) || item.id !== videoId) return null;
  const snippet = isRecord(item.snippet) ? item.snippet : {};
  const thumbnails = isRecord(snippet.thumbnails) ? snippet.thumbnails : {};
  let thumbnailUrl = "";
  for (const size of ["maxres", "standard", "high", "medium", "default"]) {
    const candidate = isRecord(thumbnails[size]) ? httpsUrl((thumbnails[size] as Item).url) : "";
    if (candidate) { thumbnailUrl = candidate; break; }
  }
  const published = typeof snippet.publishedAt === "string" ? Date.parse(snippet.publishedAt) : NaN;
  const duration = isRecord(item.contentDetails) && typeof item.contentDetails.duration === "string" ? item.contentDetails.duration : "";
  return {
    videoId,
    title: clean(snippet.title, TITLE_MAX),
    description: clean(snippet.description, DESCRIPTION_MAX),
    thumbnailUrl,
    ...(Number.isFinite(published) ? { uploadDate: new Date(published).toISOString() } : {}),
    ...(isoDurationSeconds(duration) !== null ? { duration } : {}),
    source: "youtube-data-api"
  };
}

/** Title and thumbnail from YouTube's keyless oEmbed endpoint. */
export function factsFromOEmbed(videoId: string, data: unknown): Facts | null {
  if (!isRecord(data)) return null;
  return { videoId, title: clean(data.title, TITLE_MAX), thumbnailUrl: httpsUrl(data.thumbnail_url), source: "youtube-oembed" };
}

async function remoteJson(fetcher: Fetch, url: string): Promise<{ status: "ok"; data: unknown } | { status: "missing" } | { status: "error" }> {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS), redirect: "error", headers: { accept: "application/json" } });
    // oEmbed answers 401/404 for private, deleted or embed-disabled videos.
    if (response.status === 404 || response.status === 401 || response.status === 403) return { status: "missing" };
    if (!response.ok) return { status: "error" };
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) return { status: "error" };
    return { status: "ok", data: JSON.parse(text) };
  } catch {
    return { status: "error" };
  }
}

export const youTubeApiKey = (env: Record<string, string | undefined> = process.env) => (env.BYLINE_YOUTUBE_API_KEY ?? env.YOUTUBE_API_KEY ?? "").trim();

/**
 * Looks a video up. `found` carries validated facts; `missing` means YouTube
 * does not know (or will not describe) the video; `error` is transient.
 */
export async function lookupVideoFacts(videoId: string, options: { fetch?: Fetch; apiKey?: string } = {}): Promise<{ result: "found"; facts: PrimaryVideo & { source?: string } } | { result: "missing" | "error" }> {
  const fetcher = options.fetch ?? fetch;
  const key = options.apiKey ?? youTubeApiKey();
  let missing = false;
  if (key) {
    const api = await remoteJson(fetcher, `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: "snippet,contentDetails", id: videoId, key })}`);
    if (api.status === "ok") {
      const items = isRecord(api.data) && Array.isArray(api.data.items) ? api.data.items : [];
      const facts = factsFromDataApi(videoId, items[0]);
      const video = facts ? normalizePrimaryVideo(facts) : null;
      if (video) return { result: "found", facts: { ...video, source: facts!.source } };
      missing = true;
    }
  }
  const oembed = await remoteJson(fetcher, `https://www.youtube.com/oembed?${new URLSearchParams({ url: youTubeWatchUrl(videoId), format: "json" })}`);
  if (oembed.status === "ok") {
    const facts = factsFromOEmbed(videoId, oembed.data);
    const video = facts ? normalizePrimaryVideo(facts) : null;
    if (video) return { result: "found", facts: { ...video, source: facts!.source } };
    return { result: "missing" };
  }
  return { result: oembed.status === "missing" || missing ? "missing" : "error" };
}

type FactsRow = { id: number | string; status?: string | null; data?: unknown; fetchedAt?: string | null; attempts?: number | null };
const system = (req?: PayloadRequest) => ({ req, depth: 0, overrideAccess: true as const });

async function factsRow(payload: Payload, videoId: string, req?: PayloadRequest): Promise<FactsRow | null> {
  const { docs } = await payload.find({ collection: "video-facts", where: { videoId: { equals: videoId } }, limit: 1, ...system(req) });
  return (docs[0] as FactsRow | undefined) ?? null;
}

/** Validated facts for the given video IDs (found rows only). One query; never throws on a missing table row. */
export async function videoFactsFor(payload: Payload, videoIds: readonly string[], req?: PayloadRequest): Promise<Map<string, PrimaryVideo>> {
  const ids = [...new Set(videoIds)];
  const facts = new Map<string, PrimaryVideo>();
  if (!ids.length) return facts;
  const { docs } = await payload.find({ collection: "video-facts", where: { and: [{ videoId: { in: ids } }, { status: { equals: "found" } }] }, pagination: false, ...system(req) });
  for (const row of docs as FactsRow[]) {
    const video = isRecord(row.data) ? normalizePrimaryVideo({ ...row.data, provider: "youtube" }) : null;
    if (video) facts.set(video.videoId, video);
  }
  return facts;
}

/**
 * Whether a video story needs a lookup now: no row yet, or an `unavailable` row
 * that is old enough to try again and not out of attempts.
 */
export function lookupDue(row: Pick<FactsRow, "status" | "fetchedAt" | "attempts"> | null, now = Date.now()): boolean {
  if (!row) return true;
  if (row.status === "found") return false;
  return (row.attempts ?? 0) < MAX_ATTEMPTS && now - Date.parse(row.fetchedAt ?? "") >= RETRY_AFTER_MS;
}

export async function queueVideoFacts(payload: Payload, videoId: string, req?: PayloadRequest) {
  const jobs = payload.jobs as unknown as { queue: (args: Record<string, unknown>) => Promise<unknown> };
  await jobs.queue({ task: REFRESH_VIDEO_FACTS_TASK, queue: VIDEO_FACTS_QUEUE, input: { videoId }, ...(req ? { req } : {}) });
}

/**
 * Stories afterChange: a video story with a YouTube URL whose video has no
 * facts yet queues a lookup. Never blocks or fails the save.
 */
export const queueFactsAfterStoryChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  try {
    const videoId = doc?.format === "video" ? parseYouTubeVideoId(doc.video?.url) : null;
    if (!videoId || req.context?.bylineImport === true) return doc;
    if (!lookupDue(await factsRow(req.payload, videoId, req))) return doc;
    await queueVideoFacts(req.payload, videoId, req);
  } catch (error) {
    req.payload.logger.warn({ err: error, msg: "Could not queue a YouTube lookup for a video story." });
  }
  return doc;
};

/** Looks one video up and records the outcome. Returns what happened, for the job output and tests. */
export async function refreshVideoFacts(payload: Payload, videoId: string, options: { fetch?: Fetch; apiKey?: string; now?: () => Date; req?: PayloadRequest } = {}): Promise<"found" | "unavailable" | "error" | "skipped"> {
  if (!parseYouTubeVideoId(`https://youtu.be/${videoId}`)) return "skipped";
  const now = (options.now ?? (() => new Date()))();
  const row = await factsRow(payload, videoId, options.req);
  if (row?.status === "found" && Date.now() - Date.parse(row.fetchedAt ?? "") < RETRY_AFTER_MS * 4) return "skipped";
  const outcome = await lookupVideoFacts(videoId, options);
  if (outcome.result === "error") return "error";
  const values = outcome.result === "found"
    ? { videoId, status: "found" as const, data: outcome.facts as never, fetchedAt: now.toISOString(), attempts: 0 }
    : { videoId, status: "unavailable" as const, data: null as never, fetchedAt: now.toISOString(), attempts: (row?.attempts ?? 0) + 1 };
  if (row) await payload.update({ collection: "video-facts", id: row.id, data: values, ...system(options.req) });
  else await payload.create({ collection: "video-facts", data: values, ...system(options.req) });
  return outcome.result === "found" ? "found" : "unavailable";
}

export const refreshVideoFactsTask: TaskConfig = {
  slug: REFRESH_VIDEO_FACTS_TASK,
  label: "Look up a YouTube video",
  inputSchema: [{ name: "videoId", type: "text", required: true }],
  // One lookup per video at a time; a second save of the same story supersedes a pending one.
  concurrency: { key: ({ input }) => `video-facts:${(input as { videoId?: string }).videoId ?? ""}`, exclusive: true, supersedes: true },
  retries: { attempts: 3, backoff: { type: "exponential", delay: 60_000 } },
  handler: async ({ req, input }) => {
    const outcome = await refreshVideoFacts(req.payload, String((input as { videoId: string }).videoId), { req });
    // A transient YouTube failure retries through the queue; a missing video is a recorded outcome, not a failure.
    if (outcome === "error") throw new Error("YouTube could not be reached.");
    return { output: {} };
  }
};
