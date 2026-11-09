/**
 * Phase 9 acceptance gate: completed-snapshot builds and direct-source
 * recovery builds of the SAME Payload public revision produce the same static
 * site (docs/payload-build-snapshots.md#acceptance).
 *
 *   DATABASE_URL=postgres://localhost:5432/<empty db> PAYLOAD_SECRET=… \
 *   BYLINE_MEDIA_LOCAL_DIR=<dir> BYLINE_PUBLICATION_MEDIA_DIR=<dir> \
 *   npx payload migrate && npx payload run scripts/payload-snapshot-parity.ts -- <output dir>
 *
 * It seeds a deterministic public newsroom (structured and plain stories,
 * staff and guest contributors, sections, topics, real photographs prepared by
 * the Phase 5 media job, a PDF, a public Collection, a correction, a Page and
 * an event, plus private sentinels), prepares the snapshot, serves the
 * build-only API over HTTP, and runs the real static build twice:
 *
 *   1. discovery → completed immutable artifact → Astro → prepared media → postbuild verification
 *   2. the same revision reported not ready → direct-source recovery → the same path
 *
 * then compares the accepted snapshot, the prepared-media descriptor set, the
 * route set and every output file. Development/CI only; never production.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARTICLE_BLOCK_TYPES, type ArticleBody, type ArticleBodyNode } from "@byline/article-body";
import { chromium } from "@playwright/test";
import { FIXTURE_ARTICLE_BODY } from "@byline/article-body/fixtures";
import { sql } from "@payloadcms/db-postgres";
import { createLocalReq, getPayload } from "payload";
import { lexicalFromArticleBody } from "../../../packages/editor/tests/lexical-fixture";
import config from "../src/payload.config";
import { readPublicationState } from "../src/db/publication-state";
import { serveBuildMedia } from "../src/publication-media/build-endpoint";
import { drizzleFor } from "../src/publication-media/state";
import { serveDirectSnapshot, serveSnapshotArtifact, serveSnapshotDiscovery } from "../src/public/snapshot/endpoints";
import { runPublicSnapshotPreparation } from "../src/public/snapshot/prepare";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const web = path.join(repo, "apps/web");
const outputRoot = path.resolve(process.argv.slice(2).find((arg) => !arg.startsWith("-")) ?? path.join(process.cwd(), ".payload-snapshot-parity"));
const TOKEN = process.env.BYLINE_BUILD_TOKEN && process.env.BYLINE_BUILD_TOKEN.length >= 32 ? process.env.BYLINE_BUILD_TOKEN : `parity-${createHash("sha256").update(String(Date.now())).digest("hex")}`;
process.env.BYLINE_BUILD_TOKEN = TOKEN;

process.env.BYLINE_STORY_PRESENTATION_FIXTURES = "1";
const payload = await getPayload({ config });
const log = (message: string) => console.log(`[parity] ${message}`);

/* ------------------------------------------------------------ seed */
async function upload(file: string, alt: string, credit: string) {
  const data = readFileSync(path.join(repo, "tests/fixtures/story-media", file));
  const mimetype = file.endsWith(".pdf") ? "application/pdf" : file.endsWith(".wav") ? "audio/wav" : "image/jpeg";
  const media = await payload.create({ collection: "media", data: { alt, credit, copyright: "© 2026 The Weekly Wildcat" }, file: { data, mimetype, name: `parity-${file}`, size: data.length }, overrideAccess: true });
  return media.id as number;
}

async function seed() {
  if ((await payload.count({ collection: "stories" })).totalDocs > 0) throw new Error("The parity gate needs an empty database.");
  const news = (await payload.create({ collection: "sections", data: { name: "News", slug: "news", description: "News from Ninety Six High School." } })).id;
  const sports = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "sports" } })).id;
  const budget = (await payload.create({ collection: "topics", data: { name: "Budget", slug: "budget" } })).id;
  const football = (await payload.create({ collection: "topics", data: { name: "Football", slug: "football" } })).id;
  const meeting = await upload("newsroom-meeting.jpg", "Students review survey results around a table.", "Jordan Lee");
  const laughing = await upload("newsroom-laughing.jpg", "A junior laughs with friends on the courtyard steps.", "Maya Torres");
  const portrait = await upload("newsroom-meeting-before.jpg", "Ada Reporter.", "The Weekly Wildcat");
  const pdf = await upload("document.pdf", "", "Greenwood district");
  const audio = await upload("audio.wav", "", "Weekly Wildcat audio desk");
  await payload.jobs.run({ queue: "media", limit: 50 });
  const ada = (await payload.create({ collection: "people", data: { name: "Ada Reporter", slug: "ada-reporter", status: "active", newsroomRole: "Staff Writer", shortBio: "Ada covers the district.", bio: "Ada covers the district for the Weekly Wildcat.", portrait, publicEmail: "ada@weeklywildcat.com", socials: [{ label: "Instagram", url: "https://instagram.com/ada" }] } })).id;
  const ben = (await payload.create({ collection: "people", data: { name: "Ben Writer", slug: "ben-writer", status: "active", newsroomRole: "Sports Editor" } })).id;
  const gus = (await payload.create({ collection: "people", data: { name: "Gus Guest", slug: "gus-guest", status: "guest", hasProfilePage: true, bio: "Gus writes columns." } })).id;
  const olive = (await payload.create({ collection: "people", data: { name: "Olive Once", slug: "olive-once", status: "guest", hasProfilePage: false } })).id;

  const owner = await payload.create({ collection: "users", data: { email: "sentinel-account@example.test", password: "parity-account-password", name: "SENTINEL-PRIVATE-USER", role: "editor", enabled: true, googleSubject: "SENTINEL-GOOGLE-SUBJECT", linkedPerson: ada } });
  const story = async (data: Record<string, unknown>, publishedAt: string) => {
    const created = await payload.create({ collection: "stories", data, draft: true });
    try {
      const req = await createLocalReq({ user: { ...owner, collection: "users" } }, payload);
      await payload.update({ collection: "stories", id: created.id, data: { _status: "published", publishedAt }, req, overrideAccess: false });
    } catch (error) {
      log(`Fixture publish failed for ${String(data.headline)}: ${JSON.stringify((error as { data?: unknown }).data)}`);
      throw error;
    }
    const db = await drizzleFor(payload);
    await db.execute(sql`update stories set published_at = ${publishedAt}, updated_at = ${publishedAt} where id = ${created.id}`);
    return created.id as number;
  };
  // 11:30 p.m. Eastern: the next day in UTC; the URL keeps the Eastern date.
  const late = await story({ headline: "Wildcats win the opener late", slug: "wildcats-win-opener", deck: "A fourth-quarter comeback.", section: sports, topics: [football], contributors: [ben, olive], featuredMedia: laughing, body: lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes: FIXTURE_ARTICLE_BODY.nodes.filter((node) => node.type === "paragraph").slice(0, 3), media: {} } as ArticleBody) }, "2026-11-08T04:30:00.000Z");
  const plain = await story({ headline: "Library extends its hours", slug: "library-hours", section: news, contributors: [ada], body: lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes: FIXTURE_ARTICLE_BODY.nodes.filter((node) => node.type === "paragraph").slice(0, 2), media: {} } as ArticleBody) }, "2026-10-20T15:00:00.000Z");
  await payload.update({ collection: "stories", id: plain, data: { _status: "draft" } });
  await payload.create({ collection: "redirects", data: { from: "/old-newsroom.html", to: "/media-kit/", reason: "manual" } });
  // Both builds must deploy a permanent alias for each spelling of the historical address.
  await payload.update({ collection: "stories", id: plain, data: { slug: "library-extends-hours", publishedAt: "2026-10-20T15:00:00.000Z", _status: "published" } });

  await payload.update({ collection: "stories", id: late, data: {
    liveCoverage: { state: "ended", startedAt: "2026-11-07T23:00:00.000Z", endedAt: "2026-11-08T04:30:00.000Z" }
  }, context: { bylineImport: true } });
  const liveBody = lexicalFromArticleBody({ format: "byline-v1", version: 1, media: {}, nodes: [
    { type: "paragraph", children: [{ type: "text", text: "The Wildcats win after a late comeback." }] }
  ] });
  await payload.create({ collection: "live-updates", data: { story: late, headline: "Final score", body: liveBody, photo: laughing,
    pinned: true, state: "published", publishedAt: "2026-11-08T04:30:00.000Z" } });
  await payload.create({ collection: "live-updates", data: { story: late, headline: "SENTINEL-DRAFT-LIVE-UPDATE", body: liveBody, state: "draft" } });
  const poll = await payload.create({ collection: "polls", data: {
    pollKey: "parity-lunch", question: "Should the school open another lunch window?", status: "closed",
    options: [{ optionId: "yes", label: "Yes, open a window" }, { optionId: "no", label: "Keep the current windows" }]
  } });
  const db = await drizzleFor(payload);
  for (let i = 0; i < 6; i++) {
    await db.execute(sql`insert into byline_poll_votes (poll_id, option_id, voter_key) values (${poll.pollKey}, ${i < 4 ? "yes" : "no"}, ${`SENTINEL-VOTER-${i}`})`);
  }
  const event = await payload.create({ collection: "events", data: { title: "Homecoming", slug: "homecoming", eventType: "game", startAt: "2027-10-30T23:00:00.000Z", endAt: "2027-10-31T01:30:00.000Z", location: "Wildcat Stadium", eventStatus: "scheduled", _status: "published" } });
  const remap = (id: unknown) => Number(id) % 2 === 1 ? meeting : laughing;
  const nodes = FIXTURE_ARTICLE_BODY.nodes.map((node): ArticleBodyNode => {
    switch (node.type) {
      case "paragraph":
        return { ...node, children: node.children.map((child) => child.type === "source" && child.kind === "document" ? { ...child, media: pdf } : child) };
      case "timeline":
        return { ...node, items: node.items.map((item) => ({
          ...item,
          ...(item.image && { image: { ...item.image, media: remap(item.image.media) } }),
          ...(item.document && { document: { ...item.document, media: pdf } })
        })) };
      case "event":
        return { ...node, event: event.id };
      case "photo":
      case "portraitText":
      case "annotatedImage":
      case "visualChapter":
        return { ...node, media: remap(node.media) };
      case "gallery":
        return { ...node, items: node.items.map((item) => ({ ...item, media: remap(item.media) })) };
      case "beforeAfter":
        return { ...node, before: meeting, after: laughing };
      case "chartMap":
        return { ...node, image: laughing };
      case "document":
        return { ...node, media: pdf };
      case "audio":
        return { ...node, media: audio };
      case "relatedCoverage":
        return { ...node, stories: [{ id: "library", story: plain }, { id: "sports", story: late }] };
      case "poll":
        return { ...node, poll: poll.id };
      default:
        return node;
    }
  });
  const structured = await story({ headline: "Board approves a leaner lunch budget", slug: "board-approves-lunch-budget", deck: "The vote ends a month of debate.", section: news, topics: [budget], contributors: [ada, gus, olive], featuredMedia: meeting, featuredCaption: "The board meets on Tuesday.", body: lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes, media: {} } as ArticleBody), reportingNote: "We attended the meeting." }, "2026-10-14T14:05:00.000Z");
  await payload.create({ collection: "stories", data: { headline: "SENTINEL-UNPUBLISHED-STORY", section: news }, draft: true });
  await payload.update({ collection: "stories", id: plain, data: { headline: "SENTINEL-NEWER-DRAFT" }, draft: true });
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: structured } }, limit: 1, depth: 0, overrideAccess: true })).docs[0];
  await payload.update({ collection: "story-plans", id: plan.id, data: { brief: "SENTINEL-PRIVATE-BRIEF" }, overrideAccess: true, context: { bylineSystem: true } });
  await payload.create({ collection: "sources", data: { story: structured, label: "Board member", notes: "SENTINEL-SOURCE-NOTES" }, overrideAccess: true, context: { bylineSystem: true } });
  const privateWrite = { overrideAccess: true, context: { bylineSystem: true } };
  await payload.create({ collection: "tasks", data: { story: structured, title: "SENTINEL-PRIVATE-TASK" }, ...privateWrite });
  await payload.create({ collection: "appointments", data: { story: structured, title: "Interview", notes: "SENTINEL-PRIVATE-APPOINTMENT" }, ...privateWrite });
  await payload.create({ collection: "production-assignments", data: { story: structured, type: "photo", title: "Portrait", notes: "SENTINEL-PRIVATE-PRODUCTION" }, ...privateWrite });
  const [draftDistribution, sentDistribution, failedDistribution] = (await payload.find({
    collection: "distribution-items", where: { story: { equals: structured } }, sort: "id", pagination: false
  })).docs;
  await payload.update({ collection: "distribution-items", id: draftDistribution.id, data: {
    state: "draft", textMode: "custom", text: "SENTINEL-DISTRIBUTION-DRAFT-CAPTION", owner: owner.id,
    note: "SENTINEL-DISTRIBUTION-NOTE", plannedFor: "2026-11-10T14:00:00.000Z"
  }, ...privateWrite });
  await payload.update({ collection: "distribution-items", id: sentDistribution.id, data: {
    state: "posted", approvedBy: owner.id, approvedAt: "2026-11-09T15:00:00.000Z",
    sent: [{ at: "2026-11-09T15:00:00.000Z", by: owner.id, destination: sentDistribution.destination, text: "SENTINEL-DISTRIBUTION-HISTORY" }]
  }, ...privateWrite });
  await payload.update({ collection: "distribution-items", id: failedDistribution.id, data: {
    state: "failed", failure: "SENTINEL-DISTRIBUTION-FAILURE"
  }, ...privateWrite });

  // Seed private Media fields on a referenced prepared asset without changing its public metadata.
  await db.execute(sql`update media set url = '/api/media/file/SENTINEL-PRIVATE-ORIGINAL', thumbnail_u_r_l = '/api/media/file/SENTINEL-LIBRARY-PREVIEW' where id = ${meeting}`);
  await payload.create({ collection: "corrections", data: { story: structured, type: "correction", text: "An earlier version misstated the vote count.", date: "2026-10-15T13:00:00.000Z" } });
  const collection = await payload.create({ collection: "collections", data: { name: "Budget season", brief: "SENTINEL-COLLECTION-BRIEF", stories: [structured, plain], publicPresentation: { enabled: true, format: "series", title: "Budget season", slug: "budget-season", description: "How the district paid for lunch.", overview: "Our reporting on the budget.\n\nIt continues.", artwork: meeting, storyOrder: [plain, structured] } }, context: { bylineSystem: true } });
  await payload.create({ collection: "collection-interviews", data: { collection: collection.id, interviewee: "Principal", privateContact: "SENTINEL-PRIVATE-INTERVIEW" }, ...privateWrite });
  await payload.create({ collection: "collection-resources", data: { collections: [collection.id], label: "SENTINEL-PRIVATE-RESOURCE", url: "https://example.test/private" }, ...privateWrite });
  const page = await payload.create({ collection: "pages", data: { title: "About the newsroom", slug: "about-the-newsroom", summary: "Who we are.", body: { root: { type: "root", version: 1, children: [{ type: "heading", tag: "h2", version: 1, children: [{ type: "text", text: "Our mission", format: 0, version: 1 }] }, { type: "paragraph", version: 1, children: [{ type: "text", text: "We are student journalists.", format: 0, version: 1 }] }] } }, _status: "published" } });
  await payload.create({ collection: "pages", data: { parent: page.id, title: "Contact our newsroom", slug: "contact-our-newsroom",
    summary: "Get in touch.", _status: "published" } });
  return { structured, late, plain };
}

/* ------------------------------------------------------------ build-only API over HTTP */
async function serve() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const req = await createLocalReq({}, payload);
    Object.assign(req, { headers: new Headers(Object.entries(request.headers).flatMap(([key, value]): Array<[string, string]> => (typeof value === "string" ? [[key, value]] : []))), url: url.toString(), searchParams: url.searchParams });
    const match = /^\/api\/byline\/build\/(snapshot|direct|media)(?:\/([0-9a-f]{64}))?$/.exec(url.pathname);
    let res: Response;
    try {
      if (!match) res = new Response("not found", { status: 404 });
      else if (match[1] === "snapshot" && !match[2]) res = await serveSnapshotDiscovery(req);
      else if (match[1] === "snapshot") res = await serveSnapshotArtifact(Object.assign(req, { routeParams: { sha256: match[2] } }));
      else if (match[1] === "direct") res = await serveDirectSnapshot(req);
      else res = await serveBuildMedia(Object.assign(req, { routeParams: { sha256: match[2] } }));
    } catch (error) {
      res = new Response(String(error), { status: 500 });
    }
    requests.push(`${request.method} ${url.pathname}${url.search} ${res.status}`);
    response.writeHead(res.status, Object.fromEntries(res.headers.entries()));
    response.end(Buffer.from(await res.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}
const requests: string[] = [];

function build(env: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", "build", "--", "--force"], { cwd: web, env, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`static build failed (${code})`))));
  });
}

function files(root: string, base = root): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? files(absolute, base) : [path.relative(base, absolute)];
  }).sort();
}
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/* ------------------------------------------------------------ run */
const ids = await seed();
const prepared = await runPublicSnapshotPreparation(payload);
if (prepared.outcome !== "ready") throw new Error(`Snapshot not prepared: ${JSON.stringify(prepared)}`);
log(`prepared revision ${prepared.revision} (${prepared.pointer.sha256.slice(0, 12)}…, ${prepared.pointer.bytes} bytes)`);
const server = await serve();
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.BYLINE_NEWSROOM_URL = origin;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["DATABASE_URL", "PAYLOAD_SECRET", "BYLINE_CONTENT_MODE", "BYLINE_BUILD_SNAPSHOT_FILE", "BYLINE_BUILD_SNAPSHOT_URL", "BYLINE_PUBLICATION_FILE", "BYLINE_PUBLICATION_JSON", "NODE_OPTIONS", "NODE_ENV"].includes(key)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
Object.assign(env, { BYLINE_CONTENT_MODE: "weekly-wildcat-fixture", BYLINE_STORY_PRESENTATION_FIXTURES: "1", BYLINE_NEWSROOM_BUILD_URL: `${origin}/api/byline/build`, BYLINE_BUILD_TOKEN: TOKEN, BYLINE_NEWSROOM_URL: origin, BYLINE_LEGACY_REST_BUILD: "0" });
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const results: Record<string, { out: string; build: string; requests: string[] }> = {};
try {
  for (const mode of ["prepared-snapshot", "direct-source-recovery"] as const) {
    if (mode === "direct-source-recovery") {
      // Same public revision, same content: only the completed pointer is absent.
      const db = await drizzleFor(payload);
      await db.execute(sql`update byline_publication_state set completed_revision = null, completed_schema_version = null, completed_sha256 = null, completed_bytes = null, completed_generated_at = null, completed_filename = null, completed_producer_version = null where id = 1`);
    }
    const revision = (await readPublicationState(payload)).currentRevision;
    if (revision !== prepared.revision) throw new Error("The public revision moved during the parity gate.");
    requests.length = 0;
    log(`building (${mode})…`);
    await build(env);
    const out = path.join(outputRoot, `out-${mode}`);
    const report = path.join(outputRoot, `build-${mode}`);
    cpSync(path.join(web, "out"), out, { recursive: true });
    cpSync(path.join(web, ".byline-build"), report, { recursive: true });
    results[mode] = { out, build: report, requests: [...requests] };
    const phases = JSON.parse(readFileSync(path.join(report, "frontend-phases.json"), "utf8"));
    if (phases.dataMode !== mode) throw new Error(`Expected ${mode}, the build used ${phases.dataMode}.`);
    if (existsSync(path.join(report, "forbidden-cms-requests.ndjson"))) throw new Error(`${mode}: the renderer made CMS requests.`);
    log(`${mode}: ${requests.filter((line) => !line.includes("/media/")).join(", ")}; ${requests.filter((line) => line.includes("/media/")).length} media downloads`);
  }
} finally {
  server.close();
}

/* ------------------------------------------------------------ compare */
const [a, b] = [results["prepared-snapshot"], results["direct-source-recovery"]];
const snapshotOf = (report: string) => ({ ...JSON.parse(readFileSync(path.join(report, "public-snapshot.json"), "utf8")), generatedAt: "" });
const problems: string[] = [];
if (JSON.stringify(snapshotOf(a.build)) !== JSON.stringify(snapshotOf(b.build))) problems.push("accepted snapshots differ beyond generatedAt");
if (digest(path.join(a.build, "publication-media-descriptors.json")) !== digest(path.join(b.build, "publication-media-descriptors.json"))) problems.push("prepared-media descriptor sets differ");
if (digest(path.join(a.build, "expected-routes.json")) !== digest(path.join(b.build, "expected-routes.json"))) problems.push("route manifests differ");
if (digest(path.join(a.build, "route-cache-keys.json")) !== digest(path.join(b.build, "route-cache-keys.json"))) problems.push("route dependency keys differ");
const [filesA, filesB] = [files(a.out), files(b.out)];
if (JSON.stringify(filesA) !== JSON.stringify(filesB)) problems.push(`output file sets differ: ${filesA.filter((file) => !filesB.includes(file)).concat(filesB.filter((file) => !filesA.includes(file))).slice(0, 10).join(", ")}`);
const differing = filesA.filter((file) => filesB.includes(file) && digest(path.join(a.out, file)) !== digest(path.join(b.out, file)));
// Build timing metrics are per build by design, and a JSON report's own `generatedAt` is the
// build's clock; everything else (every page, feed, sitemap, asset and media file) must be identical.
const volatile = new Set(["_byline/build-metrics.json"]);
function withoutManifestClock(out: string) {
  const { generatedAt: _generatedAt, ...facts } = JSON.parse(readFileSync(path.join(out, "_byline/manifest.json"), "utf8"));
  return JSON.stringify(facts);
}
const unexpected = differing.filter((file) => !volatile.has(file) && !(file === "_byline/manifest.json" && withoutManifestClock(a.out) === withoutManifestClock(b.out)));
if (unexpected.length) problems.push(`output files differ: ${unexpected.slice(0, 20).join(", ")}`);

const snapshot = snapshotOf(a.build);
const accepted = JSON.stringify(snapshot);
const outText = filesA.filter((file) => /\.(html|xml|json|txt|js|css)$/.test(file)).map((file) => readFileSync(path.join(a.out, file), "utf8")).join("\n");
for (const sentinel of ["SENTINEL-", "sentinel-account@example.test", "parity-account-password", '"root":', "blockType", "/api/media/file/", "/api/byline/", origin, TOKEN, process.env.BYLINE_MEDIA_LOCAL_DIR ?? "\u0000", process.env.BYLINE_PUBLICATION_MEDIA_DIR ?? "\u0000"]) if (outText.includes(sentinel) || accepted.includes(sentinel)) problems.push(`artifact or static output contains ${sentinel === TOKEN ? "the build token" : sentinel}`);
const deployedRedirects = readFileSync(path.join(a.out, "_redirects"), "utf8");
for (const from of ["/2026/10/20/news/library-hours", "/2026/10/20/news/library-hours/"]) {
  if (!deployedRedirects.split("\n").includes(`${from} /2026/10/20/news/library-extends-hours/ 301`)) problems.push(`missing historical redirect for ${from}`);
}
if (!deployedRedirects.split("\n").includes("/old-newsroom.html /media-kit/ 301")) problems.push("missing file redirect to code-owned Media Kit");
const lateRoute = "2026/11/07/sports/wildcats-win-opener/index.html";
if (!filesA.includes(`_byline/live/${ids.late}.json`) || !outText.includes("The Wildcats win after a late comeback.")) problems.push("missing the published live update or static live feed");
if (!filesA.includes("about-the-newsroom/contact-our-newsroom/index.html")) problems.push("missing the nested Page route");
if (!filesA.includes(lateRoute)) problems.push(`missing the late-evening story at its Eastern date (${lateRoute})`);
const structuredRoute = "2026/10/14/news/board-approves-lunch-budget/index.html";
if (!filesA.includes(structuredRoute)) problems.push("missing the structured story route");
const structuredHtml = filesA.includes(structuredRoute) ? readFileSync(path.join(a.out, structuredRoute), "utf8") : "";
for (const type of ARTICLE_BLOCK_TYPES) {
  if (!structuredHtml.includes(`byline-block-${type}`)) problems.push(`missing rendered ${type} block`);
}
for (const fact of ["byline-footnote-ref", "fnref-fn-timing", "fnref-fn-survey", "fnref-fn-budget", "byline-footnotes", "byline-footnote-back",
  "Library extends its hours", "Should the school open another lunch window?", "Yes, open a window", "fixture-lunch-line",
  "The board meets on Tuesday.", "Jordan Lee", "Ada Reporter", "Gus Guest", "Olive Once", "An earlier version misstated the vote count.",
  "https://weeklywildcat.com/2026/10/14/news/board-approves-lunch-budget/", "newsarticle-json-ld"]) {
  if (!structuredHtml.includes(fact)) problems.push(`missing rendered fact: ${fact}`);
}
if (!/<img[^>]+src[Ss]et="[^"]*\/_byline\/media\/images\/[^"]*\d+w,/.test(structuredHtml)) problems.push("missing prepared responsive image candidates");
const torture = snapshot.datasets.stories.find((entry: { id: number }) => entry.id === ids.structured);
if (snapshot.schemaVersion !== 2 || torture?.body?.format !== "byline-v1") problems.push("accepted snapshot lacks the native structured Story");
if (snapshot.datasets.polls[0]?.results?.totalVotes !== 6) problems.push("closed Poll public aggregate is missing");
const images = [...structuredHtml.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
if (!images.length || images.some((src) => !src.startsWith("/_byline/media/") && !src.startsWith("https://weeklywildcat.com/_byline/media/") && !src.startsWith("/brand/") && !src.includes("/_byline/media/"))) problems.push(`story images are not all prepared media: ${images.slice(0, 5).join(", ")}`);
const media = filesA.filter((file) => file.startsWith("_byline/media/"));
const totalMediaBytes = media.reduce((sum, file) => sum + statSync(path.join(a.out, file)).size, 0);

async function verifyInteractive() {
  const staticServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const relative = url.pathname.replace(/^\//, "");
    const file = path.resolve(a.out, url.pathname.endsWith("/") ? `${relative}index.html` : relative);
    if (!file.startsWith(a.out + path.sep) || !existsSync(file) || !statSync(file).isFile()) return response.writeHead(404).end();
    const type: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
    response.setHeader("Content-Type", type[path.extname(file)] ?? "application/octet-stream");
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => staticServer.listen(0, "127.0.0.1", resolve));
  const site = `http://127.0.0.1:${(staticServer.address() as AddressInfo).port}`;
  const browser = await chromium.launch({ ...(process.env.BYLINE_PARITY_CHROME_CHANNEL ? { channel: process.env.BYLINE_PARITY_CHROME_CHANNEL } : {}) });
  try {
    const off = await browser.newPage({ javaScriptEnabled: false });
    await off.route("**/*", (route) => route.request().url().startsWith(site) ? route.continue() : route.abort());
    await off.goto(`${site}/${structuredRoute.replace(/index\.html$/, "")}`, { waitUntil: "domcontentloaded" });
    if (await off.locator("[data-fixture-interactive] table").count() !== 1 || await off.getByRole("slider").count()) throw new Error("interactive fallback is missing without JavaScript");
    await off.close();

    const page = await browser.newPage();
    await page.route("**/*", (route) => route.request().url().startsWith(site) ? route.continue() : route.abort());
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${site}/${lateRoute.replace(/index\.html$/, "")}`, { waitUntil: "networkidle" });
    const fixtureChunk = filesA.find((file) => file.endsWith(".js") && readFileSync(path.join(a.out, file), "utf8").includes("Minutes per lunch period"));
    if (!fixtureChunk) throw new Error("fixture interactive client chunk is missing");
    const interactiveRequest = (url: string) => url.endsWith(`/${fixtureChunk}`) || /repository-interactive-client/.test(url);
    if (requests.some(interactiveRequest)) throw new Error("story without an interactive requested interactive code");
    requests.length = 0;
    await page.goto(`${site}/${structuredRoute.replace(/index\.html$/, "")}`, { waitUntil: "domcontentloaded" });
    const slider = page.getByRole("slider", { name: /Minutes per lunch period/ });
    await slider.waitFor();
    await slider.focus();
    await slider.press("End");
    if (await page.locator('[data-wait="second"]').textContent() !== "10" || !requests.some((url) => url.endsWith(`/${fixtureChunk}`))) throw new Error("repository interactive did not load and enhance the fallback");
  } finally {
    await browser.close();
    staticServer.close();
  }
}

if (problems.length === 0) {
  try {
    await verifyInteractive();
  } catch (error) {
    problems.push(String(error));
  }
}

writeFileSync(path.join(outputRoot, "parity-report.json"), JSON.stringify({ revision: prepared.revision, ids, routes: filesA.filter((file) => file.endsWith(".html")).length, outputFiles: filesA.length, preparedMediaFiles: media.length, preparedMediaBytes: totalMediaBytes, differingFiles: differing, requests: { prepared: a.requests.filter((line) => !line.includes("/media/")), direct: b.requests.filter((line) => !line.includes("/media/")) }, datasets: Object.fromEntries(Object.entries(snapshot.counts)), problems }, null, 2));
await payload.destroy();
if (problems.length) {
  console.error(`[parity] FAILED:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
log(`PASSED: ${filesA.length} output files compared (${media.length} prepared media files, ${(totalMediaBytes / 1024 / 1024).toFixed(1)} MB), ${differing.length} build-identity report(s) differ by design. Report: ${path.join(outputRoot, "parity-report.json")}`);
process.exit(0);
