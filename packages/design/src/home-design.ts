// The Weekly Wildcat homepage.
//
// The homepage is one fixed composition of the shared package family; it is not
// editable at runtime. Package order is the document's ordering model and
// matches the historical production page: Lead, Brief, In Focus, Special
// Coverage, Opinion, Sports, More, Newsletter.
import { LEAD_PACKAGE_TYPE, WEEKLY_WILDCAT_LEAD_DEFAULTS } from "./lead-package";
import { BRIEF_PACKAGE_TYPE, WEEKLY_WILDCAT_BRIEF_DEFAULTS } from "./brief-package";
import { IN_FOCUS_PACKAGE_TYPE, WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS } from "./in-focus-package";
import {
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS
} from "./special-coverage-package";
import { OPINION_PACKAGE_TYPE, WEEKLY_WILDCAT_OPINION_DEFAULTS } from "./opinion-package";
import { SPORTS_PACKAGE_TYPE, WEEKLY_WILDCAT_SPORTS_DEFAULTS } from "./sports-package";
import { MORE_PACKAGE_TYPE, WEEKLY_WILDCAT_MORE_DEFAULTS } from "./more-package";
import { NEWSLETTER_PACKAGE_TYPE, WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS } from "./newsletter-package";
import type { BylineDesignDocumentV2 } from "./schema-v2";

export function getWeeklyWildcatHomeDesign(theme: string): BylineDesignDocumentV2 {
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
