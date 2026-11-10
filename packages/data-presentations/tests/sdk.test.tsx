// @vitest-environment jsdom
import { defaultFieldOptions, projectRelease, type DataRelease, type DatasetSchema, type FieldDefinition, type PublicDataProject } from "@byline/data";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createDataPresentationRegistry,
  dataPresentationRegistry,
  dataTemplates,
  defineDataPresentation,
  defineDataTemplate,
  describeDataPresentations,
  DataProjectEmbedView,
  DataProjectView,
  field,
  fixtureDataPresentations,
  headingTag,
  resolveDataProject,
  slot,
  type DataPresentationHost
} from "../src";
import { startDataPresentation } from "../src/client";
import sidewalkClient from "../src/presentations/fixture-sidewalk-project/client";
import tableClient from "../src/templates/table/client";

const f = (key: string, label: string, type: FieldDefinition["type"], extra: Partial<FieldDefinition> = {}): FieldDefinition =>
  ({ key, label, type, required: false, visibility: "public", options: defaultFieldOptions(type), ...extra }) as FieldDefinition;

const schema: DatasetSchema = {
  fields: [
    f("name", "Name", "text", { required: true }),
    f("status", "Status", "select", { options: { choices: [{ value: "done", label: "Done", tone: "positive" }, { value: "underway", label: "Underway", tone: "caution" }, { value: "planned", label: "Planned" }] } } as never),
    f("detail", "Detail", "longText"),
    f("date", "Date", "date"),
    f("score", "Score", "integer"),
    f("budget", "Budget", "currency", { options: { currency: "USD", scale: 2 } } as never),
    f("winner", "Winner", "boolean"),
    f("notes", "Reporter notes", "longText", { visibility: "private" })
  ],
  retiredKeys: []
};

function makeRelease(): DataRelease {
  const result = projectRelease({
    dataset: { key: "sidewalk-phases", title: "Sidewalk phases" },
    schema,
    revision: 4,
    releasedAt: "2026-11-09T15:00:00Z",
    records: [
      { id: "survey", included: true, values: { name: "Survey and design", status: "done", detail: "Finished in March 2025.", date: "2025-03-14", score: 80, budget: "999999999999999.98", winner: false, notes: "PRIVATE-SENTINEL" } },
      { id: "north", included: true, values: { name: "North segment", status: "done", detail: "Opened Aug. 18, 2025.", date: "2025-08-18", score: 92, budget: "999999999999999.99", winner: true } },
      { id: "crossing", included: true, values: { name: "Greenwood High crossing", status: "underway", detail: "Signals arrive in November.", date: "2025-11-01", score: 92, budget: "1.00" } },
      { id: "south", included: true, values: { name: "South segment", status: "planned", detail: "Bids due in January 2026.", date: null, score: null } }
    ]
  });
  if (!result.ok) throw new Error(result.issues.join(" "));
  return result.release;
}

const sha = "c".repeat(64);
const project = (key: string, kind: "template" | "custom", fields: Record<string, string>, settings: Record<string, unknown> = {}): PublicDataProject => ({
  id: 7, slug: "sidewalk", title: "Main Street sidewalk", deck: "Where the project stands.", href: "/data/sidewalk/", presentation: { kind, key },
  settings: settings as never, bindings: [{ slot: Object.keys(dataPresentationRegistry({ fixtures: true })[key].descriptor.slots.reduce((all, entry) => ({ ...all, [entry.key]: true }), {}))[0], dataset: "sidewalk-phases", release: sha, fields }],
  source: "City engineering department.", methodology: "We check the city's project page weekly.\n\nPhases are the city's own.", indexing: "public",
  publishedAt: "2026-11-09T15:00:00.000Z", modifiedAt: "2026-11-09T15:00:00.000Z", dataUpdatedAt: "2026-11-09T15:00:00.000Z", relatedStories: []
});
const host: DataPresentationHost = { styles: (key) => <style data-styles={key} /> };
const format = { locale: "en-US", timeZone: "America/New_York" };

function render(key: string, kind: "template" | "custom", fields: Record<string, string>, settings: Record<string, unknown> = {}) {
  const registry = dataPresentationRegistry({ fixtures: true });
  const outcome = resolveDataProject(registry[key], { source: "published", project: project(key, kind, fields, settings) as never, releases: new Map([[sha, makeRelease()]]) }, format);
  if (!outcome.ok) throw new Error(outcome.issues.join(" "));
  return renderToStaticMarkup(<DataProjectView resolved={outcome.resolved} host={host} notes={{ source: "City engineering department.", methodology: "We check weekly." }} />);
}

describe("registry", () => {
  it("rejects duplicate keys and keeps fixtures out of production", () => {
    expect(() => createDataPresentationRegistry([dataTemplates[0], dataTemplates[0]])).toThrow(/Two Data presentations/);
    expect(() => createDataPresentationRegistry(fixtureDataPresentations)).toThrow(/outside fixture mode/);
    expect(Object.keys(dataPresentationRegistry())).not.toContain("fixture-sidewalk-project");
    expect(Object.keys(dataPresentationRegistry({ fixtures: true }))).toContain("fixture-sidewalk-project");
  });

  it("describes presentations as plain serializable data", () => {
    const descriptors = describeDataPresentations(dataPresentationRegistry({ fixtures: true }));
    expect(JSON.parse(JSON.stringify(descriptors))).toEqual(descriptors);
    expect(descriptors.map((entry) => `${entry.kind}:${entry.key}`)).toEqual(["template:table", "template:ranking", "template:timeline", "custom:fixture-sidewalk-project"]);
    expect(descriptors.find((entry) => entry.key === "ranking")?.slots[0].fields.value.types).toContain("integer");
  });

  it("rejects malformed definitions", () => {
    expect(() => defineDataTemplate({ key: "Bad Key", name: "x", description: "x", datasets: { rows: slot({ label: "Rows", fields: {} }) }, Component: () => null })).toThrow();
    expect(() => defineDataTemplate({ key: "no-slots", name: "x", description: "x", datasets: {}, Component: () => null })).toThrow();
    expect(() => defineDataTemplate({ key: "all-optional", name: "x", description: "x", datasets: { rows: slot({ label: "Rows", optional: true, fields: {} }) }, Component: () => null })).toThrow(/at least one/);
  });
});

describe("binding and prepare", () => {
  it("enforces required field bindings before rendering", () => {
    const registry = dataPresentationRegistry({ fixtures: true });
    const outcome = resolveDataProject(registry.ranking, { source: "published", project: project("ranking", "template", { name: "name" }) as never, releases: new Map([[sha, makeRelease()]]) }, format);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.issues.join(" ")).toMatch(/Score/);
    const unknown = resolveDataProject(undefined, { source: "published", project: project("ranking", "template", {}) as never, releases: new Map() }, format);
    expect(!unknown.ok && unknown.issues[0]).toMatch(/isn't registered/);
  });

  it("validates custom transform output: plain, bounded and deterministic", () => {
    let calls = 0;
    const flaky = defineDataPresentation({ key: "flaky", name: "Flaky", description: "Reads the clock.", datasets: { rows: slot({ label: "Rows", fields: { name: field.text() } }) }, prepare: () => ({ at: ++calls }), Component: () => null });
    const dated = defineDataPresentation({ key: "dated", name: "Dated", description: "Returns a Date.", datasets: { rows: slot({ label: "Rows", fields: { name: field.text() } }) }, prepare: () => ({ at: new Date(0) as unknown as string }), Component: () => null });
    for (const definition of [flaky, dated]) {
      const outcome = resolveDataProject(definition, { source: "working", project: { id: 1, title: "x", deck: "", slug: "x", presentation: { kind: "custom", key: definition.descriptor.key }, settings: {}, bindings: [{ slot: "rows", dataset: "sidewalk-phases", fields: { name: "name" } }] }, releases: new Map([["sidewalk-phases", makeRelease()]]) }, format);
      expect(outcome.ok).toBe(false);
    }
  });

  it("ranks with ties through the template's prepare", () => {
    const html = render("ranking", "template", { name: "name", value: "score", highlight: "winner" });
    expect(html).toContain('aria-label="Tied for 1"');
    expect(html).toContain("T-1");
    expect(html).toMatch(/without a score is not ranked/);
  });

  it("keeps exact currency amounts distinct when ranking", () => {
    const html = render("ranking", "template", { name: "name", value: "budget" });
    expect(html.indexOf("North segment")).toBeLessThan(html.indexOf("Survey and design"));
    expect(html).not.toContain("T-1");
  });
});

describe("server rendering", () => {
  it("renders meaningful HTML with no script, with the private field absent", () => {
    const html = render("fixture-sidewalk-project", "custom", { name: "name", status: "status", detail: "detail", date: "date" });
    expect(html).toContain("<h1 class=\"data-project-title\">Main Street sidewalk</h1>");
    expect(html).toContain("2 of 4 phases done");
    expect(html).toContain("Greenwood High crossing");
    expect(html).toContain('data-data-releases="{&quot;phases&quot;:&quot;/_byline/data/' + sha + '.json&quot;}"');
    expect(html).toContain('<style data-styles="fixture-sidewalk-project">');
    expect(html).toContain("About this data");
    expect(html).not.toContain("PRIVATE-SENTINEL");
    expect(html).not.toContain("Reporter notes");
  });

  it("renders a real table and timeline", () => {
    const table = render("table", "template", { heading: "name" });
    expect(table).toMatch(/<th scope="row"[^>]*>Survey and design<\/th>/);
    expect(table).toContain("<caption>Sidewalk phases: 4 rows</caption>");
    const timeline = render("timeline", "template", { title: "name", date: "date", status: "status", detail: "detail" });
    expect(timeline).toContain('<h2 class="data-timeline-year">2025</h2>');
    expect(timeline).toContain("1 entry without a date is not shown.");
  });
});

describe("client enhancement", () => {
  function mount(html: string) {
    document.body.innerHTML = html;
    return document.querySelector<HTMLElement>("[data-data-presentation]")!;
  }

  it("adds the fixture filter and cleans up", async () => {
    const article = mount(render("fixture-sidewalk-project", "custom", { name: "name", status: "status" }));
    const cleanup = await startDataPresentation(article, () => Promise.resolve({ default: sidewalkClient }));
    const box = article.querySelector<HTMLInputElement>(".sidewalk-filter input")!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(article.querySelector<HTMLElement>("[data-fixture-data-presentation]")!.dataset.remainingOnly).toBe("true");
    cleanup?.();
    expect(article.querySelector(".sidewalk-filter")).toBeNull();
  });

  it("searches and sorts table rows already in the HTML", async () => {
    const article = mount(render("table", "template", { heading: "name" }));
    await startDataPresentation(article, () => Promise.resolve({ default: tableClient }));
    const input = article.querySelector<HTMLInputElement>(".data-table-tools input")!;
    input.value = "crossing";
    input.dispatchEvent(new Event("input"));
    expect([...article.querySelectorAll("tbody tr")].filter((row) => !(row as HTMLElement).hidden)).toHaveLength(1);
    const scoreHeader = [...article.querySelectorAll<HTMLElement>("thead th")].find((cell) => cell.textContent?.includes("Score"))!;
    scoreHeader.querySelector("button")!.click();
    expect(scoreHeader.getAttribute("aria-sort")).toBe("ascending");
    expect(article.querySelector("tbody tr th")?.textContent).toBe("Survey and design");

    const budgetHeader = [...article.querySelectorAll<HTMLElement>("thead th")].find((cell) => cell.textContent?.includes("Budget"))!;
    budgetHeader.querySelector("button")!.click();
    budgetHeader.querySelector("button")!.click();
    expect(budgetHeader.getAttribute("aria-sort")).toBe("descending");
    expect(article.querySelector("tbody tr th")?.textContent).toBe("North segment");
  });

  it("ignores a release path that is not a public release", async () => {
    const article = mount(render("fixture-sidewalk-project", "custom", { name: "name", status: "status" }));
    article.querySelector<HTMLElement>("[data-data-root]")!.dataset.dataReleases = JSON.stringify({ phases: "https://evil.example/x.json" });
    let seen: Record<string, string> = {};
    await startDataPresentation(article, () => Promise.resolve({ default: (_root, context) => { seen = context.releases; } }));
    expect(seen).toEqual({});
  });
});

describe("Story embeds", () => {
  function resolved(key: string, kind: "template" | "custom", fields: Record<string, string>) {
    const registry = dataPresentationRegistry({ fixtures: true });
    const outcome = resolveDataProject(registry[key], { source: "published", project: project(key, kind, fields) as never, releases: new Map([[sha, makeRelease()]]) }, format);
    if (!outcome.ok) throw new Error(outcome.issues.join(" "));
    return outcome.resolved;
  }
  const embed = (key: string, kind: "template" | "custom", fields: Record<string, string>, blockId: string, title = "Where the sidewalk stands", description = "Milestones, funding and what is left.", frame = true) =>
    renderToStaticMarkup(<DataProjectEmbedView resolved={resolved(key, kind, fields)} host={{ ...host, ...(frame ? { frameStyles: () => <style data-frame="" /> } : {}) }} blockId={blockId} title={title} description={description} source="City engineering department." href="/data/sidewalk/" />);

  it("draws the story's own heading and description around the same presentation, without the page frame", () => {
    const html = embed("fixture-sidewalk-project", "custom", { name: "name", status: "status", detail: "detail", date: "date" }, "blk-a");
    expect(html).toContain('<h2 class="data-project-embed-title" id="blk-a-heading">Where the sidewalk stands</h2>');
    expect(html).toContain("Milestones, funding and what is left.");
    expect(html).toContain("2 of 4 phases done");
    expect(html).toContain("Source: </span>City engineering department.");
    expect(html).toContain('<a href="/data/sidewalk/">View full data project');
    expect(html).toContain('aria-labelledby="blk-a-heading"');
    expect(html).toContain('<style data-styles="fixture-sidewalk-project">');
    // The standalone page's frame stays on /data/<slug>/.
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("About this data");
    expect(html).not.toContain("data-project-related");
    expect(html).not.toContain("data-project-title");
    expect(html).not.toContain("data-project-deck");
    expect(html).not.toContain("PRIVATE-SENTINEL");
  });

  it("renders the built-in templates and the same presentation twice with unique ids", () => {
    const table = embed("table", "template", { heading: "name" }, "blk-t");
    expect(table).toMatch(/<th scope="row"[^>]*>Survey and design<\/th>/);
    const once = embed("table", "template", { heading: "name" }, "blk-1");
    const twice = embed("table", "template", { heading: "name" }, "blk-2");
    expect(once).toContain('id="blk-1-heading"');
    expect(twice).toContain('id="blk-2-heading"');
    expect(once).toContain('data-data-presentation="table"');
  });

  it("enhances every embed independently with only its own root and releases", async () => {
    document.body.innerHTML = [embed("table", "template", { heading: "name" }, "blk-1"), embed("fixture-sidewalk-project", "custom", { name: "name", status: "status" }, "blk-2"), embed("table", "template", { heading: "name" }, "blk-3")].join("");
    const embeds = [...document.querySelectorAll<HTMLElement>("[data-data-embed]")];
    expect(embeds).toHaveLength(3);
    const roots: Element[] = [];
    const stops = await Promise.all(embeds.map((element) => startDataPresentation(element, () => Promise.resolve({ default: (root, context) => { roots.push(root); expect(Object.keys(context.releases)).toHaveLength(1); return () => undefined; } }))));
    expect(roots).toHaveLength(3);
    expect(new Set(roots).size).toBe(3);
    embeds.forEach((element, index) => expect(element.contains(roots[index])).toBe(true));
    expect(stops.every((stop) => typeof stop === "function")).toBe(true);
    // Real client code on two tables at once: searching one leaves the other alone.
    document.body.innerHTML = [embed("table", "template", { heading: "name" }, "blk-1"), embed("table", "template", { heading: "name" }, "blk-2")].join("");
    const [first, second] = [...document.querySelectorAll<HTMLElement>("[data-data-embed]")];
    await Promise.all([first, second].map((element) => startDataPresentation(element, () => Promise.resolve({ default: tableClient }))));
    const input = first.querySelector<HTMLInputElement>(".data-table-tools input")!;
    input.value = "crossing";
    input.dispatchEvent(new Event("input"));
    expect([...first.querySelectorAll("tbody tr")].filter((row) => !(row as HTMLElement).hidden)).toHaveLength(1);
    expect([...second.querySelectorAll("tbody tr")].filter((row) => !(row as HTMLElement).hidden)).toHaveLength(4);
  });

  it("prints the frame stylesheet only when the host offers it", () => {
    expect(embed("table", "template", { heading: "name" }, "blk-1")).toContain("data-frame");
    expect(embed("table", "template", { heading: "name" }, "blk-1", undefined, undefined, false)).not.toContain("data-frame");
  });
});

/** The page's heading outline, as [tag, text]: what a screen reader's headings list shows. */
const outline = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((node) => [node.tagName.toLowerCase(), node.textContent ?? ""] as const);
};

describe("heading hierarchy", () => {
  const timelineFields = { title: "name", date: "date", status: "status", detail: "detail" };
  const timelineEmbed = (blockId: string, title: string) => {
    const registry = dataPresentationRegistry({ fixtures: true });
    const outcome = resolveDataProject(registry.timeline, { source: "published", project: project("timeline", "template", timelineFields) as never, releases: new Map([[sha, makeRelease()]]) }, format);
    if (!outcome.ok) throw new Error(outcome.issues.join(" "));
    return renderToStaticMarkup(<DataProjectEmbedView resolved={outcome.resolved} host={host} blockId={blockId} title={title} description="" source="" href="/data/sidewalk/" />);
  };

  it("clamps the helper to real heading elements", () => {
    expect(headingTag(2)).toBe("h2");
    expect(headingTag(2, 1)).toBe("h3");
    expect(headingTag(3, 1)).toBe("h4");
    expect(headingTag(6, 1)).toBe("h6");
    expect(headingTag(0)).toBe("h1");
    expect(headingTag(2.9, 1.2)).toBe("h3");
  });

  it("standalone: h1 project, h2 year, h3 entry", () => {
    const tags = outline(render("timeline", "template", timelineFields));
    expect(tags[0]).toEqual(["h1", "Main Street sidewalk"]);
    expect(tags.filter(([tag]) => tag === "h2").map(([, text]) => text)).toEqual(expect.arrayContaining(["2025"]));
    expect(tags.some(([tag]) => tag === "h3")).toBe(true);
    expect(tags.some(([tag]) => tag === "h4")).toBe(false);
    // Year headings come before the entries they contain, and nothing skips a level.
    const levels = tags.map(([tag]) => Number(tag[1]));
    levels.forEach((level, index) => { if (index) expect(level - levels[index - 1]!).toBeLessThanOrEqual(1); });
  });

  it("in a Story: h2 embed heading, h3 year, h4 entry, and nothing but native headings", () => {
    const html = timelineEmbed("blk-a", "Where the sidewalk stands");
    const tags = outline(html);
    expect(tags[0]).toEqual(["h2", "Where the sidewalk stands"]);
    expect(tags.filter(([tag]) => tag === "h2")).toHaveLength(1);
    expect(tags.filter(([tag]) => tag === "h3").map(([, text]) => text)).toContain("2025");
    expect(tags.some(([tag]) => tag === "h4")).toBe(true);
    expect(tags.some(([tag]) => tag === "h5")).toBe(false);
    expect(html).not.toMatch(/role="heading"|aria-level/);
    const levels = tags.map(([tag]) => Number(tag[1]));
    levels.forEach((level, index) => { if (index) expect(level - levels[index - 1]!).toBeLessThanOrEqual(1); });
  });

  it("several embeds each keep their own outline and do not interfere", () => {
    const outlines = [timelineEmbed("blk-1", "First"), timelineEmbed("blk-2", "Second")].map(outline);
    expect(outlines[0]![0]).toEqual(["h2", "First"]);
    expect(outlines[1]![0]).toEqual(["h2", "Second"]);
    expect(outlines[0]!.map(([tag]) => tag)).toEqual(outlines[1]!.map(([tag]) => tag));
    const both = outline(timelineEmbed("blk-1", "First") + render("timeline", "template", timelineFields) + timelineEmbed("blk-2", "Second"));
    expect(both.map(([tag]) => tag).filter((tag) => tag === "h1")).toHaveLength(1);
  });

  it("a custom presentation gets the same context from the SDK", () => {
    const nested = defineDataPresentation({
      key: "fixture-nested-headings", name: "Nested headings", description: "Headings two deep.", fixture: true,
      datasets: { rows: slot({ label: "Rows", fields: { name: field.text() } }) },
      Component: ({ data, headingLevel }) => {
        const Section = headingTag(headingLevel);
        const Item = headingTag(headingLevel, 1);
        return <div>{data.rows.records.slice(0, 2).map((row) => <section key={row.id}><Section>Group {String(row.roles.name)}</Section><Item>Detail {String(row.roles.name)}</Item></section>)}</div>;
      }
    });
    const outcome = resolveDataProject(nested, { source: "working", project: { id: 1, title: "Nested", deck: "", slug: "nested", presentation: { kind: "custom", key: "fixture-nested-headings" }, settings: {}, bindings: [{ slot: "rows", dataset: "sidewalk-phases", fields: { name: "name" } }] }, releases: new Map([["sidewalk-phases", makeRelease()]]) }, format);
    if (!outcome.ok) throw new Error(outcome.issues.join(" "));
    const page = outline(renderToStaticMarkup(<DataProjectView resolved={outcome.resolved} host={host} notes={{ source: "", methodology: "" }} />)).map(([tag]) => tag);
    expect(page.slice(0, 5)).toEqual(["h1", "h2", "h3", "h2", "h3"]);
    const story = outline(renderToStaticMarkup(<DataProjectEmbedView resolved={outcome.resolved} host={host} blockId="blk" title="Story heading" description="" source="" href="/data/nested/" />)).map(([tag]) => tag);
    expect(story).toEqual(["h2", "h3", "h4", "h3", "h4"]);
  });
});
