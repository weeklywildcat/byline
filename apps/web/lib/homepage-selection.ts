import {
  resolveCompatibilityHomepageSelection,
  takeUnusedStories,
  type HomepageSelection as SharedHomepageSelection,
  type HomepageStoryInput
} from "@byline/content";
import { toHomepageStoryInputs } from "@/lib/homepage-story-input";
import { getPostCategories, type WordPressPost } from "@/lib/wordpress";

export function hasCategory(post: WordPressPost, slugs: string[]) {
  const slugSet = new Set(slugs);

  return getPostCategories(post).some((category) => slugSet.has(category.slug));
}

/**
 * Retained WordPress-shaped helper.
 *
 * The selection algorithm itself lives in `@byline/content`; this wraps the
 * shared primitive so the existing build-time call sites and their regression
 * tests keep reading WordPress records.
 */
export function takeUnused(
  posts: WordPressPost[],
  usedPostIds: Set<number>,
  count: number,
  predicate = (_post: WordPressPost) => true
) {
  const selected: WordPressPost[] = [];

  for (const post of posts) {
    if (usedPostIds.has(post.id) || !predicate(post)) continue;

    selected.push(post);
    usedPostIds.add(post.id);

    if (selected.length === count) break;
  }

  return selected;
}

// Kept exported for the shared primitive's own regression coverage.
export { takeUnusedStories };

/**
 * The compatibility homepage selection, expressed in WordPress records.
 *
 * There is one selection algorithm and it is
 * `resolveCompatibilityHomepageSelection` in `@byline/content`, which Studio
 * runs too. This function only adapts posts in and posts out, and returns the
 * shared selection alongside its WordPress-shaped view so the same object can
 * be handed straight to the canonical package resolvers.
 *
 * `reservedPostIds` are stories an editor pinned into a specific package. They
 * are seeded into the one used-story set so no other package can claim them
 * first; the pinning package then places them itself.
 */
export type HomepageSelection = SharedHomepageSelection & {
  athleteSpotlightPost: WordPressPost | null;
  leadPost: WordPressPost | null;
  inFocusPost: WordPressPost | null;
  specialCoveragePosts: WordPressPost[];
  opinionPosts: WordPressPost[];
  fieldPosts: WordPressPost[];
  morePosts: WordPressPost[];
  rightNowPosts: WordPressPost[];
  briefPosts: WordPressPost[];
  usedPostIds: Set<number>;
};

export function resolveWeeklyWildcatHomepage(
  posts: WordPressPost[],
  reservedPostIds?: ReadonlySet<number>
): HomepageSelection {
  const selection = resolveCompatibilityHomepageSelection(toHomepageStoryInputs(posts), reservedPostIds);
  const byId = new Map(posts.map((post) => [post.id, post]));
  const post = (story: HomepageStoryInput) => byId.get(story.id) as WordPressPost;
  const postsOf = (stories: HomepageStoryInput[]) => stories.map(post);

  return {
    ...selection,
    athleteSpotlightPost: selection.athleteSpotlightStory ? post(selection.athleteSpotlightStory) : null,
    leadPost: selection.leadStory ? post(selection.leadStory) : null,
    inFocusPost: selection.inFocusStory ? post(selection.inFocusStory) : null,
    specialCoveragePosts: postsOf(selection.specialCoverageStories),
    opinionPosts: postsOf(selection.opinionStories),
    fieldPosts: postsOf(selection.fieldStories),
    morePosts: postsOf(selection.moreStories),
    rightNowPosts: postsOf(selection.latestStories),
    briefPosts: postsOf(selection.briefStories),
    usedPostIds: selection.usedStoryIds
  };
}
