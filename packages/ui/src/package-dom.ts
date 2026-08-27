const DEFAULT_IDS: Record<string, string> = {
  "home-brief": "brief-heading",
  "home-in-focus": "focus-heading",
  "home-special-coverage": "special-coverage-heading",
  "home-opinion": "opinion-heading",
  "home-more": "more-heading",
  "home-sports": "field-heading",
  "home-newsletter": "home-newsletter",
  "home-lead-latest": "right-now-heading",
  "home-lead-poll": "homepage-poll-heading",
  "home-lead-calendar": "this-week-heading",
  "home-newsletter-heading": "article-newsletter-heading",
  "home-sports-schedule": "field-schedule-heading",
  "home-sports-results": "recent-scores-heading",
  "home-sports-upcoming": "upcoming-games-heading"
};

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "package";
}

export function packageHeadingId(packageId: string, legacyId: string) {
  return DEFAULT_IDS[packageId] ?? `${safeId(packageId)}-${legacyId}`;
}

export function packageSectionId(packageId: string, legacyId: string) {
  return DEFAULT_IDS[packageId] ?? `${safeId(packageId)}-${legacyId}`;
}
