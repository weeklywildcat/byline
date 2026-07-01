import type { SportsGame } from "@/lib/headless";

type SportsSchedulePanelProps = {
  recentScores: SportsGame[];
  upcomingGames: SportsGame[];
};

function getGameDate(game: SportsGame) {
  return game.display.date || game.startDate;
}

function getGameLocation(game: SportsGame) {
  return game.display.location || game.locationName || game.locationAddress || game.location;
}

function getSportLevel(game: SportsGame) {
  return game.display.sportLevel || [game.sport, game.level].filter(Boolean).join(" · ") || game.sportLabel || "Sports";
}

function getScoreboard(game: SportsGame) {
  return {
    wildcats: game.display.scoreboard?.wildcats ?? {
      label: "Wildcats",
      score: game.wildcatsScore
    },
    opponent: game.display.scoreboard?.opponent ?? {
      label: game.opponent || "Opponent",
      score: game.opponentScore
    }
  };
}

function GameCard({ game, showScore = false, compact = false }: { game: SportsGame; showScore?: boolean; compact?: boolean }) {
  const date = getGameDate(game);
  const location = getGameLocation(game);
  const hasScore = showScore && game.wildcatsScore !== null && game.opponentScore !== null;
  const scoreboard = getScoreboard(game);
  const className = `field-game${compact ? " field-game-compact" : ""}`;

  return (
    <article className={className}>
      <div className="field-game-topline">
        <span>{getSportLevel(game)}</span>
        {showScore ? <span>{game.display.status || "Final"}</span> : null}
        {date ? <time dateTime={game.startDate}>{date}</time> : null}
      </div>
      <h4>{game.display.matchup || game.title}</h4>
      {hasScore ? (
        <div className="field-game-score" aria-label={game.display.score || undefined}>
          <div className="field-score-team">
            <span>{scoreboard.wildcats.label}</span>
            <strong>{scoreboard.wildcats.score}</strong>
          </div>
          <span className="field-score-divider" aria-hidden="true">
            —
          </span>
          <div className="field-score-team">
            <span>{scoreboard.opponent.label}</span>
            <strong>{scoreboard.opponent.score}</strong>
          </div>
        </div>
      ) : showScore && game.display.score ? (
        <p className="field-game-score-text">{game.display.score}</p>
      ) : null}
      {!showScore && location ? <p className="field-game-location">{location}</p> : null}
      {showScore && game.recapUrl ? (
        <a className="field-game-link" href={game.recapUrl}>
          Read recap →
        </a>
      ) : null}
    </article>
  );
}

export function SportsSchedulePanel({ recentScores, upcomingGames }: SportsSchedulePanelProps) {
  if (recentScores.length === 0 && upcomingGames.length === 0) {
    return null;
  }

  const latestResult = recentScores[0] ?? null;
  const nextUp = upcomingGames.slice(0, 3);
  const columnCount = [latestResult, nextUp.length > 0].filter(Boolean).length;

  return (
    <aside className="field-schedule" aria-labelledby="field-schedule-heading">
      <div className="field-schedule-header">
        <h3 id="field-schedule-heading">Scores &amp; Schedule</h3>
        <a href="/category/sports/">Full Schedule →</a>
      </div>

      <div className={`field-schedule-layout field-schedule-layout-${columnCount}`}>
        {latestResult ? (
          <section className="field-schedule-group" aria-labelledby="recent-scores-heading">
            <h4 id="recent-scores-heading">Latest Result</h4>
            <GameCard game={latestResult} showScore />
          </section>
        ) : null}

        {nextUp.length > 0 ? (
          <section className="field-schedule-group" aria-labelledby="upcoming-games-heading">
            <h4 id="upcoming-games-heading">Next Up</h4>
            <div className="field-game-list">
              {nextUp.map((game) => (
                <GameCard key={game.id} game={game} compact />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
