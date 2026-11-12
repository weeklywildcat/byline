import type { ImageCropShape } from "@byline/core";
import type {
  ArticleImageView,
  ArticlePresentationContext,
  PublicSeriesInput,
  PublicStory,
  PublicStoryContributor,
  PublicStorySummary,
  PublicTerm,
  StoryImageUsage
} from "@byline/content/story";
import { getResponsiveImageProps, type ImageSearchVisibility } from "@/lib/media";
import { getAthleteSportLabel, getAthleteSpotlightLabel, getPrimaryVisibleCategory, getPublicTopicTags, isAthleteSpotlightPost, isGeneralEditorialPost, isHiddenCategory } from "@/lib/content";
import { decodeHtml, formatDisplayDate, stripHtml } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { buildArticleLiveView } from "@/lib/live-coverage";
import { getArticleVideoView, getStoryVideoBadge } from "@/lib/story-video";
import {
  contributorHasProfilePage,
  getAuthorProfile,
  getCategoryHref,
  getContributorHref,
  getContributorName,
  getContributorPhoto,
  getContributorRole,
  getContributorSocialLinks,
  getCoverageHref,
  getFeaturedMedia,
  getMediaCredit,
  getPostCategories,
  getPostContributors,
  getPostHref,
  getPostReportingNote,
  getPostStoryPresentation,
  getPostTags,
  getPublicCorrectionsForPost,
  isGuestContributor,
  type ArchiveCategory,
  type ArchiveContributor,
  type ArchiveCoverage,
  type ArchiveMedia,
  type ArchivePost
} from "@/lib/public-content";

/**
 * WordPress → canonical Story. Everything WordPress-shaped (rendered fields,
 * embedded terms, attachment sizes, guest authors) stops here; the shared
 * builder in `@byline/content/story` applies Byline's rules to the result.
 * The image handle is the WordPress attachment, projected by `archiveImage`
 * into the public site's responsive, mirrored URLs.
 */
export type ArchiveImage = ArchiveMedia;

const publication = getPublicationConfig();

function categoryTerm(category: ArchiveCategory, href: string): PublicTerm {
  return { key: category.slug, name: decodeHtml(category.name), href };
}

/** Identities a contributor matches on other posts: users by ID, guests by ID or slug. */
function contributorKeys(contributor: ArchiveContributor): string[] {
  return isGuestContributor(contributor) ? [`guest:${contributor.id}`, `guest-slug:${contributor.slug}`] : [`user:${contributor.id}`];
}

export function archiveImage(image: ArchiveMedia | null, sizes?: string, priority = false, imageSearchVisibility: ImageSearchVisibility = "canonical", shape?: ImageCropShape): ArticleImageView | null {
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

// The archive has no editor crops, so an art-directed alternative (`cropOnly`) never exists there.
export const projectWordPressImage = (image: ArchiveImage, usage: StoryImageUsage) => usage.cropOnly ? null : archiveImage(image, usage.sizes, usage.priority, usage.searchVisibility, usage.shape);

/** A post as another story's card, relatedness and coverage facts. */
export function archiveStorySummary(post: ArchivePost): PublicStorySummary<ArchiveImage> {
  const category = getPrimaryVisibleCategory(post);
  return {
    id: post.id,
    title: stripHtml(post.title.rendered),
    href: getPostHref(post),
    excerptHtml: post.excerpt.rendered.trim(),
    image: getFeaturedMedia(post),
    // A contributor's coverage areas link to the plain category archive.
    section: category ? categoryTerm(category, `/category/${category.slug}/`) : null,
    sectionKeys: getPostCategories(post).map((term) => term.slug),
    topicKeys: getPostTags(post).map((term) => term.slug),
    contributorKeys: getPostContributors(post).flatMap(contributorKeys),
    publishedAt: post.date,
    video: getStoryVideoBadge(post),
    listed: isGeneralEditorialPost(post)
  };
}

function contributor(person: ArchiveContributor): PublicStoryContributor<ArchiveImage> {
  const profile = !isGuestContributor(person) ? getAuthorProfile(person) : null;
  const photo = getContributorPhoto(person);
  const contactLink = !isGuestContributor(person) ? getContributorSocialLinks(person).find((link) => link.label === "Email") : undefined;
  return {
    keys: contributorKeys(person),
    id: `${isGuestContributor(person) ? "guest" : "user"}-${person.id}-${person.slug}`,
    name: getContributorName(person),
    href: contributorHasProfilePage(person) ? getContributorHref(person) : "",
    role: getContributorRole(person),
    bio: !isGuestContributor(person) ? stripHtml(profile?.shortBio ?? "") : "",
    photo: photo ? {
      id: typeof photo.id === "number" ? photo.id : 0,
      date: "",
      slug: "",
      type: "attachment",
      link: "",
      title: { rendered: photo.alt || getContributorName(person) },
      author: 0,
      caption: { rendered: "" },
      alt_text: photo.alt || "",
      media_type: "image",
      mime_type: "image",
      media_details: { width: photo.width ?? undefined, height: photo.height ?? undefined },
      source_url: photo.url
    } : null,
    ...(contactLink?.href ? { contactHref: contactLink.href } : {})
  };
}

/** The canonical public Story for a WordPress post. `contributors` are the displayed byline, in order. */
export function archivePublicStory(post: ArchivePost, contributors: ArchiveContributor[]): PublicStory<ArchiveImage> {
  const summary = archiveStorySummary(post);
  const category = getPrimaryVisibleCategory(post);
  const term = (item: { taxonomy: string; id: number; name: string }): PublicTerm => ({ key: `${item.taxonomy}-${item.id}`, name: decodeHtml(item.name), href: "" });
  const storyPresentation = getPostStoryPresentation(post);
  return {
    ...summary,
    section: category ? categoryTerm(category, getCategoryHref(category)) : null,
    url: absoluteUrl(getPostHref(post)),
    titleHtml: post.title.rendered,
    body: { format: "legacy-html", html: post.content.rendered.trim() },
    topics: getPublicTopicTags(post).map(term),
    sections: getPostCategories(post).filter((postCategory) => !isHiddenCategory(postCategory)).map(term),
    athleteMeta: isAthleteSpotlightPost(post) ? [getAthleteSpotlightLabel(post), getAthleteSportLabel(post)].filter((value): value is string => Boolean(value)) : [],
    presentation: storyPresentation.presentation,
    immersiveAlignment: storyPresentation.immersiveAlignment,
    featureWidth: storyPresentation.featureWidth,
    splitImageSide: storyPresentation.splitImageSide,
    siteNavigation: storyPresentation.siteNavigation,
    primaryVideo: getArticleVideoView(post),
    contributors: contributors.map(contributor),
    modifiedAt: post.modified,
    corrections: getPublicCorrectionsForPost(post).map((correction) => ({ id: correction.id, type: correction.type, date: correction.date || null, text: correction.text, ...(correction.legacy ? { legacy: true } : {}) })),
    live: buildArticleLiveView(post),
    reportingNote: getPostReportingNote(post)
  };
}

/** Whether a coverage's stories are complete; a series still in progress promises no total. */
export function isCoverageComplete(coverage: Pick<ArchiveCoverage, "status">) {
  return coverage.status === "past" || coverage.status === "archived";
}

/** A public coverage as the builder's series input: its members that exist, in the editor's order. */
export function archiveSeriesInput(coverage: ArchiveCoverage, postsById: ReadonlyMap<number, ArchivePost>): PublicSeriesInput<ArchiveImage> {
  return {
    id: coverage.slug,
    title: coverage.title,
    href: getCoverageHref(coverage),
    ...(coverage.description ? { description: coverage.description } : {}),
    format: coverage.format === "series" ? "series" : "coverage",
    complete: isCoverageComplete(coverage),
    stories: coverage.stories.flatMap((story) => {
      const post = postsById.get(story.id);
      return post ? [archiveStorySummary(post)] : [];
    })
  };
}

/** The host half of the presentation context (images, dates, publication); the caller adds the candidates. */
export function archivePresentationContext(): Pick<ArticlePresentationContext<ArchiveImage>, "image" | "formatDate" | "publication"> {
  return {
    image: projectWordPressImage,
    formatDate: formatDisplayDate,
    publication: { shortName: publication.identity.shortName, contactHref: publication.urls.contact }
  };
}
