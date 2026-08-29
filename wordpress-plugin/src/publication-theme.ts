import { sanitizeThemeTokenOverrides, type BylineThemeDefinition, type BylineThemeTokens } from "@byline/theme-contract";
import { editorialTheme } from "@byline/theme-editorial";
import { magazineTheme } from "@byline/theme-magazine";
import { modernTheme } from "@byline/theme-modern";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { themeTokensToCssVariables } from "@byline/ui";

/**
 * The installed theme registry is shared by every isolated publication
 * preview. Keep this list sourced from the canonical theme packages so Studio
 * and article preview cannot silently acquire different token defaults.
 */
export const BYLINE_PREVIEW_THEMES: Record<string, BylineThemeDefinition> = {
  [editorialTheme.id]: editorialTheme,
  [magazineTheme.id]: magazineTheme,
  [modernTheme.id]: modernTheme,
  [weeklyWildcatTheme.id]: weeklyWildcatTheme
};

export function getPublicationTheme(theme: string) {
  return BYLINE_PREVIEW_THEMES[theme] ?? modernTheme;
}

export function getPublicationThemeVariables(theme: string, overrides: Record<string, string>) {
  const definition = getPublicationTheme(theme);
  const tokens: BylineThemeTokens = {
    ...definition.tokens,
    ...sanitizeThemeTokenOverrides(overrides)
  };
  return themeTokensToCssVariables(tokens);
}

export function getPublicationThemeStylesheets(theme: string) {
  return [...(getPublicationTheme(theme).stylesheets ?? [])];
}
