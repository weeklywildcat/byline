import { stableDigest } from "@byline/content";
import type { ArticleLiveView } from "@byline/content/story";
import { nativeStory } from "./native-snapshot";
import { createArticleLiveView, createLiveFeed, formatLiveTime as formatTime } from "@byline/ui/live-feed";
import { getPublicationConfig } from "@/lib/publication";
import { getContributorHref, getPostLiveCoverage, type ArchiveContributor, type ArchivePost } from "@/lib/public-content";

const publication = getPublicationConfig();

/** Permanent static JSON archive; the live page falls back to it when the newsroom is unreachable. */
export function liveFeedPath(postId: number | string) {
  return `/_byline/live/${postId}.json`;
}

export const formatLiveTime = (iso: string) => formatTime(iso, publication.locale, publication.timezone);

/**
 * The newsroom's public feed for a Payload story, which the page reads directly
 * while coverage is live (docs/live-coverage.md). Null when the Publication has
 * no usable newsroom URL: the page then re-reads only its static feed.
 */
export function liveSourceUrl(postId: number | string, cms = publication.urls.cms): string | null {
  try {
    const base = new URL(cms);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (base.protocol !== "https:" && !(local && base.protocol === "http:")) return null;
    return `${base.origin}${base.pathname.replace(/\/+$/, "")}/api/byline/live/${encodeURIComponent(String(postId))}`;
  } catch {
    return null;
  }
}

export function attachLiveSource(
  live: ArticleLiveView | null | undefined,
  postId: number | string,
  options: { cms?: string; locale?: string; timeZone?: string } = {}
): ArticleLiveView | null | undefined {
  if (!live || live.status !== "live") return live;
  const url = liveSourceUrl(postId, options.cms ?? publication.urls.cms);
  if (!url) return live;
  return {
    ...live,
    source: {
      url,
      locale: options.locale ?? publication.locale,
      timeZone: options.timeZone ?? publication.timezone
    }
  };
}

export function buildArticleLiveView(post: ArchivePost): ArticleLiveView | null {
  const native = nativeStory(post.id);
  if (native) return attachLiveSource(native.live, post.id) ?? null;
  const live = getPostLiveCoverage(post);
  return live ? createArticleLiveView(live, {
    postId: post.id, locale: publication.locale, timeZone: publication.timezone,
    feedUrl: `/_byline/live/${post.id}.json`, fallbackDate: post.date_gmt || post.date,
    // Update authors are WordPress users, who always have a profile page.
    authorHref: (slug) => getContributorHref({ slug } as ArchiveContributor)
  }) : null;
}

export function buildLiveFeed(post: ArchivePost) {
  const view = buildArticleLiveView(post);
  return view ? createLiveFeed(view) : null;
}

/**
 * Astro incremental-build identity for the permanent static feed. Unrelated
 * Story metadata cannot invalidate it; a public live-feed change always does.
 */
export function liveFeedCacheKey(post: ArchivePost) {
  const feed = buildLiveFeed(post);
  return feed ? stableDigest(feed) : null;
}
