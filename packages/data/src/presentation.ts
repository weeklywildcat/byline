import { z } from "zod";
import { DATASET_KEY_PATTERN, FIELD_KEY_PATTERN, FIELD_TYPES, type DataValue, type FieldType, type RecordValues } from "./fields";
import type { DataRelease, PublicFieldDefinition } from "./release";

/**
 * What a repository presentation needs, as plain serializable data. The
 * newsroom lists, binds and validates presentations from descriptors alone,
 * without ever loading their components, styles or browser code.
 *
 *   slot   a dataset the presentation reads ("races", "candidates")
 *   role   a field the presentation reads from a slot ("name", "votes")
 *
 * Code refers to roles, never to a dataset's field keys or labels. A project
 * binds each role to one of the dataset's stable field keys, so a reporter
 * can rename "Precincts reporting" to "Precincts counted" (or a developer can
 * reuse a template for next year's dataset) without touching code.
 */

export const PRESENTATION_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROLE_PATTERN = /^[a-z][a-zA-Z0-9]{0,47}$/;

/* ---------------------------------------------------------- field roles */

export type FieldRequirement = { types: FieldType[]; required: boolean; label: string; description?: string };

type RoleOptions = { label?: string; description?: string; optional?: boolean };
const role = (types: FieldType[]) => (options: RoleOptions = {}): FieldRequirement => ({
  types,
  required: !options.optional,
  label: options.label ?? "",
  ...(options.description ? { description: options.description } : {})
});

/**
 * Field requirements for a slot's roles. Each produces a descriptor (never a
 * validator function), e.g. `{ name: field.text(), votes: field.integer() }`.
 * The compatible types are deliberately generous where a reader-facing
 * presentation can show either (any text-like field can be a label).
 */
export const field = {
  text: role(["text", "longText", "select", "url"]),
  longText: role(["longText", "text"]),
  integer: role(["integer"]),
  number: role(["integer", "number", "percentage", "currency"]),
  percentage: role(["percentage"]),
  currency: role(["currency"]),
  boolean: role(["boolean"]),
  date: role(["date", "dateTime"]),
  dateTime: role(["dateTime"]),
  url: role(["url"]),
  choice: role(["select"]),
  relationship: role(["relationship"]),
  /** Any public field type. */
  any: role([...FIELD_TYPES])
};

/* ---------------------------------------------------------------- slots */

export type SlotDescriptor = {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  fields: Record<string, FieldRequirement>;
};

/* ------------------------------------------------------------- settings */

export type SettingDescriptor =
  | { key: string; label: string; description?: string; type: "text"; default: string; maxLength: number }
  | { key: string; label: string; description?: string; type: "longText"; default: string; maxLength: number }
  | { key: string; label: string; description?: string; type: "boolean"; default: boolean }
  | { key: string; label: string; description?: string; type: "number"; default: number; min: number; max: number; integer: boolean }
  | { key: string; label: string; description?: string; type: "choice"; default: string; choices: Array<{ value: string; label: string }> };

type SettingBase = { label: string; description?: string };
type Setting<T extends SettingDescriptor["type"]> = Omit<Extract<SettingDescriptor, { type: T }>, "key">;
/** A choice setting that remembers its values' literal types, so a component's settings are typed. */
export type ChoiceSetting<C extends string> = Omit<Setting<"choice">, "default" | "choices"> & { default: C; choices: Array<{ value: C; label: string }> };

/** Presentation settings an editor configures. Closed types; never CSS, HTML, colors or code. */
export const setting = {
  text: (options: SettingBase & { default?: string; maxLength?: number }): Setting<"text"> => ({ type: "text", label: options.label, ...(options.description ? { description: options.description } : {}), default: options.default ?? "", maxLength: options.maxLength ?? 200 }),
  longText: (options: SettingBase & { default?: string; maxLength?: number }): Setting<"longText"> => ({ type: "longText", label: options.label, ...(options.description ? { description: options.description } : {}), default: options.default ?? "", maxLength: options.maxLength ?? 2000 }),
  boolean: (options: SettingBase & { default?: boolean }): Setting<"boolean"> => ({ type: "boolean", label: options.label, ...(options.description ? { description: options.description } : {}), default: options.default ?? false }),
  number: (options: SettingBase & { default: number; min: number; max: number; integer?: boolean }): Setting<"number"> => ({ type: "number", label: options.label, ...(options.description ? { description: options.description } : {}), default: options.default, min: options.min, max: options.max, integer: options.integer ?? true }),
  choice: <const C extends string>(options: SettingBase & { default: NoInfer<C>; choices: ReadonlyArray<{ value: C; label: string }> }): ChoiceSetting<C> => ({ type: "choice", label: options.label, ...(options.description ? { description: options.description } : {}), default: options.default, choices: options.choices.map((choice) => ({ ...choice })) })
};

export type SettingValue = string | number | boolean;
export type ProjectSettings = Record<string, SettingValue>;

/* ---------------------------------------------------------- descriptors */

export type PresentationKind = "template" | "custom";

export type DataPresentationDescriptor = {
  key: string;
  /** `template`: reusable, chosen by editors. `custom`: one project's repository-coded experience. */
  kind: PresentationKind;
  name: string;
  description: string;
  slots: SlotDescriptor[];
  settings: SettingDescriptor[];
  /** Whether it has a `styles.css` beside it, loaded only on pages that use it. */
  styles: boolean;
  /** Whether it has a `client.ts` progressive enhancement beside it. */
  client: boolean;
  /** Development and test only: hosts refuse it unless fixtures are on. */
  fixture: boolean;
};

const requirement = z.strictObject({ types: z.array(z.enum(FIELD_TYPES)).min(1), required: z.boolean(), label: z.string().max(120), description: z.string().max(300).optional() });
const settingBase = { key: z.string().regex(ROLE_PATTERN), label: z.string().min(1).max(120), description: z.string().max(300).optional() };

export const dataPresentationDescriptorSchema = z.strictObject({
  key: z.string().regex(PRESENTATION_KEY_PATTERN).max(64),
  kind: z.enum(["template", "custom"]),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  slots: z.array(z.strictObject({
    key: z.string().regex(ROLE_PATTERN),
    label: z.string().min(1).max(120),
    description: z.string().max(300).optional(),
    required: z.boolean(),
    fields: z.record(z.string().regex(ROLE_PATTERN), requirement)
  })).min(1).max(8),
  settings: z.array(z.discriminatedUnion("type", [
    z.strictObject({ ...settingBase, type: z.literal("text"), default: z.string(), maxLength: z.number().int().min(1).max(500) }),
    z.strictObject({ ...settingBase, type: z.literal("longText"), default: z.string(), maxLength: z.number().int().min(1).max(5000) }),
    z.strictObject({ ...settingBase, type: z.literal("boolean"), default: z.boolean() }),
    z.strictObject({ ...settingBase, type: z.literal("number"), default: z.number().finite(), min: z.number().finite(), max: z.number().finite(), integer: z.boolean() }),
    z.strictObject({ ...settingBase, type: z.literal("choice"), default: z.string(), choices: z.array(z.strictObject({ value: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1).max(120) })).min(1).max(20) })
  ])).max(24),
  styles: z.boolean(),
  client: z.boolean(),
  fixture: z.boolean()
});

/** Validates a descriptor's shape and invariants (unique slots, roles and settings; defaults within bounds). */
export function validatePresentationDescriptor(value: unknown): DataPresentationDescriptor {
  const parsed = dataPresentationDescriptorSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid Data presentation descriptor: ${parsed.error.issues.slice(0, 4).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const descriptor = parsed.data as DataPresentationDescriptor;
  const name = descriptor.key;
  if (new Set(descriptor.slots.map((slot) => slot.key)).size !== descriptor.slots.length) throw new Error(`Data presentation ${name} declares a slot twice.`);
  if (new Set(descriptor.settings.map((entry) => entry.key)).size !== descriptor.settings.length) throw new Error(`Data presentation ${name} declares a setting twice.`);
  if (!descriptor.slots.some((slot) => slot.required)) throw new Error(`Data presentation ${name} must require at least one dataset.`);
  for (const entry of descriptor.settings) {
    if (entry.type === "number" && (entry.min > entry.max || entry.default < entry.min || entry.default > entry.max || (entry.integer && !Number.isInteger(entry.default)))) throw new Error(`Data presentation ${name}: setting ${entry.key} has an invalid default.`);
    if (entry.type === "choice" && !entry.choices.some((choice) => choice.value === entry.default)) throw new Error(`Data presentation ${name}: setting ${entry.key} defaults to an unknown choice.`);
    if ((entry.type === "text" || entry.type === "longText") && entry.default.length > entry.maxLength) throw new Error(`Data presentation ${name}: setting ${entry.key} has a default that is too long.`);
  }
  return descriptor;
}

/* ------------------------------------------------------------- bindings */

/** A project's binding of one slot: which dataset, and which of its field keys fills each role. */
export type ProjectBinding = { slot: string; dataset: string; fields: Record<string, string> };

export const projectBindingSchema = z.strictObject({
  slot: z.string().regex(ROLE_PATTERN),
  dataset: z.string().regex(DATASET_KEY_PATTERN).max(64),
  fields: z.record(z.string().regex(ROLE_PATTERN), z.string().regex(FIELD_KEY_PATTERN))
});
export const projectBindingsSchema = z.array(projectBindingSchema).max(8);

export type BindingIssue = { slot: string; role?: string; message: string };

/** The fields a slot can be bound to: the dataset's fields, or only the public ones of a release. */
export type BindableFields = ReadonlyArray<{ key: string; label: string; type: FieldType; visibility: "public" | "private" }>;

/**
 * Checks bindings against a descriptor and the datasets they name. With
 * `requirePublic` (publication, snapshots) every bound field must be public;
 * the newsroom's working preview may bind private fields so an editor can see
 * the layout before deciding what to publish.
 */
export function validateBindings(descriptor: Pick<DataPresentationDescriptor, "slots" | "key">, bindings: readonly ProjectBinding[], datasets: (key: string) => BindableFields | undefined, options: { requirePublic: boolean }): BindingIssue[] {
  const issues: BindingIssue[] = [];
  const bySlot = new Map<string, ProjectBinding>();
  for (const binding of bindings) {
    if (!descriptor.slots.some((slot) => slot.key === binding.slot)) issues.push({ slot: binding.slot, message: `${descriptor.key} has no "${binding.slot}" dataset.` });
    else if (bySlot.has(binding.slot)) issues.push({ slot: binding.slot, message: "That dataset is bound twice." });
    bySlot.set(binding.slot, binding);
  }
  for (const slot of descriptor.slots) {
    const binding = bySlot.get(slot.key);
    if (!binding) {
      if (slot.required) issues.push({ slot: slot.key, message: `Choose a dataset for ${slot.label}.` });
      continue;
    }
    const fields = datasets(binding.dataset);
    if (!fields) {
      issues.push({ slot: slot.key, message: options.requirePublic ? `${slot.label}: the dataset "${binding.dataset}" has no published release.` : `${slot.label}: the dataset "${binding.dataset}" doesn't exist.` });
      continue;
    }
    for (const role of Object.keys(binding.fields)) if (!(role in slot.fields)) issues.push({ slot: slot.key, role, message: `${slot.label} has no "${role}" field.` });
    for (const [role, requirement] of Object.entries(slot.fields)) {
      const key = binding.fields[role];
      const name = requirement.label || role;
      if (!key) {
        if (requirement.required) issues.push({ slot: slot.key, role, message: `${slot.label}: choose a field for ${name}.` });
        continue;
      }
      const bound = fields.find((entry) => entry.key === key);
      if (!bound) issues.push({ slot: slot.key, role, message: `${slot.label}: ${name} is bound to a field that ${options.requirePublic ? "isn't public in the published data" : "no longer exists"}.` });
      else if (!requirement.types.includes(bound.type)) issues.push({ slot: slot.key, role, message: `${slot.label}: ${bound.label} can't be used as ${name}.` });
      else if (options.requirePublic && bound.visibility !== "public") issues.push({ slot: slot.key, role, message: `${slot.label}: ${bound.label} is private. Make it public and publish the data first.` });
    }
  }
  return issues;
}

/** Settings with defaults applied, refusing unknown keys and out-of-bounds values. */
export function normalizeSettings(descriptor: Pick<DataPresentationDescriptor, "settings" | "key">, raw: unknown): { settings: ProjectSettings; issues: string[] } {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const issues: string[] = [];
  const settings: ProjectSettings = {};
  for (const key of Object.keys(input)) if (!descriptor.settings.some((entry) => entry.key === key)) issues.push(`${descriptor.key} has no "${key}" setting.`);
  for (const entry of descriptor.settings) {
    const value = input[entry.key];
    if (value === undefined || value === null) {
      settings[entry.key] = entry.default;
      continue;
    }
    switch (entry.type) {
      case "text":
      case "longText":
        if (typeof value !== "string" || value.length > entry.maxLength) issues.push(`${entry.label} must be text under ${entry.maxLength} characters.`);
        else settings[entry.key] = entry.type === "text" ? value.replace(/\s+/g, " ").trim() : value.trim();
        break;
      case "boolean":
        if (typeof value !== "boolean") issues.push(`${entry.label} must be yes or no.`);
        else settings[entry.key] = value;
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value) || value < entry.min || value > entry.max || (entry.integer && !Number.isInteger(value))) issues.push(`${entry.label} must be a number from ${entry.min} to ${entry.max}.`);
        else settings[entry.key] = value;
        break;
      case "choice":
        if (typeof value !== "string" || !entry.choices.some((choice) => choice.value === value)) issues.push(`${entry.label} must be one of its choices.`);
        else settings[entry.key] = value;
        break;
    }
  }
  return { settings, issues };
}

/* -------------------------------------------------------- bound data */

/** A bound row: its stable ID, every public value by field key, and each role's value. */
export type BoundRecord<Roles extends string = string> = { id: string; values: RecordValues; roles: Record<Roles, DataValue> };

/** One slot's data as a presentation component receives it: normalized, never a CMS document. */
export type BoundSlot<Roles extends string = string> = {
  dataset: { key: string; title: string; description: string; revision: number; releasedAt: string };
  /** Every field the release carries, in the newsroom's column order. */
  fields: PublicFieldDefinition[];
  /** The field bound to each role (null for an optional role left unbound). */
  roles: Record<Roles, PublicFieldDefinition | null>;
  records: Array<BoundRecord<Roles>>;
};

/** Binds a release to a slot: role → field, and every record's role values. */
export function bindSlot<Roles extends string>(slot: Pick<SlotDescriptor, "fields">, binding: ProjectBinding, release: DataRelease): BoundSlot<Roles> {
  const roleKeys = Object.keys(slot.fields) as Roles[];
  const fields = new Map(release.fields.map((entry) => [entry.key, entry]));
  const roles = Object.fromEntries(roleKeys.map((roleKey) => [roleKey, (binding.fields[roleKey] && fields.get(binding.fields[roleKey])) || null])) as Record<Roles, PublicFieldDefinition | null>;
  return {
    dataset: { ...release.dataset, revision: release.revision, releasedAt: release.releasedAt },
    fields: release.fields,
    roles,
    records: release.records.map((record) => ({
      id: record.id,
      values: record.values,
      roles: Object.fromEntries(roleKeys.map((roleKey) => [roleKey, roles[roleKey] ? record.values[roles[roleKey]!.key] ?? null : null])) as Record<Roles, DataValue>
    }))
  };
}
