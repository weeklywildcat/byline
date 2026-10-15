import { afterEach, describe, expect, it, vi } from "vitest";
import { getWeeklyWildcatHomeDesign } from "@byline/design";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { getPublicationTheme, getPublicationThemeVariables } from "../../../wordpress-plugin/src/publication-theme";
import { themeTokensToCssVariables } from "@byline/ui";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("fixed Weekly Wildcat homepage", () => {
  it("ignores historical published-design and appearance inputs", async () => {
    vi.stubEnv("BYLINE_DESIGNS_JSON", "an invalid historical design");
    vi.stubEnv("BYLINE_PUBLICATION_JSON", JSON.stringify({
      schemaVersion: 1,
      appearance: { theme: "byline-modern", tokenOverrides: { fontBody: "Arial", accent: "#008b95" } }
    }));
    const { getHomeDesignDocument } = await import("@/lib/homepage-design");
    const { getPublicationConfig } = await import("@/lib/publication");
    const { getActiveTheme, BYLINE_THEMES } = await import("@/lib/theme");

    expect(getHomeDesignDocument()).toEqual(getWeeklyWildcatHomeDesign("weekly-wildcat"));
    expect(getHomeDesignDocument().packages.map(({ type }) => type)).toEqual([
      "lead-package", "brief-package", "in-focus-package", "special-coverage-package",
      "opinion-package", "sports-package", "more-package", "newsletter-package"
    ]);
    expect(getPublicationConfig().appearance).toEqual({ theme: "weekly-wildcat", tokenOverrides: {} });
    expect(Object.keys(BYLINE_THEMES)).toEqual(["weekly-wildcat"]);
    expect(getActiveTheme().tokens).toEqual(weeklyWildcatTheme.tokens);
  });

  it("uses the same fixed theme in WordPress article previews", () => {
    expect(getPublicationTheme("byline-magazine")).toBe(weeklyWildcatTheme);
    expect(getPublicationThemeVariables("byline-editorial", { fontBody: "Arial" }))
      .toEqual(themeTokensToCssVariables(weeklyWildcatTheme.tokens));
  });
});
