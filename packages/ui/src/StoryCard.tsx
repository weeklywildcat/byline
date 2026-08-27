import type { ReactNode } from "react";
import type { StoryView } from "./story-view";

// Extracted verbatim from apps/web/components/HomepageStory.tsx. The class names
// and element order are load-bearing during compatibility migration: the Weekly
// Wildcat stylesheet targets them, so this is an extraction, not a redesign.
export type StoryCardVariant =
  | "lead"
  | "briefing"
  | "brief-lead"
  | "row"
  | "focus"
  | "opinion"
  | "opinion-lead"
  | "field"
  | "grid"
  | "more-lead"
  | "more-compact"
  | "special"
  | "athlete";

export type StoryCardProps = {
  story: StoryView;
  variant: StoryCardVariant;
  showAuthor?: boolean;
  showDeck?: boolean;
  showReadingTime?: boolean;
  showReadLink?: boolean;
  priority?: boolean;
  // Falls back to the publication's staff byline when a story has no author.
  fallbackAuthorName: string;
};

export function StoryCard({
  story,
  variant,
  showAuthor = false,
  showDeck = false,
  showReadingTime = false,
  showReadLink = false,
  priority = false,
  fallbackAuthorName
}: StoryCardProps): ReactNode {
  const hasImage = Boolean(story.image?.src);
  const className = [
    "home-story",
    `home-story-${variant}`,
    hasImage ? "" : "home-story-no-image"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className}>
      {story.image ? (
        <a className="home-story-image" href={story.href} aria-label={story.title}>
          <img
            src={story.image.src}
            alt={story.image.alt}
            width={story.image.width ?? undefined}
            height={story.image.height ?? undefined}
            loading={priority ? "eager" : "lazy"}
          />
        </a>
      ) : null}

      <div className="home-story-body">
        <div className="home-story-meta">
          {story.category ? (
            <a className="home-story-category" href={story.category.href}>
              {story.category.name}
            </a>
          ) : null}
          <time dateTime={story.isoDate}>{story.displayDate}</time>
          {showReadingTime && story.readingTime ? <span>{story.readingTime}</span> : null}
        </div>

        <h2>
          <a href={story.href}>{story.title}</a>
        </h2>

        {showDeck && story.deck ? (
          story.deckIsHtml ? (
            <div className="home-story-deck" dangerouslySetInnerHTML={{ __html: story.deck }} />
          ) : (
            <p className="home-story-deck">{story.deck}</p>
          )
        ) : null}

        {showAuthor ? (
          <p className="home-story-author">
            By{" "}
            {story.author ? (
              story.author.href ? (
                <a href={story.author.href}>{story.author.name}</a>
              ) : (
                <span>{story.author.name}</span>
              )
            ) : (
              <span>{fallbackAuthorName}</span>
            )}
          </p>
        ) : null}

        {showReadLink ? (
          <a className="home-story-read-link" href={story.href}>
            Read story →
          </a>
        ) : null}
      </div>
    </article>
  );
}
