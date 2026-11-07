import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ARTICLE_BLOCK_TYPES, type ArticleBody, type ArticleBodyNode } from "@byline/article-body";
import { FIXTURE_FIRST_PHASE_BODY as FIXTURE_ARTICLE_BODY } from "@byline/article-body/fixtures";
import { validatePublicationMediaManifest, largestNaturalImage, publicationManifestBlobs, validatePublicBuildSnapshotV2, type PublicBuildSnapshotV2 } from "@byline/content";
import { commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lexicalFromArticleBody } from "../../../../packages/editor/tests/lexical-fixture";
import { readCurrentRevision, readPublicationState } from "../../src/db/publication-state";
import { drizzleFor } from "../../src/publication-media/state";
import { serveBuildMedia } from "../../src/publication-media/build-endpoint";
import { PREPARE_PUBLIC_SNAPSHOT_TASK } from "../../src/public/queue";
import { collectPublicSnapshot } from "../../src/public/snapshot/collect";
import { serveDirectSnapshot, serveSnapshotArtifact, serveSnapshotDiscovery } from "../../src/public/snapshot/endpoints";
import { runPublicSnapshotPreparation } from "../../src/public/snapshot/prepare";
import { PUBLIC_SNAPSHOT_PRODUCER_VERSION } from "../../src/public/snapshot/version";
import { sql } from "@payloadcms/db-postgres";

/**
 * Phase 7 against real PostgreSQL, Payload's real Jobs Queue, Sharp and the
 * Phase 5 store: public-revision rules, transactional guarantees, coalescing,
 * scheduled publish, the snapshot revision fence and promotion, privacy,
 * draft isolation, prepared media, the structured-body bridge, publication
 * dates, events and the build-only API (served over HTTP to the static
 * build's own acquisition client).
 */
let payload: Payload;
const ids: Record<string, number> = {};
// The static build's own acquisition client (apps/web), loaded at run time: its module graph
// uses the web app's path aliases, which this package's typecheck does not resolve.
type Acquired = { mode: string; revision: number; digest: string; requests: number; attempts: number; snapshot: PublicBuildSnapshotV2 };
const webAcquisition = pathToFileURL(path.resolve(__dirname, "../../../web/lib/build-acquisition.ts")).href;
const acquirePayloadSnapshot = async (options: { baseUrl: string; token: string; maxAttempts?: number }): Promise<Acquired> =>
  ((await import(/* @vite-ignore */ webAcquisition)) as { acquirePayloadSnapshot: (options: unknown) => Promise<Acquired> }).acquirePayloadSnapshot(options);
const TOKEN = "public-snapshot-test-build-token-0123456789abcdef";

const rev = () => readCurrentRevision(payload);
const snapshotJobs = async () =>
  (await payload.find({ collection: "payload-jobs", where: { and: [{ taskSlug: { equals: PREPARE_PUBLIC_SNAPSHOT_TASK } }, { completedAt: { exists: false } }] }, depth: 0, pagination: false, overrideAccess: true })).docs;
const clearJobs = async () => {
  const db = await drizzleFor(payload);
  await db.execute(sql`delete from payload_jobs where task_slug = 'prepare-public-snapshot'`);
};

async function image(name: string, width: number, height: number) {
  const data = await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg({ quality: 85 }).toBuffer();
  return { data, mimetype: "image/jpeg", name, size: data.length };
}
function pdf() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const data = Buffer.from(body, "latin1");
  return { data, mimetype: "application/pdf", name: "snapshot-board-minutes.pdf", size: data.length };
}
async function upload(file: { data: Buffer; mimetype: string; name: string; size: number }) {
  const created = await payload.create({ collection: "media", data: { alt: "A described photograph", credit: "The Weekly Wildcat", copyright: "© 2026 The Weekly Wildcat" }, file, overrideAccess: true });
  return created.id as number;
}
/** The smaller fixture isolates projection, Media and revision assertions. */
const FIRST_PHASE_TYPES = ["photo", "gallery", "reportedQuote", "pullQuote", "keyFacts", "context", "document", "timeline"];
const runMedia = () => payload.jobs.run({ queue: "media", limit: 50 });

/** A FIXTURE_ARTICLE_BODY (every registered block) on real Media. */
function storyBody(): { root: Record<string, unknown> } {
  const remap = (id: unknown) => (id === 201 ? ids.pdf : Number(id) % 2 === 1 ? ids.photo : ids.photo2);
  const nodes = FIXTURE_ARTICLE_BODY.nodes.map((node): ArticleBodyNode => {
    if (node.type === "photo") return { ...node, media: remap(node.media) };
    if (node.type === "gallery") return { ...node, items: node.items.map((item) => ({ ...item, media: remap(item.media) })) };
    if (node.type === "document") return { ...node, media: remap(node.media) };
    return node;
  });
  return lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes, media: {} } as ArticleBody);
}

async function draftStory(headline: string, extra: Record<string, unknown> = {}) {
  return (await payload.create({ collection: "stories", data: { headline, section: ids.news, contributors: [ids.author], ...extra }, draft: true })).id as number;
}
const publish = (id: number, data: Record<string, unknown> = {}, req?: PayloadRequest) => payload.update({ collection: "stories", id, data: { ...data, _status: "published" }, ...(req ? { req } : {}) });
const snapshot = async () => collectPublicSnapshot(payload, { revision: await rev() });

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_snapshot`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  ids.news = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" } })).id;
  ids.internal = (await payload.create({ collection: "sections", data: { name: "Staff memos", slug: "staff-memos", hidden: true } })).id;
  ids.topic = (await payload.create({ collection: "topics", data: { name: "Budget", slug: "budget" } })).id;
  ids.unusedTopic = (await payload.create({ collection: "topics", data: { name: "Unused", slug: "unused" } })).id;
  ids.photo = await upload(await image("snapshot-lead.jpg", 3000, 2000));
  ids.photo2 = await upload(await image("snapshot-second.jpg", 1600, 1200));
  ids.portrait = await upload(await image("snapshot-portrait.jpg", 900, 900));
  ids.unreferenced = await upload(await image("snapshot-unreferenced.jpg", 800, 600));
  ids.pdf = await upload(pdf());
  await runMedia();
  ids.author = (await payload.create({ collection: "people", data: { name: "Ada Reporter", slug: "ada-reporter", status: "active", newsroomRole: "Staff Writer", shortBio: "Ada covers the district.", portrait: ids.portrait, publicEmail: "ada@weeklywildcat.com", socials: [{ label: "Instagram", url: "https://instagram.com/ada" }] } })).id;
  ids.guest = (await payload.create({ collection: "people", data: { name: "Gus Guest", slug: "gus-guest", status: "guest", hasProfilePage: true, bio: "Gus writes columns." } })).id;
  ids.oneOff = (await payload.create({ collection: "people", data: { name: "Olive Once", slug: "olive-once", status: "guest", hasProfilePage: false } })).id;
  ids.editor = (await payload.create({ collection: "users", data: { email: "snapshot-editor@example.test", password: "pw-editor-123456", name: "Editor", role: "editor", enabled: true, googleSubject: "SENTINEL-GOOGLE-SUBJECT" } })).id;
});

afterAll(async () => {
  await payload?.destroy();
});

beforeEach(async () => {
  await clearJobs();
});

describe("public revision", () => {
  it("advances only for public changes to Stories, in the same transaction as its snapshot job", async () => {
    const start = await rev();
    const id = await draftStory("Board weighs budget");
    expect(await rev()).toBe(start);
    await payload.update({ collection: "stories", id, data: { headline: "Board weighs budget (autosave)" }, draft: true, autosave: true });
    expect(await rev()).toBe(start);
    await payload.update({ collection: "stories", id, data: { headline: "Board weighs the budget" }, draft: true });
    expect(await rev()).toBe(start);
    expect(await snapshotJobs()).toHaveLength(0);

    await publish(id);
    expect(await rev()).toBe(start + 1);
    expect(await snapshotJobs()).toHaveLength(1);

    await payload.update({ collection: "stories", id, data: { deck: "The vote is Tuesday." } });
    expect(await rev()).toBe(start + 2);

    // A newer unpublished rewrite stays private.
    await payload.update({ collection: "stories", id, data: { headline: "Rewritten headline" }, draft: true });
    await payload.update({ collection: "stories", id, data: { headline: "Rewritten headline (autosave)" }, draft: true, autosave: true });
    expect(await rev()).toBe(start + 2);

    await publish(id);
    expect(await rev()).toBe(start + 3);

    await payload.update({ collection: "stories", id, data: { _status: "draft" } });
    expect(await rev()).toBe(start + 4);

    // Deleting a Story is Payload's trash (the Story collection has trash enabled).
    await publish(id);
    await payload.update({ collection: "stories", id, data: { deletedAt: new Date().toISOString() } });
    expect(await rev()).toBe(start + 6);
    // Restoring a published story from the trash is public again.
    await payload.update({ collection: "stories", id, data: { deletedAt: null }, trash: true });
    expect(await rev()).toBe(start + 7);

    const draftOnly = await draftStory("Never published");
    await payload.update({ collection: "stories", id: draftOnly, data: { deletedAt: new Date().toISOString() }, draft: true });
    expect(await rev()).toBe(start + 7);
  });

  it("advances when a published record is permanently deleted, not a draft", async () => {
    const page = await payload.create({ collection: "pages", data: { title: "Delete me", slug: "delete-me", _status: "published" } });
    const before = await rev();
    await payload.delete({ collection: "pages", id: page.id });
    expect(await rev()).toBe(before + 1);
    const draft = await payload.create({ collection: "pages", data: { title: "Draft page", slug: "draft-delete" }, draft: true });
    await payload.delete({ collection: "pages", id: draft.id });
    expect(await rev()).toBe(before + 1);
  });

  it("rolls the change back when the snapshot job cannot be queued", async () => {
    const id = await draftStory("Queue failure");
    const before = await rev();
    const jobs = payload.jobs as unknown as { queue: (...args: unknown[]) => Promise<unknown> };
    const original = jobs.queue;
    jobs.queue = async (...args: unknown[]) => {
      const input = args[0] as { task?: string };
      if (input.task === PREPARE_PUBLIC_SNAPSHOT_TASK) throw new Error("queue unavailable");
      return original.apply(payload.jobs, args);
    };
    try {
      await expect(publish(id)).rejects.toThrow();
    } finally {
      jobs.queue = original;
    }
    expect(await rev()).toBe(before);
    const main = await payload.findByID({ collection: "stories", id, depth: 0 });
    expect(main._status).toBe("draft");
    expect(await snapshotJobs()).toHaveLength(0);
  });

  it("rolls the revision and job back when the public write itself fails afterwards", async () => {
    const id = await draftStory("Write failure");
    const before = await rev();
    const hooks = payload.collections.stories.config.hooks.afterChange;
    const failing = ({ req }: { req: PayloadRequest }) => {
      if (req.context?.failAfterPublicMutation) throw new Error("late failure");
    };
    hooks.push(failing as never);
    try {
      await expect(payload.update({ collection: "stories", id, data: { _status: "published" }, context: { failAfterPublicMutation: true } })).rejects.toThrow("late failure");
    } finally {
      hooks.splice(hooks.indexOf(failing as never), 1);
    }
    expect(await rev()).toBe(before);
    expect(await snapshotJobs()).toHaveLength(0);
    expect((await payload.findByID({ collection: "stories", id, depth: 0 }))._status).toBe("draft");
  });

  it("coalesces public hooks in one transaction and never across requests", async () => {
    const [a, b] = [await draftStory("Coalesce A"), await draftStory("Coalesce B")];
    const before = await rev();
    const req = await createLocalReq({}, payload);
    await initTransaction(req);
    try {
      await publish(a, {}, req);
      await publish(b, {}, req);
      await commitTransaction(req);
    } catch (error) {
      await killTransaction(req);
      throw error;
    }
    expect(await rev()).toBe(before + 1);
    const [c, d] = [await draftStory("Separate C"), await draftStory("Separate D")];
    await publish(c);
    await publish(d);
    expect(await rev()).toBe(before + 3);
  });

  it("advances for Payload's real scheduled publish", async () => {
    const id = await draftStory("Scheduled story");
    const before = await rev();
    await payload.jobs.queue({ task: "schedulePublish", input: { type: "publish", doc: { relationTo: "stories", value: String(id) } }, waitUntil: new Date(Date.now() - 1000) } as never);
    await payload.jobs.run({ queue: "default", limit: 10 });
    expect((await payload.findByID({ collection: "stories", id, depth: 0 }))._status).toBe("published");
    expect(await rev()).toBe(before + 1);
    expect((await snapshotJobs()).length).toBeGreaterThanOrEqual(1);
  });

  it("advances for public People, taxonomy, Collection and correction changes but not their private parts", async () => {
    const story = await draftStory("Collection member");
    await publish(story);
    let before = await rev();
    await payload.update({ collection: "people", id: ids.oneOff, data: { shortBio: "Olive wrote once." } });
    expect(await rev()).toBe(before + 1);
    before = await rev();
    await payload.update({ collection: "sections", id: ids.news, data: { description: "News from the school." } });
    await payload.update({ collection: "topics", id: ids.topic, data: { description: "Money matters." } });
    expect(await rev()).toBe(before + 2);

    before = await rev();
    const collection = await payload.create({ collection: "collections", data: { name: "Budget season", brief: "SENTINEL-COLLECTION-BRIEF", stories: [story] } as never, context: { bylineSystem: true } });
    expect(await rev()).toBe(before);
    await payload.update({ collection: "collections", id: collection.id, data: { publicPresentation: { enabled: true, title: "Budget season", slug: "budget-season" } }, context: { bylineSystem: true } });
    expect(await rev()).toBe(before + 1);
    await payload.update({ collection: "collections", id: collection.id, data: { brief: "SENTINEL-COLLECTION-BRIEF updated" }, context: { bylineSystem: true } });
    expect(await rev()).toBe(before + 1);
    ids.collection = collection.id;

    before = await rev();
    await payload.create({ collection: "corrections", data: { story, type: "correction", text: "An earlier version misstated the date.", date: new Date().toISOString() } });
    expect(await rev()).toBe(before + 1);
    const unpublished = await draftStory("Unpublished with correction");
    await payload.create({ collection: "corrections", data: { story: unpublished, type: "clarification", text: "Not public.", date: new Date().toISOString() } });
    expect(await rev()).toBe(before + 1);

    // Private newsroom records never move it (nor queue snapshot work).
    await clearJobs();
    before = await rev();
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: story } }, depth: 0, limit: 1, overrideAccess: true })).docs[0];
    await payload.update({ collection: "story-plans", id: plan.id, data: { brief: "SENTINEL-STORY-BRIEF" }, overrideAccess: true, context: { bylineSystem: true } });
    await payload.create({ collection: "sources", data: { story, label: "A source", notes: "SENTINEL-SOURCE-NOTES" }, overrideAccess: true, context: { bylineSystem: true } });
    await payload.create({ collection: "tasks", data: { story, title: "SENTINEL-TASK-TITLE" }, overrideAccess: true, context: { bylineSystem: true } });
    await payload.create({ collection: "appointments", data: { story, title: "Interview", notes: "SENTINEL-APPOINTMENT-NOTES" } as never, overrideAccess: true, context: { bylineSystem: true } });
    await payload.create({ collection: "production-assignments", data: { story, type: "photo", title: "Portrait", notes: "SENTINEL-PRODUCTION-NOTES" } as never, overrideAccess: true, context: { bylineSystem: true } });
    await payload.create({ collection: "collection-interviews", data: { collection: ids.collection, interviewee: "A principal", privateContact: "SENTINEL-INTERVIEW-CONTACT 555-0100" } as never, overrideAccess: true, context: { bylineSystem: true } });
    await payload.create({ collection: "collection-resources", data: { label: "SENTINEL-RESOURCE", url: "https://drive.example/sentinel-resource", collections: [ids.collection] } as never, overrideAccess: true, context: { bylineSystem: true } });
    await payload.update({ collection: "media", id: ids.unreferenced, data: { folder: null } });
    expect(await rev()).toBe(before);
    expect(await snapshotJobs()).toHaveLength(0);
  });

  it("advances for public Poll definitions and queues their future windows", async () => {
    const start = await rev();
    const opensAt = new Date(Date.now() + 60_000).toISOString();
    const closesAt = new Date(Date.now() + 120_000).toISOString();
    const poll = await payload.create({ collection: "polls", data: { pollKey: "snapshot-test-window", question: "Open more windows?", status: "draft",
      options: [{ optionId: "yes", label: "Yes" }, { optionId: "no", label: "No" }], opensAt, closesAt } });
    expect(await rev()).toBe(start);
    await payload.update({ collection: "polls", id: poll.id, data: { status: "open" } });
    expect(await rev()).toBe(start + 1);
    const jobs = await payload.find({ collection: "payload-jobs", where: { taskSlug: { equals: "advance-public-revision" } }, depth: 0, pagination: false });
    expect(jobs.docs.map(({ waitUntil }) => waitUntil)).toEqual(expect.arrayContaining([opensAt, closesAt]));
    await payload.delete({ collection: "polls", id: poll.id });
    expect(await rev()).toBe(start + 2);
  });

  it("advances for public Media fields only, never for an upload or preparation", async () => {
    const before = await rev();
    await upload(await image("snapshot-new-upload.jpg", 640, 480));
    await runMedia();
    expect(await rev()).toBe(before);
    await payload.update({ collection: "media", id: ids.unreferenced, data: { alt: "A new description" } });
    expect(await rev()).toBe(before + 1);
  });
});

describe("snapshot preparation", () => {
  it("promotes only the revision it collected, and refuses stale work", async () => {
    let result = await runPublicSnapshotPreparation(payload);
    expect(result.outcome).toBe("ready");
    const first = await readPublicationState(payload);
    expect(first.completed?.revision).toBe(first.currentRevision);
    expect((await runPublicSnapshotPreparation(payload)).outcome).toBe("reused");

    // Generator reads R, another transaction publishes R+1 while it collects.
    await publish(await draftStory("Before the race"));
    const racer = await draftStory("Racer");
    result = await runPublicSnapshotPreparation(payload, { hooks: { afterRead: async () => { await publish(racer); } } });
    expect(result).toMatchObject({ outcome: "stale" });
    const afterRace = await readPublicationState(payload);
    expect(afterRace.currentRevision).toBe(first.currentRevision + 2);
    expect(afterRace.completed?.revision).toBe(first.currentRevision);
    expect((await snapshotJobs()).length).toBe(1);
    expect((await runPublicSnapshotPreparation(payload)).outcome).toBe("ready");
    expect((await readPublicationState(payload)).completed?.revision).toBe(afterRace.currentRevision);
  });

  it("never lets an older running job overwrite a newer pointer", async () => {
    const story = await draftStory("Overtaker");
    const result = await runPublicSnapshotPreparation(payload, {
      hooks: {
        beforePromote: async () => {
          await publish(story);
          expect((await runPublicSnapshotPreparation(payload)).outcome).toBe("ready");
        }
      }
    });
    // Nothing to prepare at first means "reused"; force a fresh run if so.
    if (result.outcome === "reused") return;
    expect(result).toMatchObject({ outcome: "stale", code: "promotion-lost" });
    const state = await readPublicationState(payload);
    expect(state.completed?.revision).toBe(state.currentRevision);
  });

  it("supersedes older pending snapshot jobs", async () => {
    await publish(await draftStory("Pending one"));
    await publish(await draftStory("Pending two"));
    expect(await snapshotJobs()).toHaveLength(1);
    const job = (await snapshotJobs())[0] as unknown as { concurrencyKey: string; queue: string };
    expect(job).toMatchObject({ concurrencyKey: "public-snapshot", queue: "publication" });
  });

  it("prepares a new artifact for a new producer version at the same content revision", async () => {
    await runPublicSnapshotPreparation(payload);
    const state = await readPublicationState(payload);
    const db = await drizzleFor(payload);
    await db.execute(sql`update byline_publication_state set completed_producer_version = ${PUBLIC_SNAPSHOT_PRODUCER_VERSION - 1} where id = 1`);
    const result = await runPublicSnapshotPreparation(payload);
    expect(result.outcome).toBe("ready");
    const after = await readPublicationState(payload);
    expect(after.currentRevision).toBe(state.currentRevision);
    expect(after.completed?.producerVersion).toBe(PUBLIC_SNAPSHOT_PRODUCER_VERSION);
  });

  it("runs as the real Jobs Queue task", async () => {
    await publish(await draftStory("Via the queue"));
    await payload.jobs.run({ queue: "publication", limit: 5 });
    const state = await readPublicationState(payload);
    expect(state.completed?.revision).toBe(state.currentRevision);
  });
});

describe("the projection", () => {
  let snap: PublicBuildSnapshotV2;
  let structuredId: number;
  let lateId: number;

  beforeAll(async () => {
    structuredId = await draftStory("Every block", { featuredMedia: ids.photo, featuredCaption: "The board meets.", topics: [ids.topic], contributors: [ids.guest, ids.author, ids.oneOff], body: storyBody(), presentation: "immersive" });
    await publish(structuredId);
    await payload.update({ collection: "stories", id: structuredId, data: { headline: "SENTINEL-NEWER-DRAFT", body: lexicalFromArticleBody({ ...FIXTURE_ARTICLE_BODY, nodes: [{ type: "paragraph", children: [{ type: "text", text: "SENTINEL-DRAFT-BODY" }] }], media: {} }) }, draft: true });
    lateId = await draftStory("Late game", { slug: "late-game" });
    await publish(lateId);
    // 11:30 p.m. Eastern, already the next day in UTC.
    const db = await drizzleFor(payload);
    await db.execute(sql`update stories set published_at = '2026-11-08T04:30:00Z' where id = ${lateId}`);
    await publish(await draftStory("Internal memo", { section: ids.internal }));
    const page = await payload.create({ collection: "pages", data: { title: "About us", slug: "about-us", summary: "Who we are.", body: { root: { type: "root", version: 1, direction: null, format: "", indent: 0, children: [{ type: "paragraph", version: 1, children: [{ type: "text", version: 1, text: "We are student journalists.", format: 0 }] }] } }, _status: "published" } });
    await payload.update({ collection: "pages", id: page.id, data: { title: "SENTINEL-PAGE-DRAFT" }, draft: true });
    await payload.create({ collection: "pages", data: { title: "Unpublished page", slug: "unpublished-page" }, draft: true });
    // Events either side of the November DST change.
    await payload.create({ collection: "events", data: { title: "Homecoming", slug: "homecoming", eventType: "game", startAt: "2026-10-31T23:00:00Z", endAt: "2026-11-01T01:30:00Z", location: "Stadium", eventStatus: "scheduled", _status: "published" } });
    await payload.create({ collection: "events", data: { title: "Field day", slug: "field-day", startAt: "2026-11-02T14:00:00Z", allDay: true, eventStatus: "canceled", _status: "published" } });
    await payload.create({ collection: "events", data: { title: "SENTINEL-DRAFT-EVENT", slug: "draft-event", startAt: "2026-12-01T14:00:00Z" }, draft: true });
    await payload.create({ collection: "corrections", data: { story: structuredId, type: "editor-note", text: "Updated with the vote.", date: "2026-11-05T15:00:00Z" } });
    await payload.create({ collection: "corrections", data: { story: structuredId, type: "correction", text: "SENTINEL-FUTURE-CORRECTION", date: "2026-11-05T15:00:00Z", publishedAt: new Date(Date.now() + 86_400_000).toISOString() } });
    const beforeGlobal = await rev();
    await payload.updateGlobal({ slug: "publication", data: { identity: { name: "The Weekly Wildcat", shortName: "Weekly Wildcat", description: "Student journalism.", organizationName: "Ninety Six High School", tagline: "Published" }, _status: "published" } as never });
    expect(await rev()).toBe(beforeGlobal + 1);
    await payload.updateGlobal({ slug: "publication", data: { identity: { name: "SENTINEL-GLOBAL-DRAFT", shortName: "x", description: "x", organizationName: "x", tagline: "x" } } as never, draft: true });
    expect(await rev()).toBe(beforeGlobal + 1);
    process.env.BYLINE_BUILD_TOKEN = TOKEN;
    snap = await snapshot();
  });

  afterAll(() => {
    delete process.env.BYLINE_BUILD_TOKEN;
  });

  it("is the published main state only", () => {
    const json = JSON.stringify(snap);
    for (const sentinel of ["SENTINEL-NEWER-DRAFT", "SENTINEL-DRAFT-BODY", "SENTINEL-PAGE-DRAFT", "SENTINEL-DRAFT-EVENT", "SENTINEL-GLOBAL-DRAFT", "SENTINEL-FUTURE-CORRECTION", "Unpublished page", "Internal memo"]) expect(json).not.toContain(sentinel);
    const post = snap.datasets.stories.find((entry) => entry.id === structuredId)!;
    expect(post.title).toBe("Every block");
    expect(snap.publication.identity.name).toBe("The Weekly Wildcat");
    expect(snap.publication.revision).toBe(snap.revision);
    expect(snap.publication.timezone).toBe("America/New_York");
  });

  it("contains no private newsroom data", () => {
    const json = JSON.stringify(snap);
    for (const sentinel of ["SENTINEL-STORY-BRIEF", "SENTINEL-SOURCE-NOTES", "SENTINEL-TASK-TITLE", "SENTINEL-APPOINTMENT-NOTES", "SENTINEL-PRODUCTION-NOTES", "SENTINEL-COLLECTION-BRIEF", "SENTINEL-INTERVIEW-CONTACT", "SENTINEL-RESOURCE", "sentinel-resource", "snapshot-editor@example.test", "SENTINEL-GOOGLE-SUBJECT", TOKEN, "/api/media/file/", process.env.BYLINE_MEDIA_LOCAL_DIR!, process.env.BYLINE_PUBLICATION_MEDIA_DIR!, "-640x", "sourceHash", "uploadedBy", "createdBy", "publicationAssets", "legacySource"]) {
      expect(json, sentinel).not.toContain(sentinel);
    }
    const keys = new Set<string>();
    const visit = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) { keys.add(key); visit(entry); }
    };
    visit(snap.datasets);
    // `socials.email` is the Person's explicit public email; the account email is checked as a value above.
    for (const key of ["brief", "notes", "tasks", "team", "members", "lead", "googleSubject", "linkedPerson", "workflow", "deadline", "plan", "_status", "updatedAt", "createdAt", "library", "thumbnailURL", "folder", "_embedded", "blockType", "root"]) expect(keys.has(key), key).toBe(false);
  });

  it("projects the canonical Story, Person, taxonomy and Correction facts", () => {
    const story = snap.datasets.stories.find((entry) => entry.id === structuredId)!;
    expect(story).toMatchObject({ section: { key: `section-${ids.news}`, href: "/category/news/" }, topicKeys: [`topic-${ids.topic}`],
      image: ids.photo, leadCaption: "The board meets.", presentation: "immersive", format: "standard" });
    expect(story.contributorKeys).toEqual([ids.guest, ids.author, ids.oneOff].map((id) => `person:${id}`));
    expect(story.contributors[2].href).toBe("");
    expect(story.corrections).toEqual([expect.objectContaining({ type: "editor-note", text: "Updated with the vote." })]);
    expect(snap.datasets.corrections.some((entry) => entry.storyId === structuredId && entry.id === story.corrections[0].id)).toBe(true);
    expect(snap.datasets.topics.find((term) => term.id === ids.unusedTopic)?.href).toBe("");
    expect(snap.datasets.sections.some((term) => term.id === ids.internal)).toBe(false);
    expect(snap.datasets.people.find((entry) => entry.id === ids.author)).toMatchObject({ newsroomRole: "Staff Writer",
      publicEmail: "ada@weeklywildcat.com", socials: [{ label: "Instagram", url: "https://instagram.com/ada" }], portrait: ids.portrait });
  });

  it("dates article URLs by the publication's local day", () => {
    const late = snap.datasets.stories.find((entry) => entry.id === lateId)!;
    expect(late.publishedAt).toBe("2026-11-08T04:30:00.000Z");
    expect(late.href).toBe("/2026/11/07/news/late-game/");
    expect(late.url).toBe("https://weeklywildcat.com/2026/11/07/news/late-game/");
  });

  it("carries semantic ArticleBody nodes and a small prepared Media table", () => {
    const { body } = snap.datasets.stories.find((entry) => entry.id === structuredId)!;
    expect(body.format).toBe("byline-v1");
    if (body.format !== "byline-v1") throw new Error("Expected structured content");
    for (const type of FIRST_PHASE_TYPES) expect(body.nodes.some((node) => node.type === type), type).toBe(true);
    expect(Object.values(body.media).length).toBeGreaterThan(0);
    for (const asset of Object.values(body.media)) {
      expect(asset.src).toMatch(/^\/_byline\/media\//);
      expect(asset).not.toHaveProperty("manifest");
    }
  });

  it("names only referenced, prepared media", () => {
    const media = new Map(snap.datasets.media.map((entry) => [entry.id, entry]));
    expect([...media.keys()].sort((a, b) => a - b)).toEqual([ids.photo, ids.photo2, ids.portrait, ids.pdf].sort((a, b) => a - b));
    expect(media.has(ids.unreferenced)).toBe(false);
    const { manifest } = media.get(ids.photo)!;
    expect(validatePublicationMediaManifest(manifest).ok).toBe(true);
    if (manifest.kind !== "image") throw new Error("Expected image manifest");
    expect(largestNaturalImage(manifest).publicPath).toMatch(/^\/_byline\/media\/images\//);
    expect(media.get(ids.pdf)!.manifest.kind).toBe("document");
  });

  it("rejects a malformed record or broken cross-reference before rendering", () => {
    const wrongRoute = structuredClone(snap);
    wrongRoute.datasets.stories[0].href = "/elsewhere/";
    expect(() => validatePublicBuildSnapshotV2(wrongRoute)).toThrow(/canonical route/);
    const missingMedia = structuredClone(snap);
    missingMedia.datasets.media = missingMedia.datasets.media.filter((entry) => entry.id !== ids.photo);
    missingMedia.counts.media--;
    expect(() => validatePublicBuildSnapshotV2(missingMedia)).toThrow(/missing image Media/);
    const privateKey = structuredClone(snap);
    Object.assign(privateKey.datasets.stories[0], { workflow: "private" });
    expect(() => validatePublicBuildSnapshotV2(privateKey)).toThrow(/workflow/);
  });

  it("carries Event instants without preformatted presentation strings", () => {
    const [homecoming, fieldDay] = snap.datasets.events;
    expect(homecoming).toMatchObject({ title: "Homecoming", startAt: "2026-10-31T23:00:00.000Z", endAt: "2026-11-01T01:30:00.000Z", allDay: false, status: "scheduled" });
    expect(fieldDay).toMatchObject({ title: "Field day", startAt: "2026-11-02T14:00:00.000Z", endAt: null, allDay: true, status: "canceled" });
    expect(homecoming).not.toHaveProperty("display");
  });

  it("projects published Pages from their bounded prose", () => {
    expect(snap.datasets.pages).toEqual([expect.objectContaining({ slug: "about-us", href: "/about-us/", title: "About us", bodyHtml: "<p>We are student journalists.</p>", indexing: "public" })]);
  });

  it("projects the public Collection only", () => {
    expect(snap.datasets.collections).toEqual([expect.objectContaining({ slug: "budget-season", title: "Budget season", modifiedAt: expect.any(String) })]);
    expect(Object.keys(snap.datasets.collections[0]).sort()).toEqual(["artwork", "description", "format", "id", "modifiedAt", "overview", "slug", "status", "stories", "title"]);
  });

  it("keeps the public Collection date and revision stable through private edits", async () => {
    const before = await snapshot();
    const publicCollection = before.datasets.collections[0];
    await payload.update({ collection: "collections", id: publicCollection.id, data: { brief: "SENTINEL-PRIVATE-EDIT" }, context: { bylineSystem: true } });
    const after = await snapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.datasets.collections).toEqual(before.datasets.collections);
  });

  it("fails on unsupported story content instead of dropping it", async () => {
    // Payload refuses unknown blocks on save, so this is a stored body from a block type the
    // producer does not know (e.g. one a later release adds): written directly.
    const bad = await draftStory("Odd block");
    await publish(bad);
    const db = await drizzleFor(payload);
    const body = { root: { type: "root", version: 1, children: [{ type: "block", version: 2, fields: { id: "x", blockType: "scrollytelling", blockName: "" } }, { type: "quote", version: 1, children: [] }] } };
    await db.execute(sql`update stories set body = ${JSON.stringify(body)}::jsonb where id = ${bad}`);
    await expect(collectPublicSnapshot(payload, { revision: await rev() })).rejects.toMatchObject({ code: "invalid-projection", message: expect.stringContaining(`Story ${bad}`) });
    await expect(collectPublicSnapshot(payload, { revision: await rev() })).rejects.toMatchObject({ details: expect.arrayContaining([expect.stringContaining("unsupported")]) });
    await payload.update({ collection: "stories", id: bad, data: { _status: "draft" } });
  });

  it("waits for media that is not ready, and a finished preparation re-queues it without a new revision", async () => {
    await payload.update({ collection: "media", id: ids.photo, data: { artDirection: { version: 1, focalPoint: { x: 30, y: 40 }, crops: {} } }, context: { bylineArtDirection: true } });
    const revision = await rev();
    const result = await runPublicSnapshotPreparation(payload);
    expect(result).toMatchObject({ outcome: "not-ready", code: "media-not-ready" });
    expect((result as { details: string[] }).details.join(" ")).toContain(`Media ${ids.photo}`);
    await clearJobs();
    await runMedia();
    expect(await rev()).toBe(revision);
    expect(await snapshotJobs()).toHaveLength(1);
    expect((await runPublicSnapshotPreparation(payload)).outcome).toBe("ready");
    snap = await snapshot();
    const manifest = snap.datasets.media.find((entry) => entry.id === ids.photo)?.manifest;
    expect(manifest).toMatchObject({ focalPoint: { x: 30, y: 40 } });
  });
});

describe("build-only API and the static build's acquisition", () => {
  let server: Server;
  let base: string;
  let directAfterCollect: (() => Promise<void>) | undefined;
  const savedNewsroom = process.env.BYLINE_NEWSROOM_URL;

  beforeAll(async () => {
    process.env.BYLINE_BUILD_TOKEN = TOKEN;
    server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const req = await createLocalReq({}, payload);
      Object.assign(req, { headers: new Headers(Object.entries(request.headers).flatMap(([key, value]): Array<[string, string]> => (typeof value === "string" ? [[key, value]] : []))), url: url.toString(), searchParams: url.searchParams });
      const match = /^\/api\/byline\/build\/(snapshot|direct|media)(?:\/([0-9a-f]{64}))?$/.exec(url.pathname);
      let res: Response;
      if (!match) res = new Response("not found", { status: 404 });
      else if (match[1] === "snapshot" && !match[2]) res = await serveSnapshotDiscovery(req);
      else if (match[1] === "snapshot") res = await serveSnapshotArtifact(Object.assign(req, { routeParams: { sha256: match[2] } }));
      else if (match[1] === "direct") res = await serveDirectSnapshot(req, { afterCollect: directAfterCollect });
      else res = await serveBuildMedia(Object.assign(req, { routeParams: { sha256: match[2] } }));
      response.writeHead(res.status, Object.fromEntries(res.headers.entries()));
      response.end(Buffer.from(await res.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.BYLINE_NEWSROOM_URL = origin;
    base = `${origin}/api/byline/build`;
  });

  afterAll(async () => {
    delete process.env.BYLINE_BUILD_TOKEN;
    process.env.BYLINE_NEWSROOM_URL = savedNewsroom;
    await new Promise((resolve) => server.close(resolve));
  });

  const get = (path: string, token: string | null = TOKEN) => fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it("requires the build credential and never caches", async () => {
    expect((await get("/snapshot", null)).status).toBe(401);
    expect((await get("/snapshot", "wrong-token-wrong-token-wrong-token-0000")).status).toBe(401);
    const response = await get("/snapshot");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const saved = process.env.BYLINE_BUILD_TOKEN;
    delete process.env.BYLINE_BUILD_TOKEN;
    expect((await get("/snapshot")).status).toBe(404);
    process.env.BYLINE_BUILD_TOKEN = saved;
  });

  it("serves the completed snapshot and its exact artifact, which the build acquires", async () => {
    await runPublicSnapshotPreparation(payload);
    const discovery = await get("/snapshot");
    expect(discovery.status).toBe(200);
    const pointer = await discovery.json();
    expect(pointer).toMatchObject({ schemaVersion: 2, revision: await rev(), url: `${base}/snapshot/${pointer.digest}` });
    const artifact = Buffer.from(await (await get(`/snapshot/${pointer.digest}`)).arrayBuffer());
    expect(artifact.byteLength).toBe(pointer.bytes);
    expect(createHash("sha256").update(artifact).digest("hex")).toBe(pointer.digest);
    expect((await get(`/snapshot/${"0".repeat(64)}`)).status).toBe(404);
    expect((await get("/snapshot/../../etc/passwd")).status).toBe(404);
    const acquired = await acquirePayloadSnapshot({ baseUrl: base, token: TOKEN });
    expect(acquired).toMatchObject({ mode: "prepared-snapshot", revision: pointer.revision, digest: pointer.digest, requests: 2 });
    // Direct recovery is refused while a completed snapshot exists.
    expect((await get(`/direct?revision=${pointer.revision}`)).status).toBe(409);
    // Every advertised prepared file is downloadable by hash.
    const blobs = acquired.snapshot.datasets.media.flatMap(({ manifest }) => publicationManifestBlobs(manifest));
    for (const blob of blobs.slice(0, 3)) expect((await get(`/media/${blob.sha256}`)).status).toBe(200);
  });

  it("ignores a completed schema 1 pointer and promotes v2 for the same content revision", async () => {
    const state = await readPublicationState(payload);
    const db = await drizzleFor(payload);
    const v1Filename = `snapshot-v1-r${state.currentRevision}-${"b".repeat(64)}.json`;
    await db.execute(sql`update byline_publication_state set completed_schema_version = 1, completed_sha256 = ${"b".repeat(64)}, completed_filename = ${v1Filename} where id = 1`);
    const response = await get("/snapshot");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "byline_snapshot_not_ready", reason: "unsupported-schema" });
    expect((await get(`/snapshot/${"b".repeat(64)}`)).status).toBe(404);
    expect(await runPublicSnapshotPreparation(payload)).toMatchObject({ outcome: "ready", revision: state.currentRevision, pointer: { schemaVersion: 2 } });
  });

  it("reports not-ready precisely and recovers directly into the same snapshot contract", async () => {
    const prepared = await acquirePayloadSnapshot({ baseUrl: base, token: TOKEN });
    const db = await drizzleFor(payload);
    await db.execute(sql`update byline_publication_state set completed_revision = null, completed_schema_version = null, completed_sha256 = null, completed_bytes = null, completed_generated_at = null, completed_filename = null, completed_producer_version = null where id = 1`);
    const discovery = await get("/snapshot");
    expect(discovery.status).toBe(503);
    expect(await discovery.json()).toMatchObject({ code: "byline_snapshot_not_ready", currentRevision: prepared.revision, reason: "no-completed-snapshot" });
    const direct = await acquirePayloadSnapshot({ baseUrl: base, token: TOKEN });
    expect(direct).toMatchObject({ mode: "direct-source-recovery", revision: prepared.revision, requests: 2 });
    // Two acquisition paths, one content model: identical apart from generation metadata.
    const strip = (value: PublicBuildSnapshotV2 | typeof direct.snapshot) => ({ ...value, generatedAt: "" });
    expect(strip(direct.snapshot)).toEqual(strip(prepared.snapshot));
  });

  it("rejects stale direct output and rediscovers a bounded number of times", async () => {
    let races = 0;
    directAfterCollect = async () => {
      if (races++ < 1) await publish(await draftStory(`Direct race ${races}`));
    };
    try {
      const acquired = await acquirePayloadSnapshot({ baseUrl: base, token: TOKEN });
      expect(acquired).toMatchObject({ mode: "direct-source-recovery", attempts: 2 });
      expect(acquired.revision).toBe(await rev());
      directAfterCollect = async () => { await publish(await draftStory(`Always racing ${Date.now()}`)); };
      await expect(acquirePayloadSnapshot({ baseUrl: base, token: TOKEN, maxAttempts: 2 })).rejects.toThrow(/kept changing/);
    } finally {
      directAfterCollect = undefined;
    }
  });

  it("treats a corrupt pointer and a missing advertised artifact as failures, never as absence", async () => {
    await runPublicSnapshotPreparation(payload);
    const db = await drizzleFor(payload);
    await db.execute(sql`update byline_publication_state set completed_sha256 = 'not-a-digest' where id = 1`);
    expect((await get("/snapshot")).status).toBe(500);
    await expect(acquirePayloadSnapshot({ baseUrl: base, token: TOKEN })).rejects.toThrow(/HTTP 500/);
    await db.execute(sql`update byline_publication_state set completed_revision = null, completed_schema_version = null, completed_sha256 = null, completed_bytes = null, completed_generated_at = null, completed_filename = null, completed_producer_version = null where id = 1`);
    await runPublicSnapshotPreparation(payload);
    const state = await readPublicationState(payload);
    const { rmSync } = await import("node:fs");
    const { SnapshotStore } = await import("../../src/public/snapshot/store");
    rmSync(new SnapshotStore().pathFor(state.completed!.filename)!);
    await expect(acquirePayloadSnapshot({ baseUrl: base, token: TOKEN })).rejects.toThrow(/HTTP 404/);
    // The job re-prepares a missing artifact for the same revision.
    expect((await runPublicSnapshotPreparation(payload)).outcome).toBe("ready");
  });
});
