import { mirrorWordPressMediaInValue } from "@/lib/media";
import { getWordPressApiUrl } from "@/lib/wordpress";

const HEADLESS_FETCH_CACHE_KEY =
  process.env.WORDPRESS_FETCH_CACHE_KEY ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.NETLIFY_COMMIT_REF ||
  String(Date.now());

type QueryValue = string | number | boolean | undefined | null;

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

type SportsGameQuery = {
  limit?: number | "all";
  page?: number;
  sportKey?: string;
  teamKey?: string;
  season?: string;
  year?: string | number;
};

function normalizeSportsGameQuery(query: number | SportsGameQuery | undefined, defaultLimit: number) {
  if (typeof query === "number") {
    return { limit: query };
  }

  return {
    limit: query?.limit ?? defaultLimit,
    page: query?.page,
    sportKey: query?.sportKey,
    teamKey: query?.teamKey,
    season: query?.season,
    year: query?.year
  };
}

export type SportsGameFacets = {
  years: string[];
  sports: Array<{
    label: string;
    value: string;
  }>;
  summaries: Record<
    string,
    {
      games: number;
      upcoming: number;
      finals: number;
      wins: number;
      losses: number;
      ties: number;
    }
  >;
  dataUrl?: string;
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

const weeklyWildcatFixtureTeams: SportsTeamMedia[] = [
  {
    id: "football-varsity",
    key: "football-varsity",
    teamKey: "football-varsity",
    sport: "Football",
    level: "Varsity",
    teamLabel: "Football",
    label: "Football - Varsity",
    displayName: "Football - Varsity",
    shortName: "Football",
    scoreboardName: "Wildcats",
    slug: "football-varsity",
    active: true,
    currentSeason: "2026-27",
    seasons: ["2026-27"],
    headerImage: { id: 0, url: "", alt: "", width: null, height: null },
    logo: { id: 0, url: "", alt: "", width: null, height: null },
    accentColor: "#8b1e2d"
  },
  {
    id: "girls-soccer",
    key: "girls-soccer",
    teamKey: "girls-soccer",
    sport: "Girls Soccer",
    level: "Varsity",
    genderDivision: "Girls",
    teamLabel: "Girls Soccer",
    label: "Girls Soccer",
    displayName: "Girls Soccer",
    shortName: "Girls Soccer",
    scoreboardName: "Wildcats",
    slug: "girls-soccer",
    active: true,
    currentSeason: "2026-27",
    seasons: ["2026-27"],
    headerImage: { id: 901, url: "/_wordpress-media/1b98507584cd2e0d-GirlsSoccerCelebration-1024x683.jpeg", alt: "Girls soccer players celebrate", width: 1024, height: 683 },
    headerImageFocalPoint: { x: 48, y: 34 },
    logo: { id: 902, url: "/_wordpress-media/a9427e486a41193a-NS-Soccer-Logo-300x300.png", alt: "Girls Soccer", width: 300, height: 300 },
    accentColor: "#8b1e2d"
  }
];

const weeklyWildcatFixtureRoster: SportsRoster = {
  id: 903,
  teamKey: "girls-soccer",
  teamSlug: "girls-soccer",
  season: "2026-27",
  status: "publish",
  team: {
    key: "girls-soccer",
    teamKey: "girls-soccer",
    slug: "girls-soccer",
    displayName: "Girls Soccer",
    shortName: "Girls Soccer",
    scoreboardName: "Wildcats",
    active: true,
    sport: "Girls Soccer",
    level: "Varsity",
    teamLabel: "Girls Soccer",
    label: "Girls Soccer"
  },
  players: [
    { id: "ath_fixture01", name: "Avery Smith", number: "12", position: "Goalkeeper", grade: "11th" },
    { id: "ath_fixture02", name: "Jordan Lee", number: "4", position: "Midfielder", grade: "12th" }
  ],
  staff: [
    { id: "staff_fixture01", name: "Alexandra Montgomery-Washington", role: "Head Coach", imageId: 904, image: { id: 904, url: "/_wordpress-media/26c97631a396129c-SyReannas-profile-photo-300x300.png", alt: "Alexandra Montgomery-Washington", width: 300, height: 300 } },
    { id: "staff_fixture02", name: "Morgan Lee", role: "Assistant Coach — Goalkeepers and Defensive Development", imageId: 0, image: null },
    { id: "staff_fixture03", name: "Taylor Brooks", role: "Student Manager", imageId: 0, image: null },
    { id: "staff_fixture04", name: "Cameron Green", role: "Assistant Coach", imageId: 0, image: null },
    { id: "staff_fixture05", name: "Riley James", role: "Athletic Trainer", imageId: 0, image: null },
    { id: "staff_fixture06", name: "Parker Davis", role: "Student Manager", imageId: 0, image: null },
    { id: "staff_fixture07", name: "Quinn Thomas", role: "Assistant Coach", imageId: 0, image: null },
    { id: "staff_fixture08", name: "Emerson Clark", role: "Team Staff", imageId: 0, image: null }
  ]
};

function weeklyWildcatHeadlessFixture<T>(path: string): T {
  if (path === "/sports-games/1") return weeklyWildcatFixtureGame as T;
  if (path === "/sports-games/facets") {
    return { years: ["2026"], sports: [{ label: "Football - Varsity", value: "football-varsity" }], summaries: {} } as T;
  }
  if (path.startsWith("/sports-games")) return [weeklyWildcatFixtureGame] as T;
  if (path === "/sports-teams") return weeklyWildcatFixtureTeams as T;
  if (path === "/sports-rosters") return [weeklyWildcatFixtureRoster] as T;
  if (path === "/school-events") return [] as T;
  return [] as T;
}

// Shape-correct empty payloads for a publication with no sports data at all.
function emptyHeadlessPayload<T>(path: string): T {
  if (path === "/sports-games/facets") {
    return { years: [], sports: [], summaries: {} } as T;
  }

  return [] as T;
}

function getHeadlessApiUrl() {
  return getWordPressApiUrl().replace(/\/wp\/v2$/, "/weekly-wildcat/v1");
}

async function headlessFetch<T>(path: string, query: Record<string, QueryValue> = {}) {
  const { data } = await headlessFetchPage<T>(path, query);

  return data;
}

async function headlessFetchPage<T>(path: string, query: Record<string, QueryValue> = {}) {
  if (process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-fixture") {
    return { data: weeklyWildcatHeadlessFixture<T>(path), totalPages: 1 };
  }
  if (process.env.BYLINE_CONTENT_MODE === "empty" || process.env.BYLINE_CONTENT_MODE === "north-star-fixture") {
    // Not every headless endpoint is collection-shaped. Returning `[]` for an
    // object-shaped endpoint (such as the schedule facets) produced a malformed
    // response that crashed prerendering rather than rendering an empty archive.
    return { data: emptyHeadlessPayload<T>(path), totalPages: 1 };
  }
  const url = new URL(`${getHeadlessApiUrl()}/${path.replace(/^\//, "")}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  url.searchParams.set("_ww_static_build", HEADLESS_FETCH_CACHE_KEY);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    cache: process.env.NODE_ENV === "development" ? "no-store" : "force-cache"
  });

  if (!response.ok) {
    throw new Error(`Byline headless request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return {
    data: await mirrorWordPressMediaInValue((await response.json()) as T),
    totalPages: Number(response.headers.get("x-wp-totalpages") || "1")
  };
}

export function getSportsGames(query?: number | SportsGameQuery) {
  const normalizedQuery = normalizeSportsGameQuery(query, 20);

  return headlessFetch<SportsGame[]>("/sports-games", {
    per_page: normalizedQuery.limit,
    page: normalizedQuery.page,
    sportKey: normalizedQuery.sportKey,
    teamKey: normalizedQuery.teamKey,
    season: normalizedQuery.season,
    year: normalizedQuery.year
  });
}

// Sports archive pages build team hubs and season URLs from the canonical
// ww_sports_game records, so a game edit updates every dependent static page on
// the next WordPress-triggered rebuild without duplicating schedule data.
export async function getAllSportsGames() {
  const firstPage = await headlessFetchPage<SportsGame[]>("/sports-games", {
    per_page: 100,
    page: 1
  });

  if (firstPage.totalPages <= 1) {
    return firstPage.data;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      headlessFetchPage<SportsGame[]>("/sports-games", {
        per_page: 100,
        page: index + 2
      })
    )
  );

  return [...firstPage.data, ...remainingPages.flatMap((page) => page.data)];
}

export function getGameCenterHref(game: Pick<SportsGame, "id">) {
  return `/sports/schedule/#game-${game.id}`;
}

export async function getSportsGameById(gameId: number | string) {
  const id = Number(gameId);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  try {
    // Single-game lookups keep article cards tied to the canonical schedule record.
    return await headlessFetch<SportsGame>(`/sports-games/${id}`);
  } catch {
    return null;
  }
}

export function getSportsGameFacets() {
  return headlessFetch<SportsGameFacets>("/sports-games/facets");
}

export function getSportsTeams() {
  return headlessFetch<SportsTeamMedia[]>("/sports-teams");
}

export async function getAllSportsRosters() {
  const firstPage = await headlessFetchPage<SportsRoster[]>("/sports-rosters", {
    per_page: 100,
    page: 1
  });

  if (firstPage.totalPages <= 1) {
    return firstPage.data;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      headlessFetchPage<SportsRoster[]>("/sports-rosters", {
        per_page: 100,
        page: index + 2
      })
    )
  );

  return [...firstPage.data, ...remainingPages.flatMap((page) => page.data)];
}

export function getUpcomingSportsGames(query?: number | SportsGameQuery) {
  const normalizedQuery = normalizeSportsGameQuery(query, 10);

  return headlessFetch<SportsGame[]>("/sports-games/upcoming", {
    per_page: normalizedQuery.limit,
    page: normalizedQuery.page,
    sportKey: normalizedQuery.sportKey,
    teamKey: normalizedQuery.teamKey,
    season: normalizedQuery.season,
    year: normalizedQuery.year
  });
}

export function getRecentSportsGames(query?: number | SportsGameQuery) {
  const normalizedQuery = normalizeSportsGameQuery(query, 10);

  return headlessFetch<SportsGame[]>("/sports-games/recent", {
    per_page: normalizedQuery.limit,
    page: normalizedQuery.page,
    sportKey: normalizedQuery.sportKey,
    teamKey: normalizedQuery.teamKey,
    season: normalizedQuery.season,
    year: normalizedQuery.year
  });
}

export function getSchoolEvents(limit = 20) {
  return headlessFetch<SchoolEvent[]>("/school-events", { per_page: limit });
}
