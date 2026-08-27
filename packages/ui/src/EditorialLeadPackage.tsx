import { StoryCard } from "./StoryCard";
import type { LeadPackageProps } from "./LeadPackage";

// The Editorial theme's treatment of the same resolved lead package.
//
// This exists to prove the theme contract: identical package configuration and
// identical resolved data, rendered with a different editorial structure. Where
// Weekly Wildcat runs a three-column broadsheet front with two rails, Editorial
// runs a single full-bleed lead with the latest stories as a horizontal strip
// beneath it and the utility modules last.
//
// Note what is *not* different: the story selection, the settings, and the view
// model. A theme changes presentation only.
export function EditorialLeadPackage({ package: resolved, pollSlot, calendarSlot }: LeadPackageProps) {
  const { lead, latest, utility, presentation } = resolved;

  if (!lead) {
    return <p className="empty-state">{resolved.emptyMessage}</p>;
  }

  const hasUtility = utility.poll || utility.calendar;

  return (
    <section className="editorial-lead" aria-labelledby="editorial-lead-heading">
      <div className="editorial-lead-main">
        <StoryCard
          story={lead}
          variant="focus"
          showDeck={presentation.showDeck}
          showAuthor
          priority
          fallbackAuthorName={resolved.fallbackAuthorName}
        />
      </div>

      {latest.stories.length > 0 ? (
        <div className="editorial-lead-strip">
          <h2 id="editorial-lead-heading">{latest.heading}</h2>
          <div className="editorial-lead-strip-items">
            {latest.stories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                variant="more-compact"
                showAuthor={latest.showBylines}
                fallbackAuthorName={resolved.fallbackAuthorName}
              />
            ))}
          </div>
        </div>
      ) : null}

      {hasUtility ? (
        <div className="editorial-lead-utility">
          {utility.poll ? pollSlot : null}
          {utility.calendar ? calendarSlot : null}
        </div>
      ) : null}
    </section>
  );
}
