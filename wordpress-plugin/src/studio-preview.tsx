import apiFetch from "@wordpress/api-fetch";
import { useEffect, useState } from "@wordpress/element";
import {
  PollCard,
  ThisWeekCard,
  packageHeadingId,
  getBriefPackageRenderer,
  getLeadPackageRenderer,
  getInFocusPackageRenderer,
  getMorePackageRenderer,
  getNewsletterPackageRenderer,
  getOpinionPackageRenderer,
  getSpecialCoveragePackageRenderer,
  getSportsPackageRenderer,
  type AthleteSpotlightView,
  type CalendarEntryView,
  type ResolvedLeadPackage,
  type ResolvedBriefPackage,
  type ResolvedInFocusPackage,
  type ResolvedMorePackage,
  type ResolvedNewsletterPackage,
  type ResolvedOpinionPackage,
  type ResolvedSpecialCoveragePackage,
  type MoreUtilityLinkView,
  type ResolvedSportsPackage,
  type SportsFixtureView,
  type SportsResultView,
  type StoryView
} from "@byline/ui";
import {
  parseBriefPackageProps,
  parseInFocusPackageProps,
  parseLeadPackageProps,
  parseMorePackageProps,
  parseNewsletterPackageProps,
  parseOpinionPackageProps,
  parseSportsPackageProps,
  parseSpecialCoveragePackageProps,
  type BylineStorySource,
  type BriefPackageProps,
  type InFocusPackageProps,
  type LeadPackageProps,
  type MorePackageProps,
  type NewsletterPackageProps,
  type OpinionPackageProps,
  type SpecialCoveragePackageProps,
  type SportsPackageProps
} from "@byline/design";

// Studio's preview data.
//
// Production resolves this during the static export from the full post list;
// Studio resolves it here from the authenticated WordPress REST API. The
// transports differ deliberately -- what must not differ is the resolved model
// or the renderer, so both sides produce a ResolvedLeadPackage and hand it to
// the same component.
type PreviewPost = {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  link: string;
  sticky?: boolean;
  categories?: number[];
  tags?: number[];
  author?: number;
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string; alt_text?: string; media_details?: { width?: number; height?: number } }>;
    "wp:term"?: Array<Array<{ id?: number; taxonomy: string; name: string; slug: string }>>;
    author?: Array<{ name: string; link: string }>;
  };
};

function decodeEntities(value: string) {
  if (typeof document === "undefined") return value;

  const element = document.createElement("textarea");
  element.innerHTML = value;

  return element.value;
}

function stripTags(value: string) {
  let text = "";
  let insideTag = false;

  for (const character of value) {
    if (character === "<") insideTag = true;
    else if (character === ">") insideTag = false;
    else if (!insideTag) text += character;
  }

  return text.replace(/\s+/g, " ").trim();
}

// The Studio-side equivalent of lib/homepage-packages.toStoryView. It reads the
// REST shape rather than the build-time shape, and produces the identical view
// model.
function toStoryView(post: PreviewPost): StoryView {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  const category = post._embedded?.["wp:term"]?.flat().find((term) => term?.taxonomy === "category") ?? null;
  const author = post._embedded?.author?.[0] ?? null;
  const path = (() => {
    try {
      return new URL(post.link).pathname;
    } catch {
      return post.link;
    }
  })();

  return {
    id: post.id,
    title: decodeEntities(stripTags(post.title.rendered)),
    href: path,
    deck: post.excerpt.rendered.trim(),
    deckIsHtml: true,
    isoDate: post.date,
    displayDate: new Date(post.date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    }),
    readingTime: null,
    category: category ? { name: decodeEntities(category.name), href: `/category/${category.slug}/` } : null,
    author: author ? { name: author.name, href: null } : null,
    image: media?.source_url
      ? {
          src: media.source_url,
          alt: media.alt_text || "",
          width: media.media_details?.width ?? null,
          height: media.media_details?.height ?? null
        }
      : null,
    opinionTreatment: false
  };
}

// The sports endpoints' records, narrowed to the fields the preview resolver
// reads. Studio deliberately does not re-implement the production resolver's
// full fallback chain -- it only has to produce the same view models.
type PreviewGame = {
  id: number;
  title?: string;
  sportKey?: string;
  sport?: string;
  level?: string;
  opponent?: string;
  site?: string;
  startDate?: string;
  status?: string;
  recapUrl?: string;
  notes?: string;
  wildcatsScore?: number | null;
  opponentScore?: number | null;
  display?: {
    matchup?: string;
    date?: string;
    location?: string;
    status?: string;
    score?: string | null;
    sportLevel?: string;
    scoreboard?: {
      team?: { label?: string; score?: number | null };
      wildcats?: { label?: string; score?: number | null };
      opponent?: { label?: string; score?: number | null };
    };
  };
};

type PreviewData = {
  posts: PreviewPost[];
  events: CalendarEntryView[];
  recentScores: PreviewGame[];
  upcomingGames: PreviewGame[];
};

type PreviewSelection = {
  athleteSpotlightPost: PreviewPost | null;
  leadPost: PreviewPost | null;
  inFocusPost: PreviewPost | null;
  specialCoveragePosts: PreviewPost[];
  opinionPosts: PreviewPost[];
  fieldPosts: PreviewPost[];
  morePosts: PreviewPost[];
  rightNowPosts: PreviewPost[];
  briefPosts: PreviewPost[];
};

let previewRequest: Promise<PreviewData> | null = null;

// Fetched once per Studio session and shared by every preview render, so
// dragging a package around does not re-query WordPress.
function loadPreviewData(): Promise<PreviewData> {
  previewRequest ??= Promise.all([
    apiFetch<PreviewPost[]>({ path: "/wp/v2/posts?per_page=12&_embed=1&status=publish" }).catch(() => []),
    apiFetch<Array<Record<string, unknown>>>({ path: "/weekly-wildcat/v1/school-events?per_page=6" }).catch(() => []),
    apiFetch<PreviewGame[]>({ path: "/weekly-wildcat/v1/sports-games/recent?per_page=8" }).catch(() => []),
    apiFetch<PreviewGame[]>({ path: "/weekly-wildcat/v1/sports-games/upcoming?per_page=12" }).catch(() => [])
  ]).then(([posts, events, recentScores, upcomingGames]) => ({
    posts,
    recentScores,
    upcomingGames,
    events: events.slice(0, 6).map((event, index) => ({
      id: `event-${index}`,
      kind: "event" as const,
      label: String(event.eventType ?? "School Event"),
      title: String(event.title ?? ""),
      date: String((event.display as Record<string, unknown>)?.date ?? ""),
      location: String(event.location ?? ""),
      href: ""
    }))
  }));

  return previewRequest;
}

function previewHasCategory(post: PreviewPost, slug: string) {
  return Boolean(post._embedded?.["wp:term"]?.flat().some((term) => term.taxonomy === "category" && term.slug === slug));
}

function previewHasTag(post: PreviewPost, slug: string) {
  return Boolean(post._embedded?.["wp:term"]?.flat().some((term) => term.taxonomy === "post_tag" && term.slug === slug));
}

function resolvePreviewSelection(data: PreviewData): PreviewSelection {
  const used = new Set<number>();
  const take = (count: number, predicate: (post: PreviewPost) => boolean) => {
    const result: PreviewPost[] = [];

    for (const post of data.posts) {
      if (used.has(post.id) || !predicate(post)) continue;
      used.add(post.id);
      result.push(post);
      if (result.length >= count) break;
    }

    return result;
  };
  const athleteSpotlightPost = data.posts.find((post) => previewHasTag(post, "athlete-of-the-week") || previewHasTag(post, "athlete-of-the-month")) ?? null;
  if (athleteSpotlightPost) used.add(athleteSpotlightPost.id);
  const leadPost = data.posts.find((post) => post.sticky && !used.has(post.id)) ?? data.posts.find((post) => !used.has(post.id)) ?? null;
  if (leadPost) used.add(leadPost.id);

  const inFocusPost = take(1, (post) => Boolean(post._embedded?.["wp:featuredmedia"]?.length) && (previewHasCategory(post, "features") || previewHasCategory(post, "culture")))[0] ?? null;
  const specialCoveragePosts = take(3, (post) => previewHasTag(post, "special-coverage"));
  const opinionPosts = take(3, (post) => previewHasCategory(post, "opinion"));
  const fieldPosts = take(3, (post) => previewHasCategory(post, "sports"));
  const morePosts: PreviewPost[] = [];
  const oldFirstPosts = [...data.posts].reverse();

  for (const slug of ["news", "features", "culture", "opinion", "sports"]) {
    const post = oldFirstPosts.find((candidate) => !used.has(candidate.id) && previewHasCategory(candidate, slug));

    if (post) {
      morePosts.push(post);
      used.add(post.id);
    }

    if (morePosts.length === 4) break;
  }

  if (morePosts.length < 4) {
    for (const post of oldFirstPosts) {
      if (used.has(post.id)) continue;
      morePosts.push(post);
      used.add(post.id);
      if (morePosts.length === 4) break;
    }
  }
  const rightNowPosts = take(4, () => true);
  const briefPosts = take(4, () => true);

  return {
    athleteSpotlightPost,
    leadPost,
    inFocusPost,
    specialCoveragePosts,
    opinionPosts,
    fieldPosts,
    morePosts,
    rightNowPosts,
    briefPosts
  };
}

function previewManualStories(source: BylineStorySource, data: PreviewData) {
  if (source.type !== "manual") return null;
  const byId = new Map(data.posts.map((post) => [post.id, post]));

  return source.storyIds.flatMap((id) => {
    const post = byId.get(id);
    return post ? [post] : [];
  });
}

function previewSourceCandidates(source: BylineStorySource, data: PreviewData, selection: PreviewSelection) {
  if (source.type === "compatibility-lead") return selection.leadPost ? [selection.leadPost] : [];
  if (source.type === "compatibility-latest") return selection.rightNowPosts;
  if (source.type === "compatibility-brief") return selection.briefPosts;
  if (source.type === "compatibility-in-focus") return selection.inFocusPost ? [selection.inFocusPost] : [];
  if (source.type === "compatibility-special-coverage") return selection.specialCoveragePosts;
  if (source.type === "compatibility-opinion") return selection.opinionPosts;
  if (source.type === "compatibility-sports") return selection.fieldPosts;
  if (source.type === "compatibility-athlete") return selection.athleteSpotlightPost ? [selection.athleteSpotlightPost] : [];
  if (source.type === "compatibility-more") return selection.morePosts;
  if (source.type === "latest") return data.posts;
  if (source.type === "sticky") {
    const sticky = data.posts.filter((post) => post.sticky);
    const regular = data.posts.filter((post) => !post.sticky);
    return [...sticky, ...regular];
  }
  if (source.type === "section") return data.posts.filter((post) => previewHasCategory(post, source.slug));
  if (source.type === "category") return data.posts.filter((post) => post.categories?.includes(source.categoryId));
  if (source.type === "tag") return data.posts.filter((post) => post.tags?.includes(source.tagId));
  if (source.type === "author") return data.posts.filter((post) => post.author === source.authorId);
  return [];
}

function previewSelectStories(
  source: BylineStorySource,
  limit: number,
  data: PreviewData,
  selection: PreviewSelection,
  used: Set<number>
) {
  const manual = previewManualStories(source, data);
  const candidates = manual ?? previewSourceCandidates(source, data, selection);
  const selected: PreviewPost[] = [];

  for (const post of candidates) {
    if (!manual && used.has(post.id)) continue;
    if (selected.some((entry) => entry.id === post.id)) continue;
    selected.push(post);
    if (!manual) used.add(post.id);
    if (selected.length >= limit) break;
  }

  return selected;
}

// Mirrors resolveLeadPackage's selection rules for the preview's smaller post
// window: sticky-first lead, then the next unused stories for the rail.
function resolvePreviewLeadPackage(
  packageId: string,
  config: LeadPackageProps,
  data: PreviewData,
  features: { polls: boolean; events: boolean; sports: boolean },
  publicationShortName: string,
  calendarHeading: string
): ResolvedLeadPackage {
  const selection = resolvePreviewSelection(data);
  const used = new Set<number>();
  const manualLead = previewManualStories(config.lead.source, data)?.[0] ?? null;
  const lead = manualLead ?? (config.lead.source.type === "sticky" ? selection.leadPost : previewSelectStories(config.lead.source, 1, data, selection, used)[0] ?? null);
  if (lead) used.add(lead.id);
  const latest = previewSelectStories(config.latest.source, config.latest.limit, data, selection, used)
    .filter((post) => post.id !== lead?.id);

  return {
    packageId,
    mode: config.mode,
    lead: lead ? toStoryView(lead) : null,
    latest: {
      heading: config.latest.heading,
      stories: latest.map(toStoryView),
      showBylines: config.latest.showBylines
    },
    utility: {
      poll: config.utility.poll && features.polls,
      calendar: config.utility.calendar && (features.events || features.sports),
      calendarLimit: config.utility.calendarLimit,
      calendarHeading
    },
    presentation: { showDeck: config.presentation.showDeck, opinionTreatment: false },
    fallbackAuthorName: `${publicationShortName} Staff`,
    emptyMessage: "No published posts are available yet."
  };
}

export type LeadPackagePreviewProps = {
  props: unknown;
  theme: string;
  features: { polls: boolean; events: boolean; sports: boolean };
  publicationShortName: string;
  calendarHeading: string;
};

/**
 * Studio's lead package preview.
 *
 * There is no placeholder here: this mounts the same LeadPackage renderer the
 * static site uses, with real headlines, real images, real decks and the real
 * poll and calendar cards.
 */
export function LeadPackagePreview({
  props,
  theme,
  features,
  publicationShortName,
  calendarHeading
}: LeadPackagePreviewProps) {
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadPreviewData().then((loaded) => {
      if (!cancelled) setData(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const config = parseLeadPackageProps(props);

  if (!data) {
    return <p className="byline-preview-loading">Loading publication content…</p>;
  }

  const packageId = previewPackageId(props, "home-lead");
  const resolved = resolvePreviewLeadPackage(packageId, config, data, features, publicationShortName, calendarHeading);
  const Renderer = getLeadPackageRenderer(theme);

  return (
    <Renderer
      package={resolved}
      pollSlot={
        <PollCard headingId={packageHeadingId(`${packageId}-poll`, "homepage-poll-heading")}>
          <p className="homepage-poll-note">Live poll results appear on the published site.</p>
        </PollCard>
      }
      calendarSlot={
        <ThisWeekCard
          entries={data.events}
          heading={calendarHeading}
          scheduleHref="/sports/schedule/"
          headingId={packageHeadingId(`${packageId}-calendar`, "this-week-heading")}
        />
      }
    />
  );
}

// --- sports package ---------------------------------------------------------
//
// The Studio-side equivalents of lib/sports-packages. They read the REST shape
// rather than the build-time shape, and end at exactly the same view models, so
// the renderer below is the production renderer with no preview branch in it.

const SPORT_ICONS: Array<[string, string]> = [
  ["baseball", "mdi:baseball"],
  ["softball", "mdi:baseball"],
  ["basketball", "mdi:basketball"],
  ["football", "mdi:football"],
  ["soccer", "mdi:soccer"],
  ["volleyball", "mdi:volleyball"],
  ["tennis", "mdi:tennis-ball"],
  ["golf", "mdi:golf"],
  ["track", "mdi:run-fast"],
  ["cross country", "mdi:run-fast"],
  ["wrestling", "mdi:boxing-glove"],
  ["cheer", "mdi:bullhorn"],
  ["swim", "mdi:swim"]
];

function previewSportIcon(game: PreviewGame) {
  const sport = [game.sportKey, game.sport].filter(Boolean).join(" ").toLowerCase();

  return SPORT_ICONS.find(([needle]) => sport.includes(needle))?.[1] ?? "mdi:whistle";
}

function previewSportLabel(game: PreviewGame) {
  return game.display?.sportLevel || [game.sport, game.level].filter(Boolean).join(" · ") || "Sports";
}

function previewSiteLabel(game: PreviewGame) {
  if (game.site === "home") return "Home";
  if (game.site === "away") return "Away";
  if (game.site === "neutral") return "Neutral Site";

  return "";
}

function previewScore(score: number | null | undefined) {
  return score === null || score === undefined ? "—" : String(score);
}

function toSportsResultView(game: PreviewGame): SportsResultView {
  const scoreboard = game.display?.scoreboard;
  const teamLabel = scoreboard?.team?.label ?? scoreboard?.wildcats?.label ?? "Home";
  const teamScore = scoreboard?.team?.score ?? scoreboard?.wildcats?.score ?? game.wildcatsScore ?? null;
  const opponentLabel = game.opponent || scoreboard?.opponent?.label || "Opponent";
  const opponentScore = scoreboard?.opponent?.score ?? game.opponentScore ?? null;
  const decided = teamScore !== null && opponentScore !== null;

  return {
    id: game.id,
    sportLabel: previewSportLabel(game),
    iconName: previewSportIcon(game),
    matchup: game.display?.matchup || game.title || "",
    scoreLabel: game.display?.score || null,
    team: { label: teamLabel, score: previewScore(teamScore), isWinner: decided && teamScore > opponentScore },
    opponent: {
      label: opponentLabel,
      score: previewScore(opponentScore),
      isWinner: decided && opponentScore > teamScore
    },
    verdict: game.display?.score || game.display?.status || "Final",
    context: game.notes?.trim() || previewSiteLabel(game),
    recapHref: game.recapUrl || null
  };
}

function toSportsFixtureView(game: PreviewGame): SportsFixtureView {
  return {
    id: game.id,
    isoDate: game.startDate ?? "",
    displayDate: game.display?.date || game.startDate || "",
    siteLabel: previewSiteLabel(game),
    sportLabel: previewSportLabel(game),
    matchup: game.display?.matchup || game.title || "",
    location: game.display?.location || ""
  };
}

function toAthleteSpotlightView(post: PreviewPost): AthleteSpotlightView {
  const story = toStoryView(post);

  return {
    id: story.id,
    name: story.title.replace(/^athlete\s+of\s+the\s+(?:week|month)\s*:?\s*/i, "").trim(),
    href: story.href,
    eyebrow: /athlete of the month/i.test(story.title) ? "Athlete of the Month" : "Athlete of the Week",
    sport: story.category?.name ?? null,
    blurb: stripTags(story.deck) || null,
    image: story.image
  };
}

/**
 * Mirrors resolveSportsPackage's rules for the preview's smaller windows.
 *
 * The two things that must match production exactly are the capability
 * reconciliation -- a publication without the sports module gets no structured
 * modules, whatever the design asks for -- and the resolved model's shape.
 */
function resolvePreviewSportsPackage(
  packageId: string,
  config: SportsPackageProps,
  data: PreviewData,
  features: { polls: boolean; events: boolean; sports: boolean },
  publicationShortName: string
): ResolvedSportsPackage {
  const selection = resolvePreviewSelection(data);
  const used = new Set<number>();
  const stories = !features.sports || config.content === "schedule"
    ? []
    : previewSelectStories(config.stories.source, config.stories.limit, data, selection, used);

  const spotlightPost = !features.sports || config.content === "schedule"
    ? null
    : config.athleteSpotlight.enabled
    ? config.athleteSpotlight.source.type === "manual"
      ? (previewManualStories(config.athleteSpotlight.source, data)?.[0] ?? null)
      : selection.athleteSpotlightPost
    : null;

  const scoresEnabled = config.content !== "story" && config.scores.enabled && features.sports;
  const upcomingEnabled = config.content !== "story" && config.upcoming.enabled && features.sports;
  const results = scoresEnabled ? data.recentScores.slice(0, config.scores.limit).map(toSportsResultView) : [];
  const upcoming = upcomingEnabled ? data.upcomingGames.slice(0, config.upcoming.limit).map(toSportsFixtureView) : [];

  return {
    packageId,
    heading: config.heading,
    sectionLink: config.archiveLink.enabled ? { label: config.archiveLink.label, href: config.archiveLink.href } : null,
    lead: stories[0] ? toStoryView(stories[0]) : null,
    rail: stories.slice(1).map(toStoryView),
    athleteSpotlight:
      spotlightPost && !stories.some((story) => story.id === spotlightPost.id)
        ? toAthleteSpotlightView(spotlightPost)
        : null,
    schedule:
      results.length > 0 || upcoming.length > 0
        ? {
            panelHeading: "SCORES & SCHEDULE",
            scoresHeading: "Finals",
            upcomingHeading: "Upcoming",
            fullScheduleLink: { label: "FULL SCHEDULE →", href: "/sports/schedule/" },
            results,
            upcoming,
            emptyUpcomingMessage: "No upcoming games"
          }
        : null,
    presentation: {
      showDeck: config.presentation.showDeck,
      showBylines: config.presentation.showBylines,
      showReadLink: config.presentation.showReadLink
    },
    content: config.content,
    fallbackAuthorName: `${publicationShortName} Staff`
  };
}

export type SportsPackagePreviewProps = {
  props: unknown;
  theme: string;
  features: { polls: boolean; events: boolean; sports: boolean };
  publicationShortName: string;
};

/**
 * Studio's sports package preview.
 *
 * There is no placeholder here: this mounts the same SportsPackage renderer the
 * static site uses, with real headlines, real scores and real fixtures.
 */
export function SportsPackagePreview({
  props,
  theme,
  features,
  publicationShortName
}: SportsPackagePreviewProps) {
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadPreviewData().then((loaded) => {
      if (!cancelled) setData(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const config = parseSportsPackageProps(props);

  if (!data) {
    return <p className="byline-preview-loading">Loading publication content…</p>;
  }

  const resolved = resolvePreviewSportsPackage(
    previewPackageId(props, "home-sports"),
    config,
    data,
    features,
    publicationShortName
  );
  const Renderer = getSportsPackageRenderer(theme);

  // A package configured down to nothing renders nothing on the live site, so
  // the canvas says so rather than showing a card that will not exist.
  return (
    <>
      <Renderer package={resolved} />
      {!resolved.lead && resolved.rail.length === 0 && !resolved.athleteSpotlight && !resolved.schedule ? (
        <p className="byline-preview-loading">
          This package has nothing to show yet, so it will not appear on the published homepage.
        </p>
      ) : null}
    </>
  );
}

// --- remaining semantic package previews ----------------------------------

function usePreviewData() {
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPreviewData().then((loaded) => {
      if (!cancelled) setData(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}

function previewPackageId(props: unknown, fallback: string) {
  return props && typeof props === "object" && typeof (props as Record<string, unknown>).id === "string"
    ? (props as Record<string, unknown>).id as string
    : fallback;
}

function previewStoryViews(stories: PreviewPost[]) {
  // The REST preview does not need to reproduce the production sentence
  // cleaner to be useful, but it does preserve the resolved view-model shape.
  return stories.map((post) => toStoryView(post));
}

export type StoryPackagePreviewProps = {
  props: unknown;
  theme: string;
  features: { polls: boolean; events: boolean; sports: boolean; newsletter?: boolean };
  publicationShortName: string;
  calendarHeading: string;
};

export function BriefPackagePreview({ props, theme, publicationShortName }: StoryPackagePreviewProps) {
  const data = usePreviewData();
  if (!data) return <p className="byline-preview-loading">Loading publication content…</p>;

  const config = parseBriefPackageProps(props);
  const selection = resolvePreviewSelection(data);
  const selected = previewSelectStories(config.source, config.limit, data, selection, new Set());
  const resolved: ResolvedBriefPackage = {
    packageId: previewPackageId(props, "home-brief"),
    heading: config.heading,
    lead: selected[0] ? toStoryView(selected[0]) : null,
    rail: previewStoryViews(selected.slice(1)),
    presentation: config.presentation,
    fallbackAuthorName: `${publicationShortName} Staff`
  };
  const Renderer = getBriefPackageRenderer(theme);

  return <Renderer package={resolved} />;
}

export function InFocusPackagePreview({ props, theme, publicationShortName }: StoryPackagePreviewProps) {
  const data = usePreviewData();
  if (!data) return <p className="byline-preview-loading">Loading publication content…</p>;

  const config = parseInFocusPackageProps(props);
  const selection = resolvePreviewSelection(data);
  const selected = previewSelectStories(config.source, 1, data, selection, new Set());
  const resolved: ResolvedInFocusPackage = {
    packageId: previewPackageId(props, "home-in-focus"),
    heading: config.heading,
    story: selected[0] ? toStoryView(selected[0]) : null,
    presentation: config.presentation,
    fallbackAuthorName: `${publicationShortName} Staff`
  };
  const Renderer = getInFocusPackageRenderer(theme);

  return <Renderer package={resolved} />;
}

export function SpecialCoveragePackagePreview({ props, theme, publicationShortName }: StoryPackagePreviewProps) {
  const data = usePreviewData();
  if (!data) return <p className="byline-preview-loading">Loading publication content…</p>;

  const config = parseSpecialCoveragePackageProps(props);
  const selection = resolvePreviewSelection(data);
  const selected = previewSelectStories(config.source, config.limit, data, selection, new Set());
  const resolved: ResolvedSpecialCoveragePackage = {
    packageId: previewPackageId(props, "home-special-coverage"),
    heading: config.heading,
    stories: previewStoryViews(selected),
    leadPresentation: config.leadPresentation,
    supportingPresentation: config.supportingPresentation,
    fallbackAuthorName: `${publicationShortName} Staff`
  };
  const Renderer = getSpecialCoveragePackageRenderer(theme);

  return <Renderer package={resolved} />;
}

export function OpinionPackagePreview({ props, theme, publicationShortName }: StoryPackagePreviewProps) {
  const data = usePreviewData();
  if (!data) return <p className="byline-preview-loading">Loading publication content…</p>;

  const config = parseOpinionPackageProps(props);
  const selection = resolvePreviewSelection(data);
  const selected = previewSelectStories(config.source, config.limit, data, selection, new Set());
  const resolved: ResolvedOpinionPackage = {
    packageId: previewPackageId(props, "home-opinion"),
    heading: config.heading,
    description: config.description.replaceAll("{publication.shortName}", publicationShortName),
    archiveLink: config.archiveLink,
    lead: selected[0] ? toStoryView(selected[0]) : null,
    rail: previewStoryViews(selected.slice(1, 3)),
    presentation: config.presentation,
    fallbackAuthorName: `${publicationShortName} Staff`
  };
  const Renderer = getOpinionPackageRenderer(theme);

  return <Renderer package={resolved} />;
}

function previewUtilityLink(label: string, href: string, iconName: string): MoreUtilityLinkView {
  return { label, href, iconName };
}

export function MorePackagePreview({ props, theme, features, publicationShortName }: StoryPackagePreviewProps) {
  const data = usePreviewData();
  if (!data) return <p className="byline-preview-loading">Loading publication content…</p>;

  const config = parseMorePackageProps(props);
  const selection = resolvePreviewSelection(data);
  const selected = previewSelectStories(config.source, config.limit, data, selection, new Set());
  const utility = config.utility.enabled && (config.utility.joinStaff.enabled || config.utility.stayConnected.enabled)
    ? {
        enabled: true,
        publicationLabel: publicationShortName,
        joinStaff: {
          ...config.utility.joinStaff,
          links: [
            previewUtilityLink("Join the newsroom", "/join/", "ph:pencil-line"),
            previewUtilityLink("Meet the staff", "/authors/", "ph:users-three")
          ]
        },
        stayConnected: {
          ...config.utility.stayConnected,
          links: [
            previewUtilityLink("Contact", "#contact", "ph:envelope-simple"),
            ...(features.newsletter !== false ? [previewUtilityLink("Newsletter", "#home-newsletter", "ph:paper-plane-tilt")] : [])
          ]
        }
      }
    : null;
  const resolved: ResolvedMorePackage = {
    packageId: previewPackageId(props, "home-more"),
    heading: config.heading.replaceAll("{publication.shortName}", publicationShortName),
    archiveLink: config.archiveLink,
    lead: selected[0] ? toStoryView(selected[0]) : null,
    rail: previewStoryViews(selected.slice(1, 4)),
    presentation: config.presentation,
    utility,
    fallbackAuthorName: `${publicationShortName} Staff`
  };
  const Renderer = getMorePackageRenderer(theme);

  return <Renderer package={resolved} />;
}

export function NewsletterPackagePreview({ props, theme, features, publicationShortName }: StoryPackagePreviewProps) {
  const config = parseNewsletterPackageProps(props);
  const resolved: ResolvedNewsletterPackage = {
    packageId: previewPackageId(props, "home-newsletter"),
    enabled: features.newsletter !== false,
    label: config.label,
    heading: config.heading.replaceAll("{publication.shortName}", publicationShortName),
    presentation: config.presentation
  };
  const Renderer = getNewsletterPackageRenderer(theme);

  // This is intentionally a non-submitting preview surface. The published
  // renderer receives the real signup form from the host; Studio never embeds
  // a production endpoint or a client submission flow in the canvas.
  return (
    <Renderer package={resolved} formSlot={
      <div className="byline-preview-newsletter-surface">
        {config.presentation.showLabel ? <p>{config.label}</p> : null}
        <h3>{config.heading}</h3>
        <span>{publicationShortName} newsletter signup preview</span>
      </div>
    } />
  );
}
