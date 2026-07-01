import { stripHtml } from "@/lib/format";
import { FOCUS_SECTION_SLUGS, PUBLIC_SECTION_SLUGS } from "@/lib/sections";
import { getPostCategories, getPostTags, type WordPressCategory, type WordPressPost } from "@/lib/wordpress";

const HIDDEN_CATEGORY_SLUGS = new Set(["uncategorized"]);
const HIDDEN_POST_SLUGS = new Set(["hello-world"]);
const HIDDEN_POST_TITLES = new Set(["hey there!"]);
export const SPECIAL_COVERAGE_TAG_SLUG = "special-coverage";
export const ATHLETE_SPOTLIGHT_TAG_SLUG = "athlete-of-the-week";
export const ATHLETE_OF_THE_MONTH_TAG_SLUG = "athlete-of-the-month";

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

export function isVisibleContentPost(post: WordPressPost) {
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
