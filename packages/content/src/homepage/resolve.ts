import {
  BRIEF_PACKAGE_TYPE,
  IN_FOCUS_PACKAGE_TYPE,
  LEAD_PACKAGE_TYPE,
  MORE_PACKAGE_TYPE,
  NEWSLETTER_PACKAGE_TYPE,
  OPINION_PACKAGE_TYPE,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  collectPinnedStoryIds,
  parseBriefPackageProps,
  parseInFocusPackageProps,
  parseLeadPackageProps,
  parseMorePackageProps,
  parseNewsletterPackageProps,
  parseOpinionPackageProps,
  parseSpecialCoveragePackageProps,
  parseSportsPackageProps,
  type BylineDesignDocumentV2,
  type BylineStorySource
} from "@byline/design";
import type {
  MoreUtilityLinkView,
  ResolvedBriefPackage,
  ResolvedHomepagePackage,
  ResolvedInFocusPackage,
  ResolvedLeadPackage,
  ResolvedMorePackage,
  ResolvedNewsletterPackage,
  ResolvedOpinionPackage,
  ResolvedSpecialCoveragePackage,
  ResolvedSportsPackage,
  SportsFixtureView,
  SportsResultView
} from "@byline/ui";
import { publicationText, type HomepagePublicationInput } from "./publication";
import {
  resolveCompatibilityHomepageSelection,
  storyHasSection,
  type HomepageSelection
} from "./selection";
import { storyView, type HomepageStoryInput } from "./story";

// The canonical homepage resolver.
//
// There is exactly one homepage resolution pipeline, and it lives here. The
// static export and Studio both fetch their own data, adapt it into
// `HomepageStoryInput`, and call `resolveHomepageDocument`. Neither host is
// allowed to approximate this: a second selection algorithm is precisely what
// made Studio show duplicate stories and a Special Coverage section that
// production omits.

// --- story sources ---------------------------------------------------------

function manualStories(source: BylineStorySource, stories: readonly HomepageStoryInput[]) {
  if (source.type !== "manual") return null;

  const byId = new Map(stories.map((story) => [story.id, story]));

  return source.storyIds.flatMap((id) => {
    const story = byId.get(id);

    return story ? [story] : [];
  });
}

function isCompatibilitySource(source: BylineStorySource) {
  return typeof source.type === "string" && source.type.startsWith("compatibility-");
}

export function sourceCandidates(
  source: BylineStorySource,
  stories: readonly HomepageStoryInput[],
  selection: HomepageSelection,
  useCompatibilitySelection: boolean
): HomepageStoryInput[] {
  if (useCompatibilitySelection && isCompatibilitySource(source)) {
    switch (source.type) {
      case "compatibility-lead": return selection.leadStory ? [selection.leadStory] : [];
      case "compatibility-latest": return selection.latestStories;
      case "compatibility-brief": return selection.briefStories;
      case "compatibility-in-focus": return selection.inFocusStory ? [selection.inFocusStory] : [];
      case "compatibility-special-coverage": return selection.specialCoverageStories;
      case "compatibility-opinion": return selection.opinionStories;
      case "compatibility-sports": return selection.fieldStories;
      case "compatibility-athlete": return selection.athleteSpotlightStory ? [selection.athleteSpotlightStory] : [];
      case "compatibility-more": return selection.moreStories;
    }
  }

  switch (source.type) {
    case "latest":
      return [...stories];
    case "sticky": {
      const sticky = stories.filter((story) => story.sticky);
      const regular = stories.filter((story) => !story.sticky);

      return [...sticky, ...regular];
    }
    case "section":
      return stories.filter((story) => storyHasSection(story, [source.slug]));
    case "category":
      return stories.filter((story) => story.categoryIds.includes(source.categoryId));
    case "tag":
      return stories.filter((story) => story.tagIds.includes(source.tagId));
    case "author":
      return stories.filter((story) => story.authorId === source.authorId);
    case "manual":
      return manualStories(source, stories) ?? [];
    default:
      // A compatibility source in a publication that is not using the
      // compatibility pass resolves to nothing rather than silently becoming a
      // generic recent-stories feed.
      return [];
  }
}

export function availableStories(
  candidates: readonly HomepageStoryInput[],
  usedStoryIds: ReadonlySet<number>,
  limit: number
) {
  if (limit <= 0) return [];

  const selected: HomepageStoryInput[] = [];

  for (const story of candidates) {
    if (usedStoryIds.has(story.id)) continue;

    selected.push(story);
    if (selected.length >= limit) break;
  }

  return selected;
}

export type HomepagePackageResolutionContext = {
  stories: readonly HomepageStoryInput[];
  selection: HomepageSelection;
  usedStoryIds: ReadonlySet<number>;
  compatibilitySelection: boolean;
  publication: HomepagePublicationInput;
};

function selectStories(source: BylineStorySource, limit: number, context: HomepagePackageResolutionContext) {
  const manual = manualStories(source, context.stories);

  if (manual) return manual.slice(0, limit);

  return availableStories(
    sourceCandidates(source, context.stories, context.selection, context.compatibilitySelection),
    context.usedStoryIds,
    limit
  );
}

function fallbackAuthorName(publication: HomepagePublicationInput) {
  return `${publication.shortName} Staff`;
}

// --- package resolvers ------------------------------------------------------

export function resolveLeadPackage(
  packageId: string,
  props: unknown,
  context: HomepagePackageResolutionContext
): ResolvedLeadPackage {
  const config = parseLeadPackageProps(props);
  const mode = config.mode ?? "content";
  const resolvesStories = mode === "content" || mode === "single-story";
  const used = new Set(context.usedStoryIds);

  const manualLead = resolvesStories ? manualStories(config.lead.source, context.stories)?.[0] ?? null : null;
  const leadCandidates = manualLead
    ? [manualLead]
    : context.compatibilitySelection && config.lead.source.type === "sticky"
      ? (context.selection.leadStory ? [context.selection.leadStory] : [])
      : sourceCandidates(config.lead.source, context.stories, context.selection, context.compatibilitySelection);
  const leadStory = resolvesStories
    ? manualLead ?? leadCandidates.find((story) => !used.has(story.id)) ?? null
    : null;

  if (leadStory) used.add(leadStory.id);

  const manualLatest = resolvesStories ? manualStories(config.latest.source, context.stories) : [];
  const latestCandidates = manualLatest ?? sourceCandidates(
    config.latest.source,
    context.stories,
    context.selection,
    context.compatibilitySelection
  );
  const latestStories = (manualLatest ? latestCandidates : latestCandidates.filter((story) => !used.has(story.id)))
    .filter((story) => story.id !== leadStory?.id)
    .slice(0, config.latest.limit);

  return {
    packageId,
    mode,
    ...(config.heading ? { heading: config.heading } : {}),
    lead: leadStory ? storyView(leadStory) : null,
    latest: {
      heading: config.latest.heading,
      stories: latestStories.map((story) => storyView(story)),
      showBylines: config.latest.showBylines
    },
    utility: {
      // A design cannot switch on a module the publication has disabled.
      poll: config.utility.poll && context.publication.features.polls,
      calendar: config.utility.calendar
        && (context.publication.features.events || context.publication.features.sports),
      calendarLimit: config.utility.calendarLimit,
      calendarHeading: context.publication.calendarHeading
    },
    presentation: { showDeck: config.presentation.showDeck },
    fallbackAuthorName: fallbackAuthorName(context.publication),
    emptyMessage: "No published posts are available yet."
  };
}

export function resolveBriefPackage(
  packageId: string,
  props: unknown,
  context: HomepagePackageResolutionContext
): ResolvedBriefPackage {
  const config = parseBriefPackageProps(props);
  const selected = selectStories(config.source, config.limit, context);

  return {
    packageId,
    heading: config.heading,
    lead: selected[0] ? storyView(selected[0]) : null,
    rail: selected.slice(1).map((story) => storyView(story)),
    presentation: config.presentation,
    fallbackAuthorName: fallbackAuthorName(context.publication)
  };
}

export function resolveInFocusPackage(
  packageId: string,
  props: unknown,
  context: HomepagePackageResolutionContext
): ResolvedInFocusPackage {
  const config = parseInFocusPackageProps(props);
  const story = selectStories(config.source, 1, context)[0] ?? null;

  return {
    packageId,
    heading: config.heading,
    story: story ? storyView(story) : null,
    presentation: config.presentation,
    fallbackAuthorName: fallbackAuthorName(context.publication)
  };
}

export function resolveSpecialCoveragePackage(
  packageId: string,
  props: unknown,
  context: HomepagePackageResolutionContext
): ResolvedSpecialCoveragePackage {
  const config = parseSpecialCoveragePackageProps(props);
  const selected = selectStories(config.source, config.limit, context);

  return {
    packageId,
    heading: config.heading,
    stories: selected.map((story) => storyView(story)),
    leadPresentation: config.leadPresentation,
    supportingPresentation: config.supportingPresentation,
    fallbackAuthorName: fallbackAuthorName(context.publication)
  };
}

export function resolveOpinionPackage(
  packageId: string,
  props: unknown,
  context: HomepagePackageResolutionContext
): ResolvedOpinionPackage {
  const config = parseOpinionPackageProps(props);
  const selected = selectStories(config.source, config.limit, context);

  return {
    packageId,
    heading: config.heading,
    description: publicationText(config.description, context.publication),
    archiveLink: config.archiveLink,
    lead: selected[0] ? storyView(selected[0]) : null,
    rail: selected.slice(1).map((story) => storyView(story)),
    presentation: config.presentation,
    fallbackAuthorName: fallbackAuthorName(context.publication)
  };
}

function utilityLink(label: string, href: string, iconName: string, external = false): MoreUtilityLinkView {
  return { label, href, iconName, ...(external ? { external: true } : {}) };
}

export function resolveMorePackage(
  packageId: string,
  props: unknown,
  context: HomepagePackageResolutionContext
): ResolvedMorePackage {
  const config = parseMorePackageProps(props);
  const selected = selectStories(config.source, config.limit, context);
  const publication = context.publication;
  const utility = config.utility.enabled && (config.utility.joinStaff.enabled || config.utility.stayConnected.enabled)
    ? {
        enabled: true,
        publicationLabel: publication.shortName,
        joinStaff: {
          ...config.utility.joinStaff,
          links: [
            utilityLink("Join the newsroom", "/join/", "ph:pencil-line"),
            utilityLink("Meet the staff", "/authors/", "ph:users-three")
          ]
        },
        stayConnected: {
          ...config.utility.stayConnected,
          links: [
            ...publication.social.map((social) => utilityLink(social.label, social.url, `ph:${social.service}-logo`, true)),
            utilityLink("Contact", publication.contactHref, "ph:envelope-simple"),
            ...(publication.features.newsletter
              ? [utilityLink("Newsletter", "#home-newsletter", "ph:paper-plane-tilt")]
              : [])
          ]
        }
      }
    : null;

  return {
    packageId,
    heading: publicationText(config.heading, publication),
    archiveLink: config.archiveLink,
    lead: selected[0] ? storyView(selected[0], config.presentation.cleanDeck) : null,
    rail: selected.slice(1).map((story) => storyView(story, config.presentation.cleanDeck)),
    presentation: config.presentation,
    utility,
    fallbackAuthorName: fallbackAuthorName(publication)
  };
}

export function resolveNewsletterPackage(
  packageId: string,
  props: unknown,
  context: HomepagePackageResolutionContext
): ResolvedNewsletterPackage {
  const config = parseNewsletterPackageProps(props);

  return {
    packageId,
    enabled: context.publication.features.newsletter,
    label: config.label,
    heading: publicationText(config.heading, context.publication),
    presentation: config.presentation
  };
}

export type HomepageSportsSchedule = {
  // Already flattened by the host: the shared resolver owns how many of these
  // the reader sees, not how a CMS record becomes one.
  recentScores: readonly SportsResultView[];
  upcomingGames: readonly SportsFixtureView[];
};

export function resolveSportsPackage(
  packageId: string,
  props: unknown,
  context: HomepagePackageResolutionContext,
  schedule: HomepageSportsSchedule
): ResolvedSportsPackage {
  const config = parseSportsPackageProps(props);
  const content = config.content;
  const sportsEnabled = context.publication.features.sports;

  const selectedStories = content === "schedule" || !sportsEnabled
    ? []
    : selectStories(config.stories.source, config.stories.limit, context);

  const spotlightStory = content === "schedule" || !sportsEnabled || !config.athleteSpotlight.enabled
    ? null
    : config.athleteSpotlight.source.type === "manual"
      ? manualStories(config.athleteSpotlight.source, context.stories)?.[0] ?? null
      : (() => {
          const candidate = context.compatibilitySelection
            ? context.selection.athleteSpotlightStory
            : context.stories.find((story) => story.isAthleteSpotlight) ?? null;

          // A manual pin in another package reserves its story before the
          // ordered pass. The standing athlete convention must yield to that
          // explicit placement rather than duplicating it in Sports.
          return candidate && !context.usedStoryIds.has(candidate.id) ? candidate : null;
        })();

  const athleteSpotlight =
    spotlightStory
    && spotlightStory.athleteSpotlightView
    && !selectedStories.some((story) => story.id === spotlightStory.id)
      ? spotlightStory.athleteSpotlightView
      : null;

  // Capability reconciliation: a design cannot switch on a module the
  // publication has disabled.
  const scoresEnabled = content !== "story" && config.scores.enabled && sportsEnabled;
  const upcomingEnabled = content !== "story" && config.upcoming.enabled && sportsEnabled;
  const results = scoresEnabled ? schedule.recentScores.slice(0, config.scores.limit) : [];
  const upcoming = upcomingEnabled ? schedule.upcomingGames.slice(0, config.upcoming.limit) : [];

  return {
    packageId,
    heading: config.heading,
    sectionLink: config.archiveLink.enabled
      ? { label: config.archiveLink.label, href: config.archiveLink.href }
      : null,
    // The sports lead runs a cleaned two-sentence deck rather than the raw
    // excerpt, which is why it resolves differently from the rail.
    lead: selectedStories[0] ? storyView(selectedStories[0], config.presentation.cleanDeck ?? true) : null,
    rail: selectedStories.slice(1).map((story) => storyView(story)),
    athleteSpotlight,
    // No games and no modules means no panel -- never a placeholder scoreboard.
    schedule:
      results.length > 0 || upcoming.length > 0
        ? {
            panelHeading: "SCORES & SCHEDULE",
            scoresHeading: "Finals",
            upcomingHeading: "Upcoming",
            fullScheduleLink: { label: "FULL SCHEDULE →", href: "/sports/schedule/" },
            results: [...results],
            upcoming: [...upcoming],
            emptyUpcomingMessage: "No upcoming games"
          }
        : null,
    presentation: {
      showDeck: config.presentation.showDeck,
      showBylines: config.presentation.showBylines,
      showReadLink: config.presentation.showReadLink
    },
    content,
    fallbackAuthorName: fallbackAuthorName(context.publication)
  };
}

// --- document orchestration -------------------------------------------------

function addStoryIds(used: Set<number>, stories: Array<{ id: number } | null | undefined>) {
  for (const story of stories) {
    if (story) used.add(story.id);
  }
}

function claimResolvedStories(used: Set<number>, entry: ResolvedHomepagePackage) {
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

/**
 * True when a design uses any `compatibility-*` source.
 *
 * The historical ordered selection pass is only meaningful for a publication
 * whose design actually asks for those slots. A neutral publication's design
 * resolves its sources directly.
 */
export function documentUsesCompatibilitySelection(document: BylineDesignDocumentV2) {
  const contains = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(contains);
    if (!value || typeof value !== "object") return false;

    const record = value as Record<string, unknown>;
    if (typeof record.type === "string" && record.type.startsWith("compatibility-")) return true;

    return Object.values(record).some(contains);
  };

  return document.packages.some((entry) => contains(entry.props));
}

export type HomepageDocumentResolutionInput = {
  document: BylineDesignDocumentV2;
  stories: readonly HomepageStoryInput[];
  publication: HomepagePublicationInput;
  sportsSchedule: HomepageSportsSchedule;
};

export type ResolvedHomepageDocument = {
  packages: ResolvedHomepagePackage[];
};

/**
 * Resolves one complete design document in document order.
 *
 * This is the document-level operation the homepage has always been:
 *
 *   collect every manual pin -> reserve them globally -> run one ordered
 *   compatibility selection -> resolve packages against one page-wide used-story
 *   set -> return ordered resolved packages.
 *
 * Package resolvers stay focused on their own model; only this function owns
 * ordering and de-duplication, so no package can repeat another's story and
 * neither host can drift from the other.
 */
export function resolveHomepageDocument(input: HomepageDocumentResolutionInput): ResolvedHomepageDocument {
  const pinnedStoryIds = collectPinnedStoryIds(input.document);
  const selection = resolveCompatibilityHomepageSelection(input.stories, pinnedStoryIds);
  const compatibilitySelection = documentUsesCompatibilitySelection(input.document);
  const usedStoryIds = new Set(pinnedStoryIds);
  const resolved: ResolvedHomepagePackage[] = [];

  for (const entry of input.document.packages) {
    const context: HomepagePackageResolutionContext = {
      stories: input.stories,
      selection,
      usedStoryIds,
      compatibilitySelection,
      publication: input.publication
    };
    let resolvedEntry: ResolvedHomepagePackage;

    switch (entry.type) {
      case LEAD_PACKAGE_TYPE:
        resolvedEntry = { type: LEAD_PACKAGE_TYPE, package: resolveLeadPackage(entry.id, entry.props, context) };
        break;
      case BRIEF_PACKAGE_TYPE:
        resolvedEntry = { type: BRIEF_PACKAGE_TYPE, package: resolveBriefPackage(entry.id, entry.props, context) };
        break;
      case IN_FOCUS_PACKAGE_TYPE:
        resolvedEntry = { type: IN_FOCUS_PACKAGE_TYPE, package: resolveInFocusPackage(entry.id, entry.props, context) };
        break;
      case SPECIAL_COVERAGE_PACKAGE_TYPE:
        resolvedEntry = {
          type: SPECIAL_COVERAGE_PACKAGE_TYPE,
          package: resolveSpecialCoveragePackage(entry.id, entry.props, context)
        };
        break;
      case OPINION_PACKAGE_TYPE:
        resolvedEntry = { type: OPINION_PACKAGE_TYPE, package: resolveOpinionPackage(entry.id, entry.props, context) };
        break;
      case SPORTS_PACKAGE_TYPE:
        resolvedEntry = {
          type: SPORTS_PACKAGE_TYPE,
          package: resolveSportsPackage(entry.id, entry.props, context, input.sportsSchedule)
        };
        break;
      case MORE_PACKAGE_TYPE:
        resolvedEntry = { type: MORE_PACKAGE_TYPE, package: resolveMorePackage(entry.id, entry.props, context) };
        break;
      case NEWSLETTER_PACKAGE_TYPE:
        resolvedEntry = {
          type: NEWSLETTER_PACKAGE_TYPE,
          package: resolveNewsletterPackage(entry.id, entry.props, context)
        };
        break;
      default:
        continue;
    }

    resolved.push(resolvedEntry);
    claimResolvedStories(usedStoryIds, resolvedEntry);
  }

  return { packages: resolved };
}
