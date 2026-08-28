import {
  LEAD_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  parseLeadPackageProps,
  parseSportsPackageProps,
  type BylineDesignDocumentV2
} from "@byline/design";
import {
  resolveHomepageDocument as resolveSharedHomepageDocument,
  type ResolvedHomepageDocument
} from "@byline/content";
import type { BylinePublicationConfig } from "@byline/core";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import { toHomepagePublicationInput, toHomepageStoryInputs } from "@/lib/homepage-story-input";
import { toSportsFixtureView, toSportsResultView } from "@/lib/sports-packages";
import type { WordPressPost } from "@/lib/wordpress";

const BASELINE_RECENT_GAMES = 3;
const BASELINE_UPCOMING_GAMES = 8;
const BASELINE_SCHOOL_EVENTS = 12;

export type HomepageDataRequirements = {
  recentScores: number;
  upcomingGames: number;
  schoolEvents: number;
};

/**
 * Calculates the largest structured-data request any package can need. The
 * page fetches once, then the document resolver slices those records into the
 * packages that asked for them.
 */
export function getHomepageDataRequirements(document: BylineDesignDocumentV2): HomepageDataRequirements {
  let recentScores = BASELINE_RECENT_GAMES;
  let upcomingGames = BASELINE_UPCOMING_GAMES;
  let schoolEvents = BASELINE_SCHOOL_EVENTS;

  for (const entry of document.packages) {
    if (entry.type === SPORTS_PACKAGE_TYPE) {
      const sports = parseSportsPackageProps(entry.props);

      if (sports.content !== "story") {
        if (sports.scores.enabled) recentScores = Math.max(recentScores, sports.scores.limit);
        if (sports.upcoming.enabled) upcomingGames = Math.max(upcomingGames, sports.upcoming.limit);
      }
    }

    if (entry.type === LEAD_PACKAGE_TYPE) {
      const lead = parseLeadPackageProps(entry.props);

      if (lead.utility.calendar) {
        // The calendar is a merged view of school events and upcoming games.
        // Planning only schoolEvents under-fetches a calendar whose ten entries
        // are all games, so both source domains are sized to the requested
        // visible count while their historical baselines remain unchanged.
        schoolEvents = Math.max(schoolEvents, lead.utility.calendarLimit);
        upcomingGames = Math.max(upcomingGames, lead.utility.calendarLimit);
      }
    }
  }

  return { recentScores, upcomingGames, schoolEvents };
}

export type HomepageResolutionInput = {
  document: BylineDesignDocumentV2;
  posts: WordPressPost[];
  publication: BylinePublicationConfig;
  sportsSchedule: {
    recentScores: SportsGame[];
    upcomingGames: SportsGame[];
    schoolEvents: SchoolEvent[];
  };
};

export type ResolvedHomepage = ResolvedHomepageDocument;

/**
 * The static site's entry point into the canonical homepage resolver.
 *
 * Everything ordering-related -- pin reservation, the one compatibility
 * selection pass, the page-wide used-story set and the package order -- lives
 * in `@byline/content` and is shared byte-for-byte with Studio. This function
 * only adapts build-time WordPress records into that resolver's inputs.
 */
export function resolveHomepageDocument(input: HomepageResolutionInput): ResolvedHomepage {
  return resolveSharedHomepageDocument({
    document: input.document,
    stories: toHomepageStoryInputs(input.posts),
    publication: toHomepagePublicationInput(input.publication),
    sportsSchedule: {
      recentScores: input.sportsSchedule.recentScores.map((game) => toSportsResultView(game, input.publication)),
      upcomingGames: input.sportsSchedule.upcomingGames.map(toSportsFixtureView)
    }
  });
}
