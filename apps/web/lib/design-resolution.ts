import {
  resolveDesignContentBlocks,
  type DesignContentBlock,
  type StoryQuery
} from "@byline/content";
import { getPublicationConfig } from "@/lib/publication";
import { getActiveTheme } from "@/lib/theme";
import type { WordPressPost } from "@/lib/wordpress";

const BLOCK_FEATURES: Record<string, string> = {
  "sports-scores": "sports",
  "sports-upcoming": "sports",
  "team-feature": "sports",
  "athlete-feature": "sports",
  "events-list": "events",
  poll: "polls",
  newsletter: "newsletter"
};

function postMatchesQuery(post: WordPressPost, query: StoryQuery) {
  if (query.type === "latest") return true;
  if (query.type === "sticky") return post.sticky === true;
  if (query.type === "category") return post.categories.includes(query.categoryId);
  if (query.type === "tag") return post.tags.includes(query.tagId);
  if (query.type === "author") return post.author === query.authorId;
  return query.postIds.includes(post.id);
}

/**
 * The retained schema-v1 runtime. It is intentionally the old resolver, not a
 * second homepage architecture: it exists only while a published v1 document
 * still contains a visible block without a faithful v2 representation.
 */
export async function resolvePublishedDesignBlocks(
  content: Array<{ type: string; props: Record<string, unknown> }>,
  posts: WordPressPost[]
) {
  const publication = getPublicationConfig();
  const theme = getActiveTheme();
  const supportedBlocks = new Set<string>(theme.capabilities.supportedBlocks);
  const activeBlocks: DesignContentBlock[] = [];

  for (const block of content) {
    if (!supportedBlocks.has(block.type)) {
      throw new Error(
        `Published design uses block ${block.type}, which theme ${theme.id} does not support. Choose a compatible theme or update the design.`
      );
    }
    const feature = BLOCK_FEATURES[block.type];
    if (feature && publication.features[feature] === false) {
      console.warn(`Byline omitted ${block.type} because the ${feature} module is disabled.`);
      continue;
    }
    activeBlocks.push(block);
  }

  return resolveDesignContentBlocks(activeBlocks, (query) => {
    const matching = posts.filter((post) => postMatchesQuery(post, query));
    return query.type === "manual"
      ? matching.sort((left, right) => query.postIds.indexOf(left.id) - query.postIds.indexOf(right.id))
      : matching;
  });
}
