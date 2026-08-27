// The lead package contract.
//
// The Weekly Wildcat lead area is not "a lead story". It is a three-column
// newsroom package: a utility rail (poll + this-week calendar), the lead story
// itself, and a "The Latest" rail. Modelling that as generic nested Columns
// blocks would force an editor to rebuild the paper's most important layout by
// hand, so it is one semantic package with editorial settings.
//
// See docs/weekly-wildcat-homepage-inventory.md for the behaviour this must
// reproduce.
import { parseStorySource, type BylineStorySource } from "./schema-v2";

export const LEAD_PACKAGE_TYPE = "lead-package";

export type LeadPackageProps = {
  // Utility-only migrated v1 blocks use the same host-supplied slots without
  // pretending they contain a lead story. Normal homepage packages use the
  // default `content` mode.
  mode?: "content" | "single-story" | "poll" | "calendar";
  // A migrated v1 story-lead carried a visible accessible label even though
  // the normal lead package has no section heading of its own.
  heading?: string;
  lead: {
    source: BylineStorySource;
  };
  latest: {
    heading: string;
    source: BylineStorySource;
    limit: number;
    showBylines: boolean;
  };
  utility: {
    // Both rails are module-dependent: a publication with polls disabled must
    // not be able to configure a poll into its homepage.
    poll: boolean;
    calendar: boolean;
    calendarLimit: number;
  };
  presentation: {
    showDeck: boolean;
  };
};

// The Weekly Wildcat production defaults, taken from the pre-Studio homepage:
// sticky-first lead, a four-story Latest rail with bylines, both utility
// modules on, decks shown.
export const WEEKLY_WILDCAT_LEAD_DEFAULTS: LeadPackageProps = {
  lead: { source: { type: "sticky" } },
  latest: { heading: "The Latest", source: { type: "compatibility-latest" }, limit: 4, showBylines: true },
  utility: { poll: true, calendar: true, calendarLimit: 3 },
  presentation: { showDeck: true }
};

const MAX_LATEST = 12;
const MAX_CALENDAR_ITEMS = 10;

function boundedCount(value: unknown, fallback: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function heading(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

// Parses persisted props into a complete, valid configuration. Unknown or
// malformed fields fall back to the Weekly Wildcat default rather than throwing:
// a design that has lost one setting should still render the paper, and the
// schema-level validation above already rejected structurally invalid packages.
export function parseLeadPackageProps(value: unknown): LeadPackageProps {
  const props = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const lead = (props.lead ?? {}) as Record<string, unknown>;
  const latest = (props.latest ?? {}) as Record<string, unknown>;
  const utility = (props.utility ?? {}) as Record<string, unknown>;
  const presentation = (props.presentation ?? {}) as Record<string, unknown>;

  const mode = props.mode === "poll" || props.mode === "calendar" || props.mode === "content" || props.mode === "single-story"
    ? props.mode
    : undefined;
  const packageHeading = typeof props.heading === "string" && props.heading.trim()
    ? props.heading.trim().slice(0, 80)
    : "Top story";

  return {
    ...(mode ? { mode } : {}),
    ...(mode === "single-story" ? { heading: packageHeading } : {}),
    lead: {
      source: parseStorySource(lead.source) ?? WEEKLY_WILDCAT_LEAD_DEFAULTS.lead.source
    },
    latest: {
      heading: heading(latest.heading, WEEKLY_WILDCAT_LEAD_DEFAULTS.latest.heading),
      source: parseStorySource(latest.source) ?? WEEKLY_WILDCAT_LEAD_DEFAULTS.latest.source,
      limit: boundedCount(latest.limit, WEEKLY_WILDCAT_LEAD_DEFAULTS.latest.limit, MAX_LATEST),
      showBylines: boolean(latest.showBylines, WEEKLY_WILDCAT_LEAD_DEFAULTS.latest.showBylines)
    },
    utility: {
      poll: boolean(utility.poll, WEEKLY_WILDCAT_LEAD_DEFAULTS.utility.poll),
      calendar: boolean(utility.calendar, WEEKLY_WILDCAT_LEAD_DEFAULTS.utility.calendar),
      calendarLimit: boundedCount(
        utility.calendarLimit,
        WEEKLY_WILDCAT_LEAD_DEFAULTS.utility.calendarLimit,
        MAX_CALENDAR_ITEMS
      )
    },
    // Older persisted designs may still carry a retired `opinionTreatment`
    // setting. Rebuilding presentation from the known keys drops it, so those
    // documents stay valid and simply render the normal lead treatment.
    presentation: {
      showDeck: boolean(presentation.showDeck, WEEKLY_WILDCAT_LEAD_DEFAULTS.presentation.showDeck)
    }
  };
}
