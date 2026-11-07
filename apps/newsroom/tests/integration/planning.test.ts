import { sanitizePlanningFilters, type PlanningFilters, type PlanningResponse } from "@byline/newsroom-screens/planning/planning-model";
import { createLocalReq, getPayload, type Endpoint, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import { planningResponse } from "../../src/newsroom/planning";
import { homeBootstrap, screenContext } from "../../src/newsroom/screen-models";
import type { User } from "../../src/payload-types";
import { createPreferenceSavedViews, SAVED_VIEWS_PREFERENCE_KEY, type PreferenceStore } from "../../src/ui/stories/saved-views";

/**
 * The Payload Stories collection (`GET /api/byline/planning`): the shared
 * PlanningResponse read model, its scopes and privacy, every Planning filter,
 * the one planning write behind Board moves and List edits, and saved views in
 * Payload Preferences.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const story: Record<string, number> = {};
let collectionId: number;
const TZ = "America/New_York";
const NOW = new Date("2026-11-09T15:00:00Z");
const BULK = 120;

async function account(key: string, role: User["role"], person = true) {
  if (person) people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `planning-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `planning-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] ?? null } });
  accounts[key] = { ...user, collection: "users" } as User;
}

const reqAs = (key: string, extra: Partial<PayloadRequest> = {}) => createLocalReq({ user: accounts[key], req: extra }, payload);
const ctxAs = async (key: string) => screenContext(await reqAs(key), TZ, NOW);
const planning = async (key: string, filters: Partial<PlanningFilters> = {}) => planningResponse(await ctxAs(key), sanitizePlanningFilters(filters));
const titles = (response: PlanningResponse) => response.stories.map((row) => row.title).sort();
const named = (response: PlanningResponse, ...keys: string[]) => response.stories.filter((row) => keys.some((key) => row.id === story[key])).map((row) => row.id).sort();
const ids = (...keys: string[]) => keys.map((key) => story[key]).sort();
const only = (response: PlanningResponse) => response.stories.filter((row) => !row.title.startsWith("Bulk")).map((row) => row.id).sort();

async function call(method: string, path: string, key: string | null, { data, routeParams = {}, query = "" }: { data?: unknown; routeParams?: Record<string, string>; query?: string } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path);
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const req = key ? await reqAs(key) : await createLocalReq({}, payload);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams(query) });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

const workflow = (key: string, storyKey: string, data: Record<string, unknown>) => call("post", "/byline/stories/:id/workflow", key, { data, routeParams: { id: String(story[storyKey]) } });

async function create(key: string, headline: string, extra: Record<string, unknown> = {}) {
  const created = await payload.create({ collection: "stories", draft: true, data: { headline, ...extra }, req: await reqAs(key), overrideAccess: false });
  return created.id;
}

/** Payload Preferences exactly as `usePreferences()` reaches them: the collection's own endpoints, as one signed-in account. */
function preferencesFor(key: string): PreferenceStore {
  const endpoints = payload.collections["payload-preferences"].config.endpoints as Endpoint[];
  const handler = (method: string) => endpoints.find((endpoint) => endpoint.method === method && endpoint.path === "/:key")!.handler;
  return {
    getPreference: async <T,>(preference: string) => {
      const req = await reqAs(key);
      Object.assign(req, { routeParams: { key: preference }, json: async () => ({}) });
      const body = await ((await handler("get")(req)) as Response).json();
      return (body.value ?? null) as T;
    },
    setPreference: async <T,>(preference: string, value: T) => {
      const req = await reqAs(key);
      Object.assign(req, { routeParams: { key: preference }, json: async () => ({ value }) });
      await handler("post")(req);
    }
  };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_planning`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("alice", "staff");
  await account("bob", "staff");
  await account("photo", "staff", false);

  // Alice's two stories; the editor's draft nobody else is on; a published story with an unpublished rewrite.
  story.budget = await create("alice", "Budget vote delayed", { contributors: [people.alice] });
  story.ready = await create("alice", "Ready piece on parking", { contributors: [people.alice] });
  story.private = await create("editor", "Editor's private draft");
  const published = await payload.create({ collection: "stories", data: { headline: "Library hours change", _status: "published" } as never, req: await reqAs("editor"), overrideAccess: false });
  story.library = published.id;
  await payload.update({ collection: "stories", id: story.library, draft: true, data: { headline: "Library to close (embargoed)" }, req: await reqAs("editor"), overrideAccess: false });
  await payload.create({ collection: "production-assignments", data: { story: story.library, title: "Library photos", type: "photo", status: "assigned", assignees: [accounts.photo.id] }, req: await reqAs("editor"), overrideAccess: false });

  // Plans: Budget is overdue with an editor and a planned publication; Ready is ready and unassigned.
  expect((await workflow("alice", "budget", { status: "reporting" })).status).toBe(200);
  expect((await workflow("editor", "budget", { deadline: "2026-11-05", plannedPublishAt: "2026-11-12T10:00", editorId: accounts.editor.id })).status).toBe(200);
  expect((await workflow("alice", "ready", { status: "ready" })).status).toBe(200);
  // 22:00 on the 12th in New York is already the 13th in UTC: the planned day is the newsroom's.
  expect((await workflow("editor", "ready", { plannedPublishAt: "2026-11-12T22:00" })).status).toBe(200);

  collectionId = (await payload.create({ collection: "collections", data: { name: "Town budget", type: "ongoing", stories: [story.budget, story.library] } as never, req: await reqAs("editor"), overrideAccess: false })).id;

  // More stories than any default page: the collection must never be a first page.
  for (let index = 0; index < BULK; index += 1) await create("editor", `Bulk story ${index}`);
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("the Stories read model", () => {
  it("is the shared PlanningResponse, never raw Payload documents", async () => {
    const response = await planning("alice");
    expect(response.timezone).toBe(TZ);
    expect(response.currentUser).toMatchObject({ id: accounts.alice.id, kind: "user" });
    expect(response.capabilities).toEqual({ canMoveStories: true, canAssign: false, canManageSavedViews: true, canManageMedia: false, canManageFeedback: false });
    expect(response.workflowStatuses.map((status) => status.id)).toContain("published");
    expect(response.total).toBe(response.stories.length);
    expect(response).not.toHaveProperty("savedViews");
    const row = response.stories.find((item) => item.id === story.budget)!;
    expect(row).toMatchObject({
      title: "Budget vote delayed",
      editUrl: `/admin/collections/stories/${story.budget}`,
      canEditPlanning: true,
      workflow: { id: "reporting", group: "main" },
      publicationState: { id: "draft", isPublished: false },
      deadline: "2026-11-05",
      plannedPublication: "2026-11-12T15:00:00.000Z",
      writer: { id: accounts.alice.id },
      editor: { id: accounts.editor.id },
      authors: [{ id: accounts.alice.id, kind: "user" }]
    });
    for (const raw of ["headline", "_status", "contributors", "createdBy", "story", "brief", "resources"]) expect(row).not.toHaveProperty(raw);
  });

  it("is the complete collection, not a first page", async () => {
    const response = await planning("editor");
    expect(response.stories.filter((row) => row.title.startsWith("Bulk"))).toHaveLength(BULK);
    expect(response.total).toBe(BULK + 4);
  });

  it("gives editors every story, staff their own, participants their assignments and unrelated staff nothing", async () => {
    expect(only(await planning("editor"))).toEqual(ids("budget", "ready", "private", "library"));
    expect(only(await planning("alice"))).toEqual(ids("budget", "ready"));
    expect(only(await planning("photo"))).toEqual(ids("library"));
    expect((await planning("bob")).stories).toEqual([]);
  });

  it("never shows a draft to someone who is not on the story", async () => {
    for (const key of ["alice", "bob", "photo"]) expect((await planning(key)).stories.map((row) => row.id)).not.toContain(story.private);
  });

  it("keeps an unpublished rewrite with the story's managers", async () => {
    const forEditor = (await planning("editor")).stories.find((row) => row.id === story.library)!;
    expect(forEditor.title).toBe("Library to close (embargoed)");
    const forPhotographer = (await planning("photo")).stories.find((row) => row.id === story.library)!;
    expect(forPhotographer.title).toBe("Library hours change");
    expect(forPhotographer.canEditPlanning).toBe(false);
    // Home and Peek read stories the same way.
    const home = await homeBootstrap(await ctxAs("photo"));
    expect(home.stories.find((row) => row.id === story.library)?.title).toBe("Library hours change");
  });
});

describe("Stories filters", () => {
  it("search", async () => expect(named(await planning("editor", { query: "budget" }), "budget", "ready", "private", "library")).toEqual(ids("budget")));
  it("workflow, including the derived Published stage", async () => {
    expect(only(await planning("editor", { workflow: "ready" }))).toEqual(ids("ready"));
    expect(only(await planning("editor", { workflow: "published" }))).toEqual(ids("library"));
  });
  it("writer", async () => expect(only(await planning("editor", { writerId: accounts.alice.id }))).toEqual(ids("budget", "ready")));
  it("editor", async () => expect(only(await planning("editor", { editorId: accounts.editor.id }))).toEqual(ids("budget")));
  it("deadline range", async () => {
    expect(only(await planning("editor", { deadlineFrom: "2026-11-01", deadlineTo: "2026-11-06" }))).toEqual(ids("budget"));
    expect(only(await planning("editor", { deadlineFrom: "2026-11-06" }))).toEqual([]);
  });
  it("planned publication range, by the newsroom's day", async () => {
    expect(only(await planning("editor", { plannedFrom: "2026-11-12", plannedTo: "2026-11-12" }))).toEqual(ids("budget", "ready"));
    expect(only(await planning("editor", { plannedFrom: "2026-11-13" }))).toEqual([]);
  });
  it("publication state", async () => {
    expect(only(await planning("editor", { publicationState: "published" }))).toEqual(ids("library"));
    expect(only(await planning("editor", { publicationState: "draft" }))).toEqual(ids("budget", "ready", "private"));
  });
  it("visual status", async () => expect(only(await planning("editor", { visualStatus: "assigned" }))).toEqual(ids("library")));
  it("mine", async () => {
    expect(only(await planning("alice", { mine: true }))).toEqual(ids("budget", "ready"));
    expect((await planning("photo", { mine: true })).stories).toEqual([]);
  });
  it("unassigned", async () => expect(only(await planning("alice", { unassigned: true }))).toEqual(ids("ready")));
  it("overdue", async () => expect(only(await planning("editor", { overdue: true }))).toEqual(ids("budget")));
  it("needs review", async () => expect(only(await planning("editor", { needsReview: true }))).toEqual(ids("ready")));
  it("Collection membership, from the Collection's own story list and within the reader's scope", async () => {
    expect(only(await planning("editor", { collectionId }))).toEqual(ids("budget", "library"));
    expect(only(await planning("alice", { collectionId }))).toEqual(ids("budget"));
    expect((await planning("editor", { collectionId: 999_999 })).stories).toEqual([]);
  });
});

describe("GET /api/byline/planning", () => {
  it("refuses anonymous requests", async () => {
    expect((await call("get", "/byline/planning", null)).status).toBe(401);
  });

  it("reads the screens' query string", async () => {
    const { status, body } = await call("get", "/byline/planning", "editor", { query: "workflow=ready&search=parking" });
    expect(status).toBe(200);
    expect(body.stories.map((row: { id: number }) => row.id)).toEqual([story.ready]);
  });
});

describe("Board moves and List edits", () => {
  it("move a story through the one workflow endpoint", async () => {
    expect((await workflow("alice", "budget", { status: "editing" })).status).toBe(200);
    expect((await planning("alice")).stories.find((row) => row.id === story.budget)?.workflow.id).toBe("editing");
    expect((await workflow("bob", "budget", { status: "pitch" })).status).toBe(403);
  });

  it("edit deadline and planned publication inline, editors only", async () => {
    expect((await workflow("editor", "ready", { deadline: "2026-11-20" })).status).toBe(200);
    expect((await workflow("editor", "ready", { plannedPublishAt: "2026-11-21T09:30" })).status).toBe(200);
    const row = (await planning("alice")).stories.find((item) => item.id === story.ready)!;
    expect(row.deadline).toBe("2026-11-20");
    expect(row.plannedPublication).toBe("2026-11-21T14:30:00.000Z");
    expect((await workflow("alice", "ready", { deadline: "2026-11-30" })).status).toBe(403);
    expect((await workflow("editor", "ready", { deadline: "" })).status).toBe(200);
    expect((await planning("editor")).stories.find((item) => item.id === story.ready)?.deadline).toBeNull();
  });
});

describe("saved views in Payload Preferences", () => {
  it("belong to the account that saved them", async () => {
    const alice = createPreferenceSavedViews(preferencesFor("alice"));
    const bob = createPreferenceSavedViews(preferencesFor("bob"));
    expect(await alice.getSavedViews()).toEqual([]);
    const saved = await alice.saveSavedView({ name: "Overdue budget", filters: sanitizePlanningFilters({ overdue: true, query: "budget" }), sort: { key: "deadline", direction: "asc" } });
    expect((await alice.getSavedViews()).map((view) => view.id)).toEqual([saved.id]);
    expect(await bob.getSavedViews()).toEqual([]);
    const stored = await payload.find({ collection: "payload-preferences", where: { key: { equals: SAVED_VIEWS_PREFERENCE_KEY } }, depth: 0 });
    expect(stored.docs).toHaveLength(1);
    expect(stored.docs[0].user).toMatchObject({ relationTo: "users", value: accounts.alice.id });
  });

  it("delete and restore through the stored preference", async () => {
    const alice = createPreferenceSavedViews(preferencesFor("alice"));
    const [view] = await alice.getSavedViews();
    await alice.deleteSavedView(view.id);
    expect(await alice.getSavedViews()).toEqual([]);
    await alice.saveSavedView({ id: view.id, name: view.name, filters: view.filters, sort: view.sort });
    expect((await alice.getSavedViews()).map((item) => item.id)).toEqual([view.id]);
  });
});
