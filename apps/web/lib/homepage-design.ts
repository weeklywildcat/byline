import {
  BRIEF_PACKAGE_TYPE,
  IN_FOCUS_PACKAGE_TYPE,
  LEAD_PACKAGE_TYPE,
  MORE_PACKAGE_TYPE,
  NEWSLETTER_PACKAGE_TYPE,
  NEUTRAL_BRIEF_DEFAULTS,
  NEUTRAL_IN_FOCUS_DEFAULTS,
  NEUTRAL_MORE_DEFAULTS,
  NEUTRAL_NEWSLETTER_DEFAULTS,
  NEUTRAL_OPINION_DEFAULTS,
  NEUTRAL_SPECIAL_COVERAGE_DEFAULTS,
  NEUTRAL_SPORTS_DEFAULTS,
  OPINION_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  WEEKLY_WILDCAT_BRIEF_DEFAULTS,
  WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  WEEKLY_WILDCAT_MORE_DEFAULTS,
  WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS,
  WEEKLY_WILDCAT_OPINION_DEFAULTS,
  WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS,
  WEEKLY_WILDCAT_SPORTS_DEFAULTS,
  type BylineDesignDocumentV2,
  type BylineDesignPackage,
  type BylinePackageType,
  type LeadPackageProps
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
 * Package order is the document's ordering model and matches the historical
 * production page: Lead, Brief, In Focus, Special Coverage, Opinion, Sports,
 * More, Newsletter.
 */
export function getWeeklyWildcatCompatibilityDesign(theme: string): BylineDesignDocumentV2 {
  return {
    schemaVersion: 2,
    template: "home",
    theme,
    packages: [
      { id: "home-lead", type: LEAD_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS } },
      { id: "home-brief", type: BRIEF_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_BRIEF_DEFAULTS } },
      { id: "home-in-focus", type: IN_FOCUS_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS } },
      {
        id: "home-special-coverage",
        type: SPECIAL_COVERAGE_PACKAGE_TYPE,
        props: { ...WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS }
      },
      { id: "home-opinion", type: OPINION_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_OPINION_DEFAULTS } },
      { id: "home-sports", type: SPORTS_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_SPORTS_DEFAULTS } },
      { id: "home-more", type: MORE_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_MORE_DEFAULTS } },
      { id: "home-newsletter", type: NEWSLETTER_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS } }
    ]
  };
}

// A neutral starting point for any other publication. Same semantic package
// family, but no Weekly Wildcat editorial assumptions: no sticky-first lead, no
// poll or calendar switched on by a paper that may not run either, and no
// athlete spotlight, which depends on a tagging convention a new newsroom has
// not adopted yet.
const NEUTRAL_LEAD_DEFAULTS: LeadPackageProps = {
  mode: "content",
  lead: { source: { type: "latest" } },
  latest: { heading: "Latest", source: { type: "latest" }, limit: 4, showBylines: true },
  utility: { poll: false, calendar: false, calendarLimit: 0 },
  presentation: { showDeck: true }
};

export function getStarterHomeDesign(theme: string): BylineDesignDocumentV2 {
  return {
    schemaVersion: 2,
    template: "home",
    theme,
    packages: [
      { id: "home-lead", type: LEAD_PACKAGE_TYPE, props: { ...NEUTRAL_LEAD_DEFAULTS } },
      { id: "home-brief", type: BRIEF_PACKAGE_TYPE, props: { ...NEUTRAL_BRIEF_DEFAULTS } },
      { id: "home-in-focus", type: IN_FOCUS_PACKAGE_TYPE, props: { ...NEUTRAL_IN_FOCUS_DEFAULTS } },
      { id: "home-special-coverage", type: SPECIAL_COVERAGE_PACKAGE_TYPE, props: { ...NEUTRAL_SPECIAL_COVERAGE_DEFAULTS } },
      { id: "home-opinion", type: OPINION_PACKAGE_TYPE, props: { ...NEUTRAL_OPINION_DEFAULTS } },
      { id: "home-sports", type: SPORTS_PACKAGE_TYPE, props: { ...NEUTRAL_SPORTS_DEFAULTS } },
      { id: "home-more", type: MORE_PACKAGE_TYPE, props: { ...NEUTRAL_MORE_DEFAULTS } },
      { id: "home-newsletter", type: NEWSLETTER_PACKAGE_TYPE, props: { ...NEUTRAL_NEWSLETTER_DEFAULTS } }
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
 * `packages[]` is the one ordering model. This exposes it for diagnostics and
 * tests without maintaining a second homepage order list.
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
