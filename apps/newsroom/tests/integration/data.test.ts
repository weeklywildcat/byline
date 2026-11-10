import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultFieldOptions, parseReleaseBytes, type DatasetSchema, type FieldDefinition } from "@byline/data";
import { dataEndpoints } from "../../src/data/endpoints";
import { publishDatasetRelease } from "../../src/data/releases";
import { DataReleaseStore } from "../../src/data/store";
import { readCurrentRevision } from "../../src/db/publication-state";
import { collectPublicSnapshot } from "../../src/public/snapshot/collect";
import type { User } from "../../src/payload-types";

/**
 * Byline Data against real PostgreSQL (docs/byline-data.md): access on every
 * endpoint, server-side value validation, schema evolution with stable keys,
 * field-level edit conflicts, the release fence and its races, CSV import and
 * export, project publication, Snapshot v3 descriptors, and a private field
 * that never reaches any public artifact.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const TOKEN = "data-test-build-token-0123456789abcdef-0123456789";
const PRIVATE = "PRIVATE-SOURCE-SENTINEL-555-0100";

async function account(key: string, role: User["role"]) {
  const user = await payload.create({ collection: "users", data: { email: `data-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true } });
  accounts[key] = { ...user, collection: "users" } as User;
}

type Call = { status: number; body: any; response: Response };
async function call(method: string, path: string, key: string | null, options: { data?: unknown; params?: Record<string, string | number>; search?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<Call> {
  const endpoint = dataEndpoints.find((candidate) => candidate.method === method && candidate.path === path);
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const req = await createLocalReq(key ? { user: accounts[key] } : {}, payload);
  Object.assign(req, {
    routeParams: Object.fromEntries(Object.entries(options.params ?? {}).map(([name, value]) => [name, String(value)])),
    data: options.data ?? {},
    searchParams: new URLSearchParams(options.search ?? {}),
    headers: new Headers(options.headers ?? {})
  });
  if (!key) req.user = null;
  const response = (await endpoint.handler(req)) as Response;
  const text = await response.clone().text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* CSV and artifacts */
  }
  return { status: response.status, body, response };
}

const field = (key: string, label: string, type: FieldDefinition["type"], extra: Partial<FieldDefinition> = {}): FieldDefinition =>
  ({ key, label, type, required: false, visibility: "public", options: defaultFieldOptions(type), ...extra }) as FieldDefinition;

const PHASES: DatasetSchema = {
  fields: [
    field("name", "Phase", "text", { required: true }),
    field("status", "Status", "select", { options: { choices: [{ value: "done", label: "Done", tone: "positive" }, { value: "underway", label: "Underway", tone: "caution" }, { value: "planned", label: "Planned" }] } } as never),
    field("detail", "Detail", "longText"),
    field("date", "Date", "date"),
    field("source_notes", "Source notes", "longText", { visibility: "private" })
  ],
  retiredKeys: []
};

const ids: Record<string, number> = {};
let firstSha = "";
const snapshot = async () => collectPublicSnapshot(payload, { revision: await readCurrentRevision(payload) });
const rows = async (key = "staff", query?: unknown) => (await call("get", "/byline/data/datasets/:id/rows", key, { params: { id: ids.phases }, search: query ? { query: JSON.stringify(query) } : {} })).body;
const detail = async () => (await call("get", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases } })).body;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_data`;
  process.env.DATABASE_URL = url.toString();
  process.env.BYLINE_STORY_PRESENTATION_FIXTURES = "1";
  process.env.BYLINE_BUILD_TOKEN = TOKEN;
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("staff", "staff");
}, 300_000);

afterAll(async () => {
  delete process.env.BYLINE_BUILD_TOKEN;
  await payload?.db?.destroy?.();
});

describe("access", () => {
  it("lets staff read and edit rows, and keeps schemas, publication and projects to editors, on the server", async () => {
    expect((await call("get", "/byline/data", null)).status).toBe(401);
    expect((await call("post", "/byline/data/datasets", "staff", { data: { title: "Nope" } })).status).toBe(403);
    const created = await call("post", "/byline/data/datasets", "editor", { data: { title: "Main Street sidewalk phases", schema: PHASES } });
    expect(created.status).toBe(200);
    expect(created.body.key).toBe("main-street-sidewalk-phases");
    ids.phases = created.body.id;
    expect((await call("patch", "/byline/data/datasets/:id", "staff", { params: { id: ids.phases }, data: { schema: PHASES, baseSchema: PHASES } })).status).toBe(403);
    expect((await call("post", "/byline/data/datasets/:id/publish", "staff", { params: { id: ids.phases } })).status).toBe(403);
    expect((await call("post", "/byline/data/projects", "staff", { data: { title: "x", presentation: "table" } })).status).toBe(403);
    const overview = (await call("get", "/byline/data", "staff")).body;
    expect(overview.datasets.map((entry: { key: string }) => entry.key)).toContain("main-street-sidewalk-phases");
    expect(overview.capabilities).toEqual({ editSchema: false, publish: false, manageProjects: false });
    // The raw collection refuses too: a hidden screen is not security.
    await expect(payload.create({ collection: "data-datasets", data: { title: "Raw", key: "raw", schema: PHASES } as never, user: accounts.staff, overrideAccess: false })).rejects.toThrow();
  });
});

describe("rows", () => {
  it("validates every write on the server and fails closed on unknown fields", async () => {
    const add = await call("post", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { rows: [
      { values: { name: "Survey and design", status: "done", detail: "Finished in March 2025.", date: "2025-03-14", source_notes: PRIVATE } },
      { values: { name: "North segment", status: "done", detail: "Opened Aug. 18, 2025.", date: "2025-08-18" } },
      { values: { name: "Greenwood High crossing", status: "underway", detail: "Signals arrive in November." } },
      { values: { name: "Not ready to publish", status: "planned" }, included: false }
    ] } });
    expect(add.status).toBe(200);
    expect(add.body.rows).toHaveLength(4);
    expect(add.body.rows[0].id).toMatch(/^r[0-9a-f]{12}$/);
    expect((await call("post", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { rows: [{ values: { status: "finished" } }] } })).status).toBe(400);
    expect((await call("post", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { rows: [{ values: { nope: 1 } }] } })).status).toBe(400);
    expect((await call("post", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { rows: [{ values: { date: "2025-02-30" } }] } })).status).toBe(400);
    const page = await rows();
    expect(page.total).toBe(4);
    expect(page.rows.map((row: { values: { name: string } }) => row.values.name)).toEqual(["Survey and design", "North segment", "Greenwood High crossing", "Not ready to publish"]);
  });

  it("queries through the closed language: validated fields and operators, bounded pages", async () => {
    expect((await rows("staff", { filters: [{ field: "status", op: "equals", value: "done" }] })).total).toBe(2);
    expect((await call("get", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, search: { query: JSON.stringify({ filters: [{ field: "name", op: "gt", value: 1 }] }) } })).status).toBe(400);
    expect((await call("get", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, search: { query: JSON.stringify({ limit: 5000 }) } })).status).toBe(400);
    expect((await rows("staff", { limit: 2, offset: 2 })).rows).toHaveLength(2);
  });

  it("merges edits to different cells and refuses a stale edit to the same cell", async () => {
    const [survey] = (await rows()).rows;
    const first = await call("patch", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { changes: [{ id: survey.id, values: { detail: "Finished in March." }, base: { detail: survey.values.detail } }] } });
    expect(first.status).toBe(200);
    // Someone who loaded the row before that edit changes another cell: both win.
    const second = await call("patch", "/byline/data/datasets/:id/rows", "editor", { params: { id: ids.phases }, data: { changes: [{ id: survey.id, values: { date: "2025-03-15" }, base: { date: survey.values.date } }] } });
    expect(second.status).toBe(200);
    expect(second.body.rows[0].values).toMatchObject({ detail: "Finished in March.", date: "2025-03-15" });
    // The same stale reader changing the edited cell is a conflict, and nothing is written.
    const stale = await call("patch", "/byline/data/datasets/:id/rows", "editor", { params: { id: ids.phases }, data: { changes: [{ id: survey.id, values: { detail: "Overwrite" }, base: { detail: survey.values.detail } }] } });
    expect(stale.status).toBe(409);
    expect(stale.body.data.conflicts[0]).toMatchObject({ field: "detail", current: "Finished in March." });
    expect((await rows()).rows[0].values.detail).toBe("Finished in March.");
  });
});

describe("schema", () => {
  it("keeps keys stable across relabels, refuses unsafe changes, and detects stale schema edits", async () => {
    const before = (await detail()).dataset.schema as DatasetSchema;
    const relabeled = { ...before, fields: before.fields.map((entry) => (entry.key === "name" ? { ...entry, label: "Phase name" } : entry)) };
    const saved = await call("patch", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases }, data: { schema: relabeled, baseSchema: before } });
    expect(saved.status).toBe(200);
    expect(saved.body.dataset.schema.fields[0]).toMatchObject({ key: "name", label: "Phase name" });
    expect((await call("patch", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases }, data: { schema: relabeled, baseSchema: before } })).status).toBe(409);
    const retyped = { ...relabeled, fields: relabeled.fields.map((entry) => (entry.key === "date" ? { ...entry, type: "integer", options: {} } : entry)) };
    expect((await call("patch", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases }, data: { schema: retyped, baseSchema: relabeled } })).status).toBe(400);
    const withoutDone = { ...relabeled, fields: relabeled.fields.map((entry) => (entry.type === "select" ? { ...entry, options: { choices: entry.options.choices.filter((choice) => choice.value !== "done") } } : entry)) };
    expect((await call("patch", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases }, data: { schema: withoutDone, baseSchema: relabeled } })).status).toBe(409);
    const reused = { fields: [...relabeled.fields, field("old", "Old", "text")], retiredKeys: ["old"] };
    expect((await call("patch", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases }, data: { schema: reused, baseSchema: relabeled } })).status).toBe(400);
  });
});

describe("releases", () => {
  it("publishes an immutable release of included rows and public fields only, and advances the public revision", async () => {
    const publicBefore = await readCurrentRevision(payload);
    const working = (await detail()).dataset.workingRevision;
    expect((await call("post", "/byline/data/datasets/:id/publish", "editor", { params: { id: ids.phases }, data: { expectedRevision: working - 1 } })).status).toBe(409);
    const published = await call("post", "/byline/data/datasets/:id/publish", "editor", { params: { id: ids.phases }, data: { expectedRevision: working } });
    expect(published.status).toBe(200);
    expect(published.body.release).toMatchObject({ records: 3, fields: 4, revision: working });
    expect(await readCurrentRevision(payload)).toBeGreaterThan(publicBefore);
    const store = new DataReleaseStore();
    const bytes = await store.read(published.body.release.sha256, published.body.release.bytes);
    expect(bytes).not.toBeNull();
    const text = bytes!.toString("utf8");
    expect(createHash("sha256").update(bytes!).digest("hex")).toBe(published.body.release.sha256);
    expect(text).not.toContain(PRIVATE);
    expect(text).not.toContain("source_notes");
    expect(text).not.toContain("Not ready to publish");
    expect(parseReleaseBytes(text).records.map((record) => record.values.name)).toEqual(["Survey and design", "North segment", "Greenwood High crossing"]);
    expect((await detail()).publication).toBe("published");
    firstSha = published.body.release.sha256;
  });

  it("refuses rows that would publish incomplete required facts", async () => {
    const added = await call("post", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { rows: [{ values: { status: "planned" } }] } });
    expect((await detail()).publication).toBe("changed");
    const refused = await call("post", "/byline/data/datasets/:id/publish", "editor", { params: { id: ids.phases } });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/missing Phase name/);
    expect((await call("post", "/byline/data/datasets/:id/rows/delete", "staff", { params: { id: ids.phases }, data: { ids: [added.body.rows[0].id] } })).status).toBe(200);
  });

  it("loses the race when the data changes during collection or before promotion", async () => {
    const editRow = async () => {
      const [first] = (await rows()).rows;
      await call("patch", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { changes: [{ id: first.id, values: { detail: `Edited ${Date.now()}` }, base: { detail: first.values.detail } }] } });
    };
    const req = await createLocalReq({ user: accounts.editor }, payload);
    await expect(publishDatasetRelease(req, ids.phases, { actor: accounts.editor.id, hooks: { afterCollect: editRow } })).rejects.toMatchObject({ status: 409 });
    const req2 = await createLocalReq({ user: accounts.editor }, payload);
    const before = (await detail()).release.sha256;
    await expect(publishDatasetRelease(req2, ids.phases, { actor: accounts.editor.id, hooks: { beforePromote: editRow } })).rejects.toMatchObject({ status: 409 });
    expect((await detail()).release.sha256).toBe(before);
  });
});

describe("import and export", () => {
  it("previews CSV with row errors, refuses to commit them, and commits valid files in one transaction", async () => {
    const bad = "Phase name,Status,Date\nSouth segment,Planned,2026-01-15\nLighting,Someday,soon\n";
    const mapping = ["name", "status", "date"];
    const preview = await call("post", "/byline/data/datasets/:id/import", "staff", { params: { id: ids.phases }, data: { text: bad, mapping } });
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toMatchObject({ rows: 2, creates: 2 });
    expect(preview.body.preview.issues.map((issue: { row: number; column: string }) => `${issue.row}:${issue.column}`)).toEqual(["3:Status", "3:Date"]);
    const total = (await rows()).total;
    expect((await call("post", "/byline/data/datasets/:id/import", "staff", { params: { id: ids.phases }, data: { text: bad, mapping, commit: true } })).status).toBe(400);
    expect((await rows()).total).toBe(total);
    const good = "Phase name,Status,Date\nSouth segment,Planned,2026-01-15\nLighting,Planned,\n";
    expect((await call("post", "/byline/data/datasets/:id/import", "staff", { params: { id: ids.phases }, data: { text: good, mapping, commit: true } })).body.committed).toBe(true);
    expect((await rows()).total).toBe(total + 2);
    // A column mapped to the row ID updates in place.
    const south = (await rows("staff", { search: "South segment" })).rows[0];
    const update = `ID,Detail\n${south.id},Bids due in January 2026.\n`;
    expect((await call("post", "/byline/data/datasets/:id/import", "staff", { params: { id: ids.phases }, data: { text: update, mapping: ["$id", "detail"], commit: true } })).body.preview).toMatchObject({ updates: 1, creates: 0 });
    expect((await rows("staff", { search: "South segment" })).rows[0].values.detail).toBe("Bids due in January 2026.");
  });

  it("exports public fields by default, all fields only when asked, and defuses formulas", async () => {
    const [first] = (await rows()).rows;
    await call("patch", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { changes: [{ id: first.id, values: { detail: "=HYPERLINK(\"https://evil.example\")" }, base: { detail: first.values.detail } }] } });
    const csv = await call("get", "/byline/data/datasets/:id/export", "staff", { params: { id: ids.phases } });
    expect(csv.response.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.body).toContain("'=HYPERLINK");
    expect(csv.body).not.toContain(PRIVATE);
    expect(csv.body).not.toContain("Source notes");
    expect((await call("get", "/byline/data/datasets/:id/export", "staff", { params: { id: ids.phases }, search: { fields: "all" } })).body).toContain(PRIVATE);
  });
});

describe("projects and the public snapshot", () => {
  it("binds a template, refuses publication until the data is published, and leaves drafts private", async () => {
    const created = await call("post", "/byline/data/projects", "editor", { data: { title: "Main Street sidewalk", presentation: "fixture-sidewalk-project", dataset: "main-street-sidewalk-phases" } });
    expect(created.status).toBe(200);
    ids.project = created.body.id;
    const project = (await call("get", "/byline/data/projects/:id", "editor", { params: { id: ids.project } })).body;
    // Roles are filled by matching label or key and a compatible type; the editor can change any of them.
    expect(project.project.bindings[0]).toMatchObject({ slot: "phases", dataset: "main-street-sidewalk-phases", fields: { name: "name", status: "status", detail: "detail", date: "date" } });
    expect(project.issues).toEqual([]);
    expect(project.releases[0]).toMatchObject({ dataset: "main-street-sidewalk-phases", publication: "changed" });
    const bound = await call("patch", "/byline/data/projects/:id", "editor", { params: { id: ids.project }, data: { bindings: [{ ...project.project.bindings[0], fields: { ...project.project.bindings[0].fields, name: "source_notes" } }], source: "City engineering department.", methodology: "We check the city's project page every week.", expectedUpdatedAt: project.project.updatedAt } });
    expect(bound.status).toBe(200);
    // A private field can be previewed but never published.
    expect(bound.body.issues.join(" ")).toMatch(/isn't public in the published data|private/);
    const fixed = await call("patch", "/byline/data/projects/:id", "editor", { params: { id: ids.project }, data: { bindings: [{ ...project.project.bindings[0], fields: { ...project.project.bindings[0].fields, name: "name" } }], expectedUpdatedAt: bound.body.project.updatedAt } });
    expect(fixed.body.issues).toEqual([]);
    expect((await call("patch", "/byline/data/projects/:id", "editor", { params: { id: ids.project }, data: { title: "Stale", expectedUpdatedAt: project.project.updatedAt } })).status).toBe(409);
    expect((await snapshot()).data.projects).toEqual([]);
  });

  it("publishes the project into Snapshot v3 with exact release descriptors and no private data", async () => {
    const before = await readCurrentRevision(payload);
    const published = await call("post", "/byline/data/projects/:id/publish", "editor", { params: { id: ids.project } });
    expect(published.status).toBe(200);
    expect(published.body.publication).toBe("published");
    expect(await readCurrentRevision(payload)).toBeGreaterThan(before);
    const snap = await snapshot();
    expect(snap.schemaVersion).toBe(3);
    const current = (await detail()).release;
    expect(snap.data.projects).toHaveLength(1);
    expect(snap.data.projects[0]).toMatchObject({ slug: "main-street-sidewalk", href: "/data/main-street-sidewalk/", presentation: { kind: "custom", key: "fixture-sidewalk-project" }, source: "City engineering department." });
    expect(snap.data.projects[0].bindings[0].release).toBe(current.sha256);
    expect(snap.data.releases).toEqual([expect.objectContaining({ sha256: current.sha256, bytes: current.bytes, dataset: "main-street-sidewalk-phases", records: 3 })]);
    const json = JSON.stringify(snap);
    expect(json).not.toContain(PRIVATE);
    expect(json).not.toContain("source_notes");
    expect(json).not.toContain("releasedBy");
  });

  it("keeps the public page on its release while working data changes, then uses exactly the next release", async () => {
    const first = (await snapshot()).data.releases[0].sha256;
    // The import and edits above already changed the working data.
    expect((await detail()).publication).toBe("changed");
    expect((await snapshot()).data.releases[0].sha256).toBe(first);
    const [row] = (await rows()).rows;
    await call("patch", "/byline/data/datasets/:id/rows", "staff", { params: { id: ids.phases }, data: { changes: [{ id: row.id, values: { detail: "Finished in March 2025." }, base: { detail: row.values.detail } }] } });
    const next = await call("post", "/byline/data/datasets/:id/publish", "editor", { params: { id: ids.phases } });
    expect(next.status).toBe(200);
    expect(next.body.release.sha256).not.toBe(first);
    expect((await snapshot()).data.releases[0].sha256).toBe(next.body.release.sha256);
  });

  it("refuses a release that would break a published project", async () => {
    const current = (await detail()).dataset;
    const privateName = { ...current.schema, fields: current.schema.fields.map((entry: FieldDefinition) => (entry.key === "name" ? { ...entry, visibility: "private" } : entry)) };
    expect((await call("patch", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases }, data: { schema: privateName, baseSchema: current.schema } })).status).toBe(200);
    const refused = await call("post", "/byline/data/datasets/:id/publish", "editor", { params: { id: ids.phases } });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/break public projects/);
    expect((await call("patch", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases }, data: { schema: current.schema, baseSchema: privateName } })).status).toBe(200);
  });

  it("serves only current release bytes to the build, with the build credential", async () => {
    const { sha256, bytes } = (await detail()).release;
    const path = "/byline/build/data/:sha256";
    expect((await call("get", path, null, { params: { sha256 } })).status).toBe(401);
    const served = await call("get", path, null, { params: { sha256 }, headers: { authorization: `Bearer ${TOKEN}` } });
    expect(served.status).toBe(200);
    expect(Number(served.response.headers.get("content-length"))).toBe(bytes);
    expect((await call("get", path, null, { params: { sha256: firstSha }, headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
    expect((await call("get", path, null, { params: { sha256: "0".repeat(64) }, headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
  });

  it("won't delete a dataset still used by the published project when the latest draft switches away", async () => {
    const current = (await call("get", "/byline/data/projects/:id", "editor", { params: { id: ids.project } })).body;
    const originalBindings = current.project.bindings;
    const changed = await call("patch", "/byline/data/projects/:id", "editor", {
      params: { id: ids.project },
      data: { bindings: [], expectedUpdatedAt: current.project.updatedAt }
    });
    expect(changed.status).toBe(200);
    expect(changed.body.publication).toBe("changed");
    expect((await call("delete", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases } })).status).toBe(409);
    const restored = await call("patch", "/byline/data/projects/:id", "editor", {
      params: { id: ids.project },
      data: { bindings: originalBindings, expectedUpdatedAt: changed.body.project.updatedAt }
    });
    expect(restored.status).toBe(200);
  });

  it("won't delete a dataset a project uses, and unpublishing removes the project from the snapshot", async () => {
    expect((await call("delete", "/byline/data/datasets/:id", "editor", { params: { id: ids.phases } })).status).toBe(409);
    expect((await call("post", "/byline/data/projects/:id/unpublish", "editor", { params: { id: ids.project } })).body.publication).toBe("draft");
    expect((await snapshot()).data).toEqual({ projects: [], releases: [] });
    // Nothing from the store is ever deleted eagerly.
    const { sha256 } = (await detail()).release;
    expect(readFileSync(new DataReleaseStore().pathFor(`${sha256}.json`)!).byteLength).toBeGreaterThan(0);
  });
});
