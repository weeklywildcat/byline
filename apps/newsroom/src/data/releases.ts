import { sql } from "@payloadcms/db-postgres";
import {
  parseReleaseBytes,
  projectRelease,
  releaseDescriptor,
  serializeRelease,
  validateBindings,
  type DataRelease,
  type DataReleaseDescriptor,
  type DatasetSchema
} from "@byline/data";
import { commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";
import { relationId } from "../access/user";
import { drizzleFor } from "../publication-media/state";
import { assertPublicSafe } from "../public/snapshot/privacy";
import { recordPublicMutation } from "../public/revision";
import { datasetSchemaOf, storedRelease, type StoredRelease } from "./collections";
import { DataError } from "./errors";
import { dataPresentationDescriptor } from "./registry";
import { readWorkingRevision } from "./revision";
import { DataReleaseStore } from "./store";

/**
 * Publishing a dataset: the Data Release fence
 * (docs/byline-data.md#releases), the same discipline as the public snapshot.
 *
 *   1. capture the dataset's working revision R
 *   2. collect its rows (no transaction held, no rows locked: reporters keep
 *      typing) and normalize the publishable ones: included rows, public
 *      fields only
 *   3. validate values, required fields and relationships (a linked record
 *      must itself be in its dataset's current release)
 *   4. check every published project that binds this dataset still works
 *      with the new public fields
 *   5. run the privacy sentinel over the exact canonical bytes
 *   6. reread R: a change during collection makes the result stale
 *   7. write the immutable, content-addressed artifact
 *   8. in ONE transaction: promote the pointer `WHERE working_revision = R`
 *      and advance the public revision (which queues the snapshot job)
 *
 * A write that commits after the reread and before promotion makes the
 * promotion lose; nothing half-published can become current.
 */

const system = (req: PayloadRequest) => ({ req, overrideAccess: true as const, depth: 0 });

type DatasetRow = { id: number; key: string; title: string; description?: string | null; schema: unknown; workingRevision?: number | null; release?: unknown };

export async function readDatasetRows(req: PayloadRequest, datasetId: number) {
  const { docs } = await req.payload.find({ collection: "data-records", where: { dataset: { equals: datasetId } }, pagination: false, sort: "position", select: { recordId: true, values: true, included: true, position: true, updatedAt: true }, ...system(req) });
  return docs.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
}

/** The current release bytes of a dataset, verified against its pointer, or null. */
export async function loadCurrentRelease(payload: Payload, pointer: StoredRelease | null, store = new DataReleaseStore()): Promise<DataRelease | null> {
  if (!pointer) return null;
  const bytes = await store.read(pointer.descriptor.sha256, pointer.descriptor.bytes);
  if (!bytes) throw new DataError("release-missing", `The published release ${pointer.descriptor.sha256.slice(0, 12)}… of ${pointer.descriptor.dataset} is missing from the release store.`, 500);
  return parseReleaseBytes(bytes.toString("utf8"));
}

/** Record IDs of the current release of each dataset a schema links to: relationship targets must be public. */
async function relationshipTargets(req: PayloadRequest, schema: DatasetSchema, store: DataReleaseStore) {
  const keys = [...new Set(schema.fields.flatMap((field) => (field.type === "relationship" && field.visibility === "public" ? [field.options.dataset] : [])))];
  const targets = new Map<string, Set<string>>();
  if (!keys.length) return targets;
  const datasets = await req.payload.find({ collection: "data-datasets", where: { key: { in: keys } }, pagination: false, select: { key: true, release: true }, ...system(req) });
  for (const dataset of datasets.docs) {
    const release = await loadCurrentRelease(req.payload, storedRelease(dataset.release), store);
    if (release) targets.set(dataset.key, new Set(release.records.map((record) => record.id)));
  }
  return targets;
}

/** Published projects that bind `datasetKey` and would break with `fields` (main rows: what is public now). */
async function brokenProjects(req: PayloadRequest, datasetKey: string, descriptor: DataReleaseDescriptor) {
  const { docs } = await req.payload.find({ collection: "data-projects", where: { _status: { equals: "published" } }, draft: false, pagination: false, select: { title: true, presentation: true, bindings: true }, ...system(req) });
  const problems: string[] = [];
  for (const project of docs) {
    const bindings = (Array.isArray(project.bindings) ? project.bindings : []) as Array<{ slot: string; dataset: string; fields: Record<string, string> }>;
    if (!bindings.some((binding) => binding.dataset === datasetKey)) continue;
    const presentation = dataPresentationDescriptor(String(project.presentation));
    if (!presentation) continue;
    const others = await req.payload.find({ collection: "data-datasets", where: { key: { in: bindings.map((binding) => binding.dataset) } }, pagination: false, select: { key: true, release: true }, ...system(req) });
    const fieldsFor = (key: string) => (key === datasetKey ? descriptor.fields : storedRelease(others.docs.find((entry) => entry.key === key)?.release)?.descriptor.fields);
    const issues = validateBindings(presentation, bindings, fieldsFor, { requirePublic: true });
    if (issues.length) problems.push(`${project.title}: ${issues.map((issue) => issue.message).join(" ")}`);
  }
  return problems;
}

export type ReleaseHooks = { afterCollect?: () => Promise<void>; beforePromote?: () => Promise<void> };

export type PublishedRelease = { descriptor: DataReleaseDescriptor; revision: number; reused: boolean };

export async function publishDatasetRelease(req: PayloadRequest, datasetId: number, options: { expectedRevision?: number; now?: Date; store?: DataReleaseStore; hooks?: ReleaseHooks; actor: number | string | null }): Promise<PublishedRelease> {
  const store = options.store ?? new DataReleaseStore();
  // 1. Capture the revision before reading the schema. If the schema changes
  // between these reads, its revision bump makes the final fence lose.
  const revision = await readWorkingRevision(req.payload, datasetId);
  if (revision === null) throw new DataError("not-found", "That dataset doesn't exist.", 404);
  const dataset = (await req.payload.findByID({ collection: "data-datasets", id: datasetId, ...system(req) }).catch(() => null)) as DatasetRow | null;
  if (!dataset) throw new DataError("not-found", "That dataset doesn't exist.", 404);
  if (options.expectedRevision !== undefined && options.expectedRevision !== revision) {
    throw new DataError("revision-changed", "The data changed since you reviewed it. Look at the latest rows, then publish again.", 409, { revision });
  }
  const current = storedRelease(dataset.release);
  if (current && current.descriptor.revision === revision && (await store.verify(current.filename, current.descriptor.sha256, current.descriptor.bytes))) {
    return { descriptor: current.descriptor, revision, reused: true };
  }
  // 2–3. Collect and project.
  const schema = datasetSchemaOf(dataset.schema);
  const rows = await readDatasetRows(req, datasetId);
  const targets = await relationshipTargets(req, schema, store);
  const projected = projectRelease({
    dataset: { key: dataset.key, title: dataset.title, description: dataset.description ?? "" },
    schema,
    records: rows.map((row) => ({ id: row.recordId, values: row.values, included: row.included !== false })),
    revision,
    releasedAt: (options.now ?? new Date()).toISOString(),
    relationshipTarget: (key, id) => targets.get(key)?.has(id) ?? false
  });
  if (!projected.ok) throw new DataError("invalid-release", `This data can't be published yet. ${projected.issues.slice(0, 6).join(" ")}${projected.issues.length > 6 ? ` And ${projected.issues.length - 6} more.` : ""}`, 400, { issues: projected.issues.slice(0, 200) });
  // 5. Exact bytes, and the sentinel over them.
  const text = serializeRelease(projected.release);
  const bytes = Buffer.from(text, "utf8");
  const privateKeys = schema.fields.filter((field) => field.visibility === "private").map((field) => field.key);
  for (const record of projected.release.records) for (const key of privateKeys) if (key in record.values) throw new DataError("invalid-release", "A private field reached the release projection.", 500);
  try {
    assertPublicSafe({}, text);
  } catch (error) {
    throw new DataError("invalid-release", (error as Error).message, 400);
  }
  const provisional = releaseDescriptor(projected.release, { sha256: "0".repeat(64), bytes: bytes.byteLength });
  // 4. Never break a project that is already public.
  const broken = await brokenProjects(req, dataset.key, provisional);
  if (broken.length) throw new DataError("breaks-projects", `Publishing this would break public projects. ${broken.join(" ")}`, 409, { issues: broken });
  await options.hooks?.afterCollect?.();
  // 6. The fence.
  if ((await readWorkingRevision(req.payload, datasetId)) !== revision) throw new DataError("revision-changed", "Someone changed this dataset while it was being published. Publish again to include their change.", 409);
  // 7. Immutable artifact.
  const stored = await store.write(bytes);
  const descriptor = releaseDescriptor(projected.release, { sha256: stored.sha256, bytes: stored.bytes });
  await options.hooks?.beforePromote?.();
  // 8. Promote and advance the public revision together.
  const pointer: StoredRelease = { descriptor, filename: stored.filename, releasedBy: options.actor };
  const owns = await initTransaction(req);
  try {
    const db = await drizzleFor(req.payload, req);
    // Project publication locks every dataset it binds. Taking the same row
    // lock here makes project publication and release promotion serialize.
    await db.execute(sql`select id from data_datasets where id = ${datasetId} for update`);
    if ((await readWorkingRevision(req.payload, datasetId, req)) !== revision) {
      throw new DataError("revision-changed", "Someone changed this dataset while it was being published. Publish again to include their change.", 409);
    }
    // The earlier check is a fast preflight. This locked recheck is the one
    // that closes the race with a project becoming public concurrently.
    const finalBroken = await brokenProjects(req, dataset.key, descriptor);
    if (finalBroken.length) throw new DataError("breaks-projects", `Publishing this would break public projects. ${finalBroken.join(" ")}`, 409, { issues: finalBroken });
    const result = await db.execute(sql`update data_datasets set release = ${JSON.stringify(pointer)}::jsonb where id = ${datasetId} and working_revision = ${revision} returning id`);
    if (!(result.rowCount ?? result.rows.length)) throw new DataError("revision-changed", "Someone changed this dataset while it was being published. Publish again to include their change.", 409);
    await recordPublicMutation(req, `data release ${dataset.key}`, { force: true });
    if (owns) await commitTransaction(req);
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
  return { descriptor, revision, reused: false };
}

/**
 * A release built in memory from WORKING rows, for the newsroom preview
 * only. It is never written, never content-addressed and never public; the
 * preview may include private fields so an editor can see a layout before
 * deciding what to publish (bindings are then checked without
 * `requirePublic`).
 */
export async function workingRelease(req: PayloadRequest, dataset: DatasetRow, options: { includePrivate: boolean }): Promise<DataRelease> {
  const schema = datasetSchemaOf(dataset.schema);
  const visible: DatasetSchema = options.includePrivate ? { ...schema, fields: schema.fields.map((field) => ({ ...field, visibility: "public" as const })) } : schema;
  const rows = await readDatasetRows(req, dataset.id);
  // Preview tolerates incomplete rows: it shows what is there, while Publish enforces the rules.
  const lenient: DatasetSchema = { ...visible, fields: visible.fields.map((field) => ({ ...field, required: false })) };
  const projected = projectRelease({
    dataset: { key: dataset.key, title: dataset.title, description: dataset.description ?? "" },
    schema: lenient,
    records: rows.map((row) => ({ id: row.recordId, values: row.values, included: row.included !== false })),
    revision: Number(dataset.workingRevision ?? 0),
    releasedAt: new Date().toISOString(),
    relationshipTarget: () => true
  });
  if (!projected.ok) throw new DataError("invalid-working-data", projected.issues.slice(0, 4).join(" "), 400);
  return projected.release;
}

export const datasetIdOf = (value: unknown) => Number(relationId(value));
