import { articleLiveUpdateAnchor, liveUpdateContent, liveKeyPointsHtml } from "./live-feed";
export { articleLiveUpdateAnchor } from "./live-feed";
import type { ReactNode } from "react";

/**
 * Live coverage on an article (NYT-style live page): a status bar, an optional
 * pinned "key points" summary, and every update newest first. Rendered into the
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
  /** The most recent update edit or coverage state change. */
  updatedAt: string;
  updatedLabel: string;
  keyPoints?: ArticleLiveUpdateView | null;
  updates: ArticleLiveUpdateView[];
  /** Static JSON the page re-reads while live. */
  feedUrl: string;
};

/** One update, using the same renderer as the live feed. */
export function ArticleLiveUpdate({ update }: { update: ArticleLiveUpdateView }): ReactNode {
  return <article className="article-live-update" id={articleLiveUpdateAnchor(update.id)} data-update-id={update.id} dangerouslySetInnerHTML={{ __html: liveUpdateContent(update) }} />;
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
        <aside className="article-live-key-points" aria-label="Key points" dangerouslySetInnerHTML={{ __html: liveKeyPointsHtml(live.keyPoints) }} />
      ) : null}

      {isLive ? (
        <div className="article-live-new" hidden aria-live="polite">
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
