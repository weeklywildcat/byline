import type { ReactNode } from "react";
import type { ImageCropShape } from "@byline/core";
import { StoryImage } from "./StoryImage";
import { storyImageAttributes, type StoryView } from "./story-view";

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
  // Off inside a section's own package, where every story shares the label.
  showCategory?: boolean;
  priority?: boolean;
  // Falls back to the publication's staff byline when a story has no author.
  fallbackAuthorName: string;
};

// Variants whose image is large enough to carry a credit line. Thumbnails
// (briefing, row, more-compact) stay clean.
const CREDITED_VARIANTS = new Set<StoryCardVariant>([
  "lead",
  "brief-lead",
  "focus",
  "opinion-lead",
  "field",
  "more-lead",
  "special",
  "athlete"
]);

// The crop each variant's image shows; matches the aspect ratios in the Weekly
// Wildcat stylesheet (.home-story-* .home-story-image img). Opinion leads are
// 4:3 on wide screens and 16:9 on phones; the focal point covers both.
export function storyCardImageShape(variant: StoryCardVariant): ImageCropShape {
  if (variant === "brief-lead" || variant === "special") return "wide";
  if (variant === "athlete") return "portrait";
  if (variant === "opinion-lead") return "standard";
  return "card";
}

// Matches the legacy HomepageStory widths so the browser picks a file that fits.
export function storyCardImageSizes(variant: StoryCardVariant) {
  if (variant === "lead" || variant === "brief-lead" || variant === "more-lead") return "(max-width: 900px) 100vw, 62vw";
  if (variant === "row" || variant === "briefing" || variant === "field" || variant === "grid" || variant === "more-compact") return "(max-width: 900px) 100vw, 33vw";
  return "(max-width: 900px) 100vw, 50vw";
}

export function StoryCard({
  story,
  variant,
  showAuthor = false,
  showDeck = false,
  showReadingTime = false,
  showReadLink = false,
  showCategory = true,
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
          <StoryImage image={story.image} attributes={storyImageAttributes(story.image, storyCardImageShape(variant), storyCardImageSizes(variant))} loading={priority ? "eager" : "lazy"} />
          {story.image.credit && CREDITED_VARIANTS.has(variant) ? (
            <span className="home-story-credit">Photo: {story.image.credit}</span>
          ) : null}
        </a>
      ) : null}

      <div className="home-story-body">
        <div className="home-story-meta">
          {showCategory && story.category ? (
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
