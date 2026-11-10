import { mediaKey } from "./media";
import { sourceRefs } from "./evidence";
import type { ArticleBlock, ArticleBody, ArticleBodyNode, ArticleReferences, MediaId, PublicDataProjectReference, PublicEventReference, PublicPollReference, PublicStoryReference } from "./types";
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
    case "timeline":
      return block.items.flatMap((event) => [...present(event.image?.media), ...present(event.document?.media)]);
    case "chartMap":
      return present(block.image);
    case "beforeAfter":
      return [...present(block.before), ...present(block.after)];
    case "reportedQuote":
    case "pullQuote":
    case "keyFacts":
    case "context":
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
    case "repositoryTracker":
    case "dataProject":
    case "event":
    case "socialPost":
    case "finalScore":
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

export function blockDataProjectIds(block: ArticleBlock): MediaId[] {
  return block.type === "dataProject" ? present(block.project) : [];
}

export function blockEventIds(block: ArticleBlock): MediaId[] {
  return block.type === "event" ? present(block.event) : [];
}

/** Media named inline: the PDFs Source references point at. */
export function inlineMediaIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return sourceRefs(nodes).flatMap((ref) => (ref.kind === "document" ? present(ref.media) : []));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled block: ${JSON.stringify(value)}`);
}

const unique = (ids: MediaId[]): MediaId[] => [...new Map(ids.map((id) => [mediaKey(id), id])).values()];

export function bodyMediaIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return unique([...nodes.filter(isArticleBlock).flatMap(blockMediaIds), ...inlineMediaIds(nodes)]);
}

export function bodyStoryIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return unique(nodes.filter(isArticleBlock).flatMap(blockStoryIds));
}

export function bodyPollIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return unique(nodes.filter(isArticleBlock).flatMap(blockPollIds));
}

export function bodyDataProjectIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return unique(nodes.filter(isArticleBlock).flatMap(blockDataProjectIds));
}

export function bodyEventIds(nodes: readonly ArticleBodyNode[]): MediaId[] {
  return unique(nodes.filter(isArticleBlock).flatMap(blockEventIds));
}

/** Whether a body names no private or unresolved record: every Story, Poll and Event it points at is in its reference table. */
export function missingReferences(body: Pick<ArticleBody, "nodes" | "references">): { stories: MediaId[]; polls: MediaId[]; events: MediaId[] } {
  const stories = body.references?.stories ?? {};
  const polls = body.references?.polls ?? {};
  const events = body.references?.events ?? {};
  return {
    stories: bodyStoryIds(body.nodes).filter((id) => !(mediaKey(id) in stories)),
    polls: bodyPollIds(body.nodes).filter((id) => !(mediaKey(id) in polls)),
    events: bodyEventIds(body.nodes).filter((id) => !(mediaKey(id) in events))
  };
}

/** What a host resolves while normalizing: the public-safe Story, Poll and Event facts, or null when gone or not public. */
export type ReferenceLookup = {
  story?: (id: MediaId) => PublicStoryReference | null | undefined;
  poll?: (id: MediaId) => PublicPollReference | null | undefined;
  event?: (id: MediaId) => PublicEventReference | null | undefined;
  /** Whether a repository interactive with this key is registered. */
  interactive?: (key: string) => boolean;
  /** Whether a repository tracker with this key is registered. */
  tracker?: (key: string) => boolean;
  /**
   * The published Data Project with this ID, or null when it is missing,
   * deleted, never published or has no valid public representation. Only the
   * ID is kept: the host resolves everything else when the story renders.
   */
  dataProject?: (id: MediaId) => PublicDataProjectReference | null | undefined;
};

export type { ArticleReferences };
