import type { ArticleImageView, ArticlePresentation, ArticleStoryCardView } from "@byline/ui";
import { getResponsiveImageProps } from "@/lib/media";
import { getAthleteSportLabel, getAthleteSpotlightLabel, getPrimaryVisibleCategory, getPublicTopicTags, isAthleteSpotlightPost, isHiddenCategory, isVisibleContentPost } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import {
  getAuthorProfile,
  getContributorDescription,
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
  getPostTags,
  getPublicCorrectionsForPost,
  isGuestContributor,
  type WordPressAuthor,
  type WordPressCategory,
  type WordPressContributor,
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

function articleImage(image: WordPressMedia | null, sizes?: string, priority = false): ArticleImageView | null {
  if (!image?.source_url) return null;
  const responsive = getResponsiveImageProps(image, { sizes, priority });
  if (!responsive) return null;
  const captionHtml = image.caption?.rendered?.trim() || "";
  const fallbackCaption = stripHtml(image.media_details?.image_meta?.caption ?? "");
  const credit = stripHtml(
    (image.bylineImage ?? image.weeklyWildcatImage)?.creditText ||
      image.media_details?.image_meta?.credit ||
      image.media_details?.image_meta?.copyright ||
      ""
  );

  return {
    src: responsive.src,
    srcSet: responsive.srcSet,
    sizes: responsive.sizes,
    alt: responsive.alt,
    width: responsive.width ?? null,
    height: responsive.height ?? null,
    ...(captionHtml ? { captionHtml } : {}),
    ...(fallbackCaption ? { fallbackCaption } : {}),
    ...(credit ? { credit } : {})
  };
}

function articleStoryCard(post: WordPressPost): ArticleStoryCardView {
  const category = getPrimaryVisibleCategory(post);
  const image = articleImage(getFeaturedMedia(post), "92px");
  return {
    id: post.id,
    title: stripHtml(post.title.rendered),
    href: getPostHref(post),
    excerptHtml: post.excerpt.rendered.trim(),
    image,
    category: category ? decodeHtml(category.name) : null,
    date: post.date,
    dateLabel: formatDisplayDate(post.date)
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
    href: getContributorHref(contributor),
    role: getContributorRole(contributor),
    bio: stripHtml(getContributorDescription(contributor)) || `Stories reported by the ${publication.identity.shortName} newsroom.`,
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
    }, "132px") : null,
    founder: Boolean(profile?.founder),
    ...(contactLink?.href ? { contactHref: contactLink.href } : {}),
    coverage
  };
}

function relatedPosts(post: WordPressPost, posts: WordPressPost[]) {
  const categorySlugs = new Set(getPostCategories(post).map((category) => category.slug));
  const tagSlugs = new Set(getPostTags(post).map((tag) => tag.slug));
  return posts
    .filter((candidate) => candidate.id !== post.id)
    .map((candidate) => ({
      post: candidate,
      score: getPostCategories(candidate).filter((category) => categorySlugs.has(category.slug)).length +
        getPostTags(candidate).filter((tag) => tagSlugs.has(tag.slug)).length * 2
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.post.date).getTime() - new Date(left.post.date).getTime())
    .slice(0, 3)
    .map(({ post: relatedPost }) => relatedPost);
}

export type BuildArticlePresentationOptions = {
  post: WordPressPost;
  allPosts: WordPressPost[];
  contributors: WordPressContributor[];
  author: WordPressAuthor | null;
};

/** Build the public route's normalized model without importing any renderer. */
export function buildArticlePresentation({ post, allPosts, contributors, author }: BuildArticlePresentationOptions): ArticlePresentation {
  const category = getPrimaryVisibleCategory(post);
  const image = articleImage(getFeaturedMedia(post), "(max-width: 900px) 100vw, 900px", true);
  const topicTags = getPublicTopicTags(post);
  const topicTerms = topicTags.length > 0 ? topicTags : getPostCategories(post).filter((postCategory) => !isHiddenCategory(postCategory));
  const title = stripHtml(post.title.rendered);
  const articleUrl = absoluteUrl(getPostHref(post));
  const publicCorrections = getPublicCorrectionsForPost(post);
  const hasPublicCorrectionNotice = publicCorrections.length > 0;
  const updated = hasArticleUpdatedDate(post) && !hasPublicCorrectionNotice;
  const visiblePosts = allPosts.filter(isVisibleContentPost);
  const displayContributors = contributors.length > 0 ? contributors : author ? [author] : [];
  const coverageAreas = getCoverageAreas(
    displayContributors.length > 0
      ? visiblePosts.filter((candidate) => displayContributors.some((contributor) => postHasContributor(candidate, contributor)))
      : []
  );
  const authorPosts = displayContributors.length > 0
    ? visiblePosts.filter((candidate) => displayContributors.some((contributor) => postHasContributor(candidate, contributor)))
    : [];
  const related = relatedPosts(post, visiblePosts);
  const relatedIds = new Set(related.map((relatedPost) => relatedPost.id));
  const moreByAuthor = authorPosts.filter((candidate) => candidate.id !== post.id && !relatedIds.has(candidate.id)).slice(0, 3);
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
    contributors: displayContributors.map((contributor) => contributorView(contributor, coverageAreas)),
    fallbackByline: `${publication.identity.shortName} Staff`,
    publishedAt: post.date,
    publishedLabel: formatDisplayDate(post.date),
    modifiedAt: updated ? post.modified : null,
    modifiedLabel: updated ? formatDisplayDate(post.modified) : null,
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
    relatedStories: related.map(articleStoryCard),
    moreByAuthorStories: moreByAuthor.map(articleStoryCard),
    publication: { shortName: publication.identity.shortName, contactHref: "/contact/" }
  };
}

