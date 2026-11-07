import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { Endpoint, PayloadRequest } from "payload";
import { authenticateBuildRequest, BUILD_NO_STORE, buildRefusal } from "../../build/auth";
import { readCurrentRevision, readPublicationState } from "../../db/publication-state";
import { isPublicSnapshotError } from "./errors";
import { buildPublicSnapshotBytes, usableCompletedPointer } from "./prepare";
import { SnapshotStore } from "./store";
import { PUBLIC_SNAPSHOT_SCHEMA_VERSION, PUBLIC_SNAPSHOT_PRODUCER_VERSION } from "./version";

/**
 * Build-only snapshot API (docs/payload-build-snapshots.md#build-endpoint-contract).
 * Every route requires `Authorization: Bearer $BYLINE_BUILD_TOKEN`, answers
 * `Cache-Control: private, no-store`, and does not exist (404) without a
 * configured token.
 *
 * - `GET /api/byline/build/snapshot`: a cheap pointer read. 200 with the v1
 *   pointer when a completed snapshot exists for the CURRENT revision, schema
 *   and producer; 503 `byline_snapshot_not_ready` (the only condition that
 *   permits direct-source recovery) when it does not; 500
 *   `byline_snapshot_pointer_corrupt` when the recorded pointer is unusable.
 *   Never generates anything.
 * - `GET /api/byline/build/snapshot/:sha256`: streams exactly that immutable
 *   artifact. 404 when it is gone; never regenerates.
 * - `GET /api/byline/build/direct?revision=R`: recovery only. Refuses unless R
 *   is current and has no completed snapshot; builds the same native projection
 *   with the job's collector, validates it, and returns its exact bytes only
 *   if the revision is still R afterwards (409 otherwise).
 */
export const BUILD_SNAPSHOT_PATH = "/byline/build/snapshot";
export const BUILD_SNAPSHOT_ARTIFACT_PATH = "/byline/build/snapshot/:sha256";
export const BUILD_DIRECT_PATH = "/byline/build/direct";

export const NOT_READY_CODE = "byline_snapshot_not_ready";

/** The public origin a build reaches the newsroom at: the configured server URL, else the request's own. */
function buildBase(req: PayloadRequest): string {
  const configured = process.env.BYLINE_NEWSROOM_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(req.url ?? "http://localhost");
  return url.origin;
}

export async function serveSnapshotDiscovery(req: PayloadRequest): Promise<Response> {
  const refused = authenticateBuildRequest(req);
  if (refused) return refused;
  const state = await readPublicationState(req.payload);
  if (state.pointerCorrupt) {
    return buildRefusal(500, { code: "byline_snapshot_pointer_corrupt", message: `The completed snapshot pointer is unusable: ${state.pointerCorrupt}. Run publication:snapshot:prepare.`, currentRevision: state.currentRevision });
  }
  const usable = usableCompletedPointer(state);
  if (!usable) {
    const completed = state.completed;
    const reason = !completed ? "no-completed-snapshot" : completed.schemaVersion !== PUBLIC_SNAPSHOT_SCHEMA_VERSION ? "unsupported-schema" : completed.producerVersion !== PUBLIC_SNAPSHOT_PRODUCER_VERSION ? "outdated-producer" : "older-revision";
    return buildRefusal(503, {
      code: NOT_READY_CODE,
      message: "No completed snapshot exists for the current public revision.",
      currentRevision: state.currentRevision,
      completedRevision: completed?.revision ?? null,
      reason
    });
  }
  return Response.json({
    schemaVersion: PUBLIC_SNAPSHOT_SCHEMA_VERSION,
    revision: usable.revision,
    generatedAt: usable.generatedAt,
    digest: usable.sha256,
    bytes: usable.bytes,
    url: `${buildBase(req)}/api/byline/build/snapshot/${usable.sha256}`
  }, { status: 200, headers: BUILD_NO_STORE });
}

export async function serveSnapshotArtifact(req: PayloadRequest, store = new SnapshotStore()): Promise<Response> {
  const refused = authenticateBuildRequest(req);
  if (refused) return refused;
  const sha256 = String(req.routeParams?.sha256 ?? "");
  if (!/^[0-9a-f]{64}$/.test(sha256)) return buildRefusal(400, { message: "Expected a SHA-256." });
  const filename = await store.findByDigest(sha256);
  const file = filename ? store.pathFor(filename) : null;
  const info = file ? await stat(file).catch(() => null) : null;
  if (!file || !info?.isFile()) return buildRefusal(404, { code: "byline_snapshot_artifact_missing", message: "No such snapshot artifact." });
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: 200, headers: { ...BUILD_NO_STORE, "Content-Type": "application/json; charset=utf-8", "Content-Length": String(info.size), "X-Byline-Sha256": sha256 } });
}

export async function serveDirectSnapshot(req: PayloadRequest, options: { afterCollect?: () => Promise<void> } = {}): Promise<Response> {
  const refused = authenticateBuildRequest(req);
  if (refused) return refused;
  const raw = (req.searchParams ?? new URLSearchParams()).get("revision") ?? "";
  if (!/^\d{1,16}$/.test(raw) || !Number.isSafeInteger(Number(raw))) return buildRefusal(400, { code: "byline_snapshot_revision_required", message: "Pass the current public revision from discovery: ?revision=R." });
  const revision = Number(raw);
  const state = await readPublicationState(req.payload);
  if (state.currentRevision !== revision) return buildRefusal(409, { code: "byline_snapshot_revision_changed", message: "The public revision changed; rediscover.", currentRevision: state.currentRevision });
  if (usableCompletedPointer(state)) return buildRefusal(409, { code: "byline_snapshot_ready", message: "A completed snapshot exists for this revision; acquire it instead.", currentRevision: state.currentRevision });
  try {
    const { bytes } = await buildPublicSnapshotBytes(req.payload, revision, { afterCollect: options.afterCollect });
    return new Response(new Uint8Array(bytes), { status: 200, headers: { ...BUILD_NO_STORE, "Content-Type": "application/json; charset=utf-8", "Content-Length": String(bytes.byteLength), "X-Byline-Revision": String(revision) } });
  } catch (error) {
    if (isPublicSnapshotError(error) && error.code === "stale-revision") {
      return buildRefusal(409, { code: "byline_snapshot_revision_changed", message: error.message, currentRevision: await readCurrentRevision(req.payload) });
    }
    if (isPublicSnapshotError(error)) {
      const status = error.code === "media-not-ready" || error.code === "public-input-not-ready" ? 503 : 500;
      return buildRefusal(status, { code: `byline_snapshot_${error.code.replace(/-/g, "_")}`, message: error.message, details: error.details.slice(0, 20) });
    }
    req.payload.logger.error({ err: error, msg: "Direct-source snapshot recovery failed." });
    return buildRefusal(500, { code: "byline_snapshot_direct_failed", message: "Direct-source collection failed." });
  }
}

export const buildSnapshotEndpoints: Endpoint[] = [
  { path: BUILD_SNAPSHOT_PATH, method: "get", handler: (req) => serveSnapshotDiscovery(req) },
  { path: BUILD_SNAPSHOT_ARTIFACT_PATH, method: "get", handler: (req) => serveSnapshotArtifact(req) },
  { path: BUILD_DIRECT_PATH, method: "get", handler: (req) => serveDirectSnapshot(req) }
];
