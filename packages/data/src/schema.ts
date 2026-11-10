import { z } from "zod";
import {
  CHOICE_TONES,
  CHOICE_VALUE_PATTERN,
  CURRENCY_CODE_PATTERN,
  DATASET_KEY_PATTERN,
  FIELD_KEY_PATTERN,
  FIELD_LIMITS,
  FIELD_TYPES,
  validateValue,
  type DataValue,
  type FieldDefinition,
  type FieldType,
  type RecordValues
} from "./fields";

/**
 * A dataset's schema: its ordered fields (the array order is the column
 * order) and the keys it has retired. Closed and strict: an unknown property
 * anywhere is an error, so a stored schema can never smuggle in executable
 * validation, CSS or display code.
 */
export type DatasetSchema = { fields: FieldDefinition[]; retiredKeys: string[] };

export const DATASET_LIMITS = { fields: 60, records: 50_000 } as const;

const label = z.string().trim().min(1).max(FIELD_LIMITS.label);
const description = z.string().max(FIELD_LIMITS.description).optional();
const finite = z.number().finite();
const decimal = z.string().regex(/^-?\d{1,15}(?:\.\d{1,6})?$/);
const base = { key: z.string().regex(FIELD_KEY_PATTERN), label, required: z.boolean(), visibility: z.enum(["public", "private"]), description };
const obj = z.strictObject;
const empty = obj({});
const range = obj({ min: finite.optional(), max: finite.optional(), decimals: z.number().int().min(0).max(FIELD_LIMITS.decimals).optional() });

export const fieldDefinitionSchema = z.discriminatedUnion("type", [
  obj({ ...base, type: z.literal("text"), options: obj({ maxLength: z.number().int().min(1).max(FIELD_LIMITS.textMax) }) }),
  obj({ ...base, type: z.literal("longText"), options: obj({ maxLength: z.number().int().min(1).max(FIELD_LIMITS.longTextMax) }) }),
  obj({ ...base, type: z.literal("integer"), options: obj({ min: z.number().int().optional(), max: z.number().int().optional() }) }),
  obj({ ...base, type: z.literal("number"), options: range }),
  obj({ ...base, type: z.literal("currency"), options: obj({ currency: z.string().regex(CURRENCY_CODE_PATTERN), scale: z.number().int().min(0).max(FIELD_LIMITS.scale), min: decimal.optional(), max: decimal.optional() }) }),
  obj({ ...base, type: z.literal("percentage"), options: range }),
  obj({ ...base, type: z.literal("boolean"), options: empty }),
  obj({ ...base, type: z.literal("date"), options: empty }),
  obj({ ...base, type: z.literal("dateTime"), options: empty }),
  obj({ ...base, type: z.literal("url"), options: empty }),
  obj({ ...base, type: z.literal("select"), options: obj({ choices: z.array(obj({ value: z.string().regex(CHOICE_VALUE_PATTERN).max(48), label, tone: z.enum(CHOICE_TONES).optional() })).max(FIELD_LIMITS.choices) }) }),
  obj({ ...base, type: z.literal("relationship"), options: obj({ dataset: z.string().regex(DATASET_KEY_PATTERN).max(64) }) })
]);

export const datasetSchemaSchema = obj({
  fields: z.array(fieldDefinitionSchema).max(DATASET_LIMITS.fields),
  retiredKeys: z.array(z.string().regex(FIELD_KEY_PATTERN)).max(500)
});

export type SchemaIssue = { path: string; message: string };
export type Checked<T> = { ok: true; value: T } | { ok: false; issues: SchemaIssue[] };

function zodIssues(error: z.ZodError): SchemaIssue[] {
  return error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/** Parses and checks a schema's invariants: unique keys and labels, no retired key in use, sane ranges and choices. */
export function validateDatasetSchema(value: unknown, options: { datasetKey?: string } = {}): Checked<DatasetSchema> {
  const parsed = datasetSchemaSchema.safeParse(value);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const schema = parsed.data as DatasetSchema;
  const issues: SchemaIssue[] = [];
  const keys = new Set<string>();
  const labels = new Set<string>();
  const retired = new Set(schema.retiredKeys);
  schema.fields.forEach((field, index) => {
    const path = `fields.${index}`;
    if (keys.has(field.key)) issues.push({ path, message: `Two fields share the key "${field.key}".` });
    keys.add(field.key);
    const name = field.label.toLowerCase();
    if (labels.has(name)) issues.push({ path, message: `Two fields are called "${field.label}".` });
    labels.add(name);
    if (retired.has(field.key)) issues.push({ path, message: `The key "${field.key}" belonged to a removed field and can't be reused.` });
    if ("min" in field.options && "max" in field.options && field.options.min !== undefined && field.options.max !== undefined) {
      const [min, max] = [Number(field.options.min), Number(field.options.max)];
      if (min > max) issues.push({ path, message: `${field.label}: the minimum is larger than the maximum.` });
    }
    if (field.type === "select") {
      const values = field.options.choices.map((choice) => choice.value);
      if (new Set(values).size !== values.length) issues.push({ path, message: `${field.label} has two choices with the same value.` });
      if (new Set(field.options.choices.map((choice) => choice.label.toLowerCase())).size !== values.length) issues.push({ path, message: `${field.label} has two choices with the same name.` });
    }
    if (field.type === "relationship" && options.datasetKey && field.options.dataset === options.datasetKey) {
      issues.push({ path, message: `${field.label} can't link to its own dataset yet.` });
    }
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: schema };
}

/** Type changes that can keep existing values (each value is still re-validated under the new field). */
const CONVERTIBLE: Partial<Record<FieldType, FieldType[]>> = {
  text: ["longText", "url"],
  longText: ["text"],
  integer: ["number", "percentage"],
  number: ["integer", "percentage"],
  percentage: ["number"],
  url: ["text"]
};

/**
 * What a schema edit may do to an existing schema: relabel, reorder, add,
 * remove (which retires the key), toggle required/visibility, adjust options
 * and change type only along a value-preserving path. A key never changes
 * meaning: an existing key keeps its relationship target; a removed key can
 * never come back; a retired key is never forgotten.
 */
export function schemaChangeIssues(previous: DatasetSchema, next: DatasetSchema): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const before = new Map(previous.fields.map((field) => [field.key, field]));
  const nextKeys = new Set(next.fields.map((field) => field.key));
  for (const key of previous.retiredKeys) if (!next.retiredKeys.includes(key)) issues.push({ path: "retiredKeys", message: `The retired key "${key}" must stay retired.` });
  for (const field of previous.fields) {
    if (!nextKeys.has(field.key) && !next.retiredKeys.includes(field.key)) issues.push({ path: "fields", message: `Removing ${field.label} must retire its key.` });
  }
  next.fields.forEach((field, index) => {
    const old = before.get(field.key);
    if (!old) return;
    if (old.type !== field.type && !CONVERTIBLE[old.type]?.includes(field.type)) {
      issues.push({ path: `fields.${index}.type`, message: `${old.label} can't change from ${old.type} to ${field.type}. Add a new field instead.` });
    }
    if (old.type === "relationship" && field.type === "relationship" && old.options.dataset !== field.options.dataset) {
      issues.push({ path: `fields.${index}.options.dataset`, message: `${old.label} must keep linking to the same dataset.` });
    }
  });
  // Removed choices are allowed only when no row uses them: the caller checks rows with `removedChoices`.
  return issues;
}

/** Choices removed by an edit: allowed only when no row still uses them (the caller checks the rows). */
export function removedChoices(previous: DatasetSchema, next: DatasetSchema): Array<{ key: string; values: string[] }> {
  return next.fields.flatMap((field) => {
    const old = previous.fields.find((entry) => entry.key === field.key);
    if (old?.type !== "select" || field.type !== "select") return [];
    const kept = new Set(field.options.choices.map((choice) => choice.value));
    const values = old.options.choices.map((choice) => choice.value).filter((value) => !kept.has(value));
    return values.length ? [{ key: field.key, values }] : [];
  });
}

export type RecordIssue = { field: string; message: string };

/**
 * Validates and normalizes a record's values against the CURRENT schema.
 * Unknown keys fail closed, except the keys of removed fields, which are
 * dropped (a retired column's old values are never revived).
 */
export function validateRecordValues(schema: DatasetSchema, raw: unknown): { ok: true; values: RecordValues } | { ok: false; issues: RecordIssue[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, issues: [{ field: "", message: "Values must be an object keyed by field." }] };
  const fields = new Map(schema.fields.map((field) => [field.key, field]));
  const retired = new Set(schema.retiredKeys);
  const values: RecordValues = {};
  const issues: RecordIssue[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = fields.get(key);
    if (!field) {
      if (!retired.has(key)) issues.push({ field: key, message: `There is no field "${key}".` });
      continue;
    }
    const result = validateValue(field, value);
    if (result.ok) values[key] = result.value;
    else issues.push({ field: key, message: `${field.label}: ${result.message}` });
  }
  for (const field of schema.fields) if (!(field.key in values)) values[field.key] = null;
  return issues.length ? { ok: false, issues } : { ok: true, values };
}

/** Required fields that a row leaves empty (a publication rule, not a write rule). */
export function missingRequired(schema: DatasetSchema, values: RecordValues): FieldDefinition[] {
  return schema.fields.filter((field) => field.required && (values[field.key] === null || values[field.key] === undefined));
}

export function fieldByKey(schema: Pick<DatasetSchema, "fields">, key: string): FieldDefinition | undefined {
  return schema.fields.find((field) => field.key === key);
}

/** An empty schema for a new dataset. */
export function emptyDatasetSchema(): DatasetSchema {
  return { fields: [], retiredKeys: [] };
}

/** Whether two stored values are the same (for conflict checks and change detection). */
export function sameValue(left: DataValue | undefined, right: DataValue | undefined): boolean {
  return (left ?? null) === (right ?? null);
}
