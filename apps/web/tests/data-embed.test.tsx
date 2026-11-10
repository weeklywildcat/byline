// @vitest-environment jsdom
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { validatePublicBuildSnapshot, type PublicBuildSnapshot } from "@byline/content";
import { normalizeSettings, type PublicDataSection } from "@byline/data";
import { dataPresentationRegistry } from "@byline/data-presentations/registry";
import { StructuredArticleBody } from "@byline/ui/article-body";
import type { ArticleBody } from "@byline/article-body";
import fixtureSection from "./fixtures/data/public-data.json";
import { materializeDataReleases } from "@/lib/data-releases";
import { DATA_EMBED_BLOCKS, DATA_EMBED_TIMELINE, dataEmbedBody, dataEmbedSnapshot } from "./fixtures/data-embed";

/**
 * Data Projects inside Stories (docs/byline-data.md#story-embeds): the public
 * Story host draws the very presentation the project's own page uses from the
 * releases already on disk, and the Story's route-cache key follows exactly
 * the projects it places.
 */
const SENTINEL = "PRIVATE-DATA-FIXTURE-SENTINEL";
const webRoot = path.resolve(__dirname, "..");
const fixtureReleases = path.join(webRoot, "tests/fixtures/data/releases");
const section = fixtureSection as unknown as PublicDataSection;
const registry = dataPresentationRegistry({ fixtures: true });
const presentation = (key: string) => registry[key]?.descriptor;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "byline-embed-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("the snapshot", () => {
  it("accepts a Story whose Data Projects are in the same snapshot", () => {
    expect(() => validatePublicBuildSnapshot(dataEmbedSnapshot(), { dataPresentation: presentation })).not.toThrow();
  });

  it("refuses a Story that names a project the snapshot does not publish, whatever the reason", () => {
    const missing = dataEmbedSnapshot({ body: dataEmbedBody([{ ...DATA_EMBED_BLOCKS[0], project: 404 }]) });
    expect(() => validatePublicBuildSnapshot(missing, { dataPresentation: presentation })).toThrow(/Data Project 404, which is not in this snapshot's Data section/);
    const unset = dataEmbedSnapshot({ body: dataEmbedBody([{ ...DATA_EMBED_BLOCKS[0], project: null as never }]) });
    expect(() => validatePublicBuildSnapshot(unset, { dataPresentation: presentation })).toThrow();
    // Only the Data section decides: dropping a project from it fails the Story that embeds it.
    const dropped = dataEmbedSnapshot({ data: { projects: section.projects.filter((project) => project.id !== 2), releases: section.releases.filter((release) => release.sha256 !== section.projects[1]!.bindings[0]!.release) } });
    expect(() => validatePublicBuildSnapshot(dropped, { dataPresentation: presentation })).toThrow(/Data Project 2/);
  });

  it("still accepts v2 and v3 bodies that do not use the block, and refuses the block in v2", () => {
    const plain = dataEmbedSnapshot({ body: { format: "byline-v1", version: 1, media: {}, nodes: [{ type: "paragraph", children: [{ type: "text", text: "Nothing embedded." }] }] } });
    expect(() => validatePublicBuildSnapshot(plain, { dataPresentation: presentation })).not.toThrow();
    const { data: _data, ...v2 } = { ...plain, schemaVersion: 2 as const };
    expect(() => validatePublicBuildSnapshot(v2)).not.toThrow();
    const { data: _embedded, ...v2WithBlock } = { ...dataEmbedSnapshot(), schemaVersion: 2 as const };
    expect(() => validatePublicBuildSnapshot(v2WithBlock)).toThrow(/not in this snapshot's Data section/);
  });

  it("keeps row data, private fields and release hashes out of the Story's own body", () => {
    const body = JSON.stringify(dataEmbedSnapshot().datasets.stories[0]!.body);
    expect(body).not.toMatch(/[0-9a-f]{64}|release|bindings|settings|dataset|presentation/);
    expect(body).not.toContain(SENTINEL);
  });
});

describe("the public Story host", () => {
  let out = "";
  beforeAll(async () => {
    out = temp();
    await materializeDataReleases(section, { kind: "fixture", directory: fixtureReleases }, out);
    const file = path.join(out, "public-data.json");
    writeFileSync(file, JSON.stringify(section));
    process.env.BYLINE_PREPARED_DATA_FILE = file;
    process.env.BYLINE_PREPARED_DATA_DIR = out;
    process.env.BYLINE_CONTENT_MODE = "weekly-wildcat-fixture";
    vi.resetModules();
  });
  afterAll(() => {
    delete process.env.BYLINE_PREPARED_DATA_FILE;
    delete process.env.BYLINE_PREPARED_DATA_DIR;
  });

  async function render(body: ArticleBody) {
    const { createPublicDataProjectRenderer } = await import("@/lib/data-project-embed-host");
    const host = { renderDataProject: createPublicDataProjectRenderer(dataPresentationRegistry({ fixtures: true })) };
    return renderToStaticMarkup(<div className="byline-article-view"><StructuredArticleBody body={body} host={host} /></div>);
  }

  it("server-renders the story's own heading, description, the real presentation and the project's notes, without script", async () => {
    const html = await render(dataEmbedBody());
    expect(html).toContain('<h2 class="data-project-embed-title" id="embed-sidewalk-heading">Where the sidewalk project stands</h2>');
    expect(html).toContain("Two of five phases are done; the crossing at Greenwood High is next.");
    expect(html).toMatch(/2<!-- --> of <!-- -->5 phases<!-- --> done|2 of 5 phases done/);
    expect(html).toContain("Greenwood High crossing");
    expect(html).toContain("Greenwood city engineering department; Weekly Wildcat reporting.");
    expect(html).toContain('<a href="/data/main-street-sidewalk/">View full data project');
    expect(html).toContain("Data updated");
    expect(html).toContain('<div class="byline-block byline-block-dataProject alignwide" data-block-type="dataProject">');
    // Never the standalone page's frame, and no script is required to see any of it.
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("About this data");
    expect(html).not.toContain("data-project-related");
    expect(html).not.toContain("<script");
    expect(html).not.toContain(SENTINEL);
  });

  it("renders a built-in template and a custom presentation in one story", async () => {
    const html = await render(dataEmbedBody());
    expect(html).toContain('aria-label="Tied for 1"');
    expect(html).toContain('data-data-presentation="ranking"');
    expect(html).toContain('data-data-presentation="fixture-sidewalk-project"');
  });

  it("marks only a presentation that declares client code, so a story with none downloads nothing", async () => {
    const withClient = await render(dataEmbedBody([DATA_EMBED_BLOCKS[0]]));
    expect(withClient.match(/data-data-client=""/g)).toHaveLength(1);
    const withoutClient = await render(dataEmbedBody([DATA_EMBED_BLOCKS[1]]));
    expect(withoutClient).not.toContain("data-data-client");
    expect(withoutClient).not.toContain("<script");
  });

  it("supports several embeds, one project twice, unique ids and each stylesheet once", async () => {
    const html = await render(dataEmbedBody());
    expect(html.match(/<section class="data-project-embed /g)).toHaveLength(3);
    const ids = [...html.matchAll(/ id="(embed-[a-z]+-heading)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["embed-sidewalk-heading", "embed-bands-heading", "embed-again-heading"]);
    // The same presentation twice prints its CSS once; the shared frame CSS is printed once per page.
    expect(html.match(/data-data-presentation-styles="fixture-sidewalk-project"/g)).toHaveLength(1);
    expect(html.match(/data-data-embed-styles/g)).toHaveLength(1);
    expect(html.match(/data-data-embed=""/g)).toHaveLength(3);
  });

  it("places a Timeline's own headings beneath the story's heading, and two embeds do not interfere", async () => {
    const html = await render(dataEmbedBody([DATA_EMBED_TIMELINE, { ...DATA_EMBED_TIMELINE, id: "embed-timeline-2", title: "Again" }]));
    const root = document.createElement("div");
    root.innerHTML = html;
    const embeds = [...root.querySelectorAll("[data-data-embed]")];
    expect(embeds).toHaveLength(2);
    for (const embed of embeds) {
      const levels = [...embed.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((node) => Number(node.tagName[1]));
      expect(levels[0]).toBe(2);
      expect(levels.filter((level) => level === 2)).toHaveLength(1);
      expect(levels).toContain(3);
      expect(levels).toContain(4);
    }
    expect(html).not.toMatch(/role="heading"|aria-level/);
  });

  it("fails the build rather than printing a blank embed for an unpublished project", async () => {
    await expect(render(dataEmbedBody([{ ...DATA_EMBED_BLOCKS[0], project: 404 }]))).rejects.toThrow(/project 404, which is not published in this build/);
  });

  it("fails for a project whose presentation this build does not register", async () => {
    const broken = clone(section);
    broken.projects[0]!.presentation.key = "not-registered";
    const file = path.join(temp(), "broken.json");
    writeFileSync(file, JSON.stringify(broken));
    process.env.BYLINE_PREPARED_DATA_FILE = file;
    vi.resetModules();
    try {
      await expect(render(dataEmbedBody([DATA_EMBED_BLOCKS[0]]))).rejects.toThrow(/unregistered presentation|not-registered/);
    } finally {
      process.env.BYLINE_PREPARED_DATA_FILE = path.join(out, "public-data.json");
      vi.resetModules();
    }
  });
});

describe("the Story's route-cache key", () => {
  const original = { ...process.env };
  afterEach(() => {
    for (const key of ["BYLINE_PREPARED_SNAPSHOT_FILE", "BYLINE_PREPARED_DATA_FILE", "BYLINE_PREPARED_DATA_DIR", "BYLINE_CONTENT_MODE"]) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    vi.resetModules();
  });

  /** The key of the one Story, with this Data section and body as the whole publication. */
  async function key(options: { data?: PublicDataSection; body?: ArticleBody } = {}) {
    const snapshot = dataEmbedSnapshot(options) as unknown as PublicBuildSnapshot;
    const directory = temp();
    writeFileSync(path.join(directory, "snapshot.json"), JSON.stringify(snapshot));
    writeFileSync(path.join(directory, "public-data.json"), JSON.stringify(snapshot.data));
    process.env.BYLINE_PREPARED_SNAPSHOT_FILE = path.join(directory, "snapshot.json");
    process.env.BYLINE_PREPARED_DATA_FILE = path.join(directory, "public-data.json");
    process.env.BYLINE_PREPARED_DATA_DIR = directory;
    process.env.BYLINE_CONTENT_MODE = "weekly-wildcat-fixture";
    vi.resetModules();
    const { routeCacheDependency } = await import("@/lib/route-cache");
    return routeCacheDependency({} as never, "article", 9001);
  }
  const only = (project: 1 | 2) => dataEmbedBody([DATA_EMBED_BLOCKS[project - 1]]);
  const newSha = (sha: string) => (sha.startsWith("f") ? `0${sha.slice(1)}` : `f${sha.slice(1)}`);
  /** A section where one dataset release was republished (a new content hash). */
  function republish(release: string) {
    const next = clone(section);
    const replacement = newSha(release);
    for (const entry of next.releases) if (entry.sha256 === release) entry.sha256 = replacement;
    for (const project of next.projects) for (const binding of project.bindings) if (binding.release === release) binding.release = replacement;
    return next;
  }
  const releaseOf = (id: number) => section.projects.find((project) => project.id === id)!.bindings[0]!.release;

  it("is stable for identical inputs", async () => {
    expect((await key({ body: only(1) })).key).toBe((await key({ body: only(1) })).key);
  });

  it("changes when an embedded project's release changes", async () => {
    const before = await key({ body: only(1) });
    const after = await key({ body: only(1), data: republish(releaseOf(1)) });
    expect(after.key).not.toBe(before.key);
    expect(JSON.stringify(after.dependencies)).toContain(newSha(releaseOf(1)));
  });

  it("changes when an embedded project's own public facts or presentation change", async () => {
    const before = await key({ body: only(1) });
    const edited = clone(section);
    edited.projects.find((project) => project.id === 1)!.source = "A different source.";
    expect((await key({ body: only(1), data: edited })).key).not.toBe(before.key);
    const retitled = clone(section);
    retitled.projects.find((project) => project.id === 1)!.title = "A new project title";
    expect((await key({ body: only(1), data: retitled })).key).not.toBe(before.key);
    // A project that swaps presentation is a different embed.
    const swapped = clone(section);
    const target = swapped.projects.find((project) => project.id === 1)!;
    target.presentation = { kind: "template", key: "table" };
    target.settings = normalizeSettings(presentation("table")!, {}).settings;
    target.bindings = [{ ...target.bindings[0]!, slot: "rows", fields: { heading: "name" } }];
    expect((await key({ body: only(1), data: swapped })).key).not.toBe(before.key);
  });

  it("follows the story's own heading and description, which are in its body", async () => {
    const before = await key({ body: only(1) });
    const retitled = dataEmbedBody([{ ...DATA_EMBED_BLOCKS[0], title: "A different heading for this story" }]);
    expect((await key({ body: retitled })).key).not.toBe(before.key);
  });

  it("ignores an unrelated Data project or dataset", async () => {
    const before = await key({ body: only(1) });
    // Project 2 and its dataset are not on this page.
    expect((await key({ body: only(1), data: republish(releaseOf(2)) })).key).toBe(before.key);
    const edited = clone(section);
    edited.projects.find((project) => project.id === 2)!.title = "Unrelated title";
    expect((await key({ body: only(1), data: edited })).key).toBe(before.key);
    // Project 3 (a noindex timeline) shares project 1's release but is a different project: its own facts do not matter here.
    const sibling = clone(section);
    sibling.projects.find((project) => project.id === 3)!.title = "Unrelated sibling";
    expect((await key({ body: only(1), data: sibling })).key).toBe(before.key);
  });

  it("leaves a story with no Data embed exactly as it was, whatever happens to Data", async () => {
    const plain: ArticleBody = { format: "byline-v1", version: 1, media: {}, nodes: [{ type: "paragraph", children: [{ type: "text", text: "No data here." }] }] };
    const before = await key({ body: plain });
    expect(before.dependencies).not.toHaveProperty("dataProjects");
    expect((await key({ body: plain, data: republish(releaseOf(1)) })).key).toBe(before.key);
    expect((await key({ body: plain, data: { projects: [], releases: [] } })).key).toBe(before.key);
  });
});
