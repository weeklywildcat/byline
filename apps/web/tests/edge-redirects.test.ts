import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_STATIC_REDIRECTS, buildRedirectsFile, parseRedirectsFile } from "@/scripts/redirects.mts";
import { getSportsArchiveRedirects } from "@/lib/sports-archive";
import fixture from "./fixtures/weekly-wildcat-content.json";
import type { WordPressPage } from "@/lib/wordpress";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative: string) => readFileSync(path.join(webRoot, relative), "utf8");
const redirects = getSportsArchiveRedirects(fixture.pages as WordPressPage[]).map(({ path: from, target }) => ({ from, to: target }));

describe("_redirects generation", () => {
  const file = buildRedirectsFile(redirects);
  const rules = parseRedirectsFile(file);

  it("writes a real 301 for every historical sports URL, season anchors included", () => {
    expect(rules.get("/sports/football-varsity/2025-26/")).toEqual({ to: "/sports-archive-football-2/#season-2025-26", status: 301 });
    expect(rules.get("/sports/")).toEqual({ to: "/sports-archive/", status: 301 });
    for (const { from, to } of redirects) expect(rules.get(from)).toEqual({ to, status: 301 });
  });

  it("also redirects the form without a trailing slash, which has no file to fall back on", () => {
    expect(rules.get("/sports/football-varsity/2025-26")?.to).toBe("/sports-archive-football-2/#season-2025-26");
    expect(rules.get("/sports")?.to).toBe("/sports-archive/");
  });

  it("is deterministic and stays within Cloudflare's static redirect limit", () => {
    expect(buildRedirectsFile([...redirects].reverse())).toBe(file);
    expect(rules.size).toBeLessThanOrEqual(MAX_STATIC_REDIRECTS);
    const tooMany = Array.from({ length: MAX_STATIC_REDIRECTS }, (_, index) => ({ from: `/sports/team-${index}/`, to: "/sports-archive/" }));
    expect(() => buildRedirectsFile(tooMany)).toThrow(/exceed/);
  });

  it("rejects unsafe or conflicting rules", () => {
    expect(() => buildRedirectsFile([{ from: "/sports/a/", to: "//elsewhere.test/" }])).toThrow(/Unsafe/);
    expect(() => buildRedirectsFile([{ from: "/sports/a b/", to: "/x/" }])).toThrow(/Unsafe/);
    expect(() => buildRedirectsFile([{ from: "/sports/a/", to: "/x/" }, { from: "/sports/a/", to: "/y/" }])).toThrow(/Conflicting/);
  });
});

describe("historical sports routes are not generated as HTML", () => {
  it("has no Astro route that emits the archive redirects", () => {
    expect(existsSync(path.join(webRoot, "src", "pages", "sports"))).toBe(false);
    expect(existsSync(path.join(webRoot, "src", "pages", "sports", "[...archivePath].astro"))).toBe(false);
  });

  it("marks every sports redirect as edge-delivered in the route manifest", () => {
    const snapshot = read("lib/build-snapshot.ts");
    expect(snapshot).toContain('{ path: "/sports/", kind: "redirect", redirectTo: archiveHref, delivery: "edge" }');
    expect(snapshot).toContain('delivery: "edge" as const');
  });

  it("generates _redirects in postbuild and has the verifier fail if a source becomes a file", () => {
    expect(JSON.parse(read("package.json")).scripts.postbuild).toContain("generate-redirects.mjs");
    expect(read("scripts/verify-build.mjs")).toContain("was generated as a file");
    expect(read("scripts/verify-build.mjs")).toContain("_redirects is missing a 301");
  });

  it("enables Worker Previews, which wrangler requires, without inheriting production settings", () => {
    expect(read("wrangler.jsonc")).toMatch(/"previews":\s*\{\s*\}/);
  });
});

describe("the staff directory", () => {
  it("lives at /staff/ and leaves /authors/ as an edge redirect rather than a page", () => {
    const snapshot = read("lib/build-snapshot.ts");
    expect(snapshot).toContain('{ path: "/staff/", kind: "author" }');
    expect(snapshot).toContain('{ path: "/authors/", kind: "redirect", redirectTo: "/staff/", delivery: "edge" }');
    expect(existsSync(path.join(webRoot, "src", "pages", "staff", "index.astro"))).toBe(true);
    expect(existsSync(path.join(webRoot, "src", "pages", "authors"))).toBe(false);
    const rules = parseRedirectsFile(buildRedirectsFile([{ from: "/authors/", to: "/staff/" }]));
    expect(rules.get("/authors/")).toEqual({ to: "/staff/", status: 301 });
    expect(rules.get("/authors")).toEqual({ to: "/staff/", status: 301 });
  });
});
