import {
  LEAD_PACKAGE_TYPE,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  parseBylineDesignDocumentV2,
  type BylineDesignDocumentV2
} from "@byline/design";
import { getPublicationConfig } from "@/lib/publication";

// The seeded Weekly Wildcat compatibility design.
//
// This is the "first real design" the corrective pass asks for: opening Studio
// shows the publication's actual lead package with its real settings, not a
// generic placeholder. It is deliberately seeded in code rather than migrated
// from an experimental v1 draft, so a half-finished draft can never become the
// live homepage by accident.
//
// Only the lead package exists so far. The rest of the homepage still renders
// through its legacy path, which is why this document is not yet the sole
// source of truth for the page.
export function getWeeklyWildcatHomeDesign(): BylineDesignDocumentV2 {
  const publication = getPublicationConfig();

  return {
    schemaVersion: 2,
    template: "home",
    theme: publication.appearance.theme,
    packages: [
      {
        id: "home-lead",
        type: LEAD_PACKAGE_TYPE,
        props: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS }
      }
    ]
  };
}

// Reads the design that should drive the homepage.
//
// BYLINE_HOME_DESIGN_JSON lets a build or a Studio preview supply a design
// document; otherwise the seeded compatibility design is used. A malformed
// document is a build error rather than a silent fallback: quietly rendering a
// different homepage than the one that was published is the failure mode this
// whole corrective pass exists to remove.
export function getHomeDesignDocument(): BylineDesignDocumentV2 {
  const raw = process.env.BYLINE_HOME_DESIGN_JSON;

  if (!raw) return getWeeklyWildcatHomeDesign();

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("BYLINE_HOME_DESIGN_JSON is not valid JSON.");
  }

  return parseBylineDesignDocumentV2(parsed, "home");
}

export function findLeadPackage(document: BylineDesignDocumentV2) {
  return document.packages.find((entry) => entry.type === LEAD_PACKAGE_TYPE) ?? null;
}
