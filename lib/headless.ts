import { mirrorWordPressMediaInValue } from "@/lib/media";
import { getWordPressApiUrl } from "@/lib/wordpress";

const HEADLESS_FETCH_CACHE_KEY =
  process.env.WORDPRESS_FETCH_CACHE_KEY ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.NETLIFY_COMMIT_REF ||
  String(Date.now());

type QueryValue = string | number | boolean | undefined | null;

export type SportsGameStatus = "upcoming" | "final" | "postponed" | "canceled";
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
  key: string;
  sport: string;
  level: string;
  teamLabel: string;
  label: string;
  headerImage: HeadlessImage;
  logo: HeadlessImage;
  accentColor: string;
};

export type SportsGame = {
  id: number;
  title: string;
  slug: string;
  sportKey: string;
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
  status: SportsGameStatus;
  wildcatsScore: number | null;
  opponentScore: number | null;
  recapUrl: string;
  notes: string;
  display: {
    matchup: string;
    date: string;
    location: string;
    status: string;
    score: string | null;
    sportLevel?: string;
    scoreboard?: {
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

function getHeadlessApiUrl() {
  return getWordPressApiUrl().replace(/\/wp\/v2$/, "/weekly-wildcat/v1");
}

async function headlessFetch<T>(path: string, query: Record<string, QueryValue> = {}) {
  const { data } = await headlessFetchPage<T>(path, query);

  return data;
}

async function headlessFetchPage<T>(path: string, query: Record<string, QueryValue> = {}) {
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
    throw new Error(`Weekly Wildcat headless request failed: ${response.status} ${response.statusText} (${url})`);
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

export function getUpcomingSportsGames(query?: number | SportsGameQuery) {
  const normalizedQuery = normalizeSportsGameQuery(query, 10);

  return headlessFetch<SportsGame[]>("/sports-games/upcoming", { per_page: normalizedQuery.limit, sportKey: normalizedQuery.sportKey });
}

export function getRecentSportsGames(query?: number | SportsGameQuery) {
  const normalizedQuery = normalizeSportsGameQuery(query, 10);

  return headlessFetch<SportsGame[]>("/sports-games/recent", { per_page: normalizedQuery.limit, sportKey: normalizedQuery.sportKey });
}

export function getSchoolEvents(limit = 20) {
  return headlessFetch<SchoolEvent[]>("/school-events", { per_page: limit });
}
