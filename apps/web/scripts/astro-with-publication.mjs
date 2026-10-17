import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createHash, randomUUID } from "node:crypto";
import { parseBuildSnapshot } from "../lib/prepared-snapshot.ts";

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
if (isBuild && (!fixture || process.env.BYLINE_BUILD_SNAPSHOT_FILE || process.env.BYLINE_BUILD_SNAPSHOT_URL) && process.env.BYLINE_LEGACY_REST_BUILD !== "1") {
  let bytes;
  let pointer;
  if (process.env.BYLINE_BUILD_SNAPSHOT_FILE) {
    // Deliberate offline fixture/benchmark input; still enforce the contract.
    bytes = await readFile(path.resolve(projectRoot, process.env.BYLINE_BUILD_SNAPSHOT_FILE));
  } else {
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
  snapshotBytes = bytes.byteLength;
  const parseStarted = performance.now();
  snapshot = parseBuildSnapshot(bytes, pointer, Number(process.env.BYLINE_EXPECTED_REVISION || 0));
  parseMs = performance.now() - parseStarted;
  snapshotIdentity = { schemaVersion: snapshot.schemaVersion, revision: snapshot.revision, generatedAt: snapshot.generatedAt, artifactDigest: createHash("sha256").update(bytes).digest("hex"), bytes: snapshotBytes };
}
const publication = snapshot?.publication ?? await loadPublication();
if (publication) publication.appearance = { theme: "weekly-wildcat", tokenOverrides: {} };
const acquisitionMs = performance.now() - acquisitionStarted;
if (astroArguments[0] === "build") {
  const buildDirectory = path.join(projectRoot, ".byline-build");
  await rm(buildDirectory, { recursive: true, force: true });
  await mkdir(buildDirectory, { recursive: true });
  if (snapshot) await rm(path.join(projectRoot, "public/_wordpress-media"), { recursive: true, force: true });
}
if (snapshot) {
  const file = path.join(projectRoot, ".byline-build", "public-snapshot.json");
  await writeFile(file, JSON.stringify(snapshot));
  process.env.BYLINE_PREPARED_SNAPSHOT_FILE = file;
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

if (astroArguments[0] === "build") {
  const cleanLog = buildOutput.replace(/\x1b\[[0-9;]*m/g, "");
  const restored = (cleanLog.match(/\((?:restored|cached)\)/g) || []).length;
  const emitted = (cleanLog.match(/[├└]─ /g) || []).length;
  await writeFile(path.join(projectRoot, ".byline-build", "frontend-phases.json"), JSON.stringify({
    totalStartedAt, acquisitionMs, downloadMs, parseMs, snapshotBytes, snapshotIdentity, cmsRequests: snapshot ? cmsRequests : fixture ? 0 : null,
    dataMode: snapshot ? "prepared-snapshot" : fixture ? "fixture" : "legacy-rest-compatibility",
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
