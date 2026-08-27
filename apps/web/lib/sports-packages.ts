import { parseSportsPackageProps, type SportsPackageProps } from "@byline/design";
import type {
  AthleteSpotlightView,
  ResolvedSportsPackage,
  SportsFixtureView,
  SportsResultView
} from "@byline/ui";
import { getAthleteSportLabel, getAthleteSpotlightLabel, isAthleteSpotlightPost } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import type { SportsGame } from "@/lib/headless";
import {
  availableStories,
  sourceCandidates,
  toStoryView,
  type HomepageSelection
} from "@/lib/homepage-packages";
import type { BylinePublicationConfig } from "@byline/core";
import { getPublicationConfig } from "@/lib/publication";
import { getFeaturedMedia, getPostHref, type WordPressPost } from "@/lib/wordpress";

// The sports package resolver.
//
// Two source domains meet here and nowhere else: WordPress stories, which arrive
// through the shared ordered selection pass, and the structured sports record,
// which arrives from the sports endpoints. Both are flattened into the
// presentation-neutral view models the shared renderers consume, so no renderer
// ever sees a WordPressPost or a SportsGame.

// --- structured sports records ----------------------------------------------
//
// Every function below is a verbatim move of the logic that lived in
// apps/web/components/SportsSchedulePanel.tsx. The behaviour is the
// compatibility baseline, including the awkward cases: a record with no score,
// no opponent, or a date the CMS could not format.

function getGameDate(game: SportsGame) {
  return game.display.date || game.startDate;
}

function getGameLocation(game: SportsGame) {
  return game.display.location || game.locationName || game.locationAddress || game.location;
}

function getSportLevel(game: SportsGame) {
  return game.display.sportLevel || [game.sport, game.level].filter(Boolean).join(" · ") || game.sportLabel || "Sports";
}

function getSportIconName(game: SportsGame) {
  const sport = [game.sportKey, game.sport, game.sportLabel, game.teamLabel].filter(Boolean).join(" ").toLowerCase();

  if (sport.includes("baseball")) return "mdi:baseball";
  if (sport.includes("softball")) return "mdi:baseball";
  if (sport.includes("basketball")) return "mdi:basketball";
  if (sport.includes("football")) return "mdi:football";
  if (sport.includes("soccer")) return "mdi:soccer";
  if (sport.includes("volleyball")) return "mdi:volleyball";
  if (sport.includes("tennis")) return "mdi:tennis-ball";
  if (sport.includes("golf")) return "mdi:golf";
  if (sport.includes("track") || sport.includes("cross country")) return "mdi:run-fast";
  if (sport.includes("wrestling")) return "mdi:boxing-glove";
  if (sport.includes("cheer")) return "mdi:bullhorn";
  if (sport.includes("swim")) return "mdi:swim";

  return "mdi:whistle";
}

function getSiteLabel(game: SportsGame) {
  if (game.site === "home") return "Home";
  if (game.site === "away") return "Away";
  if (game.site === "neutral") return "Neutral Site";

  return "";
}

function getSiteContext(game: SportsGame) {
  const siteLabel = getSiteLabel(game);

  if (!siteLabel) return "";
  if (game.status === "final") return siteLabel === "Away" ? "Road final" : `${siteLabel} final`;

  return `${siteLabel} game`;
}

function getEditorialContext(game: SportsGame) {
  const note = game.notes.trim();

  if (/\b(region|playoff|opener|opening|senior night|homecoming|tournament|scrimmage|rivalry|championship)\b/i.test(note)) {
    return note;
  }

  return getSiteContext(game);
}

function getGameOpponent(game: SportsGame) {
  return game.opponent || game.display.scoreboard?.opponent.label || "Opponent";
}

function getScoreboard(game: SportsGame, publication: BylinePublicationConfig = getPublicationConfig()) {
  const team = game.display.scoreboard?.team ??
    game.display.scoreboard?.wildcats ?? {
      label: publication.identity.shortName,
      score: game.teamScore ?? game.wildcatsScore
    };

  return {
    team,
    opponent: game.display.scoreboard?.opponent ?? { label: getGameOpponent(game), score: game.opponentScore }
  };
}

function getResultVerdict(game: SportsGame, publication: BylinePublicationConfig = getPublicationConfig()) {
  if (game.wildcatsScore === null || game.opponentScore === null) {
    return game.display.score ?? "";
  }
  if (game.wildcatsScore === game.opponentScore) {
    return "Final tied";
  }

  const homeTeam = getScoreboard(game, publication).team.label;
  const winner = game.wildcatsScore > game.opponentScore ? homeTeam : getGameOpponent(game);
  const margin = Math.abs(game.wildcatsScore - game.opponentScore);
  const verb = winner === homeTeam ? "win" : "wins";

  return `${winner} ${verb} by ${margin}`;
}

export function toSportsResultView(
  game: SportsGame,
  publication: BylinePublicationConfig = getPublicationConfig()
): SportsResultView {
  const scoreboard = getScoreboard(game, publication);
  const teamWon =
    game.wildcatsScore !== null && game.opponentScore !== null && game.wildcatsScore > game.opponentScore;
  const opponentWon =
    game.wildcatsScore !== null && game.opponentScore !== null && game.opponentScore > game.wildcatsScore;

  return {
    id: game.id,
    sportLabel: getSportLevel(game),
    iconName: getSportIconName(game),
    matchup: game.display.matchup || game.title,
    scoreLabel: game.display.score || null,
    // The em dash stands in for a missing score, so the renderer never has to
    // decide what "no score yet" looks like.
    team: {
      label: scoreboard.team.label,
      score: scoreboard.team.score === null || scoreboard.team.score === undefined ? "—" : String(scoreboard.team.score),
      isWinner: teamWon
    },
    opponent: {
      label: scoreboard.opponent.label,
      score:
        scoreboard.opponent.score === null || scoreboard.opponent.score === undefined
          ? "—"
          : String(scoreboard.opponent.score),
      isWinner: opponentWon
    },
    verdict: getResultVerdict(game, publication) || game.display.status || "Final",
    context: getEditorialContext(game),
    recapHref: game.recapUrl || null
  };
}

export function toSportsFixtureView(game: SportsGame): SportsFixtureView {
  return {
    id: game.id,
    isoDate: game.startDate,
    displayDate: getGameDate(game),
    siteLabel: getSiteLabel(game),
    sportLabel: getSportLevel(game),
    matchup: game.display.matchup || game.title,
    location: getGameLocation(game)
  };
}

// --- athlete spotlight ------------------------------------------------------
//
// Moved verbatim from apps/web/components/SportsAthleteFeature.tsx.

function getAthleteName(post: WordPressPost) {
  return stripHtml(post.title.rendered)
    .replace(/^athlete\s+of\s+the\s+(?:week|month)\s*:?\s*/i, "")
    .trim();
}

function getAthleteBlurb(post: WordPressPost) {
  const text = stripHtml(post.excerpt.rendered || post.content.rendered).replace(
    /\s*\[\s*(?:&hellip;|…|\.\.\.)\s*\]\s*$/i,
    ""
  );

  if (text.length <= 120) return text;

  const trimmed = text.slice(0, 120);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

export function toAthleteSpotlightView(post: WordPressPost): AthleteSpotlightView {
  const image = getFeaturedMedia(post);
  const blurb = getAthleteBlurb(post);

  return {
    id: post.id,
    name: getAthleteName(post),
    href: getPostHref(post),
    eyebrow: getAthleteSpotlightLabel(post),
    sport: getAthleteSportLabel(post),
    blurb: blurb || null,
    image: image?.source_url
      ? {
          src: image.source_url,
          alt: image.alt_text || stripHtml(image.title.rendered ?? ""),
          width: image.media_details?.width ?? null,
          height: image.media_details?.height ?? null
        }
      : null
  };
}

// --- package ----------------------------------------------------------------

function manualStories(storyIds: number[], posts: WordPressPost[]) {
  const byId = new Map(posts.map((post) => [post.id, post]));

  return storyIds.flatMap((id) => {
    const post = byId.get(id);

    return post ? [post] : [];
  });
}

export type SportsPackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  // The whole-page ordered pass. See the note below on why the sports package
  // consumes it rather than running its own queries.
  selection: HomepageSelection;
  recentScores: SportsGame[];
  upcomingGames: SportsGame[];
  features: { sports: boolean };
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
};

/**
 * Resolves the sports package into the model the shared renderers consume.
 *
 * On ordering: the sports stories are the sixth selection in the pre-Studio
 * homepage and the athlete spotlight is the first -- claimed ahead of the lead
 * story, so the spotlight never competes with the front page. Issuing an
 * independent "newest three in Sports" query here would take stories that In
 * Focus, Special Coverage and Opinion have already claimed, and would push
 * different stories into More, The Latest and The Brief. So, exactly as the lead
 * package does, an automatic source consumes the existing ordered pass rather
 * than introducing a second de-duplication algorithm.
 *
 * A manual source is an explicit editorial override and does take effect
 * immediately, because an editor who pinned a story means it. Manual stories are
 * still filtered against the rest of the selection so a pin cannot silently
 * duplicate a story another package is already showing.
 *
 * On capabilities: the package configuration is a request, not an authority. A
 * publication with the sports module switched off gets no structured modules at
 * all, whatever the design asks for. That reconciliation lives here so neither
 * renderer has to know what a feature flag is.
 */
export function resolveSportsPackage(input: SportsPackageResolutionInput): ResolvedSportsPackage {
  const publication = input.publication ?? getPublicationConfig();
  const config: SportsPackageProps = parseSportsPackageProps(input.props);
  const compatibilitySelection = input.compatibilitySelection ?? true;
  const usedStoryIds = new Set(input.usedStoryIds ?? []);
  const content = config.content;

  const manualStoryPosts = config.stories.source.type === "manual"
    ? manualStories(config.stories.source.storyIds, input.posts)
    : null;
  const selectedStories = content === "schedule" || !input.features.sports
    ? []
    : manualStoryPosts
      ? manualStoryPosts.slice(0, config.stories.limit)
      : availableStories(
          sourceCandidates(config.stories.source, input.posts, input.selection, compatibilitySelection),
          usedStoryIds,
          config.stories.limit
        );

  const spotlightPost = content === "schedule" || !input.features.sports
    ? null
    : config.athleteSpotlight.enabled
    ? config.athleteSpotlight.source.type === "manual"
      ? (manualStories(config.athleteSpotlight.source.storyIds, input.posts)[0] ?? null)
      : config.athleteSpotlight.source.type === "athlete-spotlight"
        ? (() => {
            const candidate = compatibilitySelection
              ? input.selection.athleteSpotlightPost
              : input.posts.find(isAthleteSpotlightPost) ?? null;

            // A manual pin in another package reserves its story before the
            // ordered pass. The standing athlete convention must yield to that
            // explicit placement rather than duplicating it in Sports.
            return candidate && !usedStoryIds.has(candidate.id) ? candidate : null;
          })()
        : null
    : null;
  // A spotlight must never repeat a story this package is already showing.
  const athleteSpotlight =
    spotlightPost && !selectedStories.some((post) => post.id === spotlightPost.id)
      ? toAthleteSpotlightView(spotlightPost)
      : null;

  // Capability reconciliation: a design cannot switch on a module the
  // publication has disabled.
  const scoresEnabled = content !== "story" && config.scores.enabled && input.features.sports;
  const upcomingEnabled = content !== "story" && config.upcoming.enabled && input.features.sports;
  const results = scoresEnabled
    ? input.recentScores.slice(0, config.scores.limit).map((game) => toSportsResultView(game, publication))
    : [];
  const upcoming = upcomingEnabled ? input.upcomingGames.slice(0, config.upcoming.limit).map(toSportsFixtureView) : [];

  return {
    packageId: input.packageId,
    heading: config.heading,
    sectionLink: config.archiveLink.enabled
      ? { label: config.archiveLink.label, href: config.archiveLink.href }
      : null,
    // The sports lead runs a cleaned two-sentence deck rather than the raw
    // excerpt, which is why it resolves with different options than the rail.
    lead: selectedStories[0]
      ? toStoryView(selectedStories[0], { cleanDeck: config.presentation.cleanDeck ?? true })
      : null,
    rail: selectedStories.slice(1).map((post) => toStoryView(post)),
    athleteSpotlight,
    // No games and no modules means no panel -- never a placeholder scoreboard.
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
    content,
    fallbackAuthorName: `${publication.identity.shortName} Staff`
  };
}
