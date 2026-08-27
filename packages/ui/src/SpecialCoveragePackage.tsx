import { StoryCard } from "./StoryCard";
import { packageHeadingId } from "./package-dom";
import type { StoryView } from "./story-view";

export type ResolvedSpecialCoveragePackage = {
  packageId: string;
  heading: string;
  stories: StoryView[];
  leadPresentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
  supportingPresentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
  fallbackAuthorName: string;
};

export type SpecialCoveragePackageProps = {
  package: ResolvedSpecialCoveragePackage;
};

export function SpecialCoveragePackage({ package: resolved }: SpecialCoveragePackageProps) {
  if (!resolved.stories.length) return null;

  const headingId = packageHeadingId(resolved.packageId, "special-coverage-heading");

  return (
    <section className="special-coverage" aria-labelledby={headingId}>
      <div className="live-package-label" id={headingId}>{resolved.heading}</div>
      <div className={resolved.stories.length > 1 ? "special-coverage-layout" : "special-coverage-layout special-coverage-layout-single"}>
        {resolved.stories.map((story, index) => {
          const presentation = index === 0 ? resolved.leadPresentation : resolved.supportingPresentation;

          return (
            <StoryCard
              key={story.id}
              story={story}
              variant={index === 0 ? "special" : "briefing"}
              showAuthor={presentation.showAuthor}
              showDeck={presentation.showDeck}
              fallbackAuthorName={resolved.fallbackAuthorName}
            />
          );
        })}
      </div>
    </section>
  );
}
