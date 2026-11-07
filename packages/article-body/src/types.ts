/**
 * The Byline article body, `byline-v1`: what a story says, never how a CMS
 * stored it or how a page draws it.
 *
 * Every consumer meets here. The Payload adapter (`@byline/editor`)
 * normalizes Lexical state into these types; `@byline/ui` renders them for
 * the public site and the newsroom preview. Nothing in this file may name a
 * CMS, an editor engine, a CSS class or a component.
 *
 * Imported WordPress stories are not `byline-v1`: they keep their published
 * HTML (`legacy-html`) and never pass through this contract.
 */

export const ARTICLE_BODY_FORMAT = "byline-v1" as const;
export const ARTICLE_BODY_VERSION = 1 as const;

/** A Media asset's stable identifier. Payload's are integers; fixtures may use strings. */
export type MediaId = number | string;

// ---------------------------------------------------------------------------
// Prose: paragraphs, H2/H3, lists, and the four inline meanings writers use.
// ---------------------------------------------------------------------------

export type TextRun = { type: "text"; text: string; bold?: true; italic?: true };
export type LinkRun = { type: "link"; href: string; children: TextRun[] };
export type LineBreak = { type: "lineBreak" };
export type Inline = TextRun | LinkRun | LineBreak;

export type ParagraphNode = { type: "paragraph"; children: Inline[] };
export type HeadingNode = { type: "heading"; level: 2 | 3; children: Inline[] };
export type ListItemNode = { children: Inline[]; list?: ListNode };
export type ListNode = { type: "list"; ordered: boolean; items: ListItemNode[] };
export type ProseNode = ParagraphNode | HeadingNode | ListNode;

// ---------------------------------------------------------------------------
// Story blocks: the semantic tools. Text inside blocks is plain text; a block
// never carries markup, classes, colours, sizes or widths.
// ---------------------------------------------------------------------------

/** How much of the page a photograph takes: an editorial choice from a fixed set, never a pixel width. */
export type Placement = "column" | "wide" | "full";
export const PLACEMENTS: readonly Placement[] = ["column", "wide", "full"];

/** One photograph. Credit is never here: it belongs to the Media asset. */
export type PhotoBlock = {
  type: "photo";
  id: string;
  media: MediaId | null;
  /** This story's caption: what is shown. */
  caption: string;
  /** Replaces the asset's own alt text for this use only. */
  altOverride?: string;
  placement: Placement;
};

export type GalleryItem = { id: string; media: MediaId | null; caption: string; altOverride?: string };
/** Whole photographs (`natural`) or a tidy grid of equal crops (`crop`). The responsive column count belongs to the renderer. */
export type GalleryFit = "natural" | "crop";
export type GalleryBlock = { type: "gallery"; id: string; items: GalleryItem[]; fit: GalleryFit };

/** A source's words, reported in the story. */
export type ReportedQuoteBlock = { type: "reportedQuote"; id: string; text: string; attribution: string };
/** A line lifted from the story and set large. */
export type PullQuoteBlock = { type: "pullQuote"; id: string; text: string; attribution?: string };

export type KeyFact = { id: string; text: string };
export type KeyFactsBlock = { type: "keyFacts"; id: string; heading: string; facts: KeyFact[] };

/**
 * Background the reader needs. The heading is the writer's ("Context", "Why it
 * matters", "What's next", "How we know"): one block, not four. The body is
 * plain paragraphs (see docs/article-editor.md, "Context body").
 */
export type ContextBlock = { type: "context"; id: string; heading: string; body: ParagraphNode[] };

export type DocumentPageRef = { id: string; page: number; label: string };
/** A source document (a PDF). The direct file link is always published; the inline preview is progressive. */
export type DocumentBlock = {
  type: "document";
  id: string;
  media: MediaId | null;
  title?: string;
  /** Why the reader should look at it. */
  context?: string;
  /** Who produced or released it. */
  source?: string;
  pages: DocumentPageRef[];
};

/** `label` is editorial text ("Fall 2026", "Oct. 17"), never a date object. */
export type TimelineEvent = { id: string; label: string; title: string; body: string; current: boolean };
export type TimelineBlock = { type: "timeline"; id: string; items: TimelineEvent[] };

export type ArticleBlock =
  | PhotoBlock
  | GalleryBlock
  | ReportedQuoteBlock
  | PullQuoteBlock
  | KeyFactsBlock
  | ContextBlock
  | DocumentBlock
  | TimelineBlock;

export type ArticleBlockType = ArticleBlock["type"];
export type ArticleBlockOf<T extends ArticleBlockType> = Extract<ArticleBlock, { type: T }>;

export type ArticleBodyNode = ProseNode | ArticleBlock;

// ---------------------------------------------------------------------------
// Media: what a renderer needs to draw a referenced asset. Resolved by the
// adapter from the Media record (so a corrected credit reaches every story).
// ---------------------------------------------------------------------------

export type ArticleMediaKind = "image" | "document" | "audio" | "video" | "other";

export type ArticleMediaAsset = {
  id: MediaId;
  kind: ArticleMediaKind;
  /** Where the renderer loads it from. Private (authenticated) in the newsroom, public later. */
  src: string;
  /** A smaller rendition for grids, when one exists. */
  previewSrc?: string;
  width: number | null;
  height: number | null;
  mimeType: string;
  filename: string;
  filesize: number | null;
  /** The asset's own alt text; a block's `altOverride` wins for that use. */
  alt: string;
  /** The resolved credit (creator, then credit line), without a "Photo:" lead-in. */
  credit: string;
  /** CSS-independent focal point, 0-100 on each axis, when the asset has one. */
  focalPoint?: { x: number; y: number };
};

export type ArticleBody = {
  format: typeof ARTICLE_BODY_FORMAT;
  version: typeof ARTICLE_BODY_VERSION;
  nodes: ArticleBodyNode[];
  /** Every asset the nodes reference, keyed by `String(id)`. */
  media: Record<string, ArticleMediaAsset>;
};

/** The two ways a public story body exists: imported HTML, kept forever, or the semantic body. */
export type PublicArticleBody = { format: "legacy-html"; html: string } | ArticleBody;

export function isArticleBlock(node: ArticleBodyNode): node is ArticleBlock {
  return node.type !== "paragraph" && node.type !== "heading" && node.type !== "list";
}
