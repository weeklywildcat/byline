import type { CSSProperties } from "react";
import { editorialTheme } from "@byline/theme-editorial";
import { magazineTheme } from "@byline/theme-magazine";
import { modernTheme } from "@byline/theme-modern";
import { sanitizeThemeTokenOverrides, type BylineThemeDefinition, type BylineThemeTokens } from "@byline/theme-contract";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { themeTokensToCssVariables } from "@byline/ui";
import { getPublicationConfig } from "@/lib/publication";

export const BYLINE_THEMES: Record<string, BylineThemeDefinition> = {
  [editorialTheme.id]: editorialTheme,
  [magazineTheme.id]: magazineTheme,
  [modernTheme.id]: modernTheme,
  [weeklyWildcatTheme.id]: weeklyWildcatTheme
};

export function getActiveTheme() {
  const publication = getPublicationConfig();
  const definition = BYLINE_THEMES[publication.appearance.theme] ?? modernTheme;
  return {
    ...definition,
    tokens: {
      ...definition.tokens,
      ...sanitizeThemeTokenOverrides(publication.appearance.tokenOverrides)
    }
  };
}

export function getThemeCssVariables(tokens: BylineThemeTokens): CSSProperties {
  return themeTokensToCssVariables(tokens) as CSSProperties;
}
