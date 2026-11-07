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
  wordpressImage,
  wordpressPresentationContext,
  wordpressPublicStory,
  wordpressSeriesInput,
  wordpressStorySummary
} from "@/lib/adapters/wordpress-story";
import { getPostContributors, isGuestContributor, type WordPressAuthor, type WordPressContributor, type WordPressCoverage, type WordPressPost } from "@/lib/wordpress";

/**
 * The public article's model from WordPress. WordPress field access is the
 * adapter (`lib/adapters/wordpress-story.ts`); Byline's rules (reading time,
 * update notice, related, More by, series, coverage areas) are the shared
 * builder in `@byline/content/story`, which the newsroom's Live Preview runs
 * on Payload stories too. This file only gathers the WordPress candidates.
 */

export { isCoverageComplete };

export function getArticleReadingTime(post: WordPressPost) {
  return storyReadingTime({ body: { format: "legacy-html", html: post.content.rendered }, excerptHtml: post.excerpt.rendered });
}

export function hasArticleUpdatedDate(post: WordPressPost) {
  return hasMeaningfulUpdate(post.date, post.modified);
}

// Compact teasers are square (globals.css .story-teaser-compact).
const COMPACT_CARD_IMAGE = { shape: "square", sizes: "(max-width: 900px) 100vw, 360px" } as const;

export function articleStoryCard(post: WordPressPost, imageOptions: { shape: ImageCropShape; sizes: string } = COMPACT_CARD_IMAGE): ArticleStoryCardView {
  return storyCardView(wordpressStorySummary(post), {
    image: (image) => wordpressImage(image, imageOptions.sizes, false, "presentation", imageOptions.shape),
    formatDate: formatDisplayDate
  });
}

/**
 * The public stories of a coverage, in the editor's order, as full posts.
 * Coverage lists only published stories, but a story can still be hidden
 * from the public site (e.g. an internal category), so it is dropped here.
 */
export function getCoverageStories(coverage: WordPressCoverage, postsById: ReadonlyMap<number, WordPressPost>) {
  return coverage.stories.flatMap((story) => {
    const post = postsById.get(story.id);
    return post && isGeneralEditorialPost(post) ? [post] : [];
  });
}

/** Public coverages containing the post, as the builder's series inputs. */
function seriesInputs(post: WordPressPost, coverages: readonly WordPressCoverage[], allPosts: readonly WordPressPost[]) {
  const containing = coverages.filter((coverage) => coverage.stories.some((story) => story.id === post.id));
  if (containing.length === 0) return [];
  const memberIds = new Set(containing.flatMap((coverage) => coverage.stories.map((story) => story.id)));
  const postsById = new Map(allPosts.filter((candidate) => memberIds.has(candidate.id)).map((candidate) => [candidate.id, candidate]));
  return containing.map((coverage) => wordpressSeriesInput(coverage, postsById));
}

/** A story in more than one public coverage reads as part of the first series, else the first coverage. */
export function findStoryCoverage(post: WordPressPost, coverages: readonly WordPressCoverage[]) {
  const chosen = findStorySeries(post.id, seriesInputs(post, coverages, [post]));
  return chosen ? coverages.find((coverage) => coverage.slug === chosen.id) ?? null : null;
}

/** Where a story sits in its public series or coverage. */
export function buildArticleSeries(post: WordPressPost, coverages: readonly WordPressCoverage[], allPosts: readonly WordPressPost[]): ArticleSeriesView | null {
  return buildSeriesView(post.id, seriesInputs(post, coverages, allPosts), wordpressPresentationContext());
}

function postHasContributor(post: WordPressPost, contributor: WordPressContributor) {
  return getPostContributors(post).some((candidate) => {
    if (isGuestContributor(candidate) !== isGuestContributor(contributor)) return false;
    return isGuestContributor(candidate)
      ? candidate.id === contributor.id || candidate.slug === contributor.slug
      : candidate.id === contributor.id;
  });
}

export type BuildArticlePresentationOptions = {
  post: WordPressPost;
  allPosts: WordPressPost[];
  contributors: WordPressContributor[];
  author: WordPressAuthor | null;
  visiblePosts?: WordPressPost[];
  authorPosts?: WordPressPost[];
  relatedCandidates?: WordPressPost[];
  /** Public series and coverage, to place the story in its series. */
  coverages?: readonly WordPressCoverage[];
};

/** Build the public route's normalized model without importing any renderer. */
export function buildArticlePresentation({ post, allPosts, contributors, author, visiblePosts: indexedVisiblePosts, authorPosts: indexedAuthorPosts, relatedCandidates, coverages = [] }: BuildArticlePresentationOptions): ArticlePresentation {
  const visiblePosts = indexedVisiblePosts ?? allPosts.filter(isVisibleContentPost);
  const displayContributors = contributors.length > 0 ? contributors : author ? [author] : [];
  const authorPosts = indexedAuthorPosts ?? (displayContributors.length > 0
    ? visiblePosts.filter((candidate) => displayContributors.some((contributor) => postHasContributor(candidate, contributor)))
    : []);
  return buildCanonicalArticlePresentation(wordpressPublicStory(post, displayContributors), {
    ...wordpressPresentationContext(),
    relatedCandidates: (relatedCandidates ?? visiblePosts).map(wordpressStorySummary),
    contributorStories: authorPosts.map(wordpressStorySummary),
    series: seriesInputs(post, coverages, allPosts)
  });
}
