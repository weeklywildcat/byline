import {
  LEAD_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  getWeeklyWildcatHomeDesign,
  type BylineDesignDocumentV2,
  type BylineDesignPackage,
  type BylinePackageType
} from "@byline/design";

export { getWeeklyWildcatHomeDesign };

/** The Weekly Wildcat homepage is maintained in code. */
export function getHomeDesignDocument(): BylineDesignDocumentV2 {
  return getWeeklyWildcatHomeDesign("weekly-wildcat");
}

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
