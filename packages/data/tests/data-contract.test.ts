import { describe, expect, it } from "vitest";
import {
  bindSlot,
  canonicalJson,
  defaultFieldOptions,
  field,
  fieldKeyFromLabel,
  normalizeSettings,
  parseReleaseBytes,
  parseValueText,
  projectRelease,
  releaseDescriptor,
  releaseMatchesDescriptor,
  removedChoices,
  schemaChangeIssues,
  serializeRelease,
  setting,
  validateBindings,
  validateDatasetSchema,
  validatePresentationDescriptor,
  validatePublicDataSection,
  validateRecordValues,
  validateRelease,
  validateValue,
  type DataPresentationDescriptor,
  type DatasetSchema,
  type FieldDefinition
} from "../src";
import { evaluateQuery, validateQuery } from "../src/query";
import { datasetToCsv, defuseSpreadsheetFormula, guessColumnMapping, inferFieldsFromTable, parseDelimited, previewImport, CsvError } from "../src/csv";
import { formatDataValue } from "../src/format";

const f = <T extends FieldDefinition["type"]>(key: string, label: string, type: T, extra: Partial<FieldDefinition> = {}): FieldDefinition =>
  ({ key, label, type, required: false, visibility: "public", options: defaultFieldOptions(type), ...extra }) as FieldDefinition;

const phases: DatasetSchema = {
  fields: [
    f("name", "Name", "text", { required: true }),
    f("status", "Status", "select", { options: { choices: [{ value: "done", label: "Done", tone: "positive" }, { value: "underway", label: "Underway", tone: "caution" }, { value: "planned", label: "Planned" }] } } as never),
    f("detail", "Detail", "longText"),
    f("date", "Date", "date"),
    f("cost", "Cost", "currency"),
    f("source_notes", "Source notes", "longText", { visibility: "private" })
  ],
  retiredKeys: []
};

describe("dataset schemas", () => {
  it("accept a well-formed schema and refuse unknown properties, duplicate keys and retired keys", () => {
    expect(validateDatasetSchema(phases).ok).toBe(true);
    expect(validateDatasetSchema({ ...phases, css: "x" }).ok).toBe(false);
    expect(validateDatasetSchema({ fields: [{ ...phases.fields[0], validate: "() => true" }], retiredKeys: [] }).ok).toBe(false);
    expect(validateDatasetSchema({ fields: [phases.fields[0], { ...phases.fields[2], key: "name", label: "Other" }], retiredKeys: [] }).ok).toBe(false);
    expect(validateDatasetSchema({ fields: [phases.fields[0]], retiredKeys: ["name"] }).ok).toBe(false);
    expect(validateDatasetSchema({ fields: [{ ...phases.fields[0], key: "Name With Spaces" }], retiredKeys: [] }).ok).toBe(false);
  });

  it("keep field keys stable when labels change, and never reuse a removed key", () => {
    const relabeled: DatasetSchema = { ...phases, fields: phases.fields.map((entry) => (entry.key === "name" ? { ...entry, label: "Phase" } : entry)) };
    expect(schemaChangeIssues(phases, relabeled)).toEqual([]);
    const removedWithoutRetiring: DatasetSchema = { ...phases, fields: phases.fields.filter((entry) => entry.key !== "detail") };
    expect(schemaChangeIssues(phases, removedWithoutRetiring)[0]?.message).toMatch(/retire/);
    const removed: DatasetSchema = { fields: removedWithoutRetiring.fields, retiredKeys: ["detail"] };
    expect(schemaChangeIssues(phases, removed)).toEqual([]);
    expect(schemaChangeIssues(removed, { ...removed, retiredKeys: [] })[0]?.message).toMatch(/must stay retired/);
    expect(fieldKeyFromLabel("Detail", ["name", "detail"])).toBe("detail_2");
    expect(fieldKeyFromLabel("Precincts reporting (%)", [])).toBe("precincts_reporting");
    expect(fieldKeyFromLabel("2026 total", [])).toBe("f_2026_total");
  });

  it("allows only value-preserving type changes and reports removed choices for a row check", () => {
    const toNumber: DatasetSchema = { ...phases, fields: phases.fields.map((entry) => (entry.key === "date" ? ({ ...entry, type: "integer", options: {} } as FieldDefinition) : entry)) };
    expect(schemaChangeIssues(phases, toNumber)[0]?.message).toMatch(/can't change/);
    const fewer: DatasetSchema = { ...phases, fields: phases.fields.map((entry) => (entry.type === "select" ? ({ ...entry, options: { choices: entry.options.choices.slice(0, 2) } } as FieldDefinition) : entry)) };
    expect(removedChoices(phases, fewer)).toEqual([{ key: "status", values: ["planned"] }]);
  });
});

describe("typed values", () => {
  const byKey = (key: string) => phases.fields.find((entry) => entry.key === key)!;
  it("normalizes valid values and refuses nonsense", () => {
    expect(validateValue(byKey("name"), "  North   segment ")).toEqual({ ok: true, value: "North segment" });
    expect(validateValue(byKey("status"), "done")).toEqual({ ok: true, value: "done" });
    expect(validateValue(byKey("status"), "Done").ok).toBe(false);
    expect(validateValue(byKey("date"), "2026-02-30").ok).toBe(false);
    expect(validateValue(byKey("cost"), "1250.5")).toEqual({ ok: true, value: "1250.50" });
    expect(validateValue(byKey("cost"), "12.505").ok).toBe(false);
    expect(validateValue(f("n", "N", "integer"), 2.5).ok).toBe(false);
    expect(validateValue(f("p", "P", "percentage"), 101).ok).toBe(false);
    expect(validateValue(f("u", "U", "url"), "javascript:alert(1)").ok).toBe(false);
    expect(validateValue(f("u", "U", "url"), "https://user:pw@example.com").ok).toBe(false);
    expect(validateValue(f("t", "T", "dateTime"), "2026-11-10T08:00:00-05:00")).toEqual({ ok: true, value: "2026-11-10T13:00:00.000Z" });
  });

  it("parses pasted text strictly", () => {
    expect(parseValueText(f("p", "P", "percentage"), "45.5%")).toEqual({ ok: true, value: 45.5 });
    expect(parseValueText(byKey("cost"), "$1,234.5")).toEqual({ ok: true, value: "1234.50" });
    expect(parseValueText(f("b", "B", "boolean"), "Yes")).toEqual({ ok: true, value: true });
    expect(parseValueText(f("b", "B", "boolean"), "maybe").ok).toBe(false);
    expect(parseValueText(byKey("status"), "underway")).toEqual({ ok: true, value: "underway" });
    expect(parseValueText(byKey("status"), "Planned")).toEqual({ ok: true, value: "planned" });
    expect(parseValueText(byKey("date"), "3/7/2026")).toEqual({ ok: true, value: "2026-03-07" });
    expect(parseValueText(f("n", "N", "integer"), "12 apples").ok).toBe(false);
  });

  it("validates whole records against the current schema and fails closed on unknown keys", () => {
    expect(validateRecordValues(phases, { name: "Survey", nope: 1 }).ok).toBe(false);
    const result = validateRecordValues({ ...phases, retiredKeys: ["old"] }, { name: "Survey", old: "dropped" });
    expect(result.ok && result.values).toMatchObject({ name: "Survey", status: null });
    expect(result.ok && "old" in result.values).toBe(false);
  });
});

const records = [
  { id: "survey", included: true, values: { name: "Survey and design", status: "done", detail: "Finished in March.", date: "2025-03-01", cost: "1000.00", source_notes: "Call the city engineer: 555-0100" } },
  { id: "north", included: true, values: { name: "North segment", status: "done", detail: "Opened.", date: "2025-08-18", cost: null, source_notes: "PRIVATE-SENTINEL" } },
  { id: "draft-row", included: false, values: { name: "Not ready", status: "planned", detail: "", date: null, cost: null, source_notes: null } },
  { id: "south", included: true, values: { name: "South segment", status: "planned", detail: "Bids due.", date: null, cost: null, source_notes: null } }
];

function release() {
  const result = projectRelease({ dataset: { key: "sidewalk-phases", title: "Sidewalk phases" }, schema: phases, records, revision: 7, releasedAt: "2026-11-10T12:00:00Z" });
  if (!result.ok) throw new Error(result.issues.join(" "));
  return result.release;
}

describe("releases", () => {
  it("carry only included rows and public fields: private values are physically absent", () => {
    const value = release();
    expect(value.records.map((record) => record.id)).toEqual(["survey", "north", "south"]);
    expect(value.fields.map((entry) => entry.key)).not.toContain("source_notes");
    const bytes = serializeRelease(value);
    expect(bytes).not.toContain("PRIVATE-SENTINEL");
    expect(bytes).not.toContain("source_notes");
    expect(bytes).not.toContain("555-0100");
    expect(parseReleaseBytes(bytes)).toEqual(value);
  });

  it("refuses an included row missing a required value, and relationships to unpublished records", () => {
    const missing = projectRelease({ dataset: { key: "x", title: "X" }, schema: phases, records: [{ id: "bad", included: true, values: { name: null } }], revision: 1, releasedAt: "2026-11-10T12:00:00Z" });
    expect(missing.ok).toBe(false);
    const linked: DatasetSchema = { fields: [f("name", "Name", "text"), f("race", "Race", "relationship", { options: { dataset: "races" } } as never)], retiredKeys: [] };
    const unpublished = projectRelease({ dataset: { key: "candidates", title: "Candidates" }, schema: linked, records: [{ id: "cand-1", included: true, values: { name: "A", race: "mayor" } }], revision: 1, releasedAt: "2026-11-10T12:00:00Z", relationshipTarget: () => false });
    expect(unpublished.ok).toBe(false);
    const published = projectRelease({ dataset: { key: "candidates", title: "Candidates" }, schema: linked, records: [{ id: "cand-1", included: true, values: { name: "A", race: "mayor" } }], revision: 1, releasedAt: "2026-11-10T12:00:00Z", relationshipTarget: (dataset, id) => dataset === "races" && id === "mayor" });
    expect(published.ok).toBe(true);
  });

  it("validates releases strictly: private fields, extra keys, invalid values and non-canonical bytes fail", () => {
    const value = release();
    expect(() => validateRelease({ ...value, fields: [...value.fields, { ...phases.fields[5] }] })).toThrow();
    expect(() => validateRelease({ ...value, records: [{ id: "survey", values: { ...value.records[0].values, source_notes: "x" } }] })).toThrow(/outside the public schema/);
    expect(() => validateRelease({ ...value, extra: true })).toThrow();
    expect(() => validateRelease({ ...value, records: [{ ...value.records[0], values: { ...value.records[0].values, status: "nope" } }] })).toThrow(/invalid Status/);
    expect(() => parseReleaseBytes(JSON.stringify(value, null, 2))).toThrow(/canonical/);
    const descriptor = releaseDescriptor(value, { sha256: "a".repeat(64), bytes: 100 });
    expect(releaseMatchesDescriptor(value, descriptor)).toBe(true);
    expect(releaseMatchesDescriptor({ ...value, revision: 8 }, descriptor)).toBe(false);
    expect(canonicalJson({ b: 1, a: [2, 1] })).toBe('{"a":[2,1],"b":1}');
  });
});

const descriptor: DataPresentationDescriptor = validatePresentationDescriptor({
  key: "progress", kind: "template", name: "Progress", description: "Milestones.", styles: false, client: false, fixture: false,
  slots: [{ key: "phases", label: "Phases", required: true, fields: { name: field.text({ label: "Name" }), status: field.choice({ label: "Status" }), date: field.date({ label: "Date", optional: true }) } }],
  settings: [{ key: "summary", ...setting.boolean({ label: "Show summary", default: true }) }, { key: "order", ...setting.choice({ label: "Order", default: "editor", choices: [{ value: "editor", label: "Editor order" }, { value: "date", label: "Date" }] }) }]
});

describe("presentation descriptors and bindings", () => {
  it("rejects malformed descriptors", () => {
    expect(() => validatePresentationDescriptor({ ...descriptor, key: "Bad Key" })).toThrow();
    expect(() => validatePresentationDescriptor({ ...descriptor, slots: [...descriptor.slots, descriptor.slots[0]] })).toThrow(/twice/);
    expect(() => validatePresentationDescriptor({ ...descriptor, Component: () => null })).toThrow();
    expect(() => validatePresentationDescriptor({ ...descriptor, settings: [{ key: "n", ...setting.number({ label: "N", default: 50, min: 0, max: 10 }) }] })).toThrow(/default/);
  });

  it("enforces required roles, compatible types and public fields", () => {
    const fields = phases.fields;
    const datasets = (key: string) => (key === "sidewalk-phases" ? fields : undefined);
    expect(validateBindings(descriptor, [{ slot: "phases", dataset: "sidewalk-phases", fields: { name: "name", status: "status" } }], datasets, { requirePublic: true })).toEqual([]);
    expect(validateBindings(descriptor, [], datasets, { requirePublic: true })[0]?.message).toMatch(/Choose a dataset/);
    expect(validateBindings(descriptor, [{ slot: "phases", dataset: "sidewalk-phases", fields: { name: "name" } }], datasets, { requirePublic: true })[0]?.message).toMatch(/choose a field for Status/);
    expect(validateBindings(descriptor, [{ slot: "phases", dataset: "sidewalk-phases", fields: { name: "name", status: "date" } }], datasets, { requirePublic: true })[0]?.message).toMatch(/can't be used/);
    expect(validateBindings(descriptor, [{ slot: "phases", dataset: "sidewalk-phases", fields: { name: "source_notes", status: "status" } }], datasets, { requirePublic: true })[0]?.message).toMatch(/private/);
    expect(validateBindings(descriptor, [{ slot: "phases", dataset: "sidewalk-phases", fields: { name: "source_notes", status: "status" } }], datasets, { requirePublic: false })).toEqual([]);
    expect(validateBindings(descriptor, [{ slot: "phases", dataset: "nope", fields: {} }], datasets, { requirePublic: true })[0]?.message).toMatch(/no published release/);
  });

  it("normalizes settings with defaults and refuses unknown or invalid ones", () => {
    expect(normalizeSettings(descriptor, {})).toEqual({ settings: { summary: true, order: "editor" }, issues: [] });
    expect(normalizeSettings(descriptor, { order: "random" }).issues.length).toBe(1);
    expect(normalizeSettings(descriptor, { css: "body{}" }).issues.length).toBe(1);
  });

  it("binds releases to roles so code never reads labels or field keys", () => {
    const bound = bindSlot<"name" | "status" | "date">(descriptor.slots[0], { slot: "phases", dataset: "sidewalk-phases", fields: { name: "name", status: "status" } }, release());
    expect(bound.roles.name?.label).toBe("Name");
    expect(bound.roles.date).toBeNull();
    expect(bound.records[0].roles).toEqual({ name: "Survey and design", status: "done", date: null });
  });
});

describe("the public data section", () => {
  const value = release();
  const sha = "b".repeat(64);
  const project = {
    id: 1, slug: "sidewalk", title: "Sidewalk", deck: "", href: "/data/sidewalk/", presentation: { kind: "template", key: "progress" },
    settings: { summary: true, order: "editor" }, bindings: [{ slot: "phases", dataset: "sidewalk-phases", release: sha, fields: { name: "name", status: "status" } }],
    source: "", methodology: "", indexing: "public", publishedAt: "2026-11-10T12:00:00.000Z", modifiedAt: "2026-11-10T12:00:00.000Z", dataUpdatedAt: value.releasedAt, relatedStories: []
  };
  const section = { projects: [project], releases: [releaseDescriptor(value, { sha256: sha, bytes: 200 })] };
  const presentation = (key: string) => (key === "progress" ? descriptor : undefined);

  it("validates and fails closed on unknown presentations, missing releases, private fields and duplicate routes", () => {
    expect(validatePublicDataSection(section, { presentation }).projects).toHaveLength(1);
    expect(() => validatePublicDataSection(section, { presentation: () => undefined })).toThrow(/unregistered presentation/);
    expect(() => validatePublicDataSection({ ...section, releases: [] }, { presentation })).toThrow(/isn't in the snapshot/);
    expect(() => validatePublicDataSection({ ...section, releases: [{ ...section.releases[0], fields: [...section.releases[0].fields, phases.fields[5]] }] }, { presentation })).toThrow();
    expect(() => validatePublicDataSection({ ...section, projects: [project, { ...project, id: 2 }] }, { presentation })).toThrow(/slug/);
    expect(() => validatePublicDataSection({ projects: [], releases: section.releases }, { presentation })).toThrow(/not used/);
    expect(() => validatePublicDataSection({ ...section, projects: [{ ...project, bindings: [{ ...project.bindings[0], fields: { name: "name" } }] }] }, { presentation })).toThrow(/incompatible bindings/);
    const claimed = new Set<string>(["/data/sidewalk/"]);
    expect(() => validatePublicDataSection(section, { presentation, claim: (path) => { if (claimed.has(path)) throw new Error(`duplicate public path ${path}`); } })).toThrow(/duplicate/);
  });
});

describe("queries", () => {
  const rows = release().records.map((record, position) => ({ id: record.id, values: record.values, position }));
  it("validates field IDs and operator compatibility", () => {
    expect(validateQuery(phases, { filters: [{ field: "status", op: "equals", value: "done" }] }).ok).toBe(true);
    expect(validateQuery(phases, { filters: [{ field: "nope", op: "equals", value: "x" }] }).ok).toBe(false);
    expect(validateQuery(phases, { filters: [{ field: "name", op: "gt", value: 3 }] }).ok).toBe(false);
    expect(validateQuery(phases, { filters: [{ field: "status", op: "equals", value: "unknown" }] }).ok).toBe(false);
    expect(validateQuery(phases, { sql: "drop table" }).ok).toBe(false);
    expect(validateQuery(phases, { limit: 100_000 }).ok).toBe(false);
  });

  it("evaluates the same semantics in memory", () => {
    const checked = validateQuery(phases, { filters: [{ field: "status", op: "anyOf", value: ["done"] }], sort: [{ field: "date", direction: "desc" }] });
    if (!checked.ok) throw new Error("invalid");
    expect(evaluateQuery(phases, rows, checked.query).rows.map((row) => row.id)).toEqual(["north", "survey"]);
    const search = validateQuery(phases, { search: "bids" });
    if (!search.ok) throw new Error("invalid");
    expect(evaluateQuery(phases, rows, search.query).rows.map((row) => row.id)).toEqual(["south"]);
    const empty = validateQuery(phases, { sort: [{ field: "date", direction: "asc" }] });
    if (!empty.ok) throw new Error("invalid");
    expect(evaluateQuery(phases, rows, empty.query).rows.at(-1)?.id).toBe("south");
  });
});

describe("CSV", () => {
  it("parses quoted CSV, tab-separated text, and enforces limits", () => {
    expect(parseDelimited('Name,Detail\r\n"North, segment","She said ""open"""\n')).toEqual([["Name", "Detail"], ["North, segment", 'She said "open"']]);
    expect(parseDelimited("Name\tStatus\nA\tDone")).toEqual([["Name", "Status"], ["A", "Done"]]);
    expect(() => parseDelimited('"unclosed')).toThrow(CsvError);
    expect(() => parseDelimited("a\nb\nc\n", { limits: { rows: 1 } })).toThrow(/rows/);
  });

  it("maps columns to stable fields and reports bad cells instead of coercing", () => {
    const [header, ...data] = parseDelimited("Name,Status,Cost,Extra\nNorth,Done,$5,x\nSouth,Maybe,abc,y");
    const mapping = guessColumnMapping(header, phases.fields);
    expect(mapping).toEqual(["name", "status", "cost", null]);
    const preview = previewImport(header, data, mapping, phases.fields);
    expect(preview.rows[0]).toEqual({ name: "North", status: "done", cost: "5.00" });
    expect(preview.issues.map((issue) => `${issue.row}:${issue.column}`)).toEqual(["3:Status", "3:Cost"]);
    expect(preview.ignored).toEqual(["Extra"]);
  });

  it("infers typed fields from a pasted table", () => {
    const [header, ...rows] = parseDelimited("Band\tScore\tReporting\tBudget\tFinal\tDate\tDivision\nNorth\t92\t45%\t$1,200\tyes\t2026-10-04\tA\nSouth\t88.5\t100%\t$900.50\tno\t2026-10-11\tA\nEast\t71\t12%\t$80\tno\t2026-10-18\tB\nWest\t79\t3%\t$50\tyes\t2026-10-25\tB");
    const fields = inferFieldsFromTable(header, rows);
    expect(fields.map((entry) => `${entry.key}:${entry.type}`)).toEqual(["band:text", "score:number", "reporting:percentage", "budget:currency", "final:boolean", "date:date", "division:select"]);
    const division = fields[6];
    expect(division.type === "select" && division.options.choices).toEqual([{ value: "a", label: "A" }, { value: "b", label: "B" }]);
    expect(validateDatasetSchema({ fields, retiredKeys: [] }).ok).toBe(true);
  });

  it("defuses spreadsheet formulas on export", () => {
    expect(defuseSpreadsheetFormula("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(defuseSpreadsheetFormula("-5")).toBe("-5");
    expect(defuseSpreadsheetFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    const csv = datasetToCsv([phases.fields[0]], [{ values: { name: "=1+1" } }]);
    expect(csv).toBe("Name\r\n'=1+1\r\n");
  });
});

describe("formatting", () => {
  it("formats values in the publication locale and timezone", () => {
    const options = { locale: "en-US", timeZone: "America/New_York" };
    expect(formatDataValue(phases.fields[4], "1234.50", options)).toBe("$1,234.50");
    expect(formatDataValue(f("p", "P", "percentage"), 45.5, options)).toBe("45.5%");
    expect(formatDataValue(phases.fields[3], "2026-03-07", options)).toBe("Mar 7, 2026");
    expect(formatDataValue(phases.fields[1], "done", options)).toBe("Done");
  });
});
