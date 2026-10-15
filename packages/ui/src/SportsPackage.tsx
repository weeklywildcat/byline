import { packageHeadingId } from "./package-dom";
import { StoryCard } from "./StoryCard";
import { sportsPackageHasContent, type AthleteSpotlightView, type ResolvedSportsPackage } from "./sports-view";

export type SportsPackageProps = {
  package: ResolvedSportsPackage;
};

// Extracted from apps/web/app/page.tsx and apps/web/components/SportsAthleteFeature.tsx.
// The homepage sports package is stories only: scores and fixtures live on the
// sports schedule page, not in this package.

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

export function SportsPackage({ package: resolved }: SportsPackageProps) {
  // The pre-Studio homepage rendered nothing at all when the package had no
  // content -- not an empty state -- so this reproduces that rather than
  // inventing a placeholder.
  if (!sportsPackageHasContent(resolved)) {
    return null;
  }

  const { lead, rail, athleteSpotlight, presentation } = resolved;
  const content = resolved.content ?? "full";
  const hasStories = Boolean(lead) || rail.length > 0;
  // Schedule-only packages and packages whose only content was the scoreboard
  // have nothing left to show now that the homepage carries stories only.
  if (content === "schedule" || (!hasStories && !athleteSpotlight)) {
    return null;
  }

  const hasRail = rail.length > 0 || Boolean(athleteSpotlight);
  const simpleStory = content === "story" && Boolean(lead) && !hasRail;
  const sectionHeadingId = packageHeadingId(resolved.packageId, "field-heading");

  return (
    <section className="from-field" aria-labelledby={sectionHeadingId}>
      <div className="section-header-row">
        <h2 id={sectionHeadingId}>{resolved.heading}</h2>
        {resolved.sectionLink ? <a href={resolved.sectionLink.href}>{resolved.sectionLink.label}</a> : null}
      </div>

      {simpleStory ? (
        <StoryCard
          story={lead!}
          variant="field"
          showDeck={presentation.showDeck}
          showAuthor={presentation.showBylines}
          showReadLink={presentation.showReadLink !== false}
          fallbackAuthorName={resolved.fallbackAuthorName}
        />
      ) : (
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
      )}
    </section>
  );
}
