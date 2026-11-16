import { nativeStory } from "./native-snapshot";
import { stripHtml } from "@/lib/format";
import { BEHIND_THE_SCENES } from "@/lib/behind-the-scenes";
import { THE_PROWLER } from "@/lib/the-prowler";
import { FOCUS_SECTION_SLUGS, PUBLIC_SECTION_SLUGS } from "@/lib/sections";
import {
  getLegacyCorrectionNotices,
  getPostCategories,
  getPostCorrections,
  getPostTags,
  type ArchiveCategory,
  type ArchiveCorrection,
  type ArchivePost,
  type ArchiveTag
} from "@/lib/public-content";

const HIDDEN_CATEGORY_SLUGS = new Set(["uncategorized"]);
const HIDDEN_POST_SLUGS = new Set(["hello-world"]);
const HIDDEN_POST_TITLES = new Set(["hey there!"]);
export const SPECIAL_COVERAGE_TAG_SLUG = "special-coverage";
export const ATHLETE_SPOTLIGHT_TAG_SLUG = "athlete-of-the-week";
export const ATHLETE_OF_THE_MONTH_TAG_SLUG = "athlete-of-the-month";

const EDITORIAL_FLAG_TAG_SLUGS = new Set([
  SPECIAL_COVERAGE_TAG_SLUG,
  ATHLETE_SPOTLIGHT_TAG_SLUG,
  ATHLETE_OF_THE_MONTH_TAG_SLUG
]);

export function isHiddenCategory(category: ArchiveCategory | null | undefined) {
  return Boolean(category && HIDDEN_CATEGORY_SLUGS.has(category.slug));
}

export function isPublicSectionCategory(category: ArchiveCategory | null | undefined) {
  return Boolean(category && PUBLIC_SECTION_SLUGS.has(category.slug));
}

export function isHomepageSectionCategory(category: ArchiveCategory | null | undefined) {
  return Boolean(category && (PUBLIC_SECTION_SLUGS.has(category.slug) || FOCUS_SECTION_SLUGS.has(category.slug)));
}

export function getPrimaryPublicCategory(post: ArchivePost) {
  return getPostCategories(post).find((category) => isPublicSectionCategory(category)) ?? null;
}

export function getPrimaryVisibleCategory(post: ArchivePost) {
  const categories = getPostCategories(post);
  // Satire always shows as satire, even when a story also sits in a news section.
  return categories.find((category) => category.slug === THE_PROWLER.slug)
    ?? categories.find((category) => category.slug === BEHIND_THE_SCENES.slug)
    ?? categories.find((category) => !isHiddenCategory(category)) ?? null;
}

export function hasPostTag(post: ArchivePost, slug: string) {
  return getPostTags(post).some((tag) => tag.slug === slug);
}

export function isSpecialCoveragePost(post: ArchivePost) {
  return hasPostTag(post, SPECIAL_COVERAGE_TAG_SLUG);
}

export function isAthleteSpotlightPost(post: ArchivePost) {
  return hasPostTag(post, ATHLETE_SPOTLIGHT_TAG_SLUG) || hasPostTag(post, ATHLETE_OF_THE_MONTH_TAG_SLUG);
}

export function isEditorialFlagTag(tag: ArchiveTag) {
  return EDITORIAL_FLAG_TAG_SLUGS.has(tag.slug);
}

export function getPublicTopicTags(post: ArchivePost) {
  return getPostTags(post).filter((tag) => !isEditorialFlagTag(tag));
}

export function getAthleteSpotlightLabel(post: ArchivePost) {
  if (hasPostTag(post, ATHLETE_SPOTLIGHT_TAG_SLUG)) {
    return "Athlete of the Week";
  }

  if (hasPostTag(post, ATHLETE_OF_THE_MONTH_TAG_SLUG)) {
    return "Athlete of the Month";
  }

  const title = stripHtml(post.title.rendered);

  if (/^athlete\s+of\s+the\s+week\b/i.test(title)) {
    return "Athlete of the Week";
  }

  if (/^athlete\s+of\s+the\s+month\b/i.test(title)) {
    return "Athlete of the Month";
  }

  return "Athlete Spotlight";
}

function getCleanSportTagName(tag: ArchiveTag) {
  return stripHtml(tag.name).replace(/^sport\s*:\s*/i, "").trim();
}

function isSportTag(tag: ArchiveTag) {
  return tag.slug.startsWith("sport-") || /^sport\s*:/i.test(stripHtml(tag.name));
}

export function getAthleteSportLabel(post: ArchivePost) {
  const topicTags = getPublicTopicTags(post);
  const sportTag = topicTags.find(isSportTag) ?? topicTags[0];

  return sportTag ? getCleanSportTagName(sportTag) : null;
}

export function isVisibleContentPost(post: ArchivePost) {
  if (nativeStory(post.id)) return true;
  if (post.status !== "publish") {
    return false;
  }

  const title = stripHtml(post.title.rendered).toLowerCase();

  if (HIDDEN_POST_SLUGS.has(post.slug) || HIDDEN_POST_TITLES.has(title)) {
    return false;
  }

  return Boolean(getPrimaryVisibleCategory(post));
}

export function isPublicHomepagePost(post: ArchivePost) {
  return isGeneralEditorialPost(post) && getPostCategories(post).some((category) => isHomepageSectionCategory(category));
}

export function isBehindTheScenesPost(post: ArchivePost) {
  return getPostCategories(post).some((category) => category.slug === BEHIND_THE_SCENES.slug);
}

export function isProwlerPost(post: ArchivePost) {
  return getPostCategories(post).some((category) => category.slug === THE_PROWLER.slug);
}

// Public BTS and Prowler articles remain searchable, indexable and listed on
// author pages. Category membership only changes automatic placement in
// general news lists.
export function isGeneralEditorialPost(post: ArchivePost) {
  return isVisibleContentPost(post) && !isBehindTheScenesPost(post) && !isProwlerPost(post);
}

export function filterGeneralEditorialPosts(posts: ArchivePost[]) {
  return posts.filter(isGeneralEditorialPost);
}

export function getBehindTheScenesPosts(posts: ArchivePost[]) {
  return posts.filter((post) => isVisibleContentPost(post) && isBehindTheScenesPost(post))
    .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id);
}

export function getProwlerPosts(posts: ArchivePost[]) {
  return posts.filter((post) => isVisibleContentPost(post) && isProwlerPost(post))
    .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id);
}

export function filterVisibleContentPosts(posts: ArchivePost[]) {
  return posts.filter(isVisibleContentPost);
}

export function filterPublicHomepagePosts(posts: ArchivePost[]) {
  return posts.filter(isPublicHomepagePost);
}

function correctionKey(correction: ArchiveCorrection) {
  return `${correction.postId ?? "unknown"}|${correction.type}|${correction.date}|${correction.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export type PublicCorrectionEntry = ArchiveCorrection & {
  post: ArchivePost;
};

/**
 * Joins public correction records to the already-published post collection.
 * The join is deliberate: a correction endpoint must not be able to make an
 * unpublished headline or a private story discoverable on the public log.
 */
export function getPublicCorrectionLog(posts: ArchivePost[], remoteCorrections: ArchiveCorrection[] = []) {
  const visiblePosts = posts.filter(isVisibleContentPost);
  const postsById = new Map(visiblePosts.map((post) => [post.id, post]));
  const entries: PublicCorrectionEntry[] = [];
  const seen = new Set<string>();

  for (const post of visiblePosts) {
    for (const correction of [...getLegacyCorrectionNotices(post), ...getPostCorrections(post)]) {
      const entry = { ...correction, post: post };
      const key = correctionKey(entry);

      if (!seen.has(key)) {
        seen.add(key);
        entries.push(entry);
      }
    }
  }

  for (const correction of remoteCorrections) {
    const post = correction.postId ? postsById.get(correction.postId) : undefined;

    if (!post) {
      continue;
    }

    const entry = { ...correction, post };
    const key = correctionKey(entry);

    if (!seen.has(key)) {
      seen.add(key);
      entries.push(entry);
    }
  }

  return entries
    .sort((left, right) => {
      const rightDate = new Date(right.date || right.post.modified || right.post.date).getTime();
      const leftDate = new Date(left.date || left.post.modified || left.post.date).getTime();
      return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
    })
    .slice(0, 100);
}
