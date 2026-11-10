import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { randomUUID, createHash } from "node:crypto";
import { tsImport } from "tsx/esm/api";

const totalStartedAt = Date.now();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const astroCommand = path.join(path.dirname(require.resolve("astro/package.json")), "bin", "astro.mjs");
const astroArguments = process.argv.slice(2);
if (astroArguments.length === 0) throw new Error("An Astro command is required.");

async function loadFixturePublication() {
  if (process.env.BYLINE_PUBLICATION_JSON) return JSON.parse(process.env.BYLINE_PUBLICATION_JSON);
  const file = process.env.BYLINE_PUBLICATION_FILE || "tests/fixtures/weekly-wildcat-publication.json";
  const value = JSON.parse(await readFile(path.resolve(projectRoot, file), "utf8"));
  if (value?.schemaVersion !== 1) throw new Error("Unsupported fixture publication schema version.");
  return value;
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
if (!isBuild) process.env.BYLINE_CONTENT_MODE ??= "weekly-wildcat-fixture";
const fixture = process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture") || process.env.BYLINE_CONTENT_MODE === "empty";
const buildIdentity = process.env.WORKERS_CI_BUILD_UUID || process.env.WORKERS_CI_COMMIT_SHA || `local-${randomUUID()}`;
const acquisitionStarted = performance.now();
const payloadBuildUrl = process.env.BYLINE_NEWSROOM_BUILD_URL?.trim();
const snapshotFile = process.env.BYLINE_BUILD_SNAPSHOT_FILE?.trim();
const minimumRevision = Number(process.env.BYLINE_EXPECTED_REVISION || 0);
let snapshot;
let snapshotIdentity;
let cmsRequests = 0;
let snapshotBytes = 0;
let downloadMs = 0;
let parseMs = 0;
let acquisitionMode = "fixture";
if (isBuild && snapshotFile) {
  const { parseNativeSnapshot } = await tsImport("../lib/native-snapshot.ts", import.meta.url);
  const bytes = await readFile(path.resolve(projectRoot, snapshotFile));
  const started = performance.now();
  snapshot = parseNativeSnapshot(bytes, undefined, minimumRevision);
  parseMs = performance.now() - started;
  snapshotBytes = bytes.byteLength;
  snapshotIdentity = { schemaVersion: snapshot.schemaVersion, revision: snapshot.revision, generatedAt: snapshot.generatedAt, artifactDigest: createHash("sha256").update(bytes).digest("hex"), bytes: snapshotBytes, attempts: 1 };
  acquisitionMode = "prepared-snapshot";
} else if (isBuild && payloadBuildUrl) {
  const { acquirePayloadSnapshot } = await tsImport("../lib/build-acquisition.ts", import.meta.url);
  const acquired = await acquirePayloadSnapshot({ baseUrl: payloadBuildUrl, token: process.env.BYLINE_BUILD_TOKEN ?? "", minimumRevision });
  snapshot = acquired.snapshot;
  acquisitionMode = acquired.mode;
  cmsRequests = acquired.requests;
  snapshotBytes = acquired.bytes.byteLength;
  downloadMs = acquired.downloadMs;
  parseMs = acquired.parseMs;
  snapshotIdentity = { schemaVersion: snapshot.schemaVersion, revision: snapshot.revision, generatedAt: snapshot.generatedAt, artifactDigest: acquired.digest, bytes: snapshotBytes, attempts: acquired.attempts };
  console.log(`[byline] Payload snapshot acquired by ${acquired.mode}: revision ${acquired.revision}, ${snapshotBytes} bytes, ${acquired.digest.slice(0, 12)}…`);
} else if (!fixture) {
  throw new Error("Set BYLINE_NEWSROOM_BUILD_URL and BYLINE_BUILD_TOKEN for a public build, or BYLINE_CONTENT_MODE=weekly-wildcat-fixture for a local preview.");
}
const snapshotSource = snapshot ? "payload" : null;
// Prepared publication media named by the accepted snapshot (Payload manifests): a closed,
// validated descriptor set, acquired after Astro renders. Fixture builds have none.
let publicationMediaDescriptors = [];
if (snapshot) {
  const { descriptorsFromManifests, closedDescriptorSet } = await tsImport("./publication-media.ts", import.meta.url);
  publicationMediaDescriptors = closedDescriptorSet(descriptorsFromManifests(snapshot.datasets.media.map(({ manifest }) => manifest)));
}
const publication = snapshot?.publication ?? await loadFixturePublication();
if (publication) publication.appearance = { theme: "weekly-wildcat", tokenOverrides: {} };
const acquisitionMs = performance.now() - acquisitionStarted;
if (astroArguments[0] === "build") {
  await invalidateIncrementalBuildWhenSourcesChange();
  const buildDirectory = path.join(projectRoot, ".byline-build");
  await rm(buildDirectory, { recursive: true, force: true });
  await mkdir(buildDirectory, { recursive: true });
}
if (snapshot) {
  // The one local contract every acquisition mode converges on; from here there is one code path.
  const file = path.join(projectRoot, ".byline-build", "public-snapshot.json");
  await writeFile(file, JSON.stringify(snapshot));
  process.env.BYLINE_PREPARED_SNAPSHOT_FILE = file;
  if (publicationMediaDescriptors.length) await writeFile(path.join(projectRoot, ".byline-build", "publication-media-descriptors.json"), JSON.stringify(publicationMediaDescriptors));
}
// Byline Data: exactly the releases the accepted snapshot (or the fixture) names, verified
// (bytes, SHA-256, canonical schema, descriptor) and materialized BEFORE Astro renders, because
// presentations render their rows on the server. Astro then reads only these local files.
const dataStarted = performance.now();
const { loadFixtureDataSection, materializeDataReleases, buildDataEndpoint } = await tsImport("../lib/data-releases.ts", import.meta.url);
let dataSection = { projects: [], releases: [] };
let dataSource = null;
if (snapshot) {
  dataSection = snapshot.data;
  const offline = process.env.BYLINE_BUILD_DATA_DIR?.trim();
  const endpoint = process.env.BYLINE_NEWSROOM_BUILD_DATA_URL?.trim() || (payloadBuildUrl ? buildDataEndpoint(payloadBuildUrl) : "");
  dataSource = offline ? { kind: "fixture", directory: path.resolve(projectRoot, offline) } : endpoint ? { kind: "newsroom", endpoint, token: process.env.BYLINE_BUILD_TOKEN ?? "" } : null;
} else if (process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture")) {
  const fixtureData = await loadFixtureDataSection(projectRoot);
  dataSection = fixtureData.section;
  dataSource = { kind: "fixture", directory: fixtureData.directory };
}
if (dataSection.releases.length && !dataSource) throw new Error("This snapshot names Data releases: set BYLINE_NEWSROOM_BUILD_URL (or BYLINE_NEWSROOM_BUILD_DATA_URL, or BYLINE_BUILD_DATA_DIR) and BYLINE_BUILD_TOKEN.");
const dataDirectory = path.join(projectRoot, ".byline-build", "data");
await mkdir(path.join(projectRoot, ".byline-build"), { recursive: true });
const dataFile = path.join(projectRoot, ".byline-build", "public-data.json");
await writeFile(dataFile, JSON.stringify(dataSection));
const dataMetrics = dataSection.releases.length ? await materializeDataReleases(dataSection, dataSource, dataDirectory) : { files: 0, bytes: 0, requests: 0 };
if (dataMetrics.files) console.log(`[byline] Data: ${dataSection.projects.length} projects, ${dataMetrics.files} releases (${(dataMetrics.bytes / 1024).toFixed(1)} KB) verified.`);
process.env.BYLINE_PREPARED_DATA_FILE = dataFile;
process.env.BYLINE_PREPARED_DATA_DIR = dataDirectory;
const dataMs = performance.now() - dataStarted;

const buildStarted = performance.now();
let buildOutput = "";
const child = spawn(process.execPath, [...(snapshot ? ["--import", path.join(projectRoot, "scripts/assert-snapshot-network.mjs")] : []), astroCommand, ...astroArguments], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ...(publication ? { BYLINE_PUBLICATION_JSON: JSON.stringify(publication) } : {}),
    ...(publication?.urls?.publicSite && !process.env.NEXT_PUBLIC_SITE_URL ? { NEXT_PUBLIC_SITE_URL: publication.urls.publicSite } : {}),
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

// The exact verified release bytes, public at /_byline/data/<sha256>.json for presentations' optional client code.
if (isBuild && dataSection.releases.length) {
  const target = path.join(projectRoot, "out", "_byline", "data");
  await mkdir(target, { recursive: true });
  for (const { sha256 } of dataSection.releases) await cp(path.join(dataDirectory, `${sha256}.json`), path.join(target, `${sha256}.json`));
}

if (astroArguments[0] === "build") {
  const cleanLog = buildOutput.replace(/\x1b\[[0-9;]*m/g, "");
  const restored = (cleanLog.match(/\((?:restored|cached)\)/g) || []).length;
  const emitted = (cleanLog.match(/[├└]─ /g) || []).length;
  await writeFile(path.join(projectRoot, ".byline-build", "frontend-phases.json"), JSON.stringify({
    totalStartedAt, acquisitionMs, downloadMs, parseMs, snapshotBytes, snapshotIdentity, cmsRequests,
    dataMode: acquisitionMode,
    snapshotSource, publicationMedia: publicationMediaMetrics, data: { projects: dataSection.projects.length, ...dataMetrics, ms: dataMs },
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
