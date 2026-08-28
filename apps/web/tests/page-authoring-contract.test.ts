import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const pageRoute = readSource("../app/[segment]/page.tsx");
const sitemap = readSource("../app/sitemap.ts");
const wordpress = readSource("../lib/wordpress.ts");
const pageBlocks = readSource("../../../wordpress-plugin/includes/content/page-blocks.php");
const pageMigration = readSource("../../../wordpress-plugin/includes/content/pages.php");
const pageSectionMetadata = JSON.parse(readSource("../../../wordpress-plugin/src/blocks/page-section/block.json"));

describe("native WordPress Page authoring contract", () => {
  it("has no source-owned normal-page catalog or fallback", () => {
    expect(existsSync(fileURLToPath(new URL("../lib/static-pages.ts", import.meta.url)))).toBe(false);
    expect(pageRoute).not.toContain("STATIC_PAGES");
    expect(pageRoute).not.toContain("getStaticPage");
    expect(pageRoute).toContain("requireBuildData(\"/wp-json/wp/v2/pages\", getAllPages)");
    expect(pageRoute).toContain("wordpressPage.content.rendered");
    expect(pageRoute).toContain("wordpressPage.bylinePage?.eyebrow?.trim() || \"\"");
  });

  it("includes each WordPress Page in the sitemap with its own modified date", () => {
    expect(sitemap).not.toContain("STATIC_PAGES");
    expect(sitemap).toContain("getAllPages");
    expect(sitemap).toContain("getPageSitemapDate(page)");
    expect(sitemap).toContain("modified_gmt");
  });

  it("keeps the Page REST shape and Gutenberg controls aligned", () => {
    expect(wordpress).toContain("modified_gmt?: string");
    expect(wordpress).toContain("bylinePage?:");
    expect(pageBlocks).toContain("register_post_meta('page', BYLINE_PAGE_EYEBROW_META");
    expect(pageBlocks).toContain("add_post_type_support('page', 'excerpt')");
    expect(pageBlocks).toContain("register_block_pattern_category");
    expect(pageMigration).toContain("const BYLINE_WEEKLY_PAGE_MIGRATION_VERSION = 2;");
    expect(pageSectionMetadata.apiVersion).toBe(3);
    expect(pageSectionMetadata.name).toBe("byline/page-section");
    expect(pageSectionMetadata.postTypes).toEqual(["page"]);
    expect(pageSectionMetadata.supports.align).toEqual(["wide"]);
    expect(pageSectionMetadata.styles.map((style: { name: string }) => style.name)).toEqual(["default", "featured"]);
  });
});
