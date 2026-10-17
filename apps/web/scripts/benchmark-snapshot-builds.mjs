// Reproducible Cloudflare-facing build scenarios. Input is a complete public
// snapshot from WordPress (never credentials or an authenticated export).
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateBuildSnapshot } from "../lib/prepared-snapshot.ts";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv[2] || !process.argv[3]) throw new Error("Usage: node scripts/benchmark-snapshot-builds.mjs /absolute/snapshot.json /absolute/results-directory");
const input = validateBuildSnapshot(JSON.parse(await readFile(path.resolve(process.argv[2]), "utf8")));
const destination = path.resolve(process.argv[3]);
await mkdir(destination, { recursive: true });
let current = input;
let requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  const bytes = Buffer.from(JSON.stringify(current));
  const digest = createHash("sha256").update(bytes).digest("hex");
  response.setHeader("Content-Type", "application/json");
  if (request.url.startsWith("/wp-json/byline/v1/build-snapshot")) {
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify({ schemaVersion: 1, revision: current.revision, generatedAt: current.generatedAt, bytes: bytes.length, digest, url: `http://127.0.0.1:${server.address().port}/snapshot-${digest}.json` }));
  } else if (request.url === `/snapshot-${digest}.json`) {
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable"); response.end(bytes);
  } else { response.statusCode = 500; response.end("Unexpected legacy content request"); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const results = [];
async function build(name, snapshot, cold = false) {
  current = snapshot; requests = [];
  // Cloudflare persists Astro's cache, not this public media directory. Every
  // scenario therefore starts with cold media, even the warm incremental runs.
  await rm(path.join(web, "public/_wordpress-media"), { recursive: true, force: true });
  if (cold) await rm(path.join(web, "node_modules/.astro"), { recursive: true, force: true });
  const { BYLINE_BUILD_SNAPSHOT_FILE, BYLINE_CONTENT_MODE, BYLINE_PUBLICATION_JSON, BYLINE_PUBLICATION_FILE, BYLINE_LEGACY_REST_BUILD, NODE_OPTIONS, ...environment } = process.env;
  let output = "";
  const child = spawn("npm", ["run", "build"], { cwd: web, env: { ...environment, BYLINE_BUILD_SNAPSHOT_URL: `http://127.0.0.1:${server.address().port}/wp-json/byline/v1/build-snapshot`, WORKERS_CI_BUILD_UUID: `benchmark-${name}`, WORKERS_CI_COMMIT_SHA: "same-code", WORKERS_CI_BRANCH: "benchmark", ...(environment.BYLINE_BENCHMARK_REPLAY_ORIGIN ? { NODE_OPTIONS: `--import=${path.join(web, "scripts/benchmark-replay-network.mjs")}` } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  const status = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
  await writeFile(path.join(destination, `${name}.log`), output);
  if (status !== 0) throw new Error(`${name} failed; see ${destination}/${name}.log`);
  if (requests.length !== 2 || !requests[0].startsWith("/wp-json/byline/v1/build-snapshot")) throw new Error(`${name}: expected exactly pointer + artifact; got ${requests}`);
  const metrics = JSON.parse(await readFile(path.join(web, ".byline-build/performance.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(web, "out/_byline/media-manifest.json"), "utf8"));
  const mediaStatuses = Object.fromEntries(Object.values(manifest.items).map((entry) => [entry.sourceUrl, entry.status]));
  if (name !== "cold") {
    const reference = results[0].mediaStatuses;
    for (const [url, status] of Object.entries(mediaStatuses)) if (reference[url] !== status) throw new Error(`${name}: media outcome changed for ${url}; benchmark is not comparable`);
  }
  results.push({ scenario: name, requests, mediaStatuses, ...metrics });
  await cp(path.join(web, ".byline-build"), path.join(destination, name), { recursive: true });
  if (name === "cold") await cp(path.join(web, "out"), path.join(destination, "cold-output"), { recursive: true });
  console.log(`${name}: ${(metrics.totalFrontendMs / 1000).toFixed(2)}s; ${metrics.routes.rendered} rendered / ${metrics.routes.restored} restored`);
}
try {
  await build("cold", input, true);
  await build("warm-noop", input);
  const edit = structuredClone(input);
  const story = edit.datasets.posts.find((post) => post.status === "publish");
  if (!story) throw new Error("Benchmark requires a published story");
  story.title.rendered += " — benchmark edit"; story.excerpt.rendered += "<p>Benchmark update.</p>"; story.content.rendered += "<p>Benchmark article edit.</p>";
  edit.revision++; edit.publication.revision = edit.revision;
  await build("single-article", edit);
  const global = structuredClone(edit); global.publication.identity.tagline += " — benchmark global change"; global.revision++; global.publication.revision = global.revision;
  await build("global-change", global);
  // Unpublish/delete must remove the old route even with a warm Astro cache.
  const deleted = structuredClone(global); deleted.datasets.posts = deleted.datasets.posts.filter((p) => p.id !== story.id); deleted.counts.posts--; deleted.revision++; deleted.publication.revision = deleted.revision;
  await build("unpublish", deleted);
  const removedPath = results[0].routeResults.find((entry) => entry.path.includes(`/${story.slug}/`))?.path;
  if (!removedPath || await stat(path.join(web, "out", removedPath.replace(/^\//, ""))).then(() => true, () => false)) throw new Error("Unpublished article survived in static output");
  await writeFile(path.join(destination, "results.json"), JSON.stringify({ node: process.version, generatedAt: new Date().toISOString(), note: process.env.BYLINE_BENCHMARK_REPLAY_ORIGIN ? "Recorded public content and exact media bytes over loopback HTTP, cold media each scenario; only Astro cache persists." : "Local snapshot pointer/artifact replay; live cold media every scenario; only Astro cache persists.", editedStory: { id: story.id, slug: story.slug }, results }, null, 2));
} finally { server.close(); }
