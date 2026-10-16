import type { CSSProperties } from "react";
import type { BylineThemeTokens } from "@byline/theme-contract";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { themeTokensToCssVariables } from "@byline/ui";

export const BYLINE_THEMES = { [weeklyWildcatTheme.id]: weeklyWildcatTheme };

// The public site serves the theme's fonts itself (public/fonts) rather than
// pulling them from Fontshare and Google, which the theme's own `stylesheets`
// list still does for Studio. Self-hosting removes three other hosts from the
// first paint, and the preloads fetch the three faces every page starts with in
// parallel with the stylesheet.
export const SELF_HOSTED_FONTS = {
  stylesheet: "/fonts/weekly-wildcat.css",
  preload: [
    "/fonts/erode-600.woff2",
    "/fonts/newsreader-latin.woff2",
    "/fonts/mona-sans-latin.woff2"
  ]
} as const;

export function getActiveTheme() {
  return weeklyWildcatTheme;
}

export function getThemeCssVariables(tokens: BylineThemeTokens): CSSProperties {
  return themeTokensToCssVariables(tokens) as CSSProperties;
}
