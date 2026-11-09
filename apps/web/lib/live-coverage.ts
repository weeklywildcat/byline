import { nativeStory } from "./native-snapshot";
import { createArticleLiveView, createLiveFeed, formatLiveTime as formatTime } from "@byline/ui/live-feed";
import { getPublicationConfig } from "@/lib/publication";
import { getContributorHref, getPostLiveCoverage, type ArchiveContributor, type ArchivePost } from "@/lib/public-content";

const publication = getPublicationConfig();

/** Permanent static JSON archive, also useful on hosts without the Worker. */
export function liveFeedPath(postId: number | string) {
  return `/_byline/live/${postId}.json`;
}

export const formatLiveTime = (iso: string) => formatTime(iso, publication.locale, publication.timezone);

export function buildArticleLiveView(post: ArchivePost) {
  const native = nativeStory(post.id);
  if (native) return native.live;
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
