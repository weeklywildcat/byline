"use client";

import { useMemo, useState } from "react";
import type { SportsGame } from "@/lib/headless";

type SportsScheduleArchiveProps = {
  games: SportsGame[];
};

function getYear(game: SportsGame) {
  return game.startDate.slice(0, 4);
}

function getSportLabel(game: SportsGame) {
  return game.sport || game.sportLabel || game.sportKey || "Sports";
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

function sortByDateAscending(left: SportsGame, right: SportsGame) {
  return new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
}

function sortByDateDescending(left: SportsGame, right: SportsGame) {
  return new Date(right.startDate).getTime() - new Date(left.startDate).getTime();
}

function formatStat(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
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
        Final
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
  const linkHref = game.recapUrl || "/category/sports/";
  const linkText = game.status === "final" ? "Recap" : "Preview";

  return (
    <article className={`schedule-game-card schedule-game-card-${game.status}`}>
      <div className="schedule-game-main">
        <div className="schedule-game-meta">
          <span>{getSportLevel(game)}</span>
          <span>{getGameStatusLabel(game)}</span>
        </div>
        <h3>{game.display.matchup || game.title}</h3>
        <dl className="schedule-game-details">
          <div>
            <dt>Date</dt>
            <dd>
              <time dateTime={game.startDate}>{game.display.date || game.startDate}</time>
            </dd>
          </div>
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
          {siteLabel ? (
            <div>
              <dt>Site</dt>
              <dd>{siteLabel}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div className="schedule-game-result">
        <ScheduleScore game={game} />
        <a href={linkHref}>{linkText} →</a>
      </div>
    </article>
  );
}

export function SportsScheduleArchive({ games }: SportsScheduleArchiveProps) {
  const [year, setYear] = useState("all");
  const [sport, setSport] = useState("all");

  const years = useMemo(() => [...new Set(games.map(getYear).filter(Boolean))].sort((left, right) => right.localeCompare(left)), [games]);
  const sports = useMemo(
    () => [...new Set(games.map(getSportLabel).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [games]
  );
  const filteredGames = useMemo(
    () =>
      games.filter((game) => {
        const matchesYear = year === "all" || getYear(game) === year;
        const matchesSport = sport === "all" || getSportLabel(game) === sport;

        return matchesYear && matchesSport;
      }),
    [games, sport, year]
  );
  const upcomingGames = filteredGames.filter((game) => game.status === "upcoming").sort(sortByDateAscending);
  const historyGames = filteredGames.filter((game) => game.status !== "upcoming").sort(sortByDateDescending);
  const finalCount = filteredGames.filter((game) => game.status === "final").length;

  return (
    <section className="schedule-archive" aria-labelledby="schedule-archive-heading">
      <header className="schedule-archive-hero">
        <p>Sports Center</p>
        <h1 id="schedule-archive-heading">Game History &amp; Schedule</h1>
        <div className="schedule-archive-stats" aria-label="Schedule summary">
          <span>{formatStat(filteredGames.length, "game")}</span>
          <span>{formatStat(upcomingGames.length, "upcoming", "upcoming")}</span>
          <span>{formatStat(finalCount, "final")}</span>
        </div>
      </header>

      <div className="schedule-filter-bar" aria-label="Schedule filters">
        <label>
          <span>Year</span>
          <select aria-label="Year" value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="all">All Years</option>
            {years.map((yearOption) => (
              <option key={yearOption} value={yearOption}>
                {yearOption}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sport</span>
          <select aria-label="Sport" value={sport} onChange={(event) => setSport(event.target.value)}>
            <option value="all">All Sports</option>
            {sports.map((sportOption) => (
              <option key={sportOption} value={sportOption}>
                {sportOption}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredGames.length > 0 ? (
        <div className="schedule-archive-sections">
          {upcomingGames.length > 0 ? (
            <section className="schedule-archive-section" aria-labelledby="schedule-upcoming-heading">
              <div className="schedule-section-heading">
                <h2 id="schedule-upcoming-heading">Upcoming Games</h2>
                <span>{upcomingGames.length}</span>
              </div>
              <div className="schedule-game-list">
                {upcomingGames.map((game) => (
                  <ScheduleGameCard key={game.id} game={game} />
                ))}
              </div>
            </section>
          ) : null}

          {historyGames.length > 0 ? (
            <section className="schedule-archive-section" aria-labelledby="schedule-history-heading">
              <div className="schedule-section-heading">
                <h2 id="schedule-history-heading">Game History</h2>
                <span>{historyGames.length}</span>
              </div>
              <div className="schedule-game-list">
                {historyGames.map((game) => (
                  <ScheduleGameCard key={game.id} game={game} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <p className="empty-state schedule-empty">No games match those filters yet.</p>
      )}
    </section>
  );
}
