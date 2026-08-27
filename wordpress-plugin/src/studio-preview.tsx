import apiFetch from "@wordpress/api-fetch";
import { useEffect, useState } from "@wordpress/element";
import {
  LeadPackage,
  PollCard,
  ThisWeekCard,
  getLeadPackageRenderer,
  getSportsPackageRenderer,
  type AthleteSpotlightView,
  type CalendarEntryView,
  type ResolvedLeadPackage,
  type ResolvedSportsPackage,
  type SportsFixtureView,
  type SportsResultView,
  type StoryView
} from "@byline/ui";
import {
  parseLeadPackageProps,
  parseSportsPackageProps,
  type LeadPackageProps,
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
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string; alt_text?: string; media_details?: { width?: number; height?: number } }>;
    "wp:term"?: Array<Array<{ taxonomy: string; name: string; slug: string }>>;
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

// Mirrors resolveLeadPackage's selection rules for the preview's smaller post
// window: sticky-first lead, then the next unused stories for the rail.
function resolvePreviewLeadPackage(
  config: LeadPackageProps,
  data: PreviewData,
  features: { polls: boolean; events: boolean; sports: boolean },
  publicationShortName: string
): ResolvedLeadPackage {
  const byId = new Map(data.posts.map((post) => [post.id, post]));
  const manualLead = config.lead.source.type === "manual" ? byId.get(config.lead.source.storyIds[0]) : undefined;
  const lead = manualLead ?? data.posts.find((post) => post.sticky) ?? data.posts[0] ?? null;

  const manualLatest =
    config.latest.source.type === "manual"
      ? config.latest.source.storyIds.flatMap((id) => {
          const post = byId.get(id);

          return post ? [post] : [];
        })
      : null;

  const latest = (manualLatest ?? data.posts)
    .filter((post) => post.id !== lead?.id)
    .slice(0, config.latest.limit);

  return {
    packageId: "home-lead",
    lead: lead ? toStoryView(lead) : null,
    latest: {
      heading: config.latest.heading,
      stories: latest.map(toStoryView),
      showBylines: config.latest.showBylines
    },
    utility: {
      poll: config.utility.poll && features.polls,
      calendar: config.utility.calendar && (features.events || features.sports)
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

  const resolved = resolvePreviewLeadPackage(config, data, features, publicationShortName);
  const Renderer = getLeadPackageRenderer(theme);

  return (
    <Renderer
      package={resolved}
      pollSlot={
        <PollCard>
          <p className="homepage-poll-note">Live poll results appear on the published site.</p>
        </PollCard>
      }
      calendarSlot={
        <ThisWeekCard entries={data.events} heading={calendarHeading} scheduleHref="/sports/schedule/" />
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
  config: SportsPackageProps,
  data: PreviewData,
  features: { polls: boolean; events: boolean; sports: boolean },
  publicationShortName: string
): ResolvedSportsPackage {
  const byId = new Map(data.posts.map((post) => [post.id, post]));
  const pinned = (storyIds: number[]) =>
    storyIds.flatMap((id) => {
      const post = byId.get(id);

      return post ? [post] : [];
    });

  const stories = (
    config.stories.source.type === "manual" ? pinned(config.stories.source.storyIds) : data.posts
  ).slice(0, config.stories.limit);

  const spotlightPost = config.athleteSpotlight.enabled
    ? config.athleteSpotlight.source.type === "manual"
      ? (pinned(config.athleteSpotlight.source.storyIds)[0] ?? null)
      : (data.posts.find((post) => !stories.some((story) => story.id === post.id)) ?? null)
    : null;

  const scoresEnabled = config.scores.enabled && features.sports;
  const upcomingEnabled = config.upcoming.enabled && features.sports;
  const results = scoresEnabled ? data.recentScores.slice(0, config.scores.limit).map(toSportsResultView) : [];
  const upcoming = upcomingEnabled ? data.upcomingGames.slice(0, config.upcoming.limit).map(toSportsFixtureView) : [];

  return {
    packageId: "home-sports",
    heading: config.heading,
    sectionLink: { label: "All Sports →", href: "/sports/" },
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
    presentation: { showDeck: config.presentation.showDeck, showBylines: config.presentation.showBylines },
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

  const resolved = resolvePreviewSportsPackage(config, data, features, publicationShortName);
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
