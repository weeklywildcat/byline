import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import { homeBootstrap, screenContext, storyWorkspace } from "../../src/newsroom/screen-models";
import { scheduledPublicationsForStories } from "../../src/newsroom/scheduled-publication";
import { changeStoryNote, storyNotes } from "../../src/newsroom/story-notes";
import type { User } from "../../src/payload-types";

/**
 * The Payload side of the shared Byline screens: the read models Home and
 * Story Peek render, and the /api/byline endpoints behind their actions.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
let storyId: number;
let portraitUrl: string;
const TZ = "America/New_York";

async function account(key: string, role: User["role"], person = true) {
  if (person) people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `screens-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `screens-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] ?? null } });
  accounts[key] = { ...user, collection: "users" } as User;
}

const reqAs = (key: string, extra: Partial<PayloadRequest> = {}) => createLocalReq({ user: accounts[key], req: extra }, payload);
const ctxAs = async (key: string) => screenContext(await reqAs(key), TZ, new Date("2026-11-09T15:00:00Z"));

async function call(method: string, path: string, key: string | null, data?: unknown, routeParams: Record<string, string> = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path);
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const req = key ? await reqAs(key) : await createLocalReq({}, payload);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams() });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

beforeAll(async () => {
  // This file's own database (see global-setup.ts), so it never shares records with another file.
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_screens`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("root", "administrator", false);
  await account("editor", "editor");
  await account("alice", "staff");
  await account("carol", "staff", false);
  await account("erin", "staff");
  people.guest = (await payload.create({ collection: "people", data: { name: "Guest Columnist", slug: "screens-guest", status: "guest" } })).id;

  // Alice and the guest have a profile photo; carol (no byline person) and erin do not.
  const photo = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#7b2235" } }).jpeg().toBuffer();
  const portrait = await payload.create({ collection: "media", data: { alt: "Portrait", credit: "Byline" }, file: { data: photo, name: "screens-portrait.jpg", mimetype: "image/jpeg", size: photo.length } });
  portraitUrl = `/api/media/file/${encodeURIComponent(portrait.sizes!.library!.filename!)}`;
  for (const person of [people.alice, people.guest]) await payload.update({ collection: "people", id: person, data: { portrait: portrait.id } });

  const req = await reqAs("alice");
  const story = await payload.create({ collection: "stories", draft: true, data: { headline: "Bus routes change", contributors: [people.alice, people.guest] }, req, overrideAccess: false });
  storyId = story.id;
  await payload.create({ collection: "tasks", data: { story: storyId, title: "Call the transport office", assignees: [accounts.alice.id], state: "open", priority: "high" }, user: accounts.alice, overrideAccess: false });
  await payload.create({ collection: "production-assignments", data: { story: storyId, title: "Bus depot photos", type: "photo", status: "needed", assignees: [accounts.carol.id], deadline: "2026-11-10T21:00:00.000Z" }, user: accounts.editor, overrideAccess: false });
  await payload.create({ collection: "sources", data: { story: storyId, label: "Transport director", status: "needs-scheduling", assignees: [accounts.alice.id] }, user: accounts.alice, overrideAccess: false });
});

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("Home read model", () => {
  it("maps bylines to accounts or guests and finds the writer's story and tasks", async () => {
    const home = await homeBootstrap(await ctxAs("alice"));
    expect(home.currentUser.id).toBe(accounts.alice.id);
    expect(home.timezone).toBe(TZ);
    const row = home.stories.find((story) => story.id === storyId)!;
    expect(row.title).toBe("Bus routes change");
    expect(row.workflow.id).toBe("pitch");
    expect(row.authors).toEqual([
      { id: accounts.alice.id, name: "alice Writer", kind: "user", avatarUrl: portraitUrl },
      { id: people.guest, name: "Guest Columnist", kind: "guest", avatarUrl: portraitUrl }
    ]);
    expect(row.writer?.id).toBe(accounts.alice.id);
    expect(row.openTaskCount).toBe(1);
    expect(row.reporting).toMatchObject({ sources: 1, needsScheduling: 1 });
    expect(home.tasks.map((task) => task.title)).toEqual(["Call the transport office"]);
    expect(home.capabilities.review).toBe(false);
  });

  it("gives a photographer their assignment and the story it belongs to, and no one else's tasks", async () => {
    const home = await homeBootstrap(await ctxAs("carol"));
    expect(home.visualWork).toEqual([expect.objectContaining({ title: "Bus depot photos", type: "photo", story: expect.objectContaining({ id: storyId, title: "Bus routes change" }) })]);
    expect(home.tasks).toEqual([]);
  });

  it("shows unrelated staff none of the newsroom's drafts", async () => {
    const home = await homeBootstrap(await ctxAs("erin"));
    expect(home.stories.find((story) => story.id === storyId)).toBeUndefined();
  });

  it("lets editors review the whole newsroom", async () => {
    const home = await homeBootstrap(await ctxAs("editor"));
    expect(home.capabilities.review).toBe(true);
    expect(home.stories.some((story) => story.id === storyId)).toBe(true);
  });
});

describe("Profile photos", () => {
  it("show beside every name the screens render, and only where there is a photo", async () => {
    const workspace = await storyWorkspace(await ctxAs("alice"), storyId);
    expect(workspace.contributors.contributors.map((entry) => entry.imageUrl)).toEqual([portraitUrl, portraitUrl]);
    const everyone = workspace.people;
    expect(everyone.find((person) => person.id === accounts.alice.id)?.imageUrl).toBe(portraitUrl);
    expect(everyone.find((person) => person.id === accounts.carol.id)?.imageUrl).toBeUndefined();
    expect(workspace.tasks[0]?.assignee?.imageUrl).toBe(portraitUrl);
    expect(workspace.currentUser?.avatarUrl).toBe(portraitUrl);
    expect(workspace.mediaAssignments[0]?.assignee?.avatarUrl).toBeNull();
  });

  it("show on story notes and reply authors", async () => {
    await changeStoryNote(await ctxAs("alice"), storyId, null, { text: "Check the depot hours." });
    const { threads } = await storyNotes(await ctxAs("alice"), storyId, false, 1);
    expect(threads[0]?.author).toMatchObject({ id: accounts.alice.id, avatarUrl: portraitUrl });
  });
});

describe("Story Peek read model", () => {
  it("is a manager's full workspace", async () => {
    const workspace = await storyWorkspace(await ctxAs("alice"), storyId);
    expect(workspace.capabilities.role).toBe("manager");
    expect(workspace.contributors.contributors.map((entry) => entry.kind)).toEqual(["user", "guest"]);
    expect(workspace.mediaAssignments.map((row) => row.title)).toEqual(["Bus depot photos"]);
    expect(workspace.sources.map((source) => source.label)).toEqual(["Transport director"]);
  });

  it("is limited to a participant's own work", async () => {
    const workspace = await storyWorkspace(await ctxAs("carol"), storyId);
    expect(workspace.capabilities).toMatchObject({ role: "participant", editArticle: false, changeStatus: false, manageResources: false });
    expect(workspace.tasks).toEqual([]);
    expect(workspace.sources).toEqual([]);
    expect(workspace.mediaAssignments.map((row) => row.title)).toEqual(["Bus depot photos"]);
    expect(workspace.people.map((person) => person.id)).toEqual([accounts.carol.id]);
  });

  it("is refused to unrelated staff", async () => {
    await expect(storyWorkspace(await ctxAs("erin"), storyId)).rejects.toMatchObject({ status: 403 });
  });
});

describe("/api/byline endpoints", () => {
  it("refuse anonymous requests", async () => {
    expect((await call("get", "/byline/home", null)).status).toBe(401);
    expect((await call("get", "/byline/stories/:id/workspace", null, undefined, { id: String(storyId) })).status).toBe(401);
  });

  it("complete a task, and undo it", async () => {
    const task = (await payload.find({ collection: "tasks", where: { story: { equals: storyId } }, overrideAccess: true })).docs[0];
    const done = await call("patch", "/byline/tasks/:id", "alice", { state: "completed" }, { id: String(task.id) });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ state: "completed", completedAt: expect.any(String) });
    const undone = await call("patch", "/byline/tasks/:id", "alice", { state: "open" }, { id: String(task.id) });
    expect(undone.body).toMatchObject({ state: "open", completedAt: null });
  });

  it("read a task's newsroom-local due time in the newsroom timezone", async () => {
    const created = await call("post", "/byline/tasks", "alice", { title: "File by Tuesday", storyId, priority: "normal", dueAt: "2026-11-10T17:00", assigneeId: accounts.alice.id });
    expect(created.status).toBe(200);
    expect(created.body.tasks[0]).toMatchObject({ title: "File by Tuesday", dueAt: "2026-11-10T22:00:00.000Z" });
  });

  it("refuse a participant's task changes on someone else's work", async () => {
    const task = (await payload.find({ collection: "tasks", where: { story: { equals: storyId } }, overrideAccess: true })).docs[0];
    expect((await call("patch", "/byline/tasks/:id", "carol", { state: "completed" }, { id: String(task.id) })).status).toBeGreaterThanOrEqual(400);
  });

  it("move workflow for a manager, but leave deadlines to editors", async () => {
    expect((await call("post", "/byline/stories/:id/workflow", "alice", { status: "writing" }, { id: String(storyId) })).status).toBe(200);
    expect((await call("post", "/byline/stories/:id/workflow", "alice", { deadline: "2026-11-12" }, { id: String(storyId) })).status).toBe(403);
    expect((await call("post", "/byline/stories/:id/workflow", "editor", { deadline: "2026-11-12" }, { id: String(storyId) })).status).toBe(200);
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, overrideAccess: true })).docs[0];
    expect(plan).toMatchObject({ workflow: "writing", deadline: "2026-11-12" });
  });

  it("reject a workflow change made against a stale plan", async () => {
    const stale = await call("post", "/byline/stories/:id/workflow", "alice", { status: "editing", expectedRevision: 1 }, { id: String(storyId) });
    expect(stale.status).toBe(409);
  });

  it("add and remove links on the plan", async () => {
    const added = await call("post", "/byline/stories/:id/resources", "alice", { label: "Draft", url: "https://docs.google.com/document/d/abc/edit", purpose: "draft" }, { id: String(storyId) });
    expect(added.body.resources).toEqual([expect.objectContaining({ label: "Draft", kind: "Google Doc", purpose: "draft" })]);
    const id = added.body.resources[0].id;
    const removed = await call("delete", "/byline/stories/:id/resources/:resourceId", "alice", undefined, { id: String(storyId), resourceId: id });
    expect(removed.body.resources).toEqual([]);
    expect((await call("post", "/byline/stories/:id/resources", "alice", { label: "Bad", url: "javascript:alert(1)" }, { id: String(storyId) })).status).toBe(400);
  });

  it("save the byline as a draft of the story", async () => {
    const saved = await call("put", "/byline/stories/:id/contributors", "alice", { contributors: [{ id: accounts.erin.id, kind: "user", name: "erin" }] }, { id: String(storyId) });
    expect(saved.status).toBe(200);
    const draft = await payload.findByID({ collection: "stories", id: storyId, draft: true, depth: 0, overrideAccess: true });
    expect(draft.contributors).toEqual([people.erin]);
  });

  it("create a story from a preset: workflow and starter tasks, no sources or text", async () => {
    const created = await call("post", "/byline/stories", "alice", { title: "Board election", preset: "news" });
    expect(created.status).toBe(200);
    expect(created.body.workspaceUrl).toMatch(/\/admin\/collections\/stories\/\d+$/);
    expect(created.body.template).toEqual({ tasks: 3, mediaAssignments: 0, errors: [] });
    expect(created.body.story.workflow.id).toBe("reporting");
    // A staff writer's preset never sets a deadline.
    expect(created.body.story.deadline).toBeNull();
    expect(created.body.sources).toEqual([]);
    expect(created.body.tasks.map((task: { title: string }) => task.title)).toEqual(["Interview sources", "Verify names and details", "Self-edit draft"]);
  });

  it("give an editor's preset its deadline and production", async () => {
    const created = await call("post", "/byline/stories", "editor", { title: "Homecoming photos", preset: "photo-story" });
    expect(created.body.template).toMatchObject({ mediaAssignments: 1 });
    expect(created.body.story.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Story Workspace endpoints", () => {
  const story = () => ({ id: String(storyId) });

  it("save the brief, refusing a stale edit", async () => {
    const saved = await call("post", "/byline/stories/:id/brief", "alice", { brief: "Why routes changed.", expectedBrief: "" }, story());
    expect(saved.body).toEqual({ brief: "Why routes changed." });
    const stale = await call("post", "/byline/stories/:id/brief", "alice", { brief: "Overwrite", expectedBrief: "" }, story());
    expect(stale.status).toBe(409);
  });

  it("add a source, update it, and refuse a stale update", async () => {
    const added = await call("post", "/byline/stories/:id/sources", "alice", { label: "Bus driver", status: "planned", assigneeIds: [accounts.alice.id] }, story());
    expect(added.status).toBe(200);
    const source = added.body.sources.find((row: { label: string }) => row.label === "Bus driver");
    expect(added.body.sourceId).toBe(source.id);
    const updated = await call("post", "/byline/stories/:id/sources/:sourceId", "alice", { status: "contacted", expectedUpdatedAt: source.updatedAt }, { ...story(), sourceId: source.id });
    expect(updated.body.sources.find((row: { id: string }) => row.id === source.id).status).toBe("contacted");
    const stale = await call("post", "/byline/stories/:id/sources/:sourceId", "alice", { status: "declined", expectedUpdatedAt: source.updatedAt }, { ...story(), sourceId: source.id });
    expect(stale.status).toBe(409);
  });

  it("store an exact appointment in UTC and a window date-only, linked to a source", async () => {
    const sources = (await call("post", "/byline/stories/:id/sources", "alice", { label: "Superintendent", status: "planned" }, story())).body.sources;
    const sourceId = sources.find((row: { label: string }) => row.label === "Superintendent").id;
    const exact = await call("post", "/byline/stories/:id/appointments", "alice", { title: "Interview", kind: "interview", status: "confirmed", scheduleMode: "exact", startAt: "2026-11-10T10:15", sourceId, assigneeIds: [accounts.alice.id] }, story());
    expect(exact.status).toBe(200);
    expect(exact.body.appointments.find((row: { title: string }) => row.title === "Interview")).toMatchObject({ startAt: "2026-11-10T15:15:00.000Z", sourceId, sourceLabel: "Superintendent" });
    const window = await call("post", "/byline/stories/:id/appointments", "alice", { title: "Ride along", kind: "reporting", status: "planned", scheduleMode: "window", windowStart: "2026-11-16", windowEnd: "2026-11-20" }, story());
    expect(window.body.appointments.find((row: { title: string }) => row.title === "Ride along")).toMatchObject({ windowStart: "2026-11-16", windowEnd: "2026-11-20", startAt: null });
  });

  it("let a participant schedule only for themselves and update only their own assignment's status", async () => {
    expect((await call("post", "/byline/stories/:id/appointments", "carol", { title: "Shoot", kind: "photo", status: "planned", scheduleMode: "unscheduled", assigneeIds: [accounts.carol.id] }, story())).status).toBe(200);
    expect((await call("post", "/byline/stories/:id/appointments", "carol", { title: "For Alice", kind: "photo", status: "planned", scheduleMode: "unscheduled", assigneeIds: [accounts.alice.id] }, story())).status).toBe(403);
    const mine = (await call("get", "/byline/stories/:id/workspace", "carol", undefined, story())).body.mediaAssignments[0];
    const saved = await call("post", "/byline/stories/:id/media-assignments/:assignmentId", "carol", { status: "uploaded", title: "Renamed", expectedUpdatedAt: mine.updatedAt }, { ...story(), assignmentId: mine.id });
    expect(saved.status).toBe(200);
    expect(saved.body.mediaAssignments[0]).toMatchObject({ status: "uploaded", title: "Bus depot photos" });
    expect((await call("post", "/byline/stories/:id/sources", "carol", { label: "Sneaky", status: "planned" }, story())).status).toBe(403);
  });

  it("refuse a record from another story through this story's address", async () => {
    const other = await payload.create({ collection: "stories", draft: true, data: { headline: "Other story" }, user: accounts.alice, overrideAccess: false });
    const source = await payload.create({ collection: "sources", data: { story: other.id, label: "Elsewhere", status: "planned" }, user: accounts.alice, overrideAccess: false });
    const response = await call("post", "/byline/stories/:id/sources/:sourceId", "alice", { status: "contacted" }, { ...story(), sourceId: String(source.id) });
    expect(response.status).toBe(404);
  });

  it("delete a source and unlink its appointments", async () => {
    const workspace = (await call("get", "/byline/stories/:id/workspace", "alice", undefined, story())).body;
    const linked = workspace.appointments.find((row: { sourceId: string | null }) => row.sourceId);
    const removed = await call("delete", "/byline/stories/:id/sources/:sourceId", "alice", undefined, { ...story(), sourceId: linked.sourceId });
    expect(removed.status).toBe(200);
    expect(removed.body.appointments.find((row: { id: string }) => row.id === linked.id).sourceId).toBeNull();
  });

  it("return the whole workflow story, so the screens fold the server's view in", async () => {
    const response = await call("post", "/byline/stories/:id/workflow", "editor", { status: "editing", editorId: accounts.editor.id }, story());
    expect(response.body.story).toMatchObject({ postId: storyId, status: "review", storedStatus: "editing", isPublished: false, editorId: accounts.editor.id, deadline: "2026-11-12" });
  });

  it("respect Payload's document lock for byline changes made outside the editor", async () => {
    await payload.create({ collection: "payload-locked-documents", data: { document: { relationTo: "stories", value: storyId }, globalSlug: null, user: { relationTo: "users", value: accounts.editor.id } }, overrideAccess: true });
    const response = await call("put", "/byline/stories/:id/contributors", "alice", { contributors: [{ id: accounts.alice.id, kind: "user", name: "alice" }] }, story());
    // 423 Locked: the editor's open form owns the article's fields until they leave.
    expect(response.status).toBe(423);
    await payload.delete({ collection: "payload-locked-documents", where: { "document.value": { equals: storyId } }, overrideAccess: true });
  });
});


describe("native publication and History actions", () => {
  it("checks scheduling permissions, reschedules, cancels and runs Payload's publication job", async () => {
    const section = await payload.create({ collection: "sections", data: { name: "Schedule test section", slug: "schedule-test-section" } });
    const story = await payload.create({ collection: "stories", draft: true, data: { headline: "Scheduled original", section: section.id }, req: await reqAs("alice"), overrideAccess: false });
    const params = { id: String(story.id) };
    const route = "/byline/stories/:id/schedule-publication";
    expect((await call("post", route, "alice", { at: "2028-01-03T23:30", expected: null }, params)).status).toBe(403);
    const scheduled = await call("post", route, "editor", { at: "2028-01-03T23:30", expected: null }, params);
    expect(scheduled).toEqual({ status: 200, body: { scheduledAt: "2028-01-04T04:30:00.000Z" } });
    expect((await call("get", "/byline/stories/:id/workspace", "alice", undefined, params)).body.story.publicationState.id).toBe("scheduled");
    const stale = await call("post", route, "editor", { at: "2028-01-03T23:31", expected: null }, params);
    expect(stale.status).toBe(409);
    const rescheduled = await call("post", route, "editor", { at: "2028-01-03T23:31", expected: scheduled.body.scheduledAt }, params);
    expect(rescheduled).toEqual({ status: 200, body: { scheduledAt: "2028-01-04T04:31:00.000Z" } });
    expect((await call("post", route, "editor", { at: null, expected: rescheduled.body.scheduledAt }, params)).status).toBe(200);
    expect((await call("get", "/byline/stories/:id/workspace", "alice", undefined, params)).body.story.publicationState.id).toBe("draft");

    await payload.update({ collection: "stories", id: story.id, draft: true, data: { headline: "Latest scheduled draft", publishedAt: "2026-11-08T04:30:00.000Z" }, req: await reqAs("editor"), overrideAccess: false });
    expect((await call("post", route, "editor", { at: "2028-01-03T23:32", expected: null }, params)).status).toBe(200);
    await payload.update({ collection: "payload-jobs", where: { and: [{ taskSlug: { equals: "schedulePublish" } }, { waitUntil: { equals: "2028-01-04T04:32:00.000Z" } }] }, data: { waitUntil: "2020-01-01T00:00:00.000Z" } });
    await payload.jobs.run({ queue: "default", limit: 20 });
    const published = await payload.findByID({ collection: "stories", id: story.id });
    expect(published).toMatchObject({ headline: "Latest scheduled draft", _status: "published", publishedAt: "2026-11-08T04:30:00.000Z" });
    await expect(payload.update({ collection: "stories", id: story.id, data: { _status: "draft" }, req: await reqAs("alice"), overrideAccess: false })).rejects.toThrow();
    const unpublish = await payload.update({ collection: "stories", id: story.id, data: { _status: "draft" }, req: await reqAs("editor"), overrideAccess: false });
    expect(unpublish.publishedAt).toBe(published.publishedAt);
    expect((await payload.update({ collection: "stories", id: story.id, data: { _status: "published" }, req: await reqAs("editor"), overrideAccess: false })).publishedAt).toBe(published.publishedAt);
  });

  it("moves a Story to Trash, cancels scheduled publication and refuses staff", async () => {
    const section = await payload.create({
      collection: "sections",
      data: { name: "Trash test section", slug: "trash-test-section" },
    });
    const story = await payload.create({
      collection: "stories",
      draft: true,
      data: { headline: "Trash fixture", section: section.id },
      req: await reqAs("alice"),
      overrideAccess: false,
    });
    const params = { id: String(story.id) };
    const schedule = await call(
      "post",
      "/byline/stories/:id/schedule-publication",
      "editor",
      { at: "2028-01-03T23:45", expected: null },
      params,
    );
    expect(schedule.status).toBe(200);

    expect((await call("post", "/byline/stories/:id/trash", "alice", {}, params)).status).toBe(403);
    const trashed = await call("post", "/byline/stories/:id/trash", "editor", {}, params);
    expect(trashed).toMatchObject({
      status: 200,
      body: {
        id: story.id,
        cancelledScheduledPublication: true,
        deletedAt: expect.any(String),
      },
    });

    const stored = await payload.findByID({
      collection: "stories",
      id: story.id,
      trash: true,
      depth: 0,
      overrideAccess: true,
    });
    expect(stored.deletedAt).toBe(trashed.body.deletedAt);
    expect(
      (
        await payload.find({
          collection: "stories",
          where: { id: { equals: story.id } },
          depth: 0,
          limit: 1,
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(0);
    expect((await scheduledPublicationsForStories(await ctxAs("editor"), [story.id])).size).toBe(0);
  });

  it("lists native versions, records their authors and restores a draft without publishing it", async () => {
    const section = await payload.create({ collection: "sections", data: { name: "History test section", slug: "history-test-section" } });
    const story = await payload.create({ collection: "stories", draft: true, data: { headline: "First version", section: section.id }, req: await reqAs("alice"), overrideAccess: false });
    await payload.update({ collection: "stories", id: story.id, data: { _status: "published" }, req: await reqAs("editor"), overrideAccess: false });
    await payload.update({ collection: "stories", id: story.id, draft: true, autosave: true, data: { headline: "Autosaved copy" }, req: await reqAs("alice"), overrideAccess: false });
    const params = { id: String(story.id) };
    const route = "/byline/stories/:id/versions";
    expect((await call("get", route, "carol", undefined, params)).body.versions ?? []).toEqual([]);
    const history = await call("get", route, "editor", undefined, params);
    expect(history.status).toBe(200);
    expect(history.body.versions[0]).toMatchObject({ kind: "Autosave", actor: "alice Account" });
    const restored = await call("post", "/byline/stories/:id/restore-version", "editor", { version: history.body.current, expected: history.body.latest }, params);
    expect(restored.status).toBe(200);
    expect(restored.body.doc).toMatchObject({ headline: "First version", _status: "draft" });
    expect((await payload.findByID({ collection: "stories", id: story.id, draft: false }))._status).toBe("published");
    const after = await call("get", route, "editor", undefined, params);
    expect(after.body.versions[0]).toMatchObject({ kind: "Restored", actor: "editor Account" });
  });

  it("creates canonical correction types, schedules future visibility and refuses stale edits", async () => {
    const story = await payload.create({ collection: "stories", draft: true, data: { headline: "Corrections fixture" }, req: await reqAs("alice"), overrideAccess: false });
    const params = { id: String(story.id) };
    const route = "/byline/stories/:id/corrections";
    const input = { type: "editor-note", text: "We added a note on the reporting.", date: "2026-11-07T15:00", publishedAt: "2028-01-03T13:00" };
    expect((await call("post", route, "alice", input, params)).status).toBe(403);
    const created = await call("post", route, "editor", input, params);
    expect(created.status).toBe(200);
    const [notice] = created.body.corrections;
    expect(notice).toMatchObject({ type: "editor-note", createdBy: accounts.editor.id, publishedAt: "2028-01-03T18:00:00.000Z" });
    const record = `${route}/:correction`;
    const target = { ...params, correction: String(notice.id) };
    expect((await call("patch", record, "editor", { ...input, expected: "stale" }, target)).status).toBe(409);
    const edited = await call("patch", record, "editor", { ...input, text: "Updated note.", expected: notice.updatedAt }, target);
    expect(edited.body.corrections[0].text).toBe("Updated note.");
    expect((await call("delete", record, "editor", { expected: edited.body.corrections[0].updatedAt }, target)).body.corrections).toEqual([]);
  });
});

describe("protected newsroom workflows", () => {
  it("shows meaningful activity, skips ordinary autosaves and keeps notes on the team", async () => {
    const story = await payload.create({ collection: "stories", draft: true, data: { headline: "Private reporting notes fixture" }, req: await reqAs("alice"), overrideAccess: false });
    const params = { id: String(story.id) };
    await payload.update({ collection: "stories", id: story.id, draft: true, autosave: true, data: { headline: "Changed private reporting notes fixture" }, req: await reqAs("alice"), overrideAccess: false });
    const path = "/byline/stories/:id";
    await call("post", `${path}/workflow`, "alice", { status: "writing" }, params);
    const { body } = await call("get", `${path}/activity`, "alice", undefined, params);
    expect(body.activity.map((row: { action: string }) => row.action)).toEqual(["workflow-changed", "story-created"]);
    expect((await call("get", `${path}/activity`, "erin", undefined, params)).status).toBe(403);

    expect((await call("post", `${path}/notes`, "erin", { text: "Denied" }, params)).status).toBe(403);
    expect((await call("post", `${path}/notes`, "alice", { text: "Verify the quote." }, params)).status).toBe(200);
    const notes = await call("get", `${path}/notes`, "alice", undefined, params);
    expect(notes.body.summary).toMatchObject({ openCount: 1, kind: "story" });
    const [note] = notes.body.threads;
    const noteParams = { ...params, note: String(note.id) };
    await call("patch", `${path}/notes/:note`, "editor", { text: "Confirmed against the recording." }, noteParams);
    const next = await call("get", `${path}/notes`, "alice", undefined, params);
    expect(next.body.threads[0].replies[0].author.name).toBe("editor Account");
    expect((await call("patch", `${path}/notes/:note`, "alice", { resolved: true, expected: next.body.threads[0].updatedAt }, noteParams)).status).toBe(200);
    expect((await call("get", `${path}/notes`, "alice", undefined, params)).body.summary).toMatchObject({ openCount: 0, resolvedCount: 1 });
  });

  it("lets administrators grant and disable newsroom access from a Person without changing the public identity", async () => {
    const person = await payload.create({
      collection: "people",
      data: { name: "Access fixture", slug: "screens-access-fixture", status: "active" },
    });
    const endpoint = "/byline/people/:id/access";
    const params = { id: String(person.id) };
    const data = {
      email: "access-fixture@example.test",
      role: "staff",
      enabled: true,
      password: "access-fixture-123456",
      expectedRevision: null,
    };

    expect((await call("put", endpoint, "editor", data, params)).status).toBe(403);
    const result = await call("put", endpoint, "root", data, params);
    expect(result).toMatchObject({
      status: 200,
      body: {
        person: { id: person.id, name: "Access fixture" },
        access: {
          email: "access-fixture@example.test",
          role: "staff",
          enabled: true,
          googleConnected: false,
        },
      },
    });
    expect(Object.keys(result.body.access)).not.toContain("password");

    expect(
      (
        await call(
          "put",
          endpoint,
          "root",
          { ...data, role: "editor", enabled: false, expectedRevision: "stale" },
          params,
        )
      ).status,
    ).toBe(409);

    const changed = await call(
      "put",
      endpoint,
      "root",
      {
        ...data,
        role: "editor",
        enabled: false,
        password: undefined,
        expectedRevision: result.body.access.revision,
      },
      params,
    );
    expect(changed.body.access).toMatchObject({ role: "editor", enabled: false });
    expect((await payload.findByID({ collection: "people", id: person.id })).name).toBe("Access fixture");

    await expect(
      payload.update({
        collection: "users",
        id: accounts.root.id,
        data: { enabled: false },
        req: await reqAs("root"),
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("stages Publication settings before publishing and protects Site administration", async () => {
    const endpoint = "/byline/site/publication";
    expect((await call("get", endpoint, "editor")).status).toBe(403);
    const original = await call("get", endpoint, "root");
    expect(original.status).toBe(200);
    expect(original.body.fields.map((field: { name: string }) => field.name)).toEqual(expect.arrayContaining(["identity", "location", "timezone", "urls", "branding", "sections", "navigation", "social", "features", "licensing", "seo"]));
    const values = { ...original.body.values, identity: { ...original.body.values.identity, tagline: "A new newsroom tagline" } };
    const draft = await call("post", endpoint, "root", { expected: original.body.revision, values, publish: false });
    expect(draft).toMatchObject({ status: 200, body: { hasDraft: true } });
    expect((await payload.findGlobal({ slug: "publication", draft: false })).identity.tagline).not.toBe("A new newsroom tagline");
    const published = await call("post", endpoint, "root", { expected: draft.body.revision, values, publish: true });
    expect(published).toMatchObject({ status: 200, body: { hasPublished: true, hasDraft: false } });
    expect((await payload.findGlobal({ slug: "publication", draft: false })).identity.tagline).toBe("A new newsroom tagline");
  });
});
