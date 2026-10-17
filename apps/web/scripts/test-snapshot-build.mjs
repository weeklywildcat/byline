// CI exercises the production acquisition path with deterministic public inputs.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = async (file) => JSON.parse(await readFile(path.resolve(web, file), "utf8"));
const [fixture, publication, presentations, gallery] = await Promise.all([read("tests/fixtures/weekly-wildcat-content.json"), read("tests/fixtures/weekly-wildcat-publication.json"), read("../../tests/fixtures/story-presentations.json"), read("../../tests/fixtures/gallery-media.json")]);
for (const post of fixture.posts) {
  if (post.id === 4) post.content.rendered += presentations.rendered;
  if (post.id === 5) post.content.rendered += gallery.rendered;
}
const datasets = { posts: fixture.posts, authors: fixture.authors, categories: fixture.categories, tags: fixture.tags, pages: fixture.pages, guests: [], corrections: [], coverages: [], schoolEvents: [], attachments: [] };
const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: publication.revision, generatedAt: new Date().toISOString(), sourceTimezone: publication.timezone, publication, datasets, counts: Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length])) }));
const digest = createHash("sha256").update(bytes).digest("hex");
const requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  response.setHeader("Content-Type", "application/json");
  if (request.url.startsWith("/wp-json/byline/v1/build-snapshot")) response.end(JSON.stringify({ schemaVersion: 1, revision: publication.revision, generatedAt: new Date().toISOString(), digest, bytes: bytes.length, url: `http://127.0.0.1:${server.address().port}/snapshot-${digest}.json` }));
  else if (request.url === `/snapshot-${digest}.json`) response.end(bytes);
  else { response.statusCode = 500; response.end("Unexpected legacy CMS request"); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const child = spawn("npm", ["run", "build"], { cwd: web, env: { ...process.env, BYLINE_LEGACY_REST_BUILD: "0", BYLINE_CONTENT_MODE: "weekly-wildcat-fixture", BYLINE_BUILD_SNAPSHOT_URL: `http://127.0.0.1:${server.address().port}/wp-json/byline/v1/build-snapshot` }, stdio: "inherit" });
  const status = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
  if (status !== 0) throw new Error(`Snapshot fixture build failed: ${status}`);
  if (requests.length !== 2) throw new Error(`Expected pointer + artifact only, got ${requests}`);
  const metrics = await read(".byline-build/performance.json");
  if (metrics.dataMode !== "prepared-snapshot" || metrics.cmsRequests !== 2) throw new Error("CI did not exercise the production snapshot path");
  console.log("Verified production snapshot path: two acquisition requests, zero renderer CMS requests, full route/media/SEO verification.");
} finally { server.close(); }
