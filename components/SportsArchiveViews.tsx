import type { CSSProperties } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { SiteIcon } from "@/components/SiteIcon";
import { StoryTeaser } from "@/components/StoryTeaser";
import type { SportsGame, SportsTeamMedia } from "@/lib/headless";
import { formatDisplayDate } from "@/lib/format";
import {
  calculateRecord,
  formatRecord,
  getGameHref,
  getGameScoreText,
  getGameSiteLabel,
  getGameStatusLabel,
  getScheduleLocationDisplay,
  getSeasonHref,
  getSportMetadataForGame,
  getSportMetadataForTeam,
  getTeamHubHref,
  getTeamSeasonGames,
  type SeasonSummary,
  type TeamSummary
} from "@/lib/sports";
import type { WordPressPost } from "@/lib/wordpress";

type SportsLandingProps = {
  teams: TeamSummary[];
  teamMediaByKey: Map<string, SportsTeamMedia>;
  upcomingGames: SportsGame[];
  recentScores: SportsGame[];
  latestCoverage: WordPressPost[];
};

type TeamHubProps = {
  team: TeamSummary;
  season: SeasonSummary;
  teamMedia: SportsTeamMedia | null;
  coverage: WordPressPost[];
};

type SeasonPageProps = {
  season: SeasonSummary;
  teamMedia: SportsTeamMedia | null;
  coverage: WordPressPost[];
};

type BreadcrumbItem = {
  label: string;
  href?: string;
};

function BreadcrumbTrail({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="sports-breadcrumbs" aria-label="Sports breadcrumbs">
      <a href="/">Home</a>
      {items.map((item) => (
        <span key={`${item.href ?? item.label}-${item.label}`}>
          <span aria-hidden="true">/</span>
          {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function SportIconBadge({ metadata }: { metadata: ReturnType<typeof getSportMetadataForTeam> }) {
  return (
    <span className="sports-icon-badge" style={{ "--sport-accent": metadata.color } as CSSProperties} aria-hidden="true">
      <SiteIcon name={metadata.icon} width={18} height={18} />
    </span>
  );
}

function SportsGameDigestList({ games, emptyMessage, mode }: { games: SportsGame[]; emptyMessage: string; mode: "upcoming" | "scores" }) {
  if (games.length === 0) {
    return <p className="empty-state sports-archive-empty">{emptyMessage}</p>;
  }

  return (
    <div className="sports-game-digest-list">
      {games.map((game) => (
        <article className="sports-game-digest" key={game.id}>
          <SportIconBadge metadata={getSportMetadataForGame(game)} />
          <div className="sports-game-digest-main">
            <p>{game.display.sportLevel || game.sportLabel || "Sports"}</p>
            <h3>{game.display.matchup || game.title}</h3>
            <span>
              {mode === "scores" ? getGameScoreText(game) : game.display.date || game.startDate || "TBA"}
              {mode === "scores" && game.display.date ? ` · ${game.display.date}` : ""}
            </span>
          </div>
          <a href={getGameHref(game)}>Game Center</a>
        </article>
      ))}
    </div>
  );
}

function getTeamMedia(team: TeamSummary, teamMediaByKey: Map<string, SportsTeamMedia>) {
  return team.sportKeys.map((key) => teamMediaByKey.get(key)).find(Boolean) ?? null;
}

function SportsTeamDirectory({ teams, teamMediaByKey }: { teams: TeamSummary[]; teamMediaByKey: Map<string, SportsTeamMedia> }) {
  if (teams.length === 0) {
    return <p className="empty-state sports-archive-empty">No team hubs are available yet.</p>;
  }

  return (
    <div className="sports-team-directory">
      {teams.map((team) => {
        const metadata = getSportMetadataForTeam(team);
        const media = getTeamMedia(team, teamMediaByKey);
        const record = formatRecord(calculateRecord(getTeamSeasonGames(team, team.latestSeason)));
        const accentColor = media?.accentColor || metadata.color;

        return (
          <a href={getTeamHubHref(team)} key={team.slug} style={{ "--sport-accent": accentColor } as CSSProperties}>
            <SportIconBadge metadata={metadata} />
            <span>
              <strong>{team.name}</strong>
              <span>{record ? `${team.latestSeason} · ${record}` : `${team.latestSeason} season`}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

function CoverageGrid({ posts }: { posts: WordPressPost[] }) {
  if (posts.length === 0) {
    return <p className="empty-state sports-archive-empty">No related coverage has been published yet.</p>;
  }

  return (
    <div className="sports-coverage-grid">
      {posts.map((post) => (
        <StoryTeaser key={post.id} post={post} variant="compact" />
      ))}
    </div>
  );
}

function SeasonRecordText({ team, year }: { team: TeamSummary; year: string }) {
  const games = getTeamSeasonGames(team, year);
  const record = formatRecord(calculateRecord(games));
  const finals = games.filter((game) => game.status === "final").length;

  if (!record) {
    return <span>{games.length === 1 ? "1 game" : `${games.length} games`}</span>;
  }

  return (
    <span>
      {record} · {finals === 1 ? "1 final" : `${finals} finals`}
    </span>
  );
}

function getTeamDisplayName(season: SeasonSummary) {
  const game = season.games[0];
  const sport = game?.sport || season.team.shortName || season.team.name;
  const level = game?.level;

  if (!level || /varsity/i.test(level) && /soccer|cross country|golf|wrestling|track/i.test(sport)) {
    return sport;
  }

  return /varsity/i.test(level) ? `Varsity ${sport}` : `${level} ${sport}`;
}

function getSchoolYearLabel(year: string) {
  const numericYear = Number(year);

  if (!Number.isInteger(numericYear)) {
    return year;
  }

  return `${numericYear}-${String(numericYear + 1).slice(-2)}`;
}

function getTeamHeroImage(team: TeamSummary, teamMedia: SportsTeamMedia | null) {
  if (teamMedia?.headerImage?.url) {
    return teamMedia.headerImage.url;
  }

  const metadata = getSportMetadataForTeam(team);

  if (metadata.family === "soccer") {
    return "/_wordpress-media/67f6b648d387a344-GirlsSoccerCelebration.jpeg";
  }

  return "/social-default.png";
}

function getNextGame(games: SportsGame[]) {
  return games.find((game) => game.status === "upcoming") ?? null;
}

function getRecentFinals(games: SportsGame[], limit = 5) {
  return games
    .filter((game) => game.status === "final")
    .slice()
    .reverse()
    .slice(0, limit);
}

function getGameResultLabel(game: SportsGame) {
  if (game.status !== "final" || game.wildcatsScore === null || game.opponentScore === null) {
    return getGameStatusLabel(game);
  }

  if (game.wildcatsScore > game.opponentScore) return `W ${getGameScoreText(game)}`;
  if (game.wildcatsScore < game.opponentScore) return `L ${getGameScoreText(game)}`;

  return `T ${getGameScoreText(game)}`;
}

function TeamHeader({
  activeTab,
  season,
  team,
  teamMedia
}: {
  activeTab: "home" | "schedule";
  season: SeasonSummary;
  team: TeamSummary;
  teamMedia: SportsTeamMedia | null;
}) {
  const metadata = getSportMetadataForTeam(team);
  const accentColor = teamMedia?.accentColor || metadata.color;
  const logo = teamMedia?.logo?.url || "/brand/weekly-wildcat-logo.svg";
  const record = formatRecord(season.record);

  return (
    <section className="team-hub-header" style={{ "--sport-accent": accentColor } as CSSProperties} aria-labelledby="team-heading">
      <img className="team-hub-header-image" src={getTeamHeroImage(team, teamMedia)} alt="" />
      <div className="team-hub-header-shade" />
      <div className="team-hub-header-content">
        <div className="team-hub-mark">
          <img src={logo} alt="" />
        </div>
        <div className="team-hub-title">
          <p>Ninety Six Wildcats</p>
          <h1 id="team-heading">{getTeamDisplayName(season)}</h1>
          <span>Ninety Six, South Carolina</span>
        </div>
        <div className="team-hub-season-card">
          <span>{getSchoolYearLabel(season.year)} Season</span>
          <strong>{record || "Record pending"}</strong>
          <nav aria-label={`${team.name} seasons`}>
            {team.seasons.map((year) => (
              <a className={year === season.year ? "sports-season-current" : ""} href={getSeasonHref(team, year)} key={year}>
                {getSchoolYearLabel(year)}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <TeamTabs activeTab={activeTab} season={season} team={team} />
    </section>
  );
}

function TeamTabs({ activeTab, season, team }: { activeTab: "home" | "schedule"; season: SeasonSummary; team: TeamSummary }) {
  const homeHref = getTeamHubHref(team);
  const scheduleHref = getSeasonHref(team, season.year);

  return (
    <nav className="team-hub-tabs" aria-label={`${team.name} team sections`}>
      <a aria-current={activeTab === "home" ? "page" : undefined} href={homeHref}>
        Home
      </a>
      <a href={`${homeHref}#team-news`}>News</a>
      <a aria-current={activeTab === "schedule" ? "page" : undefined} href={scheduleHref}>
        Schedule
      </a>
      <a href={`${homeHref}#team-roster`}>Roster</a>
      <a href={`${homeHref}#team-photos`}>Photos</a>
    </nav>
  );
}

function NextGameCard({ game }: { game: SportsGame | null }) {
  if (!game) {
    return <p className="empty-state sports-archive-empty">No future games are listed for this season.</p>;
  }

  const location = getScheduleLocationDisplay(game);

  return (
    <article className="team-next-game">
      <div>
        <p>{getGameSiteLabel(game) || "Game"}</p>
        <h3>{game.display.matchup || game.title}</h3>
        <span>{game.display.date || game.startDate || "TBA"}</span>
      </div>
      <dl>
        <div>
          <dt>Opponent</dt>
          <dd>{game.opponent || "Opponent TBA"}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{location.label}</dd>
        </div>
      </dl>
      <a href={getGameHref(game)}>Preview Game</a>
    </article>
  );
}

function RecentScoresList({ games }: { games: SportsGame[] }) {
  if (games.length === 0) {
    return <p className="empty-state sports-archive-empty">No final scores are listed for this season yet.</p>;
  }

  return (
    <div className="team-recent-score-list">
      {games.map((game) => (
        <article className="team-recent-score" key={game.id}>
          <span>{getGameResultLabel(game)}</span>
          <div>
            <h3>{game.opponent || game.display.matchup || game.title}</h3>
            <p>
              {game.display.date || game.startDate || "TBA"} · {getGameSiteLabel(game) || "Game"}
            </p>
          </div>
          <a href={getGameHref(game)}>Game Center</a>
        </article>
      ))}
    </div>
  );
}

export function SportsLandingView({ teams, teamMediaByKey, upcomingGames, recentScores, latestCoverage }: SportsLandingProps) {
  return (
    <div className="sports-archive-page">
      <BreadcrumbTrail items={[{ label: "Sports" }]} />
      <section className="sports-archive-hero" aria-labelledby="sports-heading">
        <p>Sports</p>
        <h1 id="sports-heading">Wildcat Teams</h1>
      </section>

      <div className="sports-landing-card-grid">
        <section className="sports-archive-section sports-landing-card sports-games-card" aria-labelledby="sports-current-heading">
          <SectionHeader
            id="sports-current-heading"
            title="Games"
            description="Upcoming events and recent finals from the Weekly Wildcat sports database."
            href="/sports/schedule/"
            actionLabel="Full Schedule"
          />
          <div className="sports-game-digest-groups">
            <section aria-labelledby="sports-upcoming-heading">
              <h3 id="sports-upcoming-heading">Upcoming</h3>
              <SportsGameDigestList games={upcomingGames} emptyMessage="No upcoming games are listed yet." mode="upcoming" />
            </section>
            <section aria-labelledby="sports-scores-heading">
              <h3 id="sports-scores-heading">Recent Scores</h3>
              <SportsGameDigestList games={recentScores} emptyMessage="No recent finals are listed yet." mode="scores" />
            </section>
          </div>
        </section>

        <section className="sports-archive-section sports-landing-card" aria-labelledby="sports-teams-heading">
          <SectionHeader id="sports-teams-heading" title="Teams" description="Permanent team hubs for schedules, results and coverage." />
          <SportsTeamDirectory teams={teams} teamMediaByKey={teamMediaByKey} />
        </section>
      </div>

      <section className="sports-archive-section" aria-labelledby="sports-coverage-heading">
        <SectionHeader
          id="sports-coverage-heading"
          title="Latest Sports Coverage"
          description="Stories from the Weekly Wildcat sports desk."
          href="/category/sports/"
          actionLabel="All Sports Stories"
        />
        <CoverageGrid posts={latestCoverage} />
      </section>
    </div>
  );
}

export function TeamHubView({ team, season, teamMedia, coverage }: TeamHubProps) {
  const nextGame = getNextGame(season.games);
  const recentFinals = getRecentFinals(season.games);
  const schedulePreview = season.games.slice(0, 12);

  return (
    <div className="sports-archive-page">
      <BreadcrumbTrail items={[{ label: "Sports", href: "/sports/" }, { label: team.name }]} />
      <TeamHeader activeTab="home" season={season} team={team} teamMedia={teamMedia} />

      <section className="team-home-grid" aria-label={`${team.name} home`}>
        <section className="sports-archive-section" aria-labelledby="team-next-game-heading">
          <SectionHeader id="team-next-game-heading" title="Next Game" description="The next scheduled game for this season." />
          <NextGameCard game={nextGame} />
        </section>

        <section className="sports-archive-section" aria-labelledby="team-recent-scores-heading">
          <SectionHeader
            id="team-recent-scores-heading"
            title="Recent Scores"
            description="The latest completed games."
            href={getSeasonHref(team, season.year)}
            actionLabel="Full Schedule"
          />
          <RecentScoresList games={recentFinals} />
        </section>
      </section>

      <section className="sports-archive-section" id="team-schedule" aria-labelledby="team-games-heading">
        <SectionHeader
          id="team-games-heading"
          title="Schedule"
          description={`A preview of the ${getSchoolYearLabel(season.year)} ${team.name} schedule.`}
          href={getSeasonHref(team, season.year)}
          actionLabel="View Full Schedule"
        />
        <SeasonScheduleTable games={schedulePreview} />
      </section>

      <section className="sports-archive-section" id="team-news" aria-labelledby="team-coverage-heading">
        <SectionHeader id="team-coverage-heading" title="Latest Team News" description="Weekly Wildcat coverage connected to this team." />
        <CoverageGrid posts={coverage} />
      </section>

      <section className="team-placeholder-grid" aria-label="Team extras">
        <section className="sports-archive-section" id="team-roster" aria-labelledby="team-roster-heading">
          <SectionHeader id="team-roster-heading" title="Roster" description="Roster data is not connected yet." />
          <p className="empty-state sports-archive-empty">Roster information will appear here when it becomes available.</p>
        </section>
        <section className="sports-archive-section" id="team-photos" aria-labelledby="team-photos-heading">
          <SectionHeader id="team-photos-heading" title="Photos" description="Related team galleries will appear here." />
          <p className="empty-state sports-archive-empty">No team photo galleries are available yet.</p>
        </section>
      </section>
    </div>
  );
}

export function SeasonArchiveView({ season, teamMedia, coverage }: SeasonPageProps) {
  return (
    <div className="sports-archive-page">
      <BreadcrumbTrail
        items={[
          { label: "Sports", href: "/sports/" },
          { label: season.team.name, href: getTeamHubHref(season.team) },
          { label: season.year }
        ]}
      />
      <TeamHeader activeTab="schedule" season={season} team={season.team} teamMedia={teamMedia} />

      <section className="sports-archive-section" aria-labelledby="season-schedule-heading">
        <SectionHeader
          id="season-schedule-heading"
          title="Full Schedule"
          description={`Every listed ${getSchoolYearLabel(season.year)} ${season.team.name} game from the Weekly Wildcat sports database.`}
        />
        <SeasonScheduleTable games={season.games} />
      </section>

      <section className="sports-archive-section" aria-labelledby="season-coverage-heading">
        <SectionHeader id="season-coverage-heading" title="Related Coverage" description="Stories linked to this team, season or game." />
        <CoverageGrid posts={coverage} />
      </section>
    </div>
  );
}

function SeasonScheduleTable({ games }: { games: SportsGame[] }) {
  if (games.length === 0) {
    return <p className="empty-state sports-archive-empty">No games are listed for this season yet.</p>;
  }

  return (
    <div className="sports-season-table-wrap">
      <table className="sports-season-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Opponent</th>
            <th scope="col">Site</th>
            <th scope="col">Location</th>
            <th scope="col">Status</th>
            <th scope="col">Score</th>
            <th scope="col">Game</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => {
            const location = getScheduleLocationDisplay(game);

            return (
              <tr key={game.id}>
                <td>
                  {game.startDate ? <time dateTime={game.startDate}>{game.display.date || formatDisplayDate(game.startDate)}</time> : "TBA"}
                </td>
                <td>{game.opponent || "Opponent TBA"}</td>
                <td>{getGameSiteLabel(game) || "TBA"}</td>
                <td>
                  <span className="sports-season-location">
                    {location.label}
                    {location.unconfirmed ? (
                      <span className="sports-location-note" role="img" aria-label="Location unconfirmed" tabIndex={0}>
                        i
                      </span>
                    ) : null}
                  </span>
                </td>
                <td>{getGameStatusLabel(game)}</td>
                <td>{getGameScoreText(game)}</td>
                <td>
                  <a href={getGameHref(game)}>Game Center</a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
