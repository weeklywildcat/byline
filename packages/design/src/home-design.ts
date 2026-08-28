// The canonical homepage seeds.
//
// These are what the published frontend actually resolves when a publication
// has not published a design of its own, so they are the only honest answer to
// "what is the live homepage using right now?". They live in the shared package
// because both hosts need that answer: the static export renders it, and Studio
// offers it as the reset target for a stale draft. A separately maintained
// Studio copy would let the editor reset to something the site never used.
import { LEAD_PACKAGE_TYPE, WEEKLY_WILDCAT_LEAD_DEFAULTS, type LeadPackageProps } from "./lead-package";
import { BRIEF_PACKAGE_TYPE, NEUTRAL_BRIEF_DEFAULTS, WEEKLY_WILDCAT_BRIEF_DEFAULTS } from "./brief-package";
import { IN_FOCUS_PACKAGE_TYPE, NEUTRAL_IN_FOCUS_DEFAULTS, WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS } from "./in-focus-package";
import {
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  NEUTRAL_SPECIAL_COVERAGE_DEFAULTS,
  WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS
} from "./special-coverage-package";
import { OPINION_PACKAGE_TYPE, NEUTRAL_OPINION_DEFAULTS, WEEKLY_WILDCAT_OPINION_DEFAULTS } from "./opinion-package";
import { SPORTS_PACKAGE_TYPE, NEUTRAL_SPORTS_DEFAULTS, WEEKLY_WILDCAT_SPORTS_DEFAULTS } from "./sports-package";
import { MORE_PACKAGE_TYPE, NEUTRAL_MORE_DEFAULTS, WEEKLY_WILDCAT_MORE_DEFAULTS } from "./more-package";
import {
  NEWSLETTER_PACKAGE_TYPE,
  NEUTRAL_NEWSLETTER_DEFAULTS,
  WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS
} from "./newsletter-package";
import type { BylineDesignDocumentV2 } from "./schema-v2";

/**
 * The Weekly Wildcat compatibility seed.
 *
 * Reproduces the pre-Studio homepage's extracted packages exactly, so Weekly
 * Wildcat's output does not change before a design is published. It is
 * Weekly-Wildcat-specific by definition and must never be handed to another
 * publication.
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
export const NEUTRAL_LEAD_DEFAULTS: LeadPackageProps = {
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
 * The design a publication falls back to when it has published nothing.
 *
 * Chosen by publication identity rather than being a global default: Weekly
 * Wildcat gets its compatibility seed so its live output is preserved, and
 * every other publication gets the neutral starter. A second publication must
 * never inherit Weekly Wildcat's homepage semantics merely because it has not
 * published a design.
 */
export function getFallbackDesignDocument(template: string, theme: string): BylineDesignDocumentV2 {
  if (template === "home") {
    return theme === "weekly-wildcat" ? getWeeklyWildcatCompatibilityDesign(theme) : getStarterHomeDesign(theme);
  }

  return { schemaVersion: 2, template, theme, packages: [] };
}

/**
 * The design the live site is currently resolving.
 *
 * Revision 0 is the unpublished placeholder WordPress creates for every
 * template, so it must not take over: a publication sitting on revision 0 is
 * genuinely running the fallback, and telling an editor otherwise is what makes
 * a stale draft look like the published homepage.
 */
export function getLiveDesignDocument(input: {
  template: string;
  theme: string;
  published?: { document: BylineDesignDocumentV2; revision: number } | null;
}): BylineDesignDocumentV2 {
  if (input.published && input.published.revision > 0) return input.published.document;

  return getFallbackDesignDocument(input.template, input.theme);
}
