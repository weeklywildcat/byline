/**
 * Phase 7 acceptance gate: completed-snapshot builds and direct-source
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
import type { ArticleBody, ArticleBodyNode } from "@byline/article-body";
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

const payload = await getPayload({ config });
const log = (message: string) => console.log(`[parity] ${message}`);

/* ------------------------------------------------------------ seed */
async function upload(file: string, alt: string, credit: string) {
  const data = readFileSync(path.join(repo, "tests/fixtures/story-media", file));
  const mimetype = file.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
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
  await payload.jobs.run({ queue: "media", limit: 50 });
  const ada = (await payload.create({ collection: "people", data: { name: "Ada Reporter", slug: "ada-reporter", status: "active", newsroomRole: "Staff Writer", shortBio: "Ada covers the district.", bio: "Ada covers the district for the Weekly Wildcat.", portrait, publicEmail: "ada@weeklywildcat.com", socials: [{ label: "Instagram", url: "https://instagram.com/ada" }] } })).id;
  const ben = (await payload.create({ collection: "people", data: { name: "Ben Writer", slug: "ben-writer", status: "active", newsroomRole: "Sports Editor" } })).id;
  const gus = (await payload.create({ collection: "people", data: { name: "Gus Guest", slug: "gus-guest", status: "guest", hasProfilePage: true, bio: "Gus writes columns." } })).id;
  const olive = (await payload.create({ collection: "people", data: { name: "Olive Once", slug: "olive-once", status: "guest", hasProfilePage: false } })).id;

  const remap = (id: unknown) => (id === 201 ? pdf : Number(id) % 2 === 1 ? meeting : laughing);
  const nodes = FIXTURE_ARTICLE_BODY.nodes.map((node): ArticleBodyNode => {
    if (node.type === "photo" || node.type === "document") return { ...node, media: remap(node.media) };
    if (node.type === "gallery") return { ...node, items: node.items.map((item) => ({ ...item, media: remap(item.media) })) };
    return node;
  });
  const story = async (data: Record<string, unknown>, publishedAt: string) => {
    const created = await payload.create({ collection: "stories", data, draft: true });
    await payload.update({ collection: "stories", id: created.id, data: { _status: "published" } });
    const db = await drizzleFor(payload);
    await db.execute(sql`update stories set published_at = ${publishedAt}, updated_at = ${publishedAt} where id = ${created.id}`);
    return created.id as number;
  };
  const structured = await story({ headline: "Board approves a leaner lunch budget", slug: "board-approves-lunch-budget", deck: "The vote ends a month of debate.", section: news, topics: [budget], contributors: [ada, gus], featuredMedia: meeting, featuredCaption: "The board meets on Tuesday.", body: lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes, media: {} } as ArticleBody), reportingNote: "We attended the meeting." }, "2026-10-14T14:05:00.000Z");
  // 11:30 p.m. Eastern: the next day in UTC; the URL keeps the Eastern date.
  const late = await story({ headline: "Wildcats win the opener late", slug: "wildcats-win-opener", deck: "A fourth-quarter comeback.", section: sports, topics: [football], contributors: [ben, olive], featuredMedia: laughing, body: lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes: FIXTURE_ARTICLE_BODY.nodes.filter((node) => node.type === "paragraph").slice(0, 3), media: {} } as ArticleBody) }, "2026-11-08T04:30:00.000Z");
  const plain = await story({ headline: "Library extends its hours", slug: "library-extends-hours", section: news, contributors: [ada], body: lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes: FIXTURE_ARTICLE_BODY.nodes.filter((node) => node.type === "paragraph").slice(0, 2), media: {} } as ArticleBody) }, "2026-10-20T15:00:00.000Z");
  await payload.create({ collection: "stories", data: { headline: "SENTINEL-UNPUBLISHED-STORY", section: news }, draft: true });
  await payload.update({ collection: "stories", id: plain, data: { headline: "SENTINEL-NEWER-DRAFT" }, draft: true });
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: structured } }, limit: 1, depth: 0, overrideAccess: true })).docs[0];
  await payload.update({ collection: "story-plans", id: plan.id, data: { brief: "SENTINEL-PRIVATE-BRIEF" }, overrideAccess: true, context: { bylineSystem: true } });
  await payload.create({ collection: "sources", data: { story: structured, label: "Board member", notes: "SENTINEL-SOURCE-NOTES" }, overrideAccess: true, context: { bylineSystem: true } });
  await payload.create({ collection: "corrections", data: { story: structured, type: "correction", text: "An earlier version misstated the vote count.", date: "2026-10-15T13:00:00.000Z" } });
  await payload.create({ collection: "collections", data: { name: "Budget season", brief: "SENTINEL-COLLECTION-BRIEF", stories: [structured, plain], publicPresentation: { enabled: true, format: "series", title: "Budget season", slug: "budget-season", description: "How the district paid for lunch.", overview: "Our reporting on the budget.\n\nIt continues.", artwork: meeting, storyOrder: [plain, structured] } }, context: { bylineSystem: true } });
  await payload.create({ collection: "pages", data: { title: "About the newsroom", slug: "about-the-newsroom", summary: "Who we are.", body: { root: { type: "root", version: 1, children: [{ type: "heading", tag: "h2", version: 1, children: [{ type: "text", text: "Our mission", format: 0, version: 1 }] }, { type: "paragraph", version: 1, children: [{ type: "text", text: "We are student journalists.", format: 0, version: 1 }] }] } }, _status: "published" } });
  await payload.create({ collection: "events", data: { title: "Homecoming", slug: "homecoming", eventType: "game", startAt: "2027-10-30T23:00:00.000Z", endAt: "2027-10-31T01:30:00.000Z", location: "Wildcat Stadium", eventStatus: "scheduled", _status: "published" } });
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
Object.assign(env, { BYLINE_NEWSROOM_BUILD_URL: `${origin}/api/byline/build`, BYLINE_BUILD_TOKEN: TOKEN, BYLINE_NEWSROOM_URL: origin, BYLINE_LEGACY_REST_BUILD: "0" });
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
const withoutBuildClock = (file: string) => JSON.stringify(JSON.parse(readFileSync(file, "utf8"), (key, value) => (key === "generatedAt" ? undefined : value)));
const unexpected = differing.filter((file) => !volatile.has(file) && !(file.endsWith(".json") && withoutBuildClock(path.join(a.out, file)) === withoutBuildClock(path.join(b.out, file))));
if (unexpected.length) problems.push(`output files differ: ${unexpected.slice(0, 20).join(", ")}`);

const snapshot = snapshotOf(a.build);
const outText = filesA.filter((file) => /\.(html|xml|json|txt|js|css)$/.test(file)).map((file) => readFileSync(path.join(a.out, file), "utf8")).join("\n");
for (const sentinel of ["SENTINEL-", "/api/media/file/", "/api/byline/", TOKEN, process.env.BYLINE_MEDIA_LOCAL_DIR ?? "\u0000", process.env.BYLINE_PUBLICATION_MEDIA_DIR ?? "\u0000"]) if (outText.includes(sentinel)) problems.push(`static output contains ${sentinel === TOKEN ? "the build token" : sentinel}`);
const lateRoute = "2026/11/07/sports/wildcats-win-opener/index.html";
if (!filesA.includes(lateRoute)) problems.push(`missing the late-evening story at its Eastern date (${lateRoute})`);
const structuredRoute = "2026/10/14/news/board-approves-lunch-budget/index.html";
if (!filesA.includes(structuredRoute)) problems.push("missing the structured story route");
const structuredHtml = filesA.includes(structuredRoute) ? readFileSync(path.join(a.out, structuredRoute), "utf8") : "";
const images = [...structuredHtml.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
if (!images.length || images.some((src) => !src.startsWith("/_byline/media/") && !src.startsWith("https://weeklywildcat.com/_byline/media/") && !src.startsWith("/brand/") && !src.includes("/_byline/media/"))) problems.push(`story images are not all prepared media: ${images.slice(0, 5).join(", ")}`);
const media = filesA.filter((file) => file.startsWith("_byline/media/"));
const totalMediaBytes = media.reduce((sum, file) => sum + statSync(path.join(a.out, file)).size, 0);

writeFileSync(path.join(outputRoot, "parity-report.json"), JSON.stringify({ revision: prepared.revision, ids, routes: filesA.filter((file) => file.endsWith(".html")).length, outputFiles: filesA.length, preparedMediaFiles: media.length, preparedMediaBytes: totalMediaBytes, differingFiles: differing, requests: { prepared: a.requests.filter((line) => !line.includes("/media/")), direct: b.requests.filter((line) => !line.includes("/media/")) }, datasets: Object.fromEntries(Object.entries(snapshot.counts)), problems }, null, 2));
await payload.destroy();
if (problems.length) {
  console.error(`[parity] FAILED:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
log(`PASSED: ${filesA.length} identical output files (${media.length} prepared media files, ${(totalMediaBytes / 1024 / 1024).toFixed(1)} MB), ${differing.length} build-identity report(s) differ by design. Report: ${path.join(outputRoot, "parity-report.json")}`);
process.exit(0);
