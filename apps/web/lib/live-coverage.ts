import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleLiveUpdate, type ArticleLiveUpdateView, type ArticleLiveView } from "@byline/ui";
import { getPublicationConfig } from "@/lib/publication";
import { getPostLiveCoverage, type WordPressLiveUpdate, type WordPressPost } from "@/lib/wordpress";

const publication = getPublicationConfig();

/** Static JSON an open live page re-reads; emitted by src/pages/[...path].json.ts. */
export function liveFeedPath(postId: number | string) {
  return `/_byline/live/${postId}.json`;
}

/** "Nov 2, 4:12 PM" in the publication's timezone (absolute, so the HTML never goes stale). */
export function formatLiveTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(publication.locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: publication.timezone
  }).format(date);
}

function updateView(update: WordPressLiveUpdate): ArticleLiveUpdateView {
  return {
    id: update.id,
    title: update.title,
    html: update.html,
    date: update.date,
    dateLabel: formatLiveTime(update.date),
    ...(update.author ? { author: update.author } : {}),
    image: update.image
      ? { src: update.image.url, alt: update.image.alt, width: update.image.width, height: update.image.height, ...(update.image.credit ? { credit: update.image.credit } : {}) }
      : null
  };
}

/** The article's live section, or null for an ordinary story. */
export function buildArticleLiveView(post: WordPressPost): ArticleLiveView | null {
  const live = getPostLiveCoverage(post);
  if (!live) return null;
  const pinned = live.updates.find((update) => update.pinned) ?? null;
  const updates = live.updates.filter((update) => update !== pinned);
  const updatedAt = live.updates[0]?.date || live.startedAt || post.date_gmt || post.date;

  return {
    postId: post.id,
    status: live.status,
    startedAt: live.startedAt,
    endedAt: live.endedAt || null,
    endedLabel: live.endedAt ? formatLiveTime(live.endedAt) : null,
    updatedAt,
    updatedLabel: formatLiveTime(updatedAt),
    keyPoints: pinned ? updateView(pinned) : null,
    updates: updates.map(updateView),
    feedUrl: liveFeedPath(post.id)
  };
}

export type LiveFeed = {
  status: "live" | "ended";
  endedLabel: string | null;
  updatedAt: string;
  updatedLabel: string;
  /** Newest first, rendered by the same component as the page. Key points excluded. */
  updates: Array<{ id: number; html: string }>;
};

/** The JSON a live page polls; null for a story that was never live. */
export function buildLiveFeed(post: WordPressPost): LiveFeed | null {
  const view = buildArticleLiveView(post);
  if (!view) return null;
  return {
    status: view.status,
    endedLabel: view.endedLabel ?? null,
    updatedAt: view.updatedAt,
    updatedLabel: view.updatedLabel,
    updates: view.updates.map((update) => ({ id: update.id, html: renderToStaticMarkup(createElement(ArticleLiveUpdate, { update })) }))
  };
}
