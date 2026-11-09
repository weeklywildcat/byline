import { normalizeLiveCoverage } from "@byline/core";
import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fieldEndpoints } from "../../src/field/endpoints";
import { readCurrentRevision } from "../../src/db/publication-state";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import type { User } from "../../src/payload-types";

/**
 * The live reporting workflow against real PostgreSQL (docs/live-coverage.md): Story mode versus coverage
 * state, who may change them, that going live never publishes unpublished article copy, the explicit
 * delivery intent from Write and Field (a stale queued "publish" never goes public), direct publishers, and
 * the public projection.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const story: Record<string, number> = {};

const endpoints = [...newsroomEndpoints, ...fieldEndpoints];

async function account(key: string, role: User["role"], person = true) {
  if (person) people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `lw-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `lw-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] ?? null } });
  accounts[key] = { ...user, collection: "users" } as User;
}
const reqAs = (key: string | null) => createLocalReq(key ? { user: accounts[key] } : {}, payload);

async function call(method: string, path: string, key: string | null, { data, routeParams = {} }: { data?: unknown; routeParams?: Record<string, string> } = {}) {
  const endpoint = endpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await reqAs(key);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams() });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}
const id = (storyKey: string) => ({ id: String(story[storyKey]) });
const desk = (key: string, storyKey: string) => call("get", "/byline/stories/:id/live", key, { routeParams: id(storyKey) });
const coverage = (key: string, storyKey: string, data: Record<string, unknown>) => call("post", "/byline/stories/:id/live/coverage", key, { data, routeParams: id(storyKey) });
const post = (key: string, storyKey: string, data: Record<string, unknown>) => call("post", "/byline/stories/:id/live", key, { data, routeParams: id(storyKey) });
const field = (key: string, storyKey: string, data: Record<string, unknown>) => call("post", "/byline/field/stories/:id/live", key, { data, routeParams: id(storyKey) });
const session = (key: string, storyKey: string) => call("get", "/byline/field/stories/:id", key, { routeParams: id(storyKey) });
const candidates = (key: string, storyKey: string) => call("get", "/byline/stories/:id/live/publishers", key, { routeParams: id(storyKey) });
const feed = (storyKey: string) => call("get", "/byline/live/:id", null, { routeParams: id(storyKey) });
const plan = async (storyKey: string) => (await payload.find({ collection: "story-plans", where: { story: { equals: story[storyKey] } }, limit: 1, depth: 0, overrideAccess: true })).docs[0];

async function newStory(key: string, headline: string, published: boolean, contributors: number[] = []) {
  const section = (await payload.find({ collection: "sections", where: { slug: { equals: "lw-sports" } }, limit: 1 })).docs[0].id;
  story[key] = (await payload.create({ collection: "stories", draft: !published, data: { headline, section, contributors, ...(published ? { _status: "published" } : {}) } as never, overrideAccess: true })).id;
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_live_workflow`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("alice", "staff");
  await account("bob", "staff");
  await account("carol", "staff");
  await account("stranger", "staff");
  await payload.create({ collection: "sections", data: { name: "Sports", slug: "lw-sports" } });
  await newStory("game", "Ninety Six vs. Abbeville", true, [people.alice]);
  const system = { overrideAccess: true as const, context: { bylineSystem: true } };
  // Bob and Carol hold work on the game: participants.
  await payload.create({ collection: "production-assignments", data: { story: story.game, title: "Game photos", type: "photo", assignees: [accounts.bob.id], status: "assigned" }, ...system } as never);
  await payload.create({ collection: "tasks", data: { story: story.game, title: "Halftime notes", assignees: [accounts.carol.id] }, ...system } as never);
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("Story mode and coverage state are separate", () => {
  it("starts Standard, Not started", async () => {
    expect((await desk("editor", "game")).body).toMatchObject({ mode: "standard", status: "off", startedAt: null, canControl: true, canPublishNow: false, publishBlock: "not-live-mode" });
  });

  it("lists only staff who work on the story as direct publishers, and only to editors", async () => {
    const people = (await candidates("editor", "game")).body.people as Array<{ id: number; name: string; granted: boolean; relation: string }>;
    const names = people.map((person) => person.name).sort();
    // Alice is on the byline, Bob and Carol hold work. No editor, no stranger.
    expect(names).toEqual(["alice Account", "bob Account", "carol Account"]);
    expect((await candidates("alice", "game")).status).toBe(403);
  });

  it("sets Live up for later: Live mode, direct publishers, coverage Not started", async () => {
    const result = await coverage("editor", "game", { action: "setup", publishers: [accounts.carol.id] });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ mode: "live", status: "off", startedAt: null, publishBlock: "coverage-not-started", publishers: [{ id: accounts.carol.id, name: "carol Account" }] });
    expect((await plan("game")).livePublishers).toEqual([accounts.carol.id]);
    // Selecting Live never starts coverage: the public feed has nothing.
    expect((await feed("game")).status).toBe(404);
  });

  it("refuses direct publishers who are not on the story, editors, and anyone but an editor", async () => {
    expect((await coverage("editor", "game", { action: "publishers", publishers: [accounts.stranger.id] })).status).toBe(400);
    expect((await coverage("editor", "game", { action: "publishers", publishers: [accounts.editor.id] })).status).toBe(400);
    for (const key of ["alice", "bob", "carol", "stranger"]) expect((await coverage(key, "game", { action: "start" })).status).toBe(403);
    expect((await coverage("carol", "game", { action: "publishers", publishers: [accounts.carol.id, accounts.bob.id] })).status).toBe(403);
    expect((await coverage("carol", "game", { action: "mode", mode: "standard" })).status).toBe(403);
    expect((await plan("game")).livePublishers).toEqual([accounts.carol.id]);
  });
});

describe("starting, ending and resuming", () => {
  it("starts once, keeps the original start on resume, and ending does not switch to Standard", async () => {
    const started = (await coverage("editor", "game", { action: "start" })).body;
    expect(started).toMatchObject({ mode: "live", status: "live", publishBlock: null, endedAt: null });
    const startedAt = started.startedAt as string;
    expect(startedAt).toBeTruthy();
    const ended = (await coverage("editor", "game", { action: "end" })).body;
    expect(ended).toMatchObject({ mode: "live", status: "ended", startedAt, publishBlock: "coverage-ended" });
    expect(ended.endedAt).toBeTruthy();
    const resumed = (await coverage("editor", "game", { action: "start" })).body;
    expect(resumed).toMatchObject({ mode: "live", status: "live", startedAt, endedAt: null });
    const actions = (await payload.find({ collection: "story-activity", where: { story: { equals: story.game } }, limit: 50, overrideAccess: true })).docs.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["live-coverage-started", "live-coverage-ended", "live-coverage-resumed", "live-mode-changed", "live-publishers-changed"]));
  });

  it("keeps updates when switching to Standard and back; ended stays Ended until resumed", async () => {
    await post("editor", "game", { text: "SENTINEL-KEEP kickoff", delivery: "publish" });
    expect((await feed("game")).status).toBe(200);
    // Switching to Standard while live ends coverage; the updates stay.
    const standard = (await coverage("editor", "game", { action: "mode", mode: "standard" })).body;
    expect(standard).toMatchObject({ mode: "standard", status: "ended" });
    expect(standard.updates.map((update: { text: string }) => update.text)).toContain("SENTINEL-KEEP kickoff");
    // The public article is a normal article again: no live feed.
    expect((await feed("game")).status).toBe(404);
    const live = (await coverage("editor", "game", { action: "mode", mode: "live" })).body;
    expect(live).toMatchObject({ mode: "live", status: "ended" });
    expect(live.updates.map((update: { text: string }) => update.text)).toContain("SENTINEL-KEEP kickoff");
    expect(normalizeLiveCoverage((await feed("game")).body)).toMatchObject({ status: "ended" });
    await coverage("editor", "game", { action: "start" });
  });
});

describe("delivery intent from Write", () => {
  it("lets a participant send only to the desk, whatever they ask for", async () => {
    const asked = await post("bob", "game", { text: "SENTINEL-BOB asked to publish", delivery: "publish" });
    expect(asked.body).toMatchObject({ status: "sent-to-desk", reason: "permission-revoked" });
    const fine = await post("bob", "game", { text: "SENTINEL-BOB for the desk", delivery: "desk" });
    expect(fine.body).toMatchObject({ status: "sent-to-desk" });
    expect(fine.body.reason).toBeUndefined();
    expect(JSON.stringify((await feed("game")).body)).not.toContain("SENTINEL-BOB");
  });

  it("lets a direct publisher publish now or send to the desk, by explicit choice", async () => {
    const now = await post("carol", "game", { text: "SENTINEL-CAROL publish now", delivery: "publish" });
    expect(now.body).toMatchObject({ status: "posted" });
    const desked = await post("carol", "game", { text: "SENTINEL-CAROL send to desk", delivery: "desk" });
    expect(desked.body).toMatchObject({ status: "sent-to-desk" });
    const json = JSON.stringify((await feed("game")).body);
    expect(json).toContain("SENTINEL-CAROL publish now");
    expect(json).not.toContain("SENTINEL-CAROL send to desk");
    // A direct publisher is not an editor: no coverage control.
    expect((await desk("carol", "game")).body).toMatchObject({ canPublish: true, canPublishNow: true, canControl: false });
  });

  it("keeps a draft from becoming a key update", async () => {
    const draft = await post("editor", "game", { text: "SENTINEL-PIN draft", delivery: "desk", pinned: true });
    const row = (await desk("editor", "game")).body.updates.find((update: { id: number }) => update.id === draft.body.id);
    expect(row).toMatchObject({ state: "draft", pinned: false });
  });
});

describe("delivery intent from Field (offline retries)", () => {
  it("publishes a direct publisher's explicit Publish now, and records no stale reason", async () => {
    const result = await field("carol", "game", { text: "SENTINEL-FIELD live", delivery: "publish", clientKey: "lw-field-0001" });
    expect(result.body).toMatchObject({ status: "posted", duplicate: false });
    expect(result.body.reason).toBeUndefined();
  });

  it("treats a missing intent as the desk, and Send to desk as a draft even for a publisher", async () => {
    expect((await field("carol", "game", { text: "SENTINEL-FIELD legacy client", clientKey: "lw-field-0002" })).body).toMatchObject({ status: "sent-to-desk" });
    expect((await field("carol", "game", { text: "SENTINEL-FIELD desk", delivery: "desk", clientKey: "lw-field-0003" })).body).toMatchObject({ status: "sent-to-desk" });
  });

  it("sends a queued publish to the desk when the grant was revoked before it reached the server", async () => {
    const original = (await plan("game")).livePublishers;
    await payload.update({ collection: "story-plans", id: (await plan("game")).id, data: { livePublishers: [] }, overrideAccess: true });
    const retried = await field("carol", "game", { text: "SENTINEL-REVOKED", delivery: "publish", clientKey: "lw-field-0004", queued: true });
    expect(retried.body).toMatchObject({ status: "sent-to-desk", reason: "permission-revoked" });
    await payload.update({ collection: "story-plans", id: (await plan("game")).id, data: { livePublishers: original }, overrideAccess: true });
    expect(JSON.stringify((await feed("game")).body)).not.toContain("SENTINEL-REVOKED");
  });

  it("sends a queued publish to the desk when coverage ended while the phone was offline", async () => {
    await coverage("editor", "game", { action: "end" });
    const retried = await field("carol", "game", { text: "SENTINEL-OFFLINE-9-51", delivery: "publish", clientKey: "lw-field-0005", queued: true });
    expect(retried.body).toMatchObject({ status: "sent-to-desk", reason: "coverage-ended" });
    expect(JSON.stringify((await feed("game")).body)).not.toContain("SENTINEL-OFFLINE-9-51");
    // A retry of the same capture returns the first record and never duplicates or flips to public.
    const again = await field("carol", "game", { text: "SENTINEL-OFFLINE-9-51", delivery: "publish", clientKey: "lw-field-0005", queued: true });
    expect(again.body).toMatchObject({ id: retried.body.id, status: "sent-to-desk", duplicate: true });
    expect((await payload.count({ collection: "live-updates", where: { clientKey: { equals: "lw-field-0005" } } })).totalDocs).toBe(1);
    // The session tells Field the truth: no Publish now while ended.
    expect((await session("carol", "game")).body).toMatchObject({ canPostLive: true, canPublishNow: false, publishBlock: "coverage-ended", canControl: false, story: { live: false, coverage: { mode: "live", state: "ended" } } });
    expect((await session("editor", "game")).body.canControl).toBe(true);
  });

  it("refuses direct publication by the collection itself when coverage is not live", async () => {
    // Through the Local API as the grantee (what REST would do): the shared rule holds below the endpoints.
    const refused = await payload.create({ collection: "live-updates", data: { story: story.game, body: { root: { type: "root", children: [], direction: null, format: "", indent: 0, version: 1 } } as never, state: "published" }, req: await reqAs("carol"), overrideAccess: false }).then(() => "created", () => "refused");
    expect(refused).toBe("refused");
    await coverage("editor", "game", { action: "start" });
  });

  it("sends a publish to the desk while the story is in Standard mode", async () => {
    await coverage("editor", "game", { action: "mode", mode: "standard" });
    expect((await field("carol", "game", { text: "SENTINEL-STANDARD", delivery: "publish", clientKey: "lw-field-0006" })).body).toMatchObject({ status: "sent-to-desk", reason: "not-live-mode" });
    await coverage("editor", "game", { action: "mode", mode: "live" });
    await coverage("editor", "game", { action: "start" });
  });
});

describe("a story that is not public cannot be live", () => {
  it("cannot start, and a grantee's publish goes to the desk", async () => {
    await newStory("unpublished", "Never published", false, [people.alice]);
    await coverage("editor", "unpublished", { action: "setup", publishers: [] });
    const refused = await coverage("editor", "unpublished", { action: "start" });
    expect(refused.status).toBe(409);
    expect(refused.body.message ?? JSON.stringify(refused.body)).toMatch(/Publish the story/i);
    expect((await desk("editor", "unpublished")).body).toMatchObject({ mode: "live", status: "off", storyPublished: false, publishBlock: "story-not-public" });
    expect((await post("editor", "unpublished", { text: "Private pregame", delivery: "publish" })).body).toMatchObject({ status: "sent-to-desk", reason: "story-not-public" });
    expect((await feed("unpublished")).status).toBe(404);
  });

  it("can go live once the story passes the normal publication checks, and not before", async () => {
    // The normal publish path refuses a story that fails its readiness checks (a video story without a video):
    // coverage cannot be live, because it cannot be public.
    await payload.update({ collection: "stories", id: story.unpublished, draft: true, data: { format: "video" } as never, overrideAccess: true });
    const blocked = await payload.update({ collection: "stories", id: story.unpublished, data: { _status: "published" } as never, overrideAccess: true }).then(() => "published", () => "blocked");
    expect(blocked).toBe("blocked");
    expect((await coverage("editor", "unpublished", { action: "start" })).status).toBe(409);
    // Complete it, publish through the same hooks, then go live.
    await payload.update({ collection: "stories", id: story.unpublished, data: { format: "standard", _status: "published" } as never, overrideAccess: true });
    expect((await coverage("editor", "unpublished", { action: "start" })).body).toMatchObject({ status: "live", storyPublished: true });
    expect((await post("editor", "unpublished", { text: "Kickoff", delivery: "publish" })).body).toMatchObject({ status: "posted" });
  });

  it("is withdrawn publicly when the story is unpublished, and a publish attempt goes to the desk", async () => {
    await payload.update({ collection: "stories", id: story.unpublished, data: { _status: "draft" } as never, overrideAccess: true });
    expect((await feed("unpublished")).status).toBe(404);
    expect((await post("editor", "unpublished", { text: "Too late", delivery: "publish" })).body).toMatchObject({ status: "sent-to-desk", reason: "story-not-public" });
  });
});

describe("going live never publishes the article's unpublished draft", () => {
  it("leaves the previously published body public, the draft edits unpublished, and live updates immediate", async () => {
    await newStory("regress", "Published headline", true, [people.alice]);
    // An editor keeps working: a newer draft that is NOT published.
    await payload.update({ collection: "stories", id: story.regress, draft: true, data: { headline: "UNPUBLISHED draft headline", deck: "UNPUBLISHED deck" } as never, overrideAccess: true });
    const versionsBefore = (await payload.findVersions({ collection: "stories", where: { parent: { equals: story.regress } }, limit: 100, overrideAccess: true })).totalDocs;
    expect((await payload.findByID({ collection: "stories", id: story.regress, draft: true, overrideAccess: true })).headline).toBe("UNPUBLISHED draft headline");

    const revisionBefore = await readCurrentRevision(payload);
    await coverage("editor", "regress", { action: "setup", publishers: [] });
    const live = await coverage("editor", "regress", { action: "start" });
    expect(live.body).toMatchObject({ mode: "live", status: "live", storyPublished: true });
    // Coverage is live and the public revision moved on its own...
    expect(await readCurrentRevision(payload)).toBeGreaterThan(revisionBefore);

    // ...but the public article is still the previously published one, the draft edits remain unpublished,
    // and going live wrote no new article version.
    const publicStory = await payload.findByID({ collection: "stories", id: story.regress, draft: false, overrideAccess: true });
    expect(publicStory.headline).toBe("Published headline");
    expect(publicStory.deck ?? "").not.toContain("UNPUBLISHED");
    const draft = await payload.findByID({ collection: "stories", id: story.regress, draft: true, overrideAccess: true });
    expect(draft).toMatchObject({ headline: "UNPUBLISHED draft headline", _status: "draft" });
    expect((await payload.findVersions({ collection: "stories", where: { parent: { equals: story.regress } }, limit: 100, overrideAccess: true })).totalDocs).toBe(versionsBefore);

    // Live updates still publish immediately, and the public feed shows coverage without the draft copy.
    expect((await post("editor", "regress", { text: "Kickoff is underway", delivery: "publish" })).body).toMatchObject({ status: "posted" });
    const publicFeed = await feed("regress");
    expect(publicFeed.status).toBe(200);
    const projected = normalizeLiveCoverage(publicFeed.body)!;
    expect(projected.status).toBe("live");
    expect(projected.updates.map((update) => update.html).join()).toContain("Kickoff is underway");
    expect(JSON.stringify(publicFeed.body)).not.toContain("UNPUBLISHED");
  });

  it("keeps coverage state when a version is restored", async () => {
    const versions = await payload.findVersions({ collection: "stories", where: { parent: { equals: story.regress } }, sort: "createdAt", limit: 1, overrideAccess: true });
    await payload.restoreVersion({ collection: "stories", id: versions.docs[0].id, overrideAccess: true });
    expect((await desk("editor", "regress")).body).toMatchObject({ mode: "live", status: "live" });
  });
});

describe("the public feed", () => {
  it("excludes drafts and keeps no account details", async () => {
    const json = JSON.stringify((await feed("game")).body);
    for (const draft of ["SENTINEL-BOB", "SENTINEL-FIELD legacy", "SENTINEL-FIELD desk", "SENTINEL-CAROL send"]) expect(json).not.toContain(draft);
    expect(json).not.toContain("example.test");
  });
});
