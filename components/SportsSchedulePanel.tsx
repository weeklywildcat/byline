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
    <article className="field-game field-game-latest">
      <div className="field-game-topline">
        <span>{getSportLevel(game)}</span>
        <span>{game.display.status || "Final"}</span>
      </div>
      <h4>{game.display.matchup || game.title}</h4>
      {context ? <p className="field-game-context">{context}</p> : null}
      <div className="field-game-score" aria-label={game.display.score || undefined}>
        <div className={`field-score-team${wildcatsWon ? " field-score-team-winner" : ""}`}>
          <span>{scoreboard.wildcats.label}</span>
          <strong>{scoreboard.wildcats.score ?? "—"}</strong>
        </div>
        <span className="field-score-divider" aria-hidden="true">
          Final
        </span>
        <div className={`field-score-team${opponentWon ? " field-score-team-winner" : ""}`}>
          <span>{scoreboard.opponent.label}</span>
          <strong>{scoreboard.opponent.score ?? "—"}</strong>
        </div>
      </div>
      {verdict ? <p className="field-result-verdict">{verdict}</p> : null}
      {game.recapUrl ? (
        <a className="field-game-link" href={game.recapUrl}>
          Read recap →
        </a>
      ) : null}
    </article>
  );
}

function ScheduleMetaRow({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function NextUpCard({ game }: { game: SportsGame }) {
  const date = getGameDate(game);
  const location = getGameLocation(game);
  const siteLabel = getSiteLabel(game);
  const context = getEditorialContext(game);
  const href = game.recapUrl || "/sports/schedule/";
  const linkText = game.recapUrl ? "Preview matchup →" : "View schedule →";

  return (
    <article className="field-game field-game-next">
      <div className="field-game-topline">
        <span>{getSportLevel(game)}</span>
        <span>{game.display.status || "Upcoming"}</span>
      </div>
      <h4>{game.display.matchup || game.title}</h4>
      {context ? <p className="field-game-context">{context}</p> : null}
      <dl className="field-next-details">
        <ScheduleMetaRow label="Date / Time" value={date} />
        <ScheduleMetaRow label="Opponent" value={getGameOpponent(game)} />
        <ScheduleMetaRow label="Location" value={location} />
        <ScheduleMetaRow label="Site" value={siteLabel} />
      </dl>
      <a className="field-game-link" href={href}>
        {linkText}
      </a>
    </article>
  );
}

function UpcomingMiniCard({ game }: { game: SportsGame }) {
  const date = getGameDate(game);
  const siteLabel = getSiteLabel(game);

  return (
    <article className="field-game-mini">
      <div>
        <p>{getSportLevel(game)}</p>
        <h5>{game.display.matchup || game.title}</h5>
      </div>
      <div>
        {date ? <time dateTime={game.startDate}>{date}</time> : null}
        {siteLabel ? <span>{siteLabel}</span> : null}
      </div>
    </article>
  );
}

export function SportsSchedulePanel({ recentScores, upcomingGames }: SportsSchedulePanelProps) {
  if (recentScores.length === 0 && upcomingGames.length === 0) {
    return null;
  }

  const latestResult = recentScores[0] ?? null;
  const nextUp = upcomingGames[0] ?? null;
  const additionalUpcoming = upcomingGames.slice(1, 4);
  const columnCount = [latestResult, nextUp].filter(Boolean).length;

  return (
    <aside className="field-schedule" aria-labelledby="field-schedule-heading">
      <div className="field-schedule-header">
        <h3 id="field-schedule-heading">SCORES &amp; SCHEDULE</h3>
        <a href="/sports/schedule/">FULL SCHEDULE →</a>
      </div>

      <div className={`field-schedule-layout field-schedule-layout-${columnCount}`}>
        {latestResult ? (
          <section className="field-schedule-group" aria-labelledby="recent-scores-heading">
            <h4 id="recent-scores-heading">Latest Result</h4>
            <LatestResultCard game={latestResult} />
          </section>
        ) : null}

        {nextUp ? (
          <section className="field-schedule-group" aria-labelledby="upcoming-games-heading">
            <h4 id="upcoming-games-heading">Next Up</h4>
            <NextUpCard game={nextUp} />
            {additionalUpcoming.length > 0 ? (
              <div className="field-game-list" aria-label="More upcoming games">
                {additionalUpcoming.map((game) => (
                  <UpcomingMiniCard key={game.id} game={game} />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
