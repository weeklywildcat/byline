"use client";

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import type { SportsGame } from "@/lib/headless";

type SportsScheduleArchiveProps = {
  apiBaseUrl?: string;
  dataUrl?: string;
  games: SportsGame[];
  sports?: Array<{
    label: string;
    value: string;
  }>;
  summaries?: Record<string, ScheduleSummary>;
  years?: string[];
};

type ScheduleSummary = {
  games: number;
  upcoming: number;
  finals: number;
  wins: number;
  losses: number;
  ties: number;
};

const SCHEDULE_PAGE_SIZE = 25;

function getYear(game: SportsGame) {
  return game.startDate.slice(0, 4);
}

function getSportLabel(game: SportsGame) {
  return game.sport || game.sportLabel || game.sportKey || "Sports";
}

function getSportValue(game: SportsGame) {
  return game.sportKey || getSportLabel(game);
}

function getSportLevel(game: SportsGame) {
  return game.display.sportLevel || [game.sport, game.level].filter(Boolean).join(" · ") || game.sportLabel || "Sports";
}

function getSiteLabel(game: SportsGame) {
  if (game.site === "home") {
    return "Home";
  }

  if (game.site === "away") {
    return "Away";
  }

  if (game.site === "neutral") {
    return "Neutral";
  }

  return "";
}

function getLocation(game: SportsGame) {
  return game.display.location || game.locationName || game.locationAddress || game.location;
}

function getOpponent(game: SportsGame) {
  return game.opponent || game.display.scoreboard?.opponent.label || "Opponent";
}

function getScoreboard(game: SportsGame) {
  return {
    wildcats: game.display.scoreboard?.wildcats ?? {
      label: "Wildcats",
      score: game.wildcatsScore
    },
    opponent: game.display.scoreboard?.opponent ?? {
      label: getOpponent(game),
      score: game.opponentScore
    }
  };
}

function getGameStatusLabel(game: SportsGame) {
  if (game.status === "final") {
    return game.display.status || "Final";
  }

  if (game.status === "upcoming") {
    return game.display.status || "Upcoming";
  }

  return game.display.status || game.status;
}

function sortByDateDescending(left: SportsGame, right: SportsGame) {
  return new Date(right.startDate).getTime() - new Date(left.startDate).getTime();
}

function formatStat(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatRecord(summary: ScheduleSummary) {
  const decidedFinals = summary.wins + summary.losses + summary.ties;

  if (decidedFinals === 0) {
    return "";
  }

  return summary.ties > 0 ? `${summary.wins}-${summary.losses}-${summary.ties}` : `${summary.wins}-${summary.losses}`;
}

function getSummaryKey(year = "all", sport = "all") {
  return `${year}::${sport}`;
}

function createSummary(): ScheduleSummary {
  return {
    games: 0,
    upcoming: 0,
    finals: 0,
    wins: 0,
    losses: 0,
    ties: 0
  };
}

function addGameToSummary(summary: ScheduleSummary, game: SportsGame) {
  summary.games += 1;

  if (game.status === "upcoming") {
    summary.upcoming += 1;
  }

  if (game.status === "final") {
    summary.finals += 1;

    if (game.wildcatsScore !== null && game.opponentScore !== null) {
      if (game.wildcatsScore > game.opponentScore) {
        summary.wins += 1;
      } else if (game.wildcatsScore < game.opponentScore) {
        summary.losses += 1;
      } else {
        summary.ties += 1;
      }
    }
  }
}

function buildFallbackMetadata(games: SportsGame[]) {
  const yearSet = new Set<string>();
  const sportMap = new Map<string, string>();
  const summaries: Record<string, ScheduleSummary> = {};

  games.forEach((game) => {
    const year = getYear(game);
    const sport = getSportValue(game);

    if (year) {
      yearSet.add(year);
    }

    if (sport) {
      sportMap.set(sport, getSportLabel(game));
    }

    [
      getSummaryKey(),
      getSummaryKey(year || "all", "all"),
      getSummaryKey("all", sport || "all"),
      getSummaryKey(year || "all", sport || "all")
    ].forEach((key) => {
      summaries[key] ??= createSummary();
      addGameToSummary(summaries[key], game);
    });
  });

  return {
    sports: [...sportMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    summaries,
    years: [...yearSet].sort((left, right) => right.localeCompare(left))
  };
}

function getHeadlessApiUrl(apiBaseUrl: string) {
  return apiBaseUrl.replace(/\/$/, "").replace(/\/wp\/v2$/, "/weekly-wildcat/v1");
}

async function fetchScheduleGames({
  apiBaseUrl,
  page,
  sport,
  year
}: {
  apiBaseUrl: string;
  page: number;
  sport: string;
  year: string;
}) {
  const url = new URL(`${getHeadlessApiUrl(apiBaseUrl)}/sports-games`);

  url.searchParams.set("per_page", String(SCHEDULE_PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("_ww_static_build", String(Date.now()));

  if (year !== "all") {
    url.searchParams.set("year", year);
  }

  if (sport !== "all") {
    url.searchParams.set("sportKey", sport);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Schedule request failed: ${response.status}`);
  }

  return (await response.json()) as SportsGame[];
}

function ScheduleScore({ game }: { game: SportsGame }) {
  const scoreboard = getScoreboard(game);
  const wildcatsWon = game.wildcatsScore !== null && game.opponentScore !== null && game.wildcatsScore > game.opponentScore;
  const opponentWon = game.wildcatsScore !== null && game.opponentScore !== null && game.opponentScore > game.wildcatsScore;

  if (game.status !== "final") {
    return <p className="schedule-game-status">{getGameStatusLabel(game)}</p>;
  }

  return (
    <div className="schedule-score" aria-label={game.display.score || undefined}>
      <div className={wildcatsWon ? "schedule-score-team schedule-score-winner" : "schedule-score-team"}>
        <span>{scoreboard.wildcats.label}</span>
        <strong>{scoreboard.wildcats.score ?? "—"}</strong>
      </div>
      <span className="schedule-score-divider" aria-hidden="true">
        at
      </span>
      <div className={opponentWon ? "schedule-score-team schedule-score-winner" : "schedule-score-team"}>
        <span>{scoreboard.opponent.label}</span>
        <strong>{scoreboard.opponent.score ?? "—"}</strong>
      </div>
    </div>
  );
}

function ScheduleGameCard({ game }: { game: SportsGame }) {
  const siteLabel = getSiteLabel(game);
  const location = getLocation(game);
  const gameCenterHref = `/sports/schedule/#game-${game.id}`;

  return (
    <article id={`game-${game.id}`} className={`schedule-game-card schedule-game-card-${game.status}`}>
      <div className="schedule-game-date">
        <time dateTime={game.startDate}>{game.display.date || game.startDate}</time>
        {siteLabel ? <span>{siteLabel}</span> : null}
      </div>
      <div className="schedule-game-main">
        <div className="schedule-game-meta">
          <span>{getSportLevel(game)}</span>
          <span>{getGameStatusLabel(game)}</span>
        </div>
        <h3>{game.display.matchup || game.title}</h3>
        <dl className="schedule-game-details">
          <div>
            <dt>Opponent</dt>
            <dd>{getOpponent(game)}</dd>
          </div>
          {location ? (
            <div>
              <dt>Location</dt>
              <dd>{location}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div className="schedule-game-result">
        <ScheduleScore game={game} />
        <a href={gameCenterHref}>Game Center</a>
        {game.recapUrl ? <a href={game.recapUrl}>{game.status === "final" ? "Recap" : "Preview"}</a> : null}
      </div>
    </article>
  );
}

export function SportsScheduleArchive({ apiBaseUrl, dataUrl, games, sports, summaries, years }: SportsScheduleArchiveProps) {
  const [year, setYear] = useState("all");
  const [sport, setSport] = useState("all");
  const [loadedGames, setLoadedGames] = useState(games);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const fallbackMetadata = useMemo(() => buildFallbackMetadata(games), [games]);
  const apiUrl = apiBaseUrl || process.env.NEXT_PUBLIC_WP_API_URL || "https://cms.weeklywildcat.com/wp-json/wp/v2";
  const filterYears = years ?? fallbackMetadata.years;
  const filterSports = sports ?? fallbackMetadata.sports;
  const scheduleSummaries = summaries ?? fallbackMetadata.summaries;
  const summary = scheduleSummaries[getSummaryKey(year, sport)] ?? {
    games: loadedGames.length,
    upcoming: 0,
    finals: 0,
    wins: 0,
    losses: 0,
    ties: 0
  };
  const visibleGames = useMemo(() => [...loadedGames].sort(sortByDateDescending), [loadedGames]);
  const hasMoreGames = loadedGames.length < summary.games;
  const record = formatRecord(summary);

  async function loadGames(nextPage: number, nextYear = year, nextSport = sport, append = false) {
    setIsLoading(true);
    setLoadError("");

    if (!append) {
      setLoadedGames([]);
      setCurrentPage(1);
    }

    try {
      const nextGames = await fetchScheduleGames({
        apiBaseUrl: apiUrl,
        page: nextPage,
        sport: nextSport,
        year: nextYear
      });

      setLoadedGames((currentGames) => {
        if (!append) {
          return nextGames;
        }

        const seenIds = new Set(currentGames.map((game) => game.id));

        return [...currentGames, ...nextGames.filter((game) => !seenIds.has(game.id))];
      });
      setCurrentPage(nextPage);
    } catch {
      setLoadError("The schedule could not load more games right now.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="schedule-archive" aria-labelledby="schedule-archive-heading">
      <SectionHeader
        actionLabel="Data"
        href={dataUrl}
        id="schedule-archive-heading"
        title="Schedule"
        description="Scores and upcoming games from Weekly Wildcat sports coverage."
        level={1}
      />

      <div className="schedule-filter-bar" aria-label="Schedule filters">
        <label>
          <span>Year</span>
          <select
            aria-label="Year"
            value={year}
            onChange={(event) => {
              const nextYear = event.target.value;

              setYear(nextYear);
              void loadGames(1, nextYear, sport);
            }}
          >
            <option value="all">All Years</option>
            {filterYears.map((yearOption) => (
              <option key={yearOption} value={yearOption}>
                {yearOption}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sport</span>
          <select
            aria-label="Sport"
            value={sport}
            onChange={(event) => {
              const nextSport = event.target.value;

              setSport(nextSport);
              void loadGames(1, year, nextSport);
            }}
          >
            <option value="all">All Sports</option>
            {filterSports.map((sportOption) => (
              <option key={sportOption.value} value={sportOption.value}>
                {sportOption.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="schedule-archive-stats" aria-label="Schedule summary">
        <span>{formatStat(summary.games, "game")}</span>
        <span>{formatStat(summary.upcoming, "upcoming", "upcoming")}</span>
        <span>{formatStat(summary.finals, "final")}</span>
        {record ? <span>{record}</span> : null}
      </div>

      {summary.games > 0 ? (
        <div className="schedule-archive-sections">
          <section className="schedule-archive-section" aria-labelledby="schedule-games-heading">
            <div className="schedule-section-heading">
              <h2 id="schedule-games-heading">Games</h2>
              <span>
                Showing {loadedGames.length} of {summary.games}
              </span>
            </div>
            <div className="schedule-game-list">
              {visibleGames.map((game) => (
                <ScheduleGameCard key={game.id} game={game} />
              ))}
            </div>
            {hasMoreGames ? (
              <button
                className="schedule-load-more"
                type="button"
                onClick={() => void loadGames(currentPage + 1, year, sport, true)}
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : "Load More"}
              </button>
            ) : null}
            {loadError ? <p className="schedule-load-error">{loadError}</p> : null}
          </section>
        </div>
      ) : (
        <p className="empty-state schedule-empty">No games match those filters yet.</p>
      )}
    </section>
  );
}
