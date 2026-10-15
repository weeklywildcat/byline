import { describe, expect, it } from "vitest";
import { getSportsArchiveHref, getSportsArchiveRedirects } from "@/lib/sports-archive";
import fixture from "./fixtures/weekly-wildcat-content.json";
import type { WordPressPage } from "@/lib/wordpress";

const pages = fixture.pages as WordPressPage[];

describe("sports archive Pages", () => {
  it("preserves historical team and season links using the actual migrated Page slug", () => {
    expect(getSportsArchiveHref(pages)).toBe("/sports-archive/");
    expect(getSportsArchiveRedirects(pages)).toContainEqual({
      path: "/sports/football-varsity/2025-26/", target: "/sports-archive-football-2/#season-2025-26"
    });
    expect(getSportsArchiveRedirects(pages)).toContainEqual({ path: "/sports/", target: "/sports-archive/" });
  });

  it("keeps archive content available without sports API calls or runtime components", () => {
    const archive = pages.find((page) => page.bylinePage?.sportsArchive?.key === "football")!;
    expect(archive.content.rendered).toContain("Wildcats 0");
    expect(archive.content.rendered).toContain("Head coach");
    expect(archive.content.rendered).toContain("<!-- wp:table");
    expect(archive.content.rendered).not.toContain("<!-- wp:byline/");
  });

  it("rejects ambiguous redirects and ignores unsafe metadata", () => {
    const base = pages.find((page) => page.bylinePage?.sportsArchive?.key === "football")!;
    expect(() => getSportsArchiveRedirects([base, { ...base, slug: "another-archive" }])).toThrow(/same historical path/);
    const bad = { ...base, bylinePage: { sportsArchive: { key: "football", routes: { "//elsewhere.test/": "", "/sports/football/": "//elsewhere.test/" } } } };
    expect(getSportsArchiveRedirects([bad])).toEqual([]);
    expect(getSportsArchiveHref([])).toBe("/category/sports/");
  });
});
