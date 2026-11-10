import type { ComponentType } from "react";
import {
  canonicalJson,
  field,
  formatDataValue,
  setting,
  validatePresentationDescriptor,
  type BoundSlot,
  type DataFormatOptions,
  type DataPresentationDescriptor,
  type DataValue,
  type FieldDefinition,
  type FieldRequirement,
  type PresentationKind,
  type SettingDescriptor
} from "@byline/data";

/**
 * The Byline Data presentation SDK. A developer writes the experience; the
 * newsroom edits the facts.
 *
 *   defineDataTemplate      reusable: editors choose it for any compatible
 *                           dataset and configure it, with no code
 *   defineDataPresentation  one project's repository-coded experience
 *
 * Both declare what they read (slots of datasets, roles of fields, settings)
 * as serializable data, so the newsroom can list, bind and validate them
 * from descriptors without loading this code. A component receives
 * normalized, published (or, in the newsroom preview, working) data: never a
 * Payload request, document or database client.
 *
 * `prepare` is the trusted, deterministic transform step (rank candidates,
 * compute margins, group by year). It runs on the server or at build time
 * only, gets only the bound data and settings, and its output must be plain
 * JSON. Network access, secrets and the clock do not belong there: external
 * ingestion is a newsroom job that writes datasets.
 */

export { field, setting };

/* ------------------------------------------------------------- slots */

export type SlotSpec<Fields extends Record<string, FieldRequirement> = Record<string, FieldRequirement>, Optional extends boolean = boolean> = {
  label: string;
  description?: string;
  optional: Optional;
  fields: Fields;
};

/** A dataset a presentation reads, with the roles (fields) it needs from it. */
export function slot<const Fields extends Record<string, FieldRequirement>, const Optional extends boolean = false>(options: { label: string; description?: string; optional?: Optional; fields: Fields }): SlotSpec<Fields, Optional> {
  return { label: options.label, ...(options.description ? { description: options.description } : {}), optional: (options.optional ?? false) as Optional, fields: options.fields };
}

type SettingSpec = Omit<SettingDescriptor, "key">;

type SettingValueOf<S> = S extends { type: "boolean" } ? boolean : S extends { type: "number" } ? number : S extends { type: "choice"; choices: Array<{ value: infer V }> } ? V : string;

export type SettingsOf<G extends Record<string, SettingSpec>> = { [K in keyof G]: SettingValueOf<G[K]> };
type RolesOf<S extends SlotSpec> = Extract<keyof S["fields"], string>;
export type DataOf<Slots extends Record<string, SlotSpec>> = { [K in keyof Slots]: Slots[K]["optional"] extends true ? BoundSlot<RolesOf<Slots[K]>> | null : BoundSlot<RolesOf<Slots[K]>> };

/* ------------------------------------------------------------ props */

/** Whether a page shows published releases (public) or the newsroom's working data (preview only). */
export type DataSourceKind = "published" | "working";

export type DataProjectContext<Settings> = {
  id: number;
  title: string;
  deck: string;
  href: string;
  settings: Settings;
  /** The newest release used: the reader-facing "Data updated" moment. */
  dataUpdatedAt: string;
  source: DataSourceKind;
};

export type DataFormatter = {
  /** A value as readers see it, in the publication locale and timezone. */
  value: (field: FieldDefinition | null | undefined, value: DataValue) => string;
  /** An instant ("Nov. 10, 2026, 4:12 PM") in the publication timezone. */
  instant: (iso: string) => string;
  /** A count with its noun ("3 phases"). */
  count: (value: number, singular: string, plural?: string) => string;
  locale: string;
  timeZone: string;
};

export type PrepareInput<Slots extends Record<string, SlotSpec>, Settings> = { data: DataOf<Slots>; settings: Settings; format: DataFormatter };

export type DataPresentationProps<Slots extends Record<string, SlotSpec> = Record<string, SlotSpec>, Settings = Record<string, unknown>, Model = undefined> = {
  project: DataProjectContext<Settings>;
  data: DataOf<Slots>;
  /** `prepare`'s output (undefined without one). */
  model: Model;
  format: DataFormatter;
  /** Public artifact paths by slot. Empty in working newsroom previews. */
  releasePaths?: Partial<Record<Extract<keyof Slots, string>, string>>;
};

/** What `client.ts` exports by default: enhance the server-rendered root, return a cleanup. */
export type DataPresentationClient = (root: HTMLElement, context: { releases: Record<string, string> }) => void | (() => void);

/* ------------------------------------------------------- definitions */

export type DataPresentationDefinition = {
  descriptor: DataPresentationDescriptor;
  Component: ComponentType<DataPresentationProps<any, any, any>>;
  prepare?: (input: PrepareInput<any, any>) => unknown;
};

type DefinitionInput<Slots extends Record<string, SlotSpec>, G extends Record<string, SettingSpec>, Model> = {
  /** Stable key, never renamed once a project uses it. Kebab case. */
  key: string;
  name: string;
  description: string;
  datasets: Slots;
  settings?: G;
  /** Has a `styles.css` beside it (scoped under `.data-presentation-<key>`). */
  styles?: boolean;
  /** Has a `client.ts` progressive enhancement beside it. */
  client?: boolean;
  /** Development and test only. Hosts refuse it unless fixtures are explicitly on. */
  fixture?: boolean;
  prepare?: (input: PrepareInput<Slots, SettingsOf<G>>) => Model;
  Component: ComponentType<DataPresentationProps<Slots, SettingsOf<G>, Model>>;
};

function define<Slots extends Record<string, SlotSpec>, G extends Record<string, SettingSpec>, Model>(kind: PresentationKind, input: DefinitionInput<Slots, G, Model>): DataPresentationDefinition {
  const descriptor = validatePresentationDescriptor({
    key: input.key,
    kind,
    name: input.name,
    description: input.description,
    slots: Object.entries(input.datasets).map(([key, spec]) => ({
      key,
      label: spec.label,
      ...(spec.description ? { description: spec.description } : {}),
      required: !spec.optional,
      fields: Object.fromEntries(Object.entries(spec.fields).map(([role, requirement]) => [role, { ...requirement, label: requirement.label || role }]))
    })),
    settings: Object.entries(input.settings ?? {}).map(([key, spec]) => ({ key, ...spec })),
    styles: input.styles ?? false,
    client: input.client ?? false,
    fixture: input.fixture ?? false
  });
  return { descriptor, Component: input.Component as DataPresentationDefinition["Component"], ...(input.prepare ? { prepare: input.prepare as DataPresentationDefinition["prepare"] } : {}) };
}

/** A reusable presentation editors can choose for any compatible dataset. */
export function defineDataTemplate<const Slots extends Record<string, SlotSpec>, const G extends Record<string, SettingSpec> = Record<never, SettingSpec>, Model = undefined>(input: DefinitionInput<Slots, G, Model>): DataPresentationDefinition {
  return define("template", input);
}

/** One project's repository-coded presentation. It still declares what it reads, so the newsroom can bind and check it. */
export function defineDataPresentation<const Slots extends Record<string, SlotSpec>, const G extends Record<string, SettingSpec> = Record<never, SettingSpec>, Model = undefined>(input: DefinitionInput<Slots, G, Model>): DataPresentationDefinition {
  return define("custom", input);
}

/* -------------------------------------------------------- formatting */

export function createDataFormatter(options: DataFormatOptions): DataFormatter {
  const instant = new Intl.DateTimeFormat(options.locale, { timeZone: options.timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return {
    value: (entry, value) => (entry ? formatDataValue(entry, value, options) : value === null ? "" : String(value)),
    instant: (iso) => instant.format(new Date(iso)),
    count: (value, singular, plural = `${singular}s`) => `${new Intl.NumberFormat(options.locale).format(value)} ${value === 1 ? singular : plural}`,
    locale: options.locale,
    timeZone: options.timeZone
  };
}

/* ----------------------------------------------- the prepared model */

export const PREPARED_MODEL_MAX_BYTES = 2 * 1024 * 1024;

export class DataPresentationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataPresentationError";
  }
}

function assertPlainJson(value: unknown, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new DataPresentationError(`prepare returned a non-finite number at ${path}.`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => assertPlainJson(entry, `${path}[${index}]`));
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new DataPresentationError(`prepare returned a ${prototype?.constructor?.name ?? "non-plain"} object at ${path}; return plain data.`);
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      assertPlainJson(entry, `${path}.${key}`);
    }
    return;
  }
  throw new DataPresentationError(`prepare returned a ${typeof value} at ${path}; return plain data.`);
}

/**
 * Runs a definition's `prepare` twice and checks the result: plain JSON,
 * bounded, and identical both times. A transform that reads the clock, a
 * random number or anything outside its input fails here instead of making
 * two builds of the same releases differ.
 */
export function runPrepare(definition: DataPresentationDefinition, input: PrepareInput<any, any>): unknown {
  if (!definition.prepare) return undefined;
  const first = definition.prepare(input);
  assertPlainJson(first, "model");
  const bytes = canonicalJson(first ?? null);
  if (bytes.length > PREPARED_MODEL_MAX_BYTES) throw new DataPresentationError(`${definition.descriptor.key}: prepare returned more than 2 MB.`);
  if (canonicalJson(definition.prepare(input) ?? null) !== bytes) throw new DataPresentationError(`${definition.descriptor.key}: prepare is not deterministic. It may only read its data and settings.`);
  return first;
}
