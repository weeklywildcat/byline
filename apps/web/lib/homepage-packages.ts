import {
  parseBriefPackageProps,
  parseInFocusPackageProps,
  parseMorePackageProps,
  parseNewsletterPackageProps,
  parseOpinionPackageProps,
  parseSpecialCoveragePackageProps,
  parseLeadPackageProps,
  type BriefPackageProps,
  type BylineStorySource,
  type InFocusPackageProps,
  type MorePackageProps,
  type NewsletterPackageProps,
  type OpinionPackageProps,
  type SpecialCoveragePackageProps,
  type LeadPackageProps
} from "@byline/design";
import type {
  CalendarEntryView,
  ResolvedBriefPackage,
  ResolvedInFocusPackage,
  ResolvedLeadPackage,
  ResolvedMorePackage,
  ResolvedNewsletterPackage,
  ResolvedOpinionPackage,
  ResolvedSpecialCoveragePackage,
  StoryView,
  MoreUtilityLinkView
} from "@byline/ui";
import type { BylinePublicationConfig } from "@byline/core";
import { getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import { hasCategory, resolveWeeklyWildcatHomepage } from "@/lib/homepage-selection";
import { getPublicationConfig } from "@/lib/publication";
import {
  getAuthorHref,
  getFeaturedMedia,
  getPostAuthor,
  getPostHref,
  getPostSettings,
  type WordPressPost
} from "@/lib/wordpress";

// Turns CMS records into the presentation-neutral view models the shared
// renderers consume. Everything WordPress-shaped stops here.

function getCleanDeck(post: WordPressPost) {
  const text = stripHtml(post.content.rendered || post.excerpt.rendered)
    .replace(/\s*\[\s*(?:&hellip;|…|\.\.\.)\s*\]\s*$/i, "")
    .replace(/\s*(?:&hellip;|…|\.\.\.)\s*$/i, "")
    .trim();
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g);

  if (sentences?.length) return sentences.slice(0, 2).join(" ").trim();
  if (text.length <= 260) return text;

  const trimmed = text.slice(0, 260);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

function getReadingTime(post: WordPressPost) {
  const words = stripHtml(post.content.rendered || post.excerpt.rendered).split(/\s+/).filter(Boolean).length;

  return `${Math.max(1, Math.ceil(words / 225))} min read`;
}

export type StoryViewOptions = {
  cleanDeck?: boolean;
  includeReadingTime?: boolean;
  opinionTreatment?: boolean;
};

export function toStoryView(post: WordPressPost, options: StoryViewOptions = {}): StoryView {
  const author = getPostAuthor(post);
  const category = getPrimaryVisibleCategory(post);
  const image = getFeaturedMedia(post);
  const cleanDeck = options.cleanDeck ?? false;

  return {
    id: post.id,
    title: stripHtml(post.title.rendered),
    href: getPostHref(post),
    deck: cleanDeck ? getCleanDeck(post) : post.excerpt.rendered.trim(),
    deckIsHtml: !cleanDeck,
    isoDate: post.date,
    displayDate: formatDisplayDate(post.date),
    readingTime: options.includeReadingTime ? getReadingTime(post) : null,
    category: category ? { name: decodeHtml(category.name), href: `/category/${category.slug}/` } : null,
    author: author ? { name: author.name, href: getAuthorHref(author) } : null,
    image: image?.source_url
      ? {
          src: image.source_url,
          alt: image.alt_text || stripHtml(image.title.rendered ?? ""),
          width: image.media_details?.width ?? null,
          height: image.media_details?.height ?? null
        }
      : null,
    opinionTreatment: options.opinionTreatment ?? false
  };
}

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

// --- lead package -----------------------------------------------------------

export type HomepageSelection = ReturnType<typeof resolveWeeklyWildcatHomepage>;

/**
 * The compatibility story-selection pass, wrapped so its role is explicit.
 *
 * `resolveWeeklyWildcatHomepage` is the pre-Studio ordered de-duplication
 * algorithm. It is required verbatim for byte-identical Weekly Wildcat output --
 * particularly The Latest, which is the eighth selection rather than a
 * layout-order one -- so it is deliberately not being rewritten.
 *
 * It is reached only through this function. When the package orchestrator takes
 * over ordering for every package, this is the single call site that has to be
 * replaced, and the algorithm can be absorbed rather than hunted for.
 *
 * `pinnedStoryIds` comes from `collectPinnedStoryIds`. Passing it here rather
 * than filtering inside each package keeps one used-story set: a pinned story is
 * withheld from every automatic selection, and the package that pinned it places
 * it explicitly.
 */
export function resolveCompatibilityHomepageSelection(
  posts: WordPressPost[],
  pinnedStoryIds?: ReadonlySet<number>
): HomepageSelection {
  return resolveWeeklyWildcatHomepage(posts, pinnedStoryIds);
}

function manualStories(source: BylineStorySource, posts: WordPressPost[]) {
  if (source.type !== "manual") return null;

  const byId = new Map(posts.map((post) => [post.id, post]));

  return source.storyIds.flatMap((id) => {
    const post = byId.get(id);

    return post ? [post] : [];
  });
}

export type LeadPackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  // The whole-page ordered pass. See the note below on why the lead package
  // consumes it rather than running its own queries.
  selection: HomepageSelection;
  features: { polls: boolean; events: boolean; sports: boolean };
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
  calendarHeading?: string;
};

/**
 * Resolves the lead package into the model the shared renderer consumes.
 *
 * On ordering: `The Latest` rail is not resolved in layout order. In the
 * pre-Studio homepage it is the eighth selection, taken from what is left after
 * In Focus, Special Coverage, Opinion, Sports and More have claimed their
 * stories. Resolving it immediately after the lead would pull different stories
 * into the rail -- a visible regression -- so this package consumes the existing
 * ordered pass instead of issuing its own queries. That keeps one de-duplication
 * algorithm rather than introducing a competing one.
 *
 * A manual source is an explicit editorial override and does take effect
 * immediately, because an editor who pinned a story means it.
 */
export function resolveLeadPackage(input: LeadPackageResolutionInput): ResolvedLeadPackage {
  const publication = input.publication ?? getPublicationConfig();
  const config: LeadPackageProps = parseLeadPackageProps(input.props);
  const compatibilitySelection = input.compatibilitySelection ?? true;
  const mode = config.mode ?? "content";
  const resolvesStories = mode === "content" || mode === "single-story";

  const usedStoryIds = new Set(input.usedStoryIds ?? []);
  const manualLead = resolvesStories ? manualStories(config.lead.source, input.posts)?.[0] ?? null : null;
  const leadCandidates = manualLead
    ? [manualLead]
    : compatibilitySelection && config.lead.source.type === "sticky"
      ? (input.selection.leadPost ? [input.selection.leadPost] : [])
      : sourceCandidates(config.lead.source, input.posts, input.selection, compatibilitySelection);
  const leadPost = resolvesStories
    ? manualLead ?? leadCandidates.find((post) => !usedStoryIds.has(post.id)) ?? null
    : null;

  if (leadPost) usedStoryIds.add(leadPost.id);

  const manualLatest = resolvesStories ? manualStories(config.latest.source, input.posts) : [];
  const latestCandidates = manualLatest ?? sourceCandidates(
    config.latest.source,
    input.posts,
    input.selection,
    compatibilitySelection
  );
  const latestPosts = (manualLatest
    ? latestCandidates
    : latestCandidates.filter((post) => !usedStoryIds.has(post.id)))
    .filter((post) => post.id !== leadPost?.id)
    .slice(0, config.latest.limit);

  const opinionTreatment =
    config.presentation.opinionTreatment === "auto" &&
    Boolean(leadPost && getPostSettings(leadPost)?.homepageOpinionTreatment);

  return {
    packageId: input.packageId,
    mode,
    ...(config.heading ? { heading: config.heading } : {}),
    lead: leadPost ? toStoryView(leadPost, { opinionTreatment }) : null,
    latest: {
      heading: config.latest.heading,
      stories: latestPosts.map((post) => toStoryView(post)),
      showBylines: config.latest.showBylines
    },
    utility: {
      // A design cannot switch on a module the publication has disabled.
      poll: config.utility.poll && input.features.polls,
      calendar: config.utility.calendar && (input.features.events || input.features.sports),
      calendarLimit: config.utility.calendarLimit,
      calendarHeading: input.calendarHeading ?? (publication.appearance.theme === "weekly-wildcat"
        ? "At NSHS"
        : `At ${publication.identity.organizationName}`)
    },
    presentation: {
      showDeck: config.presentation.showDeck,
      opinionTreatment
    },
    fallbackAuthorName: `${publication.identity.shortName} Staff`,
    emptyMessage: "No published posts are available yet."
  };
}

// --- shared story-source resolution ----------------------------------------

type CompatibilitySourceType =
  | "compatibility-lead"
  | "compatibility-latest"
  | "compatibility-brief"
  | "compatibility-in-focus"
  | "compatibility-special-coverage"
  | "compatibility-opinion"
  | "compatibility-sports"
  | "compatibility-athlete"
  | "compatibility-more";

function isCompatibilitySource(source: BylineStorySource): source is BylineStorySource & { type: CompatibilitySourceType } {
  return typeof source.type === "string" && source.type.startsWith("compatibility-");
}

export function sourceCandidates(
  source: BylineStorySource,
  posts: WordPressPost[],
  selection: HomepageSelection,
  useCompatibilitySelection: boolean
) {
  if (useCompatibilitySelection && isCompatibilitySource(source)) {
    switch (source.type) {
      case "compatibility-lead": return selection.leadPost ? [selection.leadPost] : [];
      case "compatibility-latest": return selection.rightNowPosts;
      case "compatibility-brief": return selection.briefPosts;
      case "compatibility-in-focus": return selection.inFocusPost ? [selection.inFocusPost] : [];
      case "compatibility-special-coverage": return selection.specialCoveragePosts;
      case "compatibility-opinion": return selection.opinionPosts;
      case "compatibility-sports": return selection.fieldPosts;
      case "compatibility-athlete": return selection.athleteSpotlightPost ? [selection.athleteSpotlightPost] : [];
      case "compatibility-more": return selection.morePosts;
    }
  }

  switch (source.type) {
    case "latest":
      return posts;
    case "sticky": {
      const sticky = posts.filter((post) => post.sticky);
      const regular = posts.filter((post) => !post.sticky);
      return [...sticky, ...regular];
    }
    case "section":
      return posts.filter((post) => hasCategory(post, [source.slug]));
    case "category":
      return posts.filter((post) => post.categories.includes(source.categoryId));
    case "tag":
      return posts.filter((post) => post.tags.includes(source.tagId));
    case "author":
      return posts.filter((post) => post.author === source.authorId);
    case "manual":
      return manualStories(source, posts) ?? [];
    case "compatibility-lead":
    case "compatibility-latest":
    case "compatibility-brief":
    case "compatibility-in-focus":
    case "compatibility-special-coverage":
    case "compatibility-opinion":
    case "compatibility-sports":
    case "compatibility-athlete":
    case "compatibility-more":
      return [];
  }
}

export function availableStories(
  candidates: WordPressPost[],
  usedStoryIds: ReadonlySet<number>,
  limit: number
) {
  if (limit <= 0) return [];

  const selected: WordPressPost[] = [];

  for (const post of candidates) {
    if (usedStoryIds.has(post.id)) continue;
    selected.push(post);
    if (selected.length >= limit) break;
  }

  return selected;
}

function publicationText(value: string, publication: BylinePublicationConfig) {
  return value
    .replaceAll("{publication.shortName}", publication.identity.shortName)
    .replaceAll("{publication.name}", publication.identity.name)
    .replaceAll("{publication.organizationName}", publication.identity.organizationName);
}

function resolvedPublication(input: { publication?: BylinePublicationConfig }) {
  return input.publication ?? getPublicationConfig();
}

export type BriefPackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  selection: HomepageSelection;
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
};

export function resolveBriefPackage(input: BriefPackageResolutionInput): ResolvedBriefPackage {
  const publication = resolvedPublication(input);
  const config: BriefPackageProps = parseBriefPackageProps(input.props);
  const used = new Set(input.usedStoryIds ?? []);
  const posts = config.source.type === "manual"
    ? manualStories(config.source, input.posts) ?? []
    : availableStories(
        sourceCandidates(config.source, input.posts, input.selection, input.compatibilitySelection ?? false),
        used,
        config.limit
      );
  const selected = posts.slice(0, config.limit);

  return {
    packageId: input.packageId,
    heading: config.heading,
    lead: selected[0] ? toStoryView(selected[0]) : null,
    rail: selected.slice(1).map((post) => toStoryView(post)),
    presentation: config.presentation,
    fallbackAuthorName: `${publication.identity.shortName} Staff`
  };
}

export type InFocusPackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  selection: HomepageSelection;
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
};

export function resolveInFocusPackage(input: InFocusPackageResolutionInput): ResolvedInFocusPackage {
  const publication = resolvedPublication(input);
  const config: InFocusPackageProps = parseInFocusPackageProps(input.props);
  const used = new Set(input.usedStoryIds ?? []);
  const manual = config.source.type === "manual" ? manualStories(config.source, input.posts) : null;
  const candidates = manual ?? sourceCandidates(config.source, input.posts, input.selection, input.compatibilitySelection ?? false);
  const story = manual?.[0] ?? availableStories(candidates, used, 1)[0] ?? null;

  return {
    packageId: input.packageId,
    heading: config.heading,
    story: story ? toStoryView(story) : null,
    presentation: config.presentation,
    fallbackAuthorName: `${publication.identity.shortName} Staff`
  };
}

export type SpecialCoveragePackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  selection: HomepageSelection;
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
};

export function resolveSpecialCoveragePackage(
  input: SpecialCoveragePackageResolutionInput
): ResolvedSpecialCoveragePackage {
  const publication = resolvedPublication(input);
  const config: SpecialCoveragePackageProps = parseSpecialCoveragePackageProps(input.props);
  const used = new Set(input.usedStoryIds ?? []);
  const manual = config.source.type === "manual" ? manualStories(config.source, input.posts) : null;
  const candidates = manual ?? sourceCandidates(config.source, input.posts, input.selection, input.compatibilitySelection ?? false);
  const stories = manual ? manual.slice(0, config.limit) : availableStories(candidates, used, config.limit);

  return {
    packageId: input.packageId,
    heading: config.heading,
    stories: stories.map((post) => toStoryView(post)),
    leadPresentation: config.leadPresentation,
    supportingPresentation: config.supportingPresentation,
    fallbackAuthorName: `${publication.identity.shortName} Staff`
  };
}

export type OpinionPackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  selection: HomepageSelection;
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
};

export function resolveOpinionPackage(input: OpinionPackageResolutionInput): ResolvedOpinionPackage {
  const publication = resolvedPublication(input);
  const config: OpinionPackageProps = parseOpinionPackageProps(input.props);
  const used = new Set(input.usedStoryIds ?? []);
  const manual = config.source.type === "manual" ? manualStories(config.source, input.posts) : null;
  const candidates = manual ?? sourceCandidates(config.source, input.posts, input.selection, input.compatibilitySelection ?? false);
  const stories = (manual ? manual.slice(0, config.limit) : availableStories(candidates, used, config.limit));

  return {
    packageId: input.packageId,
    heading: config.heading,
    description: publicationText(config.description, publication),
    archiveLink: config.archiveLink,
    lead: stories[0] ? toStoryView(stories[0]) : null,
    rail: stories.slice(1).map((post) => toStoryView(post)),
    presentation: config.presentation,
    fallbackAuthorName: `${publication.identity.shortName} Staff`
  };
}

function utilityLink(label: string, href: string, iconName: string, external = false): MoreUtilityLinkView {
  return { label, href, iconName, ...(external ? { external: true } : {}) };
}

export type MorePackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  selection: HomepageSelection;
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
};

export function resolveMorePackage(input: MorePackageResolutionInput): ResolvedMorePackage {
  const publication = resolvedPublication(input);
  const config: MorePackageProps = parseMorePackageProps(input.props);
  const used = new Set(input.usedStoryIds ?? []);
  const manual = config.source.type === "manual" ? manualStories(config.source, input.posts) : null;
  const candidates = manual ?? sourceCandidates(config.source, input.posts, input.selection, input.compatibilitySelection ?? false);
  const stories = manual ? manual.slice(0, config.limit) : availableStories(candidates, used, config.limit);
  const utility = config.utility.enabled && (config.utility.joinStaff.enabled || config.utility.stayConnected.enabled)
    ? {
        enabled: true,
        publicationLabel: publication.identity.shortName,
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
            utilityLink("Contact", publication.urls.contact, "ph:envelope-simple"),
            ...(publication.features.newsletter
              ? [utilityLink("Newsletter", "#home-newsletter", "ph:paper-plane-tilt")]
              : [])
          ]
        }
      }
    : null;

  return {
    packageId: input.packageId,
    heading: publicationText(config.heading, publication),
    archiveLink: config.archiveLink,
    lead: stories[0] ? toStoryView(stories[0], { cleanDeck: config.presentation.cleanDeck }) : null,
    rail: stories.slice(1).map((post) => toStoryView(post, { cleanDeck: config.presentation.cleanDeck })),
    presentation: config.presentation,
    utility,
    fallbackAuthorName: `${publication.identity.shortName} Staff`
  };
}

export type NewsletterPackageResolutionInput = {
  packageId: string;
  props: unknown;
  features: { newsletter: boolean };
  publication?: BylinePublicationConfig;
};

export function resolveNewsletterPackage(input: NewsletterPackageResolutionInput): ResolvedNewsletterPackage {
  const publication = resolvedPublication(input);
  const config: NewsletterPackageProps = parseNewsletterPackageProps(input.props);

  return {
    packageId: input.packageId,
    enabled: input.features.newsletter,
    label: config.label,
    heading: publicationText(config.heading, publication),
    presentation: config.presentation
  };
}
