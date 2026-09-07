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
    expect(read("src/pages/search/index.astro")).toMatch(/<SearchPageClient\b[^>]*\bclient:load/);
    expect(read("src/pages/sports/schedule/index.astro")).toMatch(/<SportsScheduleArchive\b[^>]*\bclient:load/);
  });
});
