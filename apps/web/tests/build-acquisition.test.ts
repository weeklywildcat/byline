import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import publication from "./fixtures/weekly-wildcat-publication.json";
import { acquirePayloadSnapshot, buildMediaEndpoint } from "@/lib/build-acquisition";

/**
 * The Payload acquisition state machine: completed snapshot first, explicit
 * direct-source recovery ONLY for the recognized not-ready answer, and a hard
 * failure (never a fallback) for anything wrong with an advertised artifact,
 * the credential or the newsroom. The live endpoints are exercised against
 * real PostgreSQL in apps/newsroom/tests/integration/public-snapshot.test.ts.
 */
const BASE = "https://newsroom.example/api/byline/build";
const TOKEN = "build-token-for-acquisition-tests-0123456789";

function snapshotBytes(revision: number, extra: { attachments?: unknown[]; schemaVersion?: number } = {}) {
  const datasets = { posts: [], authors: [], guests: [], categories: [], tags: [], pages: [], corrections: [], coverages: [], schoolEvents: [], attachments: extra.attachments ?? [] };
  return Buffer.from(JSON.stringify({ schemaVersion: extra.schemaVersion ?? 1, revision, generatedAt: "2026-11-07T12:00:00.000Z", sourceTimezone: "America/New_York", publication: { ...publication, revision }, datasets, counts: Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [name, rows.length])) }));
}
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const pointerFor = (bytes: Buffer, revision: number, overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, revision, generatedAt: "2026-11-07T12:00:00.000Z", digest: sha(bytes), bytes: bytes.byteLength, url: `${BASE}/snapshot/${sha(bytes)}`, ...overrides });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const notReady = (revision: number) => json(503, { code: "byline_snapshot_not_ready", currentRevision: revision, reason: "no-completed-snapshot" });

type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;
function scripted(routes: Route[]) {
  const calls: string[] = [];
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname.replace("/api/byline/build", "")}${url.search}`);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(init.redirect).toBe("error");
    const route = routes.shift();
    if (!route) throw new Error(`unexpected request ${url}`);
    return route(url, init);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}
const acquire = (fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) => acquirePayloadSnapshot({ baseUrl: BASE, token: TOKEN, fetch, ...extra });

describe("Payload snapshot acquisition", () => {
  it("acquires the advertised completed snapshot with exactly two requests", async () => {
    const bytes = snapshotBytes(7);
    const { fetch, calls } = scripted([() => json(200, pointerFor(bytes, 7)), () => new Response(bytes)]);
    const acquired = await acquire(fetch);
    expect(acquired).toMatchObject({ mode: "prepared-snapshot", revision: 7, digest: sha(bytes), requests: 2, attempts: 1 });
    expect(calls).toEqual(["/snapshot", `/snapshot/${sha(bytes)}`]);
  });

  it("recovers directly only for the recognized not-ready answer, for the advertised revision", async () => {
    const bytes = snapshotBytes(9);
    const { fetch, calls } = scripted([() => notReady(9), () => new Response(bytes)]);
    const acquired = await acquire(fetch);
    expect(acquired).toMatchObject({ mode: "direct-source-recovery", revision: 9, digest: sha(bytes), requests: 2 });
    expect(calls).toEqual(["/snapshot", "/direct?revision=9"]);
  });

  it("rediscovers after a direct revision race, within a hard bound", async () => {
    const bytes = snapshotBytes(11);
    const race = () => json(409, { code: "byline_snapshot_revision_changed", currentRevision: 11 });
    const recovered = scripted([() => notReady(10), race, () => notReady(11), () => new Response(bytes)]);
    expect(await acquire(recovered.fetch)).toMatchObject({ mode: "direct-source-recovery", revision: 11, attempts: 2 });
    // A snapshot completed meanwhile is taken from the artifact instead.
    const completed = snapshotBytes(12);
    const meanwhile = scripted([() => notReady(12), () => json(409, { code: "byline_snapshot_ready" }), () => json(200, pointerFor(completed, 12)), () => new Response(completed)]);
    expect(await acquire(meanwhile.fetch)).toMatchObject({ mode: "prepared-snapshot", revision: 12 });
    const endless = scripted([() => notReady(1), race, () => notReady(2), race, () => notReady(3), race]);
    await expect(acquire(endless.fetch)).rejects.toThrow(/kept changing.*3 attempts/);
  });

  it("fails a direct snapshot for the wrong revision", async () => {
    const { fetch } = scripted([() => notReady(5), () => new Response(snapshotBytes(6))]);
    await expect(acquire(fetch)).rejects.toThrow(/returned revision 6, not the requested 5/);
  });

  const bytes = snapshotBytes(4);
  const advertised = (overrides: Record<string, unknown> = {}) => () => json(200, pointerFor(bytes, 4, overrides));
  const badManifest = snapshotBytes(4, { attachments: [{ id: 1, source_url: "/_byline/media/images/aa/x--y--aaaaaaaaaaaaaaaa.webp", media_details: {}, title: { rendered: "" }, caption: { rendered: "" }, alt_text: "", bylinePublication: { manifest: { schemaVersion: 1, kind: "image" } } }] });
  const neverFallback: Array<[string, Route[], RegExp]> = [
    ["an invalid token", [() => json(401, { code: "byline_build_unauthorized" })], /refused the build credential/],
    ["a forbidden token", [() => json(403, {})], /refused the build credential/],
    ["an unreachable newsroom", [() => { throw new TypeError("fetch failed"); }], /could not be reached/],
    ["a discovery 500", [() => json(500, { code: "byline_snapshot_pointer_corrupt" })], /HTTP 500/],
    ["an unrecognized 503", [() => json(503, { code: "maintenance" })], /unrecognized 503/],
    ["a non-JSON 503", [() => new Response("<html>busy</html>", { status: 503 })], /malformed JSON/],
    ["a malformed pointer", [() => new Response("{not json", { status: 200 })], /malformed JSON/],
    ["an unsupported pointer schema", [advertised({ schemaVersion: 2 })], /unsupported snapshot schema/],
    ["a malformed digest", [advertised({ digest: "abc" })], /invalid digest/],
    ["an artifact on another origin", [advertised({ url: `https://evil.example/api/byline/build/snapshot/${sha(bytes)}` })], /outside the configured build API/],
    ["an artifact 404", [advertised(), () => json(404, {})], /answered HTTP 404/],
    ["a digest mismatch", [advertised({ digest: "0".repeat(64), url: `${BASE}/snapshot/${"0".repeat(64)}` }), () => new Response(bytes)], /SHA-256 digest mismatch/],
    ["a byte mismatch", [advertised({ bytes: bytes.byteLength + 1 }), () => new Response(bytes)], /byte length mismatch/],
    ["a malformed snapshot", [() => json(200, pointerFor(Buffer.from("{oops"), 4)), () => new Response(Buffer.from("{oops"))], /is invalid/],
    ["an unsupported snapshot schema", [() => json(200, pointerFor(snapshotBytes(4, { schemaVersion: 2 }), 4)), () => new Response(snapshotBytes(4, { schemaVersion: 2 }))], /unsupported schemaVersion/],
    ["an invalid prepared-media manifest", [() => json(200, pointerFor(badManifest, 4)), () => new Response(badManifest)], /invalid prepared-media manifest/]
  ];
  for (const [name, routes, error] of neverFallback) {
    it(`fails without direct recovery on ${name}`, async () => {
      const { fetch, calls } = scripted([...routes]);
      await expect(acquire(fetch)).rejects.toThrow(error);
      expect(calls.some((call) => call.startsWith("/direct"))).toBe(false);
    });
  }

  it("fails when direct recovery itself is refused or broken", async () => {
    for (const status of [401, 500, 503]) {
      const { fetch } = scripted([() => notReady(3), () => json(status, { code: "x" })]);
      await expect(acquire(fetch)).rejects.toThrow(status === 401 ? /credential/ : new RegExp(`HTTP ${status}`));
    }
    const invalid = scripted([() => notReady(3), () => new Response(badManifest)]);
    await expect(acquire(invalid.fetch)).rejects.toThrow(/invalid prepared-media manifest/);
  });

  it("refuses a snapshot older than the expected revision", async () => {
    const { fetch } = scripted([() => json(200, pointerFor(bytes, 4))]);
    await expect(acquire(fetch, { minimumRevision: 5 })).rejects.toThrow(/older than the expected revision 5/);
  });

  it("requires a credential and a safe API root", async () => {
    await expect(acquirePayloadSnapshot({ baseUrl: BASE, token: "short" })).rejects.toThrow(/BYLINE_BUILD_TOKEN/);
    await expect(acquirePayloadSnapshot({ baseUrl: "http://newsroom.example/api/byline/build", token: TOKEN })).rejects.toThrow(/HTTPS/);
    expect(buildMediaEndpoint(`${BASE}/`)).toBe(`${BASE}/media`);
  });
});
