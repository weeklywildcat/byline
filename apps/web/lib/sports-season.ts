import type { SportsGame } from "@/lib/headless";

const SPORTS_SEASON_START_MONTH = 7;

export function normalizeSportsSeason(value: string | number | null | undefined) {
  const source = String(value ?? "").trim();
  const match = /^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/.exec(source);

  if (!match) return "";

  const startYear = Number(match[1]);
  const endYear = startYear + 1;
  const suppliedEnd = Number(match[2]);

  if (startYear < 1900 || startYear > 2200) return "";
  if (match[2].length === 4 ? suppliedEnd !== endYear : suppliedEnd !== endYear % 100) return "";

  return `${String(startYear).padStart(4, "0")}-${String(endYear).slice(-2)}`;
}

export function getSeasonFromDate(startDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
  const year = match ? Number(match[1]) : Number.NaN;
  const month = match ? Number(match[2]) : Number.NaN;

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return "";
  }

  const startYear = month >= SPORTS_SEASON_START_MONTH ? year : year - 1;

  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function getGameSeason(game: Pick<SportsGame, "season" | "startDate">) {
  return normalizeSportsSeason(game.season) || getSeasonFromDate(game.startDate);
}
