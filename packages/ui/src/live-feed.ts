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
  /** The host's profile route for an author slug. */
  authorHref?: (slug: string) => string;
}): ArticleLiveView {
  const label = (date: string) => formatLiveTime(date, options.locale, options.timeZone);
  const updates: ArticleLiveUpdateView[] = live.updates.map((update) => ({
    id: update.id, title: update.title, html: update.html, date: update.date, dateLabel: label(update.date), author: update.author,
    authorHref: update.authorSlug && options.authorHref ? options.authorHref(update.authorSlug) : null,
    authorRole: update.authorRole || null,
    authorPhoto: update.authorPhoto ? { src: update.authorPhoto.url, width: update.authorPhoto.width, height: update.authorPhoto.height } : null,
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

const SHARE_ICON = '<svg aria-hidden="true" viewBox="0 0 256 256" width="18" height="18"><path fill="currentColor" d="m237.66 106.35l-80-80A8 8 0 0 0 144 32v40.35c-25.94 2.22-54.59 14.92-78.16 34.91c-28.38 24.08-46.05 55.11-49.76 87.37a12 12 0 0 0 20.68 9.58c11-11.71 50.14-48.74 107.24-52V192a8 8 0 0 0 13.66 5.65l80-80a8 8 0 0 0 0-11.3M160 172.69V144a8 8 0 0 0-8-8c-28.08 0-55.43 7.33-81.29 21.8a196.2 196.2 0 0 0-36.57 26.52c5.8-23.84 20.42-46.51 42.05-64.86C99.41 99.77 127.75 88 152 88a8 8 0 0 0 8-8V51.32L220.69 112Z"/></svg>';

function liveAuthorAvatar(update: ArticleLiveUpdateView): string {
  if (!update.author) return "";
  const photo = update.authorPhoto;
  return photo?.src
    ? `<img class="article-live-update-avatar author-avatar" src="${escape(photo.src)}" alt="" width="40" height="40" loading="lazy" decoding="async">`
    : `<span class="article-live-update-avatar author-avatar author-avatar-fallback" aria-hidden="true">${escape(update.author.trim().slice(0, 1).toUpperCase())}</span>`;
}

/** Shared by static React rendering and the runtime feed; body HTML is the fixed-tag WordPress projection. */
export function liveUpdateContent(update: ArticleLiveUpdateView): string {
  const anchor = articleLiveUpdateAnchor(update.id);
  const image = update.image;
  const name = update.author ? (update.authorHref ? `<a href="${escape(update.authorHref)}">${escape(update.author)}</a>` : escape(update.author)) : "";
  return `<header class="article-live-update-meta">${liveAuthorAvatar(update)}<div class="article-live-update-byline">`
    + `<a class="article-live-update-time" href="#${escape(anchor)}" aria-label="Link to this update, ${escape(update.dateLabel)}"><time datetime="${escape(update.date)}" data-live-relative="">${escape(update.dateLabel)}</time></a>`
    + (name ? `<p class="article-live-update-author"><span class="article-live-update-name">${name}</span>${update.authorRole ? ` <span class="article-live-update-role">${escape(update.authorRole)}</span>` : ""}</p>` : "")
    + `</div><button type="button" class="article-live-update-share" data-live-share="${escape(anchor)}" aria-label="Share this update" title="Share this update">${SHARE_ICON}</button></header>`
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
