import { describe, expect, it } from "vitest";
import {
  consumeResolvedStories,
  createContentResolutionContext,
  normalizeStoryQuery,
  resolveDesignContentBlocks
} from "@byline/content";
import { CORE_BYLINE_BLOCK_IDS, defineBylineTheme, sanitizeThemeTokenOverrides } from "@byline/theme-contract";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { BYLINE_BLOCK_PRESENTATIONS, getBylineBlockPresentation, themeTokensToCssVariables } from "@byline/ui";

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

  it("keeps the stable core block vocabulary in the Weekly Wildcat theme", () => {
    expect(new Set(weeklyWildcatTheme.capabilities.supportedBlocks)).toEqual(new Set(CORE_BYLINE_BLOCK_IDS));
    expect(new Set(Object.keys(BYLINE_BLOCK_PRESENTATIONS))).toEqual(new Set(CORE_BYLINE_BLOCK_IDS));
    expect(getBylineBlockPresentation("photo-feature")?.layout).toBe("feature");
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

  it("keeps the Weekly Wildcat fonts and refuses CSS injection in token overrides", () => {
    expect(weeklyWildcatTheme.stylesheets).toEqual([
      "https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..100,400..900&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&display=swap",
      "https://api.fontshare.com/v2/css?f[]=erode@400,500,600,700,401,501,601&display=swap"
    ]);
    expect(sanitizeThemeTokenOverrides({
      accent: "#008b95",
      background: "url(https://tracker.example/pixel)",
      fontBody: "Arial; background: red"
    })).toEqual({ accent: "#008b95" });
    expect(themeTokensToCssVariables(weeklyWildcatTheme.tokens)["--accent"]).toBe(weeklyWildcatTheme.tokens.accent);
  });


});
