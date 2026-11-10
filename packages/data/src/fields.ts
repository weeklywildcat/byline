/**
 * Byline Data field types: a deliberate first set, each with a closed options
 * object, a stored JSON value and one validation rule shared by the newsroom,
 * the publication worker and the public renderer.
 *
 * A field's `key` is its identity. It is chosen once (from the first label)
 * and never changes: the label can go from "Precincts reporting" to
 * "Precincts counted" without breaking a binding, a CSV mapping or a release.
 * A removed field's key is retired (`DatasetSchema.retiredKeys`) and never
 * reused, so an old release can never be read as if it had a new field's
 * meaning.
 *
 * Values are plain JSON: strings, numbers, booleans or `null` (empty). There
 * is no executable validation: options are data.
 */

export const FIELD_TYPES = [
  "text",
  "longText",
  "integer",
  "number",
  "currency",
  "percentage",
  "boolean",
  "date",
  "dateTime",
  "url",
  "select",
  "relationship"
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** What a reporter reads in the field type picker, in the order shown. */
export const FIELD_TYPE_LABELS: Record<FieldType, { label: string; description: string }> = {
  text: { label: "Text", description: "A name, title or short phrase." },
  longText: { label: "Long text", description: "A sentence or paragraph." },
  integer: { label: "Whole number", description: "Votes, seats, a count." },
  number: { label: "Number", description: "A measurement with decimals." },
  currency: { label: "Money", description: "An exact amount, such as a budget line." },
  percentage: { label: "Percent", description: "Precincts reporting, a share." },
  boolean: { label: "Yes / no", description: "Winner, finished, confirmed." },
  date: { label: "Date", description: "A calendar day, with no time." },
  dateTime: { label: "Date and time", description: "An exact moment." },
  url: { label: "Link", description: "A web address." },
  select: { label: "Choice", description: "One of a fixed list, such as a status." },
  relationship: { label: "Link to a record", description: "A row in another dataset." }
};

/** Status tones for choices: semantic, never colors or CSS. Each presentation decides how a tone looks. */
export const CHOICE_TONES = ["neutral", "positive", "caution", "negative", "info"] as const;
export type ChoiceTone = (typeof CHOICE_TONES)[number];

export type ChoiceOption = { value: string; label: string; tone?: ChoiceTone };

export type FieldOptions = {
  text: { maxLength: number };
  longText: { maxLength: number };
  integer: { min?: number; max?: number };
  number: { min?: number; max?: number; decimals?: number };
  /** An exact decimal stored as a string with exactly `scale` places, never a float. */
  currency: { currency: string; scale: number; min?: string; max?: string };
  /** Percentage points (45.5 means 45.5%). */
  percentage: { min?: number; max?: number; decimals?: number };
  boolean: Record<string, never>;
  date: Record<string, never>;
  dateTime: Record<string, never>;
  url: Record<string, never>;
  select: { choices: ChoiceOption[] };
  /** A record in another dataset, by its stable record ID. */
  relationship: { dataset: string };
};

export type FieldVisibility = "public" | "private";

export type FieldDefinitionOf<T extends FieldType> = {
  /** The immutable identity. Never shown as a label, never derived from the current label after creation. */
  key: string;
  /** What staff (and, for public fields, readers) see. Editable at any time. */
  label: string;
  type: T;
  /** Required for publication. A row may be incomplete while it is being written. */
  required: boolean;
  /** Private fields stay in the newsroom: they are physically absent from every release. */
  visibility: FieldVisibility;
  description?: string;
  options: FieldOptions[T];
};

export type FieldDefinition = { [T in FieldType]: FieldDefinitionOf<T> }[FieldType];

export type DataValue = string | number | boolean | null;
export type RecordValues = Record<string, DataValue>;

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;
export const DATASET_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RECORD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
export const CHOICE_VALUE_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export const FIELD_LIMITS = { textMax: 500, longTextMax: 10_000, label: 120, description: 300, choices: 50, decimals: 6, scale: 6 } as const;

/** Options with every default applied, for a new field of `type`. */
export function defaultFieldOptions<T extends FieldType>(type: T): FieldOptions[T] {
  const defaults: { [K in FieldType]: FieldOptions[K] } = {
    text: { maxLength: FIELD_LIMITS.textMax },
    longText: { maxLength: FIELD_LIMITS.longTextMax },
    integer: {},
    number: {},
    currency: { currency: "USD", scale: 2 },
    percentage: { min: 0, max: 100 },
    boolean: {},
    date: {},
    dateTime: {},
    url: {},
    select: { choices: [] },
    relationship: { dataset: "" }
  };
  return structuredClone(defaults[type]) as FieldOptions[T];
}

/** A stable key from a first label: lowercase snake case, unique among `taken`, never a retired key. */
export function fieldKeyFromLabel(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1")
    .slice(0, 40) || "field";
  let key = base;
  for (let suffix = 2; used.has(key); suffix++) key = `${base}_${suffix}`.slice(0, 48);
  return key;
}

/** A choice value from its first label (same rules as a field key, hyphenated). */
export function choiceValueFromLabel(label: string, taken: Iterable<string>): string {
  return fieldKeyFromLabel(label, [...taken].map((value) => value.replace(/-/g, "_"))).replace(/_/g, "-");
}

/* --------------------------------------------------------------- values */

export type ValueResult = { ok: true; value: DataValue } | { ok: false; message: string };
const ok = (value: DataValue): ValueResult => ({ ok: true, value });
const fail = (message: string): ValueResult => ({ ok: false, message });

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isPublicWebUrl(value: string): boolean {
  if (value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function decimalPattern(scale: number) {
  return new RegExp(`^-?\\d{1,15}(?:\\.\\d{1,${Math.max(scale, 1)}})?$`);
}

/** "12.5" at scale 2 → "12.50". Exact string arithmetic only; never through a float. */
export function normalizeDecimal(value: string, scale: number): string | null {
  const trimmed = value.trim();
  if (scale === 0 ? !/^-?\d{1,15}$/.test(trimmed) : !decimalPattern(scale).test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = trimmed.replace(/^-/, "").split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const result = scale === 0 ? normalizedWhole : `${normalizedWhole}.${fraction.padEnd(scale, "0")}`;
  return negative && /[1-9]/.test(result) ? `-${result}` : result;
}

/** Compares two normalized decimals of the same scale. */
export function compareDecimal(left: string, right: string): number {
  const sign = (value: string) => (value.startsWith("-") ? -1 : 1);
  if (sign(left) !== sign(right)) return sign(left) - sign(right);
  const magnitude = (value: string) => value.replace(/^-/, "");
  const [lw, lf = ""] = magnitude(left).split(".");
  const [rw, rf = ""] = magnitude(right).split(".");
  const compared = lw.length !== rw.length ? lw.length - rw.length : lw === rw ? lf.localeCompare(rf) : lw.localeCompare(rw);
  return Math.sign(compared) * sign(left);
}

function inRange(value: number, min: number | undefined, max: number | undefined) {
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function rangeMessage(min: number | string | undefined, max: number | string | undefined) {
  if (min !== undefined && max !== undefined) return `between ${min} and ${max}`;
  return min !== undefined ? `at least ${min}` : `at most ${max}`;
}

/**
 * The one rule for a stored value: `null` (empty) or a value of the field's
 * type within its options, normalized. Required-ness is a publication rule
 * (see `releaseIssues`), so an incomplete row can still be saved.
 */
export function validateValue(field: FieldDefinition, raw: unknown): ValueResult {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  switch (field.type) {
    case "text":
    case "longText": {
      if (typeof raw !== "string") return fail("Enter text.");
      const value = field.type === "text" ? raw.replace(/\s+/g, " ").trim() : raw.replace(/\r\n?/g, "\n").trim();
      if (!value) return ok(null);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return fail("Remove the control characters.");
      if (value.length > field.options.maxLength) return fail(`Keep it under ${field.options.maxLength} characters.`);
      return ok(value);
    }
    case "integer": {
      if (typeof raw !== "number" || !Number.isSafeInteger(raw)) return fail("Enter a whole number.");
      if (!inRange(raw, field.options.min, field.options.max)) return fail(`Enter a number ${rangeMessage(field.options.min, field.options.max)}.`);
      return ok(raw === 0 ? 0 : raw);
    }
    case "number":
    case "percentage": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return fail(field.type === "percentage" ? "Enter a percentage." : "Enter a number.");
      if (Math.abs(raw) > 1e15) return fail("That number is too large.");
      if (!inRange(raw, field.options.min, field.options.max)) return fail(`Enter a ${field.type === "percentage" ? "percentage" : "number"} ${rangeMessage(field.options.min, field.options.max)}.`);
      return ok(raw === 0 ? 0 : raw);
    }
    case "currency": {
      const text = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : typeof raw === "string" ? raw : null;
      const value = text === null ? null : normalizeDecimal(text, field.options.scale);
      if (value === null) return fail(`Enter an amount with at most ${field.options.scale} decimal places.`);
      if ((field.options.min !== undefined && compareDecimal(value, normalizeDecimal(field.options.min, field.options.scale) ?? value) < 0)
        || (field.options.max !== undefined && compareDecimal(value, normalizeDecimal(field.options.max, field.options.scale) ?? value) > 0)) {
        return fail(`Enter an amount ${rangeMessage(field.options.min, field.options.max)}.`);
      }
      return ok(value);
    }
    case "boolean":
      return typeof raw === "boolean" ? ok(raw) : fail("Choose yes or no.");
    case "date":
      return typeof raw === "string" && isCalendarDate(raw) ? ok(raw) : fail("Enter a date as YYYY-MM-DD.");
    case "dateTime": {
      if (typeof raw !== "string" || !ISO_INSTANT.test(raw) || !Number.isFinite(Date.parse(raw))) return fail("Enter a date and time.");
      return ok(new Date(raw).toISOString());
    }
    case "url":
      return typeof raw === "string" && isPublicWebUrl(raw.trim()) ? ok(raw.trim()) : fail("Enter a web address that starts with https://.");
    case "select":
      return typeof raw === "string" && field.options.choices.some((choice) => choice.value === raw) ? ok(raw) : fail("Choose one of the listed options.");
    case "relationship":
      return typeof raw === "string" && RECORD_ID_PATTERN.test(raw) ? ok(raw) : fail("Choose a record.");
  }
}

/* -------------------------------------------------------- text → value */

const TRUE = new Set(["true", "yes", "y", "1", "x", "✓", "✔", "on"]);
const FALSE = new Set(["false", "no", "n", "0", "off"]);
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function parseNumberText(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Typed input from text (a pasted cell, a CSV column, a grid editor). Strict:
 * text that is not clearly a value of the type is an error, never coerced into
 * something plausible.
 */
export function parseValueText(field: FieldDefinition, input: string): ValueResult {
  const text = input.trim();
  if (!text) return ok(null);
  switch (field.type) {
    case "text":
    case "longText":
    case "url":
      return validateValue(field, field.type === "longText" ? input : text);
    case "integer": {
      const value = parseNumberText(text);
      return value === null || !Number.isInteger(value) ? fail("Enter a whole number.") : validateValue(field, value);
    }
    case "number": {
      const value = parseNumberText(text);
      return value === null ? fail("Enter a number.") : validateValue(field, value);
    }
    case "percentage": {
      const value = parseNumberText(text.replace(/%$/, ""));
      return value === null ? fail("Enter a percentage.") : validateValue(field, value);
    }
    case "currency": {
      const cleaned = text.replace(/^\((.*)\)$/, "-$1").replace(/[\s,]/g, "").replace(/^(-?)[$€£]/, "$1").replace(new RegExp(`(?:${field.options.currency})$`, "i"), "");
      return validateValue(field, cleaned);
    }
    case "boolean": {
      const lower = text.toLowerCase();
      return TRUE.has(lower) ? ok(true) : FALSE.has(lower) ? ok(false) : fail("Use yes or no.");
    }
    case "date": {
      const us = US_DATE.exec(text);
      const candidate = us ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : text;
      return validateValue(field, candidate);
    }
    case "dateTime":
      return validateValue(field, text);
    case "select": {
      const lower = text.toLowerCase();
      const choice = field.options.choices.find((option) => option.value === text || option.label.toLowerCase() === lower);
      return choice ? ok(choice.value) : fail(`"${text.slice(0, 40)}" isn't one of the choices.`);
    }
    case "relationship":
      return validateValue(field, text);
  }
}

/** The plain-text form of a stored value (editing, CSV export, search). */
export function valueToText(field: FieldDefinition, value: DataValue): string {
  if (value === null) return "";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "select") return field.options.choices.find((choice) => choice.value === value)?.label ?? String(value);
  return String(value);
}
