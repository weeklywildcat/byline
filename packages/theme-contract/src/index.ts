import type { ReactElement } from "react";

export const CORE_BYLINE_BLOCK_IDS = [
  "story-lead",
  "story-grid",
  "story-list",
  "latest-stories",
  "featured-story",
  "section-feed",
  "opinion-package",
  "photo-feature",
  "special-coverage",
  "sports-scores",
  "sports-upcoming",
  "team-feature",
  "athlete-feature",
  "events-list",
  "poll",
  "newsletter",
  "section",
  "columns",
  "divider"
] as const;

export type CoreBylineBlockId = (typeof CORE_BYLINE_BLOCK_IDS)[number];
export type BylineBlockId = CoreBylineBlockId | `${string}/${string}`;

export type BylineThemeTokens = {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  mutedTextSoft: string;
  accent: string;
  accentStrong: string;
  link: string;
  border: string;
  borderStrong: string;
  fontDisplay: string;
  fontHeadline: string;
  fontBody: string;
  fontUI: string;
  fontEditorial: string;
  contentWidth: string;
  articleWidth: string;
  radiusSmall: string;
  radiusMedium: string;
  density: "compact" | "comfortable" | "spacious";
};

export type BylineThemeRenderer<Props = Record<string, unknown>> = (props: Props) => ReactElement | null;

export type BylineThemeDefinition = {
  id: string;
  name: string;
  version: number;
  themeApiVersion: number;
  tokens: BylineThemeTokens;
  stylesheets?: readonly string[];
  renderers: Partial<Record<BylineBlockId, BylineThemeRenderer>>;
  variants: Partial<Record<BylineBlockId, readonly string[]>>;
  defaults: Record<string, unknown>;
  capabilities: {
    supportedBlocks: readonly BylineBlockId[];
    optionalModules: readonly string[];
  };
};

export type BylineBlockExtension<Props = Record<string, unknown>> = {
  id: `${string}/${string}`;
  name: string;
  version: number;
  feature?: string;
  renderer: BylineThemeRenderer<Props>;
  variants?: readonly string[];
  defaultProps: Props;
};

export type BylineExtensionPackage = {
  id: `${string}/${string}`;
  version: number;
  themes?: readonly BylineThemeDefinition[];
  blocks?: readonly BylineBlockExtension[];
};

const COLOR_TOKEN_NAMES = new Set<keyof BylineThemeTokens>([
  "background", "surface", "text", "mutedText", "mutedTextSoft", "accent", "accentStrong", "link", "border", "borderStrong"
]);
const FONT_TOKEN_NAMES = new Set<keyof BylineThemeTokens>([
  "fontDisplay", "fontHeadline", "fontBody", "fontUI", "fontEditorial"
]);
const LENGTH_TOKEN_NAMES = new Set<keyof BylineThemeTokens>([
  "contentWidth", "articleWidth", "radiusSmall", "radiusMedium"
]);

export function sanitizeThemeTokenOverrides(value: unknown): Partial<BylineThemeTokens> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const overrides: Partial<BylineThemeTokens> = {};

  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate !== "string") continue;
    const token = key as keyof BylineThemeTokens;
    if (COLOR_TOKEN_NAMES.has(token) && /^#[0-9a-f]{6}$/i.test(candidate)) {
      (overrides as Record<string, string>)[key] = candidate;
    } else if (FONT_TOKEN_NAMES.has(token) && /^[A-Za-z0-9 '".,_-]{1,200}$/.test(candidate)) {
      (overrides as Record<string, string>)[key] = candidate;
    } else if (LENGTH_TOKEN_NAMES.has(token) && /^\d+(?:\.\d+)?(?:px|rem|em|ch|vw|%)$/.test(candidate)) {
      (overrides as Record<string, string>)[key] = candidate;
    } else if (token === "density" && ["compact", "comfortable", "spacious"].includes(candidate)) {
      overrides.density = candidate as BylineThemeTokens["density"];
    }
  }

  return overrides;
}

export function defineBylineTheme<const T extends BylineThemeDefinition>(theme: T): T {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(theme.id)) {
    throw new Error(`Invalid Byline theme id: ${theme.id}`);
  }
  if (!Number.isInteger(theme.version) || theme.version < 1) {
    throw new Error(`Invalid version for Byline theme ${theme.id}`);
  }
  if (new Set(theme.capabilities.supportedBlocks).size !== theme.capabilities.supportedBlocks.length) {
    throw new Error(`Byline theme ${theme.id} declares duplicate supported blocks`);
  }
  return Object.freeze(theme);
}

export function defineBylineExtension<const T extends BylineExtensionPackage>(extension: T): T {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(extension.id)) {
    throw new Error(`Invalid Byline extension id: ${extension.id}`);
  }
  if (!Number.isInteger(extension.version) || extension.version < 1) {
    throw new Error(`Invalid version for Byline extension ${extension.id}`);
  }
  for (const block of extension.blocks ?? []) {
    if (!block.id.startsWith(`${extension.id.split("/")[0]}/`)) {
      throw new Error(`Block ${block.id} must use the extension vendor namespace`);
    }
  }
  return Object.freeze(extension);
}
