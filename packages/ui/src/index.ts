export * from "./EditorialLeadPackage";
export * from "./EditorialSportsPackage";
export * from "./package-renderers";
export * from "./story-view";
export * from "./StoryCard";
export * from "./LeadPackage";
export * from "./SportsPackage";
export * from "./sports-view";
export * from "./ThisWeekCard";
export * from "./PollCard";
export * from "./Icon";

import type { BylineThemeTokens, CoreBylineBlockId } from "@byline/theme-contract";

export type BylineStoryViewModel = {
  id: number;
  headline: string;
  href: string;
  excerpt?: string;
  authorName?: string;
  image?: {
    url: string;
    alt: string;
  } | null;
};

export type BylineBlockLayout =
  | "lead"
  | "list"
  | "grid"
  | "feature"
  | "special"
  | "opinion"
  | "team-feature"
  | "sports"
  | "events"
  | "poll"
  | "newsletter"
  | "structure"
  | "divider";

export type BylineBlockPresentation = {
  label: string;
  defaultHeading: string;
  layout: BylineBlockLayout;
};

export const BYLINE_BLOCK_PRESENTATIONS: Record<CoreBylineBlockId, BylineBlockPresentation> = {
  "story-lead": { label: "Lead story", defaultHeading: "Top story", layout: "lead" },
  "story-grid": { label: "Story grid", defaultHeading: "Stories", layout: "grid" },
  "story-list": { label: "Story list", defaultHeading: "Latest stories", layout: "list" },
  "latest-stories": { label: "Latest stories", defaultHeading: "Latest stories", layout: "list" },
  "featured-story": { label: "Featured story", defaultHeading: "Featured", layout: "feature" },
  "section-feed": { label: "Section feed", defaultHeading: "Latest stories", layout: "list" },
  "opinion-package": { label: "Opinion package", defaultHeading: "Opinion", layout: "opinion" },
  "photo-feature": { label: "Photo feature", defaultHeading: "In Focus", layout: "feature" },
  "special-coverage": { label: "Special coverage", defaultHeading: "Special Coverage", layout: "special" },
  "sports-scores": { label: "Recent scores", defaultHeading: "Sports", layout: "sports" },
  "sports-upcoming": { label: "Upcoming games", defaultHeading: "Sports", layout: "sports" },
  "team-feature": { label: "Team feature", defaultHeading: "Team Feature", layout: "team-feature" },
  "athlete-feature": { label: "Athlete feature", defaultHeading: "Athlete Feature", layout: "team-feature" },
  "events-list": { label: "Events list", defaultHeading: "Events", layout: "events" },
  poll: { label: "Poll", defaultHeading: "Poll", layout: "poll" },
  newsletter: { label: "Newsletter", defaultHeading: "Newsletter", layout: "newsletter" },
  section: { label: "Section", defaultHeading: "Section", layout: "structure" },
  columns: { label: "Columns", defaultHeading: "Columns", layout: "structure" },
  divider: { label: "Divider", defaultHeading: "Divider", layout: "divider" }
};

export function getBylineBlockPresentation(blockId: string): BylineBlockPresentation | null {
  return BYLINE_BLOCK_PRESENTATIONS[blockId as CoreBylineBlockId] ?? null;
}

export function themeTokensToCssVariables(tokens: BylineThemeTokens): Record<`--${string}`, string> {
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
  };
}
