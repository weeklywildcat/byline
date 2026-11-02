import { createArticleLiveView, createLiveFeed, formatLiveTime as formatTime } from "@byline/ui/live-feed";
import { getPublicationConfig } from "@/lib/publication";
import { getPostLiveCoverage, type WordPressPost } from "@/lib/wordpress";

const publication = getPublicationConfig();

/** Permanent static JSON archive, also useful on hosts without the Worker. */
export function liveFeedPath(postId: number | string) {
  return `/_byline/live/${postId}.json`;
}

export const formatLiveTime = (iso: string) => formatTime(iso, publication.locale, publication.timezone);

export function buildArticleLiveView(post: WordPressPost) {
  const live = getPostLiveCoverage(post);
  return live ? createArticleLiveView(live, {
    postId: post.id, locale: publication.locale, timeZone: publication.timezone,
    feedUrl: `/api/live/${post.id}`, fallbackDate: post.date_gmt || post.date
  }) : null;
}

export function buildLiveFeed(post: WordPressPost) {
  const view = buildArticleLiveView(post);
  return view ? createLiveFeed(view) : null;
}
