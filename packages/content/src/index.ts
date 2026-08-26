export type StoryQuery =
  | { type: "latest"; limit: number }
  | { type: "sticky"; limit: number }
  | { type: "category"; categoryId: number; limit: number }
  | { type: "tag"; tagId: number; limit: number }
  | { type: "author"; authorId: number; limit: number }
  | { type: "manual"; postIds: number[] };

export type ResolvableStory = {
  id: number;
};

export type ContentResolutionContext = {
  usedStoryIds: Set<number>;
};

const MAX_QUERY_LIMIT = 50;

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function boundedLimit(value: unknown) {
  return positiveId(value) && value <= MAX_QUERY_LIMIT ? value : null;
}

export function normalizeStoryQuery(value: unknown): StoryQuery | null {
  if (!value || typeof value !== "object") return null;
  const query = value as Record<string, unknown>;

  if (query.type === "manual") {
    if (!Array.isArray(query.postIds) || !query.postIds.every(positiveId)) return null;
    return { type: "manual", postIds: [...new Set(query.postIds)] };
  }

  const limit = boundedLimit(query.limit);
  if (!limit) return null;

  if (query.type === "latest" || query.type === "sticky") return { type: query.type, limit };
  if (query.type === "category" && positiveId(query.categoryId)) {
    return { type: "category", categoryId: query.categoryId, limit };
  }
  if (query.type === "tag" && positiveId(query.tagId)) return { type: "tag", tagId: query.tagId, limit };
  if (query.type === "author" && positiveId(query.authorId)) {
    return { type: "author", authorId: query.authorId, limit };
  }

  return null;
}

export function createContentResolutionContext(initialStoryIds: Iterable<number> = []): ContentResolutionContext {
  return { usedStoryIds: new Set([...initialStoryIds].filter(positiveId)) };
}

export function consumeResolvedStories<T extends ResolvableStory>(
  candidates: T[],
  context: ContentResolutionContext,
  options: { limit: number; allowDuplicates?: boolean }
) {
  const limit = Number.isFinite(options.limit)
    ? Math.max(0, Math.min(MAX_QUERY_LIMIT, Math.floor(options.limit)))
    : 0;
  const selected: T[] = [];

  for (const candidate of candidates) {
    if (!positiveId(candidate.id)) continue;
    if (!options.allowDuplicates && context.usedStoryIds.has(candidate.id)) continue;
    selected.push(candidate);
    context.usedStoryIds.add(candidate.id);
    if (selected.length === limit) break;
  }

  return selected;
}

export type DesignContentBlock = {
  type: string;
  props: Record<string, unknown>;
};

export type ResolvedDesignContentBlock<T extends ResolvableStory> = DesignContentBlock & {
  stories: T[];
  query: StoryQuery | null;
};

export const STORY_QUERY_BLOCK_IDS = new Set([
  "story-lead", "story-grid", "story-list", "latest-stories", "featured-story", "section-feed",
  "opinion-package", "photo-feature", "special-coverage", "team-feature", "athlete-feature"
]);

export function storyQueryFromBlockProps(props: Record<string, unknown>): StoryQuery | null {
  if (props.query && typeof props.query === "object") {
    return normalizeStoryQuery(props.query);
  }
  if (props.queryType === "manual") {
    return normalizeStoryQuery({ type: "manual", postIds: props.postIds });
  }
  if (props.queryType === "category") {
    return normalizeStoryQuery({ type: "category", categoryId: props.sourceId, limit: props.limit });
  }
  if (props.queryType === "tag") {
    return normalizeStoryQuery({ type: "tag", tagId: props.sourceId, limit: props.limit });
  }
  if (props.queryType === "author") {
    return normalizeStoryQuery({ type: "author", authorId: props.sourceId, limit: props.limit });
  }
  return normalizeStoryQuery({
    type: props.queryType === "sticky" ? "sticky" : "latest",
    limit: props.limit ?? 5
  });
}

export async function resolveDesignContentBlocks<T extends ResolvableStory>(
  blocks: DesignContentBlock[],
  resolveQuery: (query: StoryQuery) => Promise<T[]> | T[],
  initialStoryIds: Iterable<number> = []
): Promise<Array<ResolvedDesignContentBlock<T>>> {
  const context = createContentResolutionContext(initialStoryIds);
  const resolved: Array<ResolvedDesignContentBlock<T>> = [];

  for (const block of blocks) {
    const query = STORY_QUERY_BLOCK_IDS.has(block.type) ? storyQueryFromBlockProps(block.props) : null;
    if (!query) {
      resolved.push({ ...block, query: null, stories: [] });
      continue;
    }
    const candidates = await resolveQuery(query);
    const limit = query.type === "manual" ? query.postIds.length : query.limit;
    resolved.push({
      ...block,
      query,
      stories: consumeResolvedStories(candidates, context, {
        limit,
        allowDuplicates: block.props.allowDuplicates === true
      })
    });
  }

  return resolved;
}
