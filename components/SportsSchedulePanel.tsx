import type { SportsGame } from "@/lib/headless";
import { SiteIcon } from "./SiteIcon";

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

function getSportIconName(game: SportsGame) {
  const sport = [game.sportKey, game.sport, game.sportLabel, game.teamLabel].filter(Boolean).join(" ").toLowerCase();

  if (sport.includes("baseball")) return "mdi:baseball";
  if (sport.includes("softball")) return "mdi:baseball";
  if (sport.includes("basketball")) return "mdi:basketball";
  if (sport.includes("football")) return "mdi:football";
  if (sport.includes("soccer")) return "mdi:soccer";
  if (sport.includes("volleyball")) return "mdi:volleyball";
  if (sport.includes("tennis")) return "mdi:tennis-ball";
  if (sport.includes("golf")) return "mdi:golf";
  if (sport.includes("track") || sport.includes("cross country")) return "mdi:run-fast";
  if (sport.includes("wrestling")) return "mdi:boxing-glove";
  if (sport.includes("cheer")) return "mdi:bullhorn";
  if (sport.includes("swim")) return "mdi:swim";

  return "mdi:whistle";
}

function getSiteLabel(game: SportsGame) {
  if (game.site === "home") {
    return "Home";
  }

  if (game.site === "away") {
    return "Away";
  }

  if (game.site === "neutral") {
    return "Neutral Site";
  }

  return "";
}

function getSiteContext(game: SportsGame) {
  const siteLabel = getSiteLabel(game);

  if (!siteLabel) {
    return "";
  }

  if (game.status === "final") {
    return siteLabel === "Away" ? "Road final" : `${siteLabel} final`;
  }

  return `${siteLabel} game`;
}

function getEditorialContext(game: SportsGame) {
  const note = game.notes.trim();

  if (/\b(region|playoff|opener|opening|senior night|homecoming|tournament|scrimmage|rivalry|championship)\b/i.test(note)) {
    return note;
  }

  return getSiteContext(game);
}

function getGameOpponent(game: SportsGame) {
  return game.opponent || game.display.scoreboard?.opponent.label || "Opponent";
}

function getScoreboard(game: SportsGame) {
  return {
    wildcats: game.display.scoreboard?.wildcats ?? {
      label: "Wildcats",
      score: game.wildcatsScore
    },
    opponent: game.display.scoreboard?.opponent ?? {
      label: getGameOpponent(game),
      score: game.opponentScore
    }
  };
}

function getResultVerdict(game: SportsGame) {
  if (game.wildcatsScore === null || game.opponentScore === null) {
    return game.display.score ?? "";
  }

  if (game.wildcatsScore === game.opponentScore) {
    return "Final tied";
  }

  const winner = game.wildcatsScore > game.opponentScore ? "Wildcats" : getGameOpponent(game);
  const margin = Math.abs(game.wildcatsScore - game.opponentScore);
  const verb = winner === "Wildcats" ? "win" : "wins";

  return `${winner} ${verb} by ${margin}`;
}

function LatestResultCard({ game }: { game: SportsGame }) {
  const scoreboard = getScoreboard(game);
  const context = getEditorialContext(game);
  const verdict = getResultVerdict(game);
  const wildcatsWon = game.wildcatsScore !== null && game.opponentScore !== null && game.wildcatsScore > game.opponentScore;
  const opponentWon = game.wildcatsScore !== null && game.opponentScore !== null && game.opponentScore > game.wildcatsScore;

  return (
    <article className="field-result-card">
      <div className="field-result-summary">
        <span className="field-sport-icon">
          <SiteIcon name={getSportIconName(game)} width={28} height={28} />
        </span>
        <div>
          <p className="field-card-label">{getSportLevel(game)}</p>
          <h4>{game.display.matchup || game.title}</h4>
        </div>
      </div>
      <div className="field-scoreboard" aria-label={game.display.score || undefined}>
        <div className={`field-score-team${wildcatsWon ? " field-score-team-winner" : ""}`}>
          <span>{scoreboard.wildcats.label}</span>
          <strong>{scoreboard.wildcats.score ?? "—"}</strong>
        </div>
        <div className={`field-score-team${opponentWon ? " field-score-team-winner" : ""}`}>
          <span>{scoreboard.opponent.label}</span>
          <strong>{scoreboard.opponent.score ?? "—"}</strong>
        </div>
      </div>
      <div className="field-result-footer">
        <p>{verdict || game.display.status || "Final"}</p>
        {context ? <span>{context}</span> : null}
      </div>
      {game.recapUrl ? (
        <a className="field-game-link" href={game.recapUrl}>
          Read recap →
        </a>
      ) : null}
    </article>
  );
}

function UpcomingGameRow({ game }: { game: SportsGame }) {
  const date = getGameDate(game);
  const location = getGameLocation(game);
  const siteLabel = getSiteLabel(game);

  return (
    <article className="field-upcoming-game">
      <div className="field-upcoming-date">
        {date ? <time dateTime={game.startDate}>{date}</time> : null}
        {siteLabel ? <span>{siteLabel}</span> : null}
      </div>
      <div className="field-upcoming-main">
        <p>{getSportLevel(game)}</p>
        <h5>{game.display.matchup || game.title}</h5>
        {location ? <span>{location}</span> : null}
      </div>
    </article>
  );
}

export function SportsSchedulePanel({ recentScores, upcomingGames }: SportsSchedulePanelProps) {
  if (recentScores.length === 0 && upcomingGames.length === 0) {
    return null;
  }

  const visibleRecentScores = recentScores.slice(0, 2);
  const visibleUpcomingGames = upcomingGames.slice(0, 3);
  const hasUpcomingGames = visibleUpcomingGames.length > 0;
  const hasRecentScores = visibleRecentScores.length > 0;
  const showUpcomingColumn = hasUpcomingGames || hasRecentScores;
  const columnCount = [hasRecentScores, showUpcomingColumn].filter(Boolean).length;

  return (
    <aside className="field-schedule" aria-labelledby="field-schedule-heading">
      <div className="field-schedule-header">
        <h3 id="field-schedule-heading">SCORES &amp; SCHEDULE</h3>
        <a href="/sports/schedule/">FULL SCHEDULE →</a>
      </div>

      <div className={`field-schedule-layout field-schedule-layout-${columnCount}`}>
        {hasRecentScores ? (
          <section className="field-schedule-result" aria-labelledby="recent-scores-heading">
            <h4 id="recent-scores-heading">Finals</h4>
            <div className="field-result-list">
              {visibleRecentScores.map((game) => (
                <LatestResultCard key={game.id} game={game} />
              ))}
            </div>
          </section>
        ) : null}

        {showUpcomingColumn ? (
          <section className="field-schedule-upcoming" aria-labelledby="upcoming-games-heading">
            <h4 id="upcoming-games-heading">Upcoming</h4>
            {hasUpcomingGames ? (
              <div className="field-game-list">
                {visibleUpcomingGames.map((game) => (
                  <UpcomingGameRow key={game.id} game={game} />
                ))}
              </div>
            ) : (
              <p className="field-upcoming-empty">No upcoming games</p>
            )}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
