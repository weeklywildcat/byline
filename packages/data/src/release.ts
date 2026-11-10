import { z } from "zod";
import { DATASET_KEY_PATTERN, RECORD_ID_PATTERN, validateValue, type DataValue, type FieldDefinition, type RecordValues } from "./fields";
import { fieldDefinitionSchema, missingRequired, validateRecordValues, type DatasetSchema } from "./schema";

/**
 * A Data Release: the immutable public snapshot of one dataset's facts.
 *
 * It is NOT "whatever rows are in the newsroom now". It holds only the rows
 * explicitly included in publication and only the fields marked public, as
 * normalized values. Private fields are physically absent: a release never
 * carries a private field's definition or a value under its key. Releases are
 * content-addressed by the SHA-256 of their exact canonical bytes
 * (`serializeRelease`), stored once and never rewritten.
 */
export const DATA_RELEASE_FORMAT = "byline-data-release" as const;
export const DATA_RELEASE_VERSION = 1 as const;
export const DATA_RELEASE_LIMITS = { records: 50_000, bytes: 32 * 1024 * 1024 } as const;

export type PublicFieldDefinition = FieldDefinition & { visibility: "public" };
export type ReleaseRecord = { id: string; values: RecordValues };

export type DataRelease = {
  format: typeof DATA_RELEASE_FORMAT;
  version: typeof DATA_RELEASE_VERSION;
  dataset: { key: string; title: string; description: string };
  /** The dataset's working revision the release was collected at. */
  revision: number;
  releasedAt: string;
  fields: PublicFieldDefinition[];
  records: ReleaseRecord[];
};

/** How a snapshot (and anything else public) refers to one release: identity, integrity, and what it contains. */
export type DataReleaseDescriptor = {
  sha256: string;
  bytes: number;
  dataset: string;
  title: string;
  revision: number;
  releasedAt: string;
  records: number;
  fields: PublicFieldDefinition[];
};

const SHA256 = /^[0-9a-f]{64}$/;
const instant = z.iso.datetime({ offset: true });
const publicField = fieldDefinitionSchema.refine((field) => field.visibility === "public", "A release field must be public");
const value = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const dataReleaseSchema = z.strictObject({
  format: z.literal(DATA_RELEASE_FORMAT),
  version: z.literal(DATA_RELEASE_VERSION),
  dataset: z.strictObject({ key: z.string().regex(DATASET_KEY_PATTERN).max(64), title: z.string().min(1).max(200), description: z.string().max(2000) }),
  revision: z.number().int().nonnegative(),
  releasedAt: instant,
  fields: z.array(publicField).max(60),
  records: z.array(z.strictObject({ id: z.string().regex(RECORD_ID_PATTERN), values: z.record(z.string(), value) })).max(DATA_RELEASE_LIMITS.records)
});

export const dataReleaseDescriptorSchema = z.strictObject({
  sha256: z.string().regex(SHA256),
  bytes: z.number().int().positive().max(DATA_RELEASE_LIMITS.bytes),
  dataset: z.string().regex(DATASET_KEY_PATTERN).max(64),
  title: z.string().min(1).max(200),
  revision: z.number().int().nonnegative(),
  releasedAt: instant,
  records: z.number().int().nonnegative(),
  fields: z.array(publicField).max(60)
});

export class DataReleaseError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length ? `${message} ${issues.slice(0, 8).join(" ")}` : message);
    this.name = "DataReleaseError";
    this.issues = issues;
  }
}

/* ----------------------------------------------------------- projection */

export type WorkingRecord = { id: string; values: unknown; included: boolean };

export type ReleaseInput = {
  dataset: { key: string; title: string; description?: string };
  schema: DatasetSchema;
  /** In editor order. */
  records: readonly WorkingRecord[];
  revision: number;
  releasedAt: string;
  /** Whether a relationship target is public: the record exists in the target dataset's current release. */
  relationshipTarget?: (dataset: string, recordId: string) => boolean;
};

/**
 * The public projection of a dataset. Returns problems instead of quietly
 * dropping data: a row that is included but invalid or missing a required
 * public value blocks the release, as does a relationship to a record that is
 * not itself public.
 */
export function projectRelease(input: ReleaseInput): { ok: true; release: DataRelease } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const publicFields = input.schema.fields.filter((field): field is PublicFieldDefinition => field.visibility === "public");
  if (!publicFields.length) issues.push("Make at least one field public before publishing.");
  const ids = new Set<string>();
  const records: ReleaseRecord[] = [];
  input.records.forEach((record, index) => {
    const row = `Row ${index + 1}`;
    if (!record.included) return;
    if (!RECORD_ID_PATTERN.test(record.id) || ids.has(record.id)) return void issues.push(`${row} has an invalid or duplicate ID.`);
    ids.add(record.id);
    const checked = validateRecordValues(input.schema, record.values);
    if (!checked.ok) return void issues.push(`${row}: ${checked.issues.map((issue) => issue.message).join(" ")}`);
    const missing = missingRequired(input.schema, checked.values);
    if (missing.length) return void issues.push(`${row} is missing ${missing.map((field) => field.label).join(", ")}.`);
    const values: RecordValues = {};
    for (const field of publicFields) {
      const current = checked.values[field.key] ?? null;
      if (field.type === "relationship" && current !== null && !(input.relationshipTarget?.(field.options.dataset, String(current)) ?? false)) {
        issues.push(`${row}: ${field.label} links to a record that isn't published in ${field.options.dataset}.`);
      }
      values[field.key] = current;
    }
    records.push({ id: record.id, values });
  });
  if (records.length > DATA_RELEASE_LIMITS.records) issues.push(`A release holds at most ${DATA_RELEASE_LIMITS.records} rows.`);
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    release: {
      format: DATA_RELEASE_FORMAT,
      version: DATA_RELEASE_VERSION,
      dataset: { key: input.dataset.key, title: input.dataset.title.trim(), description: (input.dataset.description ?? "").trim() },
      revision: input.revision,
      releasedAt: new Date(input.releasedAt).toISOString(),
      fields: publicFields.map((field) => structuredClone(field)),
      records
    }
  };
}

/* -------------------------------------------------------- serialization */

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, entry]) => [key, canonical(entry)]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new DataReleaseError("A release cannot hold a non-finite number.");
  return value;
}

/** The one canonical JSON form: sorted object keys, preserved array order, no whitespace. Digests cover exactly these bytes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function serializeRelease(release: DataRelease): string {
  return canonicalJson(release);
}

/* ----------------------------------------------------------- validation */

/**
 * Validates a release read from anywhere (the newsroom store, a build
 * download, a fixture): the closed shape, then the invariants. Unknown
 * properties, a private field, a value under an undeclared key, an invalid
 * value or a duplicate record all fail closed.
 */
export function validateRelease(value: unknown): DataRelease {
  const parsed = dataReleaseSchema.safeParse(value);
  if (!parsed.success) throw new DataReleaseError("Invalid Data release:", parsed.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}.`));
  const release = parsed.data as DataRelease;
  const fields = new Map(release.fields.map((field) => [field.key, field]));
  if (fields.size !== release.fields.length) throw new DataReleaseError("Invalid Data release: duplicate field keys.");
  const ids = new Set<string>();
  for (const record of release.records) {
    if (ids.has(record.id)) throw new DataReleaseError(`Invalid Data release: duplicate record ${record.id}.`);
    ids.add(record.id);
    const keys = Object.keys(record.values);
    if (keys.length !== fields.size || keys.some((key) => !fields.has(key))) throw new DataReleaseError(`Invalid Data release: record ${record.id} has fields outside the public schema.`);
    for (const [key, entry] of Object.entries(record.values)) {
      const field = fields.get(key)!;
      const checked = validateValue(field, entry);
      if (!checked.ok || checked.value !== entry) throw new DataReleaseError(`Invalid Data release: record ${record.id} has an invalid ${field.label}.`);
      if (field.required && entry === null) throw new DataReleaseError(`Invalid Data release: record ${record.id} is missing ${field.label}.`);
    }
  }
  return release;
}

/** Parses exact release bytes and proves they are canonical (so the digest identifies the content, not a formatting). */
export function parseReleaseBytes(text: string): DataRelease {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataReleaseError("Invalid Data release: not JSON.");
  }
  const release = validateRelease(parsed);
  if (serializeRelease(release) !== text) throw new DataReleaseError("Invalid Data release: the bytes are not in canonical form.");
  return release;
}

export function releaseDescriptor(release: DataRelease, integrity: { sha256: string; bytes: number }): DataReleaseDescriptor {
  if (!SHA256.test(integrity.sha256) || !Number.isSafeInteger(integrity.bytes) || integrity.bytes <= 0) throw new DataReleaseError("A release descriptor needs a SHA-256 and a byte length.");
  return {
    sha256: integrity.sha256,
    bytes: integrity.bytes,
    dataset: release.dataset.key,
    title: release.dataset.title,
    revision: release.revision,
    releasedAt: release.releasedAt,
    records: release.records.length,
    fields: release.fields
  };
}

/** True when a release's content is exactly what its descriptor claims (identity and integrity are checked by the host). */
export function releaseMatchesDescriptor(release: DataRelease, descriptor: DataReleaseDescriptor): boolean {
  return release.dataset.key === descriptor.dataset
    && release.dataset.title === descriptor.title
    && release.revision === descriptor.revision
    && release.releasedAt === descriptor.releasedAt
    && release.records.length === descriptor.records
    && canonicalJson(release.fields) === canonicalJson(descriptor.fields);
}

/** The public URL path of a release's bytes on the static site, for optional client enhancement. */
export function publicReleasePath(sha256: string): string {
  if (!SHA256.test(sha256)) throw new DataReleaseError("Invalid release digest.");
  return `/_byline/data/${sha256}.json`;
}

export type { DataValue };
