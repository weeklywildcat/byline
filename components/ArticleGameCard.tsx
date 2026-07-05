import { getGameCenterHref, type SportsGame } from "@/lib/headless";

type ArticleGameCardProps = {
  game: SportsGame;
  display?: "compact" | "full" | "score-only";
  className?: string;
};

function getSportLevel(game: SportsGame) {
  return game.display.sportLevel || [game.sport, game.level].filter(Boolean).join(" · ") || game.sportLabel || "Sports";
}

function getLocation(game: SportsGame) {
  return game.display.location || game.locationName || game.locationAddress || game.location;
}

function getStatusLabel(game: SportsGame) {
  if (game.status === "postponed") {
    return "Postponed";
  }

  if (game.status === "canceled") {
    return "Canceled";
  }

  return game.display.status || (game.status === "final" ? "Final" : "Upcoming");
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

export function ArticleGameCard({ game, display = "full", className = "" }: ArticleGameCardProps) {
  const scoreboard = getScoreboard(game);
  const hasScore = game.status === "final" && scoreboard.wildcats.score !== null && scoreboard.opponent.score !== null;
  const wildcatsWon = hasScore && Number(scoreboard.wildcats.score) > Number(scoreboard.opponent.score);
  const opponentWon = hasScore && Number(scoreboard.opponent.score) > Number(scoreboard.wildcats.score);
  const location = getLocation(game);
  const statusLabel = getStatusLabel(game);
  const classes = ["article-game-card", `article-game-card-${display}`, `article-game-card-${game.status}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={classes} aria-label="Linked game">
      <div className="article-game-card-meta">
        <span>{getSportLevel(game)}</span>
        <span>{statusLabel}</span>
      </div>

      {display !== "score-only" ? <h2>{game.display.matchup || game.title}</h2> : null}

      {hasScore ? (
        <div className="article-game-scoreboard" aria-label={game.display.score || "Final score"}>
          <div className={wildcatsWon ? "article-game-team article-game-team-winner" : "article-game-team"}>
            <span>{scoreboard.wildcats.label}</span>
            <strong>{scoreboard.wildcats.score}</strong>
          </div>
          <div className={opponentWon ? "article-game-team article-game-team-winner" : "article-game-team"}>
            <span>{scoreboard.opponent.label}</span>
            <strong>{scoreboard.opponent.score}</strong>
          </div>
        </div>
      ) : (
        <p className="article-game-status">{statusLabel}</p>
      )}

      {display === "full" ? (
        <dl className="article-game-details">
          {game.display.date || game.startDate ? (
            <div>
              <dt>Date</dt>
              <dd>{game.display.date || game.startDate}</dd>
            </div>
          ) : null}
          {location ? (
            <div>
              <dt>Location</dt>
              <dd>{location}</dd>
            </div>
          ) : null}
        </dl>
      ) : game.display.date || game.startDate ? (
        <p className="article-game-date">{game.display.date || game.startDate}</p>
      ) : null}

      <a className="article-game-link" href={getGameCenterHref(game)}>
        View Game Center →
      </a>
    </aside>
  );
}
