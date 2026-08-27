import {
  parseLeadPackageProps,
  type BylineStorySource,
  type LeadPackageProps
} from "@byline/design";
import type { CalendarEntryView, ResolvedLeadPackage, StoryView } from "@byline/ui";
import { getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import { resolveWeeklyWildcatHomepage } from "@/lib/homepage-selection";
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
  const publication = getPublicationConfig();
  const config: LeadPackageProps = parseLeadPackageProps(input.props);

  const manualLead = manualStories(config.lead.source, input.posts)?.[0] ?? null;
  const leadPost = manualLead ?? input.selection.leadPost;

  const manualLatest = manualStories(config.latest.source, input.posts);
  const latestPosts = (manualLatest ?? input.selection.rightNowPosts)
    .filter((post) => post.id !== leadPost?.id)
    .slice(0, config.latest.limit);

  const opinionTreatment =
    config.presentation.opinionTreatment === "auto" &&
    Boolean(leadPost && getPostSettings(leadPost)?.homepageOpinionTreatment);

  return {
    packageId: input.packageId,
    lead: leadPost ? toStoryView(leadPost, { opinionTreatment }) : null,
    latest: {
      heading: config.latest.heading,
      stories: latestPosts.map((post) => toStoryView(post)),
      showBylines: config.latest.showBylines
    },
    utility: {
      // A design cannot switch on a module the publication has disabled.
      poll: config.utility.poll && input.features.polls,
      calendar: config.utility.calendar && (input.features.events || input.features.sports)
    },
    presentation: {
      showDeck: config.presentation.showDeck,
      opinionTreatment
    },
    fallbackAuthorName: `${publication.identity.shortName} Staff`,
    emptyMessage: "No published posts are available yet."
  };
}
