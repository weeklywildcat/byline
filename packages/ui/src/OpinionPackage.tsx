import { StoryCard } from "./StoryCard";
import { packageHeadingId } from "./package-dom";
import type { StoryView } from "./story-view";

export type ResolvedOpinionPackage = {
  packageId: string;
  heading: string;
  description: string;
  archiveLink: { enabled: boolean; href: string; label: string };
  lead: StoryView | null;
  rail: StoryView[];
  presentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
  fallbackAuthorName: string;
};

export type OpinionPackageProps = {
  package: ResolvedOpinionPackage;
};

export function OpinionPackage({ package: resolved }: OpinionPackageProps) {
  if (!resolved.lead) return null;

  const headingId = packageHeadingId(resolved.packageId, "opinion-heading");
  const hasHeaderCopy = Boolean(resolved.description) || resolved.archiveLink.enabled;

  return (
    <section className="opinion-package" aria-labelledby={headingId}>
      <div className="opinion-package-header">
        {hasHeaderCopy ? <div>
          <h2 id={headingId}>{resolved.heading}</h2>
          {resolved.description ? <p>{resolved.description}</p> : null}
        </div> : <h2 id={headingId}>{resolved.heading}</h2>}
        {resolved.archiveLink.enabled ? <a href={resolved.archiveLink.href}>{resolved.archiveLink.label}</a> : null}
      </div>
      <div className="opinion-package-layout">
        <StoryCard
          story={resolved.lead}
          variant="opinion-lead"
          showAuthor={resolved.presentation.showAuthor}
          showDeck={resolved.presentation.showDeck}
          fallbackAuthorName={resolved.fallbackAuthorName}
        />
        {resolved.rail.length ? (
          <div className="opinion-rail">
            {resolved.rail.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                variant="opinion"
                showAuthor={resolved.presentation.showAuthor}
                showDeck={resolved.presentation.showDeck}
                fallbackAuthorName={resolved.fallbackAuthorName}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
