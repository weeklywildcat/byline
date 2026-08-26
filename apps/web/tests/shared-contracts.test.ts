import { describe, expect, it } from "vitest";
import {
  getPublicationNavigation,
  normalizePublicationConfig,
  type BylinePublicationConfig
} from "@byline/core";
import {
  consumeResolvedStories,
  createContentResolutionContext,
  normalizeStoryQuery,
  resolveDesignContentBlocks
} from "@byline/content";
import { BYLINE_STUDIO_CATEGORIES, BYLINE_STUDIO_VIEWPORTS } from "@byline/studio-contract";
import { CORE_BYLINE_BLOCK_IDS, defineBylineExtension, defineBylineTheme, sanitizeThemeTokenOverrides } from "@byline/theme-contract";
import { editorialTheme } from "@byline/theme-editorial";
import { magazineTheme } from "@byline/theme-magazine";
import { modernTheme } from "@byline/theme-modern";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { parsePublishedBylineDesign } from "@byline/design";
import northStarFixture from "./fixtures/north-star-publication.json";
import weeklyWildcatFixture from "./fixtures/weekly-wildcat-publication.json";

describe("shared Byline contracts", () => {
  it("normalizes bounded StoryQuery values and rejects unsafe limits", () => {
    expect(normalizeStoryQuery({ type: "category", categoryId: 8, limit: 12 })).toEqual({
      type: "category",
      categoryId: 8,
      limit: 12
    });
    expect(normalizeStoryQuery({ type: "latest", limit: 5000 })).toBeNull();
    expect(normalizeStoryQuery({ type: "manual", postIds: [4, 4, 9] })).toEqual({
      type: "manual",
      postIds: [4, 9]
    });
  });

  it("applies layout-wide de-duplication unless duplication is intentional", () => {
    const context = createContentResolutionContext();
    expect(consumeResolvedStories([{ id: 1 }, { id: 2 }], context, { limit: 2 })).toEqual([{ id: 1 }, { id: 2 }]);
    expect(consumeResolvedStories([{ id: 1 }, { id: 3 }], context, { limit: 2 })).toEqual([{ id: 3 }]);
    expect(consumeResolvedStories([{ id: 1 }], context, { limit: 1, allowDuplicates: true })).toEqual([{ id: 1 }]);
  });

  it("resolves design blocks sequentially with the same layout-wide de-duplication contract", async () => {
    const candidates = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const blocks = await resolveDesignContentBlocks([
      { type: "story-lead", props: { queryType: "latest", limit: 1 } },
      { type: "story-list", props: { queryType: "latest", limit: 2 } },
      { type: "featured-story", props: { queryType: "latest", limit: 1, allowDuplicates: true } }
    ], () => candidates);
    expect(blocks.map((block) => block.stories.map(({ id }) => id))).toEqual([[1], [2, 3], [1]]);
  });

  it("keeps the stable core block vocabulary across Studio and the Weekly Wildcat theme", () => {
    const studioBlocks = Object.values(BYLINE_STUDIO_CATEGORIES).flat();
    expect(new Set(studioBlocks)).toEqual(new Set(CORE_BYLINE_BLOCK_IDS));
    expect(new Set(weeklyWildcatTheme.capabilities.supportedBlocks)).toEqual(new Set(CORE_BYLINE_BLOCK_IDS));
    expect(BYLINE_STUDIO_VIEWPORTS.map(({ width }) => width)).toEqual([360, 768, 1280, "100%"]);
  });

  it("rejects invalid or duplicate theme manifests", () => {
    expect(() => defineBylineTheme({ ...weeklyWildcatTheme, id: "Invalid Theme" })).toThrow(/invalid.*theme id/i);
    expect(() =>
      defineBylineTheme({
        ...weeklyWildcatTheme,
        capabilities: { ...weeklyWildcatTheme.capabilities, supportedBlocks: ["story-lead", "story-lead"] }
      })
    ).toThrow(/duplicate supported blocks/i);
  });

  it("accepts namespaced Level 3 extension packages and rejects cross-vendor blocks", () => {
    const renderer = () => null;
    expect(defineBylineExtension({
      id: "schoolpress/newsroom-tools",
      version: 1,
      blocks: [{ id: "schoolpress/weather-card", name: "Weather", version: 1, renderer, defaultProps: {} }]
    }).blocks?.[0].id).toBe("schoolpress/weather-card");
    expect(() => defineBylineExtension({
      id: "schoolpress/newsroom-tools",
      version: 1,
      blocks: [{ id: "another/weather-card", name: "Weather", version: 1, renderer, defaultProps: {} }]
    })).toThrow(/vendor namespace/i);
  });

  it("ships distinct first-party themes and refuses CSS injection in token overrides", () => {
    expect([editorialTheme.id, magazineTheme.id, modernTheme.id, weeklyWildcatTheme.id]).toEqual([
      "byline-editorial", "byline-magazine", "byline-modern", "weekly-wildcat"
    ]);
    expect("stylesheets" in editorialTheme).toBe(false);
    expect(weeklyWildcatTheme.stylesheets).toEqual(["https://use.typekit.net/zxb8gbj.css"]);
    expect(sanitizeThemeTokenOverrides({
      accent: "#008b95",
      background: "url(https://tracker.example/pixel)",
      fontBody: "Arial; background: red"
    })).toEqual({ accent: "#008b95" });
  });

  it("normalizes a second publication without leaking Weekly Wildcat identity or disabled modules", () => {
    const publication = normalizePublicationConfig(
      northStarFixture,
      weeklyWildcatFixture as BylinePublicationConfig
    );
    expect(publication.identity.name).toBe("North Star News");
    expect(publication.appearance.tokenOverrides.accent).toBe("#008b95");
    expect(getPublicationNavigation(publication, "header").map(({ label }) => label)).toEqual(["Campus", "Ideas"]);
    expect(JSON.stringify(publication)).not.toContain("Weekly Wildcat");
  });

  it("fails clearly on incompatible published design schemas", () => {
    expect(() => parsePublishedBylineDesign({
      revision: 4,
      document: { schemaVersion: 99, template: "home", theme: "weekly-wildcat", editor: { engine: "puck", version: "0.23.0" }, layout: { root: {}, content: [] } }
    }, "home")).toThrow(/unsupported schema 99/i);
  });
});
