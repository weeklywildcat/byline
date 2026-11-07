import { createHash } from "node:crypto";
import { PUBLIC_SNAPSHOT_SCHEMA_VERSION, type PublicBuildSnapshotV2 } from "@byline/content";
import { parseNativeSnapshot, type NativeSnapshotPointer } from "./native-snapshot";

/**
 * Acquisition of a Payload public snapshot for a static build
 * (docs/payload-build-snapshots.md#the-build). The newsroom's build-only API
 * root is `BYLINE_NEWSROOM_BUILD_URL` (e.g.
 * `https://newsroom.example/api/byline/build`); every request carries
 * `Authorization: Bearer $BYLINE_BUILD_TOKEN`.
 *
 *   discovery 200  → the advertised immutable artifact, verified (bytes,
 *                    SHA-256, schema, revision, minimum revision). Anything
 *                    wrong with it is a HARD FAILURE, never a fallback.
 *   discovery 503 `byline_snapshot_not_ready`
 *                  → direct-source recovery for the advertised current
 *                    revision R: the newsroom builds the same v2 projection
 *                    and returns it only if R is still current. A 409
 *                    (revision changed) rediscovers, at most `maxAttempts`.
 *   anything else  → hard failure: 401/403, unreachable, malformed JSON, an
 *                    unknown 503/5xx, an unsupported schema, a missing or
 *                    mismatched artifact, an invalid snapshot or manifest.
 *
 * Both successful paths return the same validated v2 snapshot; the caller
 * writes it to the one local contract (`.byline-build/public-snapshot.json`).
 * Recovery exists for ABSENCE of a completed snapshot only; it never hides
 * corruption or an outage.
 */

export type AcquisitionMode = "prepared-snapshot" | "direct-source-recovery";

export type PayloadAcquisitionOptions = {
  /** The build-only API root, `BYLINE_NEWSROOM_BUILD_URL`. */
  baseUrl: string;
  /** `BYLINE_BUILD_TOKEN`. Never logged. */
  token: string;
  /** `BYLINE_EXPECTED_REVISION`: a minimum; a newer completed revision supersedes it. */
  minimumRevision?: number;
  /** Rediscover after a direct-recovery revision race at most this many times in all (default 3). */
  maxAttempts?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type AcquiredSnapshot = {
  mode: AcquisitionMode;
  snapshot: PublicBuildSnapshotV2;
  bytes: Buffer;
  revision: number;
  digest: string;
  requests: number;
  attempts: number;
  downloadMs: number;
};

export class BuildAcquisitionError extends Error {
  constructor(message: string) {
    super(`Payload snapshot acquisition failed: ${message}`);
    this.name = "BuildAcquisitionError";
  }
}

const NOT_READY = "byline_snapshot_not_ready";
const RETRY_DIRECT = new Set(["byline_snapshot_revision_changed", "byline_snapshot_ready"]);

function buildBase(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BuildAcquisitionError("BYLINE_NEWSROOM_BUILD_URL is not a URL.");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new BuildAcquisitionError("BYLINE_NEWSROOM_BUILD_URL must use HTTPS.");
  if (url.search || url.hash || url.username || url.password) throw new BuildAcquisitionError("BYLINE_NEWSROOM_BUILD_URL must be a plain API root.");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

/** The media endpoint the same newsroom serves prepared files from. */
export function buildMediaEndpoint(baseUrl: string): string {
  return `${buildBase(baseUrl).toString().replace(/\/+$/, "")}/media`;
}

async function json(response: Response, what: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new BuildAcquisitionError(`${what} returned malformed JSON (HTTP ${response.status}).`);
  }
}

function validatePointer(value: Record<string, unknown>, base: URL): NativeSnapshotPointer {
  const pointer = value as NativeSnapshotPointer;
  if (pointer.schemaVersion !== PUBLIC_SNAPSHOT_SCHEMA_VERSION) throw new BuildAcquisitionError("discovery advertised an unsupported snapshot schema.");
  if (!Number.isSafeInteger(pointer.revision) || pointer.revision < 0) throw new BuildAcquisitionError("discovery advertised an invalid revision.");
  if (typeof pointer.digest !== "string" || !/^[a-f0-9]{64}$/.test(pointer.digest)) throw new BuildAcquisitionError("discovery advertised an invalid digest.");
  if (!Number.isSafeInteger(pointer.bytes) || pointer.bytes <= 0) throw new BuildAcquisitionError("discovery advertised an invalid byte count.");
  if (typeof pointer.generatedAt !== "string" || !Number.isFinite(Date.parse(pointer.generatedAt))) throw new BuildAcquisitionError("discovery advertised an invalid generatedAt.");
  let artifact: URL;
  try {
    artifact = new URL(String(pointer.url));
  } catch {
    throw new BuildAcquisitionError("discovery advertised an invalid artifact URL.");
  }
  // The credential is only ever sent to the configured newsroom, at exactly the artifact route.
  if (artifact.origin !== base.origin || artifact.pathname !== `${base.pathname.replace(/\/+$/, "")}/snapshot/${pointer.digest}` || artifact.search) {
    throw new BuildAcquisitionError("discovery advertised an artifact outside the configured build API.");
  }
  return pointer;
}

export async function acquirePayloadSnapshot(options: PayloadAcquisitionOptions): Promise<AcquiredSnapshot> {
  const base = buildBase(options.baseUrl);
  const root = base.toString().replace(/\/+$/, "");
  if (!options.token || options.token.length < 32) throw new BuildAcquisitionError("BYLINE_BUILD_TOKEN is required (at least 32 characters).");
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const minimumRevision = options.minimumRevision ?? 0;
  let requests = 0;

  const get = async (url: string, what: string) => {
    requests++;
    try {
      return await doFetch(url, { headers: { Authorization: `Bearer ${options.token}`, Accept: "application/json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new BuildAcquisitionError(`the newsroom could not be reached for ${what} (${(error as Error).message}).`);
    }
  };
  const refuseAuth = (response: Response, what: string) => {
    if (response.status === 401 || response.status === 403) throw new BuildAcquisitionError(`the newsroom refused the build credential for ${what} (HTTP ${response.status}).`);
  };
  const verify = (bytes: Buffer, pointer: NativeSnapshotPointer | undefined, what: string) => {
    try {
      return parseNativeSnapshot(bytes, pointer, minimumRevision);
    } catch (error) {
      throw new BuildAcquisitionError(`${what} is invalid: ${(error as Error).message}`);
    }
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const discovery = await get(`${root}/snapshot`, "discovery");
    refuseAuth(discovery, "discovery");

    if (discovery.status === 200) {
      const pointer = validatePointer(await json(discovery, "discovery"), base);
      if (pointer.revision < minimumRevision) throw new BuildAcquisitionError(`the completed snapshot (revision ${pointer.revision}) is older than the expected revision ${minimumRevision}.`);
      const started = performance.now();
      const artifact = await get(String(pointer.url), "the snapshot artifact");
      refuseAuth(artifact, "the snapshot artifact");
      if (artifact.status !== 200) throw new BuildAcquisitionError(`the advertised snapshot artifact answered HTTP ${artifact.status}.`);
      const bytes = Buffer.from(await artifact.arrayBuffer());
      const snapshot = verify(bytes, pointer, "the advertised snapshot artifact");
      return { mode: "prepared-snapshot", snapshot, bytes, revision: snapshot.revision, digest: pointer.digest, requests, attempts: attempt, downloadMs: performance.now() - started };
    }

    if (discovery.status === 503) {
      const body = await json(discovery, "discovery");
      if (body.code !== NOT_READY || !Number.isSafeInteger(body.currentRevision)) throw new BuildAcquisitionError(`discovery answered an unrecognized 503 (${String(body.code ?? "no code")}).`);
      const revision = body.currentRevision as number;
      if (revision < minimumRevision) throw new BuildAcquisitionError(`the current public revision ${revision} is older than the expected revision ${minimumRevision}.`);
      const started = performance.now();
      const direct = await get(`${root}/direct?revision=${revision}`, "direct-source recovery");
      refuseAuth(direct, "direct-source recovery");
      if (direct.status === 409) {
        const conflict = await json(direct, "direct-source recovery");
        if (RETRY_DIRECT.has(String(conflict.code))) continue;
        throw new BuildAcquisitionError(`direct-source recovery answered an unrecognized conflict (${String(conflict.code ?? "no code")}).`);
      }
      if (direct.status !== 200) {
        const detail = await direct.text().then((text) => {
          try {
            const parsed = JSON.parse(text) as { code?: string; message?: string };
            return `${parsed.code ?? ""} ${parsed.message ?? ""}`.trim();
          } catch {
            return "";
          }
        });
        throw new BuildAcquisitionError(`direct-source recovery answered HTTP ${direct.status}${detail ? ` (${detail.slice(0, 300)})` : ""}.`);
      }
      const bytes = Buffer.from(await direct.arrayBuffer());
      const snapshot = verify(bytes, undefined, "the direct-source snapshot");
      if (snapshot.revision !== revision) throw new BuildAcquisitionError(`direct-source recovery returned revision ${snapshot.revision}, not the requested ${revision}.`);
      return { mode: "direct-source-recovery", snapshot, bytes, revision, digest: createHash("sha256").update(bytes).digest("hex"), requests, attempts: attempt, downloadMs: performance.now() - started };
    }

    throw new BuildAcquisitionError(`discovery answered HTTP ${discovery.status}.`);
  }
  throw new BuildAcquisitionError(`the public revision kept changing during direct-source recovery (${maxAttempts} attempts).`);
}
