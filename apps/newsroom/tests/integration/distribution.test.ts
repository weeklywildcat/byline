import { sql } from "@payloadcms/db-postgres";
import { createLocalReq, getPayload, type Payload } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCurrentRevision } from "../../src/db/publication-state";
import { distributionEndpoints } from "../../src/distribution/endpoints";
import { seedDistribution } from "../../src/distribution/policy";
import { addDistribution, distributionDesk, distributionItem, markDistributionFailed, storyDistributionView, updateDistribution } from "../../src/distribution/server";
import { screenContext } from "../../src/newsroom/screen-models";
import type { Story, User } from "../../src/payload-types";
import { drizzleFor } from "../../src/publication-media/state";
import { collectPublicSnapshot } from "../../src/public/snapshot/collect";

type Account = "admin" | "editor" | "writer" | "owner" | "bystander" | "disabled";
const accounts = {} as Record<Account, User>;
const now = new Date("2026-11-09T15:00:00Z");
const privateCaption = "Distribution-only greenhouse caption 7bf024";
const privateNote = "Distribution-only internal note e251d9";
const instagram = "https://www.instagram.com/p/Greenhouse123/";
const facebook = "https://www.facebook.com/paper/posts/123456789";
let payload: Payload;
let section: number;

const reqAs = (key?: Account) => createLocalReq(key ? { user: accounts[key] } : {}, payload);
const ctx = async (key: Account) => screenContext(await reqAs(key), "America/New_York", now);
const rows = async (id: number) => (await payload.find({
  collection: "distribution-items", where: { story: { equals: id } }, depth: 0, pagination: false
})).docs;
const kinds = async (id: number) => (await rows(id)).map((row) => row.destination).sort();
const plan = async (id: number) => (await payload.find({
  collection: "story-plans", where: { story: { equals: id } }, limit: 1
})).docs[0];
const notifications = async (id: number) => (await payload.find({
  collection: "notifications", where: { story: { equals: id } }, depth: 0, pagination: false
})).docs.filter((notice) => notice.kind.startsWith("distribution"));
const activity = async (id: number) => (await payload.find({
  collection: "story-activity", where: { story: { equals: id } }, depth: 0, pagination: false
})).docs.map((event) => event.action).filter((action) => action.startsWith("distribution-"));

async function draft(headline: string, preset?: string) {
  const req = await reqAs("writer");
  if (preset) req.context.bylinePlan = { preset };
  return (await payload.create({ collection: "stories", draft: true, req, overrideAccess: false, data: { headline, deck: "The greenhouse opens Friday.", section } })).id;
}

async function publish(id: number, data: Partial<Story> = {}) {
  return payload.update({ collection: "stories", id, data: { section, ...data, _status: "published" }, req: await reqAs("editor"), overrideAccess: false });
}

async function image(name: string, complete = true) {
  const data = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#58763f" } }).jpeg().toBuffer();
  return (await payload.create({
    collection: "media", file: { data, mimetype: "image/jpeg", name: `${name}.jpg`, size: data.length },
    data: complete ? { alt: "Students in the greenhouse", credit: "Weekly Wildcat", copyright: "Weekly Wildcat" } : {}
  })).id;
}

async function patch(key: Account, id: number, data: Parameters<typeof updateDistribution>[2]) {
  return updateDistribution(await ctx(key), id, data);
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname += "_distribution";
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  for (const key of ["admin", "editor", "writer", "owner", "bystander", "disabled"] as const) {
    const user = await payload.create({
      collection: "users",
      data: { email: `distribution-${key}@example.test`, password: `distribution-${key}-password`, name: key,
        role: key === "admin" ? "administrator" : key === "editor" ? "editor" : "staff", enabled: key !== "disabled" }
    });
    accounts[key] = { ...user, collection: "users" } as User;
  }
  section = (await payload.create({ collection: "sections", data: { name: "Campus", slug: "campus" } })).id;
});

afterAll(async () => { await payload?.db?.destroy?.(); });

describe("publication policy", () => {
  it("seeds exactly once, on publication rather than a draft, autosave, restore or republish", async () => {
    const id = await draft("Greenhouse opening");
    const draftVersion = (await payload.findVersions({ collection: "stories", where: { parent: { equals: id } }, limit: 1 })).docs[0].id;
    expect(await kinds(id)).toEqual([]);
    await payload.update({ collection: "stories", id, draft: true, autosave: true, data: { headline: "Greenhouse opening soon" }, req: await reqAs("writer"), overrideAccess: false });
    expect(await kinds(id)).toEqual([]);
    expect((await plan(id)).distributionSeededAt).toBeFalsy();

    await publish(id);
    const seeded = await rows(id);
    expect(seeded.map((row) => [row.destination, row.expectation, row.state]).sort()).toEqual([
      ["facebook", "prepare", "planned"], ["instagram", "prepare", "planned"], ["newsletter", "eligible", "planned"]
    ]);
    expect((await storyDistributionView(await ctx("writer"), id)).suggestions).toEqual([{ kind: "school-tvs", label: "School TVs", level: "optional" }]);
    const seededAt = (await plan(id)).distributionSeededAt;
    expect(seededAt).toEqual(expect.any(String));
    expect(await notifications(id)).toEqual([]);
    expect(await activity(id)).toEqual([]);
    expect((await storyDistributionView(await ctx("writer"), id)).addable).toContainEqual({ kind: "school-tvs", label: "School TVs" });
    expect(await addDistribution(await ctx("writer"), id, { destination: "school-tvs" })).toMatchObject({ kind: "school-tvs", expectation: "optional" });
    await expect(payload.create({ collection: "distribution-items", data: { story: id, destination: "instagram", state: "planned", expectation: "prepare", headlineMode: "story", textMode: "story", mediaMode: "story" } })).rejects.toThrow();

    const item = seeded.find((row) => row.destination === "instagram")!;
    await patch("editor", item.id, { state: "skipped", note: privateNote });
    await payload.update({ collection: "stories", id, draft: true, autosave: true, data: { headline: "Embargoed rewrite" }, req: await reqAs("writer") });
    expect((await distributionItem(await ctx("writer"), item.id)).story.headline).not.toBe("Embargoed rewrite");
    await publish(id, { headline: "Published rewrite" });
    await payload.restoreVersion({ collection: "stories", id: draftVersion, req: await reqAs("editor") });
    await payload.update({ collection: "stories", id, data: { _status: "draft" }, req: await reqAs("editor") });
    await publish(id);
    expect(await seedDistribution(await reqAs(), id, section)).toBe(0);
    expect((await rows(id)).filter((row) => row.destination !== "school-tvs").map((row) => row.id).sort()).toEqual(seeded.map((row) => row.id).sort());
    expect((await plan(id)).distributionSeededAt).toBe(seededAt);
    expect(await distributionItem(await ctx("writer"), item.id)).toMatchObject({ state: "skipped", note: privateNote });
  });

  it("seeds via Payload's scheduled publish job only when the job runs", async () => {
    const id = await draft("Scheduled greenhouse follow-up");
    await payload.jobs.queue({
      task: "schedulePublish",
      input: { type: "publish", doc: { relationTo: "stories", value: String(id) as unknown as number }, user: { relationTo: "users", value: accounts.editor.id } }
    });
    expect(await kinds(id)).toEqual([]);
    await payload.jobs.run({ queue: "default", limit: 20 });
    expect(await kinds(id)).toEqual(["facebook", "instagram", "newsletter"]);
    expect((await plan(id)).distributionSeededAt).toEqual(expect.any(String));
  });
});

describe("private editorial workflow", () => {
  it("restricts reads and writes to the appropriate Story team, assigned owner and editors", async () => {
    const id = await draft("Greenhouse distribution access");
    await publish(id);
    const item = (await rows(id)).find((row) => row.destination === "facebook")!;
    await expect(distributionItem(await ctx("bystander"), item.id)).rejects.toMatchObject({ status: 404 });
    await expect(patch("bystander", item.id, { owner: accounts.bystander.id })).rejects.toMatchObject({ status: 404 });
    await expect(distributionDesk(await ctx("writer"), {})).rejects.toMatchObject({ status: 403 });
    await expect(patch("writer", item.id, { owner: accounts.owner.id })).rejects.toMatchObject({ status: 403 });
    await expect(patch("editor", item.id, { owner: accounts.disabled.id })).rejects.toMatchObject({ status: 400 });
    expect((await distributionItem(await ctx("editor"), item.id)).owners.map((owner) => owner.id)).not.toContain(accounts.disabled.id);
    expect((await distributionItem(await ctx("writer"), item.id)).owners).toEqual([]);
    expect(await patch("writer", item.id, { owner: accounts.writer.id })).toMatchObject({ owner: { id: accounts.writer.id } });
    expect(await notifications(id)).toEqual([]);
    await patch("editor", item.id, { owner: accounts.owner.id });
    await patch("editor", item.id, { owner: accounts.owner.id });
    expect(await notifications(id)).toMatchObject([{ kind: "distributionAssignments", recipient: accounts.owner.id }]);
    await expect(patch("writer", item.id, { note: "Someone else's work" })).rejects.toMatchObject({ status: 403 });
    expect(await patch("owner", item.id, { note: privateNote })).toMatchObject({ note: privateNote });
    await expect(payload.update({
      collection: "distribution-items", id: item.id, data: { note: "Bypass" }, req: await reqAs("editor"), overrideAccess: false
    })).rejects.toMatchObject({ status: 403 });
    expect((await payload.find({ collection: "distribution-items", req: await reqAs(), overrideAccess: false }).catch(() => ({ docs: [] }))).docs).toEqual([]);
    const response = await distributionEndpoints.find((entry) => entry.path === "/byline/distribution" && entry.method === "get")!.handler(await reqAs());
    expect(response.status).toBe(401);
  });

  it("inherits published facts independently, approves staff changes and freezes actual sends", async () => {
    const id = await draft("Students restore the greenhouse");
    const featured = await image("distribution-featured");
    const updated = await image("distribution-updated");
    const custom = await image("distribution-custom");
    await payload.jobs.run({ queue: "media", limit: 20 });
    await publish(id, { featuredMedia: featured });
    const items = await rows(id);
    const ig = items.find((row) => row.destination === "instagram")!.id;
    const fb = items.find((row) => row.destination === "facebook")!.id;

    expect(await distributionItem(await ctx("writer"), ig)).toMatchObject({ media: { effectiveId: featured }, effective: { text: "Students restore the greenhouse\n\nThe greenhouse opens Friday." } });
    await patch("writer", ig, { owner: accounts.writer.id, textMode: "custom", text: privateCaption });
    await publish(id, { headline: "Greenhouse reopens", deck: "Tours start Friday.", featuredMedia: updated });
    expect(await distributionItem(await ctx("writer"), ig)).toMatchObject({ media: { effectiveId: updated }, effective: { text: privateCaption } });
    expect(await distributionItem(await ctx("writer"), fb)).toMatchObject({ media: { effectiveId: updated }, effective: { headline: "Greenhouse reopens", text: "Tours start Friday." } });
    await patch("writer", ig, { mediaMode: "custom", media: custom });
    expect(await patch("writer", ig, { state: "ready" })).toMatchObject({ state: "ready", attention: "Needs approval" });
    await expect(patch("writer", ig, { state: "scheduled", scheduledFor: "2026-11-09T20:30" })).rejects.toThrow("An editor needs to approve");
    await expect(patch("writer", ig, { permalink: instagram })).rejects.toThrow("An editor needs to approve");
    expect(await patch("editor", ig, { approve: true })).toMatchObject({ approvedBy: { id: accounts.editor.id } });
    expect(await patch("writer", ig, { text: `${privateCaption} revised` })).toMatchObject({ approvedAt: null, attention: "Needs approval" });
    await expect(patch("writer", ig, { permalink: instagram })).rejects.toThrow("An editor needs to approve");
    await patch("editor", ig, { approve: true });
    expect(await patch("editor", ig, { text: privateCaption })).toMatchObject({ approvedBy: { id: accounts.editor.id } });
    const posted = await patch("writer", ig, { permalink: instagram });
    expect(posted).toMatchObject({ state: "posted", permalink: instagram, postedAt: now.toISOString(), postedBy: { id: accounts.writer.id } });
    expect(posted.sent).toMatchObject([{ at: now.toISOString(), by: accounts.writer.id, destination: "instagram",
      headline: null, text: privateCaption, mediaIds: [custom], storyUrl: posted.story.url, permalink: instagram }]);
    expect(posted.story.url).toMatch(/^https?:\/\//);
    await patch("editor", fb, { permalink: facebook });
    await publish(id, { headline: "Greenhouse tours sell out", deck: "A second date is planned.", featuredMedia: featured });
    expect((await distributionItem(await ctx("writer"), ig)).sent).toEqual(posted.sent);
    expect((await distributionItem(await ctx("writer"), fb)).sent).toMatchObject([{ headline: "Greenhouse reopens", text: "Tours start Friday.", mediaIds: [updated] }]);
    expect(await patch("editor", ig, { state: "draft" })).toMatchObject({ sent: posted.sent, permalink: null, postedAt: null, postedBy: null });
    expect(await patch("writer", ig, { textMode: "story", mediaMode: "story" })).toMatchObject({
      text: { custom: privateCaption }, effective: { text: "Greenhouse tours sell out\n\nA second date is planned." }, media: { customId: custom, effectiveId: featured }
    });
    const repost = await patch("editor", ig, { permalink: "https://www.instagram.com/reel/Greenhouse456/" });
    expect(repost.sent).toHaveLength(2);
    expect(repost.sent[1]).toEqual(posted.sent[0]);
    await payload.update({ collection: "stories", id, data: { _status: "draft" } });
    expect(await distributionItem(await ctx("editor"), ig)).toMatchObject({ state: "posted", story: { published: false, everPublished: true }, sent: repost.sent });
    await patch("editor", ig, { state: "draft" });
    await expect(patch("editor", ig, { permalink: instagram })).rejects.toThrow("The Story is unpublished");
    expect(await activity(id)).toEqual(expect.arrayContaining(["distribution-assigned", "distribution-ready", "distribution-posted"]));
    expect(JSON.stringify(await notifications(id))).not.toContain(privateCaption);
    expect((await notifications(id)).filter((notice) => notice.kind === "distributionApproval").map((notice) => notice.recipient).sort()).toEqual([accounts.admin.id, accounts.editor.id].sort());
  });

  it("surfaces optional image gaps, lets staff choose no image, and blocks a deleted custom image", async () => {
    const id = await draft("Greenhouse image checks");
    await publish(id);
    const fb = (await rows(id)).find((row) => row.destination === "facebook")!.id;
    const incomplete = await image("distribution-incomplete", false);
    expect((await patch("writer", fb, { mediaMode: "custom", media: incomplete })).problems).not.toEqual([]);
    await expect(patch("editor", fb, { permalink: facebook })).rejects.toMatchObject({ status: 409 });
    await payload.delete({ collection: "media", id: incomplete });
    await expect(patch("editor", fb, { permalink: facebook })).rejects.toThrow(/choose an image|no longer in Media/i);
    expect(await patch("editor", fb, { mediaMode: "none" })).toMatchObject({ problems: [], media: { effectiveId: null } });
  });

  it("records and deduplicates delivery failure, and keeps history during recovery", async () => {
    const id = await draft("Greenhouse delivery recovery");
    await publish(id);
    const fb = (await rows(id)).find((row) => row.destination === "facebook")!.id;
    const posted = await patch("editor", fb, { permalink: facebook });
    await patch("editor", fb, { state: "draft" });
    await patch("editor", fb, { owner: accounts.owner.id });
    await expect(patch("editor", fb, { state: "failed" })).rejects.toThrow("Only a delivery can fail");
    const reason = "A delivery failed. ".repeat(50);
    const [left, right] = await Promise.all([reqAs(), reqAs()]);
    expect((await Promise.all([
      markDistributionFailed(left, fb, reason),
      markDistributionFailed(right, fb, reason)
    ])).sort()).toEqual([false, true]);
    expect(await distributionItem(await ctx("owner"), fb)).toMatchObject({ state: "failed", failure: reason.slice(0, 400), sent: posted.sent, attention: "Failed" });
    const failures = (await notifications(id)).filter((notice) => notice.kind === "distributionFailures");
    expect(failures.map((notice) => notice.recipient).sort()).toEqual([accounts.admin.id, accounts.editor.id, accounts.owner.id].sort());
    expect(JSON.stringify(failures)).not.toContain("A delivery failed");
    expect((await activity(id)).filter((action) => action === "distribution-failed")).toEqual(["distribution-failed"]);
    await expect(patch("owner", fb, { state: "draft" })).rejects.toMatchObject({ status: 403 });
    expect(await patch("editor", fb, { state: "draft" })).toMatchObject({ state: "draft", failure: null, sent: posted.sent });
  });

  it("allows only one concurrent final-link confirmation", async () => {
    const id = await draft("Greenhouse concurrency");
    await publish(id);
    const fb = (await rows(id)).find((row) => row.destination === "facebook")!.id;
    const attempts = await Promise.allSettled([
      patch("editor", fb, { permalink: facebook }),
      patch("editor", fb, { permalink: "https://www.facebook.com/paper/posts/23456789" })
    ]);
    expect(attempts.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((await distributionItem(await ctx("editor"), fb)).sent).toHaveLength(1);
    expect((await activity(id)).filter((action) => action === "distribution-posted")).toHaveLength(1);
  });

  it("keeps private workflow out of the public projection and preserves it through trash", async () => {
    const id = await draft("Public greenhouse privacy fixture");
    await publish(id);
    const fb = (await rows(id)).find((row) => row.destination === "facebook")!.id;
    const revision = await readCurrentRevision(payload);
    const before = await collectPublicSnapshot(payload, { revision });
    await patch("editor", fb, { textMode: "custom", text: privateCaption, owner: accounts.owner.id, note: privateNote, plannedFor: "2026-11-10T09:00" });
    await patch("editor", fb, { permalink: facebook });
    expect(await readCurrentRevision(payload)).toBe(revision);
    const after = await collectPublicSnapshot(payload, { revision });
    expect(after.datasets).toEqual(before.datasets);
    expect(JSON.stringify(after)).toContain("Public greenhouse privacy fixture");
    for (const privateValue of [privateCaption, privateNote, facebook, "distribution-items", "distributionSeededAt"]) expect(JSON.stringify(after)).not.toContain(privateValue);
    await payload.update({ collection: "stories", id, data: { deletedAt: now.toISOString() } });
    expect(await kinds(id)).toEqual(["facebook", "instagram", "newsletter"]);
    await payload.delete({ collection: "stories", id, trash: true });
    expect(await kinds(id)).toEqual([]);
  });
});

it("caps Posted at 200 after applying the desk's filters and reports the full matching count", async () => {
  const db = await drizzleFor(payload);
  // Bulk historical fixtures isolate the desk cap from publication hook setup.
  await db.execute(sql`
    with stories_for_desk as (
      insert into stories (headline, section_id, _status)
      select 'Distribution archive fixture ' || serial, ${section}, 'published' from generate_series(1, 202) as serial
      returning id, headline
    )
    insert into distribution_items (story_id, destination, state, posted_at)
    select id, 'facebook', 'posted',
      case when headline like '% 202' then '2026-11-09T14:00:00Z'::timestamptz else '2026-11-08T14:00:00Z'::timestamptz end
    from stories_for_desk
  `);
  const query = { view: "posted", destination: "facebook", section: String(section), q: "Distribution archive fixture" };
  const desk = await distributionDesk(await ctx("editor"), query);
  expect(desk).toMatchObject({ view: "posted", truncated: true, counts: { posted: 202 } });
  expect(desk.rows).toHaveLength(200);
  const today = await distributionDesk(await ctx("editor"), { ...query, when: "today" });
  expect(today).toMatchObject({ truncated: false, counts: { posted: 1 }, rows: [{ story: "Distribution archive fixture 202" }] });
});

it("uses customized preset and Section rules without backfilling earlier publications", async () => {
  const old = await draft("Previously published under the defaults");
  await publish(old);
  await payload.updateGlobal({
    slug: "distribution-settings",
    data: {
      destinations: [{ kind: "facebook", enabled: false }, { kind: "discord", enabled: true }, { kind: "newsletter", enabled: true }],
      rules: [
        { destination: "facebook", level: "prepare" }, { destination: "discord", level: "prepare", sections: [section] },
        { destination: "newsletter", level: "eligible", presets: ["news"] }
      ]
    }
  });
  const news = await draft("Configured news Story", "news");
  const blank = await draft("Configured blank Story");
  await publish(news);
  await publish(blank);
  expect(await kinds(news)).toEqual(["discord", "newsletter"]);
  expect(await kinds(blank)).toEqual(["discord"]);
  await publish(old);
  expect(await kinds(old)).toEqual(["facebook", "instagram", "newsletter"]);
});
