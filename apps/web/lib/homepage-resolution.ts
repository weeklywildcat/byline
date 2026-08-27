import {
  BRIEF_PACKAGE_TYPE,
  IN_FOCUS_PACKAGE_TYPE,
  LEAD_PACKAGE_TYPE,
  MORE_PACKAGE_TYPE,
  NEWSLETTER_PACKAGE_TYPE,
  OPINION_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  collectPinnedStoryIds,
  parseLeadPackageProps,
  parseSportsPackageProps,
  type BylineDesignDocumentV2,
} from "@byline/design";
import type { BylinePublicationConfig } from "@byline/core";
import type {
  ResolvedHomepagePackage,
  ResolvedLeadPackage,
  ResolvedSportsPackage
} from "@byline/ui";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import {
  resolveBriefPackage,
  resolveInFocusPackage,
  resolveLeadPackage,
  resolveMorePackage,
  resolveNewsletterPackage,
  resolveOpinionPackage,
  resolveSpecialCoveragePackage,
  resolveCompatibilityHomepageSelection
} from "@/lib/homepage-packages";
import { resolveSportsPackage } from "@/lib/sports-packages";
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

function documentUsesCompatibilitySelection(document: BylineDesignDocumentV2) {
  const contains = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(contains);
    if (!value || typeof value !== "object") return false;

    const record = value as Record<string, unknown>;
    if (typeof record.type === "string" && record.type.startsWith("compatibility-")) return true;

    return Object.values(record).some(contains);
  };

  return document.packages.some((entry) => contains(entry.props));
}

function addStoryIds(used: Set<number>, stories: Array<{ id: number } | null | undefined>) {
  for (const story of stories) {
    if (story) used.add(story.id);
  }
}

function addResolvedStoryIds(used: Set<number>, entry: ResolvedHomepagePackage) {
  switch (entry.type) {
    case LEAD_PACKAGE_TYPE:
      addStoryIds(used, [entry.package.lead, ...entry.package.latest.stories]);
      return;
    case BRIEF_PACKAGE_TYPE:
      addStoryIds(used, [entry.package.lead, ...entry.package.rail]);
      return;
    case IN_FOCUS_PACKAGE_TYPE:
      addStoryIds(used, [entry.package.story]);
      return;
    case SPECIAL_COVERAGE_PACKAGE_TYPE:
      addStoryIds(used, entry.package.stories);
      return;
    case OPINION_PACKAGE_TYPE:
      addStoryIds(used, [entry.package.lead, ...entry.package.rail]);
      return;
    case SPORTS_PACKAGE_TYPE:
      addStoryIds(used, [entry.package.lead, ...entry.package.rail, entry.package.athleteSpotlight]);
      return;
    case MORE_PACKAGE_TYPE:
      addStoryIds(used, [entry.package.lead, ...entry.package.rail]);
      return;
    case NEWSLETTER_PACKAGE_TYPE:
      return;
  }
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

export type ResolvedHomepage = {
  packages: ResolvedHomepagePackage[];
};

/**
 * Resolves one complete document in document order. Package resolvers remain
 * focused on their own models; this function owns the one page-wide pin and
 * automatic-story set so no package can accidentally repeat another package's
 * story.
 */
export function resolveHomepageDocument(input: HomepageResolutionInput): ResolvedHomepage {
  const pinnedStoryIds = collectPinnedStoryIds(input.document);
  const selection = resolveCompatibilityHomepageSelection(input.posts, pinnedStoryIds);
  const compatibilitySelection = documentUsesCompatibilitySelection(input.document);
  const usedStoryIds = pinnedStoryIds;
  const resolved: ResolvedHomepagePackage[] = [];

  for (const entry of input.document.packages) {
    let resolvedEntry: ResolvedHomepagePackage;

    switch (entry.type) {
      case LEAD_PACKAGE_TYPE: {
        const packageModel: ResolvedLeadPackage = resolveLeadPackage({
          packageId: entry.id,
          props: entry.props,
          posts: input.posts,
          selection,
          usedStoryIds,
          compatibilitySelection,
          publication: input.publication,
          features: {
            polls: input.publication.features.polls,
            events: input.publication.features.events,
            sports: input.publication.features.sports
          },
          calendarHeading: input.publication.appearance.theme === "weekly-wildcat"
            ? "At NSHS"
            : `At ${input.publication.identity.organizationName}`
        });
        resolvedEntry = { type: LEAD_PACKAGE_TYPE, package: packageModel };
        break;
      }
      case BRIEF_PACKAGE_TYPE:
        resolvedEntry = {
          type: BRIEF_PACKAGE_TYPE,
          package: resolveBriefPackage({
            packageId: entry.id,
            props: entry.props,
            posts: input.posts,
            selection,
            usedStoryIds,
            compatibilitySelection,
            publication: input.publication
          })
        };
        break;
      case IN_FOCUS_PACKAGE_TYPE:
        resolvedEntry = {
          type: IN_FOCUS_PACKAGE_TYPE,
          package: resolveInFocusPackage({
            packageId: entry.id,
            props: entry.props,
            posts: input.posts,
            selection,
            usedStoryIds,
            compatibilitySelection,
            publication: input.publication
          })
        };
        break;
      case SPECIAL_COVERAGE_PACKAGE_TYPE:
        resolvedEntry = {
          type: SPECIAL_COVERAGE_PACKAGE_TYPE,
          package: resolveSpecialCoveragePackage({
            packageId: entry.id,
            props: entry.props,
            posts: input.posts,
            selection,
            usedStoryIds,
            compatibilitySelection,
            publication: input.publication
          })
        };
        break;
      case OPINION_PACKAGE_TYPE:
        resolvedEntry = {
          type: OPINION_PACKAGE_TYPE,
          package: resolveOpinionPackage({
            packageId: entry.id,
            props: entry.props,
            posts: input.posts,
            selection,
            usedStoryIds,
            compatibilitySelection,
            publication: input.publication
          })
        };
        break;
      case SPORTS_PACKAGE_TYPE:
        {
          const packageModel: ResolvedSportsPackage = resolveSportsPackage({
            packageId: entry.id,
            props: entry.props,
            posts: input.posts,
            selection,
            usedStoryIds,
            compatibilitySelection,
            publication: input.publication,
            recentScores: input.sportsSchedule.recentScores,
            upcomingGames: input.sportsSchedule.upcomingGames,
            features: { sports: input.publication.features.sports }
          });
          resolvedEntry = { type: SPORTS_PACKAGE_TYPE, package: packageModel };
        }
        break;
      case MORE_PACKAGE_TYPE:
        resolvedEntry = {
          type: MORE_PACKAGE_TYPE,
          package: resolveMorePackage({
            packageId: entry.id,
            props: entry.props,
            posts: input.posts,
            selection,
            usedStoryIds,
            compatibilitySelection,
            publication: input.publication
          })
        };
        break;
      case NEWSLETTER_PACKAGE_TYPE:
        resolvedEntry = {
          type: NEWSLETTER_PACKAGE_TYPE,
          package: resolveNewsletterPackage({
            packageId: entry.id,
            props: entry.props,
            features: { newsletter: input.publication.features.newsletter },
            publication: input.publication
          })
        };
        break;
    }

    resolved.push(resolvedEntry);
    addResolvedStoryIds(usedStoryIds, resolvedEntry);
  }

  return { packages: resolved };
}
