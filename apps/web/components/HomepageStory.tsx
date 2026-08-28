import { getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import { getResponsiveImageProps } from "@/lib/media";
import {
  getContributorHref,
  getContributorName,
  getFeaturedMedia,
  getPostContributors,
  getPostHref,
  type WordPressPost
} from "@/lib/wordpress";
import { getPublicationConfig } from "@/lib/publication";

const publication = getPublicationConfig();

type HomepageStoryVariant =
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

type HomepageStoryProps = {
  post: WordPressPost;
  variant: HomepageStoryVariant;
  cleanDeck?: boolean;
  showAuthor?: boolean;
  showDeck?: boolean;
  showReadingTime?: boolean;
  showReadLink?: boolean;
  priority?: boolean;
};

function getReadingTime(post: WordPressPost) {
  const words = stripHtml(post.content.rendered || post.excerpt.rendered).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 225));

  return `${minutes} min read`;
}

function getCleanDeck(post: WordPressPost) {
  const text = stripHtml(post.content.rendered || post.excerpt.rendered)
    .replace(/\s*\[\s*(?:&hellip;|…|\.\.\.)\s*\]\s*$/i, "")
    .replace(/\s*(?:&hellip;|…|\.\.\.)\s*$/i, "")
    .trim();
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g);

  if (sentences?.length) {
    return sentences.slice(0, 2).join(" ").trim();
  }

  if (text.length <= 260) {
    return text;
  }

  const trimmed = text.slice(0, 260);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

function getHomepageStoryImageSizes(variant: HomepageStoryVariant) {
  if (variant === "lead" || variant === "brief-lead" || variant === "more-lead") {
    return "(max-width: 900px) 100vw, 62vw";
  }

  if (variant === "row" || variant === "briefing" || variant === "field" || variant === "grid" || variant === "more-compact") {
    return "(max-width: 900px) 100vw, 33vw";
  }

  return "(max-width: 900px) 100vw, 50vw";
}

export function HomepageStory({
  post,
  variant,
  cleanDeck = false,
  showAuthor = false,
  showDeck = false,
  showReadingTime = false,
  showReadLink = false,
  priority = false
}: HomepageStoryProps) {
  const contributors = getPostContributors(post);
  const category = getPrimaryVisibleCategory(post);
  const image = getFeaturedMedia(post);
  const title = stripHtml(post.title.rendered);
  const href = getPostHref(post);
  const excerpt = cleanDeck ? getCleanDeck(post) : post.excerpt.rendered.trim();
  const imageProps = image
    ? getResponsiveImageProps(image, { priority, sizes: getHomepageStoryImageSizes(variant) })
    : null;
  // Keep the exact legacy markup for attachments without usable size
  // metadata. Responsive attributes are added when WordPress provides real
  // candidates, while the static fallback remains visually and structurally
  // compatible with the existing homepage parity fixtures.
  const renderedImageProps = imageProps?.srcSet
    ? imageProps
    : imageProps
      ? {
          src: imageProps.src,
          alt: imageProps.alt,
          width: imageProps.width,
          height: imageProps.height,
          loading: imageProps.loading
        }
      : null;
  const hasImage = Boolean(renderedImageProps);
  const className = [
    "home-story",
    `home-story-${variant}`,
    hasImage ? "" : "home-story-no-image"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className}>
      {renderedImageProps ? (
        <a className="home-story-image" href={href} aria-label={title}>
          <img {...renderedImageProps} />
        </a>
      ) : null}

      <div className="home-story-body">
        <div className="home-story-meta">
          {category ? (
            <a className="home-story-category" href={`/category/${category.slug}/`}>
              {decodeHtml(category.name)}
            </a>
          ) : null}
          <time dateTime={post.date}>{formatDisplayDate(post.date)}</time>
          {showReadingTime ? <span>{getReadingTime(post)}</span> : null}
        </div>

        <h2>
          <a href={href}>{title}</a>
        </h2>

        {showDeck && excerpt ? (
          cleanDeck ? (
            <p className="home-story-deck">{excerpt}</p>
          ) : (
            <div className="home-story-deck" dangerouslySetInnerHTML={{ __html: excerpt }} />
          )
        ) : null}

        {showAuthor ? (
          <p className="home-story-author">
            By{" "}
            {contributors.length > 0 ? (
              contributors.map((contributor, index) => (
                <span key={`${contributor.id}-${contributor.slug}`}>
                  {index > 0 ? ", " : null}
                  <a href={getContributorHref(contributor)}>{getContributorName(contributor)}</a>
                </span>
              ))
            ) : (
              <span>{publication.identity.shortName} Staff</span>
            )}
          </p>
        ) : null}

        {showReadLink ? (
          <a className="home-story-read-link" href={href}>
            Read story →
          </a>
        ) : null}
      </div>
    </article>
  );
}
