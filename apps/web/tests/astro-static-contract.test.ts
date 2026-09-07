import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative: string) => readFileSync(path.join(webRoot, relative), "utf8");

describe("Astro static frontend contract", () => {
  it("uses Astro static output and preserves Cloudflare's out directory", () => {
    const config = read("astro.config.mjs");
    expect(config).toContain('output: "static"');
    expect(config).toContain('outDir: "./out"');
    expect(config).not.toContain("@astrojs/cloudflare");
  });

  it("runs Astro in production and verifies route, asset, SEO, and media closure", () => {
    const manifest = JSON.parse(read("package.json"));
    expect(manifest.scripts.build).toContain("astro-with-publication");
    expect(manifest.scripts.postbuild).toContain("verify-build.mjs");
    expect(manifest.scripts.postbuild).toContain("copy-wordpress-media-to-out.mjs");
    expect(read("scripts/verify-static-export.mjs")).toContain("_byline/search-index.json");
  });

  it("routes the Metadata model through the shared social-tag serializer", () => {
    const layout = read("src/layouts/BaseLayout.astro");
    const metadata = read("lib/metadata.ts");
    expect(layout).toContain("serializeMetadata");
    expect(metadata).toContain('"article:section"');
    expect(metadata).toContain('"og:image:width"');
    expect(metadata).toContain("image:alt");
  });

  it("removes the runnable Next route tree after cutover", () => {
    const manifest = JSON.parse(read("package.json"));
    expect(existsSync(path.join(webRoot, "app"))).toBe(false);
    expect(existsSync(path.join(webRoot, "scripts", "next-with-publication.mjs"))).toBe(false);
    expect(manifest.dependencies.next).toBeUndefined();
    expect(Object.values(manifest.scripts).join(" ")).not.toMatch(/next-with-publication|next build/);
  });

  it("hydrates only the explicitly interactive route components", () => {
    const article = read("src/pages/[segment]/[month]/[day]/[category]/[articleSlug].astro");
    expect(article).toMatch(/<ArticleShareActions\b[^>]*\bclient:idle/);
    expect(article).toContain("NewsroomPollHydrator client:load");
    expect(article).toMatch(/<ReaderFeedbackForm\b[^>]*\bclient:visible/);
    expect(article).toContain("NewsletterSignupForm client:visible");
    const searchPage = read("src/pages/search/index.astro");
    expect(searchPage).toMatch(/<SearchPageClient\b[^>]*\bclient:load/);
    expect(searchPage).not.toContain("writeSearchIndex");
    expect(searchPage).not.toContain("<SearchPageClient {...");
    expect(read("views/search/page.tsx")).not.toContain("<SearchPageClient {...");
    expect(existsSync(path.join(webRoot, "lib", "search-index-build.ts"))).toBe(false);
    const searchIndexEndpoint = read("src/pages/[...path].json.ts");
    expect(searchIndexEndpoint).toContain("export const prerender = true");
    expect(searchIndexEndpoint).toContain('path: "_byline/search-index"');
    expect(searchIndexEndpoint).toContain("createSearchIndexDocument");
    expect(searchIndexEndpoint).toContain('"Content-Type": "application/json; charset=utf-8"');
    expect(read("lib/search-index.ts")).toContain("SEARCH_INDEX_SCHEMA_VERSION");
    expect(read("lib/search-index.ts")).toContain("/_byline/search-index.json");
    expect(read("src/pages/sports/schedule/index.astro")).toMatch(/<SportsScheduleArchive\b[^>]*\bclient:load/);
  });

  it("keeps the homepage hero rail limiter outside the CSS grid", () => {
    const homepage = read("src/pages/index.astro");
    const mainEnd = homepage.indexOf("</main>");
    const limiter = homepage.indexOf("<HomepageHeroRailLimiter client:load />");

    expect(homepage).toMatch(/railLimiter:\s*\(\) => null/);
    expect(homepage).not.toContain("home-rail-");
    expect(mainEnd).toBeGreaterThan(-1);
    expect(limiter).toBeGreaterThan(mainEnd);
  });
});
