import { getGameCenterHref, type SportsGame, type SportsRoster, type SportsTeamMedia } from "@/lib/headless";
import { getPublicationConfig } from "@/lib/publication";
import { getPostCategories, getPostPrimaryGameId, type WordPressPost } from "@/lib/wordpress";
import { getGameSeason, normalizeSportsSeason } from "@/lib/sports-season";

export { getGameSeason, getSeasonFromDate, normalizeSportsSeason } from "@/lib/sports-season";

export type TeamSummary = {
  teamKey: string;
  slug: string;
  sportKeys: string[];
  name: string;
  shortName: string;
  active: boolean;
  team?: SportsTeamMedia;
  latestSeason: string;
  seasons: string[];
  games: SportsGame[];
  rosters: SportsRoster[];
};

export type SeasonSummary = {
  team: TeamSummary;
  year: string;
  games: SportsGame[];
  record: TeamRecord | null;
  roster: SportsRoster | null;
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

export function getGameTeamKey(game: Pick<SportsGame, "sportKey"> & { teamKey?: string }) {
  return (game.teamKey || game.sportKey || "").trim().toLowerCase();
}

function normalizeTeamSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function getTeamSlug(game: SportsGame) {
  return normalizeTeamSlug(game.teamSlug || game.team?.slug || getGameTeamKey(game) || game.sportLabel || game.sport || "");
}

export function getTeamName(game: SportsGame) {
  return game.team?.displayName || game.team?.label || game.sportLabel || [game.sport, game.level].filter(Boolean).join(" - ") || getGameTeamKey(game) || "Sports";
}

export function getRosterTeamSlug(roster: Pick<SportsRoster, "teamKey"> & { teamSlug?: string; team?: { slug?: string } }) {
  return normalizeTeamSlug(roster.teamSlug || roster.team?.slug || roster.teamKey);
}

export function getRosterTeamName(roster: SportsRoster) {
  const label = roster.team.displayName || roster.team.label || [roster.team.sport, roster.team.level].filter(Boolean).join(" - ") || roster.teamKey;

  return label;
}

export function getTeamShortName(team: Pick<TeamSummary, "name">) {
  return team.name;
}

export function getTeamHubHref(team: Pick<TeamSummary, "slug">) {
  return `/sports/${team.slug}/`;
}

export function getSeasonHref(team: Pick<TeamSummary, "slug">, year: string) {
  return `/sports/${team.slug}/${normalizeSportsSeason(year) || year}/`;
}

export function getTeamBySlug(teams: TeamSummary[], slug: string) {
  const normalizedSlug = normalizeTeamSlug(slug);

  return teams.find((team) => team.slug === normalizedSlug) ?? null;
}

export function getSeasonByTeamAndYear(teams: TeamSummary[], teamSlug: string, year: string) {
  const team = getTeamBySlug(teams, teamSlug);
  const normalizedYear = normalizeSportsSeason(year);

  if (!team || normalizedYear === "" || !team.seasons.includes(normalizedYear)) {
    return null;
  }

  const games = getTeamSeasonGames(team, normalizedYear);
  const roster = getTeamSeasonRoster(team, normalizedYear);

  return {
    team,
    year: normalizedYear,
    games,
    record: calculateRecord(games),
    roster
  };
}

export function buildTeams(games: SportsGame[], rosters: SportsRoster[] = [], teamRecords: SportsTeamMedia[] = []) {
  const teams = new Map<string, TeamSummary>();
  const recordsByKey = new Map(
    teamRecords
      .map((record) => [getGameTeamKey({ sportKey: record.teamKey || record.key }), record] as const)
      .filter(([key]) => key !== "")
  );

  const ensureTeam = (teamKey: string, source?: SportsGame | SportsRoster, record?: SportsTeamMedia) => {
    const key = teamKey.trim().toLowerCase();
    if (!key) return null;

    const existing = teams.get(key);
    const sourceName = source && "players" in source ? getRosterTeamName(source) : source ? getTeamName(source) : "Sports";
    const sourceSlug = source && "players" in source ? getRosterTeamSlug(source) : source ? getTeamSlug(source) : "";
    const canonicalName = record?.displayName || record?.label || existing?.team?.displayName || existing?.team?.label || sourceName || key;
    const canonicalSlug = normalizeTeamSlug(record?.slug || existing?.team?.slug || sourceSlug || key);

    if (existing) {
      existing.slug = canonicalSlug || existing.slug;
      existing.name = canonicalName || existing.name;
      existing.shortName = record?.shortName || existing.shortName || existing.name;
      existing.active = record?.active !== false && existing.active;
      if (record) existing.team = record;
      if (!existing.sportKeys.includes(key)) existing.sportKeys.push(key);
      return existing;
    }

    const team: TeamSummary = {
      teamKey: key,
      slug: canonicalSlug || key,
      sportKeys: [key],
      name: canonicalName,
      shortName: record?.shortName || canonicalName,
      active: record?.active !== false,
      team: record,
      latestSeason: "",
      seasons: [],
      games: [],
      rosters: []
    };
    teams.set(key, team);

    return team;
  };

  teamRecords.forEach((record) => {
    const team = ensureTeam(record.teamKey || record.key, undefined, record);
    if (!team) return;

    (record.seasons ?? []).forEach((season) => {
      const normalizedSeason = normalizeSportsSeason(season);
      if (normalizedSeason && !team.seasons.includes(normalizedSeason)) team.seasons.push(normalizedSeason);
    });

    const currentSeason = normalizeSportsSeason(record.currentSeason ?? "");
    if (team.active && team.seasons.length === 0 && currentSeason) {
      team.seasons.push(currentSeason);
    }
  });

  games.forEach((game) => {
    const team = ensureTeam(getGameTeamKey(game), game);
    const year = getGameSeason(game);
    if (!team || !year) return;

    team.games.push(game);
    if (!team.seasons.includes(year)) team.seasons.push(year);
  });

  rosters.forEach((roster) => {
    const record = recordsByKey.get(roster.teamKey.trim().toLowerCase());
    const team = ensureTeam(roster.teamKey, roster, record);
    const season = normalizeSportsSeason(roster.season);
    if (!team || !season) return;

    team.rosters.push(roster);
    if (!team.seasons.includes(season)) team.seasons.push(season);
  });

  return [...teams.values()]
    .map((team) => {
      const seasons = [...team.seasons].sort((left, right) => right.localeCompare(left));

      return {
        ...team,
        shortName: team.team?.shortName || getTeamShortName(team),
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
  const normalizedYear = normalizeSportsSeason(year);

  if (normalizedYear === "") return [];

  return team.games.filter((game) => getGameSeason(game) === normalizedYear).sort(sortGamesAscending);
}

export function getTeamSeasonRoster(team: TeamSummary, year: string) {
  const normalizedYear = normalizeSportsSeason(year);

  if (normalizedYear === "") {
    return null;
  }

  const matches = team.rosters.filter((roster) => normalizeSportsSeason(roster.season) === normalizedYear);

  return matches.length === 1 ? matches[0] : null;
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
  const finals = games.filter((game) => game.status === "final" || game.status === "tie");

  if (finals.length === 0 || finals.some((game) => game.wildcatsScore === null || game.opponentScore === null)) {
    return null;
  }

  return finals.reduce<TeamRecord>(
    (record, game) => {
      record.finalsCounted += 1;

      if (game.status === "tie") {
        record.ties += 1;
      } else if (Number(game.wildcatsScore) > Number(game.opponentScore)) {
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
  const publication = getPublicationConfig();

  if (publication.appearance.theme === "weekly-wildcat") {
    if (sport.includes("baseball")) return "NSHS Baseball Field";
    if (sport.includes("softball")) return "NSHS Softball Field";
    if (sport.includes("basketball") || sport.includes("volleyball") || sport.includes("wrestling") || sport.includes("cheer")) return "NSHS Gym";
    if (sport.includes("football") || sport.includes("soccer") || sport.includes("track")) return "Wilson-Campbell Stadium";
    if (sport.includes("golf")) return "Home course";
  }

  return publication.location.display || publication.identity.organizationName || "Home venue";
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
  if (!(["final", "tie"].includes(game.status)) || game.wildcatsScore === null || game.opponentScore === null) {
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
  const normalizedYear = year ? normalizeSportsSeason(year) : "";
  const scopedGames = year
    ? normalizedYear === ""
      ? []
      : (games ?? team.games).filter((game) => getGameSeason(game) === normalizedYear)
    : games ?? team.games;
  const gameIds = new Set(scopedGames.map((game) => game.id));

  return posts
    .filter((post) => {
      const primaryGameId = getPostPrimaryGameId(post);
      return primaryGameId !== null && gameIds.has(primaryGameId);
    })
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, limit)
    .map((post) => post);
}

export function sortGamesAscending(left: SportsGame, right: SportsGame) {
  return new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
}

export function sortGamesDescending(left: SportsGame, right: SportsGame) {
  return new Date(right.startDate).getTime() - new Date(left.startDate).getTime();
}
