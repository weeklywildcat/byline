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
import type { ArticleLiveImageView, ArticleLiveUpdateView, ArticleLiveView } from "@byline/content/story";
export type { ArticleLiveImageView, ArticleLiveUpdateView, ArticleLiveView } from "@byline/content/story";

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
      <header className="article-live-header">
        <h2 id="article-live-heading" className="article-live-heading">{isLive ? "Live updates" : "Updates"}</h2>
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
      </header>

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
