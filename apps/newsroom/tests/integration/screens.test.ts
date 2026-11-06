import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import { homeBootstrap, screenContext, storyWorkspace } from "../../src/newsroom/screen-models";
import type { User } from "../../src/payload-types";

/**
 * The Payload side of the shared Byline screens: the read models Home and
 * Story Peek render, and the /api/byline endpoints behind their actions.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
let storyId: number;
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
      { id: accounts.alice.id, name: "alice Writer", kind: "user" },
      { id: people.guest, name: "Guest Columnist", kind: "guest" }
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
