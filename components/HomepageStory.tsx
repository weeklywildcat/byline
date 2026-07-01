import { getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import {
  getFeaturedMedia,
  getAuthorHref,
  getPostAuthor,
  getPostHref,
  type WordPressPost
} from "@/lib/wordpress";

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
  const author = getPostAuthor(post);
  const category = getPrimaryVisibleCategory(post);
  const image = getFeaturedMedia(post);
  const title = stripHtml(post.title.rendered);
  const href = getPostHref(post);
  const excerpt = cleanDeck ? getCleanDeck(post) : post.excerpt.rendered.trim();
  const hasImage = Boolean(image?.source_url);
  const className = `home-story home-story-${variant}${hasImage ? "" : " home-story-no-image"}`;

  return (
    <article className={className}>
      {hasImage ? (
        <a className="home-story-image" href={href} aria-label={title}>
          <img
            src={image?.source_url}
            alt={image?.alt_text || stripHtml(image?.title.rendered ?? "")}
            width={image?.media_details?.width}
            height={image?.media_details?.height}
            loading={priority ? "eager" : "lazy"}
          />
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
            {author ? (
              <a href={getAuthorHref(author)}>{author.name}</a>
            ) : (
              <span>Weekly Wildcat Staff</span>
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
