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

export type SportsGame = {
  id: number;
  title: string;
  slug: string;
  sportKey: string;
  sport: string;
  sportLabel: string;
  level: string;
  teamLabel: string;
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
  limit?: number;
  sportKey?: string;
};

function normalizeSportsGameQuery(query: number | SportsGameQuery | undefined, defaultLimit: number) {
  if (typeof query === "number") {
    return { limit: query };
  }

  return { limit: query?.limit ?? defaultLimit, sportKey: query?.sportKey };
}

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
    cache: "force-cache"
  });

  if (!response.ok) {
    throw new Error(`Weekly Wildcat headless request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return mirrorWordPressMediaInValue((await response.json()) as T);
}

export function getSportsGames(query?: number | SportsGameQuery) {
  const normalizedQuery = normalizeSportsGameQuery(query, 20);

  return headlessFetch<SportsGame[]>("/sports-games", { per_page: normalizedQuery.limit, sportKey: normalizedQuery.sportKey });
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
