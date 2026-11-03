import type { ImageCropShape } from "@byline/core";
import type { ArticleImageView, ArticlePresentation, ArticleSeriesPartView, ArticleSeriesView, ArticleStoryCardView } from "@byline/ui";
import { getResponsiveImageProps, type ImageSearchVisibility } from "@/lib/media";
import { getAthleteSportLabel, getAthleteSpotlightLabel, getPrimaryVisibleCategory, getPublicTopicTags, isAthleteSpotlightPost, isHiddenCategory, isVisibleContentPost } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";
import { getMediaCredit } from "@/lib/wordpress";
import { getPublicationConfig } from "@/lib/publication";
import { buildArticleLiveView } from "@/lib/live-coverage";
import { getArticleVideoView, getStoryVideoBadge } from "@/lib/story-video";
import {
  getAuthorProfile,
  contributorHasProfilePage,
  getCoverageHref,
  getContributorHref,
  getContributorName,
  getContributorPhoto,
  getContributorRole,
  getContributorSocialLinks,
  getCorrectionTypeLabel,
  getFeaturedMedia,
  getPostCategories,
  getPostContributors,
  getPostHref,
  getPostReportingNote,
  getPostStoryPresentation,
  getPostTags,
  getPublicCorrectionsForPost,
  isGuestContributor,
  type WordPressAuthor,
  type WordPressCategory,
  type WordPressContributor,
  type WordPressCoverage,
  type WordPressMedia,
  type WordPressPost
} from "@/lib/wordpress";

const WORDS_PER_MINUTE = 225;
const publication = getPublicationConfig();

export function getArticleReadingTime(post: WordPressPost) {
  const words = stripHtml(post.content.rendered || post.excerpt.rendered).split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))} min read`;
}

export function hasArticleUpdatedDate(post: WordPressPost) {
  const published = new Date(post.date).getTime();
  const modified = new Date(post.modified).getTime();
  return Number.isFinite(published) && Number.isFinite(modified) && modified - published > 60 * 60 * 1000;
}

function articleImage(image: WordPressMedia | null, sizes?: string, priority = false, imageSearchVisibility: ImageSearchVisibility = "canonical", shape?: ImageCropShape): ArticleImageView | null {
  if (!image?.source_url) return null;
  const responsive = getResponsiveImageProps(image, { sizes, priority, imageSearchVisibility, shape });
  if (!responsive) return null;
  const captionHtml = image.caption?.rendered?.trim() || "";
  const fallbackCaption = stripHtml(image.media_details?.image_meta?.caption ?? "");
  const credit = getMediaCredit(image);

  return {
    src: responsive.src,
    srcSet: responsive.srcSet,
    sizes: responsive.sizes,
    alt: responsive.alt,
    width: responsive.width ?? null,
    height: responsive.height ?? null,
    ...(captionHtml ? { captionHtml } : {}),
    ...(fallbackCaption ? { fallbackCaption } : {}),
    ...(credit ? { credit } : {}),
    ...(responsive.objectPosition ? { objectPosition: responsive.objectPosition } : {})
  };
}

/** Only a video story carries `video`, so an article's model is unchanged. */
function withVideo<T>(video: T | null) {
  return video ? { video } : {};
}

// Compact teasers are square (globals.css .story-teaser-compact).
const COMPACT_CARD_IMAGE = { shape: "square", sizes: "(max-width: 900px) 100vw, 360px" } as const;

export function articleStoryCard(post: WordPressPost, imageOptions: { shape: ImageCropShape; sizes: string } = COMPACT_CARD_IMAGE): ArticleStoryCardView {
  const category = getPrimaryVisibleCategory(post);
  const image = articleImage(getFeaturedMedia(post), imageOptions.sizes, false, "presentation", imageOptions.shape);
  return {
    id: post.id,
    title: stripHtml(post.title.rendered),
    href: getPostHref(post),
    excerptHtml: post.excerpt.rendered.trim(),
    image,
    category: category ? decodeHtml(category.name) : null,
    date: post.date,
    dateLabel: formatDisplayDate(post.date),
    ...withVideo(getStoryVideoBadge(post))
  };
}

function getCoverageAreas(posts: WordPressPost[]) {
  const counts = new Map<string, { category: WordPressCategory; count: number }>();
  posts.forEach((post) => {
    const category = getPrimaryVisibleCategory(post);
    if (!category) return;
    const existing = counts.get(category.slug);
    counts.set(category.slug, { category, count: existing ? existing.count + 1 : 1 });
  });
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.category.name.localeCompare(right.category.name))
    .slice(0, 3)
    .map(({ category }) => ({ label: decodeHtml(category.name), href: `/category/${category.slug}/` }));
}

function postHasContributor(post: WordPressPost, contributor: WordPressContributor) {
  return getPostContributors(post).some((candidate) => {
    if (isGuestContributor(candidate) !== isGuestContributor(contributor)) return false;
    return isGuestContributor(candidate)
      ? candidate.id === contributor.id || candidate.slug === contributor.slug
      : candidate.id === contributor.id;
  });
}

function contributorView(contributor: WordPressContributor, coverage: ReturnType<typeof getCoverageAreas>) {
  const profile = !isGuestContributor(contributor) ? getAuthorProfile(contributor) : null;
  const photo = getContributorPhoto(contributor);
  const socialLinks = getContributorSocialLinks(contributor);
  const contactLink = !isGuestContributor(contributor) ? socialLinks.find((link) => link.label === "Email") : undefined;
  return {
    id: `${isGuestContributor(contributor) ? "guest" : "user"}-${contributor.id}-${contributor.slug}`,
    name: getContributorName(contributor),
    href: contributorHasProfilePage(contributor) ? getContributorHref(contributor) : "",
    role: getContributorRole(contributor),
    bio: !isGuestContributor(contributor) ? stripHtml(profile?.shortBio ?? "") : "",
    photo: photo ? articleImage({
      id: typeof photo.id === "number" ? photo.id : 0,
      date: "",
      slug: "",
      type: "attachment",
      link: "",
      title: { rendered: photo.alt || getContributorName(contributor) },
      author: 0,
      caption: { rendered: "" },
      alt_text: photo.alt || "",
      media_type: "image",
      mime_type: "image",
      media_details: { width: photo.width ?? undefined, height: photo.height ?? undefined },
      source_url: photo.url
    }, "132px", false, "presentation") : null,
    ...(contactLink?.href ? { contactHref: contactLink.href } : {}),
    coverage
  };
}

function relatedPosts(post: WordPressPost, posts: WordPressPost[]) {
  const categorySlugs = new Set(getPostCategories(post).map((category) => category.slug));
  const tagSlugs = new Set(getPostTags(post).map((tag) => tag.slug));
  return posts
    .filter((candidate) => candidate.id !== post.id)
    .map((candidate, index) => ({
      post: candidate,
      score: getPostCategories(candidate).filter((category) => categorySlugs.has(category.slug)).length +
        getPostTags(candidate).filter((tag) => tagSlugs.has(tag.slug)).length * 2,
      index
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.post.date).getTime() - new Date(left.post.date).getTime() || left.index - right.index)
    .slice(0, 3)
    .map(({ post: relatedPost }) => relatedPost);
}

const COVERAGE_GUIDE_LIMIT = 4;

/** Coverage whose stories are complete; a series still in progress promises no total. */
export function isCoverageComplete(coverage: Pick<WordPressCoverage, "status">) {
  return coverage.status === "past" || coverage.status === "archived";
}

/**
 * The public stories of a coverage, in the editor's order, as full posts.
 * Coverage lists only published stories, but a story can still be hidden
 * from the public site (e.g. an internal category), so it is dropped here.
 */
export function getCoverageStories(coverage: WordPressCoverage, postsById: ReadonlyMap<number, WordPressPost>) {
  return coverage.stories.flatMap((story) => {
    const post = postsById.get(story.id);
    return post && isVisibleContentPost(post) ? [post] : [];
  });
}

/** A story in more than one public coverage reads as part of the first series, else the first coverage. */
export function findStoryCoverage(post: WordPressPost, coverages: readonly WordPressCoverage[]) {
  const containing = coverages.filter((coverage) => coverage.stories.some((story) => story.id === post.id));
  return containing.find((coverage) => coverage.format === "series") ?? containing[0] ?? null;
}

function seriesPart(post: WordPressPost, number: number, current: boolean, withImage = false): ArticleSeriesPartView {
  return {
    id: post.id,
    number,
    title: stripHtml(post.title.rendered),
    href: getPostHref(post),
    current,
    date: post.date,
    dateLabel: formatDisplayDate(post.date),
    ...(withImage ? { image: articleImage(getFeaturedMedia(post), "(max-width: 700px) 30vw, 180px", false, "presentation", "standard") } : {})
  };
}

/** Where a story sits in its public series or coverage. */
export function buildArticleSeries(post: WordPressPost, coverages: readonly WordPressCoverage[], allPosts: readonly WordPressPost[]): ArticleSeriesView | null {
  const coverage = findStoryCoverage(post, coverages);
  if (!coverage) return null;
  const memberIds = new Set(coverage.stories.map((story) => story.id));
  const stories = getCoverageStories(coverage, new Map(allPosts.filter((candidate) => memberIds.has(candidate.id)).map((candidate) => [candidate.id, candidate])));
  const index = stories.findIndex((story) => story.id === post.id);
  if (index < 0) return null;
  const parts = stories.map((story, storyIndex) => seriesPart(story, storyIndex + 1, storyIndex === index));
  const base = {
    title: coverage.title,
    href: getCoverageHref(coverage),
    ...(coverage.description ? { description: coverage.description } : {}),
    complete: isCoverageComplete(coverage),
    position: index + 1,
    total: stories.length
  };
  if (coverage.format === "coverage") {
    const others = parts
      .filter((part) => !part.current)
      .sort((left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime())
      .slice(0, COVERAGE_GUIDE_LIMIT);
    return { format: "coverage", ...base, previous: null, next: null, parts: others };
  }
  const next = stories[index + 1];
  return {
    format: "series",
    ...base,
    previous: index > 0 ? parts[index - 1] : null,
    next: next ? seriesPart(next, index + 2, false, true) : null,
    parts
  };
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
  const category = getPrimaryVisibleCategory(post);
  const image = articleImage(getFeaturedMedia(post), "(max-width: 900px) 100vw, 900px", true);
  const topicTags = getPublicTopicTags(post);
  const topicTerms = topicTags.length > 0 ? topicTags : getPostCategories(post).filter((postCategory) => !isHiddenCategory(postCategory));
  const title = stripHtml(post.title.rendered);
  const articleUrl = absoluteUrl(getPostHref(post));
  const publicCorrections = getPublicCorrectionsForPost(post);
  const hasPublicCorrectionNotice = publicCorrections.length > 0;
  const live = buildArticleLiveView(post);
  // A live story's "Updated" time is its newest update, and the live section
  // replaces the generic "updated after publication" notice.
  const updated = !live && hasArticleUpdatedDate(post) && !hasPublicCorrectionNotice;
  const liveUpdated = live && live.updatedAt !== live.startedAt ? live : null;
  const visiblePosts = indexedVisiblePosts ?? allPosts.filter(isVisibleContentPost);
  const displayContributors = contributors.length > 0 ? contributors : author ? [author] : [];
  const authorPosts = indexedAuthorPosts ?? (displayContributors.length > 0
    ? visiblePosts.filter((candidate) => displayContributors.some((contributor) => postHasContributor(candidate, contributor)))
    : []);
  const series = buildArticleSeries(post, coverages, allPosts);
  // The series guide already lists the other parts; do not repeat them as related stories.
  const seriesIds = new Set(series?.format === "series" ? series.parts.map((part) => part.id) : []);
  const related = relatedPosts(post, (relatedCandidates ?? visiblePosts).filter((candidate) => !seriesIds.has(candidate.id)));
  const relatedIds = new Set(related.map((relatedPost) => relatedPost.id));
  const moreByAuthor = authorPosts.filter((candidate) => candidate.id !== post.id && !relatedIds.has(candidate.id)).slice(0, 3);
  const storyPresentation = getPostStoryPresentation(post);
  const athleteSpotlight = isAthleteSpotlightPost(post);
  const athleteMeta = athleteSpotlight
    ? [getAthleteSpotlightLabel(post), getAthleteSportLabel(post)].filter((value): value is string => Boolean(value))
    : [];

  return {
    id: post.id,
    url: articleUrl,
    title,
    titleHtml: post.title.rendered,
    excerptHtml: post.excerpt.rendered.trim(),
    contentHtml: post.content.rendered.trim(),
    category: category ? { label: decodeHtml(category.name), href: `/category/${category.slug}/` } : null,
    athleteMeta,
    storyPresentation: storyPresentation.presentation,
    immersiveAlignment: storyPresentation.immersiveAlignment,
    ...withVideo(getArticleVideoView(post)),
    contributors: displayContributors.map((contributor) => contributorView(contributor, getCoverageAreas(visiblePosts.filter((candidate) => postHasContributor(candidate, contributor))))),
    fallbackByline: `${publication.identity.shortName} Staff`,
    publishedAt: post.date,
    publishedLabel: formatDisplayDate(post.date),
    modifiedAt: liveUpdated ? liveUpdated.updatedAt : updated ? post.modified : null,
    modifiedLabel: liveUpdated ? liveUpdated.updatedLabel : updated ? formatDisplayDate(post.modified) : null,
    readingTime: getArticleReadingTime(post),
    image,
    corrections: publicCorrections.filter((correction) => !correction.legacy).map((correction) => ({
      id: correction.id,
      label: getCorrectionTypeLabel(correction.type),
      date: correction.date || null,
      dateLabel: correction.date ? formatDisplayDate(correction.date) : null,
      text: correction.text
    })),
    topics: topicTerms.map((term) => ({ id: `${term.taxonomy}-${term.id}`, name: decodeHtml(term.name) })),
    update: updated ? { modifiedAt: post.modified, label: `This story was updated after initial publication on ${formatDisplayDate(post.modified)}.` } : null,
    live,
    relatedStories: related.map((story) => articleStoryCard(story)),
    moreByAuthorStories: moreByAuthor.map((story) => articleStoryCard(story)),
    reportingNote: getPostReportingNote(post),
    series,
    publication: { shortName: publication.identity.shortName, contactHref: publication.urls.contact }
  };
}
