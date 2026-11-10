import { sql } from "@payloadcms/db-postgres";
import {
  DATASET_KEY_PATTERN,
  canonicalJson,
  dataProjectPath,
  emptyDatasetSchema,
  evaluateQuery,
  fieldKeyFromLabel,
  normalizeSettings,
  validateBindings,
  validateDatasetSchema,
  validateQuery,
  type DataPresentationDescriptor,
  type DataReleaseDescriptor,
  type DatasetSchema,
  type FieldDefinition,
  type ProjectBinding,
  type RecordValues
} from "@byline/data";
import { CsvError, datasetToCsv, parseDelimited, previewImport, type ColumnMapping } from "@byline/data/csv";
import { APIError, commitTransaction, initTransaction, killTransaction, type PayloadRequest } from "payload";
import { atLeast, relationId, relationIds } from "../access/user";
import type { ScreenContext } from "../newsroom/screen-models";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { DATA_LIMITS, datasetSchemaOf, PROJECT_SLUG, projectPublicationIssues, storedRelease } from "./collections";
import { DataError } from "./errors";
import { dataPresentationDescriptor, describeServerDataPresentations } from "./registry";
import { publishDatasetRelease, readDatasetRows } from "./releases";
import { lockRecordRows, readWorkingRevision } from "./revision";
import { drizzleFor } from "../publication-media/state";

/**
 * The Data workspace's server (docs/byline-data.md). Every handler re-checks
 * the account; reads and writes run as the signed-in user with
 * `overrideAccess: false`, so Payload's collection access decides. Editor-only
 * actions (schemas, publication, projects) are refused here as well, never
 * merely hidden.
 */

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
const editor = (ctx: ScreenContext) => atLeast(ctx.user, "editor");
function requireEditor(ctx: ScreenContext, what: string) {
  if (!editor(ctx)) throw new APIError(`Only editors ${what}.`, 403);
}

export type DataCapabilities = { editSchema: boolean; publish: boolean; manageProjects: boolean };
const capabilities = (ctx: ScreenContext): DataCapabilities => ({ editSchema: editor(ctx), publish: editor(ctx), manageProjects: editor(ctx) });

export type ReleaseSummary = Pick<DataReleaseDescriptor, "sha256" | "bytes" | "revision" | "releasedAt" | "records"> & { fields: number };
const releaseSummary = (descriptor: DataReleaseDescriptor | undefined | null): ReleaseSummary | null => (descriptor ? { sha256: descriptor.sha256, bytes: descriptor.bytes, revision: descriptor.revision, releasedAt: descriptor.releasedAt, records: descriptor.records, fields: descriptor.fields.length } : null);

export type DatasetPublication = "unpublished" | "published" | "changed";
function datasetPublication(workingRevision: number, release: ReleaseSummary | null): DatasetPublication {
  if (!release) return "unpublished";
  return release.revision === workingRevision ? "published" : "changed";
}

type DatasetDoc = { id: number; title: string; key: string; description?: string | null; schema: unknown; workingRevision?: number | null; workingChangedAt?: string | null; release?: unknown; updatedAt: string };
type ProjectDoc = { id: number; title: string; slug: string; deck?: string | null; presentationKind: "template" | "custom"; presentation: string; bindings: unknown; settings: unknown; source?: string | null; methodology?: string | null; indexing: "public" | "noindex"; relatedStories?: unknown; publishedAt?: string | null; updatedAt: string; _status?: "draft" | "published" | null };

async function recordCounts(ctx: ScreenContext): Promise<Map<number, number>> {
  const db = await drizzleFor(ctx.req.payload, ctx.req);
  const result = await db.execute(sql`select dataset_id, count(*)::int as n from data_records group by dataset_id`);
  return new Map(result.rows.map((row) => [Number(row.dataset_id), Number(row.n)]));
}

async function publicSite(ctx: ScreenContext) {
  return publicationConfigFromGlobal(await readPublishedPublication(ctx.req.payload, ctx.req), 0).urls.publicSite.replace(/\/+$/, "");
}

/* ------------------------------------------------------------ overview */

export type DatasetSummary = { id: number; title: string; key: string; description: string; fields: number; records: number; workingRevision: number; changedAt: string | null; release: ReleaseSummary | null; publication: DatasetPublication; usedBy: Array<{ id: number; title: string }> };
export type ProjectPublication = "draft" | "published" | "changed";
export type ProjectSummary = { id: number; title: string; slug: string; deck: string; presentation: { key: string; kind: "template" | "custom"; name: string; available: boolean }; publication: ProjectPublication; datasets: string[]; publishedAt: string | null; updatedAt: string; publicUrl: string | null };
export type DataOverview = { datasets: DatasetSummary[]; projects: ProjectSummary[]; presentations: DataPresentationDescriptor[]; capabilities: DataCapabilities; timeZone: string };

function bindingsOf(value: unknown): ProjectBinding[] {
  return Array.isArray(value) ? (value as ProjectBinding[]).filter((entry) => entry && typeof entry === "object" && typeof entry.dataset === "string" && typeof entry.slot === "string") : [];
}

async function projectRows(ctx: ScreenContext) {
  const [latest, main] = await Promise.all([
    ctx.req.payload.find({ collection: "data-projects", draft: true, pagination: false, sort: "-updatedAt", ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "data-projects", draft: false, pagination: false, select: { _status: true, updatedAt: true, slug: true, publishedAt: true }, ...asUser(ctx) })
  ]);
  const published = new Map(main.docs.map((row) => [row.id, row]));
  return latest.docs.map((row) => ({ latest: row as unknown as ProjectDoc, main: published.get(row.id) as { _status?: string; updatedAt: string; slug: string; publishedAt?: string | null } | undefined }));
}

function projectPublication(latest: ProjectDoc, main: { _status?: string | null; updatedAt: string } | undefined): ProjectPublication {
  if (main?._status !== "published") return "draft";
  return latest._status === "draft" && Date.parse(latest.updatedAt) > Date.parse(main.updatedAt) ? "changed" : "published";
}

export async function dataOverview(ctx: ScreenContext): Promise<DataOverview> {
  const [datasets, projects, counts, site] = await Promise.all([
    ctx.req.payload.find({ collection: "data-datasets", pagination: false, sort: "title", ...asUser(ctx) }),
    projectRows(ctx),
    recordCounts(ctx),
    publicSite(ctx)
  ]);
  const usage = new Map<string, Array<{ id: number; title: string }>>();
  for (const { latest } of projects) for (const binding of bindingsOf(latest.bindings)) usage.set(binding.dataset, [...(usage.get(binding.dataset) ?? []), { id: latest.id, title: latest.title }]);
  return {
    datasets: (datasets.docs as unknown as DatasetDoc[]).map((row) => {
      const release = releaseSummary(storedRelease(row.release)?.descriptor);
      const schema = validateDatasetSchema(row.schema);
      const workingRevision = Number(row.workingRevision ?? 0);
      return {
        id: row.id, title: row.title, key: row.key, description: row.description ?? "", fields: schema.ok ? schema.value.fields.length : 0,
        records: counts.get(row.id) ?? 0, workingRevision, changedAt: row.workingChangedAt ?? null, release, publication: datasetPublication(workingRevision, release),
        usedBy: [...new Map((usage.get(row.key) ?? []).map((entry) => [entry.id, entry])).values()]
      };
    }),
    projects: projects.map(({ latest, main }) => {
      const descriptor = dataPresentationDescriptor(latest.presentation);
      const publication = projectPublication(latest, main);
      return {
        id: latest.id, title: latest.title, slug: latest.slug, deck: latest.deck ?? "",
        presentation: { key: latest.presentation, kind: latest.presentationKind, name: descriptor?.name ?? latest.presentation, available: Boolean(descriptor) },
        publication, datasets: [...new Set(bindingsOf(latest.bindings).map((binding) => binding.dataset))],
        publishedAt: main?.publishedAt ?? null, updatedAt: latest.updatedAt,
        publicUrl: publication === "draft" ? null : `${site}${dataProjectPath(main?.slug ?? latest.slug)}`
      };
    }),
    presentations: describeServerDataPresentations(),
    capabilities: capabilities(ctx),
    timeZone: ctx.timeZone
  };
}

/* ------------------------------------------------------------ datasets */

export type FieldInput = { label: string; type: FieldDefinition["type"] };

async function uniqueDatasetKey(ctx: ScreenContext, title: string): Promise<string> {
  const base = fieldKeyFromLabel(title, []).replace(/_/g, "-").replace(/^f-/, "").slice(0, 56) || "dataset";
  const taken = new Set((await ctx.req.payload.find({ collection: "data-datasets", where: { key: { like: base } }, pagination: false, select: { key: true }, ...asUser(ctx) })).docs.map((row) => row.key));
  let key = base;
  for (let suffix = 2; taken.has(key); suffix++) key = `${base}-${suffix}`;
  return key;
}

export async function createDataset(ctx: ScreenContext, input: { title?: unknown; key?: unknown; description?: unknown; schema?: unknown }) {
  requireEditor(ctx, "create datasets");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) throw new APIError("Name the dataset.", 400);
  const key = typeof input.key === "string" && input.key ? input.key : await uniqueDatasetKey(ctx, title);
  if (!DATASET_KEY_PATTERN.test(key) || key.length > 64) throw new APIError("The key uses lowercase letters, numbers and hyphens.", 400);
  const schema = input.schema === undefined ? emptyDatasetSchema() : input.schema;
  const doc = await ctx.req.payload.create({ collection: "data-datasets", data: { title, key, description: typeof input.description === "string" ? input.description.trim() : "", schema } as never, ...asUser(ctx) });
  return { id: doc.id, key: doc.key };
}

export type DatasetDetail = {
  dataset: { id: number; title: string; key: string; description: string; schema: DatasetSchema; workingRevision: number; changedAt: string | null; updatedAt: string };
  release: (ReleaseSummary & { fieldKeys: string[] }) | null;
  publication: DatasetPublication;
  records: number;
  usedBy: Array<{ id: number; title: string; publication: ProjectPublication }>;
  /** Other datasets a relationship field can link to. */
  linkable: Array<{ id: number; key: string; title: string }>;
  capabilities: DataCapabilities;
  timeZone: string;
};

async function datasetById(ctx: ScreenContext, id: number): Promise<DatasetDoc> {
  const doc = await ctx.req.payload.findByID({ collection: "data-datasets", id, ...asUser(ctx) }).catch(() => null);
  if (!doc) throw new APIError("That dataset doesn't exist.", 404);
  return doc as unknown as DatasetDoc;
}

export async function datasetDetail(ctx: ScreenContext, id: number): Promise<DatasetDetail> {
  const doc = await datasetById(ctx, id);
  const [counts, projects, others] = await Promise.all([
    recordCounts(ctx),
    projectRows(ctx),
    ctx.req.payload.find({ collection: "data-datasets", where: { id: { not_equals: id } }, pagination: false, select: { key: true, title: true }, ...asUser(ctx) })
  ]);
  const pointer = storedRelease(doc.release);
  const release = releaseSummary(pointer?.descriptor);
  const workingRevision = Number(doc.workingRevision ?? 0);
  return {
    dataset: { id: doc.id, title: doc.title, key: doc.key, description: doc.description ?? "", schema: datasetSchemaOf(doc.schema), workingRevision, changedAt: doc.workingChangedAt ?? null, updatedAt: doc.updatedAt },
    release: release ? { ...release, fieldKeys: pointer!.descriptor.fields.map((field) => field.key) } : null,
    publication: datasetPublication(workingRevision, release),
    records: counts.get(id) ?? 0,
    usedBy: projects.filter(({ latest }) => bindingsOf(latest.bindings).some((binding) => binding.dataset === doc.key)).map(({ latest, main }) => ({ id: latest.id, title: latest.title, publication: projectPublication(latest, main) })),
    linkable: others.docs.map((row) => ({ id: row.id, key: row.key, title: row.title })),
    capabilities: capabilities(ctx),
    timeZone: ctx.timeZone
  };
}

/** Title, description or schema. A schema edit names the schema it started from, compared under a row lock (stale edits are 409). */
export async function updateDataset(ctx: ScreenContext, id: number, input: { title?: unknown; description?: unknown; schema?: unknown; baseSchema?: unknown }) {
  requireEditor(ctx, "change a dataset's fields");
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.length > DATA_LIMITS.title) throw new APIError("Name the dataset.", 400);
    data.title = input.title.trim();
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string" || input.description.length > DATA_LIMITS.description) throw new APIError("The description is too long.", 400);
    data.description = input.description.trim();
  }
  if (input.schema !== undefined) data.schema = input.schema;
  const started = await initTransaction(ctx.req);
  try {
    const db = await drizzleFor(ctx.req.payload, ctx.req);
    await db.execute(sql`select id from data_datasets where id = ${id} for update`);
    const current = await datasetById(ctx, id);
    if (input.schema !== undefined && canonicalJson(input.baseSchema ?? null) !== canonicalJson(current.schema)) {
      throw new DataError("schema-changed", "Someone else changed this dataset's fields. Reload to see their change.", 409);
    }
    await ctx.req.payload.update({ collection: "data-datasets", id, data: data as never, ...asUser(ctx) });
    if (started) await commitTransaction(ctx.req);
  } catch (error) {
    await killTransaction(ctx.req);
    throw error;
  }
  return datasetDetail(ctx, id);
}

export async function deleteDataset(ctx: ScreenContext, id: number) {
  requireEditor(ctx, "delete datasets");
  await inTransaction(ctx, async () => {
    const db = await drizzleFor(ctx.req.payload, ctx.req);
    // Project publication locks the same dataset row before validating its
    // bindings, so deletion cannot slip between its validation and publish.
    await db.execute(sql`select id from data_datasets where id = ${id} for update`);
    await ctx.req.payload.delete({ collection: "data-datasets", id, ...asUser(ctx) });
  });
  return { deleted: true };
}

/* ------------------------------------------------------------- records */

export type DataRow = { id: string; values: RecordValues; included: boolean; position: number; updatedAt: string };
export type RowsPage = { rows: DataRow[]; total: number; workingRevision: number };

/** Rows through the closed query language: validated field IDs and operators, bounded pages. */
export async function queryRows(ctx: ScreenContext, id: number, raw: string | null): Promise<RowsPage> {
  const doc = await datasetById(ctx, id);
  const schema = datasetSchemaOf(doc.schema);
  let input: unknown = {};
  if (raw) {
    try {
      input = JSON.parse(raw);
    } catch {
      throw new APIError("The query is not JSON.", 400);
    }
  }
  const checked = validateQuery(schema, input);
  if (!checked.ok) throw new DataError("invalid-query", checked.issues.map((issue) => issue.message).join(" "), 400, { issues: checked.issues });
  const { docs } = await ctx.req.payload.find({ collection: "data-records", where: { dataset: { equals: id } }, pagination: false, select: { recordId: true, values: true, included: true, position: true, updatedAt: true }, ...asUser(ctx) });
  const rows = docs.map((row) => ({ id: row.recordId, values: (row.values ?? {}) as RecordValues, included: row.included !== false, position: Number(row.position ?? 0), updatedAt: row.updatedAt }));
  const result = evaluateQuery(schema, rows, checked.query);
  return { rows: result.rows, total: result.total, workingRevision: Number(doc.workingRevision ?? 0) };
}

const ROW_BATCH_LIMIT = 1000;

async function maxPosition(ctx: ScreenContext, id: number): Promise<number> {
  const db = await drizzleFor(ctx.req.payload, ctx.req);
  const result = await db.execute(sql`select coalesce(max(position), 0) as max from data_records where dataset_id = ${id}`);
  return Number(result.rows[0]?.max ?? 0);
}

async function inTransaction<T>(ctx: ScreenContext, run: () => Promise<T>): Promise<T> {
  const started = await initTransaction(ctx.req);
  try {
    const result = await run();
    if (started) await commitTransaction(ctx.req);
    return result;
  } catch (error) {
    await killTransaction(ctx.req);
    throw error;
  }
}

const toRow = (doc: { recordId: string; values: unknown; included?: boolean | null; position?: number | null; updatedAt: string }): DataRow => ({ id: doc.recordId, values: (doc.values ?? {}) as RecordValues, included: doc.included !== false, position: Number(doc.position ?? 0), updatedAt: doc.updatedAt });

/** New rows, at the end (or after a position), all in one transaction. */
export async function createRows(ctx: ScreenContext, id: number, input: { rows?: unknown; after?: unknown }) {
  await datasetById(ctx, id);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length || rows.length > ROW_BATCH_LIMIT) throw new APIError(`Add 1 to ${ROW_BATCH_LIMIT} rows at a time.`, 400);
  return inTransaction(ctx, async () => {
    let position = typeof input.after === "number" && Number.isFinite(input.after) ? input.after : await maxPosition(ctx, id);
    const next = await ctx.req.payload.find({ collection: "data-records", where: { and: [{ dataset: { equals: id } }, { position: { greater_than: position } }] }, sort: "position", limit: 1, select: { position: true }, ...asUser(ctx) });
    const ceiling = next.docs[0]?.position ?? position + rows.length + 1;
    const step = (Number(ceiling) - position) / (rows.length + 1);
    const created: DataRow[] = [];
    for (const entry of rows as Array<{ values?: unknown; included?: unknown; recordId?: unknown; position?: unknown }>) {
      position += step;
      // A row restored by Undo keeps its ID and place; the unique index refuses a duplicate.
      const restored = typeof entry?.recordId === "string" && entry.recordId ? { recordId: entry.recordId } : {};
      const at = typeof entry?.position === "number" && Number.isFinite(entry.position) ? entry.position : position;
      const doc = await ctx.req.payload.create({ collection: "data-records", data: { dataset: id, values: entry?.values ?? {}, included: entry?.included !== false, position: at, ...restored } as never, ...asUser(ctx) });
      created.push(toRow(doc as never));
    }
    return { rows: created, workingRevision: await readWorkingRevision(ctx.req.payload, id, ctx.req) };
  });
}

export type RowChange = { id: string; values?: Record<string, unknown>; base?: Record<string, unknown>; included?: boolean; position?: number };
export type RowConflict = { id: string; field: string; current: unknown };

/**
 * Edits by field, not by row: a change names the value it started from for
 * each field it writes. Under a row lock in the same transaction, a field
 * someone else changed meanwhile is a conflict (409) and nothing is written;
 * two people editing different cells of one row both win.
 */
export async function updateRows(ctx: ScreenContext, id: number, input: { changes?: unknown }) {
  const dataset = await datasetById(ctx, id);
  const schema = datasetSchemaOf(dataset.schema);
  const changes = (Array.isArray(input.changes) ? input.changes : []) as RowChange[];
  if (!changes.length || changes.length > ROW_BATCH_LIMIT) throw new APIError(`Change 1 to ${ROW_BATCH_LIMIT} rows at a time.`, 400);
  const fieldKeys = new Set(schema.fields.map((field) => field.key));
  for (const change of changes) {
    if (typeof change?.id !== "string") throw new APIError("Each change names a row.", 400);
    for (const key of Object.keys(change.values ?? {})) if (!fieldKeys.has(key)) throw new APIError(`There is no field "${key}".`, 400);
  }
  return inTransaction(ctx, async () => {
    const found = await ctx.req.payload.find({ collection: "data-records", where: { and: [{ dataset: { equals: id } }, { recordId: { in: changes.map((change) => change.id) } }] }, pagination: false, select: { recordId: true }, ...asUser(ctx) });
    const byRecord = new Map(found.docs.map((row) => [row.recordId, row.id]));
    const missing = changes.filter((change) => !byRecord.has(change.id));
    if (missing.length) throw new DataError("rows-missing", `${missing.length === 1 ? "A row was" : `${missing.length} rows were`} deleted by someone else.`, 409, { missing: missing.map((change) => change.id) });
    await lockRecordRows(ctx.req, [...byRecord.values()]);
    const locked = await ctx.req.payload.find({ collection: "data-records", where: { id: { in: [...byRecord.values()] } }, pagination: false, select: { recordId: true, values: true, included: true, position: true, updatedAt: true }, ...asUser(ctx) });
    const current = new Map(locked.docs.map((row) => [row.recordId, row]));
    const conflicts: RowConflict[] = [];
    for (const change of changes) {
      const values = (current.get(change.id)?.values ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(change.values ?? {})) {
        if (!change.base || !(key in change.base)) continue;
        if (canonicalJson(values[key] ?? null) !== canonicalJson(change.base[key] ?? null) && canonicalJson(values[key] ?? null) !== canonicalJson(change.values![key] ?? null)) conflicts.push({ id: change.id, field: key, current: values[key] ?? null });
      }
    }
    if (conflicts.length) throw new DataError("edit-conflict", conflicts.length === 1 ? "Someone else changed that cell. Their value is shown now; edit it again if needed." : `Someone else changed ${conflicts.length} of those cells. Their values are shown now.`, 409, { conflicts });
    const updated: DataRow[] = [];
    for (const change of changes) {
      const row = current.get(change.id)!;
      const data: Record<string, unknown> = {};
      if (change.values) data.values = { ...(row.values as object), ...change.values };
      if (typeof change.included === "boolean") data.included = change.included;
      if (typeof change.position === "number" && Number.isFinite(change.position)) data.position = change.position;
      if (!Object.keys(data).length) continue;
      const doc = await ctx.req.payload.update({ collection: "data-records", id: row.id, data: data as never, ...asUser(ctx) });
      updated.push(toRow(doc as never));
    }
    return { rows: updated, workingRevision: await readWorkingRevision(ctx.req.payload, id, ctx.req) };
  });
}

export async function deleteRows(ctx: ScreenContext, id: number, input: { ids?: unknown }) {
  await datasetById(ctx, id);
  const ids = Array.isArray(input.ids) ? input.ids.filter((entry): entry is string => typeof entry === "string") : [];
  if (!ids.length || ids.length > ROW_BATCH_LIMIT) throw new APIError(`Delete 1 to ${ROW_BATCH_LIMIT} rows at a time.`, 400);
  return inTransaction(ctx, async () => {
    const result = await ctx.req.payload.delete({ collection: "data-records", where: { and: [{ dataset: { equals: id } }, { recordId: { in: ids } }] }, ...asUser(ctx) });
    if (result.errors?.length) throw new APIError("Some rows couldn't be deleted.", 403);
    return { deleted: result.docs.length, workingRevision: await readWorkingRevision(ctx.req.payload, id, ctx.req) };
  });
}

/* -------------------------------------------------------- import/export */

export const ROW_ID_COLUMN = "$id";
export type ImportPreviewResult = { rows: number; creates: number; updates: number; issues: Array<{ row: number; column: string; message: string }>; mapped: string[]; ignored: string[]; header: string[]; sample: RecordValues[] };

/**
 * CSV import: parsed and typed on the server (whatever the browser
 * previewed), mapped to stable field keys. A column mapped to `$id` updates
 * the row with that ID instead of adding one. Any cell that is not clearly a
 * value of its field blocks the import; nothing is coerced. Commit is one
 * transaction: all rows or none.
 */
export async function importRows(ctx: ScreenContext, id: number, input: { text?: unknown; mapping?: unknown; commit?: unknown }) {
  const dataset = await datasetById(ctx, id);
  const schema = datasetSchemaOf(dataset.schema);
  if (typeof input.text !== "string") throw new APIError("Choose a CSV file.", 400);
  let table: string[][];
  try {
    table = parseDelimited(input.text);
  } catch (error) {
    if (error instanceof CsvError) throw new APIError(error.message, 400);
    throw error;
  }
  const [header = [], ...body] = table;
  if (!header.length || !body.length) throw new APIError("The file needs a header row and at least one row of data.", 400);
  const mapping = (Array.isArray(input.mapping) ? input.mapping : []) as ColumnMapping;
  if (mapping.length !== header.length || mapping.some((entry) => entry !== null && typeof entry !== "string")) throw new APIError("Map each column to a field or skip it.", 400);
  const idColumn = mapping.indexOf(ROW_ID_COLUMN);
  const fieldMapping = mapping.map((entry) => (entry === ROW_ID_COLUMN ? null : entry));
  let preview;
  try {
    preview = previewImport(header, body, fieldMapping, schema.fields);
  } catch (error) {
    if (error instanceof CsvError) throw new APIError(error.message, 400);
    throw error;
  }
  const recordIds = idColumn >= 0 ? body.map((cells) => (cells[idColumn] ?? "").trim()) : [];
  const existing = idColumn >= 0 ? new Set((await ctx.req.payload.find({ collection: "data-records", where: { and: [{ dataset: { equals: id } }, { recordId: { in: recordIds.filter(Boolean) } }] }, pagination: false, select: { recordId: true }, ...asUser(ctx) })).docs.map((row) => row.recordId)) : new Set<string>();
  const updates = recordIds.filter((entry) => existing.has(entry)).length;
  const result: ImportPreviewResult = { rows: body.length, creates: body.length - updates, updates, issues: preview.issues.slice(0, 200), mapped: preview.mapped, ignored: preview.ignored, header, sample: preview.rows.slice(0, 5) };
  if (input.commit !== true) return { preview: result, committed: false };
  if (preview.issues.length) throw new DataError("import-invalid", `Fix ${preview.issues.length} ${preview.issues.length === 1 ? "cell" : "cells"} first.`, 400, { preview: result });
  await inTransaction(ctx, async () => {
    let position = await maxPosition(ctx, id);
    for (const [index, values] of preview.rows.entries()) {
      const recordId = recordIds[index];
      if (recordId && existing.has(recordId)) {
        const found = await ctx.req.payload.find({ collection: "data-records", where: { and: [{ dataset: { equals: id } }, { recordId: { equals: recordId } }] }, limit: 1, select: { values: true }, ...asUser(ctx) });
        const row = found.docs[0]!;
        await ctx.req.payload.update({ collection: "data-records", id: row.id, data: { values: { ...(row.values as object), ...values } } as never, ...asUser(ctx) });
      } else {
        position += 1;
        await ctx.req.payload.create({ collection: "data-records", data: { dataset: id, values, included: true, position, ...(recordId ? { recordId } : {}) } as never, ...asUser(ctx) });
      }
    }
  });
  return { preview: result, committed: true, workingRevision: await readWorkingRevision(ctx.req.payload, id) };
}

/** CSV export of working rows. Private fields only when asked for explicitly; every cell is defused against formula injection. */
export async function exportRows(ctx: ScreenContext, id: number, scope: string | null): Promise<Response> {
  const dataset = await datasetById(ctx, id);
  const schema = datasetSchemaOf(dataset.schema);
  const fields = scope === "all" ? schema.fields : schema.fields.filter((field) => field.visibility === "public");
  const rows = await ctx.req.payload.find({ collection: "data-records", where: { dataset: { equals: id } }, pagination: false, sort: "position", select: { values: true }, ...asUser(ctx) });
  const csv = datasetToCsv(fields, rows.docs.map((row) => ({ values: (row.values ?? {}) as RecordValues })));
  return new Response(`﻿${csv}`, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${dataset.key}${scope === "all" ? "-all-fields" : ""}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function publishDataset(ctx: ScreenContext, id: number, input: { expectedRevision?: unknown }) {
  requireEditor(ctx, "publish data");
  await datasetById(ctx, id);
  const expectedRevision = typeof input.expectedRevision === "number" ? input.expectedRevision : undefined;
  const result = await publishDatasetRelease(ctx.req, id, { expectedRevision, actor: ctx.user.id });
  return { release: releaseSummary(result.descriptor), revision: result.revision, reused: result.reused };
}

/* ------------------------------------------------------------ projects */

export type BindableDataset = { id: number; key: string; title: string; fields: Array<Pick<FieldDefinition, "key" | "label" | "type" | "visibility">>; release: (ReleaseSummary & { fieldKeys: string[] }) | null; publication: DatasetPublication };

export type ProjectDetail = {
  project: { id: number; title: string; slug: string; deck: string; presentationKind: "template" | "custom"; presentation: string; bindings: ProjectBinding[]; settings: Record<string, unknown>; source: string; methodology: string; indexing: "public" | "noindex"; relatedStories: Array<{ id: number; headline: string; published: boolean }>; updatedAt: string };
  publication: ProjectPublication;
  publishedAt: string | null;
  descriptor: DataPresentationDescriptor | null;
  presentations: DataPresentationDescriptor[];
  datasets: BindableDataset[];
  /** Why Publish is refused right now (bindings against published releases, settings, slug). */
  issues: string[];
  /** Binding problems against the working data (what the working preview shows). */
  workingIssues: string[];
  /** What the public page uses (or would use once published): each bound dataset's current release. */
  releases: Array<{ dataset: string; title: string; release: ReleaseSummary | null; publication: DatasetPublication }>;
  publicUrl: string | null;
  capabilities: DataCapabilities;
  timeZone: string;
};

async function bindableDatasets(ctx: ScreenContext): Promise<BindableDataset[]> {
  const { docs } = await ctx.req.payload.find({ collection: "data-datasets", pagination: false, sort: "title", ...asUser(ctx) });
  return (docs as unknown as DatasetDoc[]).map((row) => {
    const pointer = storedRelease(row.release);
    const release = releaseSummary(pointer?.descriptor);
    const schema = validateDatasetSchema(row.schema);
    return {
      id: row.id, key: row.key, title: row.title,
      fields: schema.ok ? schema.value.fields.map(({ key, label, type, visibility }) => ({ key, label, type, visibility })) : [],
      release: release ? { ...release, fieldKeys: pointer!.descriptor.fields.map((field) => field.key) } : null,
      publication: datasetPublication(Number(row.workingRevision ?? 0), release)
    };
  });
}

async function projectById(ctx: ScreenContext, id: number) {
  const latest = await ctx.req.payload.findByID({ collection: "data-projects", id, draft: true, ...asUser(ctx) }).catch(() => null);
  if (!latest) throw new APIError("That project doesn't exist.", 404);
  const main = await ctx.req.payload.findByID({ collection: "data-projects", id, draft: false, ...asUser(ctx) }).catch(() => null);
  return { latest: latest as unknown as ProjectDoc, main: main as unknown as ProjectDoc | null };
}

export async function projectDetail(ctx: ScreenContext, id: number): Promise<ProjectDetail> {
  const [{ latest, main }, datasets, site] = await Promise.all([projectById(ctx, id), bindableDatasets(ctx), publicSite(ctx)]);
  const descriptor = dataPresentationDescriptor(latest.presentation) ?? null;
  const bindings = bindingsOf(latest.bindings);
  const relatedIds = relationIds(latest.relatedStories).map(Number);
  const stories = relatedIds.length ? (await ctx.req.payload.find({ collection: "stories", where: { id: { in: relatedIds } }, draft: false, pagination: false, select: { headline: true, _status: true }, ...asUser(ctx) })).docs : [];
  const byKey = new Map(datasets.map((dataset) => [dataset.key, dataset]));
  const workingIssues = descriptor ? validateBindings(descriptor, bindings, (key) => byKey.get(key)?.fields, { requirePublic: false }).map((issue) => issue.message) : [];
  const publication = projectPublication(latest, main ?? undefined);
  return {
    project: {
      id: latest.id, title: latest.title, slug: latest.slug, deck: latest.deck ?? "", presentationKind: latest.presentationKind, presentation: latest.presentation,
      bindings, settings: descriptor ? normalizeSettings(descriptor, latest.settings).settings : ((latest.settings ?? {}) as Record<string, unknown>),
      source: latest.source ?? "", methodology: latest.methodology ?? "", indexing: latest.indexing,
      relatedStories: relatedIds.map((storyId) => {
        const story = stories.find((entry) => entry.id === storyId);
        return { id: storyId, headline: story?.headline ?? `Story ${storyId}`, published: story?._status === "published" };
      }),
      updatedAt: latest.updatedAt
    },
    publication,
    publishedAt: main?.publishedAt ?? null,
    descriptor,
    presentations: describeServerDataPresentations(),
    datasets,
    issues: await projectPublicationIssues(ctx.req, latest as unknown as Record<string, unknown>),
    workingIssues,
    releases: [...new Set(bindings.map((binding) => binding.dataset))].map((key) => {
      const dataset = byKey.get(key);
      return { dataset: key, title: dataset?.title ?? key, release: dataset?.release ?? null, publication: dataset?.publication ?? "unpublished" };
    }),
    publicUrl: publication === "draft" ? null : `${site}${dataProjectPath(main?.slug ?? latest.slug)}`,
    capabilities: capabilities(ctx),
    timeZone: ctx.timeZone
  };
}

async function uniqueProjectSlug(ctx: ScreenContext, title: string, exceptId?: number): Promise<string> {
  const base = fieldKeyFromLabel(title, []).replace(/_/g, "-").replace(/^f-/, "").slice(0, 70) || "data";
  const rows = await ctx.req.payload.find({ collection: "data-projects", draft: true, where: { slug: { like: base } }, pagination: false, select: { slug: true }, ...asUser(ctx) });
  const taken = new Set(rows.docs.filter((row) => row.id !== exceptId).map((row) => row.slug));
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix++) slug = `${base}-${suffix}`;
  return slug;
}

export async function createProject(ctx: ScreenContext, input: { title?: unknown; presentation?: unknown; dataset?: unknown }) {
  requireEditor(ctx, "create Data projects");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) throw new APIError("Name the project.", 400);
  const descriptor = dataPresentationDescriptor(String(input.presentation ?? ""));
  if (!descriptor) throw new APIError("Choose a presentation.", 400);
  // A first dataset, if chosen, fills the first slot with fields whose types fit, by matching label then type.
  const bindings: ProjectBinding[] = [];
  if (typeof input.dataset === "string" && input.dataset) {
    const dataset = (await bindableDatasets(ctx)).find((entry) => entry.key === input.dataset);
    if (!dataset) throw new APIError("That dataset doesn't exist.", 400);
    const slot = descriptor.slots[0];
    const used = new Set<string>();
    const fields: Record<string, string> = {};
    for (const [role, requirement] of Object.entries(slot.fields)) {
      const candidates = dataset.fields.filter((field) => requirement.types.includes(field.type) && !used.has(field.key));
      const match = candidates.find((field) => field.label.toLowerCase() === (requirement.label || role).toLowerCase() || field.key === role) ?? (requirement.required ? candidates[0] : undefined);
      if (match) {
        fields[role] = match.key;
        used.add(match.key);
      }
    }
    bindings.push({ slot: slot.key, dataset: dataset.key, fields });
  }
  const doc = await ctx.req.payload.create({
    collection: "data-projects", draft: true,
    data: { title, slug: await uniqueProjectSlug(ctx, title), presentationKind: descriptor.kind, presentation: descriptor.key, bindings, settings: normalizeSettings(descriptor, {}).settings, indexing: "public", _status: "draft" } as never,
    ...asUser(ctx)
  });
  return { id: doc.id };
}

const PROJECT_FIELDS = ["title", "slug", "deck", "presentationKind", "presentation", "bindings", "settings", "source", "methodology", "indexing", "relatedStories"] as const;

const projectFields = (doc: ProjectDoc): Record<string, unknown> => Object.fromEntries(PROJECT_FIELDS.map((key) => [key, key === "relatedStories" ? relationIds(doc.relatedStories).map(Number) : doc[key as keyof ProjectDoc] ?? null]));

/** Saves a draft (Payload versions): the public page changes only on Publish. */
export async function updateProject(ctx: ScreenContext, id: number, input: Record<string, unknown>) {
  requireEditor(ctx, "change Data projects");
  await inTransaction(ctx, async () => {
    const db = await drizzleFor(ctx.req.payload, ctx.req);
    // The optimistic timestamp check and the full-draft write are one
    // compare-and-write operation. A second editor waits here, then rereads.
    await db.execute(sql`select id from data_projects where id = ${id} for update`);
    const { latest } = await projectById(ctx, id);
    if (typeof input.expectedUpdatedAt !== "string" || Date.parse(input.expectedUpdatedAt) !== Date.parse(latest.updatedAt)) {
      throw new DataError("project-changed", "Someone else changed this project. Reload to see their change.", 409);
    }
    const data: Record<string, unknown> = projectFields(latest);
    for (const key of PROJECT_FIELDS) if (key in input) data[key] = input[key];
    for (const key of Object.keys(input)) if (key !== "expectedUpdatedAt" && !(PROJECT_FIELDS as readonly string[]).includes(key)) throw new APIError(`Unknown project field "${key}".`, 400);
    if (typeof data.slug === "string" && data.slug !== latest.slug) {
      if (!PROJECT_SLUG.test(data.slug)) throw new APIError("The web address uses lowercase letters, numbers and hyphens.", 400);
      const clash = await ctx.req.payload.find({ collection: "data-projects", draft: true, where: { and: [{ slug: { equals: data.slug } }, { id: { not_equals: id } }] }, limit: 1, select: {}, ...asUser(ctx) });
      if (clash.docs.length) throw new APIError("Another project uses that web address.", 409);
    }
    if (typeof data.presentation === "string" && data.presentation !== latest.presentation) {
      const descriptor = dataPresentationDescriptor(data.presentation);
      if (!descriptor) throw new APIError("That presentation isn't available.", 400);
      data.presentationKind = descriptor.kind;
      data.settings = normalizeSettings(descriptor, {}).settings;
      data.bindings = (Array.isArray(data.bindings) ? data.bindings : bindingsOf(latest.bindings)).filter((binding) => descriptor.slots.some((slot) => slot.key === (binding as ProjectBinding).slot));
    }
    if (Array.isArray(data.relatedStories)) data.relatedStories = data.relatedStories.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0);
    await ctx.req.payload.update({ collection: "data-projects", id, draft: true, data: { ...data, _status: "draft" } as never, ...asUser(ctx) });
  });
  return projectDetail(ctx, id);
}

/** Publishes the latest draft: validated against the presentation and the datasets' published releases (collections.ts). */
export async function publishProject(ctx: ScreenContext, id: number) {
  requireEditor(ctx, "publish Data projects");
  await inTransaction(ctx, async () => {
    const db = await drizzleFor(ctx.req.payload, ctx.req);
    // Draft saves and Publish serialize on the project row.
    await db.execute(sql`select id from data_projects where id = ${id} for update`);
    const { latest } = await projectById(ctx, id);
    // Dataset release promotion takes the same dataset locks. Lock in ID order
    // so a project with multiple bindings cannot deadlock another publisher.
    const datasetKeys = [...new Set(bindingsOf(latest.bindings).map((binding) => binding.dataset))];
    if (datasetKeys.length) {
      await db.execute(sql`select id from data_datasets where key in (${sql.join(datasetKeys.map((key) => sql`${key}`), sql`, `)}) order by id for update`);
    }
    await ctx.req.payload.update({ collection: "data-projects", id, draft: false, data: { ...projectFields(latest), _status: "published" } as never, ...asUser(ctx) });
  });
  return projectDetail(ctx, id);
}

export async function unpublishProject(ctx: ScreenContext, id: number) {
  requireEditor(ctx, "unpublish Data projects");
  await ctx.req.payload.update({ collection: "data-projects", id, draft: false, data: { _status: "draft" } as never, ...asUser(ctx) });
  return projectDetail(ctx, id);
}

export async function deleteProject(ctx: ScreenContext, id: number) {
  requireEditor(ctx, "delete Data projects");
  await ctx.req.payload.delete({ collection: "data-projects", id, ...asUser(ctx) });
  return { deleted: true };
}

/** Published Stories for "Related coverage" (headlines only). */
export async function storyChoices(ctx: ScreenContext, search: string) {
  const term = search.trim().slice(0, 100);
  const { docs } = await ctx.req.payload.find({
    collection: "stories", draft: false, where: { and: [{ _status: { equals: "published" } }, ...(term ? [{ headline: { like: term } }] : [])] },
    sort: "-publishedAt", limit: 20, select: { headline: true, publishedAt: true }, ...asUser(ctx)
  });
  return { stories: docs.map((row) => ({ id: row.id, headline: row.headline, publishedAt: row.publishedAt ?? null })) };
}

export const datasetIdOf = (req: PayloadRequest) => Number(relationId(req.routeParams?.id));
