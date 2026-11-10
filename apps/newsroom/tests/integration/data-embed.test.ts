import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultFieldOptions, type DatasetSchema, type FieldDefinition } from "@byline/data";
import { FIXTURE_BLOCKS } from "../../../../packages/article-body/src/fixtures";
import { blockFields } from "../../../../packages/editor/tests/lexical-fixture";
import { dataEndpoints } from "../../src/data/endpoints";
import { readCurrentRevision } from "../../src/db/publication-state";
import { collectPublicSnapshot } from "../../src/public/snapshot/collect";
import type { Story, User } from "../../src/payload-types";

/**
 * Data Projects inside Stories against real PostgreSQL
 * (docs/byline-data.md#story-embeds): the signed-in choice API, publication
 * that fails closed on the server, the snapshot that resolves a body's
 * project against the Data it publishes, and a project that published Stories
 * depend on that cannot silently disappear.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const PRIVATE = "PRIVATE-EMBED-SENTINEL-555-0100";
let sectionId = 0;
const ids: Record<string, number> = {};

async function account(key: string, role: User["role"]) {
  const person = (await payload.create({ collection: "people", data: { name: `${key} Person`, slug: `embed-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `embed-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: person } });
  accounts[key] = { ...user, collection: "users" } as User;
}
const reqAs = (key: string) => createLocalReq({ user: accounts[key] }, payload);

type Call = { status: number; body: any };
async function call(method: string, path: string, key: string | null, options: { data?: unknown; params?: Record<string, string | number>; search?: Record<string, string> } = {}): Promise<Call> {
  const endpoint = dataEndpoints.find((candidate) => candidate.method === method && candidate.path === path);
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const req = await createLocalReq(key ? { user: accounts[key] } : {}, payload);
  Object.assign(req, {
    routeParams: Object.fromEntries(Object.entries(options.params ?? {}).map(([name, value]) => [name, String(value)])),
    data: options.data ?? {},
    searchParams: new URLSearchParams(options.search ?? {}),
    headers: new Headers()
  });
  if (!key) req.user = null;
  const response = (await endpoint.handler(req)) as Response;
  const text = await response.clone().text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, body };
}

const field = (key: string, label: string, type: FieldDefinition["type"], extra: Partial<FieldDefinition> = {}): FieldDefinition =>
  ({ key, label, type, required: false, visibility: "public", options: defaultFieldOptions(type), ...extra }) as FieldDefinition;
const PHASES: DatasetSchema = {
  fields: [field("name", "Phase", "text", { required: true }), field("status", "Status", "select", { options: { choices: [{ value: "done", label: "Done", tone: "positive" }, { value: "planned", label: "Planned" }] } } as never), field("detail", "Detail", "longText"), field("date", "Date", "date"), field("source_notes", "Source notes", "longText", { visibility: "private" })],
  retiredKeys: []
};

const text = (value: string) => ({ type: "text", text: value, format: 0, detail: 0, mode: "normal", style: "", version: 1 });
const paragraph = (value: string) => ({ type: "paragraph", version: 1, format: "", indent: 0, direction: "ltr", children: [text(value)] });
const embed = (project: number | null, title = "Where the sidewalk stands", description = "Two of three phases are done.") => ({ type: "block", version: 2, format: "", fields: blockFields({ ...FIXTURE_BLOCKS.dataProject, project, title, description } as never) });
const body = (...children: unknown[]) => ({ root: { type: "root", version: 1, format: "", indent: 0, direction: "ltr", children } }) as never;

let storySeed = 0;
const newStory = async (key: string, bodyValue: unknown) => (await payload.create({
  collection: "stories", draft: true, data: { headline: "Embeds", slug: `embed-${storySeed++}-${Math.random().toString(36).slice(2, 7)}`, section: sectionId, body: bodyValue as never }, req: await reqAs(key), overrideAccess: false
})).id as number;
const saveBody = async (key: string, id: number, bodyValue: unknown) => payload.update({ collection: "stories", id, draft: true, data: { body: bodyValue as never }, req: await reqAs(key), overrideAccess: false });
const publish = async (id: number) => payload.update({ collection: "stories", id, data: { _status: "published" }, req: await reqAs("editor"), overrideAccess: false });
const refusal = async (id: number) => {
  try {
    await publish(id);
  } catch (error) {
    return ((error as { data?: { errors?: Array<{ path: string; message: string }> } }).data?.errors ?? []).map((item) => `${item.path}: ${item.message}`).join("\n");
  }
  throw new Error("Publish was not refused.");
};
const snapshot = async () => collectPublicSnapshot(payload, { revision: await readCurrentRevision(payload) });

const createProject = async (title: string, extra: Record<string, unknown> = {}) => {
  const created = await call("post", "/byline/data/projects", "editor", { data: { title, presentation: "fixture-sidewalk-project", dataset: "embed-phases", ...extra } });
  expect(created.status).toBe(200);
  return created.body.id as number;
};
const publishProject = async (id: number) => {
  const done = await call("post", "/byline/data/projects/:id/publish", "editor", { params: { id } });
  expect(done.status).toBe(200);
  return done.body;
};

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_data_embed`;
  process.env.DATABASE_URL = url.toString();
  process.env.BYLINE_STORY_PRESENTATION_FIXTURES = "1";
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("staff", "staff");
  sectionId = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" }, overrideAccess: true })).id as number;
  const dataset = await call("post", "/byline/data/datasets", "editor", { data: { title: "Embed phases", schema: PHASES } });
  expect(dataset.status).toBe(200);
  ids.dataset = dataset.body.id;
  await call("post", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.dataset }, data: { rows: [
    { values: { name: "Survey", status: "done", detail: "Finished.", date: "2025-03-14", source_notes: PRIVATE } },
    { values: { name: "North segment", status: "done", detail: "Opened.", date: "2025-08-18" } },
    { values: { name: "South segment", status: "planned", detail: "Bids due." } }
  ] } });
  expect((await call("post", "/byline/data/datasets/:id/publish", "editor", { params: { id: ids.dataset } })).status).toBe(200);
}, 300_000);

afterAll(async () => {
  delete process.env.BYLINE_STORY_PRESENTATION_FIXTURES;
  await payload?.db?.destroy?.();
});

describe("the Data Project choice API", () => {
  it("requires a signed-in account on every call", async () => {
    expect((await call("get", "/byline/data/projects", null)).status).toBe(401);
    expect((await call("get", "/byline/data/projects/:id/choice", null, { params: { id: 1 } })).status).toBe(401);
  });

  it("lists draft, published and changed projects with small facts only, in that order of usefulness", async () => {
    ids.draft = await createProject("Embed draft only", { deck: undefined });
    ids.published = await createProject("Embed published");
    ids.changed = await createProject("Embed changed");
    await publishProject(ids.published);
    await publishProject(ids.changed);
    const current = (await call("get", "/byline/data/projects/:id", "editor", { params: { id: ids.changed } })).body;
    expect((await call("patch", "/byline/data/projects/:id", "editor", { params: { id: ids.changed }, data: { deck: "A draft-only deck.", expectedUpdatedAt: current.project.updatedAt } })).status).toBe(200);

    const listed = await call("get", "/byline/data/projects", "staff");
    expect(listed.status).toBe(200);
    const mine = listed.body.projects.filter((project: { title: string }) => project.title.startsWith("Embed "));
    expect(mine.map((project: { publication: string }) => project.publication)).toEqual(["published", "changed", "draft"]);
    expect(mine[0]).toMatchObject({ id: ids.published, title: "Embed published", presentation: { key: "fixture-sidewalk-project", kind: "custom" }, publicUrl: expect.stringMatching(/\/data\/embed-published\/$/), dataUpdatedAt: expect.any(String) });
    expect(mine[2]).toMatchObject({ publicUrl: null, publishedAt: null });
    // Never the project's configuration, rows or release hashes.
    const json = JSON.stringify(listed.body);
    expect(json).not.toMatch(/"bindings"|"settings"|"methodology"|sha256|release|source_notes/);
    expect(json).not.toContain(PRIVATE);
  });

  it("searches the title, the deck and the presentation's name, within a bound", async () => {
    const titled = await call("get", "/byline/data/projects", "staff", { search: { search: "published" } });
    expect(titled.body.projects.map((project: { id: number }) => project.id)).toContain(ids.published);
    expect(titled.body.projects.map((project: { id: number }) => project.id)).not.toContain(ids.draft);
    const byDeck = await call("get", "/byline/data/projects", "staff", { search: { search: "draft-only deck" } });
    expect(byDeck.body.projects.map((project: { id: number }) => project.id)).toEqual([ids.changed]);
    const byPresentation = await call("get", "/byline/data/projects", "staff", { search: { search: "sidewalk" } });
    expect(byPresentation.body.projects.length).toBeGreaterThanOrEqual(3);
    expect((await call("get", "/byline/data/projects", "staff", { search: { search: "zzzz-nothing" } })).body.projects).toEqual([]);
    for (let index = 0; index < 22; index++) await createProject(`Bulk ${index}`);
    expect((await call("get", "/byline/data/projects", "staff")).body.projects.length).toBeLessThanOrEqual(20);
  });

  it("reports one project's state, and a missing one as not found", async () => {
    expect((await call("get", "/byline/data/projects/:id/choice", "staff", { params: { id: ids.published } })).body.project).toMatchObject({ id: ids.published, publication: "published" });
    expect((await call("get", "/byline/data/projects/:id/choice", "staff", { params: { id: ids.changed } })).body.project).toMatchObject({ publication: "changed", deck: "A draft-only deck." });
    expect((await call("get", "/byline/data/projects/:id/choice", "staff", { params: { id: ids.draft } })).body.project).toMatchObject({ publication: "draft" });
    expect((await call("get", "/byline/data/projects/:id/choice", "staff", { params: { id: 999999 } })).status).toBe(404);
  });
});

describe("publishing a Story that embeds a project", () => {
  it("saves a draft with a missing, unset or unpublished project, then refuses publication with the reason", async () => {
    const id = await newStory("staff", body(paragraph("Text."), embed(null, "", "")));
    await saveBody("staff", id, body(paragraph("Text."), embed(ids.draft)));
    expect(await refusal(id)).toMatch(/Data Project: Publish this Data Project before publishing the story/);
    await saveBody("staff", id, body(paragraph("Text."), embed(999999)));
    expect(await refusal(id)).toMatch(/Data Project: Publish this Data Project before publishing the story, or choose another\./);
    await saveBody("staff", id, body(paragraph("Text."), embed(ids.published, "", "Described.")));
    expect(await refusal(id)).toMatch(/Data Project: Give the Data Project a heading for this story\./);
    await saveBody("staff", id, body(paragraph("Text."), embed(ids.published, "Heading", "")));
    expect(await refusal(id)).toMatch(/Data Project: Describe what it shows/);
  });

  it("publishes for a project with unpublished changes, and the public snapshot carries the published version", async () => {
    const id = await newStory("staff", body(paragraph("Text."), embed(ids.changed)));
    await expect(publish(id)).resolves.toMatchObject({ _status: "published" });
    ids.story = id;
    const snap = await snapshot();
    const row = snap.datasets.stories.find((entry) => entry.id === id)!;
    if (row.body.format !== "byline-v1") throw new Error("expected a structured body");
    expect(row.body.nodes.filter((node) => node.type === "dataProject")).toEqual([expect.objectContaining({ project: ids.changed, title: "Where the sidewalk stands" })]);
    const project = snap.data.projects.find((entry) => entry.id === ids.changed)!;
    // The reader gets the published version: the draft-only deck is not public.
    expect(project.deck).toBe("");
    expect(project.title).toBe("Embed changed");
    const json = JSON.stringify(snap);
    expect(json).not.toContain(PRIVATE);
    expect(json).not.toContain("source_notes");
    // The release descriptors are exactly the dataset's current release.
    const current = (await call("get", "/byline/data/datasets/:id", "editor", { params: { id: ids.dataset } })).body.release;
    expect(snap.data.releases).toEqual([expect.objectContaining({ sha256: current.sha256, bytes: current.bytes })]);
  });

  it("embeds a published project that search engines may not index", async () => {
    const hidden = await createProject("Embed noindex");
    const detail = (await call("get", "/byline/data/projects/:id", "editor", { params: { id: hidden } })).body;
    expect((await call("patch", "/byline/data/projects/:id", "editor", { params: { id: hidden }, data: { indexing: "noindex", expectedUpdatedAt: detail.project.updatedAt } })).status).toBe(200);
    await publishProject(hidden);
    const id = await newStory("editor", body(paragraph("Text."), embed(hidden)));
    await expect(publish(id)).resolves.toMatchObject({ _status: "published" });
    expect((await snapshot()).data.projects.find((entry) => entry.id === hidden)).toMatchObject({ indexing: "noindex" });
  });

  it("keeps the story body free of Data configuration, whatever the editor sent", async () => {
    const stored = (await payload.findByID({ collection: "stories", id: ids.story, draft: true, depth: 0, overrideAccess: true })) as Story;
    const blocks = ((stored.body as unknown as { root: { children: Array<{ fields?: Record<string, unknown> }> } }).root.children).filter((node) => node.fields?.blockType === "dataProject");
    expect(blocks).toHaveLength(1);
    expect(Object.keys(blocks[0]!.fields!).sort()).toEqual(["blockName", "blockType", "description", "id", "project", "title"]);
  });
});

describe("a project that published Stories depend on", () => {
  it("cannot be unpublished or deleted while a published Story shows it, with a message that says why", async () => {
    const unpublish = await call("post", "/byline/data/projects/:id/unpublish", "editor", { params: { id: ids.changed } });
    expect(unpublish.status).toBe(409);
    expect(unpublish.body.message ?? unpublish.body.errors?.[0]?.message).toMatch(/used by 1 published story .*Remove it from that story before unpublishing/);
    const remove = await call("delete", "/byline/data/projects/:id", "editor", { params: { id: ids.changed } });
    expect(remove.status).toBe(409);
    await expect(payload.delete({ collection: "data-projects", id: ids.changed, overrideAccess: true })).rejects.toThrow(/used by 1 published story/);
    expect((await call("get", "/byline/data/projects/:id/choice", "staff", { params: { id: ids.changed } })).body.project.publication).toBe("changed");
  });

  it("fails the snapshot closed, never dropping the embed, if it is unpublished some other way", async () => {
    await payload.update({ collection: "data-projects", id: ids.changed, draft: false, data: { _status: "draft" } as never, overrideAccess: true });
    await expect(snapshot()).rejects.toThrow(/Data Project|cannot be projected/);
    await payload.update({ collection: "data-projects", id: ids.changed, draft: false, data: { _status: "published" } as never, overrideAccess: true });
    await expect(snapshot()).resolves.toMatchObject({ schemaVersion: 3 });
  });

  it("can be unpublished and deleted once no published Story shows it, and draft Stories do not count", async () => {
    const lone = await createProject("Embed lone");
    await publishProject(lone);
    const draftStory = await newStory("staff", body(paragraph("Text."), embed(lone)));
    expect((await call("post", "/byline/data/projects/:id/unpublish", "editor", { params: { id: lone } })).status).toBe(200);
    await publishProject(lone);
    await expect(publish(draftStory)).resolves.toMatchObject({ _status: "published" });
    expect((await call("post", "/byline/data/projects/:id/unpublish", "editor", { params: { id: lone } })).status).toBe(409);
    // Taking the block out of the Story (and republishing it) frees the project.
    await saveBody("editor", draftStory, body(paragraph("Text only.")));
    await publish(draftStory);
    expect((await call("post", "/byline/data/projects/:id/unpublish", "editor", { params: { id: lone } })).status).toBe(200);
    expect((await call("delete", "/byline/data/projects/:id", "editor", { params: { id: lone } })).status).toBe(200);
  });
});
