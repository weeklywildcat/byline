import {
  LEAD_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  getLiveDesignDocument,
  getStarterHomeDesign,
  getWeeklyWildcatCompatibilityDesign,
  type BylineDesignDocumentV2,
  type BylineDesignPackage,
  type BylinePackageType
} from "@byline/design";
import { getPublishedDesignV2 } from "@/lib/designs";
import { getPublicationConfig } from "@/lib/publication";

// The homepage seeds themselves live in @byline/design so Studio can offer the
// same canonical document as its "reset to the live homepage" target. There is
// one definition of what the live site falls back to, not a frontend copy and
// an editor copy.
export { getStarterHomeDesign, getWeeklyWildcatCompatibilityDesign };

/**
 * Resolves the design that drives the homepage.
 *
 * Order of precedence:
 *   1. the published design, loaded through the canonical design layer
 *   2. the publication's fallback seed, when nothing has been published yet
 */
export function getHomeDesignDocument(): BylineDesignDocumentV2 {
  const publication = getPublicationConfig();
  const published = getPublishedDesignV2("home");

  return getLiveDesignDocument({
    template: "home",
    theme: publication.appearance.theme,
    published: published ? { document: published.document, revision: published.revision } : null
  });
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
