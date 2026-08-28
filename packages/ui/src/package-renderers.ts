import type { ComponentType } from "react";
import { BriefPackage, type BriefPackageProps, type ResolvedBriefPackage } from "./BriefPackage";
import { EditorialLeadPackage } from "./EditorialLeadPackage";
import { EditorialSportsPackage } from "./EditorialSportsPackage";
import { InFocusPackage, type InFocusPackageProps, type ResolvedInFocusPackage } from "./InFocusPackage";
import { LeadPackage, type LeadPackageProps, type ResolvedLeadPackage } from "./LeadPackage";
import { MorePackage, type MorePackageRendererProps, type ResolvedMorePackage } from "./MorePackage";
import { NewsletterPackage, type NewsletterPackageProps, type ResolvedNewsletterPackage } from "./NewsletterPackage";
import { OpinionPackage, type OpinionPackageProps, type ResolvedOpinionPackage } from "./OpinionPackage";
import { SpecialCoveragePackage, type ResolvedSpecialCoveragePackage, type SpecialCoveragePackageProps } from "./SpecialCoveragePackage";
import { SportsPackage, type SportsPackageProps } from "./SportsPackage";
import { sportsPackageHasContent, type ResolvedSportsPackage } from "./sports-view";

export type ResolvedHomepagePackage =
  | { type: "lead-package"; package: ResolvedLeadPackage }
  | { type: "brief-package"; package: ResolvedBriefPackage }
  | { type: "in-focus-package"; package: ResolvedInFocusPackage }
  | { type: "special-coverage-package"; package: ResolvedSpecialCoveragePackage }
  | { type: "opinion-package"; package: ResolvedOpinionPackage }
  | { type: "sports-package"; package: ResolvedSportsPackage }
  | { type: "more-package"; package: ResolvedMorePackage }
  | { type: "newsletter-package"; package: ResolvedNewsletterPackage };

// This union keeps the canonical renderer models tied to their semantic package
// types while package ordering and dispatch stay in one place.

// Maps a theme to its renderer for a semantic package.
//
// This is the contract that makes themes meaningful: the design document, the
// resolver and the resolved model are all theme-independent, and only the last
// step differs. It is also what stops a theme from being able to change what an
// editor configured -- a theme can only choose how to draw it.
const LEAD_PACKAGE_RENDERERS: Record<string, ComponentType<LeadPackageProps>> = {
  "weekly-wildcat": LeadPackage,
  "byline-editorial": EditorialLeadPackage,
  editorial: EditorialLeadPackage
};

/**
 * Returns the lead renderer for a theme.
 *
 * Themes without a bespoke treatment fall back to the Weekly Wildcat structure
 * rather than rendering nothing: a missing variant must degrade, never delete
 * the package. Callers can use `themeHasLeadPackageVariant` to warn in Studio
 * when a theme is falling back.
 */
export function getLeadPackageRenderer(themeId: string): ComponentType<LeadPackageProps> {
  return LEAD_PACKAGE_RENDERERS[themeId] ?? LeadPackage;
}

export function themeHasLeadPackageVariant(themeId: string) {
  return themeId in LEAD_PACKAGE_RENDERERS;
}

const SPORTS_PACKAGE_RENDERERS: Record<string, ComponentType<SportsPackageProps>> = {
  "weekly-wildcat": SportsPackage,
  "byline-editorial": EditorialSportsPackage,
  editorial: EditorialSportsPackage
};

/**
 * Returns the sports renderer for a theme.
 *
 * Same degradation rule as the lead package: a theme with no bespoke sports
 * treatment falls back to the Weekly Wildcat structure rather than dropping the
 * package off the page.
 */
export function getSportsPackageRenderer(themeId: string): ComponentType<SportsPackageProps> {
  return SPORTS_PACKAGE_RENDERERS[themeId] ?? SportsPackage;
}

export function themeHasSportsPackageVariant(themeId: string) {
  return themeId in SPORTS_PACKAGE_RENDERERS;
}

const BRIEF_PACKAGE_RENDERERS: Record<string, ComponentType<BriefPackageProps>> = {
  "weekly-wildcat": BriefPackage,
  "byline-editorial": BriefPackage,
  editorial: BriefPackage
};

export function getBriefPackageRenderer(themeId: string): ComponentType<BriefPackageProps> {
  return BRIEF_PACKAGE_RENDERERS[themeId] ?? BriefPackage;
}

const IN_FOCUS_PACKAGE_RENDERERS: Record<string, ComponentType<InFocusPackageProps>> = {
  "weekly-wildcat": InFocusPackage,
  "byline-editorial": InFocusPackage,
  editorial: InFocusPackage
};

export function getInFocusPackageRenderer(themeId: string): ComponentType<InFocusPackageProps> {
  return IN_FOCUS_PACKAGE_RENDERERS[themeId] ?? InFocusPackage;
}

const SPECIAL_COVERAGE_PACKAGE_RENDERERS: Record<string, ComponentType<SpecialCoveragePackageProps>> = {
  "weekly-wildcat": SpecialCoveragePackage,
  "byline-editorial": SpecialCoveragePackage,
  editorial: SpecialCoveragePackage
};

export function getSpecialCoveragePackageRenderer(themeId: string): ComponentType<SpecialCoveragePackageProps> {
  return SPECIAL_COVERAGE_PACKAGE_RENDERERS[themeId] ?? SpecialCoveragePackage;
}

const OPINION_PACKAGE_RENDERERS: Record<string, ComponentType<OpinionPackageProps>> = {
  "weekly-wildcat": OpinionPackage,
  "byline-editorial": OpinionPackage,
  editorial: OpinionPackage
};

export function getOpinionPackageRenderer(themeId: string): ComponentType<OpinionPackageProps> {
  return OPINION_PACKAGE_RENDERERS[themeId] ?? OpinionPackage;
}

const MORE_PACKAGE_RENDERERS: Record<string, ComponentType<MorePackageRendererProps>> = {
  "weekly-wildcat": MorePackage,
  "byline-editorial": MorePackage,
  editorial: MorePackage
};

export function getMorePackageRenderer(themeId: string): ComponentType<MorePackageRendererProps> {
  return MORE_PACKAGE_RENDERERS[themeId] ?? MorePackage;
}

const NEWSLETTER_PACKAGE_RENDERERS: Record<string, ComponentType<NewsletterPackageProps>> = {
  "weekly-wildcat": NewsletterPackage,
  "byline-editorial": NewsletterPackage,
  editorial: NewsletterPackage
};

export function getNewsletterPackageRenderer(themeId: string): ComponentType<NewsletterPackageProps> {
  return NEWSLETTER_PACKAGE_RENDERERS[themeId] ?? NewsletterPackage;
}

export function getHomepagePackageRenderer(type: ResolvedHomepagePackage["type"], themeId: string) {
  switch (type) {
    case "lead-package": return getLeadPackageRenderer(themeId);
    case "brief-package": return getBriefPackageRenderer(themeId);
    case "in-focus-package": return getInFocusPackageRenderer(themeId);
    case "special-coverage-package": return getSpecialCoveragePackageRenderer(themeId);
    case "opinion-package": return getOpinionPackageRenderer(themeId);
    case "sports-package": return getSportsPackageRenderer(themeId);
    case "more-package": return getMorePackageRenderer(themeId);
    case "newsletter-package": return getNewsletterPackageRenderer(themeId);
  }
}

/**
 * Whether a resolved package renders anything on the public page.
 *
 * Every package renderer above returns `null` for its own empty case, which is
 * the production contract: a configured package is an available homepage
 * position, not a promise that a section exists. This predicate mirrors those
 * conditions in one place so an editor host can ask the question *before*
 * rendering -- to suppress a section it must not draw, or to explain in an
 * outline why a configured package is currently invisible -- without inventing
 * a second set of rules that could drift from the renderers.
 */
export function isResolvedHomepagePackageVisible(entry: ResolvedHomepagePackage): boolean {
  switch (entry.type) {
    case "lead-package": {
      const resolved = entry.package;
      const mode = resolved.mode ?? "content";

      if (mode === "poll" || mode === "calendar") return resolved.utility.poll || resolved.utility.calendar;
      if (mode === "single-story") return Boolean(resolved.lead);

      // The default lead package always draws its shell, including its empty
      // state, exactly as the pre-Studio homepage did.
      return true;
    }
    case "brief-package":
      return Boolean(entry.package.lead);
    case "in-focus-package":
      return Boolean(entry.package.story);
    case "special-coverage-package":
      return entry.package.stories.length > 0;
    case "opinion-package":
      return Boolean(entry.package.lead);
    case "sports-package":
      return sportsPackageHasContent(entry.package);
    case "more-package":
      return Boolean(entry.package.lead);
    case "newsletter-package":
      return entry.package.enabled;
  }
}
