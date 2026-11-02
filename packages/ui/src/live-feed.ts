import type { LiveCoverage } from "@byline/core";
import type { ArticleLiveUpdateView, ArticleLiveView } from "./article-live";

export type LiveFeed = {
  status: "live" | "ended";
  endedLabel: string | null;
  updatedAt: string;
  updatedLabel: string;
  keyPoints: { id: number; html: string } | null;
  updates: Array<{ id: number; html: string }>;
};

export function formatLiveTime(iso: string, locale: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(date);
}

export function createArticleLiveView(live: LiveCoverage, options: {
  postId: number | string; locale: string; timeZone: string; feedUrl: string; fallbackDate?: string;
}): ArticleLiveView {
  const label = (date: string) => formatLiveTime(date, options.locale, options.timeZone);
  const updates: ArticleLiveUpdateView[] = live.updates.map((update) => ({
    id: update.id, title: update.title, html: update.html, date: update.date, dateLabel: label(update.date), author: update.author,
    image: update.image ? { ...update.image, src: update.image.url } : null
  }));
  const pinned = live.updates.find((update) => update.pinned);
  const updatedAt = [live.startedAt, live.endedAt, ...live.updates.map((update) => update.modified)]
    .filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) || options.fallbackDate || "";
  return {
    postId: options.postId, status: live.status, startedAt: live.startedAt, endedAt: live.endedAt || null,
    endedLabel: live.endedAt ? label(live.endedAt) : null, updatedAt, updatedLabel: label(updatedAt),
    keyPoints: updates.find((update) => update.id === pinned?.id) ?? null,
    updates, feedUrl: options.feedUrl
  };
}

const escape = (value: string | number) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[char]!);
export const articleLiveUpdateAnchor = (id: number | string) => `update-${id}`;

/** Shared by static React rendering and the runtime feed; body HTML is the fixed-tag WordPress projection. */
export function liveUpdateContent(update: ArticleLiveUpdateView): string {
  const anchor = articleLiveUpdateAnchor(update.id);
  const image = update.image;
  return `<header class="article-live-update-meta"><a class="article-live-update-time" href="#${escape(anchor)}" aria-label="Link to this update, ${escape(update.dateLabel)}"><time datetime="${escape(update.date)}" data-live-relative="">${escape(update.dateLabel)}</time></a>${update.author ? `<span class="article-live-update-author">${escape(update.author)}</span>` : ""}</header>`
    + (update.title ? `<h3 class="article-live-update-title">${escape(update.title)}</h3>` : "")
    + (image?.src ? `<figure class="article-live-update-image"><img src="${escape(image.src)}" alt="${escape(image.alt)}"${image.width ? ` width="${image.width}"` : ""}${image.height ? ` height="${image.height}"` : ""} loading="lazy" decoding="async">${image.credit ? `<figcaption><p class="photo-credit">Photo: ${escape(image.credit)}</p></figcaption>` : ""}</figure>` : "")
    + (update.html ? `<div class="article-live-update-body">${update.html}</div>` : "");
}

export function liveKeyPointsHtml(update: ArticleLiveUpdateView): string {
  return `<h3>${escape(update.title || "Key points")}</h3><div>${update.html}</div>`;
}

export function createLiveFeed(view: ArticleLiveView): LiveFeed {
  return {
    status: view.status, endedLabel: view.endedLabel ?? null, updatedAt: view.updatedAt, updatedLabel: view.updatedLabel,
    keyPoints: view.keyPoints ? { id: view.keyPoints.id, html: liveKeyPointsHtml(view.keyPoints) } : null,
    updates: view.updates.map((update) => ({ id: update.id, html: `<article class="article-live-update" id="${articleLiveUpdateAnchor(update.id)}" data-update-id="${update.id}">${liveUpdateContent(update)}</article>` }))
  };
}
