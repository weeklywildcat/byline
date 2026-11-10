import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validatePublicBuildSnapshot } from "@byline/content";
import type { PublicDataSection } from "@byline/data";
import { dataPresentationRegistry } from "@byline/data-presentations/registry";
import publication from "./fixtures/weekly-wildcat-publication.json";
import fixtureSection from "./fixtures/data/public-data.json";
import { DataAcquisitionError, loadFixtureDataSection, materializeDataReleases, verifyReleaseBytes } from "@/lib/data-releases";
import { acquirePayloadSnapshot } from "@/lib/build-acquisition";

/**
 * Byline Data in the public build (docs/byline-data.md#the-build): Snapshot
 * v3 acceptance, release materialization that fails closed, rendering from
 * local releases only, and a private value that never reaches the output.
 */
const SENTINEL = "PRIVATE-DATA-FIXTURE-SENTINEL";
const webRoot = path.resolve(__dirname, "..");
const fixtureReleases = path.join(webRoot, "tests/fixtures/data/releases");
const section = fixtureSection as unknown as PublicDataSection;
const registry = dataPresentationRegistry({ fixtures: true });
const presentation = (key: string) => registry[key]?.descriptor;

function snapshot(schemaVersion: 2 | 3, data?: unknown) {
  const datasets = { stories: [], people: [], sections: [], topics: [], pages: [], corrections: [], collections: [], events: [], polls: [], media: [], redirects: [] };
  return { schemaVersion, revision: 3, generatedAt: "2026-11-10T12:00:00.000Z", publication: { ...publication, revision: 3 }, datasets, counts: Object.fromEntries(Object.keys(datasets).map((key) => [key, 0])), ...(schemaVersion === 3 ? { data } : {}) };
}

describe("Snapshot v3", () => {
  it("accepts v3 with Data and reads v2 as having none", () => {
    expect(validatePublicBuildSnapshot(snapshot(3, section), { dataPresentation: presentation }).data.projects).toHaveLength(3);
    expect(validatePublicBuildSnapshot(snapshot(2)).data).toEqual({ projects: [], releases: [] });
    expect(() => validatePublicBuildSnapshot({ ...snapshot(3, section), schemaVersion: 4 })).toThrow(/unsupported schemaVersion/);
  });

  it("fails closed on an unknown presentation, a missing release, a private field and a duplicate route", () => {
    expect(() => validatePublicBuildSnapshot(snapshot(3, section), { dataPresentation: () => undefined })).toThrow(/unregistered presentation/);
    expect(() => validatePublicBuildSnapshot(snapshot(3, { ...section, releases: section.releases.slice(1) }), { dataPresentation: presentation })).toThrow(/isn't in the snapshot|not used/);
    const leaked = { ...section, releases: section.releases.map((release, index) => (index ? release : { ...release, fields: [...release.fields, { key: "secret", label: "Secret", type: "text", required: false, visibility: "private", options: { maxLength: 10 } }] })) };
    expect(() => validatePublicBuildSnapshot(snapshot(3, leaked), { dataPresentation: presentation })).toThrow();
    const duplicate = { ...section, projects: [...section.projects, { ...section.projects[0], id: 99 }] };
    expect(() => validatePublicBuildSnapshot(snapshot(3, duplicate), { dataPresentation: presentation })).toThrow(/slug|duplicate/);
    const v3 = snapshot(3, section);
    const pageAtData = { ...v3, datasets: { ...v3.datasets, pages: [{ id: 1, slug: "data", title: "Data", href: "/data/", summary: "", bodyHtml: "", indexing: "public", publishedAt: "2026-11-10T12:00:00.000Z", modifiedAt: "2026-11-10T12:00:00.000Z" }] }, counts: { ...v3.counts, pages: 1 } };
    expect(() => validatePublicBuildSnapshot(pageAtData, { dataPresentation: presentation })).toThrow(/duplicate public path \/data\//);
  });

  it("negotiates the schema with the newsroom and accepts a v3 artifact", async () => {
    const bytes = Buffer.from(JSON.stringify(snapshot(3, { projects: [], releases: [] })));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const seen: string[] = [];
    const fetch = (async (input: string | URL, init: RequestInit = {}) => {
      seen.push(new Headers(init.headers).get("x-byline-snapshot-versions") ?? "");
      return String(input).endsWith("/snapshot")
        ? Response.json({ schemaVersion: 3, revision: 3, generatedAt: "2026-11-10T12:00:00.000Z", digest, bytes: bytes.byteLength, url: `https://newsroom.example/api/byline/build/snapshot/${digest}` })
        : new Response(bytes);
    }) as typeof globalThis.fetch;
    const acquired = await acquirePayloadSnapshot({ baseUrl: "https://newsroom.example/api/byline/build", token: "t".repeat(40), fetch });
    expect(acquired.snapshot.schemaVersion).toBe(3);
    expect(seen).toEqual(["2,3", "2,3"]);
  });
});

describe("release materialization", () => {
  const dirs: string[] = [];
  const temp = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "byline-data-"));
    dirs.push(dir);
    return dir;
  };
  afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("acquires exactly the named releases with the build credential and verifies them", async () => {
    const asked: string[] = [];
    const fetch = (async (input: string | URL, init: RequestInit = {}) => {
      asked.push(String(input));
      expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${"t".repeat(40)}`);
      return new Response(readFileSync(path.join(fixtureReleases, `${String(input).split("/").at(-1)}.json`)));
    }) as typeof globalThis.fetch;
    const out = temp();
    const result = await materializeDataReleases(section, { kind: "newsroom", endpoint: "https://newsroom.example/api/byline/build/data", token: "t".repeat(40), fetch }, out);
    expect(result).toMatchObject({ files: 2, requests: 2 });
    expect(asked.sort()).toEqual(section.releases.map((release) => `https://newsroom.example/api/byline/build/data/${release.sha256}`).sort());
    expect(readdirSync(out).sort()).toEqual(section.releases.map((release) => `${release.sha256}.json`).sort());
  });

  it("fails closed on a digest or length mismatch, altered content, a refused credential and a missing artifact", async () => {
    const descriptor = section.releases[0];
    const good = readFileSync(path.join(fixtureReleases, `${descriptor.sha256}.json`));
    expect(() => verifyReleaseBytes(Buffer.concat([good, Buffer.from(" ")]), descriptor)).toThrow(/bytes, not/);
    const swapped = Buffer.from(good.toString("utf8").replace("Survey", "Surveys").replace("Lighting", "Lightin"));
    expect(() => verifyReleaseBytes(swapped, descriptor)).toThrow(/SHA-256/);
    expect(() => verifyReleaseBytes(good, { ...descriptor, revision: descriptor.revision + 1 })).toThrow(/does not contain what the snapshot describes/);
    const refuse = (async () => new Response("no", { status: 403 })) as unknown as typeof globalThis.fetch;
    await expect(materializeDataReleases(section, { kind: "newsroom", endpoint: "https://n.example/data", token: "x", fetch: refuse }, temp())).rejects.toThrow(DataAcquisitionError);
    const missing = (async () => new Response("{}", { status: 404 })) as unknown as typeof globalThis.fetch;
    await expect(materializeDataReleases(section, { kind: "newsroom", endpoint: "https://n.example/data", token: "x", fetch: missing }, temp())).rejects.toThrow(/HTTP 404/);
    await expect(materializeDataReleases(section, { kind: "fixture", directory: temp() }, temp())).rejects.toThrow(/missing/);
  });

  it("keeps the fixture's private field and excluded rows out of every artifact", async () => {
    const { section: loaded, directory } = await loadFixtureDataSection(webRoot);
    expect(JSON.stringify(loaded)).not.toContain(SENTINEL);
    for (const name of readdirSync(directory)) {
      const text = readFileSync(path.join(directory, name), "utf8");
      expect(text).not.toContain(SENTINEL);
      expect(text).not.toContain("city_contact");
      expect(text).not.toContain("judge_notes");
    }
  });
});

describe("rendering from local releases", () => {
  let out = "";
  beforeAll(async () => {
    out = mkdtempSync(path.join(tmpdir(), "byline-data-render-"));
    await materializeDataReleases(section, { kind: "fixture", directory: fixtureReleases }, out);
    const file = path.join(out, "public-data.json");
    (await import("node:fs")).writeFileSync(file, JSON.stringify(section));
    process.env.BYLINE_PREPARED_DATA_FILE = file;
    process.env.BYLINE_PREPARED_DATA_DIR = out;
    process.env.BYLINE_CONTENT_MODE = "weekly-wildcat-fixture";
  });
  afterAll(() => {
    delete process.env.BYLINE_PREPARED_DATA_FILE;
    delete process.env.BYLINE_PREPARED_DATA_DIR;
    rmSync(out, { recursive: true, force: true });
  });

  it("server-renders a custom presentation with meaningful HTML and no private data", async () => {
    const { default: Page } = await import("@/views/data/[slug]/page");
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "main-street-sidewalk" }) }));
    expect(html).toContain("Main Street sidewalk project");
    expect(html).toMatch(/2<!-- --> of <!-- -->5 phases<!-- --> done|2 of 5 phases done/);
    expect(html).toContain("Greenwood High crossing");
    expect(html).toContain("About this data");
    expect(html).toContain('"@type":"Dataset"');
    expect(html).toContain("data-data-client");
    expect(html).not.toContain(SENTINEL);
    expect(html).not.toContain("Unconfirmed phase");
  });

  it("renders a built-in template from the same release model", async () => {
    const { default: Page } = await import("@/views/data/[slug]/page");
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "marching-band-rankings" }) }));
    expect(html).toContain('aria-label="Tied for 1"');
    expect(html).toContain("1 entry without a score is not ranked.");
    expect(html).not.toContain("data-data-client");
  });

  it("changes a Data route's cache key only when its release or project changes", async () => {
    const { routeCacheDependency } = await import("@/lib/route-cache");
    const fakeSnapshot = {} as never;
    const first = routeCacheDependency(fakeSnapshot, "data", "marching-band-rankings");
    expect(routeCacheDependency(fakeSnapshot, "data", "marching-band-rankings").key).toBe(first.key);
    expect(first.dependencies).toMatchObject({ releases: [section.projects[1].bindings[0].release] });
    expect(routeCacheDependency(fakeSnapshot, "data", "main-street-sidewalk").key).not.toBe(first.key);
  });
});
