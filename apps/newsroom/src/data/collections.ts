import { randomBytes } from "node:crypto";
import {
  DATASET_KEY_PATTERN,
  RECORD_ID_PATTERN,
  canonicalJson,
  normalizeSettings,
  projectBindingsSchema,
  removedChoices,
  schemaChangeIssues,
  validateBindings,
  validateDatasetSchema,
  validateRecordValues,
  type DataReleaseDescriptor,
  type DatasetSchema
} from "@byline/data";
import { APIError, type CollectionBeforeChangeHook, type CollectionConfig, type PayloadRequest } from "payload";
import { atLeast, editorsOnly, newsroomUser, relationId, requestUser, signedIn } from "../access/user";
import { dataPresentationDescriptor } from "./registry";
import { advanceWorkingRevision } from "./revision";

/**
 * Byline Data in Payload (docs/byline-data.md): three fixed collections, not
 * a table per dataset.
 *
 *   data-datasets  a dataset's metadata, its schema (fields with immutable
 *                  keys), its working revision and its current release pointer
 *   data-records   one document per row: a stable record ID and `values`
 *                  keyed by field key, validated against the schema on every
 *                  write, on the server
 *   data-projects  reader-facing projects, versioned with Payload drafts so an
 *                  unpublished configuration can be previewed
 *
 * Datasets and records are working data: nothing here is public until an
 * editor publishes an immutable release (`data/releases.ts`). Staff edit rows;
 * editors change schemas, publish releases and publish projects.
 */

const system = (req: PayloadRequest) => ({ req, overrideAccess: true as const, depth: 0 });
export const DATA_LIMITS = { title: 200, description: 2000, deck: 600, source: 600, methodology: 5000, relatedStories: 12 } as const;

export type StoredRelease = { descriptor: DataReleaseDescriptor; filename: string; releasedBy: number | string | null };

/** The stored release pointer, or null when it is absent or malformed (never trusted blindly). */
export function storedRelease(value: unknown): StoredRelease | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<StoredRelease>;
  const descriptor = entry.descriptor;
  if (!descriptor || typeof descriptor !== "object" || !/^[0-9a-f]{64}$/.test(String(descriptor.sha256)) || entry.filename !== `${descriptor.sha256}.json`) return null;
  return { descriptor: descriptor as DataReleaseDescriptor, filename: entry.filename, releasedBy: entry.releasedBy ?? null };
}

export function datasetSchemaOf(value: unknown): DatasetSchema {
  const checked = validateDatasetSchema(value);
  if (!checked.ok) throw new APIError(`This dataset's fields are invalid: ${checked.issues.map((issue) => issue.message).join(" ")}`, 500);
  return checked.value;
}

/* ------------------------------------------------------------- datasets */

const validateDataset: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (operation === "update" && originalDoc?.key && data.key !== undefined && data.key !== originalDoc.key) throw new APIError("A dataset's key can't change after it is created.", 400);
  if (operation === "create" && (typeof data.key !== "string" || !DATASET_KEY_PATTERN.test(data.key) || data.key.length > 64)) throw new APIError("Give the dataset a key of lowercase letters, numbers and hyphens.", 400);
  if (data.schema === undefined) {
    if (operation === "create") data.schema = { fields: [], retiredKeys: [] };
    return data;
  }
  const checked = validateDatasetSchema(data.schema, { datasetKey: String(data.key ?? originalDoc?.key ?? "") });
  if (!checked.ok) throw new APIError(checked.issues.map((issue) => issue.message).join(" "), 400, { issues: checked.issues });
  const next = checked.value;
  if (operation === "update" && originalDoc) {
    const previous = datasetSchemaOf(originalDoc.schema);
    const issues = schemaChangeIssues(previous, next);
    if (issues.length) throw new APIError(issues.map((issue) => issue.message).join(" "), 400, { issues });
    // A removed choice or a type change must not strand existing values: check every row, in this transaction.
    const removed = removedChoices(previous, next);
    const tightened = next.fields.some((field) => {
      const old = previous.fields.find((entry) => entry.key === field.key);
      return old && (old.type !== field.type || canonicalJson(old.options) !== canonicalJson(field.options));
    });
    if (removed.length || tightened) {
      const rows = await req.payload.find({ collection: "data-records", where: { dataset: { equals: originalDoc.id } }, pagination: false, select: { values: true }, ...system(req) });
      const stranded = rows.docs.filter((row) => !validateRecordValues(next, row.values).ok).length;
      if (stranded) throw new APIError(`${stranded} ${stranded === 1 ? "row has a value" : "rows have values"} that the new field settings can't hold. Change those rows first.`, 409);
    }
  }
  data.schema = next;
  return data;
};

export const DataDatasets: CollectionConfig = {
  slug: "data-datasets",
  labels: { singular: "Dataset", plural: "Datasets" },
  admin: { group: "Data", useAsTitle: "title", defaultColumns: ["title", "key", "workingRevision"], hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  lockDocuments: false,
  access: { read: signedIn, create: editorsOnly, update: editorsOnly, delete: editorsOnly },
  hooks: {
    beforeChange: [
      validateDataset,
      ({ data, operation, req }) => {
        if (operation === "create") data.createdBy = requestUser(req)?.id ?? null;
        return data;
      }
    ],
    afterChange: [async ({ doc, previousDoc, operation, req }) => {
      // The working facts changed (schema, title, description): the dataset now differs from its release.
      const changed = operation === "create" || ["schema", "title", "description"].some((key) => canonicalJson(doc[key] ?? null) !== canonicalJson(previousDoc?.[key] ?? null));
      if (changed) await advanceWorkingRevision(req, Number(doc.id));
      return doc;
    }],
    beforeDelete: [async ({ id, req }) => {
      const dataset = await req.payload.findByID({ collection: "data-datasets", id, ...system(req) });
      const projects = await req.payload.find({ collection: "data-projects", draft: true, pagination: false, select: { title: true, bindings: true }, ...system(req) });
      const users = projects.docs.filter((project) => Array.isArray(project.bindings) && (project.bindings as Array<{ dataset?: string }>).some((binding) => binding.dataset === dataset.key));
      if (users.length) throw new APIError(`${users.map((project) => project.title).join(", ")} ${users.length === 1 ? "uses" : "use"} this dataset. Remove it from ${users.length === 1 ? "that project" : "those projects"} first.`, 409);
      await req.payload.delete({ collection: "data-records", where: { dataset: { equals: id } }, ...system(req) });
    }]
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: DATA_LIMITS.title },
    { name: "key", type: "text", required: true, unique: true, index: true, maxLength: 64, admin: { description: "Permanent: projects and releases refer to the dataset by it." } },
    { name: "description", type: "textarea", maxLength: DATA_LIMITS.description },
    { name: "schema", type: "json", required: true },
    // System-managed: advanced by `advanceWorkingRevision` in the write's own transaction.
    { name: "workingRevision", type: "number", defaultValue: 0, access: { create: () => false, update: () => false }, admin: { readOnly: true } },
    { name: "workingChangedAt", type: "date", access: { create: () => false, update: () => false }, admin: { readOnly: true } },
    // The current release pointer: written only by the release fence (one conditional statement).
    { name: "release", type: "json", access: { create: () => false, update: () => false }, admin: { readOnly: true } },
    { name: "createdBy", type: "relationship", relationTo: "users", access: { create: () => false, update: () => false }, admin: { readOnly: true } }
  ]
};

/* -------------------------------------------------------------- records */

export function newRecordId(): string {
  return `r${randomBytes(6).toString("hex")}`;
}

const validateRecord: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  const datasetId = Number(relationId(operation === "update" ? originalDoc?.dataset : data.dataset));
  if (!Number.isSafeInteger(datasetId) || datasetId <= 0) throw new APIError("Choose a dataset.", 400);
  if (operation === "update" && data.dataset !== undefined && Number(relationId(data.dataset)) !== datasetId) throw new APIError("A row can't move to another dataset.", 400);
  if (operation === "update" && data.recordId !== undefined && data.recordId !== originalDoc?.recordId) throw new APIError("A row's ID can't change.", 400);
  if (operation === "create") {
    data.recordId = typeof data.recordId === "string" && data.recordId ? data.recordId : newRecordId();
    if (!RECORD_ID_PATTERN.test(data.recordId)) throw new APIError("Row IDs use lowercase letters, numbers and hyphens.", 400);
  }
  const dataset = await req.payload.findByID({ collection: "data-datasets", id: datasetId, ...system(req) }).catch(() => null);
  if (!dataset) throw new APIError("That dataset doesn't exist.", 404);
  if (data.values !== undefined || operation === "create") {
    const checked = validateRecordValues(datasetSchemaOf(dataset.schema), data.values ?? {});
    if (!checked.ok) throw new APIError(checked.issues.map((issue) => issue.message).join(" "), 400, { issues: checked.issues });
    data.values = checked.values;
  }
  if (data.position !== undefined && (typeof data.position !== "number" || !Number.isFinite(data.position))) throw new APIError("Invalid row position.", 400);
  const user = requestUser(req)?.id ?? null;
  if (operation === "create") data.createdBy = user;
  data.updatedBy = user;
  return data;
};

export const DataRecords: CollectionConfig = {
  slug: "data-records",
  labels: { singular: "Data row", plural: "Data rows" },
  admin: { group: "Data", useAsTitle: "recordId", defaultColumns: ["recordId", "dataset", "included"], hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  lockDocuments: false,
  indexes: [{ fields: ["dataset", "recordId"], unique: true }],
  // Staff edit rows; the schema and publication are editors'. Every write is validated here, never trusted from a client.
  access: { read: signedIn, create: signedIn, update: signedIn, delete: signedIn },
  hooks: {
    beforeChange: [validateRecord],
    afterChange: [async ({ doc, req }) => {
      await advanceWorkingRevision(req, Number(relationId(doc.dataset)));
      return doc;
    }],
    afterDelete: [async ({ doc, req }) => {
      await advanceWorkingRevision(req, Number(relationId(doc.dataset)));
      return doc;
    }]
  },
  fields: [
    { name: "dataset", type: "relationship", relationTo: "data-datasets", required: true, index: true },
    { name: "recordId", label: "Row ID", type: "text", required: true, index: true, maxLength: 64 },
    { name: "values", type: "json", required: true },
    { name: "position", type: "number", index: true, defaultValue: 0 },
    { name: "included", label: "Publish this row", type: "checkbox", defaultValue: true },
    { name: "createdBy", type: "relationship", relationTo: "users", access: { create: () => false, update: () => false }, admin: { readOnly: true } },
    { name: "updatedBy", type: "relationship", relationTo: "users", access: { create: () => false, update: () => false }, admin: { readOnly: true } }
  ]
};

/* ------------------------------------------------------------- projects */

export const PROJECT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Publication rules for a project: a registered presentation, bindings valid against published releases, valid settings. */
export async function projectPublicationIssues(req: PayloadRequest, project: Record<string, unknown>): Promise<string[]> {
  const issues: string[] = [];
  const key = String(project.presentation ?? "");
  const descriptor = dataPresentationDescriptor(key);
  if (!descriptor) return [`Choose a presentation. "${key}" isn't available in this build.`];
  if (descriptor.kind !== project.presentationKind) issues.push(`"${descriptor.name}" is a ${descriptor.kind}.`);
  const parsed = projectBindingsSchema.safeParse(project.bindings ?? []);
  if (!parsed.success) return [...issues, "The dataset bindings are malformed."];
  const keys = [...new Set(parsed.data.map((binding) => binding.dataset))];
  const datasets = keys.length ? (await req.payload.find({ collection: "data-datasets", where: { key: { in: keys } }, pagination: false, select: { key: true, release: true }, ...system(req) })).docs : [];
  const releases = new Map(datasets.flatMap((dataset) => {
    const release = storedRelease(dataset.release);
    return release ? [[dataset.key, release.descriptor] as const] : [];
  }));
  issues.push(...validateBindings(descriptor, parsed.data, (datasetKey) => releases.get(datasetKey)?.fields, { requirePublic: true }).map((issue) => issue.message));
  issues.push(...normalizeSettings(descriptor, project.settings ?? {}).issues);
  if (typeof project.slug !== "string" || !PROJECT_SLUG.test(project.slug)) issues.push("Give the project a web address of lowercase letters, numbers and hyphens.");
  return issues;
}

const guardProjectPublication: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (data.slug !== undefined && (typeof data.slug !== "string" || !PROJECT_SLUG.test(data.slug) || data.slug.length > 80)) throw new APIError("The web address uses lowercase letters, numbers and hyphens.", 400);
  if (data.presentationKind !== undefined && !["template", "custom"].includes(String(data.presentationKind))) throw new APIError("Choose a template or a custom presentation.", 400);
  if (data.bindings !== undefined && !projectBindingsSchema.safeParse(data.bindings).success) throw new APIError("The dataset bindings are malformed.", 400);
  if (data.settings !== undefined && (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings))) throw new APIError("Settings must be an object.", 400);
  if (Array.isArray(data.relatedStories) && data.relatedStories.length > DATA_LIMITS.relatedStories) throw new APIError(`Relate at most ${DATA_LIMITS.relatedStories} stories.`, 400);
  if (data._status === "published" && req.context?.bylineImport !== true) {
    if (!atLeast(requestUser(req), "editor") && req.user) throw new APIError("Only editors publish Data projects.", 403);
    const issues = await projectPublicationIssues(req, { ...(originalDoc ?? {}), ...data });
    if (issues.length) throw new APIError(`This project can't be published yet: ${issues.join(" ")}`, 400, { issues });
    if (!data.publishedAt && !originalDoc?.publishedAt) data.publishedAt = new Date().toISOString();
  }
  if (operation === "create") data.createdBy = requestUser(req)?.id ?? null;
  return data;
};

export const DataProjects: CollectionConfig = {
  slug: "data-projects",
  labels: { singular: "Data project", plural: "Data projects" },
  admin: { group: "Data", useAsTitle: "title", defaultColumns: ["title", "slug", "presentation", "_status"], hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  // Payload's own drafts: an unpublished configuration lives in the versions table and is previewable; Publish writes the main row.
  versions: { drafts: true, maxPerDoc: 50 },
  access: { read: signedIn, create: editorsOnly, update: editorsOnly, delete: editorsOnly, readVersions: signedIn },
  hooks: { beforeChange: [guardProjectPublication] },
  fields: [
    { name: "title", type: "text", required: true, maxLength: DATA_LIMITS.title },
    { name: "slug", label: "Web address", type: "text", required: true, unique: true, index: true, maxLength: 80 },
    { name: "deck", type: "textarea", maxLength: DATA_LIMITS.deck },
    { name: "presentationKind", type: "select", required: true, defaultValue: "template", options: [{ value: "template", label: "Template" }, { value: "custom", label: "Custom" }] },
    { name: "presentation", type: "text", required: true, maxLength: 64 },
    // [{ slot, dataset (key), fields: { role: fieldKey } }], checked against the presentation's descriptor.
    { name: "bindings", type: "json", required: true, defaultValue: [] },
    { name: "settings", type: "json", required: true, defaultValue: {} },
    { name: "source", type: "text", maxLength: DATA_LIMITS.source },
    { name: "methodology", label: "About this data", type: "textarea", maxLength: DATA_LIMITS.methodology },
    { name: "indexing", type: "select", required: true, defaultValue: "public", options: [{ value: "public", label: "Search engines may index it" }, { value: "noindex", label: "Hidden from search engines" }] },
    { name: "relatedStories", type: "relationship", relationTo: "stories", hasMany: true, maxRows: DATA_LIMITS.relatedStories },
    { name: "publishedAt", type: "date", access: { create: () => false, update: () => false }, admin: { readOnly: true } },
    { name: "createdBy", type: "relationship", relationTo: "users", access: { create: () => false, update: () => false }, admin: { readOnly: true } }
  ]
};

/** The public slice of a project's MAIN row (`public/tracking.ts`): null unless it is published. */
export function dataProjectPublicSlice(row: Record<string, unknown>) {
  if (row._status !== "published" || row.deletedAt) return null;
  const pick = ["title", "slug", "deck", "presentationKind", "presentation", "bindings", "settings", "source", "methodology", "indexing", "relatedStories", "publishedAt"];
  return Object.fromEntries(pick.map((key) => [key, row[key] ?? null]));
}
