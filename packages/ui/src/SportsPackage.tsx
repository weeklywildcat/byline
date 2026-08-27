import { Icon } from "./Icon";
import { packageHeadingId } from "./package-dom";
import { StoryCard } from "./StoryCard";
import {
  sportsPackageHasContent,
  type AthleteSpotlightView,
  type ResolvedSportsPackage,
  type SportsFixtureView,
  type SportsResultView,
  type SportsScheduleView
} from "./sports-view";

export type SportsPackageProps = {
  package: ResolvedSportsPackage;
};

// Extracted from apps/web/app/page.tsx, apps/web/components/SportsSchedulePanel.tsx
// and apps/web/components/SportsAthleteFeature.tsx. Class names, element order,
// heading ids and ARIA attributes are reproduced exactly: the Weekly Wildcat
// stylesheet targets them, so this is an extraction, not a redesign.

function AthleteFeature({ athlete }: { athlete: AthleteSpotlightView }) {
  return (
    <article className="sports-athlete-feature">
      {athlete.image ? (
        <a className="sports-athlete-image" href={athlete.href} aria-label={athlete.name}>
          <img
            src={athlete.image.src}
            alt={athlete.image.alt}
            width={athlete.image.width ?? undefined}
            height={athlete.image.height ?? undefined}
            loading="lazy"
          />
        </a>
      ) : null}
      <div className="sports-athlete-body">
        <p className="sports-athlete-eyebrow">{athlete.eyebrow}</p>
        <h3>
          <a href={athlete.href}>{athlete.name}</a>
        </h3>
        {athlete.sport ? <p className="sports-athlete-team">{athlete.sport}</p> : null}
        {athlete.blurb ? <p className="sports-athlete-blurb">{athlete.blurb}</p> : null}
        <a className="sports-athlete-link" href={athlete.href}>
          Meet {athlete.name} →
        </a>
      </div>
    </article>
  );
}

function ResultCard({ result }: { result: SportsResultView }) {
  return (
    <article className="field-result-card">
      <div className="field-result-summary">
        <span className="field-sport-icon">
          <Icon name={result.iconName} width={28} height={28} />
        </span>
        <div>
          <p className="field-card-label">{result.sportLabel}</p>
          <h4>{result.matchup}</h4>
        </div>
      </div>
      <div className="field-scoreboard" aria-label={result.scoreLabel ?? undefined}>
        <div className={`field-score-team${result.team.isWinner ? " field-score-team-winner" : ""}`}>
          <span>{result.team.label}</span>
          <strong>{result.team.score}</strong>
        </div>
        <div className={`field-score-team${result.opponent.isWinner ? " field-score-team-winner" : ""}`}>
          <span>{result.opponent.label}</span>
          <strong>{result.opponent.score}</strong>
        </div>
      </div>
      <div className="field-result-footer">
        <p>{result.verdict}</p>
        {result.context ? <span>{result.context}</span> : null}
      </div>
      {result.recapHref ? (
        <a className="field-game-link" href={result.recapHref}>
          Read recap →
        </a>
      ) : null}
    </article>
  );
}

function FixtureRow({ fixture }: { fixture: SportsFixtureView }) {
  return (
    <article className="field-upcoming-game">
      <div className="field-upcoming-date">
        {fixture.displayDate ? <time dateTime={fixture.isoDate}>{fixture.displayDate}</time> : null}
        {fixture.siteLabel ? <span>{fixture.siteLabel}</span> : null}
      </div>
      <div className="field-upcoming-main">
        <p>{fixture.sportLabel}</p>
        <h5>{fixture.matchup}</h5>
        {fixture.location ? <span>{fixture.location}</span> : null}
      </div>
    </article>
  );
}

/**
 * The schedule panel.
 *
 * The column arithmetic is presentation, not selection: the resolver decided
 * which games qualify, and this decides how many columns they occupy. The
 * "Upcoming" column deliberately still renders when there are finals but no
 * fixtures, carrying the empty message -- that is the pre-Studio behaviour.
 */
function SchedulePanel({ schedule, packageId }: { schedule: SportsScheduleView; packageId: string }) {
  const hasResults = schedule.results.length > 0;
  const hasUpcoming = schedule.upcoming.length > 0;
  const showUpcomingColumn = hasUpcoming || hasResults;
  const columnCount = [hasResults, showUpcomingColumn].filter(Boolean).length;

  const scheduleHeadingId = packageHeadingId(`${packageId}-schedule`, "field-schedule-heading");
  const resultsHeadingId = packageHeadingId(`${packageId}-results`, "recent-scores-heading");
  const upcomingHeadingId = packageHeadingId(`${packageId}-upcoming`, "upcoming-games-heading");

  return (
    <aside className="field-schedule" aria-labelledby={scheduleHeadingId}>
      <div className="field-schedule-header">
        <h3 id={scheduleHeadingId}>{schedule.panelHeading}</h3>
        <a href={schedule.fullScheduleLink.href}>{schedule.fullScheduleLink.label}</a>
      </div>

      <div className={`field-schedule-layout field-schedule-layout-${columnCount}`}>
        {hasResults ? (
          <section className="field-schedule-result" aria-labelledby={resultsHeadingId}>
            <h4 id={resultsHeadingId}>{schedule.scoresHeading}</h4>
            <div className="field-result-list">
              {schedule.results.map((result) => (
                <ResultCard key={result.id} result={result} />
              ))}
            </div>
          </section>
        ) : null}

        {showUpcomingColumn ? (
          <section className="field-schedule-upcoming" aria-labelledby={upcomingHeadingId}>
            <h4 id={upcomingHeadingId}>{schedule.upcomingHeading}</h4>
            {hasUpcoming ? (
              <div className="field-game-list">
                {schedule.upcoming.map((fixture) => (
                  <FixtureRow key={fixture.id} fixture={fixture} />
                ))}
              </div>
            ) : (
              <p className="field-upcoming-empty">{schedule.emptyUpcomingMessage}</p>
            )}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

export function SportsPackage({ package: resolved }: SportsPackageProps) {
  // The pre-Studio homepage rendered nothing at all when the package had no
  // content -- not an empty state -- so this reproduces that rather than
  // inventing a placeholder.
  if (!sportsPackageHasContent(resolved)) {
    return null;
  }

  const { lead, rail, athleteSpotlight, schedule, presentation } = resolved;
  const content = resolved.content ?? "full";
  const hasStories = Boolean(lead) || rail.length > 0;
  const hasRail = rail.length > 0 || Boolean(athleteSpotlight);
  const sectionHeadingId = packageHeadingId(resolved.packageId, "field-heading");

  return (
    <section className="from-field" aria-labelledby={sectionHeadingId}>
      <div className="section-header-row">
        <h2 id={sectionHeadingId}>{resolved.heading}</h2>
        {resolved.sectionLink ? <a href={resolved.sectionLink.href}>{resolved.sectionLink.label}</a> : null}
      </div>

      {content !== "schedule" && (hasStories || athleteSpotlight) ? (
        <div className="field-layout">
          {lead ? (
            <StoryCard
              story={lead}
              variant="field"
              showDeck={presentation.showDeck}
              showAuthor={presentation.showBylines}
              showReadLink={presentation.showReadLink !== false}
              fallbackAuthorName={resolved.fallbackAuthorName}
            />
          ) : null}
          {hasRail ? (
            <div className="field-rail">
              {rail.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  variant="briefing"
                  showAuthor={presentation.showBylines}
                  fallbackAuthorName={resolved.fallbackAuthorName}
                />
              ))}
              {athleteSpotlight ? <AthleteFeature athlete={athleteSpotlight} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {content !== "story" && schedule ? <SchedulePanel schedule={schedule} packageId={resolved.packageId} /> : null}
    </section>
  );
}
