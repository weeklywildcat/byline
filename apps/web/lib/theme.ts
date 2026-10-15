import type { CSSProperties } from "react";
import type { BylineThemeTokens } from "@byline/theme-contract";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { themeTokensToCssVariables } from "@byline/ui";

export const BYLINE_THEMES = { [weeklyWildcatTheme.id]: weeklyWildcatTheme };

export function getActiveTheme() {
  return weeklyWildcatTheme;
}

export function getThemeCssVariables(tokens: BylineThemeTokens): CSSProperties {
  return themeTokensToCssVariables(tokens) as CSSProperties;
}
