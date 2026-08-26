import { isAthleteSpotlightPost, isSpecialCoveragePost } from "@/lib/content";
import { getFeaturedMedia, getPostCategories, type WordPressPost } from "@/lib/wordpress";

export function hasCategory(post: WordPressPost, slugs: string[]) {
  const slugSet = new Set(slugs);

  return getPostCategories(post).some((category) => slugSet.has(category.slug));
}

export function takeUnused(
  posts: WordPressPost[],
  usedPostIds: Set<number>,
  count: number,
  predicate = (_post: WordPressPost) => true
) {
  const selected: WordPressPost[] = [];

  for (const post of posts) {
    if (usedPostIds.has(post.id) || !predicate(post)) {
      continue;
    }

    selected.push(post);
    usedPostIds.add(post.id);

    if (selected.length === count) {
      break;
    }
  }

  return selected;
}

export function takeOneUnused(
  posts: WordPressPost[],
  usedPostIds: Set<number>,
  predicate: (post: WordPressPost) => boolean
) {
  return takeUnused(posts, usedPostIds, 1, predicate)[0] ?? null;
}

export function takeDiverseUnused(
  posts: WordPressPost[],
  usedPostIds: Set<number>,
  count: number,
  categorySlugs: string[]
) {
  const selected: WordPressPost[] = [];
  const oldFirstPosts = [...posts].reverse();

  const addPost = (post: WordPressPost) => {
    selected.push(post);
    usedPostIds.add(post.id);
  };

  for (const slug of categorySlugs) {
    const post = oldFirstPosts.find((candidate) => !usedPostIds.has(candidate.id) && hasCategory(candidate, [slug]));

    if (post) {
      addPost(post);
    }

    if (selected.length === count) {
      return selected;
    }
  }

  for (const post of oldFirstPosts) {
    if (usedPostIds.has(post.id)) {
      continue;
    }

    addPost(post);

    if (selected.length === count) {
      break;
    }
  }

  return selected;
}

// This is the compatibility resolver for the current Weekly Wildcat homepage.
// It is intentionally pure so the future design resolver and Studio preview can
// be compared against the exact ordered de-duplication behavior before replacing it.
export function resolveWeeklyWildcatHomepage(posts: WordPressPost[]) {
  const usedPostIds = new Set<number>();
  const athleteSpotlightPost = posts.find(isAthleteSpotlightPost) ?? null;

  if (athleteSpotlightPost) {
    usedPostIds.add(athleteSpotlightPost.id);
  }

  const leadPost =
    posts.find((post) => !usedPostIds.has(post.id) && post.sticky) ??
    posts.find((post) => !usedPostIds.has(post.id)) ??
    null;

  if (leadPost) {
    usedPostIds.add(leadPost.id);
  }

  const inFocusPost = takeOneUnused(
    posts,
    usedPostIds,
    (post) => Boolean(getFeaturedMedia(post)) && hasCategory(post, ["features", "culture"])
  );
  const specialCoveragePosts = takeUnused(posts, usedPostIds, 3, isSpecialCoveragePost);
  const opinionPosts = takeUnused(posts, usedPostIds, 3, (post) => hasCategory(post, ["opinion"]));
  const fieldPosts = takeUnused(posts, usedPostIds, 3, (post) => hasCategory(post, ["sports"]));
  const morePosts = takeDiverseUnused(posts, usedPostIds, 4, ["news", "features", "culture", "opinion", "sports"]);
  const rightNowPosts = takeUnused(posts, usedPostIds, 4);
  const briefPosts = takeUnused(posts, usedPostIds, 4);

  return {
    athleteSpotlightPost,
    leadPost,
    inFocusPost,
    specialCoveragePosts,
    opinionPosts,
    fieldPosts,
    morePosts,
    rightNowPosts,
    briefPosts,
    usedPostIds
  };
}

