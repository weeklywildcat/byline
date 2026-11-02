import type { ReactNode } from "react";

/**
 * Live coverage on an article (NYT-style live page): a status bar, an optional
 * pinned "key points" update, and every update newest first. Rendered into the
 * static page, so it is complete without JavaScript and stays when coverage
 * ends. While live, `@byline/ui/live-updates` re-reads `feedUrl` and inserts
 * new updates rendered by the same `ArticleLiveUpdate` component.
 */
export type ArticleLiveImageView = {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  credit?: string;
};

export type ArticleLiveUpdateView = {
  id: number;
  title: string;
  /** Server-built HTML from a fixed set of tags (p, br, ul, li, a). */
  html: string;
  /** ISO instant. */
  date: string;
  /** "Nov. 2, 4:12 PM" in the publication's timezone. */
  dateLabel: string;
  author?: string;
  image?: ArticleLiveImageView | null;
};

export type ArticleLiveView = {
  postId: number | string;
  status: "live" | "ended";
  startedAt: string;
  endedAt?: string | null;
  endedLabel?: string | null;
  /** The newest update, or the start when there are none yet. */
  updatedAt: string;
  updatedLabel: string;
  keyPoints?: ArticleLiveUpdateView | null;
  updates: ArticleLiveUpdateView[];
  /** Static JSON the page re-reads while live. */
  feedUrl: string;
};

export function articleLiveUpdateAnchor(id: number | string) {
  return `update-${id}`;
}

/** One update. The live script inserts this exact markup for new updates. */
export function ArticleLiveUpdate({ update }: { update: ArticleLiveUpdateView }): ReactNode {
  const anchor = articleLiveUpdateAnchor(update.id);
  return (
    <article className="article-live-update" id={anchor} data-update-id={update.id}>
      <header className="article-live-update-meta">
        <a className="article-live-update-time" href={`#${anchor}`} aria-label={`Link to this update, ${update.dateLabel}`}>
          <time dateTime={update.date} data-live-relative="">{update.dateLabel}</time>
        </a>
        {update.author ? <span className="article-live-update-author">{update.author}</span> : null}
      </header>
      {update.title ? <h3 className="article-live-update-title">{update.title}</h3> : null}
      {update.image?.src ? (
        <figure className="article-live-update-image">
          <img
            src={update.image.src}
            alt={update.image.alt}
            width={update.image.width ?? undefined}
            height={update.image.height ?? undefined}
            loading="lazy"
            decoding="async"
          />
          {update.image.credit ? <figcaption><p className="photo-credit">Photo: {update.image.credit}</p></figcaption> : null}
        </figure>
      ) : null}
      {update.html ? <div className="article-live-update-body" dangerouslySetInnerHTML={{ __html: update.html }} /> : null}
    </article>
  );
}

/** "LIVE" before the category while coverage is running. */
export function ArticleLiveBadge({ live }: { live?: ArticleLiveView | null }): ReactNode {
  return live?.status === "live" ? (
    <span className="article-live-badge">
      <span className="article-live-dot" aria-hidden="true" />
      Live
    </span>
  ) : null;
}

export function ArticleLiveCoverage({ live }: { live?: ArticleLiveView | null }): ReactNode {
  if (!live) return null;
  const isLive = live.status === "live";

  return (
    <section
      className={`article-live article-live-${live.status}`}
      aria-labelledby="article-live-heading"
      data-byline-live={live.postId}
      data-status={live.status}
      data-feed={live.feedUrl}
    >
      <div className="article-live-status" role="status">
        {isLive ? (
          <>
            <ArticleLiveBadge live={live} />
            <span>
              Updated <time dateTime={live.updatedAt} data-live-relative="" data-live-updated="">{live.updatedLabel}</time>
            </span>
          </>
        ) : (
          <span className="article-live-ended">
            Live coverage ended{live.endedAt ? <> <time dateTime={live.endedAt}>{live.endedLabel}</time></> : null}. Every update is below.
          </span>
        )}
      </div>

      <h2 id="article-live-heading" className="article-live-heading">{isLive ? "Live updates" : "Updates"}</h2>

      {live.keyPoints ? (
        <aside className="article-live-key-points" aria-label="Key points">
          <h3>{live.keyPoints.title || "Key points"}</h3>
          <div dangerouslySetInnerHTML={{ __html: live.keyPoints.html }} />
        </aside>
      ) : null}

      {isLive ? (
        <div className="article-live-new" hidden>
          <button type="button" className="article-live-new-button" />
        </div>
      ) : null}

      <div className="article-live-updates">
        {live.updates.length > 0
          ? live.updates.map((update) => <ArticleLiveUpdate key={update.id} update={update} />)
          : <p className="article-live-empty">Updates will appear here.</p>}
      </div>
    </section>
  );
}
