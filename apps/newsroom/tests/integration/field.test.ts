import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fieldEndpoints } from "../../src/field/endpoints";
import { reportingEndpoints } from "../../src/reporting/endpoints";
import type { User } from "../../src/payload-types";

/**
 * Field Mode against real PostgreSQL (docs/field-mode.md): the assignment
 * feed, a session's inherited context, the Story-level live grant (and that it
 * never escalates to Story publication), idempotent live posting from the
 * outbox, and photo capture provenance.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const ids: Record<string, number> = {};
const endpoints = [...fieldEndpoints, ...reportingEndpoints];

async function account(key: string, role: User["role"]) {
  people[key] = (await payload.create({ collection: "people", data: { name: `${key} Shooter`, slug: `field-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `field-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] } });
  accounts[key] = { ...user, collection: "users" } as User;
}
const reqAs = (key: string) => createLocalReq({ user: accounts[key] }, payload);
async function call(method: string, path: string, key: string, options: { data?: unknown; params?: Record<string, string | number>; query?: Record<string, string>; file?: PayloadRequest["file"] } = {}) {
  const endpoint = endpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await reqAs(key);
  Object.assign(req, { routeParams: Object.fromEntries(Object.entries(options.params ?? {}).map(([k, v]) => [k, String(v)])), data: options.data ?? {}, searchParams: new URLSearchParams(options.query ?? {}), file: options.file });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}

async function jpeg(name: string): Promise<NonNullable<PayloadRequest["file"]>> {
  const data = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#7b2336" } }).jpeg().withExif({ IFD0: { DateTime: "2026:11:08 19:30:00" } }).toBuffer();
  return { data, mimetype: "image/jpeg", name, size: data.length };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_field`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("reporter", "staff");
  await account("photographer", "staff");
  await account("stranger", "staff");
  const section = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "sports" } })).id;
  ids.game = (await payload.create({ collection: "stories", data: { headline: "Football vs. Saluda", section, contributors: [people.reporter], _status: "published" } as never, overrideAccess: true })).id;
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: ids.game } }, limit: 1, overrideAccess: true })).docs[0];
  await payload.update({ collection: "story-plans", id: plan.id, data: { liveCoverage: { mode: "live", state: "live", startedAt: new Date().toISOString() } } as never, overrideAccess: true, context: { bylineSystem: true } });
  const system = { overrideAccess: true as const, context: { bylineSystem: true } };
  ids.coach = (await payload.create({ collection: "sources", data: { story: ids.game, label: "Coach Smith", groundRules: "on-record" }, ...system } as never)).id;
  ids.interview = (await payload.create({ collection: "appointments", data: { story: ids.game, title: "Interview Coach Smith", kind: "interview", source: ids.coach, scheduleMode: "exact", startAt: new Date(Date.now() + 30 * 60_000).toISOString(), location: "Wildcat Stadium", assignees: [accounts.reporter.id] }, ...system } as never)).id;
  ids.photos = (await payload.create({ collection: "production-assignments", data: { story: ids.game, title: "Game photos", type: "photo", assignees: [accounts.photographer.id], status: "assigned" }, ...system } as never)).id;
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("what am I covering?", () => {
  it("lists the reporter's appointment as Now, with the live story", async () => {
    const feed = (await call("get", "/byline/field", "reporter")).body;
    expect(feed.now).toEqual([expect.objectContaining({ kind: "appointment", storyId: ids.game, title: "Interview Coach Smith", live: true, location: "Wildcat Stadium", appointmentId: ids.interview })]);
  });

  it("lists the photographer's assignment, and nothing for a stranger", async () => {
    const feed = (await call("get", "/byline/field", "photographer")).body;
    expect([...feed.now, ...feed.today, ...feed.upcoming].some((item: { kind: string; assignmentId: number }) => item.kind === "production" && item.assignmentId === ids.photos)).toBe(true);
    const nothing = (await call("get", "/byline/field", "stranger")).body;
    expect([...nothing.now, ...nothing.today, ...nothing.upcoming]).toEqual([]);
    expect((await call("get", "/byline/field/stories/:id", "stranger", { params: { id: ids.game } })).status).toBe(403);
  });

  it("opens a session that already knows the appointment and its source", async () => {
    const session = (await call("get", "/byline/field/stories/:id", "reporter", { params: { id: ids.game }, query: { appointment: String(ids.interview) } })).body;
    expect(session).toMatchObject({ story: { id: ids.game, live: true }, canPostLive: false, appointment: { id: ids.interview, sourceId: ids.coach, source: "Coach Smith" } });
  });
});

describe("live from the field", () => {
  it("sends to the live desk without the grant, idempotently", async () => {
    const first = await call("post", "/byline/field/stories/:id/live", "photographer", { params: { id: ids.game }, data: { text: "Halftime: 14-7", clientKey: "field-live-0001" } });
    expect(first.body).toMatchObject({ status: "sent-to-desk", duplicate: false });
    const retried = await call("post", "/byline/field/stories/:id/live", "photographer", { params: { id: ids.game }, data: { text: "Halftime: 14-7", clientKey: "field-live-0001" } });
    expect(retried.body).toMatchObject({ id: first.body.id, status: "sent-to-desk", duplicate: true });
    expect((await payload.count({ collection: "live-updates", where: { clientKey: { equals: "field-live-0001" } } })).totalDocs).toBe(1);
  });

  it("posts live with the Story-level grant, and the grant never publishes the article", async () => {
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: ids.game } }, limit: 1 })).docs[0];
    // Only editors control the grant.
    await expect(payload.update({ collection: "story-plans", id: plan.id, data: { livePublishers: [accounts.photographer.id] }, req: await reqAs("reporter"), overrideAccess: false })).resolves.toMatchObject({ livePublishers: [] });
    await payload.update({ collection: "story-plans", id: plan.id, data: { livePublishers: [accounts.photographer.id] }, req: await reqAs("editor"), overrideAccess: false });
    const posted = await call("post", "/byline/field/stories/:id/live", "photographer", { params: { id: ids.game }, data: { text: "TOUCHDOWN — Wildcats", clientKey: "field-live-0002", delivery: "publish" } });
    expect(posted.body.status).toBe("posted");
    const refused = await payload.update({ collection: "stories", id: ids.game, data: { headline: "Changed by the photographer" } as never, req: await reqAs("photographer"), overrideAccess: false }).then(() => "changed", () => "refused");
    expect(refused).toBe("refused");
    const unpublish = await payload.update({ collection: "stories", id: ids.game, data: { _status: "draft" } as never, req: await reqAs("photographer"), overrideAccess: false }).then(() => "changed", () => "refused");
    expect(unpublish).toBe("refused");
    const activity = await payload.find({ collection: "story-activity", where: { and: [{ story: { equals: ids.game } }, { action: { in: ["live-published-from-field", "live-submitted"] } }] } });
    expect(activity.docs.map((row) => row.action).sort()).toEqual(["live-published-from-field", "live-submitted"]);
  });
});

describe("photos from the field", () => {
  it("goes to Media with the Story, the one open assignment, the EXIF time, a hash and the photographer as creator", async () => {
    const result = await call("post", "/byline/stories/:id/reporting/photos", "photographer", { params: { id: ids.game }, data: { clientKey: "field-photo-0001" }, file: await jpeg("IMG_2841.jpg") });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ kind: "media", duplicate: false, assignment: { id: ids.photos } });
    const media = await payload.findByID({ collection: "media", id: result.body.id, depth: 0 });
    expect(media.capture).toMatchObject({ story: ids.game, assignment: ids.photos, clientKey: "field-photo-0001" });
    expect(media.capture?.originalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(media.creator).toBe("photographer Shooter");
    expect(media.uploadedBy).toBe(accounts.photographer.id);
    // 7:30 PM camera time, read in the newsroom's zone.
    expect(new Date(media.capturedAt!).toISOString()).toBe(new Date("2026-11-09T00:30:00.000Z").toISOString());
    const assignment = await payload.findByID({ collection: "production-assignments", id: ids.photos, depth: 0 });
    expect(assignment.media).toEqual([result.body.id]);
    expect(assignment.status).toBe("uploaded");
    // Uploading never clears rights: nothing is marked as licensed or cleared.
    expect(media.license ?? null).toBeNull();
  });

  it("returns the first photo for a retried upload, and attaches it to a live update", async () => {
    const again = await call("post", "/byline/stories/:id/reporting/photos", "photographer", { params: { id: ids.game }, data: { clientKey: "field-photo-0001" }, file: await jpeg("IMG_2841.jpg") });
    expect(again.body.duplicate).toBe(true);
    const live = await call("post", "/byline/field/stories/:id/live", "photographer", { params: { id: ids.game }, data: { text: "Sideline", photoId: again.body.id, clientKey: "field-live-0003" } });
    expect(live.status).toBe(200);
    const update = await payload.findByID({ collection: "live-updates", id: live.body.id, depth: 0 });
    expect(update.photo).toBe(again.body.id);
    // A photo from somewhere else is refused.
    const other = (await payload.create({ collection: "media", data: {}, file: await jpeg("elsewhere.jpg"), overrideAccess: true })).id;
    expect((await call("post", "/byline/field/stories/:id/live", "photographer", { params: { id: ids.game }, data: { text: "x", photoId: other } })).status).toBe(400);
  });
});
