import { getNativeSnapshot } from "./native-snapshot";
import { nativeUpcomingEvents } from "./native-archive-views";
import { assertPreparedBuildMode } from "./prepared-data";

export type SportsGameStatus = "upcoming" | "final" | "forfeit" | "tie" | "postponed" | "canceled";
export type SchoolEventStatus = "scheduled" | "canceled";
export type GameSite = "home" | "away" | "neutral";

export type HeadlessImage = {
  id: number;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

export type SportsTeamMedia = {
  id?: string;
  key: string;
  teamKey?: string;
  sport: string;
  level: string;
  teamLabel: string;
  label: string;
  displayName?: string;
  shortName?: string;
  scoreboardName?: string;
  genderDivision?: string;
  slug?: string;
  active?: boolean;
  currentSeason?: string;
  seasons?: string[];
  gamesCount?: number;
  rosterCount?: number;
  headerImage: HeadlessImage;
  headerImageFocalPoint?: {
    x: number;
    y: number;
  };
  logo: HeadlessImage;
  accentColor: string;
};

export type SportsRosterPlayer = {
  id: string;
  name: string;
  number: string;
  position: string;
  grade: string;
};

export type SportsRosterStaffMember = {
  id: string;
  name: string;
  role: string;
  imageId: number;
  image: HeadlessImage | null;
};

export type SportsRoster = {
  id: number;
  teamKey: string;
  season: string;
  team: {
    key: string;
    teamKey?: string;
    slug?: string;
    displayName?: string;
    shortName?: string;
    scoreboardName?: string;
    active?: boolean;
    sport: string;
    level: string;
    teamLabel: string;
    label: string;
  };
  players: SportsRosterPlayer[];
  staff: SportsRosterStaffMember[];
  teamSlug?: string;
  status?: string;
};

export type SportsGame = {
  id: number;
  archiveUrl?: string;
  title: string;
  slug: string;
  sportKey: string;
  teamKey?: string;
  teamSlug?: string;
  sport: string;
  sportLabel: string;
  level: string;
  teamLabel: string;
  team?: SportsTeamMedia | null;
  opponent: string;
  site: GameSite;
  location: string;
  locationName: string;
  locationAddress: string;
  latitude: number | null;
  longitude: number | null;
  appleMapsId: string;
  startDate: string;
  season: string;
  status: SportsGameStatus;
  wildcatsScore: number | null;
  teamScore?: number | null;
  opponentScore: number | null;
  recapUrl: string;
  recap?: {
    url: string;
    title: string;
  } | null;
  notes: string;
  display: {
    matchup: string;
    date: string;
    location: string;
    status: string;
    score: string | null;
    sportLevel?: string;
    scoreboard?: {
      team?: {
        label: string;
        score: number | null;
      };
      wildcats: {
        label: string;
        score: number | null;
      };
      opponent: {
        label: string;
        score: number | null;
      };
    };
  };
};

export type SchoolEvent = {
  id: number;
  title: string;
  slug: string;
  eventType: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location: string;
  description: string;
  externalUrl: string;
  status: SchoolEventStatus;
  display: {
    date: string;
    time: string;
    status: string;
  };
};

const weeklyWildcatFixtureGame: SportsGame = {
  id: 1,
  title: "Wildcats fixture game",
  slug: "wildcats-fixture-game",
  sportKey: "football-varsity",
  sport: "football",
  sportLabel: "Football - Varsity",
  level: "Varsity",
  teamLabel: "Wildcats",
  opponent: "Fixture Academy",
  site: "home",
  location: "Ninety Six High School",
  locationName: "Wildcat Stadium",
  locationAddress: "Ninety Six, SC",
  latitude: null,
  longitude: null,
  appleMapsId: "",
  startDate: "2026-09-04T19:30:00-04:00",
  season: "2026-27",
  status: "upcoming",
  wildcatsScore: null,
  opponentScore: null,
  recapUrl: "",
  notes: "",
  display: {
    matchup: "Wildcats vs. Fixture Academy",
    date: "September 4, 2026",
    location: "Wildcat Stadium",
    status: "Upcoming",
    score: null
  }
};

export function getGameCenterHref(game: Pick<SportsGame, "id" | "archiveUrl">) {
  if (game.archiveUrl && /^\/[a-z0-9-]+\/#game-\d+$/.test(game.archiveUrl)) return game.archiveUrl;
  return `/sports/schedule/#game-${game.id}`;
}

export async function getSportsGameById(gameId: number | string) {
  assertPreparedBuildMode();
  return !getNativeSnapshot() && process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture") && Number(gameId) === weeklyWildcatFixtureGame.id
    ? weeklyWildcatFixtureGame
    : null;
}

export async function getSchoolEvents(limit = 20) {
  assertPreparedBuildMode();
  const snapshot = getNativeSnapshot();
  return snapshot ? nativeUpcomingEvents(snapshot, limit) : [];
}
