import { nativeStory } from "./native-snapshot";
import { nativeArticleCard } from "./native-article";
import type { ImageCropShape } from "@byline/core";
import {
  buildArticlePresentation as buildCanonicalArticlePresentation,
  buildSeriesView,
  findStorySeries,
  hasMeaningfulUpdate,
  storyCardView,
  storyReadingTime,
  type ArticlePresentation,
  type ArticleSeriesView,
  type ArticleStoryCardView
} from "@byline/content/story";
import { isGeneralEditorialPost, isVisibleContentPost } from "@/lib/content";
import { formatDisplayDate } from "@/lib/format";
import {
  isCoverageComplete,
  archiveImage,
  archivePresentationContext,
  archivePublicStory,
  archiveSeriesInput,
  archiveStorySummary
} from "@/lib/adapters/fixture-story";
import { getPostContributors, isGuestContributor, type ArchiveAuthor, type ArchiveContributor, type ArchiveCoverage, type ArchivePost } from "@/lib/public-content";

/**
 * The public article's model from WordPress. WordPress field access is the
 * adapter (`lib/adapters/fixture-story.ts`); Byline's rules (reading time,
 * update notice, related, More by, series, coverage areas) are the shared
 * builder in `@byline/content/story`, which the newsroom's Live Preview runs
 * on Payload stories too. This file only gathers the WordPress candidates.
 */

export { isCoverageComplete };

export function getArticleReadingTime(post: ArchivePost) {
  const native = nativeStory(post.id);
  if (native) return storyReadingTime(native);
  return storyReadingTime({ body: { format: "legacy-html", html: post.content.rendered }, excerptHtml: post.excerpt.rendered });
}

export function hasArticleUpdatedDate(post: ArchivePost) {
  return hasMeaningfulUpdate(post.date, post.modified);
}

// Compact teasers are square (globals.css .story-teaser-compact).
const COMPACT_CARD_IMAGE = { shape: "square", sizes: "(max-width: 900px) 100vw, 360px" } as const;

export function articleStoryCard(post: ArchivePost, imageOptions: { shape: ImageCropShape; sizes: string } = COMPACT_CARD_IMAGE): ArticleStoryCardView {
  const native = nativeStory(post.id);
  if (native) return nativeArticleCard(native, imageOptions);
  return storyCardView(archiveStorySummary(post), {
    image: (image) => archiveImage(image, imageOptions.sizes, false, "presentation", imageOptions.shape),
    formatDate: formatDisplayDate
  });
}

/**
 * The public stories of a coverage, in the editor's order, as full posts.
 * Coverage lists only published stories, but a story can still be hidden
 * from the public site (e.g. an internal category), so it is dropped here.
 */
export function getCoverageStories(coverage: ArchiveCoverage, postsById: ReadonlyMap<number, ArchivePost>) {
  return coverage.stories.flatMap((story) => {
    const post = postsById.get(story.id);
    return post && isGeneralEditorialPost(post) ? [post] : [];
  });
}

/** Public coverages containing the post, as the builder's series inputs. */
function seriesInputs(post: ArchivePost, coverages: readonly ArchiveCoverage[], allPosts: readonly ArchivePost[]) {
  const containing = coverages.filter((coverage) => coverage.stories.some((story) => story.id === post.id));
  if (containing.length === 0) return [];
  const memberIds = new Set(containing.flatMap((coverage) => coverage.stories.map((story) => story.id)));
  const postsById = new Map(allPosts.filter((candidate) => memberIds.has(candidate.id)).map((candidate) => [candidate.id, candidate]));
  return containing.map((coverage) => archiveSeriesInput(coverage, postsById));
}

/** A story in more than one public coverage reads as part of the first series, else the first coverage. */
export function findStoryCoverage(post: ArchivePost, coverages: readonly ArchiveCoverage[]) {
  const chosen = findStorySeries(post.id, seriesInputs(post, coverages, [post]));
  return chosen ? coverages.find((coverage) => coverage.slug === chosen.id) ?? null : null;
}

/** Where a story sits in its public series or coverage. */
export function buildArticleSeries(post: ArchivePost, coverages: readonly ArchiveCoverage[], allPosts: readonly ArchivePost[]): ArticleSeriesView | null {
  return buildSeriesView(post.id, seriesInputs(post, coverages, allPosts), archivePresentationContext());
}

function postHasContributor(post: ArchivePost, contributor: ArchiveContributor) {
  return getPostContributors(post).some((candidate) => {
    if (isGuestContributor(candidate) !== isGuestContributor(contributor)) return false;
    return isGuestContributor(candidate)
      ? candidate.id === contributor.id || candidate.slug === contributor.slug
      : candidate.id === contributor.id;
  });
}

export type BuildArticlePresentationOptions = {
  post: ArchivePost;
  allPosts: ArchivePost[];
  contributors: ArchiveContributor[];
  author: ArchiveAuthor | null;
  visiblePosts?: ArchivePost[];
  authorPosts?: ArchivePost[];
  relatedCandidates?: ArchivePost[];
  /** Public series and coverage, to place the story in its series. */
  coverages?: readonly ArchiveCoverage[];
};

/** Build the public route's normalized model without importing any renderer. */
export function buildArticlePresentation({ post, allPosts, contributors, author, visiblePosts: indexedVisiblePosts, authorPosts: indexedAuthorPosts, relatedCandidates, coverages = [] }: BuildArticlePresentationOptions): ArticlePresentation {
  const visiblePosts = indexedVisiblePosts ?? allPosts.filter(isVisibleContentPost);
  const displayContributors = contributors.length > 0 ? contributors : author ? [author] : [];
  const authorPosts = indexedAuthorPosts ?? (displayContributors.length > 0
    ? visiblePosts.filter((candidate) => displayContributors.some((contributor) => postHasContributor(candidate, contributor)))
    : []);
  return buildCanonicalArticlePresentation(archivePublicStory(post, displayContributors), {
    ...archivePresentationContext(),
    relatedCandidates: (relatedCandidates ?? visiblePosts).map(archiveStorySummary),
    contributorStories: authorPosts.map(archiveStorySummary),
    series: seriesInputs(post, coverages, allPosts)
  });
}
