import {
  resolveBriefPackage as resolveSharedBriefPackage,
  resolveInFocusPackage as resolveSharedInFocusPackage,
  resolveLeadPackage as resolveSharedLeadPackage,
  resolveMorePackage as resolveSharedMorePackage,
  resolveNewsletterPackage as resolveSharedNewsletterPackage,
  resolveOpinionPackage as resolveSharedOpinionPackage,
  resolveSpecialCoveragePackage as resolveSharedSpecialCoveragePackage,
  availableStories as sharedAvailableStories,
  sourceCandidates as sharedSourceCandidates,
  type HomepagePackageResolutionContext,
  type HomepageStoryInput
} from "@byline/content";
import type {
  CalendarEntryView,
  ResolvedBriefPackage,
  ResolvedInFocusPackage,
  ResolvedLeadPackage,
  ResolvedMorePackage,
  ResolvedNewsletterPackage,
  ResolvedOpinionPackage,
  ResolvedSpecialCoveragePackage
} from "@byline/ui";
import type { BylinePublicationConfig } from "@byline/core";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import { hasCategory, resolveWeeklyWildcatHomepage, type HomepageSelection } from "@/lib/homepage-selection";
import { toHomepagePublicationInput, toHomepageStoryInputs } from "@/lib/homepage-story-input";
import { getPublicationConfig } from "@/lib/publication";
import type { WordPressPost } from "@/lib/wordpress";

// The build-time host's thin adapter over the canonical resolver.
//
// Story selection, de-duplication and package assembly all live in
// `@byline/content` so Studio runs the identical code. What remains here is the
// WordPress-shaped boundary: view models, the calendar merge, and per-package
// entry points the static site and its regression tests call directly.

export { toStoryView, toAthleteSpotlightView } from "@/lib/story-view";
export type { StoryViewOptions } from "@/lib/story-view";
export { sharedAvailableStories as availableStories, sharedSourceCandidates as sourceCandidates };
export type { HomepageSelection };

// --- calendar ---------------------------------------------------------------

const MAX_CALENDAR_ITEMS = 8;

function getSportLevel(game: SportsGame) {
  return game.display.sportLevel || [game.sportLabel || game.sport, game.level].filter(Boolean).join(" / ") || "Sports";
}

function formatEventType(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

// Moved out of ThisWeekCard: the week window and the event/game merge are
// resolution concerns, so the shared renderer receives a finished list.
export function toCalendarEntries(
  schoolEvents: SchoolEvent[],
  sportsGames: SportsGame[],
  limit = MAX_CALENDAR_ITEMS
): CalendarEntryView[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  const entries = [
    ...schoolEvents
      .filter((event) => event.status !== "canceled")
      .map((event) => ({
        id: `event-${event.id}`,
        kind: "event" as const,
        label: formatEventType(event.eventType) || "School Event",
        title: event.title,
        date: [event.display.date, event.display.time].filter(Boolean).join(" / "),
        location: event.location,
        href: event.externalUrl,
        sortKey: event.startDate
      })),
    ...sportsGames
      .filter((game) => game.status !== "canceled" && game.status !== "postponed")
      .map((game) => ({
        id: `game-${game.id}`,
        kind: "game" as const,
        label: getSportLevel(game),
        title: game.display.matchup || game.title,
        date: game.display.date || game.startDate,
        location: game.display.location || game.locationName || game.locationAddress || game.location || "",
        href: game.recapUrl || "/sports/schedule/",
        sortKey: game.startDate
      }))
  ].sort((left, right) => new Date(left.sortKey).getTime() - new Date(right.sortKey).getTime());

  const inWeek = entries.filter((entry) => {
    const time = new Date(entry.sortKey).getTime();

    return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
  });

  // The original component fell back to the full list when nothing fell inside
  // the week, so an off-season homepage still showed upcoming items.
  return (inWeek.length > 0 ? inWeek : entries).slice(0, limit).map(({ sortKey: _sortKey, ...entry }) => entry);
}

// --- shared selection -------------------------------------------------------

/**
 * The compatibility story-selection pass, wrapped so its role is explicit.
 *
 * The algorithm now lives in `@byline/content` and is the only one either host
 * runs. This remains the build-time entry point into it.
 *
 * `pinnedStoryIds` comes from `collectPinnedStoryIds`. Passing it here rather
 * than filtering inside each package keeps one used-story set: a pinned story
 * is withheld from every automatic selection, and the package that pinned it
 * places it explicitly.
 */
export function resolveCompatibilityHomepageSelection(
  posts: WordPressPost[],
  pinnedStoryIds?: ReadonlySet<number>
): HomepageSelection {
  return resolveWeeklyWildcatHomepage(posts, pinnedStoryIds);
}

export { hasCategory };

// --- per-package entry points ----------------------------------------------

type PackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  selection: HomepageSelection;
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
};

function resolutionContext(
  input: PackageResolutionInput & { calendarHeading?: string; stories?: HomepageStoryInput[] },
  compatibilityDefault: boolean
): HomepagePackageResolutionContext {
  return {
    stories: input.stories ?? toHomepageStoryInputs(input.posts),
    selection: input.selection,
    usedStoryIds: new Set(input.usedStoryIds ?? []),
    compatibilitySelection: input.compatibilitySelection ?? compatibilityDefault,
    publication: toHomepagePublicationInput(input.publication ?? getPublicationConfig(), input.calendarHeading)
  };
}

export type LeadPackageResolutionInput = PackageResolutionInput & {
  features: { polls: boolean; events: boolean; sports: boolean };
  calendarHeading?: string;
};

export function resolveLeadPackage(input: LeadPackageResolutionInput): ResolvedLeadPackage {
  const context = resolutionContext(input, true);

  return resolveSharedLeadPackage(input.packageId, input.props, {
    ...context,
    // The caller's feature view wins so a host can resolve a package against
    // module flags it has already reconciled.
    publication: {
      ...context.publication,
      features: { ...context.publication.features, ...input.features }
    }
  });
}

export type BriefPackageResolutionInput = PackageResolutionInput;

export function resolveBriefPackage(input: BriefPackageResolutionInput): ResolvedBriefPackage {
  return resolveSharedBriefPackage(input.packageId, input.props, resolutionContext(input, false));
}

export type InFocusPackageResolutionInput = PackageResolutionInput;

export function resolveInFocusPackage(input: InFocusPackageResolutionInput): ResolvedInFocusPackage {
  return resolveSharedInFocusPackage(input.packageId, input.props, resolutionContext(input, false));
}

export type SpecialCoveragePackageResolutionInput = PackageResolutionInput;

export function resolveSpecialCoveragePackage(
  input: SpecialCoveragePackageResolutionInput
): ResolvedSpecialCoveragePackage {
  return resolveSharedSpecialCoveragePackage(input.packageId, input.props, resolutionContext(input, false));
}

export type OpinionPackageResolutionInput = PackageResolutionInput;

export function resolveOpinionPackage(input: OpinionPackageResolutionInput): ResolvedOpinionPackage {
  return resolveSharedOpinionPackage(input.packageId, input.props, resolutionContext(input, false));
}

export type MorePackageResolutionInput = PackageResolutionInput;

export function resolveMorePackage(input: MorePackageResolutionInput): ResolvedMorePackage {
  return resolveSharedMorePackage(input.packageId, input.props, resolutionContext(input, false));
}

export type NewsletterPackageResolutionInput = {
  packageId: string;
  props: unknown;
  features: { newsletter: boolean };
  publication?: BylinePublicationConfig;
};

export function resolveNewsletterPackage(input: NewsletterPackageResolutionInput): ResolvedNewsletterPackage {
  const publication = toHomepagePublicationInput(input.publication ?? getPublicationConfig());

  return resolveSharedNewsletterPackage(input.packageId, input.props, {
    stories: [],
    selection: resolveWeeklyWildcatHomepage([]),
    usedStoryIds: new Set(),
    compatibilitySelection: false,
    publication: { ...publication, features: { ...publication.features, newsletter: input.features.newsletter } }
  });
}

export type { BylineStorySource } from "@byline/design";
