import type { CSSProperties } from "react";
import { editorialTheme } from "@byline/theme-editorial";
import { magazineTheme } from "@byline/theme-magazine";
import { modernTheme } from "@byline/theme-modern";
import { sanitizeThemeTokenOverrides, type BylineThemeDefinition, type BylineThemeTokens } from "@byline/theme-contract";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
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
  return {
    "--page": tokens.background,
    "--paper": tokens.surface,
    "--ink": tokens.text,
    "--muted": tokens.mutedText,
    "--soft-muted": tokens.mutedTextSoft,
    "--rule": tokens.border,
    "--rule-strong": tokens.borderStrong,
    "--accent": tokens.accent,
    "--accent-dark": tokens.accentStrong,
    "--link": tokens.link,
    "--max-width": tokens.contentWidth,
    "--article-width": tokens.articleWidth,
    "--font-display": tokens.fontDisplay,
    "--font-headline": tokens.fontHeadline,
    "--font-body": tokens.fontBody,
    "--font-ui": tokens.fontUI,
    "--font-serif": tokens.fontEditorial,
    "--radius-small": tokens.radiusSmall,
    "--radius-medium": tokens.radiusMedium
  } as CSSProperties;
}
