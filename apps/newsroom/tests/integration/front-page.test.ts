import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCurrentRevision } from "../../src/db/publication-state";
import { frontPageEndpoints } from "../../src/front-page/endpoints";
import { activateFrontPageTask } from "../../src/front-page/server";
import { collectPublicSnapshot } from "../../src/public/snapshot/collect";
import type { User } from "../../src/payload-types";

/**
 * The Front Page Desk against real PostgreSQL (docs/front-page.md): only
 * editors change the homepage, only published Stories can be pinned, pending
 * changes are private, Publish atomically activates and advances the public
 * revision, the snapshot carries only the active placements, and history is
 * never mutated.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const story: Record<string, number> = {};

async function account(key: string, role: User["role"]) {
  const user = await payload.create({ collection: "users", data: { email: `fp-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true } });
  accounts[key] = { ...user, collection: "users" } as User;
}
async function call(method: string, path: string, key: string, options: { data?: unknown; params?: Record<string, string | number> } = {}) {
  const endpoint = frontPageEndpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await createLocalReq({ user: accounts[key] }, payload);
  Object.assign(req, { routeParams: Object.fromEntries(Object.entries(options.params ?? {}).map(([k, v]) => [k, String(v)])), data: options.data ?? {}, searchParams: new URLSearchParams() });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}
const snapshot = async () => collectPublicSnapshot(payload, { revision: await readCurrentRevision(payload) });

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_front_page`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("staff", "staff");
  const news = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" } })).id;
  const person = (await payload.create({ collection: "people", data: { name: "Writer", slug: "fp-writer", status: "active" } })).id;
  for (const [key, minutes] of [["older", 30], ["newer", 10], ["newest", 1]] as const) {
    story[key] = (await payload.create({ collection: "stories", data: { headline: `Front page ${key}`, slug: `front-page-${key}`, section: news, contributors: [person], _status: "published", publishedAt: new Date(Date.now() - minutes * 60_000).toISOString() } as never, overrideAccess: true })).id;
  }
  story.draft = (await payload.create({ collection: "stories", draft: true, data: { headline: "Unpublished", section: news, contributors: [person] } as never, overrideAccess: true })).id;
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("who changes the homepage", () => {
  it("is editors only, and only published Stories can be pinned", async () => {
    expect((await call("get", "/byline/front-page", "staff")).status).toBe(403);
    expect((await call("put", "/byline/front-page/placements", "staff", { data: { slot: "lead.lead", storyId: story.older } })).status).toBe(403);
    expect((await call("put", "/byline/front-page/placements", "editor", { data: { slot: "lead.lead", storyId: story.draft } })).status).toBe(400);
    expect((await call("put", "/byline/front-page/placements", "editor", { data: { slot: "no.such.slot", storyId: story.older } })).status).toBe(400);
  });
});

describe("pending changes, publish and the snapshot", () => {
  it("keeps pending changes private until Publish, which activates atomically and advances the public revision", async () => {
    const before = await readCurrentRevision(payload);
    expect((await call("put", "/byline/front-page/placements", "editor", { data: { slot: "lead.lead", storyId: story.older } })).status).toBe(200);
    expect((await call("put", "/byline/front-page/placements", "editor", { data: { slot: "in-focus.story", storyId: story.newer } })).status).toBe(200);
    const desk = (await call("get", "/byline/front-page", "editor")).body;
    expect(desk.draft.placements).toEqual({ "lead.lead": story.older, "in-focus.story": story.newer });
    expect(desk.changes.sort()).toEqual(["in-focus.story", "lead.lead"]);
    expect(await readCurrentRevision(payload)).toBe(before);
    expect((await snapshot()).frontPage).toBeUndefined();

    const published = await call("post", "/byline/front-page/publish", "editor");
    expect(published.status).toBe(200);
    expect(published.body.summary).toBe("Changed Lead and In Focus");
    expect(await readCurrentRevision(payload)).toBeGreaterThan(before);
    const after = (await call("get", "/byline/front-page", "editor")).body;
    expect(after.draft).toBeNull();
    expect(after.active.placements).toEqual({ "lead.lead": story.older, "in-focus.story": story.newer });
    expect((await snapshot()).frontPage?.placements).toEqual({ "lead.lead": story.older, "in-focus.story": story.newer });
    const activity = await payload.find({ collection: "story-activity", where: { and: [{ story: { equals: story.older } }, { action: { equals: "homepage-featured" } }] } });
    expect(activity.totalDocs).toBe(1);
  });

  it("moves a Story rather than placing it twice, and returns a slot to automatic", async () => {
    await call("put", "/byline/front-page/placements", "editor", { data: { slot: "opinion.lead", storyId: story.older } });
    const desk = (await call("get", "/byline/front-page", "editor")).body;
    expect(desk.draft.placements).toEqual({ "opinion.lead": story.older, "in-focus.story": story.newer });
    await call("put", "/byline/front-page/placements", "editor", { data: { slot: "opinion.lead", storyId: null } });
    expect((await call("get", "/byline/front-page", "editor")).body.draft.placements).toEqual({ "in-focus.story": story.newer });
    expect((await call("post", "/byline/front-page/discard", "editor")).body.discarded).toBe(true);
  });

  it("refuses to activate a pin whose Story was unpublished, and the snapshot falls back to automatic", async () => {
    await call("put", "/byline/front-page/placements", "editor", { data: { slot: "brief.lead", storyId: story.newest } });
    await payload.update({ collection: "stories", id: story.newest, data: { _status: "draft" } as never, overrideAccess: true });
    const desk = (await call("get", "/byline/front-page", "editor")).body;
    expect(desk.issues).toEqual([{ slotId: "brief.lead", storyId: story.newest, reason: "story-unavailable" }]);
    expect((await call("post", "/byline/front-page/publish", "editor")).status).toBe(409);
    // The active lineup pins `newer` (still published): unaffected.
    await payload.update({ collection: "stories", id: story.newer, data: { _status: "draft" } as never, overrideAccess: true });
    const projected = await snapshot();
    expect(projected.frontPage?.placements).toEqual({ "lead.lead": story.older });
    await payload.update({ collection: "stories", id: story.newer, data: { _status: "published" } as never, overrideAccess: true });
    await payload.update({ collection: "stories", id: story.newest, data: { _status: "published" } as never, overrideAccess: true });
    await call("post", "/byline/front-page/discard", "editor");
  });
});

describe("scheduling and history", () => {
  it("activates a scheduled change by its job, never by the renderer's clock", async () => {
    await call("put", "/byline/front-page/placements", "editor", { data: { slot: "lead.lead", storyId: story.newest } });
    const at = new Date(Date.now() + 3_600_000);
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.BYLINE_NEWSROOM_TIMEZONE ?? "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at).replace(", ", "T");
    const scheduled = await call("post", "/byline/front-page/schedule", "editor", { data: { at: local } });
    expect(scheduled.status).toBe(200);
    const desk = (await call("get", "/byline/front-page", "editor")).body;
    expect(desk.scheduled.placements).toEqual({ "lead.lead": story.newest, "in-focus.story": story.newer });
    expect(desk.active.placements["lead.lead"]).toBe(story.older);
    const before = await readCurrentRevision(payload);
    const req = await createLocalReq({}, payload);
    await (activateFrontPageTask.handler as (args: unknown) => Promise<unknown>)({ input: { revisionId: desk.scheduled.id, at: scheduled.body.scheduledAt }, req });
    expect(await readCurrentRevision(payload)).toBeGreaterThan(before);
    expect((await call("get", "/byline/front-page", "editor")).body.active.placements["lead.lead"]).toBe(story.newest);
  });

  it("uses an old lineup as a new pending change without changing history", async () => {
    const desk = (await call("get", "/byline/front-page", "editor")).body;
    const archived = desk.history.find((row: { state: string }) => row.state === "archived");
    const original = await payload.findByID({ collection: "front-page-revisions", id: archived.id, depth: 0 });
    expect((await call("post", "/byline/front-page/history/:id/use", "editor", { params: { id: archived.id } })).status).toBe(200);
    const again = await payload.findByID({ collection: "front-page-revisions", id: archived.id, depth: 0 });
    expect(again).toEqual(original);
    expect((await call("get", "/byline/front-page", "editor")).body.draft.placements).toEqual(original.placements);
    await call("post", "/byline/front-page/discard", "editor");
  });
});

describe("from the Story", () => {
  it("features a Story through the same pending change", async () => {
    const before = (await call("get", "/byline/stories/:id/front-page", "editor", { params: { id: story.newer } })).body;
    expect(before.featured.map((slot: { id: string }) => slot.id)).toContain("lead.lead");
    expect((await call("post", "/byline/stories/:id/front-page", "editor", { params: { id: story.newer }, data: { slot: "lead.lead" } })).status).toBe(200);
    const after = (await call("get", "/byline/stories/:id/front-page", "editor", { params: { id: story.newer } })).body;
    expect(after.pending).toMatchObject({ slot: "lead.lead", label: "Lead" });
    expect((await call("get", "/byline/front-page", "editor")).body.draft.placements["lead.lead"]).toBe(story.newer);
    expect((await call("post", "/byline/stories/:id/front-page", "staff", { params: { id: story.newer }, data: { slot: "lead.lead" } })).status).toBe(403);
  });
});
