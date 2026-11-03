import type { ReactNode } from "react";
import { ArticleLiveBadge, ArticleLiveCoverage, type ArticleLiveView } from "./article-live";

/**
 * The article boundary between a content adapter and a renderer.
 *
 * An adapter may be WordPress, a fixture, or Studio data, but the renderer only
 * receives this normalized presentation model. HTML fields are expected to be
 * sanitized/rendered by the adapter before they cross this boundary.
 */
export type ArticleImageView = {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  captionHtml?: string;
  fallbackCaption?: string;
  credit?: string;
  /** CSS object-position from the editor's focal point; absent when centred or already cropped. */
  objectPosition?: string;
};

export type ArticleLinkView = {
  label: string;
  href: string;
};

export type ArticleContributorView = {
  id: string;
  name: string;
  /** Empty for one-off guests, who are credited without a profile page. */
  href: string;
  role: string;
  bio: string;
  photo?: ArticleImageView | null;
  contactHref?: string;
  coverage?: ArticleLinkView[];
};

export type ArticleCorrectionView = {
  id: string;
  label: string;
  date?: string | null;
  dateLabel?: string | null;
  text: string;
};

export type ArticleTopicView = {
  id: string;
  name: string;
};

export type ArticleStoryCardView = {
  id: number | string;
  title: string;
  href: string;
  excerptHtml?: string;
  image?: ArticleImageView | null;
  category?: string | null;
  date?: string | null;
  dateLabel?: string | null;
  /** Present for a video story; the card shows a small Video label. */
  video?: StoryVideoBadgeView | null;
};

/** A video story's card treatment: the label and, when known, the running time ("4:13"). */
export type StoryVideoBadgeView = {
  duration: string | null;
};

/**
 * A video story's one primary video. The player is a real iframe in the
 * rendered HTML, and `embedUrl` is the same URL the structured data and the
 * video sitemap name.
 */
export type ArticleVideoView = {
  videoId: string;
  embedUrl: string;
  /** Accessible name for the player. */
  title: string;
  duration?: string | null;
};

export type ArticleSeriesPartView = {
  id: number | string;
  /** 1-based reading order among the published stories. */
  number: number;
  title: string;
  href: string;
  current: boolean;
  date?: string | null;
  dateLabel?: string | null;
  image?: ArticleImageView | null;
};

/**
 * The public series or ongoing coverage a story belongs to. A series is read
 * in order (Part 1, Part 2…); coverage is a set of stories on one subject.
 */
export type ArticleSeriesView = {
  format: "series" | "coverage";
  title: string;
  href: string;
  description?: string;
  /** False while more parts may still be published, so no total is promised. */
  complete: boolean;
  /** This story's part number among the published stories. */
  position: number;
  total: number;
  previous?: ArticleSeriesPartView | null;
  next?: ArticleSeriesPartView | null;
  /** Every published part for a series; the other stories, newest first, for coverage. */
  parts: ArticleSeriesPartView[];
};

export type ArticlePresentation = {
  id: number | string;
  url: string;
  title: string;
  titleHtml: string;
  excerptHtml: string;
  contentHtml: string;
  category?: ArticleLinkView | null;
  athleteMeta?: string[];
  /** The author's choice in WordPress. Absent means standard. */
  storyPresentation?: "standard" | "immersive";
  /** Headline position for an immersive story. Absent means bottom-left. */
  immersiveAlignment?: "bottom-left" | "center";
  /** A video story's primary video; absent for an article, even one with embeds in its body. */
  video?: ArticleVideoView | null;
  contributors: ArticleContributorView[];
  fallbackByline: string;
  publishedAt: string;
  publishedLabel: string;
  modifiedAt?: string | null;
  modifiedLabel?: string | null;
  readingTime: string;
  image?: ArticleImageView | null;
  corrections: ArticleCorrectionView[];
  topics: ArticleTopicView[];
  update?: { modifiedAt: string; label: string } | null;
  /** Live coverage, while live and after it ends; absent for ordinary stories. */
  live?: ArticleLiveView | null;
  relatedStories: ArticleStoryCardView[];
  moreByAuthorStories: ArticleStoryCardView[];
  /** "How we reported this", as plain-text paragraphs. Absent or empty prints nothing. */
  reportingNote?: string[];
  /** The public series or coverage this story is part of, if any. */
  series?: ArticleSeriesView | null;
  publication: {
    shortName: string;
    contactHref: string;
  };
};

export type ArticleViewSlots = {
  metadata?: ReactNode;
  shareActions?: ReactNode;
  primaryGame?: ReactNode;
  poll?: ReactNode;
  feedback?: ReactNode;
  newsletter?: ReactNode;
};

export type ArticleViewProps = {
  presentation: ArticlePresentation;
  slots?: ArticleViewSlots;
  className?: string;
};

function initial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "W";
}

function bylineSeparator(index: number, count: number) {
  if (index === 0) return "";
  return index === count - 1 ? " and " : ", ";
}

function BylineAvatar({ contributor }: { contributor: ArticleContributorView }): ReactNode {
  const photo = contributor.photo;
  return photo?.src ? (
    <img
      className="article-byline-avatar author-avatar"
      src={photo.src}
      srcSet={photo.srcSet}
      sizes="44px"
      alt=""
      width={44}
      height={44}
      loading="eager"
      decoding="async"
    />
  ) : (
    <span className="article-byline-avatar author-avatar author-avatar-fallback">{initial(contributor.name)}</span>
  );
}

function joinClassNames(...names: Array<string | undefined | false>) {
  return names.filter(Boolean).join(" ");
}

/**
 * The caption and photo credit for an image, without the surrounding `<figure>`.
 * A custom layout that paints the lead image some other way (for example behind
 * a headline) still prints the same caption and credit through this.
 */
export function ArticleImageCaption({ image }: { image: ArticleImageView }): ReactNode {
  if (!(image.captionHtml || image.fallbackCaption || image.credit)) return null;
  return (
    <div className="featured-image-caption-row">
      {image.captionHtml ? (
        <div className="featured-image-caption" dangerouslySetInnerHTML={{ __html: image.captionHtml }} />
      ) : image.fallbackCaption ? (
        <div className="featured-image-caption">{image.fallbackCaption}</div>
      ) : null}
      {image.credit ? <p className="photo-credit">Photo: {image.credit}</p> : null}
    </div>
  );
}

function ArticleImage({ image, priority = false, showCaption = true }: { image: ArticleImageView; priority?: boolean; showCaption?: boolean }): ReactNode {
  const hasCaption = Boolean(image.captionHtml || image.fallbackCaption || image.credit);
  // A vertical lead photo would run several screens tall at article width, so
  // the stylesheet crops it to a landscape frame.
  const isPortrait = Boolean(image.width && image.height && image.height > image.width * 1.1);

  return (
    <figure className={isPortrait ? "featured-image featured-image-portrait" : "featured-image"}>
      <div className="featured-image-frame">
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes={image.sizes}
          alt={image.alt}
          width={image.width ?? undefined}
          height={image.height ?? undefined}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          style={image.objectPosition ? { objectPosition: image.objectPosition } : undefined}
        />
      </div>
      {showCaption && hasCaption ? <figcaption><ArticleImageCaption image={image} /></figcaption> : null}
    </figure>
  );
}

/** "Video · 4:13" on a video story's card, in the typography of the kicker it sits in. */
export function StoryVideoBadge({ video, className }: { video: StoryVideoBadgeView; className?: string }): ReactNode {
  return (
    <span className={joinClassNames("story-video-badge", className)}>
      Video{video.duration ? <span className="story-video-duration"> · {video.duration}</span> : null}
    </span>
  );
}

function StoryCard({ story }: { story: ArticleStoryCardView }): ReactNode {
  return (
    <article className={`story-teaser story-teaser-compact${story.image ? "" : " story-teaser-no-image"}`}>
      {story.image ? <ArticleImage image={story.image} showCaption={false} /> : null}
      <div className="story-teaser-body">
        <div className="article-byline">
          {story.video ? <StoryVideoBadge video={story.video} /> : null}
          {story.category ? <span>{story.category}</span> : null}
          {story.dateLabel ? <time dateTime={story.date ?? undefined}>{story.dateLabel}</time> : null}
        </div>
        <h2><a href={story.href}>{story.title}</a></h2>
        {story.excerptHtml ? <div className="story-excerpt" dangerouslySetInnerHTML={{ __html: story.excerptHtml }} /> : null}
      </div>
    </article>
  );
}

/* --- Article primitives ------------------------------------------------------
   `ArticleView` is only a composition of these. A repository-defined story
   presentation composes the same pieces in a different order and wrapper, so
   headline, byline, body, corrections and the standard ending stay one
   implementation. Each reads the normalized `ArticlePresentation`; none holds
   editorial copy. */

type ArticlePieceProps = { presentation: ArticlePresentation; className?: string };

/**
 * The element that carries the theme scope (`byline-article-view`) and the
 * `byline-content` container the wide and full-bleed blocks measure against.
 * Everything that renders `ArticleBody` must sit inside one.
 */
export function ArticleShell({ as: Tag = "main", className, children }: { as?: "main" | "div"; className?: string; children?: ReactNode }): ReactNode {
  return <Tag className={joinClassNames("article-shell", "byline-article-view", className)}>{children}</Tag>;
}

/** The section label ("News", "Sports") linking to the category archive. */
export function ArticleCategory({ presentation, className }: ArticlePieceProps): ReactNode {
  const badge = <ArticleLiveBadge live={presentation.live} />;
  if (!presentation.category) return badge;
  return (
    <>
      {badge}
      <a className={joinClassNames("article-section-label", className)} href={presentation.category.href}>{presentation.category.label}</a>
    </>
  );
}

/** Live updates under the story body; nothing for an ordinary story. */
export function ArticleLive({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  return <ArticleLiveCoverage live={presentation.live} />;
}

function seriesPartLabel(series: ArticleSeriesView, number: number) {
  return series.complete ? `Part ${number} of ${series.total}` : `Part ${number}`;
}

/** The series kicker beside the section label: "The Lunch Squeeze · Part 2 of 4". */
export function ArticleSeriesLabel({ presentation, className }: ArticlePieceProps): ReactNode {
  const series = presentation.series;
  if (!series) return null;
  return (
    <p className={joinClassNames("article-series-label", className)}>
      <a href={series.href}>{series.title}</a>
      {series.format === "series" ? <span>{seriesPartLabel(series, series.position)}</span> : null}
    </p>
  );
}

/** The article's only `<h1>`. */
export function ArticleHeadline({ presentation, className }: ArticlePieceProps): ReactNode {
  return <h1 className={className} dangerouslySetInnerHTML={{ __html: presentation.titleHtml }} />;
}

/** The deck (excerpt), when the story has one. */
export function ArticleExcerpt({ presentation, className }: ArticlePieceProps): ReactNode {
  if (!presentation.excerptHtml) return null;
  return <div className={joinClassNames("article-excerpt", className)} dangerouslySetInnerHTML={{ __html: presentation.excerptHtml }} />;
}

/** Athlete-spotlight labels; renders nothing for other stories. */
export function ArticleAthleteMeta({ presentation, className }: ArticlePieceProps): ReactNode {
  if (!presentation.athleteMeta?.length) return null;
  return (
    <div className={joinClassNames("article-athlete-meta", className)} aria-label="Athlete spotlight details">
      {presentation.athleteMeta.map((value) => <span key={value}>{value}</span>)}
    </div>
  );
}

/** Avatars, byline, publication and update times, reading time and the share actions slot. */
export function ArticleMeta({ presentation, shareActions, className }: ArticlePieceProps & { shareActions?: ReactNode }): ReactNode {
  return (
    <div className={joinClassNames("article-meta-block", className)}>
      <div className="article-avatars" aria-hidden="true">
        {presentation.contributors.length > 0
          ? presentation.contributors.map((contributor) => <BylineAvatar key={contributor.id} contributor={contributor} />)
          : <span className="article-byline-avatar author-avatar author-avatar-fallback">{initial(presentation.fallbackByline)}</span>}
      </div>
      <div className="article-byline-text">
        <p className="article-author-line">
          By {presentation.contributors.length > 0
            ? presentation.contributors.map((contributor, index) => (
                <span key={contributor.id}>{bylineSeparator(index, presentation.contributors.length)}{contributor.href ? <a href={contributor.href}>{contributor.name}</a> : contributor.name}</span>
              ))
            : <span>{presentation.fallbackByline}</span>}
        </p>
        <div className="article-timing">
          <time dateTime={presentation.publishedAt}>Published {presentation.publishedLabel}</time>
          {presentation.modifiedAt && presentation.modifiedLabel ? <time dateTime={presentation.modifiedAt}>Updated {presentation.modifiedLabel}</time> : null}
          <span>{presentation.readingTime}</span>
        </div>
      </div>
      {shareActions}
    </div>
  );
}

/** The lead image as a captioned figure. Use `ArticleImageCaption` when the image is painted another way. */
export function ArticleFeaturedImage({ presentation, priority = true, showCaption = true }: { presentation: ArticlePresentation; priority?: boolean; showCaption?: boolean }): ReactNode {
  return presentation.image?.src ? <ArticleImage image={presentation.image} priority={priority} showCaption={showCaption} /> : null;
}

/**
 * A video story's player: a real YouTube iframe in the rendered HTML, 16:9 and
 * full article width, with nothing to click before it exists.
 */
export function ArticlePrimaryVideo({ presentation, className }: ArticlePieceProps): ReactNode {
  const video = presentation.video;
  if (!video) return null;
  return (
    <figure className={joinClassNames("article-primary-video", className)} data-video-id={video.videoId}>
      <div className="article-primary-video-frame">
        <iframe
          src={video.embedUrl}
          title={video.title}
          width={1280}
          height={720}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </figure>
  );
}

/** The "Video" kicker on a video story. */
export function ArticleVideoLabel({ presentation, className }: ArticlePieceProps): ReactNode {
  if (!presentation.video) return null;
  return <span className={joinClassNames("article-video-label", className)}>Video</span>;
}

/** The WordPress body (with the legacy primary-game card ahead of it), or the empty state. */
export function ArticleBody({ presentation, primaryGame }: { presentation: ArticlePresentation; primaryGame?: ReactNode }): ReactNode {
  return (
    <>
      {primaryGame}
      {presentation.contentHtml ? (
        <div className="article-body" dangerouslySetInnerHTML={{ __html: presentation.contentHtml }} />
      ) : <p className="empty-state">No article body has been published yet.</p>}
    </>
  );
}

export function ArticleCorrections({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  if (presentation.corrections.length === 0) return null;
  return (
    <section className="article-correction-notices" aria-label="Story corrections and updates">
      {presentation.corrections.map((correction) => (
        <aside className="article-correction-notice" key={correction.id}>
          <div className="article-correction-notice-heading">
            <h2>{correction.label}</h2>
            {correction.date ? <time dateTime={correction.date}>{correction.dateLabel ?? correction.date}</time> : null}
          </div>
          <p>{correction.text}</p>
        </aside>
      ))}
    </section>
  );
}

export function ArticleTopics({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  if (presentation.topics.length === 0) return null;
  return (
    <footer className="article-tags" aria-label="Story topics">
      <h2>Topics</h2>
      <div>{presentation.topics.map((topic) => <span key={topic.id}>{topic.name}</span>)}</div>
    </footer>
  );
}

export function ArticleUpdateNotice({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  if (!presentation.update) return null;
  return (
    <aside className="article-update-notice" aria-label="Story update notice">
      <h2>Update</h2>
      <p>{presentation.update.label}</p>
    </aside>
  );
}

/** "How we reported this": the author's note on how the story was reported. */
export function ArticleReportingNote({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  const paragraphs = presentation.reportingNote ?? [];
  if (paragraphs.length === 0) return null;
  return (
    <aside className="article-reporting-note" aria-labelledby="article-reporting-note-heading">
      <h2 id="article-reporting-note-heading">How we reported this</h2>
      {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </aside>
  );
}

function SeriesNextLink({ series, part }: { series: ArticleSeriesView; part: ArticleSeriesPartView }): ReactNode {
  return (
    <a className={joinClassNames("article-series-next", !part.image && "article-series-next-no-image")} href={part.href}>
      {part.image ? (
        <img
          src={part.image.src}
          srcSet={part.image.srcSet}
          sizes={part.image.sizes}
          alt=""
          width={part.image.width ?? undefined}
          height={part.image.height ?? undefined}
          loading="lazy"
          decoding="async"
          style={part.image.objectPosition ? { objectPosition: part.image.objectPosition } : undefined}
        />
      ) : null}
      <span className="article-series-next-text">
        <span className="article-series-next-label">Next: {seriesPartLabel(series, part.number)}</span>
        <span className="article-series-next-title">{part.title}</span>
      </span>
      <span className="article-series-next-arrow" aria-hidden="true">→</span>
    </a>
  );
}

/**
 * Where this story sits in its series (every part, this one marked, and the
 * next part to read) or, for ongoing coverage, the latest other stories.
 */
export function ArticleSeriesGuide({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  const series = presentation.series;
  if (!series) return null;

  if (series.format === "coverage") {
    if (series.parts.length === 0) return null;
    return (
      <aside className="article-series-guide article-series-guide-coverage" aria-labelledby="article-series-guide-heading">
        <header className="article-series-guide-header">
          <p className="article-series-guide-kicker">More coverage</p>
          <h2 id="article-series-guide-heading"><a href={series.href}>{series.title}</a></h2>
        </header>
        <ul className="article-series-parts">
          {series.parts.map((part) => (
            <li key={part.id}>
              <a href={part.href}>
                <span className="article-series-part-title">{part.title}</span>
                {part.dateLabel ? <time dateTime={part.date ?? undefined}>{part.dateLabel}</time> : null}
              </a>
            </li>
          ))}
        </ul>
        <a className="article-series-all" href={series.href}>All {series.total} stories <span aria-hidden="true">→</span></a>
      </aside>
    );
  }

  const count = series.complete ? `${series.total} parts` : `${series.total} ${series.total === 1 ? "part" : "parts"} so far`;
  return (
    <nav className="article-series-guide" aria-labelledby="article-series-guide-heading">
      <header className="article-series-guide-header">
        <p className="article-series-guide-kicker">A series · {count}</p>
        <h2 id="article-series-guide-heading"><a href={series.href}>{series.title}</a></h2>
        {series.description ? <p className="article-series-guide-description">{series.description}</p> : null}
      </header>
      {series.next ? <SeriesNextLink series={series} part={series.next} /> : (
        <p className="article-series-end">{series.complete ? "You’ve reached the end of the series." : "This is the latest part. More is on the way."}</p>
      )}
      <ol className="article-series-parts">
        {series.parts.map((part) => (
          <li key={part.id} className={part.current ? "article-series-part-current" : undefined}>
            {part.current ? (
              <span aria-current="page">
                <span className="article-series-part-number">Part {part.number}</span>
                <span className="article-series-part-title">{part.title}</span>
                <span className="article-series-part-status">You’re reading</span>
              </span>
            ) : (
              <a href={part.href}>
                <span className="article-series-part-number">Part {part.number}</span>
                <span className="article-series-part-title">{part.title}</span>
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Everything that follows the body inside `<article>`: how it was reported,
 * corrections, the series guide, the poll, topics, the update notice, reader
 * feedback and the newsletter signup.
 */
export function ArticleStoryFooter({ presentation, slots = {} }: { presentation: ArticlePresentation; slots?: ArticleViewSlots }): ReactNode {
  return (
    <>
      <ArticleReportingNote presentation={presentation} />
      <ArticleCorrections presentation={presentation} />
      <ArticleSeriesGuide presentation={presentation} />
      {slots.poll}
      <ArticleTopics presentation={presentation} />
      <ArticleUpdateNotice presentation={presentation} />
      {slots.feedback}
      {slots.newsletter}
    </>
  );
}

/** Compact author provenance for the end of an article. */
export function ArticleAuthors({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  const contributors = presentation.contributors.length > 0
    ? presentation.contributors
    : [{
        id: "staff",
        name: presentation.fallbackByline,
        href: "/staff/",
        role: "Writer",
        bio: `Stories reported by the ${presentation.publication.shortName} newsroom.`,
        coverage: []
      }];
  const heading = contributors.length > 1 ? "About the authors" : "About the author";

  return (
    <section className="article-after-section about-writer" aria-labelledby="about-writer-heading">
      <div className="section-heading"><div><h2 id="about-writer-heading">{heading}</h2></div></div>
      <div className={contributors.length > 1 ? "about-writer-contributors" : undefined}>
        {contributors.map((contributor) => {
          const avatar = contributor.photo?.src ? (
            <img
              className="author-avatar about-writer-avatar"
              src={contributor.photo.src}
              srcSet={contributor.photo.srcSet}
              sizes={contributor.photo.sizes}
              alt={contributor.photo.alt}
              width={contributor.photo.width ?? 96}
              height={contributor.photo.height ?? 96}
              loading="lazy"
            />
          ) : (
            <div className="author-avatar author-avatar-fallback about-writer-avatar" aria-hidden="true">{initial(contributor.name)}</div>
          );

          return (
            <div className="about-writer-layout" key={contributor.id}>
              {contributor.href ? (
                <a className="about-writer-photo-link" href={contributor.href} aria-label={`View ${contributor.name}'s profile`}>
                  {avatar}
                </a>
              ) : avatar}
              <div className="about-writer-body">
                <h3>{contributor.href ? <a href={contributor.href}>{contributor.name}</a> : contributor.name}</h3>
                <p className="about-writer-role">{contributor.role}</p>
                {contributor.bio ? <p className="about-writer-bio">{contributor.bio}</p> : null}
                {contributor.href || contributor.contactHref ? (
                  <div className="about-writer-links">
                    {contributor.href ? (
                      <a href={`${contributor.href}#author-stories-heading`}>
                        More by {contributor.name === presentation.fallbackByline ? "the staff" : contributor.name}
                      </a>
                    ) : null}
                    {contributor.contactHref ? <a href={contributor.contactHref}>Email</a> : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ArticleRelatedStories({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  if (presentation.relatedStories.length === 0) return null;
  return (
    <section className="article-after-section" aria-labelledby="related-stories-heading">
      <div className="section-heading"><div><h2 id="related-stories-heading">Related Stories</h2><p>More from the same section or topic.</p></div></div>
      <div className="article-story-grid">{presentation.relatedStories.map((story) => <StoryCard key={story.id} story={story} />)}</div>
    </section>
  );
}

export function ArticleMoreByAuthor({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  if (presentation.moreByAuthorStories.length === 0) return null;
  return (
    <section className="article-after-section" aria-labelledby="more-by-author-heading">
      <div className="section-heading"><div><h2 id="more-by-author-heading">{presentation.contributors.length > 1 ? "More by the writers" : `More by ${presentation.contributors[0]?.name ?? "the newsroom"}`}</h2></div></div>
      <div className="article-story-grid">{presentation.moreByAuthorStories.map((story) => <StoryCard key={story.id} story={story} />)}</div>
    </section>
  );
}

/** "Have something we should cover?" */
export function ArticleTipCallout({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  return (
    <aside className="article-tip-callout" aria-labelledby="article-tip-callout-heading">
      <div><h2 id="article-tip-callout-heading">Have something we should cover?</h2><p>Send a tip, correction, photo opportunity, or story idea to the {presentation.publication.shortName} newsroom.</p></div>
      <a href={presentation.publication.contactHref}>Contact the newsroom</a>
    </aside>
  );
}

/** Writers, related stories, more by the author and the newsroom tip. Render inside an `ArticleShell`. */
export function ArticleStandardEnding({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  return (
    <div className="article-after">
      <ArticleAuthors presentation={presentation} />
      <ArticleRelatedStories presentation={presentation} />
      <ArticleMoreByAuthor presentation={presentation} />
      <ArticleTipCallout presentation={presentation} />
    </div>
  );
}

export function ArticleView({ presentation, slots = {}, className = "" }: ArticleViewProps): ReactNode {
  // A video story is a watch page: its player takes the lead image's place, above the body.
  const video = Boolean(presentation.video);
  return (
    <ArticleShell className={className}>
      {slots.metadata}
      <article className="article-story" data-story-format={video ? "video" : undefined}>
        <header className="article-header">
          <div className="article-kicker">
            <ArticleVideoLabel presentation={presentation} />
            <ArticleCategory presentation={presentation} />
            <ArticleSeriesLabel presentation={presentation} />
          </div>
          <ArticleHeadline presentation={presentation} />
          <ArticleExcerpt presentation={presentation} />
          <ArticleAthleteMeta presentation={presentation} />
          <ArticleMeta presentation={presentation} shareActions={slots.shareActions} />
          {video ? <ArticlePrimaryVideo presentation={presentation} /> : <ArticleFeaturedImage presentation={presentation} />}
        </header>

        <ArticleBody presentation={presentation} primaryGame={slots.primaryGame} />
        <ArticleLive presentation={presentation} />
        <ArticleStoryFooter presentation={presentation} slots={slots} />
      </article>

      <ArticleStandardEnding presentation={presentation} />
    </ArticleShell>
  );
}
