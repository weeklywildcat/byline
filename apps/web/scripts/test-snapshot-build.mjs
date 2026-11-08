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
// A first-class video story, so the build's SEO verification sees a real watch
// page: the server-rendered player, its VideoObject and the video sitemap entry.
const { live: _live, ...plain } = structuredClone(fixture.posts.find((post) => post.id === 9));
fixture.posts.push({
  ...plain,
  id: 90,
  slug: "weekly-wildcat-fixture-video",
  link: "https://weeklywildcat.com/2026/08/14/news/weekly-wildcat-fixture-video/",
  date: "2026-08-14T09:00:00",
  date_gmt: "2026-08-14T13:00:00",
  modified: "2026-08-14T09:00:00",
  modified_gmt: "2026-08-14T13:00:00",
  title: { rendered: "Fixture video story" },
  excerpt: { rendered: "<p>The fixture video, with its reporting below.</p>" },
  content: { rendered: "<p>Reporting that supports the video, below the player.</p>" },
  byline: { format: "video", video: { provider: "youtube", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Fixture video", thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", uploadDate: "2026-08-14T12:00:00Z", duration: "PT1M32S" } }
});
// Mixed-category, sticky BTS articles exercise placement through the real
// snapshot/build boundary, while keeping the general news homepage unchanged.
const btsCategory = { id: 91, count: 3, name: "Off Deadline", slug: "behind-the-scenes", taxonomy: "category", parent: 0, description: "Stories behind the stories", link: "https://weeklywildcat.com/category/behind-the-scenes/" };
fixture.categories.push(btsCategory);
// Exercise video indexing independently of general news/Watch placement, too.
// This snapshot-only video stays out of the baseline fixture's news packages.
const videoStory = fixture.posts.find((post) => post.id === 90);
videoStory.categories = [...videoStory.categories, btsCategory.id];
videoStory._embedded = { ...videoStory._embedded, "wp:term": [[...videoStory._embedded["wp:term"][0], btsCategory], videoStory._embedded["wp:term"][1] ?? []] };
for (const [id, day, slug, title] of [
  [91, "22", "building-the-newsroom", "Building the newsroom website"],
  [92, "21", "our-reporting-tools", "Inside our reporting tools"]
]) {
  fixture.posts.push({ ...structuredClone(plain), id, slug, sticky: true,
    date: `2026-08-${day}T09:00:00`, date_gmt: `2026-08-${day}T13:00:00`,
    modified: `2026-08-${day}T09:00:00`, modified_gmt: `2026-08-${day}T13:00:00`,
    link: `https://weeklywildcat.com/2026/08/${day}/news/${slug}/`,
    title: { rendered: title }, excerpt: { rendered: "<p>How our newsroom works behind the scenes.</p>" },
    content: { rendered: "<p>A technical look at the tools we use to publish student journalism.</p>" },
    categories: [...plain.categories, btsCategory.id],
    _embedded: { ...structuredClone(plain._embedded), "wp:term": [[...plain._embedded["wp:term"][0], btsCategory], plain._embedded["wp:term"][1] ?? []] }
  });
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
