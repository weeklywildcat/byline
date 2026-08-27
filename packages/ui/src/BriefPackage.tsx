import { StoryCard } from "./StoryCard";
import { packageHeadingId } from "./package-dom";
import type { StoryView } from "./story-view";

export type ResolvedBriefPackage = {
  packageId: string;
  heading: string;
  lead: StoryView | null;
  rail: StoryView[];
  presentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
  fallbackAuthorName: string;
};

export type BriefPackageProps = {
  package: ResolvedBriefPackage;
};

export function BriefPackage({ package: resolved }: BriefPackageProps) {
  if (!resolved.lead) return null;

  const headingId = packageHeadingId(resolved.packageId, "brief-heading");
  return (
    <section className="the-brief" aria-labelledby={headingId}>
      <h2 id={headingId}>{resolved.heading}</h2>
      <div className="brief-digest-layout">
        <StoryCard
          story={resolved.lead}
          variant="brief-lead"
          showAuthor={resolved.presentation.showAuthor}
          showDeck={resolved.presentation.showDeck}
          fallbackAuthorName={resolved.fallbackAuthorName}
        />
        {resolved.rail.length ? (
          <div className="brief-support-list">
            {resolved.rail.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                variant="row"
                showAuthor={resolved.presentation.showAuthor}
                fallbackAuthorName={resolved.fallbackAuthorName}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
