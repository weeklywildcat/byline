import { mediaKey } from "./media";
import type { ArticleBlock, ArticleBody, ArticleBodyNode, ArticleReferences, MediaId, PublicPollReference, PublicStoryReference } from "./types";
import { isArticleBlock } from "./types";

/**
 * Every record a block names directly, in one exhaustive place. Media
 * discovery (publication readiness, the Story's media report, the renderer's
 * table) and reference discovery (related Stories, Polls) both read it, so a
 * block type that names a record can never be missed by one of them.
 */
const present = (id: MediaId | null | undefined): MediaId[] => (id === null || id === undefined ? [] : [id]);

export function blockMediaIds(block: ArticleBlock): MediaId[] {
  switch (block.type) {
    case "photo":
    case "portraitText":
    case "visualChapter":
    case "audio":
    case "document":
    case "annotatedImage":
      return present(block.media);
    case "gallery":
      return block.items.flatMap((item) => present(item.media));
    case "chartMap":
      return present(block.image);
    case "beforeAfter":
      return [...present(block.before), ...present(block.after)];
    case "reportedQuote":
    case "pullQuote":
    case "keyFacts":
    case "context":
    case "timeline":
    case "video":
    case "editorsNote":
    case "marginNote":
    case "expandable":
    case "dataTable":
    case "comparison":
    case "keyNumbers":
    case "relatedCoverage":
    case "poll":
    case "repositoryInteractive":
      return [];
    default:
      return assertNever(block);
  }
}

export function blockStoryIds(block: ArticleBlock): MediaId[] {
  return block.type === "relatedCoverage" ? block.stories.flatMap((item) => present(item.story)) : [];
}

export function blockPollIds(block: ArticleBlock): MediaId[] {
  return block.type === "poll" ? present(block.poll) : [];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled block: ${JSON.stringify(value)}`);
}

const unique = (ids: MediaId[]): MediaId[] => [...new Map(ids.map((id) => [mediaKey(id), id])).values()];

export function bodyMediaIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return unique(nodes.filter(isArticleBlock).flatMap(blockMediaIds));
}

export function bodyStoryIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return unique(nodes.filter(isArticleBlock).flatMap(blockStoryIds));
}

export function bodyPollIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return unique(nodes.filter(isArticleBlock).flatMap(blockPollIds));
}

/** Whether a body names no private or unresolved record: every Story and Poll it points at is in its reference table. */
export function missingReferences(body: Pick<ArticleBody, "nodes" | "references">): { stories: MediaId[]; polls: MediaId[] } {
  const stories = body.references?.stories ?? {};
  const polls = body.references?.polls ?? {};
  return {
    stories: bodyStoryIds(body.nodes).filter((id) => !(mediaKey(id) in stories)),
    polls: bodyPollIds(body.nodes).filter((id) => !(mediaKey(id) in polls))
  };
}

/** What a host resolves while normalizing: the public-safe Story and Poll facts, or null when gone or not public. */
export type ReferenceLookup = {
  story?: (id: MediaId) => PublicStoryReference | null | undefined;
  poll?: (id: MediaId) => PublicPollReference | null | undefined;
  /** Whether a repository interactive with this key is registered. */
  interactive?: (key: string) => boolean;
};

export type { ArticleReferences };
