// Regenerates the fixture build's Byline Data (tests/fixtures/data): two
// newsroom-style datasets projected into immutable releases by the SAME
// projection the newsroom publishes with, and three projects that bind them
// (a custom presentation, the Ranking template and the Timeline template;
// two projects share one release). The working rows include a private field
// carrying a sentinel that must never appear in any public artifact.
//
//   node --import tsx apps/web/scripts/generate-data-fixture.mts
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultFieldOptions, projectRelease, releaseDescriptor, serializeRelease, validatePublicDataSection, type DatasetSchema, type FieldDefinition, type PublicDataProject } from "@byline/data";
import { dataPresentationRegistry } from "@byline/data-presentations/registry";

export const FIXTURE_PRIVATE_SENTINEL = "PRIVATE-DATA-FIXTURE-SENTINEL";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/data");
const f = (key: string, label: string, type: FieldDefinition["type"], extra: Partial<FieldDefinition> = {}): FieldDefinition =>
  ({ key, label, type, required: false, visibility: "public", options: defaultFieldOptions(type), ...extra }) as FieldDefinition;

const phases: DatasetSchema = {
  fields: [
    f("name", "Phase", "text", { required: true }),
    f("status", "Status", "select", { options: { choices: [{ value: "done", label: "Done", tone: "positive" }, { value: "underway", label: "Underway", tone: "caution" }, { value: "planned", label: "Planned" }] } } as never),
    f("detail", "Detail", "longText"),
    f("date", "Date", "date"),
    f("city_contact", "City contact", "text", { visibility: "private" })
  ],
  retiredKeys: []
};
const bands: DatasetSchema = {
  fields: [
    f("band", "Band", "text", { required: true }),
    f("score", "Score", "number", { options: { decimals: 1 } } as never),
    f("division", "Division", "select", { options: { choices: [{ value: "a", label: "Class A" }, { value: "aa", label: "Class AA" }] } } as never),
    f("local", "Local school", "boolean"),
    f("judge_notes", "Judges' notes", "longText", { visibility: "private" })
  ],
  retiredKeys: []
};

function release(key: string, title: string, schema: DatasetSchema, revision: number, releasedAt: string, records: Array<{ id: string; values: Record<string, unknown>; included?: boolean }>) {
  const projected = projectRelease({ dataset: { key, title }, schema, revision, releasedAt, records: records.map((record) => ({ ...record, included: record.included !== false })) });
  if (!projected.ok) throw new Error(projected.issues.join(" "));
  const text = serializeRelease(projected.release);
  const bytes = Buffer.from(text, "utf8");
  return { text, descriptor: releaseDescriptor(projected.release, { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength }) };
}

const sidewalk = release("main-street-sidewalk-phases", "Main Street sidewalk phases", phases, 12, "2026-10-20T14:00:00.000Z", [
  { id: "survey", values: { name: "Survey and design", status: "done", detail: "Finished in March 2025.", date: "2025-03-14", city_contact: `${FIXTURE_PRIVATE_SENTINEL}: call 555-0100` } },
  { id: "north", values: { name: "North segment, Elm to Oak", status: "done", detail: "Opened Aug. 18, 2025.", date: "2025-08-18" } },
  { id: "crossing", values: { name: "Greenwood High crossing", status: "underway", detail: "Signals arrive in November; expected to open before winter break.", date: "2025-11-01" } },
  { id: "south", values: { name: "South segment, Oak to Pine", status: "planned", detail: "Bids due in January 2026.", date: "2026-01-15" } },
  { id: "lighting", values: { name: "Lighting", status: "planned", detail: "Depends on the 2026 budget." } },
  { id: "not-ready", values: { name: `Unconfirmed phase ${FIXTURE_PRIVATE_SENTINEL}`, status: "planned" }, included: false }
]);
const results = release("marching-band-results", "Marching band results", bands, 4, "2026-10-26T01:30:00.000Z", [
  { id: "greenwood", values: { band: "Greenwood High", score: 92.4, division: "aa", local: true, judge_notes: FIXTURE_PRIVATE_SENTINEL } },
  { id: "lakeview", values: { band: "Lakeview", score: 92.4, division: "aa", local: false } },
  { id: "north-county", values: { band: "North County", score: 88.1, division: "a", local: false } },
  { id: "riverside", values: { band: "Riverside", score: 85.6, division: "a", local: false } },
  { id: "eastfield", values: { band: "Eastfield", score: null, division: "a", local: false } }
]);

const base = { deck: "", source: "", methodology: "", indexing: "public" as const, publishedAt: "2026-10-20T15:00:00.000Z", modifiedAt: "2026-10-26T02:00:00.000Z", relatedStories: [] };
const projects: PublicDataProject[] = [
  {
    ...base, id: 1, slug: "main-street-sidewalk", href: "/data/main-street-sidewalk/", title: "Main Street sidewalk project",
    deck: "Which phases of the Main Street sidewalk project are done, what's underway and what's left.",
    source: "Greenwood city engineering department; Weekly Wildcat reporting.",
    methodology: "Weekly Wildcat reporters check the city's project page and meeting minutes every week.\n\nDates are when a phase finished or is scheduled to.",
    presentation: { kind: "custom", key: "fixture-sidewalk-project" }, settings: {},
    bindings: [{ slot: "phases", dataset: "main-street-sidewalk-phases", release: sidewalk.descriptor.sha256, fields: { name: "name", status: "status", detail: "detail", date: "date" } }],
    dataUpdatedAt: sidewalk.descriptor.releasedAt
  },
  {
    ...base, id: 2, slug: "marching-band-rankings", href: "/data/marching-band-rankings/", title: "Marching band rankings",
    deck: "Saturday's regional marching band competition, by final score.", source: "Regional Band Directors Association.",
    presentation: { kind: "template", key: "ranking" }, settings: { order: "desc", limit: 0, bars: true, valueLabel: "Score" },
    bindings: [{ slot: "entries", dataset: "marching-band-results", release: results.descriptor.sha256, fields: { name: "band", value: "score", highlight: "local" } }],
    dataUpdatedAt: results.descriptor.releasedAt
  },
  {
    ...base, id: 3, slug: "sidewalk-timeline", href: "/data/sidewalk-timeline/", title: "Main Street sidewalk timeline", indexing: "noindex",
    presentation: { kind: "template", key: "timeline" }, settings: { order: "oldest", groupByYear: true, linkLabel: "Read more" },
    bindings: [{ slot: "events", dataset: "main-street-sidewalk-phases", release: sidewalk.descriptor.sha256, fields: { title: "name", date: "date", detail: "detail", status: "status" } }],
    dataUpdatedAt: sidewalk.descriptor.releasedAt
  }
];

const registry = dataPresentationRegistry({ fixtures: true });
const section = validatePublicDataSection({ projects, releases: [sidewalk.descriptor, results.descriptor] }, { presentation: (key) => registry[key]?.descriptor });
await rm(root, { recursive: true, force: true });
await mkdir(path.join(root, "releases"), { recursive: true });
await writeFile(path.join(root, "public-data.json"), `${JSON.stringify(section, null, 2)}\n`);
for (const entry of [sidewalk, results]) await writeFile(path.join(root, "releases", `${entry.descriptor.sha256}.json`), entry.text);
console.log(`Wrote ${projects.length} projects and 2 releases to ${path.relative(process.cwd(), root)}.`);
