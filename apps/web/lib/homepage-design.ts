import {
  LEAD_PACKAGE_TYPE,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  type BylineDesignDocumentV2,
  type LeadPackageProps
} from "@byline/design";
import { getPublishedDesignV2 } from "@/lib/designs";
import { getPublicationConfig } from "@/lib/publication";

/**
 * The Weekly Wildcat compatibility seed.
 *
 * This reproduces the pre-Studio homepage's lead area exactly, and exists so
 * Weekly Wildcat's output does not change before its design is published. It is
 * Weekly-Wildcat-specific by definition and must never be handed to another
 * publication.
 */
export function getWeeklyWildcatCompatibilityDesign(theme: string): BylineDesignDocumentV2 {
  return {
    schemaVersion: 2,
    template: "home",
    theme,
    packages: [{ id: "home-lead", type: LEAD_PACKAGE_TYPE, props: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS } }]
  };
}

// A neutral starting point for any other publication. Same package, but no
// Weekly Wildcat editorial assumptions: no sticky-first lead, no poll or
// calendar switched on by a paper that may not run either.
const NEUTRAL_LEAD_DEFAULTS: LeadPackageProps = {
  lead: { source: { type: "latest" } },
  latest: { heading: "Latest", source: { type: "latest" }, limit: 4, showBylines: true },
  utility: { poll: false, calendar: false, calendarLimit: 0 },
  presentation: { showDeck: true, opinionTreatment: "auto" }
};

export function getStarterHomeDesign(theme: string): BylineDesignDocumentV2 {
  return {
    schemaVersion: 2,
    template: "home",
    theme,
    packages: [{ id: "home-lead", type: LEAD_PACKAGE_TYPE, props: { ...NEUTRAL_LEAD_DEFAULTS } }]
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

export function findLeadPackage(document: BylineDesignDocumentV2) {
  return document.packages.find((entry) => entry.type === LEAD_PACKAGE_TYPE) ?? null;
}
