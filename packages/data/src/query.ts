import { compareDecimal, valueToText, type DataValue, type FieldDefinition, type FieldType, type RecordValues } from "./fields";
import type { DatasetSchema } from "./schema";

/**
 * The closed Data query language: allowlisted, type-aware operators over
 * stable field keys, a bounded sort and bounded pagination. It is data, never
 * an expression: there is no SQL, no JavaScript and no formula. The newsroom
 * compiles it to parameterized SQL for large datasets and the browser
 * evaluates the very same query in memory for small ones (`evaluateQuery`),
 * so both modes mean exactly the same thing.
 */

export const QUERY_OPERATORS = {
  isEmpty: { label: "is empty", value: false },
  isNotEmpty: { label: "is not empty", value: false },
  equals: { label: "is", value: true },
  notEquals: { label: "is not", value: true },
  contains: { label: "contains", value: true },
  notContains: { label: "does not contain", value: true },
  gt: { label: "is greater than", value: true },
  gte: { label: "is at least", value: true },
  lt: { label: "is less than", value: true },
  lte: { label: "is at most", value: true },
  before: { label: "is before", value: true },
  after: { label: "is after", value: true },
  anyOf: { label: "is any of", value: true },
  isTrue: { label: "is yes", value: false },
  isFalse: { label: "is no", value: false }
} as const;
export type QueryOperator = keyof typeof QUERY_OPERATORS;

const TEXTUAL: QueryOperator[] = ["contains", "notContains", "equals", "notEquals", "isEmpty", "isNotEmpty"];
const NUMERIC: QueryOperator[] = ["equals", "notEquals", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"];
const TEMPORAL: QueryOperator[] = ["equals", "before", "after", "isEmpty", "isNotEmpty"];

/** Which operators apply to which field type. Anything else is refused. */
export const OPERATORS_BY_TYPE: Record<FieldType, QueryOperator[]> = {
  text: TEXTUAL,
  longText: ["contains", "notContains", "isEmpty", "isNotEmpty"],
  url: TEXTUAL,
  integer: NUMERIC,
  number: NUMERIC,
  percentage: NUMERIC,
  currency: NUMERIC,
  boolean: ["isTrue", "isFalse", "isEmpty", "isNotEmpty"],
  date: TEMPORAL,
  dateTime: TEMPORAL,
  select: ["equals", "notEquals", "anyOf", "isEmpty", "isNotEmpty"],
  relationship: ["equals", "notEquals", "isEmpty", "isNotEmpty"]
};

export type QueryFilter = { field: string; op: QueryOperator; value?: DataValue | string[] };
/** `$position` is the editor's row order; `$updated` is the last edit. */
export type QuerySortKey = string;
export type QuerySort = { field: QuerySortKey; direction: "asc" | "desc" };
export type DataQuery = { filters: QueryFilter[]; match: "all" | "any"; search: string; sort: QuerySort[]; limit: number; offset: number };

export const QUERY_LIMITS = { filters: 12, sort: 3, search: 200, limit: 1000, offset: 1_000_000, anyOf: 50 } as const;
export const SYSTEM_SORTS = ["$position", "$updated"] as const;

export type QueryIssue = { path: string; message: string };

export function defaultQuery(): DataQuery {
  return { filters: [], match: "all", search: "", sort: [{ field: "$position", direction: "asc" }], limit: 200, offset: 0 };
}

/** Validates an untrusted query against a schema: known fields, allowed operators, typed operands, bounds. */
export function validateQuery(schema: Pick<DatasetSchema, "fields">, raw: unknown): { ok: true; query: DataQuery } | { ok: false; issues: QueryIssue[] } {
  const issues: QueryIssue[] = [];
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const known = new Set(["filters", "match", "search", "sort", "limit", "offset"]);
  for (const key of Object.keys(input)) if (!known.has(key)) issues.push({ path: key, message: `Unknown query property "${key}".` });
  const fields = new Map(schema.fields.map((field) => [field.key, field]));
  const filters: QueryFilter[] = [];
  const rawFilters = input.filters ?? [];
  if (!Array.isArray(rawFilters) || rawFilters.length > QUERY_LIMITS.filters) issues.push({ path: "filters", message: `Use at most ${QUERY_LIMITS.filters} filters.` });
  else rawFilters.forEach((entry, index) => {
    const filter = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const field = fields.get(String(filter.field ?? ""));
    const op = String(filter.op ?? "") as QueryOperator;
    if (Object.keys(filter).some((key) => !["field", "op", "value"].includes(key))) issues.push({ path: `filters.${index}`, message: "Unknown filter property." });
    if (!field) return void issues.push({ path: `filters.${index}.field`, message: "Filter on a field of this dataset." });
    if (!OPERATORS_BY_TYPE[field.type].includes(op)) return void issues.push({ path: `filters.${index}.op`, message: `${field.label} can't be filtered with "${op}".` });
    if (!QUERY_OPERATORS[op].value) return void filters.push({ field: field.key, op });
    const operand = operandFor(field, op, filter.value);
    if (operand === undefined) return void issues.push({ path: `filters.${index}.value`, message: `Give ${field.label} a ${field.type} value to compare.` });
    filters.push({ field: field.key, op, value: operand });
  });
  const match = input.match === undefined ? "all" : input.match;
  if (match !== "all" && match !== "any") issues.push({ path: "match", message: "Match all or any filters." });
  const search = input.search === undefined ? "" : input.search;
  if (typeof search !== "string" || search.length > QUERY_LIMITS.search) issues.push({ path: "search", message: "Search is too long." });
  const sort: QuerySort[] = [];
  const rawSort = input.sort ?? [{ field: "$position", direction: "asc" }];
  if (!Array.isArray(rawSort) || rawSort.length > QUERY_LIMITS.sort) issues.push({ path: "sort", message: `Sort by at most ${QUERY_LIMITS.sort} fields.` });
  else rawSort.forEach((entry, index) => {
    const value = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const key = String(value.field ?? "");
    const direction = value.direction ?? "asc";
    if (!(SYSTEM_SORTS as readonly string[]).includes(key) && !fields.has(key)) issues.push({ path: `sort.${index}.field`, message: "Sort by a field of this dataset." });
    else if (fields.get(key)?.type === "longText") issues.push({ path: `sort.${index}.field`, message: "Long text can't be sorted." });
    else if (direction !== "asc" && direction !== "desc") issues.push({ path: `sort.${index}.direction`, message: "Sort ascending or descending." });
    else sort.push({ field: key, direction });
  });
  const limit = input.limit === undefined ? 200 : input.limit;
  const offset = input.offset === undefined ? 0 : input.offset;
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > QUERY_LIMITS.limit) issues.push({ path: "limit", message: `Ask for 1 to ${QUERY_LIMITS.limit} rows.` });
  if (!Number.isSafeInteger(offset) || (offset as number) < 0 || (offset as number) > QUERY_LIMITS.offset) issues.push({ path: "offset", message: "Invalid offset." });
  if (issues.length) return { ok: false, issues };
  return { ok: true, query: { filters, match: match as DataQuery["match"], search: (search as string).trim(), sort, limit: limit as number, offset: offset as number } };
}

function operandFor(field: FieldDefinition, op: QueryOperator, value: unknown): DataValue | string[] | undefined {
  if (op === "anyOf") {
    if (field.type !== "select" || !Array.isArray(value) || !value.length || value.length > QUERY_LIMITS.anyOf) return undefined;
    const choices = new Set(field.options.choices.map((choice) => choice.value));
    return value.every((entry) => typeof entry === "string" && choices.has(entry)) ? [...new Set(value as string[])] : undefined;
  }
  switch (field.type) {
    case "text":
    case "longText":
    case "url":
    case "relationship":
      return typeof value === "string" && value.length > 0 && value.length <= 500 ? value : undefined;
    case "integer":
    case "number":
    case "percentage":
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    case "currency":
      return typeof value === "string" && /^-?\d{1,15}(?:\.\d{1,6})?$/.test(value) ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
    case "dateTime":
      return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
    case "select":
      return typeof value === "string" && field.options.choices.some((choice) => choice.value === value) ? value : undefined;
    case "boolean":
      return undefined;
  }
}

/* ------------------------------------------------------------ evaluation */

export type QueryableRecord = { id: string; values: RecordValues; position: number; updatedAt?: string };

const isEmpty = (value: DataValue | undefined) => value === null || value === undefined || value === "";

function compareValues(field: FieldDefinition, left: DataValue, right: DataValue): number {
  if (field.type === "currency") return compareDecimal(String(left), String(right));
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  if (field.type === "select") {
    const order = field.options.choices.map((choice) => choice.value);
    return order.indexOf(String(left)) - order.indexOf(String(right));
  }
  return String(left).localeCompare(String(right), "en", { sensitivity: "base", numeric: true });
}

function matches(field: FieldDefinition, filter: QueryFilter, value: DataValue): boolean {
  const operand = filter.value;
  switch (filter.op) {
    case "isEmpty": return isEmpty(value);
    case "isNotEmpty": return !isEmpty(value);
    case "isTrue": return value === true;
    case "isFalse": return value === false;
    case "anyOf": return !isEmpty(value) && Array.isArray(operand) && operand.includes(String(value));
    default: break;
  }
  if (isEmpty(value)) return filter.op === "notEquals" || filter.op === "notContains";
  const text = (input: unknown) => String(input).toLocaleLowerCase("en");
  switch (filter.op) {
    case "contains": return text(value).includes(text(operand));
    case "notContains": return !text(value).includes(text(operand));
    case "equals": return field.type === "dateTime" ? String(value).slice(0, 10) === String(operand).slice(0, 10) : compareValues(field, value, operand as DataValue) === 0 && (typeof value !== "string" || field.type === "currency" || text(value) === text(operand));
    case "notEquals": return !(compareValues(field, value, operand as DataValue) === 0 && (typeof value !== "string" || field.type === "currency" || text(value) === text(operand)));
    case "gt": return compareValues(field, value, operand as DataValue) > 0;
    case "gte": return compareValues(field, value, operand as DataValue) >= 0;
    case "lt": return compareValues(field, value, operand as DataValue) < 0;
    case "lte": return compareValues(field, value, operand as DataValue) <= 0;
    case "before": return String(value) < String(operand);
    case "after": return String(value) > String(operand);
    default: return false;
  }
}

/** Applies a validated query in memory: the reference semantics for the SQL compiler. */
export function evaluateQuery<R extends QueryableRecord>(schema: Pick<DatasetSchema, "fields">, records: readonly R[], query: DataQuery): { total: number; rows: R[] } {
  const fields = new Map(schema.fields.map((field) => [field.key, field]));
  const needle = query.search.toLocaleLowerCase("en");
  const filtered = records.filter((record) => {
    if (needle && !schema.fields.some((field) => valueToText(field, record.values[field.key] ?? null).toLocaleLowerCase("en").includes(needle))) return false;
    if (!query.filters.length) return true;
    const results = query.filters.map((filter) => matches(fields.get(filter.field)!, filter, record.values[filter.field] ?? null));
    return query.match === "all" ? results.every(Boolean) : results.some(Boolean);
  });
  const sorted = [...filtered].sort((a, b) => {
    for (const { field: key, direction } of query.sort) {
      const sign = direction === "asc" ? 1 : -1;
      let compared = 0;
      if (key === "$position") compared = a.position - b.position;
      else if (key === "$updated") compared = String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? ""));
      else {
        const field = fields.get(key)!;
        const left = a.values[key] ?? null;
        const right = b.values[key] ?? null;
        // Empty values sort last in both directions, as spreadsheets do.
        if (isEmpty(left) || isEmpty(right)) compared = isEmpty(left) === isEmpty(right) ? 0 : isEmpty(left) ? 1 : -1;
        else compared = compareValues(field, left, right) * sign;
        if (compared) return compared;
        continue;
      }
      if (compared) return compared * sign;
    }
    return a.position - b.position || a.id.localeCompare(b.id);
  });
  return { total: sorted.length, rows: sorted.slice(query.offset, query.offset + query.limit) };
}
