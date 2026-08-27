import { StoryCard } from "./StoryCard";
import { packageHeadingId } from "./package-dom";
import type { StoryView } from "./story-view";

export type ResolvedInFocusPackage = {
  packageId: string;
  heading: string;
  story: StoryView | null;
  presentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
  fallbackAuthorName: string;
};

export type InFocusPackageProps = {
  package: ResolvedInFocusPackage;
};

export function InFocusPackage({ package: resolved }: InFocusPackageProps) {
  if (!resolved.story) return null;

  const headingId = packageHeadingId(resolved.packageId, "focus-heading");

  return (
    <section className="in-focus" aria-labelledby={headingId}>
      <div className="live-package-label" id={headingId}>{resolved.heading}</div>
      <StoryCard
        story={resolved.story}
        variant="focus"
        showAuthor={resolved.presentation.showAuthor}
        showDeck={resolved.presentation.showDeck}
        fallbackAuthorName={resolved.fallbackAuthorName}
      />
    </section>
  );
}
