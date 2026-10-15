import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { themeTokensToCssVariables } from "@byline/ui";

export const BYLINE_PREVIEW_THEMES = { [weeklyWildcatTheme.id]: weeklyWildcatTheme };

export function getPublicationTheme(_theme?: string) {
  return weeklyWildcatTheme;
}

export function getPublicationThemeVariables(_theme?: string, _overrides?: Record<string, string>) {
  return themeTokensToCssVariables(weeklyWildcatTheme.tokens);
}

export function getPublicationThemeStylesheets(_theme?: string) {
  return [...weeklyWildcatTheme.stylesheets];
}
