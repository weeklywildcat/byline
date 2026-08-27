import {
  LEAD_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  WEEKLY_WILDCAT_SPORTS_DEFAULTS,
  type BylineDesignDocumentV2,
  type BylineDesignPackage,
  type BylinePackageType,
  type LeadPackageProps,
  type SportsPackageProps
} from "@byline/design";
import { getPublishedDesignV2 } from "@/lib/designs";
import { getPublicationConfig } from "@/lib/publication";

/**
 * The Weekly Wildcat compatibility seed.
 *
 * This reproduces the pre-Studio homepage's extracted packages exactly, and
 * exists so Weekly Wildcat's output does not change before its design is
 * published. It is Weekly-Wildcat-specific by definition and must never be
 * handed to another publication.
 *
 * Package order is the document's ordering model. The lead package is the first
 * thing on the page and the sports package is the sixth section; between them
 * sit The Brief, In Focus, Special Coverage and Opinion, which are still legacy
 * and are rendered by the transitional homepage. The two extracted packages keep
 * their relative order here so the eventual orchestrator inherits it unchanged.
 */
export function getWeeklyWildcatCompatibilityDesign(theme: string): BylineDesignDocumentV2 {
  return {
    schemaVersion: 2,
    template: "home",
    theme,
    packages: [
      { id: "home-lead", type: LEAD_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS } },
      { id: "home-sports", type: SPORTS_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_SPORTS_DEFAULTS } }
    ]
  };
}

// A neutral starting point for any other publication. Same packages, but no
// Weekly Wildcat editorial assumptions: no sticky-first lead, no poll or
// calendar switched on by a paper that may not run either, and no athlete
// spotlight, which depends on a tagging convention a new newsroom has not
// adopted yet.
const NEUTRAL_LEAD_DEFAULTS: LeadPackageProps = {
  lead: { source: { type: "latest" } },
  latest: { heading: "Latest", source: { type: "latest" }, limit: 4, showBylines: true },
  utility: { poll: false, calendar: false, calendarLimit: 0 },
  presentation: { showDeck: true, opinionTreatment: "auto" }
};

const NEUTRAL_SPORTS_DEFAULTS: SportsPackageProps = {
  heading: "Sports",
  stories: { source: { type: "section", slug: "sports" }, limit: 3 },
  athleteSpotlight: { enabled: false, source: { type: "athlete-spotlight" } },
  scores: { enabled: true, limit: 2 },
  upcoming: { enabled: true, limit: 3 },
  presentation: { showDeck: true, showBylines: true }
};

export function getStarterHomeDesign(theme: string): BylineDesignDocumentV2 {
  return {
    schemaVersion: 2,
    template: "home",
    theme,
    packages: [
      { id: "home-lead", type: LEAD_PACKAGE_TYPE, props: { ...NEUTRAL_LEAD_DEFAULTS } },
      { id: "home-sports", type: SPORTS_PACKAGE_TYPE, props: { ...NEUTRAL_SPORTS_DEFAULTS } }
    ]
  };
}

/**
 * Resolves the design that drives the homepage.
 *
 * Order of precedence:
 *   1. the published design, loaded through the canonical design layer
 *   2. the publication's fallback seed, when nothing has been published yet
 *
 * The fallback is chosen by publication identity rather than being a global
 * default: Weekly Wildcat gets its compatibility seed so its live output is
 * preserved, and every other publication gets the neutral starter. A second
 * publication must never inherit Weekly Wildcat's homepage semantics merely
 * because it has not published a design.
 */
export function getHomeDesignDocument(): BylineDesignDocumentV2 {
  const publication = getPublicationConfig();
  const published = getPublishedDesignV2("home");

  // Revision 0 is the unpublished placeholder WordPress creates for every
  // template, so it must not take over the homepage.
  if (published && published.revision > 0) {
    return published.document;
  }

  return publication.appearance.theme === "weekly-wildcat"
    ? getWeeklyWildcatCompatibilityDesign(publication.appearance.theme)
    : getStarterHomeDesign(publication.appearance.theme);
}

/**
 * The document's package order.
 *
 * `packages[]` is the one ordering model. This exposes it so the transitional
 * homepage and its tests can agree on where each extracted package sits without
 * a second list being maintained somewhere else. When every package has been
 * extracted, the orchestrator iterates this rather than replacing it.
 */
export function getHomePackageOrder(document: BylineDesignDocumentV2): BylinePackageType[] {
  return document.packages.map((entry) => entry.type);
}

function findPackage(document: BylineDesignDocumentV2, type: BylinePackageType): BylineDesignPackage | null {
  return document.packages.find((entry) => entry.type === type) ?? null;
}

export function findLeadPackage(document: BylineDesignDocumentV2) {
  return findPackage(document, LEAD_PACKAGE_TYPE);
}

export function findSportsPackage(document: BylineDesignDocumentV2) {
  return findPackage(document, SPORTS_PACKAGE_TYPE);
}
