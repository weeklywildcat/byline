import type { CoreBylineBlockId } from "@byline/theme-contract";

export const BYLINE_STUDIO_VIEWPORTS = [
  { label: "Mobile", width: 360 },
  { label: "Tablet", width: 768 },
  { label: "Desktop", width: 1280 },
  { label: "Responsive", width: "100%" }
] as const;

export const BYLINE_STUDIO_CATEGORIES: Record<string, readonly CoreBylineBlockId[]> = {
  Stories: [
    "story-lead",
    "story-grid",
    "story-list",
    "latest-stories",
    "featured-story",
    "section-feed",
    "opinion-package",
    "photo-feature",
    "special-coverage"
  ],
  Sports: ["sports-scores", "sports-upcoming", "team-feature", "athlete-feature"],
  Community: ["events-list", "poll", "newsletter"],
  Layout: ["section", "columns", "divider"]
};

export const BYLINE_TEMPLATE_IDS = [
  "home",
  "section-default",
  "article-default",
  "author-default",
  "sports-home"
] as const;

