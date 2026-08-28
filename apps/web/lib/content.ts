import { stripHtml } from "@/lib/format";
import { FOCUS_SECTION_SLUGS, PUBLIC_SECTION_SLUGS } from "@/lib/sections";
import {
  getLegacyCorrectionNotices,
  getPostCategories,
  getPostCorrections,
  getPostTags,
  type WordPressCategory,
  type WordPressCorrection,
  type WordPressPost,
  type WordPressTag
} from "@/lib/wordpress";

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

export function isHiddenCategory(category: WordPressCategory | null | undefined) {
  return Boolean(category && HIDDEN_CATEGORY_SLUGS.has(category.slug));
}

export function isPublicSectionCategory(category: WordPressCategory | null | undefined) {
  return Boolean(category && PUBLIC_SECTION_SLUGS.has(category.slug));
}

export function isHomepageSectionCategory(category: WordPressCategory | null | undefined) {
  return Boolean(category && (PUBLIC_SECTION_SLUGS.has(category.slug) || FOCUS_SECTION_SLUGS.has(category.slug)));
}

export function getPrimaryPublicCategory(post: WordPressPost) {
  return getPostCategories(post).find((category) => isPublicSectionCategory(category)) ?? null;
}

export function getPrimaryVisibleCategory(post: WordPressPost) {
  return getPostCategories(post).find((category) => !isHiddenCategory(category)) ?? null;
}

export function hasPostTag(post: WordPressPost, slug: string) {
  return getPostTags(post).some((tag) => tag.slug === slug);
}

export function isSpecialCoveragePost(post: WordPressPost) {
  return hasPostTag(post, SPECIAL_COVERAGE_TAG_SLUG);
}

export function isAthleteSpotlightPost(post: WordPressPost) {
  return hasPostTag(post, ATHLETE_SPOTLIGHT_TAG_SLUG) || hasPostTag(post, ATHLETE_OF_THE_MONTH_TAG_SLUG);
}

export function isEditorialFlagTag(tag: WordPressTag) {
  return EDITORIAL_FLAG_TAG_SLUGS.has(tag.slug);
}

export function getPublicTopicTags(post: WordPressPost) {
  return getPostTags(post).filter((tag) => !isEditorialFlagTag(tag));
}

export function getAthleteSpotlightLabel(post: WordPressPost) {
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

function getCleanSportTagName(tag: WordPressTag) {
  return stripHtml(tag.name).replace(/^sport\s*:\s*/i, "").trim();
}

function isSportTag(tag: WordPressTag) {
  return tag.slug.startsWith("sport-") || /^sport\s*:/i.test(stripHtml(tag.name));
}

export function getAthleteSportLabel(post: WordPressPost) {
  const topicTags = getPublicTopicTags(post);
  const sportTag = topicTags.find(isSportTag) ?? topicTags[0];

  return sportTag ? getCleanSportTagName(sportTag) : null;
}

export function isVisibleContentPost(post: WordPressPost) {
  if (post.status !== "publish") {
    return false;
  }

  const title = stripHtml(post.title.rendered).toLowerCase();

  if (HIDDEN_POST_SLUGS.has(post.slug) || HIDDEN_POST_TITLES.has(title)) {
    return false;
  }

  return Boolean(getPrimaryVisibleCategory(post));
}

export function isPublicHomepagePost(post: WordPressPost) {
  return isVisibleContentPost(post) && getPostCategories(post).some((category) => isHomepageSectionCategory(category));
}

export function filterVisibleContentPosts(posts: WordPressPost[]) {
  return posts.filter(isVisibleContentPost);
}

export function filterPublicHomepagePosts(posts: WordPressPost[]) {
  return posts.filter(isPublicHomepagePost);
}

function correctionKey(correction: WordPressCorrection) {
  return `${correction.postId ?? "unknown"}|${correction.type}|${correction.date}|${correction.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export type PublicCorrectionEntry = WordPressCorrection & {
  post: WordPressPost;
};

/**
 * Joins public correction records to the already-published post collection.
 * The join is deliberate: a correction endpoint must not be able to make an
 * unpublished headline or a private story discoverable on the public log.
 */
export function getPublicCorrectionLog(posts: WordPressPost[], remoteCorrections: WordPressCorrection[] = []) {
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
