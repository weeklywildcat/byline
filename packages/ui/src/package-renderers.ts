import type { ComponentType } from "react";
import { EditorialLeadPackage } from "./EditorialLeadPackage";
import { LeadPackage, type LeadPackageProps } from "./LeadPackage";

// Maps a theme to its renderer for a semantic package.
//
// This is the contract that makes themes meaningful: the design document, the
// resolver and the resolved model are all theme-independent, and only the last
// step differs. It is also what stops a theme from being able to change what an
// editor configured -- a theme can only choose how to draw it.
const LEAD_PACKAGE_RENDERERS: Record<string, ComponentType<LeadPackageProps>> = {
  "weekly-wildcat": LeadPackage,
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
