import type { CSSProperties } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { SiteIcon } from "@/components/SiteIcon";
import { SportsSeasonSelector } from "@/components/SportsSeasonSelector";
import { StoryTeaser } from "@/components/StoryTeaser";
import type { SportsGame, SportsRoster, SportsTeamMedia } from "@/lib/headless";
import { formatDisplayDate } from "@/lib/format";
import { getPublicationConfig } from "@/lib/publication";
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
  normalizeSportsSeason,
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
      <a className="sports-breadcrumbs-mobile" href="/sports/">← Sports</a>
      <span className="sports-breadcrumbs-full">
        <a href="/">Home</a>
        {items.map((item) => (
          <span key={`${item.href ?? item.label}-${item.label}`}>
            <span aria-hidden="true">/</span>
            {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
          </span>
        ))}
      </span>
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
  return teamMediaByKey.get(team.teamKey) ?? null;
}

function SportsTeamDirectory({ teams, teamMediaByKey }: { teams: TeamSummary[]; teamMediaByKey: Map<string, SportsTeamMedia> }) {
  const activeTeams = teams.filter((team) => team.active);

  if (activeTeams.length === 0) {
    return <p className="empty-state sports-archive-empty">No team hubs are available yet.</p>;
  }

  return (
    <div className="sports-team-directory">
      {activeTeams.map((team) => {
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
  const finals = games.filter((game) => ["final", "forfeit", "tie"].includes(game.status)).length;

  if (!record) {
    return <span>{games.length === 1 ? "1 game" : `${games.length} games`}</span>;
  }

  return (
    <span>
      {record} · {finals === 1 ? "1 final" : `${finals} finals`}
    </span>
  );
}

function getSchoolYearLabel(year: string) {
  return normalizeSportsSeason(year) || year;
}

function getTeamHeroImage(team: TeamSummary, teamMedia: SportsTeamMedia | null) {
  if (teamMedia?.headerImage?.url) {
    return teamMedia.headerImage.url;
  }

  const metadata = getSportMetadataForTeam(team);
  const publication = getPublicationConfig();
  if (publication.appearance.theme === "weekly-wildcat" && metadata.family === "soccer") {
    return "/_wordpress-media/67f6b648d387a344-GirlsSoccerCelebration.jpeg";
  }

  return null;
}

function getTeamInitials(team: TeamSummary) {
  return (team.shortName || team.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function formatGameDateParts(game: SportsGame) {
  const date = game.startDate ? new Date(game.startDate) : null;
  if (!date || Number.isNaN(date.getTime())) return { month: "TBA", day: "", date: "TBA", time: "Time TBA" };

  return {
    month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date),
    date: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date),
    time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)
  };
}

function getNextGame(games: SportsGame[]) {
  return games.find((game) => game.status === "upcoming") ?? null;
}

function getRecentFinals(games: SportsGame[], limit = 5) {
  return games
    .filter((game) => ["final", "forfeit", "tie"].includes(game.status))
    .slice()
    .reverse()
    .slice(0, limit);
}

function getGameResultLabel(game: SportsGame) {
  if (game.status === "forfeit") return "Forfeit";
  if (game.status === "tie") {
    return game.wildcatsScore === null || game.opponentScore === null
      ? "Tie"
      : `T ${getGameScoreText(game)}`;
  }
  if (!["final", "tie"].includes(game.status) || game.wildcatsScore === null || game.opponentScore === null) {
    return getGameStatusLabel(game);
  }

  if (game.wildcatsScore > game.opponentScore) return `W ${getGameScoreText(game)}`;
  if (game.wildcatsScore < game.opponentScore) return `L ${getGameScoreText(game)}`;

  return `T ${getGameScoreText(game)}`;
}

function TeamHeader({
  season,
  team,
  teamMedia
}: {
  season: SeasonSummary;
  team: TeamSummary;
  teamMedia: SportsTeamMedia | null;
}) {
  const publication = getPublicationConfig();
  const metadata = getSportMetadataForTeam(team);
  const accentColor = teamMedia?.accentColor || metadata.color;
  const logo = teamMedia?.logo?.url || "";
  const heroImage = getTeamHeroImage(team, teamMedia);
  const record = formatRecord(season.record);
  const focalPoint = teamMedia?.headerImageFocalPoint;
  const imagePosition = `${focalPoint?.x ?? 50}% ${focalPoint?.y ?? 50}%`;
  const identity = [teamMedia?.sport, teamMedia?.genderDivision, teamMedia?.level].filter(Boolean).join(" · ");

  return (
    <section
      className={`team-hub-header${heroImage ? " team-hub-header-has-image" : " team-hub-header-no-image"}`}
      style={{ "--sport-accent": accentColor } as CSSProperties}
      aria-labelledby="team-heading"
    >
      {heroImage ? <img className="team-hub-header-image" src={heroImage ?? undefined} alt="" style={{ objectPosition: imagePosition }} /> : null}
      <div className="team-hub-header-shade" />
      <div className="team-hub-header-content">
        <div className="team-hub-mark">
          {logo ? <img src={logo} alt="" /> : <span aria-hidden="true">{getTeamInitials(team)}</span>}
        </div>
        <div className="team-hub-title">
          <p>{identity || teamMedia?.scoreboardName || publication.identity.shortName}</p>
          <h1 id="team-heading">{team.name}</h1>
          <span>
            {getSchoolYearLabel(season.year)} season · {record || "Record pending"}
          </span>
        </div>
      </div>
    </section>
  );
}

function TeamNavigation({
  activeTab,
  season,
  team
}: {
  activeTab: "home" | "schedule";
  season: SeasonSummary;
  team: TeamSummary;
}) {
  const homeHref = getTeamHubHref(team);
  const scheduleHref = getSeasonHref(team, season.year);
  const rosterHref = `${activeTab === "schedule" ? scheduleHref : homeHref}#team-roster`;

  return (
    <div className="team-hub-navigation" style={{ "--sport-accent": team.team?.accentColor || getSportMetadataForTeam(team).color } as CSSProperties}>
      <nav className="team-hub-tabs" aria-label={`${team.name} team sections`}>
        <a aria-current={activeTab === "home" ? "page" : undefined} href={homeHref}>Overview</a>
        <a aria-current={activeTab === "schedule" ? "page" : undefined} href={scheduleHref}>Schedule</a>
        <a href={rosterHref}>Roster</a>
        <a href={`${homeHref}#team-news`}>News</a>
      </nav>
      <SportsSeasonSelector
        currentYear={season.year}
        seasons={team.seasons.map((year) => ({
          href: getSeasonHref(team, year),
          label: getSchoolYearLabel(year),
          year
        }))}
      />
    </div>
  );
}

function SeasonSnapshot({ season }: { season: SeasonSummary }) {
  const nextGame = getNextGame(season.games);
  const lastGame = getRecentFinals(season.games, 1)[0] ?? null;
  const record = formatRecord(season.record);

  return (
    <dl className="team-season-snapshot" aria-label={`${season.year} season snapshot`}>
      <div><dt>Record</dt><dd>{record || "—"}</dd></div>
      <div><dt>Games</dt><dd>{season.games.length}</dd></div>
      <div><dt>Last</dt><dd>{lastGame ? getGameResultLabel(lastGame) : "—"}</dd></div>
      <div><dt>Next</dt><dd>{nextGame ? formatGameDateParts(nextGame).date : "—"}</dd></div>
    </dl>
  );
}

function NextGameCard({ game, team }: { game: SportsGame | null; team: TeamSummary }) {
  if (!game) {
    return <p className="team-season-note">No upcoming game is currently listed. Check the full schedule for season details.</p>;
  }

  const location = getScheduleLocationDisplay(game);
  const date = formatGameDateParts(game);

  return (
    <article className="team-next-game">
      <div className="team-next-game-date">
        <span>{date.month}</span>
        <strong>{date.day || "—"}</strong>
        <time dateTime={game.startDate}>{date.time}</time>
      </div>
      <div className="team-next-game-matchup">
        <p>{getGameSiteLabel(game) || "Game"} · {getGameStatusLabel(game)}</p>
        <span>{team.shortName || team.name}</span>
        <b aria-hidden="true">{game.site === "away" ? "at" : "vs."}</b>
        <h3>{game.opponent || "Opponent TBA"}</h3>
        <small>{location.label}</small>
      </div>
      <a href={getGameHref(game)}>Game Center <span aria-hidden="true">→</span></a>
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
        <a className="team-recent-score" href={getGameHref(game)} key={game.id}>
          <span>{getGameResultLabel(game).split(" ")[0]}</span>
          <strong>{getGameScoreText(game)}</strong>
          <div>
            <h3>{game.opponent || game.display.matchup || game.title}</h3>
            <p>
              {game.display.date || game.startDate || "TBA"} · {getGameSiteLabel(game) || "Game"}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

function TeamCoverage({ posts }: { posts: WordPressPost[] }) {
  if (posts.length === 0) {
    return <p className="empty-state sports-archive-empty">No related coverage has been published yet.</p>;
  }

  const [lead, ...followups] = posts;
  return (
    <div className="team-coverage-layout">
      <StoryTeaser post={lead} variant="lead" priority />
      {followups.length > 0 ? (
        <div className="team-coverage-followups">
          {followups.map((post) => <StoryTeaser key={post.id} post={post} variant="list" />)}
        </div>
      ) : null}
    </div>
  );
}

function TeamSchedulePreview({ games }: { games: SportsGame[] }) {
  if (games.length === 0) {
    return <p className="empty-state sports-archive-empty">No upcoming games are listed for this season.</p>;
  }

  return (
    <div className="team-schedule-preview">
      {games.map((game) => {
        const date = formatGameDateParts(game);
        return (
          <a href={getGameHref(game)} key={game.id}>
            <time dateTime={game.startDate}><span>{date.month}</span><strong>{date.day}</strong></time>
            <b>{game.opponent || "Opponent TBA"}</b>
            <span>{getGameSiteLabel(game) || "TBA"}</span>
            <small>{date.time}</small>
          </a>
        );
      })}
    </div>
  );
}

function getStaffInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function StaffCards({ staff }: { staff: SportsRoster["staff"] }) {
  const managers = staff.filter((member) => /student\s+manager/i.test(member.role));
  const teamStaff = staff.filter((member) => !/student\s+manager/i.test(member.role));
  const groups = [
    teamStaff.length > 0 ? { title: teamStaff.some((member) => /coach/i.test(member.role)) ? "Coaching Staff" : "Team Staff", members: teamStaff } : null,
    managers.length > 0 ? { title: "Student Managers", members: managers } : null
  ].filter((group): group is { title: string; members: SportsRoster["staff"] } => Boolean(group));

  return (
    <div className="team-staff-groups">
      {groups.map((group) => (
        <section className="team-roster-staff" aria-labelledby={`team-staff-${group.title.replace(/\s+/g, "-").toLowerCase()}`} key={group.title}>
          <h3 id={`team-staff-${group.title.replace(/\s+/g, "-").toLowerCase()}`}>{group.title}</h3>
          <div className="team-roster-staff-list">
            {group.members.map((member) => (
              <article className={/\bhead coach\b/i.test(member.role) ? "is-head-coach" : undefined} key={member.id}>
                <div className="team-staff-portrait">
                  {member.image?.url ? <img src={member.image.url} alt={member.image.alt || `${member.name}, ${member.role || "team staff"}`} /> : <span aria-hidden="true">{getStaffInitials(member.name)}</span>}
                </div>
                <strong>{member.name}</strong>
                <span>{member.role || "Team Staff"}</span>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TeamRoster({ roster, season, teamName }: { roster: SportsRoster | null; season: string; teamName: string }) {
  const players = roster?.players ?? [];
  const staff = roster?.staff ?? [];
  const showNumber = players.some((player) => player.number !== "");
  const showPosition = players.some((player) => player.position !== "");
  const showGrade = players.some((player) => player.grade !== "");

  return (
    <section className="sports-archive-section team-roster-section" id="team-roster" aria-labelledby="team-roster-heading">
      <SectionHeader
        id="team-roster-heading"
        title={`${getSchoolYearLabel(season)} Roster`}
        description={`Student-athletes and staff for ${teamName}.`}
      />

      {players.length === 0 && staff.length === 0 ? (
        <p className="empty-state sports-archive-empty">No roster has been published for this school year.</p>
      ) : (
        <div className="team-roster-content">
          {staff.length > 0 ? <StaffCards staff={staff} /> : null}

          {players.length > 0 ? (
            <>
            <div className="team-roster-table-wrap team-roster-desktop">
              <table className="team-roster-table">
                <thead>
                  <tr>
                    {showNumber ? <th scope="col">No.</th> : null}
                    <th scope="col">Student-Athlete</th>
                    {showPosition ? <th scope="col">Position / Event</th> : null}
                    {showGrade ? <th scope="col">Grade</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.id}>
                      {showNumber ? <td>{player.number || "—"}</td> : null}
                      <th scope="row">{player.name}</th>
                      {showPosition ? <td>{player.position || "—"}</td> : null}
                      {showGrade ? <td>{player.grade || "—"}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="team-roster-mobile" aria-label={`${teamName} student-athletes`}>
              {players.map((player) => (
                <li key={player.id}>
                  <span>{player.number ? `#${player.number}` : "—"}</span>
                  <div><strong>{player.name}</strong><small>{[player.position, player.grade].filter(Boolean).join(" · ") || "Student-Athlete"}</small></div>
                </li>
              ))}
            </ul>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function SportsLandingView({ teams, teamMediaByKey, upcomingGames, recentScores, latestCoverage }: SportsLandingProps) {
  const publication = getPublicationConfig();
  return (
    <div className="sports-archive-page">
      <BreadcrumbTrail items={[{ label: "Sports" }]} />
      <section className="sports-archive-hero" aria-labelledby="sports-heading">
        <p>Sports</p>
        <h1 id="sports-heading">{publication.identity.shortName} Teams</h1>
      </section>

      <div className="sports-landing-card-grid">
        <section className="sports-archive-section sports-landing-card sports-games-card" aria-labelledby="sports-current-heading">
          <SectionHeader
            id="sports-current-heading"
            title="Games"
            description={`Upcoming events and recent finals from the ${publication.identity.shortName} sports database.`}
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
          description={`Stories from the ${publication.identity.shortName} sports desk.`}
          href="/category/sports/"
          actionLabel="All Sports Stories"
        />
        <CoverageGrid posts={latestCoverage} />
      </section>
    </div>
  );
}

export function TeamHubView({ team, season, teamMedia, coverage }: TeamHubProps) {
  const publication = getPublicationConfig();
  const nextGame = getNextGame(season.games);
  const recentFinals = getRecentFinals(season.games);
  const schedulePreview = season.games.filter((game) => game.status === "upcoming").slice(0, 4);

  return (
    <div className="sports-archive-page" style={{ "--sport-accent": teamMedia?.accentColor || getSportMetadataForTeam(team).color } as CSSProperties}>
      <BreadcrumbTrail items={[{ label: "Sports", href: "/sports/" }, { label: team.name }]} />
      <TeamHeader season={season} team={team} teamMedia={teamMedia} />
      <TeamNavigation activeTab="home" season={season} team={team} />
      <SeasonSnapshot season={season} />

      <section className="sports-archive-section team-next-game-section" aria-labelledby="team-next-game-heading">
        <SectionHeader id="team-next-game-heading" title="Next Game" description="The next scheduled game for this season." />
        <NextGameCard game={nextGame} team={team} />
      </section>

      <section className="sports-archive-section team-news-section" id="team-news" aria-labelledby="team-coverage-heading">
        <SectionHeader id="team-coverage-heading" title="Latest Team News" description={`${publication.identity.shortName} coverage explicitly connected to this team.`} />
        <TeamCoverage posts={coverage} />
      </section>

      <section className="sports-archive-section" id="team-schedule" aria-labelledby="team-games-heading">
        <SectionHeader
          id="team-games-heading"
          title="Schedule"
          description={`A preview of the ${getSchoolYearLabel(season.year)} ${team.name} schedule.`}
          href={getSeasonHref(team, season.year)}
          actionLabel="View Full Schedule"
        />
        <TeamSchedulePreview games={schedulePreview} />
      </section>

      <section className="sports-archive-section" aria-labelledby="team-recent-scores-heading">
        <SectionHeader
          id="team-recent-scores-heading"
          title="Recent Results"
          description="The latest completed games."
          href={getSeasonHref(team, season.year)}
          actionLabel="Full Schedule"
        />
        <RecentScoresList games={recentFinals} />
      </section>

      <TeamRoster roster={season.roster} season={season.year} teamName={team.name} />
    </div>
  );
}

export function SeasonArchiveView({ season, teamMedia, coverage }: SeasonPageProps) {
  const publication = getPublicationConfig();
  return (
    <div className="sports-archive-page" style={{ "--sport-accent": teamMedia?.accentColor || getSportMetadataForTeam(season.team).color } as CSSProperties}>
      <BreadcrumbTrail
        items={[
          { label: "Sports", href: "/sports/" },
          { label: season.team.name, href: getTeamHubHref(season.team) },
          { label: season.year }
        ]}
      />
      <TeamHeader season={season} team={season.team} teamMedia={teamMedia} />
      <TeamNavigation activeTab="schedule" season={season} team={season.team} />
      <SeasonSnapshot season={season} />

      <section className="sports-archive-section" aria-labelledby="season-schedule-heading">
        <SectionHeader
          id="season-schedule-heading"
          title="Full Schedule"
          description={`Every listed ${getSchoolYearLabel(season.year)} ${season.team.name} game from the ${publication.identity.shortName} sports database.`}
        />
        <SeasonScheduleTable games={season.games} />
      </section>

      <TeamRoster roster={season.roster} season={season.year} teamName={season.team.name} />

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
