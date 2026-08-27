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
  const mode = resolved.mode ?? "content";
  const hasUtility = utility.poll || utility.calendar;

  if (mode === "poll" || mode === "calendar") {
    if (!hasUtility) return null;

    return (
      <section className="byline-design-utility">
        {mode === "poll" && utility.poll ? pollSlot : null}
        {mode === "calendar" && utility.calendar ? calendarSlot : null}
      </section>
    );
  }

  if (mode === "single-story") {
    if (!lead) return null;

    return (
      <section className="top-stories top-stories-single" aria-label={resolved.heading || "Top story"}>
        <StoryCard
          story={lead}
          variant="lead"
          showDeck={presentation.showDeck}
          priority
          fallbackAuthorName={resolved.fallbackAuthorName}
        />
      </section>
    );
  }

  if (!lead) {
    return <p className="byline-package-empty-state">{resolved.emptyMessage}</p>;
  }

  return (
    // Same fix as the Weekly Wildcat renderer, and for a second reason here: the
    // heading this pointed at lives inside the "has latest stories" branch, so
    // the reference dangled whenever the strip was empty.
    <section className="editorial-lead" aria-label="Top stories">
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
          <h2>{latest.heading}</h2>
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
