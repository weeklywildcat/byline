import { StoryCard } from "./StoryCard";
import { sportsPackageHasContent } from "./sports-view";
import type { SportsPackageProps } from "./SportsPackage";

// The Editorial theme's treatment of the same resolved sports package.
//
// This exists to prove the theme contract: identical package configuration,
// identical resolver, identical resolved data, rendered with a different
// editorial structure. Where Weekly Wildcat runs a broadsheet sports front --
// a lead story beside a rail, with the scoreboard panel underneath -- Editorial
// leads with the scoreboard as a running ticker, then the stories as a even
// column set, and treats the athlete spotlight as a pull-quote style aside.
//
// Note what is *not* different: which stories were chosen, which games
// qualified, and every formatting decision inside them. A theme changes
// presentation only, and it cannot re-enable a module the resolver switched off.
export function EditorialSportsPackage({ package: resolved }: SportsPackageProps) {
  if (!sportsPackageHasContent(resolved)) {
    return null;
  }

  const { lead, rail, athleteSpotlight, schedule, presentation } = resolved;
  const stories = [...(lead ? [lead] : []), ...rail];

  return (
    <section className="editorial-sports" aria-labelledby="editorial-sports-heading">
      <div className="editorial-sports-header">
        <h2 id="editorial-sports-heading">{resolved.heading}</h2>
        <a href={resolved.sectionLink.href}>{resolved.sectionLink.label}</a>
      </div>

      {schedule && schedule.results.length > 0 ? (
        <ol className="editorial-sports-ticker" aria-label={schedule.scoresHeading}>
          {schedule.results.map((result) => (
            <li key={result.id} className="editorial-sports-ticker-item">
              <span className="editorial-sports-ticker-sport">{result.sportLabel}</span>
              <span className="editorial-sports-ticker-score">
                {result.team.label} {result.team.score} &middot; {result.opponent.label} {result.opponent.score}
              </span>
              <span className="editorial-sports-ticker-verdict">{result.verdict}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {stories.length > 0 ? (
        <div className="editorial-sports-columns">
          {stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              variant="more-compact"
              showDeck={presentation.showDeck}
              showAuthor={presentation.showBylines}
              fallbackAuthorName={resolved.fallbackAuthorName}
            />
          ))}
        </div>
      ) : null}

      {athleteSpotlight ? (
        <aside className="editorial-sports-athlete" aria-label={athleteSpotlight.eyebrow}>
          <p className="editorial-sports-athlete-eyebrow">{athleteSpotlight.eyebrow}</p>
          <h3>
            <a href={athleteSpotlight.href}>{athleteSpotlight.name}</a>
          </h3>
          {athleteSpotlight.sport ? <p>{athleteSpotlight.sport}</p> : null}
          {athleteSpotlight.blurb ? <blockquote>{athleteSpotlight.blurb}</blockquote> : null}
        </aside>
      ) : null}

      {schedule && schedule.upcoming.length > 0 ? (
        <div className="editorial-sports-fixtures">
          <h3>{schedule.upcomingHeading}</h3>
          <table>
            <tbody>
              {schedule.upcoming.map((fixture) => (
                <tr key={fixture.id}>
                  <th scope="row">
                    {fixture.displayDate ? <time dateTime={fixture.isoDate}>{fixture.displayDate}</time> : "TBD"}
                  </th>
                  <td>{fixture.matchup}</td>
                  <td>{[fixture.siteLabel, fixture.location].filter(Boolean).join(" / ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
