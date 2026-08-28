import { parseSportsPackageProps, type SportsPackageProps } from "@byline/design";
import {
  resolveSportsPackage as resolveSharedSportsPackage,
  type HomepagePackageResolutionContext,
  type HomepageStoryInput
} from "@byline/content";
import type {
  AthleteSpotlightView,
  ResolvedSportsPackage,
  SportsFixtureView,
  SportsResultView
} from "@byline/ui";
import { stripHtml } from "@/lib/format";
import type { SportsGame } from "@/lib/headless";
import type { HomepageSelection } from "@/lib/homepage-selection";
import { toHomepagePublicationInput, toHomepageStoryInputs } from "@/lib/homepage-story-input";
import type { BylinePublicationConfig } from "@byline/core";
import { getPublicationConfig } from "@/lib/publication";
import { toAthleteSpotlightView } from "@/lib/story-view";
import type { WordPressPost } from "@/lib/wordpress";

export { toAthleteSpotlightView };

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

// --- package ----------------------------------------------------------------

export type SportsPackageResolutionInput = {
  packageId: string;
  props: unknown;
  posts: WordPressPost[];
  // The whole-page ordered pass, produced by the canonical selection.
  selection: HomepageSelection;
  recentScores: SportsGame[];
  upcomingGames: SportsGame[];
  features: { sports: boolean };
  usedStoryIds?: ReadonlySet<number>;
  compatibilitySelection?: boolean;
  publication?: BylinePublicationConfig;
  stories?: HomepageStoryInput[];
};

/**
 * The build-time entry point into the canonical sports package resolver.
 *
 * Selection, athlete-spotlight reconciliation and capability reconciliation all
 * live in `@byline/content`. What happens here is the WordPress-shaped part:
 * structured sports records become `SportsResultView`/`SportsFixtureView`
 * before the shared resolver decides how many of them the reader sees.
 */
export function resolveSportsPackage(input: SportsPackageResolutionInput): ResolvedSportsPackage {
  const publication = input.publication ?? getPublicationConfig();
  const context: HomepagePackageResolutionContext = {
    stories: input.stories ?? toHomepageStoryInputs(input.posts),
    selection: input.selection,
    usedStoryIds: new Set(input.usedStoryIds ?? []),
    compatibilitySelection: input.compatibilitySelection ?? true,
    publication: (() => {
      const resolved = toHomepagePublicationInput(publication);

      return { ...resolved, features: { ...resolved.features, sports: input.features.sports } };
    })()
  };

  return resolveSharedSportsPackage(input.packageId, input.props, context, {
    recentScores: input.recentScores.map((game) => toSportsResultView(game, publication)),
    upcomingGames: input.upcomingGames.map(toSportsFixtureView)
  });
}

export type { SportsPackageProps };
