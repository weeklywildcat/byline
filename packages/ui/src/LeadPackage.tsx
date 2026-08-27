import type { ReactNode } from "react";
import { StoryCard } from "./StoryCard";
import { packageHeadingId } from "./package-dom";
import type { StoryView } from "./story-view";

// The resolved lead package: everything the renderer needs, already selected and
// flattened. No CMS types, no fetching, no story selection. This is the single
// model that both the Next static export and Studio's preview render.
export type ResolvedLeadPackage = {
  packageId: string;
  mode?: "content" | "single-story" | "poll" | "calendar";
  heading?: string;
  lead: StoryView | null;
  latest: {
    heading: string;
    stories: StoryView[];
    showBylines: boolean;
  };
  utility: {
    // Already reconciled against the publication's enabled modules, so the
    // renderer never has to know what a feature flag is.
    poll: boolean;
    calendar: boolean;
    calendarLimit?: number;
    calendarHeading?: string;
  };
  presentation: {
    showDeck: boolean;
    opinionTreatment: boolean;
  };
  fallbackAuthorName: string;
  emptyMessage: string;
};

export type LeadPackageProps = {
  package: ResolvedLeadPackage;
  // The two utility modules are host-supplied: the poll is client-interactive and
  // the calendar's entries come from a different endpoint than stories do. Both
  // hosts pass the shared PollCard/ThisWeekCard components.
  pollSlot?: ReactNode;
  calendarSlot?: ReactNode;
  // Production mounts a small client script that trims the rail to the lead's
  // height. Studio has no equivalent, so it is injected rather than assumed.
  railLimiterSlot?: ReactNode;
};

// Extracted from apps/web/app/page.tsx. Class names, element order, ARIA
// attributes and the data- hooks are reproduced exactly: the Weekly Wildcat
// stylesheet and the rail limiter script both depend on them.
export function LeadPackage({ package: resolved, pollSlot, calendarSlot, railLimiterSlot }: LeadPackageProps) {
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

  const hasLatest = latest.stories.length > 0;
  // The section carries an aria-label rather than aria-labelledby. The pre-Studio
  // markup pointed at an id="lead-heading" that no element has ever had, which
  // leaves the section with no accessible name at all -- a dangling reference is
  // worse than none, because it also suppresses the fallback. There is no single
  // visible heading to point at either: the package holds the lead, The Latest
  // and the utility rail, so a literal name is the honest one.
  return (
    <section
      className={hasLatest ? "top-stories" : "top-stories top-stories-single"}
      aria-label="Top stories"
    >
      <div className="top-stories-layout" data-homepage-top-stories>
        {railLimiterSlot}
        <div className="live-lead" data-homepage-lead>
          <StoryCard
            story={lead}
            variant="lead"
            showDeck={presentation.showDeck}
            priority
            fallbackAuthorName={resolved.fallbackAuthorName}
          />
        </div>

        {hasLatest ? (
          <aside
            className="top-stories-rail"
            aria-labelledby={packageHeadingId(`${resolved.packageId}-latest`, "right-now-heading")}
          >
            <h2 id={packageHeadingId(`${resolved.packageId}-latest`, "right-now-heading")}>{latest.heading}</h2>
            <div className="right-now-list">
              {latest.stories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  variant="briefing"
                  showAuthor={latest.showBylines}
                  fallbackAuthorName={resolved.fallbackAuthorName}
                />
              ))}
            </div>
          </aside>
        ) : null}

        {hasUtility ? (
          <aside className="top-stories-left-rail" aria-label="Poll and school calendar">
            {utility.poll ? pollSlot : null}
            {utility.calendar ? calendarSlot : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
