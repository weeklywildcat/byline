import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import { scheduleResponse } from "../../src/newsroom/schedule";
import { homeBootstrap, screenContext } from "../../src/newsroom/screen-models";
import type { User } from "../../src/payload-types";

/**
 * Collections: the newsroom's reporting projects, through /api/byline/collections
 * as each account would call it. Permissions (access/collection-context.ts),
 * story privacy, Collection tasks in the canonical task engine, shared
 * interviews and resources, and their Calendar and Home read models.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const story: Record<string, number> = {};
const TZ = "America/New_York";
const NOW = new Date("2026-11-09T15:00:00Z");

async function account(key: string, role: User["role"]) {
  people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `collections-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `collections-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] } });
  accounts[key] = { ...user, collection: "users" } as User;
}

const reqAs = (key: string, extra: Partial<PayloadRequest> = {}) => createLocalReq({ user: accounts[key], req: extra }, payload);
const ctxAs = async (key: string) => screenContext(await reqAs(key), TZ, NOW);

type Call = { status: number; body: any };
async function call(method: string, path: string, key: string, options: { params?: Record<string, string | number>; data?: unknown; query?: string; file?: PayloadRequest["file"] } = {}): Promise<Call> {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path);
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const req = await reqAs(key);
  const routeParams = Object.fromEntries(Object.entries(options.params ?? {}).map(([name, value]) => [name, String(value)]));
  Object.assign(req, { routeParams, data: options.data, searchParams: new URLSearchParams(options.query ?? ""), file: options.file });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

const list = (key: string, query = "") => call("get", "/byline/collections", key, { query });
const detail = (key: string, id: number) => call("get", "/byline/collections/:id", key, { params: { id } });
const patch = (key: string, id: number, data: unknown) => call("patch", "/byline/collections/:id", key, { params: { id }, data });

async function draft(key: string, headline: string) {
  return (await payload.create({ collection: "stories", draft: true, data: { headline }, req: await reqAs(key), overrideAccess: false })).id;
}
async function published(headline: string) {
  return (await payload.create({ collection: "stories", data: { headline, _status: "published" } as never, req: await reqAs("editor"), overrideAccess: false })).id;
}

let band: number;
let election: number;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_collections`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("root", "administrator");
  await account("editor", "editor");
  await account("lead", "staff");
  await account("member", "staff");
  await account("outsider", "staff");
  await account("writer", "staff");

  story.preview = await published("Band finals preview");
  story.results = await published("Band finals results");
  story.leadDraft = await draft("lead", "Drum major profile");
  story.secret = await draft("writer", "Unannounced director change");
  story.elsewhere = await draft("lead", "Unrelated feature");
  for (let index = 0; index < 8; index += 1) story[`extra${index}`] = await published(`Section ${index} rehearsal`);

  const created = await call("post", "/byline/collections", "editor", { data: { name: "Marching Band State", type: "event" } });
  expect(created.status).toBe(200);
  band = created.body.id;
  // The editor created it and leads it until the team is set.
  expect(created.body).toMatchObject({ status: "planning", lead: { id: accounts.editor.id }, canEdit: true });
  expect((await patch("editor", band, { leadId: accounts.lead.id })).status).toBe(200);
  expect((await call("post", "/byline/collections/:id/members", "editor", { params: { id: band }, data: { userId: accounts.member.id } })).status).toBe(200);
  // The editor stays on the team after handing the lead over.
  expect((await call("delete", "/byline/collections/:id/members/:userId", "lead", { params: { id: band, userId: accounts.editor.id } })).status).toBe(200);
  for (const key of ["preview", "results", "leadDraft"]) expect((await call("post", "/byline/collections/:id/stories", "lead", { params: { id: band }, data: { storyId: story[key] } })).status).toBe(200);
  for (let index = 0; index < 8; index += 1) await call("post", "/byline/collections/:id/stories", "member", { params: { id: band }, data: { storyId: story[`extra${index}`] } });
  // The writer's unpublished story is added by an editor (who can read it); others must never see it through the Collection.
  expect((await call("post", "/byline/collections/:id/stories", "editor", { params: { id: band }, data: { storyId: story.secret } })).status).toBe(200);

  election = (await call("post", "/byline/collections", "editor", { data: { name: "Election 2026", type: "ongoing" } })).body.id;
}, 300_000);

afterAll(async () => {
  await payload?.destroy();
});

describe("Collections: who may do what", () => {
  it("every newsroom account browses Collections; only editors create", async () => {
    const browsed = await list("outsider", "view=all");
    expect(browsed.status).toBe(200);
    expect(browsed.body.collections.map((c: { name: string }) => c.name).sort()).toEqual(["Election 2026", "Marching Band State"]);
    expect(browsed.body.canCreate).toBe(false);
    expect((await detail("outsider", band)).status).toBe(200);
    expect((await call("post", "/byline/collections", "lead", { data: { name: "Mine", type: "other" } })).status).toBe(403);
    expect((await call("post", "/byline/collections", "editor", { data: { name: "No type" } })).status).toBe(400);
  });

  it("the lead and team edit the Collection's work; nobody else does", async () => {
    expect((await patch("lead", band, { brief: "Cover the state finals from every section." })).status).toBe(200);
    const member = await patch("member", band, { brief: "Cover the state finals.\nAngles: seniors, travel.", expectedBrief: "Cover the state finals from every section." });
    expect(member.status).toBe(200);
    expect(member.body.brief).toContain("Angles");
    expect((await patch("outsider", band, { brief: "Hijacked" })).status).toBe(403);
    expect((await call("post", "/byline/collections/:id/stories", "outsider", { params: { id: band }, data: { storyId: story.preview } })).status).toBe(403);
  });

  it("a stale brief is a conflict, never an overwrite", async () => {
    const stale = await patch("lead", band, { brief: "Older draft", expectedBrief: "Cover the state finals from every section." });
    expect(stale.status).toBe(409);
    expect((await detail("lead", band)).body.collection.brief).toContain("Angles");
  });

  it("only the lead or an editor manages the team", async () => {
    expect((await patch("member", band, { leadId: accounts.member.id })).status).toBe(403);
    expect((await call("post", "/byline/collections/:id/members", "member", { params: { id: band }, data: { userId: accounts.outsider.id } })).status).toBe(403);
    expect((await call("delete", "/byline/collections/:id/members/:userId", "member", { params: { id: band, userId: accounts.member.id } })).status).toBe(403);
    expect((await call("post", "/byline/collections/:id/members", "lead", { params: { id: band }, data: { userId: accounts.outsider.id } })).status).toBe(200);
    expect((await call("delete", "/byline/collections/:id/members/:userId", "editor", { params: { id: band, userId: accounts.outsider.id } })).status).toBe(200);
    const team = (await detail("member", band)).body.collection;
    expect(team.lead.id).toBe(accounts.lead.id);
    expect(team.members.map((p: { id: number }) => p.id)).toEqual([accounts.member.id]);
    expect(team).toMatchObject({ canEdit: true, canManageTeam: false, canPublish: false, canArchive: false });
    // A raw member write cannot rewrite the team either: field access drops it.
    await payload.update({ collection: "collections", id: band, data: { lead: accounts.member.id, members: [] }, req: await reqAs("member"), overrideAccess: false });
    expect((await payload.findByID({ collection: "collections", id: band, depth: 0 })).lead).toBe(accounts.lead.id);
  });

  it("only editors present a Collection publicly or archive it; only administrators delete", async () => {
    const presentation = { publicEnabled: true, publicFormat: "series", publicTitle: "State finals", publicSlug: "state-finals", publicDescription: "", publicOverview: "", artworkAttachmentId: 0, featuredStoryId: 0, storyOrder: [] };
    expect((await patch("lead", band, { publicPresentation: presentation })).status).toBe(403);
    expect((await patch("lead", band, { status: "archived" })).status).toBe(403);
    expect((await patch("lead", band, { status: "active" })).status).toBe(200);
    const scratch = (await call("post", "/byline/collections", "editor", { data: { name: "Scratch", type: "other" } })).body.id;
    expect((await patch("editor", scratch, { status: "archived" })).body.archived).toBe(true);
    expect((await list("outsider", "view=archived")).body.collections.map((c: { id: number }) => c.id)).toEqual([scratch]);
    expect((await list("outsider")).body.collections.map((c: { id: number }) => c.id)).not.toContain(scratch);
    expect((await call("delete", "/byline/collections/:id", "editor", { params: { id: scratch } })).status).toBe(403);
    expect((await call("delete", "/byline/collections/:id", "root", { params: { id: scratch } })).status).toBe(204);
  });

  it("Mine is the reader's own team, never their story assignments", async () => {
    expect((await list("member", "view=mine")).body.collections.map((c: { id: number }) => c.id)).toEqual([band]);
    expect((await list("writer", "view=mine")).body.collections).toEqual([]);
    expect((await list("outsider", `person=${accounts.lead.id}&view=all`)).body.collections.map((c: { id: number }) => c.id)).toEqual([band]);
    expect((await list("outsider", "search=election&view=all")).body.collections.map((c: { id: number }) => c.id)).toEqual([election]);
    expect((await list("outsider", "view=all&sort=name&limit=1")).body).toMatchObject({ total: 2, pages: 2 });
  });
});

describe("Story membership", () => {
  it("membership never leaks a story the reader can't see", async () => {
    const outsider = (await detail("outsider", band)).body;
    expect(outsider.collection.storyIds).not.toContain(story.secret);
    expect(outsider.stories.map((s: { id: number }) => s.id)).not.toContain(story.secret);
    expect(JSON.stringify(outsider)).not.toContain("Unannounced director change");
    // Not even the lead's unpublished draft reaches someone outside it.
    expect(outsider.stories.map((s: { id: number }) => s.id)).not.toContain(story.leadDraft);
    const editor = (await detail("editor", band)).body;
    expect(editor.stories.map((s: { id: number }) => s.id)).toContain(story.secret);
    expect(editor.collection.storyCount).toBe(12);
    expect((await call("post", "/byline/collections/:id/stories", "lead", { params: { id: election }, data: { storyId: story.preview } })).status).toBe(403);
  });

  it("a member can't add a story they can't read", async () => {
    const other = await draft("writer", "Writer's other draft");
    expect((await call("post", "/byline/collections/:id/stories", "member", { params: { id: band }, data: { storyId: other } })).status).toBe(404);
  });

  it("a story can be in several Collections, and being on a team never grants Story access", async () => {
    expect((await call("post", "/byline/collections/:id/stories", "editor", { params: { id: election }, data: { storyId: story.preview } })).status).toBe(200);
    const context = await call("get", "/byline/stories/:id/collections", "outsider", { params: { id: story.preview } });
    expect(context.body.collections.map((c: { id: number }) => c.id).sort()).toEqual([band, election].sort());
    // The member coordinates the Collection but is not on the lead's story.
    expect((await call("post", "/byline/stories/:id/workflow", "member", { params: { id: story.leadDraft }, data: { status: "writing" } })).status).toBe(403);
    const memberRow = (await detail("member", band)).body.stories.find((s: { id: number }) => s.id === story.preview);
    expect(memberRow.canEditPlanning).toBe(false);
    expect((await call("get", "/byline/stories/:id/collections", "member", { params: { id: story.secret } })).status).toBe(403);
  });

  it("the public lead and order name only member stories, and follow a story out", async () => {
    const base = { publicEnabled: true, publicFormat: "series", publicTitle: "State finals", publicSlug: "state-finals", publicDescription: "The road to state.", publicOverview: "First.\n\nSecond.", artworkAttachmentId: 0 };
    expect((await patch("editor", band, { publicPresentation: { ...base, featuredStoryId: story.elsewhere, storyOrder: [] } })).status).toBe(400);
    expect((await patch("editor", band, { publicPresentation: { ...base, featuredStoryId: 0, storyOrder: [story.results, story.elsewhere] } })).status).toBe(400);
    const saved = await patch("editor", band, { publicPresentation: { ...base, featuredStoryId: story.results, storyOrder: [story.results, story.preview, story.leadDraft] } });
    expect(saved.status).toBe(200);
    expect(saved.body.publicPresentation).toMatchObject({ featuredStoryId: story.results, storyOrder: [story.results, story.preview, story.leadDraft] });
    expect((await call("delete", "/byline/collections/:id/stories/:storyId", "member", { params: { id: band, storyId: story.results } })).status).toBe(200);
    const after = (await detail("editor", band)).body.collection.publicPresentation;
    expect(after.featuredStoryId).toBe(0);
    expect(after.storyOrder).toEqual([story.preview, story.leadDraft]);
    await call("post", "/byline/collections/:id/stories", "member", { params: { id: band }, data: { storyId: story.results } });
  });

  it("public slugs are unique and plain", async () => {
    const taken = await patch("editor", election, { publicPresentation: { publicEnabled: true, publicFormat: "coverage", publicTitle: "Election", publicSlug: "state-finals", publicDescription: "", publicOverview: "", artworkAttachmentId: 0, featuredStoryId: 0, storyOrder: [] } });
    expect(taken.status).toBe(409);
    const enabled = await patch("editor", election, { publicPresentation: { publicEnabled: true, publicFormat: "coverage", publicTitle: "", publicSlug: "", publicDescription: "", publicOverview: "", artworkAttachmentId: 0, featuredStoryId: 0, storyOrder: [] } });
    expect(enabled.status).toBe(400);
  });
});

describe("Collection tasks in the canonical task engine", () => {
  let collectionTask: number;
  let assigned: number;
  it("leaves Story-only tasks exactly as they were", async () => {
    const created = await call("post", "/byline/tasks", "writer", { data: { title: "Call the director", storyId: story.secret, priority: "normal" } });
    expect(created.status).toBe(200);
    expect(created.body.tasks[0]).toMatchObject({ storyId: story.secret, collectionId: null });
    expect((await call("post", "/byline/tasks", "writer", { data: { title: "Nothing", priority: "normal" } })).status).toBe(400);
  });

  it("a Collection's team adds Collection-only work; others can't", async () => {
    const created = await call("post", "/byline/tasks", "member", { data: { title: "Book the bus", collectionId: band, priority: "high", dueAt: "2026-11-12T09:00" } });
    expect(created.status).toBe(200);
    collectionTask = created.body.tasks[0].id;
    expect(created.body.tasks[0]).toMatchObject({ storyId: null, collectionId: band });
    expect((await call("post", "/byline/tasks", "outsider", { data: { title: "Nope", collectionId: band, priority: "normal" } })).status).toBe(403);
  });

  it("a story task within a Collection needs the story to be a member", async () => {
    expect((await call("post", "/byline/tasks", "lead", { data: { title: "Quote the drum major", storyId: story.leadDraft, collectionId: band, priority: "normal" } })).status).toBe(200);
    expect((await call("post", "/byline/tasks", "lead", { data: { title: "Wrong Collection", storyId: story.elsewhere, collectionId: band, priority: "normal" } })).status).toBe(400);
  });

  it("an unrelated reader sees a Collection task only when it is theirs", async () => {
    expect((await detail("outsider", band)).body.tasks).toEqual([]);
    assigned = (await call("post", "/byline/tasks", "lead", { data: { title: "Photograph the drumline", collectionId: band, assigneeId: accounts.outsider.id, priority: "normal", dueAt: "2026-11-13T15:00" } })).body.tasks[0].id;
    expect((await detail("outsider", band)).body.tasks.map((t: { id: number }) => t.id)).toEqual([assigned]);
    expect((await detail("member", band)).body.tasks.map((t: { id: number }) => t.id)).toEqual(expect.arrayContaining([collectionTask, assigned]));
    // The assignee completes their own work.
    expect((await call("patch", "/byline/tasks/:id", "outsider", { params: { id: assigned }, data: { state: "completed" } })).status).toBe(200);
    expect((await call("patch", "/byline/tasks/:id", "outsider", { params: { id: assigned }, data: { state: "open" } })).status).toBe(200);
    expect([403, 404]).toContain((await call("patch", "/byline/tasks/:id", "outsider", { params: { id: collectionTask }, data: { state: "completed" } })).status);
  });

  it("assigned Collection work is in My Work and its deadline on the Calendar", async () => {
    const home = await homeBootstrap(await ctxAs("outsider"));
    expect(home.tasks.find((t) => t.id === assigned)).toMatchObject({ collectionId: band, storyId: null });
    const schedule = await scheduleResponse(await ctxAs("member"), { from: "2026-11-09", to: "2026-11-20", includeTasks: true, collectionId: null });
    expect(schedule.taskDeadlines.find((t) => t.id === collectionTask)).toMatchObject({ collectionId: band, storyId: null, storyTitle: "Marching Band State" });
    const scoped = await scheduleResponse(await ctxAs("member"), { from: "2026-11-09", to: "2026-11-20", includeTasks: true, collectionId: election });
    expect(scoped.taskDeadlines.find((t) => t.id === collectionTask)).toBeUndefined();
  });
});

describe("Shared interviews", () => {
  let exact: number;
  let window: number;
  let unscheduled: number;
  it("are unscheduled, a target window, or exact, never a made-up time", async () => {
    const save = (data: unknown) => call("post", "/byline/collections/:id/interviews", "member", { params: { id: band }, data });
    unscheduled = (await save({ interviewee: "Band director" })).body.id;
    const w = await save({ interviewee: "Section leader", scheduleMode: "window", windowStart: "2026-11-15", windowEnd: "2026-11-18" });
    window = w.body.id;
    expect(w.body).toMatchObject({ scheduleMode: "window", windowStart: "2026-11-15", scheduledAt: "" });
    // The member can't see the lead's draft, so can't link it; the lead can.
    expect((await save({ interviewee: "Drum major", storyIds: [story.leadDraft] })).status).toBe(400);
    const e = await call("post", "/byline/collections/:id/interviews", "lead", { params: { id: band }, data: { interviewee: "Drum major", status: "scheduled", scheduleMode: "exact", scheduledAt: "2026-11-12T16:30", location: "Band room", interviewerIds: [accounts.member.id, accounts.outsider.id], storyIds: [story.preview, story.leadDraft], privateContact: "555-0100, call after 4" } });
    expect(e.status).toBe(200);
    exact = e.body.id;
    expect(e.body.scheduledAt).toBe("2026-11-12T21:30:00.000Z");
    expect((await save({ interviewee: "Cancelled one", status: "cancelled" })).status).toBe(200);
    expect((await save({ interviewee: "Done one", status: "completed" })).body.completedAt).not.toBe("");
    expect((await save({ interviewee: "Broken", scheduleMode: "window" })).status).toBe(400);
  });

  it("link only the Collection's stories, and keep links the editor can't see", async () => {
    const outside = await call("patch", "/byline/collections/:id/interviews/:interviewId", "member", { params: { id: band, interviewId: exact }, data: { storyIds: [story.elsewhere] } });
    expect(outside.status).toBe(400);
    const editorLink = await call("patch", "/byline/collections/:id/interviews/:interviewId", "editor", { params: { id: band, interviewId: exact }, data: { storyIds: [story.preview, story.leadDraft, story.secret] } });
    expect(editorLink.status).toBe(200);
    // The member can't see the writer's draft; saving their view keeps its link.
    const memberView = (await detail("member", band)).body.interviews.find((i: { id: number }) => i.id === exact);
    expect(memberView.storyIds).not.toContain(story.secret);
    expect((await call("patch", "/byline/collections/:id/interviews/:interviewId", "member", { params: { id: band, interviewId: exact }, data: { storyIds: [story.preview], expectedUpdatedAt: memberView.updatedAt } })).status).toBe(200);
    const stored = (await payload.findByID({ collection: "collection-interviews", id: exact, depth: 0 })).stories;
    expect(stored).toContain(story.secret);
    expect(stored).toContain(story.leadDraft);
  });

  it("a stale interview edit is a conflict", async () => {
    const current = (await detail("member", band)).body.interviews.find((i: { id: number }) => i.id === exact);
    expect((await call("patch", "/byline/collections/:id/interviews/:interviewId", "lead", { params: { id: band, interviewId: exact }, data: { notes: "First", expectedUpdatedAt: current.updatedAt } })).status).toBe(200);
    expect((await call("patch", "/byline/collections/:id/interviews/:interviewId", "member", { params: { id: band, interviewId: exact }, data: { notes: "Second", expectedUpdatedAt: current.updatedAt } })).status).toBe(409);
    expect((await call("patch", "/byline/collections/:id/interviews/:interviewId", "outsider", { params: { id: band, interviewId: exact }, data: { notes: "Third" } })).status).toBe(403);
  });

  it("private source details stay with the team and editors", async () => {
    const member = (await detail("member", band)).body.interviews.find((i: { id: number }) => i.id === exact);
    expect(member.privateContact).toBe("555-0100, call after 4");
    const outsiderDetail = (await detail("outsider", band)).body;
    expect(JSON.stringify(outsiderDetail)).not.toContain("555-0100");
    expect(outsiderDetail.interviews.find((i: { id: number }) => i.id === exact)).not.toHaveProperty("privateContact");
    const raw = await payload.findByID({ collection: "collection-interviews", id: exact, req: await reqAs("outsider"), overrideAccess: false });
    expect(raw.privateContact).toBeUndefined();
    // Never in Story Peek, the Calendar or Home, even for the team.
    expect(JSON.stringify((await call("get", "/byline/stories/:id/collections", "member", { params: { id: story.preview } })).body)).not.toContain("555-0100");
    expect(JSON.stringify(await scheduleResponse(await ctxAs("member"), { from: "2026-11-09", to: "2026-11-20", includeTasks: true, collectionId: band }))).not.toContain("555-0100");
    expect(JSON.stringify(await homeBootstrap(await ctxAs("member")))).not.toContain("555-0100");
  });

  it("an exact interview is a Calendar event; a window or unscheduled one waits in Needs scheduling", async () => {
    const schedule = await scheduleResponse(await ctxAs("outsider"), { from: "2026-11-09", to: "2026-11-20", includeTasks: false, collectionId: null });
    const event = schedule.appointments.find((a) => a.interviewId === exact)!;
    expect(event).toMatchObject({ collectionId: band, storyId: 0, storyTitle: "Marching Band State", kind: "interview", status: "confirmed", startAt: "2026-11-12T21:30:00.000Z" });
    expect(schedule.needsScheduling.map((a) => a.interviewId).sort()).toEqual([unscheduled, window].sort());
    expect(JSON.stringify(schedule)).not.toContain("Cancelled one");
    expect(JSON.stringify(schedule)).not.toContain("Done one");
    const elsewhere = await scheduleResponse(await ctxAs("outsider"), { from: "2026-11-09", to: "2026-11-20", includeTasks: false, collectionId: election });
    expect(elsewhere.appointments.some((a) => a.interviewId === exact)).toBe(false);
  });

  it("an interviewer sees the interview on Home, linked to its Collection", async () => {
    const home = await homeBootstrap(await ctxAs("outsider"));
    expect(home.appointments.find((a) => a.interviewId === exact)).toMatchObject({ collectionId: band, title: "Drum major" });
  });
});

describe("Shared resources", () => {
  let link: number;
  let file: number;
  it("are web links or Media files, never copies", async () => {
    const created = await call("post", "/byline/collections/:id/resources", "member", { params: { id: band }, data: { label: "Bus schedule", url: "https://docs.google.com/spreadsheets/d/abc/edit", kind: "schedule" } });
    expect(created.status).toBe(200);
    link = created.body.id;
    expect(created.body).toMatchObject({ kind: "Schedule", collectionCount: 1 });
    const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#456" } }).jpeg().toBuffer();
    const upload = await call("post", "/byline/media/upload", "member", { data: {}, file: { data: photo, mimetype: "image/jpeg", name: "warmup.jpg", size: photo.length } });
    expect(upload.status).toBe(200);
    const media = await call("post", "/byline/collections/:id/resources", "member", { params: { id: band }, data: { label: "Warm-up photo", kind: "recording", attachmentId: upload.body.id } });
    expect(media.status).toBe(200);
    file = media.body.id;
    expect(media.body.attachmentId).toBe(upload.body.id);
    expect((await call("post", "/byline/collections/:id/resources", "member", { params: { id: band }, data: { label: "Nothing" } })).status).toBe(400);
    expect((await call("post", "/byline/collections/:id/resources", "outsider", { params: { id: band }, data: { label: "Mine", url: "https://example.com" } })).status).toBe(403);
    // Media still refuses to delete a file a resource links.
    expect((await call("delete", "/byline/media/:id", "editor", { params: { id: upload.body.id } })).status).toBe(409);
  });

  it("link only to the Collection's stories", async () => {
    expect((await call("put", "/byline/collections/:id/resources/:resourceId/stories", "member", { params: { id: band, resourceId: link }, data: { storyIds: [story.elsewhere] } })).status).toBe(400);
    expect((await call("put", "/byline/collections/:id/resources/:resourceId/stories", "member", { params: { id: band, resourceId: link }, data: { storyIds: [story.preview] } })).status).toBe(200);
    expect((await detail("member", band)).body.resources.find((r: { id: number }) => r.id === link).storyIds).toEqual([story.preview]);
  });

  it("are reused by another Collection, and removing one there leaves it here", async () => {
    expect((await call("post", "/byline/collections/:id/resources", "editor", { params: { id: election }, data: { resourceId: link } })).status).toBe(200);
    expect((await detail("member", band)).body.resources.find((r: { id: number }) => r.id === link).collectionCount).toBe(2);
    expect((await call("delete", "/byline/collections/:id/resources/:resourceId", "editor", { params: { id: election, resourceId: link } })).status).toBe(200);
    expect((await detail("member", band)).body.resources.map((r: { id: number }) => r.id)).toContain(link);
    expect((await detail("editor", election)).body.resources).toEqual([]);
  });

  it("are deleted only on request, by an editor, once nothing uses them", async () => {
    expect((await call("delete", "/byline/collection-resources/:id", "editor", { params: { id: file } })).status).toBe(409);
    expect((await call("delete", "/byline/collections/:id/resources/:resourceId", "member", { params: { id: band, resourceId: file } })).status).toBe(200);
    expect((await call("delete", "/byline/collection-resources/:id", "member", { params: { id: file } })).status).toBe(403);
    expect((await call("delete", "/byline/collection-resources/:id", "editor", { params: { id: file } })).status).toBe(204);
  });
});

describe("Public coverage: a projection of public Collections", () => {
  it("is only public Collections, with only published stories, in public reading order", async () => {
    const { publicCoverages } = await import("../../src/newsroom/public-coverage");
    const photo = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#135" } }).jpeg().toBuffer();
    const art = await call("post", "/byline/media/upload", "editor", { data: {}, file: { data: photo, mimetype: "image/jpeg", name: "finals-art.jpg", size: photo.length } });
    await payload.update({ collection: "media", id: art.body.id, data: { alt: "The band at finals" }, overrideAccess: true });
    const saved = await patch("editor", band, {
      publicPresentation: {
        publicEnabled: true,
        publicFormat: "series",
        publicTitle: "  Road to   State ",
        publicSlug: "Road to State!",
        publicDescription: "Six weeks with the band.",
        publicOverview: "The band has practiced since July.\r\n\r\n\r\nFollow every step <b>to state</b>.",
        artworkAttachmentId: art.body.id,
        featuredStoryId: story.results,
        storyOrder: [story.results, story.extra0, story.leadDraft, story.preview]
      }
    });
    expect(saved.status).toBe(200);
    const coverages = await publicCoverages(payload);
    expect(coverages.map((c) => c.id)).toEqual([band]);
    const [coverage] = coverages;
    expect(coverage).toMatchObject({
      slug: "road-to-state",
      title: "Road to State",
      format: "series",
      description: "Six weeks with the band.",
      status: "active",
      artwork: { id: art.body.id, alt: "The band at finals" }
    });
    // Plain text, never HTML: the angle brackets are the text, and paragraphs are what Astro renders as <p>.
    expect(coverage.overviewParagraphs).toEqual(["The band has practiced since July.", "Follow every step <b>to state</b>."]);
    // Unpublished stories (the lead's draft, the writer's) keep their place internally but never appear.
    const order = coverage.stories.map((s) => s.id);
    expect(order.slice(0, 3)).toEqual([story.results, story.extra0, story.preview]);
    expect(order).not.toContain(story.leadDraft);
    expect(order).not.toContain(story.secret);
    expect(order).toHaveLength(10);
    expect(coverage.stories.map((s) => s.part)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Nothing private leaves: no brief, team, interviews, tasks, resources or contacts.
    const text = JSON.stringify(coverages);
    for (const secret of ["Angles", "555-0100", "Bus schedule", "Book the bus", "Drum major", "collections-lead"]) expect(text).not.toContain(secret);
  });

  it("maps the newsroom status to the public one, and a newsroom-only Collection has no public face", async () => {
    const { publicCoverages } = await import("../../src/newsroom/public-coverage");
    const expected = { planning: "upcoming", active: "active", "wrapping-up": "past", archived: "archived" } as const;
    for (const [status, publicStatus] of Object.entries(expected)) {
      await payload.update({ collection: "collections", id: band, data: { status: status as never }, req: await reqAs("editor"), overrideAccess: false });
      expect((await publicCoverages(payload))[0].status).toBe(publicStatus);
    }
    await payload.update({ collection: "collections", id: band, data: { status: "active" }, req: await reqAs("editor"), overrideAccess: false });
    const off = await patch("editor", band, { publicPresentation: { ...(await detail("editor", band)).body.collection.publicPresentation, publicEnabled: false } });
    expect(off.status).toBe(200);
    expect(await publicCoverages(payload)).toEqual([]);
  });
});
