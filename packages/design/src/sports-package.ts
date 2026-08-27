// The sports package contract.
//
// The Weekly Wildcat sports area is not a story list with a scoreboard bolted
// on. It is a composite newsroom package that draws on two different source
// domains at once: WordPress stories (a sports lead, a supporting rail, an
// athlete spotlight) and the structured sports record (recent finals, upcoming
// fixtures). An editor configures one thing -- "the Sports package" -- and the
// resolver reconciles it against what the publication actually has.
//
// See docs/weekly-wildcat-homepage-inventory.md for the behaviour this must
// reproduce.
import { parseStorySource, type BylineStorySource } from "./schema-v2";

export const SPORTS_PACKAGE_TYPE = "sports-package";

// The athlete spotlight is deliberately NOT a general BylineStorySource.
//
// "The current athlete spotlight" is a standing editorial convention -- the post
// carrying the athlete-of-the-week/month flag -- and the only other thing an
// editor sensibly does is pin a specific story. Offering `latest` or `author`
// here would let a design ask for something the spotlight treatment cannot
// render meaningfully, so the union is narrowed to what the package supports.
export type AthleteSpotlightSource = { type: "athlete-spotlight" } | { type: "manual"; storyIds: number[] };

export type SportsPackageProps = {
  heading: string;
  stories: {
    source: BylineStorySource;
    // The total story count for the package: one lead plus the supporting rail.
    limit: number;
  };
  athleteSpotlight: {
    enabled: boolean;
    source: AthleteSpotlightSource;
  };
  // Both structured-data modules are counted in what the reader sees, not in
  // what the API is asked for. An editor choosing "2 finals" means two cards.
  scores: {
    enabled: boolean;
    limit: number;
  };
  upcoming: {
    enabled: boolean;
    limit: number;
  };
  presentation: {
    showDeck: boolean;
    showBylines: boolean;
  };
};

// The Weekly Wildcat production defaults, taken from the pre-Studio homepage.
//
// `scores.limit: 2` and `upcoming.limit: 3` are the counts the schedule panel
// actually rendered. The pre-Studio page fetched 3 and 8 respectively and then
// sliced; the fetch sizes are a transport detail, so the package persists what
// the reader sees.
export const WEEKLY_WILDCAT_SPORTS_DEFAULTS: SportsPackageProps = {
  heading: "Sports",
  stories: { source: { type: "section", slug: "sports" }, limit: 3 },
  athleteSpotlight: { enabled: true, source: { type: "athlete-spotlight" } },
  scores: { enabled: true, limit: 2 },
  upcoming: { enabled: true, limit: 3 },
  presentation: { showDeck: true, showBylines: true }
};

const MAX_STORIES = 12;
const MAX_SCORES = 8;
const MAX_UPCOMING = 12;

function boundedCount(value: unknown, fallback: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function heading(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

export function parseAthleteSpotlightSource(value: unknown): AthleteSpotlightSource | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;

  if (source.type === "athlete-spotlight") return { type: "athlete-spotlight" };

  // Reuses the shared parser so a manual pin is validated identically wherever
  // it appears, then narrows the result back to what this package accepts.
  const parsed = parseStorySource(source);

  return parsed?.type === "manual" ? parsed : null;
}

/**
 * Parses persisted props into a complete, valid configuration.
 *
 * Malformed fields fall back to the Weekly Wildcat default rather than throwing,
 * matching the lead package: a design that has lost one setting should still
 * render the paper, and schema-level validation has already rejected
 * structurally invalid packages.
 */
export function parseSportsPackageProps(value: unknown): SportsPackageProps {
  const props = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const stories = (props.stories ?? {}) as Record<string, unknown>;
  const athleteSpotlight = (props.athleteSpotlight ?? {}) as Record<string, unknown>;
  const scores = (props.scores ?? {}) as Record<string, unknown>;
  const upcoming = (props.upcoming ?? {}) as Record<string, unknown>;
  const presentation = (props.presentation ?? {}) as Record<string, unknown>;

  return {
    heading: heading(props.heading, WEEKLY_WILDCAT_SPORTS_DEFAULTS.heading),
    stories: {
      source: parseStorySource(stories.source) ?? WEEKLY_WILDCAT_SPORTS_DEFAULTS.stories.source,
      limit: boundedCount(stories.limit, WEEKLY_WILDCAT_SPORTS_DEFAULTS.stories.limit, MAX_STORIES)
    },
    athleteSpotlight: {
      enabled: boolean(athleteSpotlight.enabled, WEEKLY_WILDCAT_SPORTS_DEFAULTS.athleteSpotlight.enabled),
      source:
        parseAthleteSpotlightSource(athleteSpotlight.source) ??
        WEEKLY_WILDCAT_SPORTS_DEFAULTS.athleteSpotlight.source
    },
    scores: {
      enabled: boolean(scores.enabled, WEEKLY_WILDCAT_SPORTS_DEFAULTS.scores.enabled),
      limit: boundedCount(scores.limit, WEEKLY_WILDCAT_SPORTS_DEFAULTS.scores.limit, MAX_SCORES)
    },
    upcoming: {
      enabled: boolean(upcoming.enabled, WEEKLY_WILDCAT_SPORTS_DEFAULTS.upcoming.enabled),
      limit: boundedCount(upcoming.limit, WEEKLY_WILDCAT_SPORTS_DEFAULTS.upcoming.limit, MAX_UPCOMING)
    },
    presentation: {
      showDeck: boolean(presentation.showDeck, WEEKLY_WILDCAT_SPORTS_DEFAULTS.presentation.showDeck),
      showBylines: boolean(presentation.showBylines, WEEKLY_WILDCAT_SPORTS_DEFAULTS.presentation.showBylines)
    }
  };
}
