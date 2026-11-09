import { normalizeLiveCoverage } from "@byline/core";
import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import { readCurrentRevision } from "../../src/db/publication-state";
import type { User } from "../../src/payload-types";

/**
 * The live desk against real PostgreSQL: who may post and publish, drafts
 * versus published updates, pinning, what each person sees, and the public
 * feed's published-only projection (validated by the same normalizer the
 * Worker and the static build use).
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const story: Record<string, number> = {};

async function account(key: string, role: User["role"], person = true) {
  if (person) people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `live-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `live-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] ?? null } });
  accounts[key] = { ...user, collection: "users" } as User;
}
const reqAs = (key: string | null) => createLocalReq(key ? { user: accounts[key] } : {}, payload);

async function call(method: string, path: string, key: string | null, { data, routeParams = {} }: { data?: unknown; routeParams?: Record<string, string> } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await reqAs(key);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams() });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, headers: response.headers, body: await response.json() };
}
const desk = (key: string, storyKey: string) => call("get", "/byline/stories/:id/live", key, { routeParams: { id: String(story[storyKey]) } });
const post = (key: string, storyKey: string, data: Record<string, unknown>) => call("post", "/byline/stories/:id/live", key, { data, routeParams: { id: String(story[storyKey]) } });
const patch = (key: string, storyKey: string, update: number, data: Record<string, unknown>) => call("patch", "/byline/stories/:id/live/:update", key, { data, routeParams: { id: String(story[storyKey]), update: String(update) } });
const remove = (key: string, storyKey: string, update: number) => call("delete", "/byline/stories/:id/live/:update", key, { routeParams: { id: String(story[storyKey]), update: String(update) } });
const feed = (storyKey: string) => call("get", "/byline/live/:id", null, { routeParams: { id: String(story[storyKey]) } });

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_live`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("alice", "staff");
  await account("bob", "staff");
  await account("stranger", "staff");
  const section = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" } })).id;
  // A published story in live coverage with Alice (a manager) and a participant (Bob holds a task on it).
  story.game = (await payload.create({ collection: "stories", data: { headline: "Homecoming game live", section, contributors: [people.alice], _status: "published", liveCoverage: { state: "live" } } as never, overrideAccess: true })).id;
  await payload.create({ collection: "tasks", data: { story: story.game, title: "Shoot the halftime show", assignees: [accounts.bob.id] }, req: await reqAs("editor"), overrideAccess: false });
  // A draft story and one with coverage off.
  story.draft = (await payload.create({ collection: "stories", draft: true, data: { headline: "Not yet published", section, contributors: [people.alice], liveCoverage: { state: "live" } } as never, overrideAccess: true })).id;
  story.off = (await payload.create({ collection: "stories", data: { headline: "No coverage", section, contributors: [people.alice], _status: "published" } as never, overrideAccess: true })).id;
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("posting", () => {
  it("lets an editor publish an update with a headline, paragraphs, a list and a link", async () => {
    const created = await post("editor", "game", { title: "Kickoff", text: "We're underway.\nBoth teams are fired up.\n\n- Lions win the toss\n- Wind from the north\n\nDetails: https://example.com/game", state: "published" });
    expect(created.status).toBe(200);
    const [first] = (await desk("editor", "game")).body.updates;
    expect(first).toMatchObject({ title: "Kickoff", state: "published", pinned: false });
    expect(first.text).toContain("- Lions win the toss");
    expect(first.author.name).toBe("editor Account");
  });

  it("makes a story manager's update a draft, whatever they ask for", async () => {
    const created = await post("alice", "game", { text: "Touchdown Lions!", state: "published" });
    expect(created.status).toBe(200);
    const row = (await desk("alice", "game")).body.updates.find((update: { id: number }) => update.id === created.body.id);
    expect(row.state).toBe("draft");
  });

  it("refuses an empty update and a stranger", async () => {
    expect((await post("editor", "game", { title: "Only a title" })).status).toBe(400);
    expect((await post("editor", "game", { text: "   " })).status).toBe(400);
    expect((await post("stranger", "game", { text: "Hello" })).status).toBe(403);
  });

  it("lets a participant send a draft to the live desk, never a public update", async () => {
    const sent = await post("bob", "game", { text: "SENTINEL-BOB halftime show photos are in", state: "published" });
    expect(sent.status).toBe(200);
    const row = (await desk("editor", "game")).body.updates.find((update: { id: number }) => update.id === sent.body.id);
    expect(row.state).toBe("draft");
    // The participant sees their own draft; the editor can publish it.
    expect((await desk("bob", "game")).body.updates.some((update: { id: number }) => update.id === sent.body.id)).toBe(true);
    await remove("editor", "game", sent.body.id);
  });

  it("lets the Story-level live grant publish live updates on that story only", async () => {
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: story.game } }, limit: 1 })).docs[0];
    await payload.update({ collection: "story-plans", id: plan.id, data: { livePublishers: [accounts.bob.id] }, overrideAccess: true });
    const posted = await post("bob", "game", { text: "Granted: touchdown!", state: "published" });
    expect((await desk("editor", "game")).body.updates.find((update: { id: number }) => update.id === posted.body.id).state).toBe("published");
    expect((await desk("bob", "game")).body.canPublish).toBe(true);
    // The grant never publishes the article.
    const write = await payload.update({ collection: "stories", id: story.game, data: { headline: "Bob's headline" } as never, req: await reqAs("bob"), overrideAccess: false }).then(() => "ok", () => "refused");
    expect(write).toBe("refused");
    // Nor live updates elsewhere.
    expect((await desk("bob", "off")).status).toBe(403);
    await remove("bob", "game", posted.body.id);
    await payload.update({ collection: "story-plans", id: plan.id, data: { livePublishers: [] }, overrideAccess: true });
  });
});

describe("what people see", () => {
  it("shows managers everything, participants only what is published, and strangers nothing", async () => {
    const managers = (await desk("alice", "game")).body;
    expect(managers.canManage).toBe(true);
    expect(managers.canPublish).toBe(false);
    expect(managers.updates.map((update: { state: string }) => update.state).sort()).toEqual(["draft", "published"]);
    const participant = (await desk("bob", "game")).body;
    expect(participant.canManage).toBe(false);
    expect(participant.updates.map((update: { state: string }) => update.state)).toEqual(["published"]);
    expect((await desk("stranger", "game")).status).toBe(403);
    expect(managers).toMatchObject({ status: "live", storyPublished: true });
  });
});

describe("publishing rules", () => {
  it("lets an editor publish a manager's draft; a manager cannot publish or touch what readers see", async () => {
    const draft = (await desk("alice", "game")).body.updates.find((update: { state: string }) => update.state === "draft");
    // Staff asking to publish stays a draft (and an update already public is not theirs to change).
    expect((await patch("alice", "game", draft.id, { state: "published" })).status).toBe(200);
    expect((await desk("alice", "game")).body.updates.find((update: { id: number }) => update.id === draft.id).state).toBe("draft");
    expect((await patch("alice", "game", draft.id, { text: "Touchdown, Lions! 7–0." })).status).toBe(200);
    expect((await patch("editor", "game", draft.id, { state: "published" })).status).toBe(200);
    const published = (await desk("alice", "game")).body.updates.find((update: { id: number }) => update.id === draft.id);
    expect(published).toMatchObject({ state: "published", text: "Touchdown, Lions! 7–0." });
    // It is public now: the manager can no longer edit or delete it.
    expect((await patch("alice", "game", draft.id, { text: "Changed" })).status).toBe(403);
    expect((await remove("alice", "game", draft.id)).status).toBe(403);
    expect((await remove("editor", "game", draft.id)).status).toBe(200);
  });

  it("lets a manager do anything while the story is not public", async () => {
    const created = await post("alice", "draft", { text: "Pregame notes" });
    expect(created.status).toBe(200);
    expect((await patch("alice", "draft", created.body.id, { text: "Pregame notes, revised" })).status).toBe(200);
    expect((await remove("alice", "draft", created.body.id)).status).toBe(200);
  });

  it("rejects an update that is not on the story in the address", async () => {
    const other = (await post("editor", "off", { text: "Elsewhere", state: "published" })).body.id;
    expect((await patch("editor", "game", other, { text: "x" })).status).toBe(404);
    expect((await remove("editor", "game", other)).status).toBe(404);
  });
});

describe("pinning", () => {
  it("replaces the previous pin", async () => {
    const a = (await post("editor", "game", { text: "Key point one", pinned: true, state: "published" })).body.id;
    const b = (await post("editor", "game", { text: "Key point two", state: "published" })).body.id;
    expect((await patch("editor", "game", b, { pinned: true })).status).toBe(200);
    const updates = (await desk("editor", "game")).body.updates;
    expect(updates.find((update: { id: number }) => update.id === a).pinned).toBe(false);
    expect(updates.find((update: { id: number }) => update.id === b).pinned).toBe(true);
    expect(updates.filter((update: { pinned: boolean }) => update.pinned)).toHaveLength(1);
  });
});

describe("the public feed", () => {
  it("is the published-only projection the Worker and static build both accept", async () => {
    await post("alice", "game", { text: "SENTINEL-DRAFT: do not publish" });
    await post("editor", "game", { text: "A <b>markup</b> & ampersand", state: "published" });
    const result = await feed("game");
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    const live = normalizeLiveCoverage(result.body);
    expect(live).not.toBeNull();
    expect(live!.status).toBe("live");
    expect(live!.updates.length).toBeGreaterThanOrEqual(3);
    const json = JSON.stringify(result.body);
    expect(json).not.toContain("SENTINEL-DRAFT");
    // Text is escaped HTML, never editor markup.
    expect(json).toContain("A &lt;b&gt;markup&lt;/b&gt; &amp; ampersand");
    expect(json).not.toContain("<b>markup");
    // No account details.
    expect(json).not.toContain("example.test");
    expect(live!.updates.every((update) => update.author === "")).toBe(true);
    expect(live!.updates.filter((update) => update.pinned)).toHaveLength(1);
    // Newest first.
    const dates = live!.updates.map((update) => update.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("is a 404 for a draft story, a story without coverage, a trashed story and anything else", async () => {
    expect((await feed("draft")).status).toBe(404);
    expect((await feed("off")).status).toBe(404);
    expect((await call("get", "/byline/live/:id", null, { routeParams: { id: "999999" } })).status).toBe(404);
    expect((await call("get", "/byline/live/:id", null, { routeParams: { id: "abc" } })).status).toBe(404);
    const trashed = (await payload.create({ collection: "stories", data: { headline: "Trashed", section: 1, contributors: [people.alice], _status: "published", liveCoverage: { state: "live" } } as never, overrideAccess: true })).id;
    await payload.update({ collection: "stories", id: trashed, data: { deletedAt: new Date().toISOString() }, overrideAccess: true });
    expect((await call("get", "/byline/live/:id", null, { routeParams: { id: String(trashed) } })).status).toBe(404);
  });

  it("keeps ended coverage and its updates", async () => {
    await payload.update({ collection: "stories", id: story.game, data: { liveCoverage: { state: "ended" } } as never, overrideAccess: true });
    const live = normalizeLiveCoverage((await feed("game")).body);
    expect(live!.status).toBe("ended");
    expect(live!.endedAt).not.toBe("");
    expect(live!.updates.length).toBeGreaterThanOrEqual(3);
  });

  it("a published update advances the public revision, a draft does not", async () => {
    const before = await readCurrentRevision(payload);
    await post("alice", "game", { text: "Another private draft" });
    expect(await readCurrentRevision(payload)).toBe(before);
    await post("editor", "game", { text: "Final score: 21–14", state: "published" });
    expect(await readCurrentRevision(payload)).toBeGreaterThan(before);
  });
});
