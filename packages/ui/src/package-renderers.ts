import type { ComponentType } from "react";
import { BriefPackage, type BriefPackageProps, type ResolvedBriefPackage } from "./BriefPackage";
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

// Retain the renderer helpers for existing package consumers; all use Weekly Wildcat.
export function getLeadPackageRenderer(_themeId: string): ComponentType<LeadPackageProps> {
  return LeadPackage;
}

export function getSportsPackageRenderer(_themeId: string): ComponentType<SportsPackageProps> {
  return SportsPackage;
}

export function getBriefPackageRenderer(_themeId: string): ComponentType<BriefPackageProps> {
  return BriefPackage;
}

export function getInFocusPackageRenderer(_themeId: string): ComponentType<InFocusPackageProps> {
  return InFocusPackage;
}

export function getSpecialCoveragePackageRenderer(_themeId: string): ComponentType<SpecialCoveragePackageProps> {
  return SpecialCoveragePackage;
}

export function getOpinionPackageRenderer(_themeId: string): ComponentType<OpinionPackageProps> {
  return OpinionPackage;
}

export function getMorePackageRenderer(_themeId: string): ComponentType<MorePackageRendererProps> {
  return MorePackage;
}

export function getNewsletterPackageRenderer(_themeId: string): ComponentType<NewsletterPackageProps> {
  return NewsletterPackage;
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
