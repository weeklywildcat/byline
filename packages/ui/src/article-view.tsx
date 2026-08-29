import type { ReactNode } from "react";

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
};

export type ArticleLinkView = {
  label: string;
  href: string;
};

export type ArticleContributorView = {
  id: string;
  name: string;
  href: string;
  role: string;
  bio: string;
  photo?: ArticleImageView | null;
  founder?: boolean;
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
  relatedStories: ArticleStoryCardView[];
  moreByAuthorStories: ArticleStoryCardView[];
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

function ArticleImage({ image, priority = false, showCaption = true }: { image: ArticleImageView; priority?: boolean; showCaption?: boolean }): ReactNode {
  const hasCaption = Boolean(image.captionHtml || image.fallbackCaption || image.credit);

  return (
    <figure className="featured-image">
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
        />
      </div>
      {showCaption && hasCaption ? (
        <figcaption>
          <div className="featured-image-caption-row">
            {image.captionHtml ? (
              <div className="featured-image-caption" dangerouslySetInnerHTML={{ __html: image.captionHtml }} />
            ) : image.fallbackCaption ? (
              <div className="featured-image-caption">{image.fallbackCaption}</div>
            ) : null}
            {image.credit ? <p className="photo-credit">Credit: {image.credit}</p> : null}
          </div>
        </figcaption>
      ) : null}
    </figure>
  );
}

function StoryCard({ story }: { story: ArticleStoryCardView }): ReactNode {
  return (
    <article className={`story-teaser story-teaser-compact${story.image ? "" : " story-teaser-no-image"}`}>
      {story.image ? <ArticleImage image={story.image} showCaption={false} /> : null}
      <div className="story-teaser-body">
        <div className="article-byline">
          {story.category ? <span>{story.category}</span> : null}
          {story.dateLabel ? <time dateTime={story.date ?? undefined}>{story.dateLabel}</time> : null}
        </div>
        <h2><a href={story.href}>{story.title}</a></h2>
        {story.excerptHtml ? <div className="story-excerpt" dangerouslySetInnerHTML={{ __html: story.excerptHtml }} /> : null}
      </div>
    </article>
  );
}

function AboutWriters({ presentation }: { presentation: ArticlePresentation }): ReactNode {
  const contributors = presentation.contributors.length > 0
    ? presentation.contributors
    : [{
        id: "staff",
        name: presentation.fallbackByline,
        href: "/authors/",
        role: "Writer",
        bio: `Stories reported by the ${presentation.publication.shortName} newsroom.`,
        coverage: []
      }];
  const heading = contributors.length > 1 ? "About the Writers" : "About the Writer";

  return (
    <section className="article-after-section about-writer" aria-labelledby="about-writer-heading">
      <div className="section-heading"><div><h2 id="about-writer-heading">{heading}</h2></div></div>
      <div className={contributors.length > 1 ? "about-writer-contributors" : undefined}>
        {contributors.map((contributor) => (
          <div className="about-writer-layout" key={contributor.id}>
            {contributor.photo?.src ? (
              <img
                className="author-avatar about-writer-avatar"
                src={contributor.photo.src}
                srcSet={contributor.photo.srcSet}
                sizes={contributor.photo.sizes}
                alt={contributor.photo.alt}
                width={contributor.photo.width ?? 132}
                height={contributor.photo.height ?? 132}
                loading="lazy"
              />
            ) : (
              <div className="author-avatar author-avatar-fallback about-writer-avatar" aria-hidden="true">{initial(contributor.name)}</div>
            )}
            <div className="about-writer-body">
              <div className="author-profile-meta">
                <p className="profile-kicker">{contributor.role}</p>
                {contributor.founder ? <span className="author-badge">Founder</span> : null}
              </div>
              <h3>{contributor.name}</h3>
              {contributor.coverage?.length ? (
                <p className="about-writer-coverage">
                  Covers {contributor.coverage.map((area, index) => (
                    <span key={area.href}>
                      <a href={area.href}>{area.label}</a>{index < contributor.coverage!.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </p>
              ) : null}
              <p>{contributor.bio}</p>
              <div className="about-writer-links">
                <a href={contributor.href}>View full profile</a>
                <a href={`${contributor.href}#author-stories-heading`}>More stories by {contributor.name === presentation.fallbackByline ? "the staff" : contributor.name}</a>
                {contributor.contactHref ? <a href={contributor.contactHref}>Contact</a> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ArticleView({ presentation, slots = {}, className = "" }: ArticleViewProps): ReactNode {
  const shellClassName = ["article-shell", "byline-article-view", className].filter(Boolean).join(" ");

  return (
    <main className={shellClassName}>
      {slots.metadata}
      <article className="article-story">
        <header className="article-header">
          {presentation.category ? <a className="article-section-label" href={presentation.category.href}>{presentation.category.label}</a> : null}
          <h1 dangerouslySetInnerHTML={{ __html: presentation.titleHtml }} />
          {presentation.excerptHtml ? <div className="article-excerpt" dangerouslySetInnerHTML={{ __html: presentation.excerptHtml }} /> : null}
          {presentation.athleteMeta?.length ? (
            <div className="article-athlete-meta" aria-label="Athlete spotlight details">
              {presentation.athleteMeta.map((value) => <span key={value}>{value}</span>)}
            </div>
          ) : null}
          <div className="article-meta-block">
            <p className="article-author-line">
              By {presentation.contributors.length > 0
                ? presentation.contributors.map((contributor, index) => (
                    <span key={contributor.id}>{index > 0 ? ", " : ""}<a href={contributor.href}>{contributor.name}</a></span>
                  ))
                : <span>{presentation.fallbackByline}</span>}
            </p>
            <div className="article-timing">
              <time dateTime={presentation.publishedAt}>Published {presentation.publishedLabel}</time>
              {presentation.modifiedAt && presentation.modifiedLabel ? <time dateTime={presentation.modifiedAt}>Updated {presentation.modifiedLabel}</time> : null}
              <span>{presentation.readingTime}</span>
            </div>
          </div>
          {slots.shareActions}
          {presentation.image?.src ? <ArticleImage image={presentation.image} priority /> : null}
        </header>

        {slots.primaryGame}
        {presentation.contentHtml ? (
          <div className="article-body" dangerouslySetInnerHTML={{ __html: presentation.contentHtml }} />
        ) : <p className="empty-state">No article body has been published yet.</p>}

        {presentation.corrections.length > 0 ? (
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
        ) : null}

        {slots.poll}
        {presentation.topics.length > 0 ? (
          <footer className="article-tags" aria-label="Story topics">
            <h2>Topics</h2>
            <div>{presentation.topics.map((topic) => <span key={topic.id}>{topic.name}</span>)}</div>
          </footer>
        ) : null}
        {presentation.update ? (
          <aside className="article-update-notice" aria-label="Story update notice">
            <h2>Update</h2>
            <p>{presentation.update.label}</p>
          </aside>
        ) : null}
        {slots.feedback}
        {slots.newsletter}
      </article>

      <div className="article-after">
        <AboutWriters presentation={presentation} />
        {presentation.relatedStories.length > 0 ? (
          <section className="article-after-section" aria-labelledby="related-stories-heading">
            <div className="section-heading"><div><h2 id="related-stories-heading">Related Stories</h2><p>More from the same section or topic.</p></div></div>
            <div className="article-story-grid">{presentation.relatedStories.map((story) => <StoryCard key={story.id} story={story} />)}</div>
          </section>
        ) : null}
        {presentation.moreByAuthorStories.length > 0 ? (
          <section className="article-after-section" aria-labelledby="more-by-author-heading">
            <div className="section-heading"><div><h2 id="more-by-author-heading">{presentation.contributors.length > 1 ? "More by the writers" : `More by ${presentation.contributors[0]?.name ?? "the newsroom"}`}</h2></div></div>
            <div className="article-story-grid">{presentation.moreByAuthorStories.map((story) => <StoryCard key={story.id} story={story} />)}</div>
          </section>
        ) : null}
        <aside className="article-tip-callout" aria-labelledby="article-tip-callout-heading">
          <div><h2 id="article-tip-callout-heading">Have something we should cover?</h2><p>Send a tip, correction, photo opportunity, or story idea to the {presentation.publication.shortName} newsroom.</p></div>
          <a href={presentation.publication.contactHref}>Contact the newsroom</a>
        </aside>
      </div>
    </main>
  );
}
