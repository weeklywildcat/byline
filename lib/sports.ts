import { getGameCenterHref, type SportsGame } from "@/lib/headless";
import { stripHtml } from "@/lib/format";
import { getPostCategories, getPostPrimaryGameId, getPostTags, type WordPressPost } from "@/lib/wordpress";

export type TeamSummary = {
  slug: string;
  sportKeys: string[];
  name: string;
  shortName: string;
  latestSeason: string;
  seasons: string[];
  games: SportsGame[];
};

export type SeasonSummary = {
  team: TeamSummary;
  year: string;
  games: SportsGame[];
  record: TeamRecord | null;
};

export type TeamRecord = {
  wins: number;
  losses: number;
  ties: number;
  finalsCounted: number;
};

export type SportMetadata = {
  family: string;
  label: string;
  icon: string;
  color: string;
};

const SPORT_METADATA: Record<string, SportMetadata> = {
  baseball: { family: "baseball", label: "Baseball", icon: "ph:baseball", color: "#8f3d2f" },
  basketball: { family: "basketball", label: "Basketball", icon: "ph:basketball", color: "#a6532c" },
  cheer: { family: "cheer", label: "Cheer", icon: "ph:star", color: "#9a4568" },
  "cross-country": { family: "cross-country", label: "Cross Country", icon: "ph:person-simple-run", color: "#4f6f52" },
  football: { family: "football", label: "Football", icon: "ph:football", color: "#6f4a2f" },
  golf: { family: "golf", label: "Golf", icon: "ph:flag-pennant", color: "#58734b" },
  soccer: { family: "soccer", label: "Soccer", icon: "ph:soccer-ball", color: "#386f7a" },
  softball: { family: "softball", label: "Softball", icon: "ph:baseball", color: "#7b5540" },
  "track-and-field": { family: "track-and-field", label: "Track and Field", icon: "ph:person-simple-run", color: "#5c5f83" },
  volleyball: { family: "volleyball", label: "Volleyball", icon: "ph:volleyball", color: "#8d4d58" },
  wrestling: { family: "wrestling", label: "Wrestling", icon: "ph:barbell", color: "#4f5f73" },
  sports: { family: "sports", label: "Sports", icon: "ph:trophy", color: "#7b1f2a" }
};

// Team and season archive URLs are derived from the existing sports game records.
// Varsity sport keys use the clean team hub slug, while JV/C-team keys remain
// complete identities such as football-jv or girls-basketball-jv.
function getSeasonFromDate(startDate: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}T/.exec(startDate);

  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return "";
  }

  const startYear = month >= 7 ? year : year - 1;

  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function getGameSeason(game: SportsGame) {
  return game.season || getSeasonFromDate(game.startDate);
}

export function getTeamSlug(game: SportsGame) {
  return (game.sportKey || game.sportLabel || game.sport || "").replace(/-varsity$/, "").toLowerCase();
}

export function getTeamName(game: SportsGame) {
  const label = game.sportLabel || [game.sport, game.level].filter(Boolean).join(" - ") || game.sportKey || "Sports";

  return label.replace(/\s+-\s+Varsity$/i, "").replace(/\s+-\s+/g, " ");
}

export function getTeamShortName(team: Pick<TeamSummary, "name">) {
  return team.name.replace(/\s+Varsity$/i, "");
}

export function getTeamHubHref(team: Pick<TeamSummary, "slug">) {
  return `/sports/${team.slug}/`;
}

export function getSeasonHref(team: Pick<TeamSummary, "slug">, year: string) {
  return `/sports/${team.slug}/${year}/`;
}

export function getTeamBySlug(teams: TeamSummary[], slug: string) {
  return teams.find((team) => team.slug === slug) ?? null;
}

export function getSeasonByTeamAndYear(teams: TeamSummary[], teamSlug: string, year: string) {
  const team = getTeamBySlug(teams, teamSlug);

  if (!team || !team.seasons.includes(year)) {
    return null;
  }

  const games = getTeamSeasonGames(team, year);

  return {
    team,
    year,
    games,
    record: calculateRecord(games)
  };
}

export function buildTeams(games: SportsGame[]) {
  const teams = new Map<string, TeamSummary>();

  games.forEach((game) => {
    const slug = getTeamSlug(game);
    const year = getGameSeason(game);

    if (!slug || !year) {
      return;
    }

    const current = teams.get(slug);

    if (current) {
      current.games.push(game);
      if (!current.sportKeys.includes(game.sportKey)) {
        current.sportKeys.push(game.sportKey);
      }
      if (!current.seasons.includes(year)) {
        current.seasons.push(year);
      }
      return;
    }

    const name = getTeamName(game);

    teams.set(slug, {
      slug,
      sportKeys: game.sportKey ? [game.sportKey] : [],
      name,
      shortName: name,
      latestSeason: year,
      seasons: [year],
      games: [game]
    });
  });

  return [...teams.values()]
    .map((team) => {
      const seasons = team.seasons.sort((left, right) => right.localeCompare(left));

      return {
        ...team,
        shortName: getTeamShortName(team),
        latestSeason: seasons[0] ?? "",
        seasons,
        games: team.games.sort(sortGamesDescending)
      };
    })
    .filter((team) => team.latestSeason)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function groupTeamsBySeason(teams: TeamSummary[]) {
  const seasonMap = new Map<string, TeamSummary[]>();

  teams.forEach((team) => {
    team.seasons.forEach((season) => {
      const seasonTeams = seasonMap.get(season) ?? [];
      seasonTeams.push(team);
      seasonMap.set(season, seasonTeams);
    });
  });

  return [...seasonMap.entries()]
    .map(([season, seasonTeams]) => ({
      season,
      teams: seasonTeams.sort((left, right) => left.name.localeCompare(right.name))
    }))
    .sort((left, right) => right.season.localeCompare(left.season));
}

export function groupTeamsByLatestSeason(teams: TeamSummary[]) {
  const seasonMap = new Map<string, TeamSummary[]>();

  teams.forEach((team) => {
    const seasonTeams = seasonMap.get(team.latestSeason) ?? [];
    seasonTeams.push(team);
    seasonMap.set(team.latestSeason, seasonTeams);
  });

  return [...seasonMap.entries()]
    .map(([season, seasonTeams]) => ({
      season,
      teams: seasonTeams.sort((left, right) => left.name.localeCompare(right.name))
    }))
    .sort((left, right) => right.season.localeCompare(left.season));
}

export function getTeamSeasonGames(team: TeamSummary, year: string) {
  return team.games.filter((game) => getGameSeason(game) === year).sort(sortGamesAscending);
}

export function getTeamLatestGames(team: TeamSummary, limit = 5) {
  return [...team.games]
    .sort((left, right) => {
      const leftUpcoming = left.status === "upcoming" ? 1 : 0;
      const rightUpcoming = right.status === "upcoming" ? 1 : 0;

      return rightUpcoming - leftUpcoming || sortGamesDescending(left, right);
    })
    .slice(0, limit);
}

function getSportFamily(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("baseball")) return "baseball";
  if (normalized.includes("basketball")) return "basketball";
  if (normalized.includes("cheer")) return "cheer";
  if (normalized.includes("cross-country") || normalized.includes("cross country")) return "cross-country";
  if (normalized.includes("football")) return "football";
  if (normalized.includes("golf")) return "golf";
  if (normalized.includes("soccer")) return "soccer";
  if (normalized.includes("softball")) return "softball";
  if (normalized.includes("track")) return "track-and-field";
  if (normalized.includes("volleyball")) return "volleyball";
  if (normalized.includes("wrestling")) return "wrestling";

  return "sports";
}

export function getSportMetadata(value: string) {
  return SPORT_METADATA[getSportFamily(value)] ?? SPORT_METADATA.sports;
}

export function getSportMetadataForGame(game: SportsGame) {
  return getSportMetadata([game.sportKey, game.sport, game.sportLabel, game.teamLabel].filter(Boolean).join(" "));
}

export function getSportMetadataForTeam(team: TeamSummary) {
  return getSportMetadata([team.slug, team.name, ...team.sportKeys].join(" "));
}

export function calculateRecord(games: SportsGame[]): TeamRecord | null {
  const finals = games.filter((game) => game.status === "final");

  if (finals.length === 0 || finals.some((game) => game.wildcatsScore === null || game.opponentScore === null)) {
    return null;
  }

  return finals.reduce<TeamRecord>(
    (record, game) => {
      record.finalsCounted += 1;

      if (Number(game.wildcatsScore) > Number(game.opponentScore)) {
        record.wins += 1;
      } else if (Number(game.wildcatsScore) < Number(game.opponentScore)) {
        record.losses += 1;
      } else {
        record.ties += 1;
      }

      return record;
    },
    { wins: 0, losses: 0, ties: 0, finalsCounted: 0 }
  );
}

export function formatRecord(record: TeamRecord | null) {
  if (!record) {
    return "";
  }

  return record.ties > 0 ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`;
}

export function getGameStatusLabel(game: SportsGame) {
  if (game.status === "final") return game.display.status || "Final";
  if (game.status === "upcoming") return game.display.status || "Upcoming";

  return game.display.status || game.status;
}

export function getGameSiteLabel(game: SportsGame) {
  if (game.site === "home") return "Home";
  if (game.site === "away") return "Away";
  if (game.site === "neutral") return "Neutral";

  return "";
}

export function getGameLocation(game: SportsGame) {
  return game.display.location || game.locationName || game.locationAddress || game.location;
}

function getNormalizedSportKey(game: SportsGame) {
  return [game.sportKey, game.sport, game.sportLabel, game.teamLabel].filter(Boolean).join(" ").toLowerCase();
}

export function getAssumedHomeVenue(game: SportsGame) {
  const sport = getNormalizedSportKey(game);

  if (sport.includes("baseball")) return "NSHS Baseball Field";
  if (sport.includes("softball")) return "NSHS Softball Field";
  if (sport.includes("basketball") || sport.includes("volleyball") || sport.includes("wrestling") || sport.includes("cheer")) {
    return "NSHS Gym";
  }
  if (sport.includes("football") || sport.includes("soccer") || sport.includes("track")) return "Wilson-Campbell Stadium";
  if (sport.includes("cross country")) return "Ninety Six High School";
  if (sport.includes("golf")) return "Home course";

  return "Ninety Six High School";
}

export function getScheduleLocationDisplay(game: SportsGame) {
  if (game.site === "home") {
    return {
      label: getGameLocation(game) || getAssumedHomeVenue(game),
      unconfirmed: false
    };
  }

  if (game.site === "away") {
    return {
      label: game.opponent || getGameLocation(game) || "Away site",
      unconfirmed: true
    };
  }

  if (game.site === "neutral") {
    return {
      label: getGameLocation(game) || game.opponent || "Neutral site",
      unconfirmed: !getGameLocation(game)
    };
  }

  return {
    label: getGameLocation(game) || "TBA",
    unconfirmed: false
  };
}

export function getGameScoreText(game: SportsGame) {
  if (game.status !== "final" || game.wildcatsScore === null || game.opponentScore === null) {
    return getGameStatusLabel(game);
  }

  return `${game.wildcatsScore}-${game.opponentScore}`;
}

export function getGameHref(game: SportsGame) {
  return getGameCenterHref(game);
}

export function getSportsCoverage(posts: WordPressPost[]) {
  return posts.filter((post) => getPostCategories(post).some((category) => category.slug === "sports"));
}

function normalizeSearchText(value: string) {
  return stripHtml(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function postSearchText(post: WordPressPost) {
  const tags = getPostTags(post).map((tag) => `${tag.slug} ${stripHtml(tag.name)}`);
  const categories = getPostCategories(post).map((category) => `${category.slug} ${stripHtml(category.name)}`);

  return normalizeSearchText([post.slug, post.title.rendered, post.excerpt.rendered, post.content.rendered, ...tags, ...categories].join(" "));
}

export function getRelatedSportsCoverage({
  posts,
  team,
  games,
  year,
  limit = 6
}: {
  posts: WordPressPost[];
  team: TeamSummary;
  games?: SportsGame[];
  year?: string;
  limit?: number;
}) {
  const gameIds = new Set((games ?? team.games).map((game) => game.id));
  const teamTerms = new Set(
    [team.slug, team.name, team.shortName, ...team.sportKeys]
      .flatMap((value) => normalizeSearchText(value).split(/\s+/))
      .filter((value) => value.length > 2)
  );

  return getSportsCoverage(posts)
    .map((post) => {
      const primaryGameId = getPostPrimaryGameId(post);
      const text = postSearchText(post);
      let score = primaryGameId && gameIds.has(primaryGameId) ? 20 : 0;

      teamTerms.forEach((term) => {
        if (text.includes(term)) {
          score += 2;
        }
      });

      if (year && text.includes(year)) {
        score += 1;
      }

      return { post, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.post.date).getTime() - new Date(left.post.date).getTime())
    .slice(0, limit)
    .map((result) => result.post);
}

export function sortGamesAscending(left: SportsGame, right: SportsGame) {
  return new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
}

export function sortGamesDescending(left: SportsGame, right: SportsGame) {
  return new Date(right.startDate).getTime() - new Date(left.startDate).getTime();
}
