import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createHash, randomUUID } from "node:crypto";
import { tsImport } from "tsx/esm/api";

// The snapshot contract, acquisition and media materializer are TypeScript modules shared with
// Astro and the tests; tsx loads them here without registering a loader for the Astro child.
const { parseBuildSnapshot } = await tsImport("../lib/prepared-snapshot.ts", import.meta.url);

const totalStartedAt = Date.now();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const astroCommand = path.join(path.dirname(require.resolve("astro/package.json")), "bin", "astro.mjs");
const astroArguments = process.argv.slice(2);
const defaultWordPressApi = "https://cms.weeklywildcat.com/wp-json/wp/v2";

if (astroArguments.length === 0) throw new Error("An Astro command is required.");

function publicationEndpoint() {
  if (process.env.BYLINE_PUBLICATION_URL) return process.env.BYLINE_PUBLICATION_URL;
  return (process.env.NEXT_PUBLIC_WP_API_URL || defaultWordPressApi).replace(/\/wp\/v2\/?$/, "/byline/v1/publication");
}

async function loadPublication() {
  if (process.env.BYLINE_PUBLICATION_FILE) {
    const value = JSON.parse(await readFile(path.resolve(projectRoot, process.env.BYLINE_PUBLICATION_FILE), "utf8"));
    if (value?.schemaVersion !== 1) throw new Error("BYLINE_PUBLICATION_FILE uses an unsupported schema version.");
    return value;
  }
  if (process.env.BYLINE_PUBLICATION_JSON) return JSON.parse(process.env.BYLINE_PUBLICATION_JSON);
  const endpoint = publicationEndpoint();
  try {
    const response = await fetch(endpoint, { headers: { "User-Agent": "Byline static publication builder" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const value = await response.json();
    if (value?.schemaVersion !== 1) throw new Error("unsupported or missing schemaVersion");
    console.log(`Loaded Byline publication configuration from ${endpoint}`);
    return value;
  } catch (error) {
    console.warn(`Byline publication endpoint unavailable (${error instanceof Error ? error.message : error}); using compatibility defaults.`);
    return null;
  }
}

/**
 * Astro's incremental build restores a page when its own module graph is
 * unchanged, but it does not follow stylesheets (a change inside an @import-ed
 * partial leaves restored pages pointing at a CSS file that no longer exists,
 * and the asset check then fails the build). Fingerprint everything that can
 * change a page's markup or styles and drop the incremental cache when it moves.
 */
async function sourceFingerprint() {
  const hash = createHash("sha256");
  const roots = ["../../packages", "src", "components", "lib", "views", "public/fonts"];
  async function visit(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.(css|astro|tsx?|mjs|json)$/.test(entry.name)) hash.update(file).update(await readFile(file));
    }
  }
  for (const root of roots) await visit(path.join(projectRoot, root));
  return hash.digest("hex");
}

async function invalidateIncrementalBuildWhenSourcesChange() {
  const cacheDirectory = path.join(projectRoot, "node_modules/.astro");
  const marker = path.join(cacheDirectory, "byline-source-fingerprint");
  const current = await sourceFingerprint();
  const previous = await readFile(marker, "utf8").catch(() => "");
  if (previous !== current) {
    await rm(path.join(cacheDirectory, "incremental-build.json"), { force: true });
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(marker, current);
  }
}

const isBuild = astroArguments[0] === "build";
const fixture = process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture") || process.env.BYLINE_CONTENT_MODE === "empty";
const buildIdentity = process.env.WORDPRESS_FETCH_CACHE_KEY || process.env.WORKERS_CI_BUILD_UUID || process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.NETLIFY_COMMIT_REF || `local-${randomUUID()}`;
const acquisitionStarted = performance.now();
let snapshot;
let snapshotIdentity;
let cmsRequests = 0;
let snapshotBytes = 0;
let downloadMs = 0;
let parseMs = 0;
// Acquisition source, in precedence order (docs/payload-build-snapshots.md#the-build):
//   1. BYLINE_BUILD_SNAPSHOT_FILE: a deliberate local/offline snapshot.
//   2. BYLINE_NEWSROOM_BUILD_URL: the Payload newsroom's build-only API (completed snapshot, or
//      direct-source recovery only when discovery reports the current revision not ready).
//   3. The existing WordPress pointer + artifact (BYLINE_BUILD_SNAPSHOT_URL or derived).
//   4. BYLINE_LEGACY_REST_BUILD=1: the explicit legacy REST compatibility mode.
// A deployed newsroom never turns a WordPress build into a Payload build on its own.
let snapshotSource = null;
let acquisitionMode = null;
const payloadBuildUrl = process.env.BYLINE_NEWSROOM_BUILD_URL?.trim();
if (isBuild && process.env.BYLINE_LEGACY_REST_BUILD !== "1" && !process.env.BYLINE_BUILD_SNAPSHOT_FILE && payloadBuildUrl) {
  const { acquirePayloadSnapshot } = await tsImport("../lib/build-acquisition.ts", import.meta.url);
  const acquired = await acquirePayloadSnapshot({ baseUrl: payloadBuildUrl, token: process.env.BYLINE_BUILD_TOKEN ?? "", minimumRevision: Number(process.env.BYLINE_EXPECTED_REVISION || 0) });
  snapshot = acquired.snapshot;
  snapshotSource = "payload";
  acquisitionMode = acquired.mode;
  cmsRequests = acquired.requests;
  snapshotBytes = acquired.bytes.byteLength;
  downloadMs = acquired.downloadMs;
  snapshotIdentity = { schemaVersion: snapshot.schemaVersion, revision: snapshot.revision, generatedAt: snapshot.generatedAt, artifactDigest: acquired.digest, bytes: snapshotBytes, attempts: acquired.attempts };
  console.log(`[byline] Payload snapshot acquired by ${acquired.mode}: revision ${acquired.revision}, ${snapshotBytes} bytes, ${acquired.digest.slice(0, 12)}…`);
} else if (isBuild && (!fixture || process.env.BYLINE_BUILD_SNAPSHOT_FILE || process.env.BYLINE_BUILD_SNAPSHOT_URL) && process.env.BYLINE_LEGACY_REST_BUILD !== "1") {
  let bytes;
  let pointer;
  if (process.env.BYLINE_BUILD_SNAPSHOT_FILE) {
    // Deliberate offline fixture/benchmark input; still enforce the contract.
    bytes = await readFile(path.resolve(projectRoot, process.env.BYLINE_BUILD_SNAPSHOT_FILE));
    snapshotSource = payloadBuildUrl ? "payload" : "file";
  } else {
    snapshotSource = "wordpress";
    const endpoint = new URL(process.env.BYLINE_BUILD_SNAPSHOT_URL || publicationEndpoint().replace(/\/publication\/?$/, "/build-snapshot"));
    endpoint.searchParams.set("_byline_build", buildIdentity);
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    cmsRequests++;
    if (!response.ok) throw new Error(`Prepared build snapshot discovery failed: HTTP ${response.status}. Prepare a completed snapshot in WordPress before building.`);
    pointer = await response.json();
    if (pointer?.schemaVersion !== 1 || !Number.isSafeInteger(pointer.revision) || !/^[a-f0-9]{64}$/.test(pointer.digest) || !Number.isSafeInteger(pointer.bytes) || pointer.bytes <= 0) throw new Error("Invalid build snapshot discovery metadata");
    const artifact = new URL(pointer.url);
    if (artifact.protocol !== "https:" && !(artifact.protocol === "http:" && ["127.0.0.1", "localhost"].includes(artifact.hostname))) throw new Error("Build snapshot artifact must use HTTPS");
    const downloadStarted = performance.now();
    const artifactResponse = await fetch(artifact, { signal: AbortSignal.timeout(60000) });
    cmsRequests++;
    if (!artifactResponse.ok) throw new Error(`Build snapshot download failed: HTTP ${artifactResponse.status}`);
    bytes = Buffer.from(await artifactResponse.arrayBuffer());
    downloadMs = performance.now() - downloadStarted;
  }
  acquisitionMode = "prepared-snapshot";
  snapshotBytes = bytes.byteLength;
  const parseStarted = performance.now();
  const minimumRevision = Number(process.env.BYLINE_EXPECTED_REVISION || 0);
  if (snapshotSource === "payload") {
    const { parseNativeSnapshot } = await tsImport("../lib/native-snapshot.ts", import.meta.url);
    snapshot = parseNativeSnapshot(bytes, undefined, minimumRevision);
  } else {
    snapshot = parseBuildSnapshot(bytes, pointer, minimumRevision);
  }
  parseMs = performance.now() - parseStarted;
  snapshotIdentity = { schemaVersion: snapshot.schemaVersion, revision: snapshot.revision, generatedAt: snapshot.generatedAt, artifactDigest: createHash("sha256").update(bytes).digest("hex"), bytes: snapshotBytes };
}
// Prepared publication media named by the accepted snapshot (Payload manifests): a closed,
// validated descriptor set, acquired after Astro renders. WordPress snapshots have none.
let publicationMediaDescriptors = [];
if (snapshotSource === "payload") {
  const { descriptorsFromManifests, closedDescriptorSet } = await tsImport("./publication-media.ts", import.meta.url);
  publicationMediaDescriptors = closedDescriptorSet(descriptorsFromManifests(snapshot.datasets.media.map(({ manifest }) => manifest)));
}
const publication = snapshot?.publication ?? await loadPublication();
if (publication) publication.appearance = { theme: "weekly-wildcat", tokenOverrides: {} };
const acquisitionMs = performance.now() - acquisitionStarted;
if (astroArguments[0] === "build") {
  await invalidateIncrementalBuildWhenSourcesChange();
  const buildDirectory = path.join(projectRoot, ".byline-build");
  await rm(buildDirectory, { recursive: true, force: true });
  await mkdir(buildDirectory, { recursive: true });
  if (snapshot) await rm(path.join(projectRoot, "public/_wordpress-media"), { recursive: true, force: true });
}
if (snapshot) {
  // The one local contract every acquisition mode converges on; from here there is one code path.
  const file = path.join(projectRoot, ".byline-build", "public-snapshot.json");
  await writeFile(file, JSON.stringify(snapshot));
  process.env.BYLINE_PREPARED_SNAPSHOT_FILE = file;
  process.env.BYLINE_PREPARED_SNAPSHOT_PROVIDER = snapshotSource === "payload" ? "payload" : "wordpress";
  if (publicationMediaDescriptors.length) await writeFile(path.join(projectRoot, ".byline-build", "publication-media-descriptors.json"), JSON.stringify(publicationMediaDescriptors));
}
const buildStarted = performance.now();
let buildOutput = "";
const child = spawn(process.execPath, [...(snapshot ? ["--import", path.join(projectRoot, "scripts/assert-snapshot-network.mjs")] : []), astroCommand, ...astroArguments], {
  cwd: projectRoot,
  env: {
    ...process.env,
    WORDPRESS_FETCH_CACHE_KEY: buildIdentity,
    ...(publication ? { BYLINE_PUBLICATION_JSON: JSON.stringify(publication) } : {}),
    ...(publication?.urls?.publicSite && !process.env.NEXT_PUBLIC_SITE_URL ? { NEXT_PUBLIC_SITE_URL: publication.urls.publicSite } : {}),
    ...(publication?.urls?.cms && !process.env.NEXT_PUBLIC_WP_API_URL ? { NEXT_PUBLIC_WP_API_URL: `${String(publication.urls.cms).replace(/\/$/, "")}/wp-json/wp/v2` } : {})
  },
  stdio: ["inherit", "pipe", "inherit"]
});
child.stdout.on("data", (chunk) => { buildOutput += chunk.toString(); process.stdout.write(chunk); });
const status = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
if (status !== 0) process.exit(Number(status) || 1);

// After Astro succeeds and before npm's postbuild verification: acquire exactly the prepared
// files the snapshot names into out/_byline/media through the Phase 5 materializer (verified
// SHA-256, size and type; atomic writes). Never a copy of the newsroom volume.
let publicationMediaMetrics = null;
if (isBuild && publicationMediaDescriptors.length) {
  const started = performance.now();
  const { materializePublicationMedia } = await tsImport("./publication-media.ts", import.meta.url);
  const { buildMediaEndpoint } = await tsImport("../lib/build-acquisition.ts", import.meta.url);
  const endpoint = process.env.BYLINE_NEWSROOM_BUILD_MEDIA_URL?.trim() || (payloadBuildUrl ? buildMediaEndpoint(payloadBuildUrl) : "");
  if (!endpoint) throw new Error("This snapshot names prepared publication media: set BYLINE_NEWSROOM_BUILD_URL (or BYLINE_NEWSROOM_BUILD_MEDIA_URL) and BYLINE_BUILD_TOKEN.");
  const result = await materializePublicationMedia({
    descriptors: publicationMediaDescriptors,
    endpoint,
    token: process.env.BYLINE_BUILD_TOKEN ?? "",
    outDir: path.join(projectRoot, "out"),
    concurrency: Math.min(16, Math.max(1, Number(process.env.BYLINE_MEDIA_CONCURRENCY) || 8))
  });
  publicationMediaMetrics = { descriptors: publicationMediaDescriptors.length, ...result, ms: performance.now() - started };
  console.log(`[byline] Publication media: ${result.written} written, ${result.unchanged} unchanged, ${(result.bytes / 1024 / 1024).toFixed(1)} MB in ${publicationMediaDescriptors.length} files.`);
}

if (astroArguments[0] === "build") {
  const cleanLog = buildOutput.replace(/\x1b\[[0-9;]*m/g, "");
  const restored = (cleanLog.match(/\((?:restored|cached)\)/g) || []).length;
  const emitted = (cleanLog.match(/[├└]─ /g) || []).length;
  await writeFile(path.join(projectRoot, ".byline-build", "frontend-phases.json"), JSON.stringify({
    totalStartedAt, acquisitionMs, downloadMs, parseMs, snapshotBytes, snapshotIdentity, cmsRequests: snapshot ? cmsRequests : fixture ? 0 : null,
    dataMode: snapshot ? acquisitionMode : fixture ? "fixture" : "legacy-rest-compatibility",
    snapshotSource, publicationMedia: publicationMediaMetrics,
    buildIdentity, commit: process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || null,
    branch: process.env.WORKERS_CI_BRANCH || process.env.CF_PAGES_BRANCH || null,
    astroMs: performance.now() - buildStarted, routes: { rendered: emitted - restored, restored, emitted },
    routeResults: [...cleanLog.matchAll(/[├└]─ (\S+)([^\n]*)/g)].map((match) => ({ path: match[1], restored: /\((?:restored|cached)\)/.test(match[2]) }))
  }, null, 2));
  await writeFile(path.join(projectRoot, ".byline-build", "build-duration.json"), `${JSON.stringify({ durationMs: Math.round((performance.now() - buildStarted) * 100) / 100 }, null, 2)}\n`);
  if (process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture")) {
    await cp(path.resolve(projectRoot, "../../tests/fixtures/story-media"), path.join(projectRoot, "out/test-assets"), { recursive: true });
  }
  const activePublication = publication ?? JSON.parse(await readFile(path.join(projectRoot, "tests", "fixtures", "weekly-wildcat-publication.json"), "utf8"));
  const outputDirectory = path.join(projectRoot, "out", "_byline");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "publication.json"), `${JSON.stringify(activePublication, null, 2)}\n`);
}
