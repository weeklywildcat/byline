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
/**
 * A footnote reference in running prose. `id` is stable (it anchors the note
 * and its backlink); the visible number is derived from document order and
 * is never stored. `text` is the note, plain text.
 */
export type FootnoteRef = { type: "footnote"; id: string; text: string };
export type Inline = TextRun | LinkRun | LineBreak | FootnoteRef;

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

/** A compact profile or explainer moment: a portrait and the short passage that belongs with it. */
export type PortraitSide = "left" | "right";
export type PortraitTextBlock = {
  type: "portraitText";
  id: string;
  media: MediaId | null;
  altOverride?: string;
  heading?: string;
  body: ParagraphNode[];
  caption?: string;
  side: PortraitSide;
};

/** A deliberate section break in a long visual story. Its heading is an H2 of the story. */
export type ChapterPlacement = "wide" | "full";
export const CHAPTER_PLACEMENTS: readonly ChapterPlacement[] = ["wide", "full"];
export type ChapterAlign = "bottom-left" | "center";
export const CHAPTER_ALIGNS: readonly ChapterAlign[] = ["bottom-left", "center"];
export type VisualChapterBlock = {
  type: "visualChapter";
  id: string;
  media: MediaId | null;
  altOverride?: string;
  eyebrow?: string;
  heading: string;
  dek?: string;
  placement: ChapterPlacement;
  align: ChapterAlign;
};

/**
 * One YouTube video. `videoId` is the only fact the player needs. The
 * editorial `captionsConfirmed` flag exists only on a draft block (it gates
 * publishing); `finalizeBlock` removes it, so it never reaches a public body.
 */
export type VideoBlock = {
  type: "video";
  id: string;
  videoId: string | null;
  title: string;
  caption?: string;
  captionsConfirmed?: boolean;
};

/** A recording with the transcript that makes it publishable. */
export type AudioBlock = { type: "audio"; id: string; media: MediaId | null; title: string; caption?: string; transcript: string };

/** The editor's own voice. Only editors and administrators write it. */
export type EditorsNoteBlock = { type: "editorsNote"; id: string; body: ParagraphNode[] };
/** Supplementary information beside the narrative, never interrupting it. */
export type MarginNoteBlock = { type: "marginNote"; id: string; heading?: string; body: ParagraphNode[] };
/** Detail a reader can open (methodology, a full statement). Native disclosure, closed by default. */
export type ExpandableBlock = { type: "expandable"; id: string; heading: string; body: ParagraphNode[] };

export type ChartMapMode = "interactive" | "static";
export type ChartMapHeight = "compact" | "standard" | "tall" | "map";
export type ChartMapProvider = "datawrapper" | "flourish" | "google-maps" | "openstreetmap";
export type ChartMapBlock = {
  type: "chartMap";
  id: string;
  mode: ChartMapMode;
  /** The provider's normalized embed address (interactive mode); also the reader's direct link. */
  url?: string;
  provider?: ChartMapProvider;
  /** The static graphic, or the fallback shown until/without the interactive frame. */
  image: MediaId | null;
  altOverride?: string;
  title: string;
  dek?: string;
  /** What the graphic shows, in words. Always visible. */
  summary: string;
  source?: string;
  notes?: string;
  credit?: string;
  height: ChartMapHeight;
};

export type DataTableColumn = { id: string; label: string };
export type DataTableRow = { id: string; cells: string[] };
export type DataTablePresentation = "standard" | "comparison";
export type DataTableBlock = {
  type: "dataTable";
  id: string;
  title: string;
  description?: string;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  presentation: DataTablePresentation;
  /** The first column names each row (`<th scope="row">`). */
  rowHeaders: boolean;
  source?: string;
  notes?: string;
};

export type ComparisonSide = { label: string; title: string; body: ParagraphNode[] };
export type ComparisonBlock = { type: "comparison"; id: string; heading?: string; left: ComparisonSide; right: ComparisonSide };

export type KeyNumber = { id: string; value: string; label: string; context?: string };
export type KeyNumbersBlock = { type: "keyNumbers"; id: string; heading?: string; source?: string; items: KeyNumber[] };

export type AnnotationMarker = { id: string; x: number; y: number; title: string; body: string };
export type AnnotatedImageBlock = {
  type: "annotatedImage";
  id: string;
  media: MediaId | null;
  altOverride?: string;
  caption: string;
  placement: ChapterPlacement;
  markers: AnnotationMarker[];
};

export type BeforeAfterFit = "cover" | "contain";
export type BeforeAfterBlock = {
  type: "beforeAfter";
  id: string;
  before: MediaId | null;
  after: MediaId | null;
  beforeLabel: string;
  afterLabel: string;
  fit: BeforeAfterFit;
  caption: string;
  placement: ChapterPlacement;
};

/** Stories an editor chose to link mid-story. Facts come from `references.stories`; nothing is copied. */
export type RelatedCoverageBlock = { type: "relatedCoverage"; id: string; heading: string; stories: Array<{ id: string; story: MediaId | null }> };
/** A Poll record. The question and answers come from `references.polls`. */
export type PollBlock = { type: "poll"; id: string; poll: MediaId | null };
/** A registered, repository-owned interactive. Only its key and editorial text are stored. */
export type RepositoryInteractiveBlock = { type: "repositoryInteractive"; id: string; key: string; title: string; description: string };

export type ArticleBlock =
  | PhotoBlock
  | GalleryBlock
  | ReportedQuoteBlock
  | PullQuoteBlock
  | KeyFactsBlock
  | ContextBlock
  | DocumentBlock
  | TimelineBlock
  | PortraitTextBlock
  | VisualChapterBlock
  | VideoBlock
  | AudioBlock
  | EditorsNoteBlock
  | MarginNoteBlock
  | ExpandableBlock
  | ChartMapBlock
  | DataTableBlock
  | ComparisonBlock
  | KeyNumbersBlock
  | AnnotatedImageBlock
  | BeforeAfterBlock
  | RelatedCoverageBlock
  | PollBlock
  | RepositoryInteractiveBlock;

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

/** A published Story as another story links to it: public facts only, resolved when the body is normalized. */
export type PublicStoryReference = {
  id: MediaId;
  headline: string;
  href: string;
  section?: string;
  /** ISO 8601 instant of first publication. */
  publishedAt: string;
  /** A key into the body's `media` table. */
  thumbnail?: MediaId;
};

/** A Poll's public definition. Counts exist only for a closed poll whose results are releasable. */
export type PublicPollReference = {
  /** The public poll key (`pollKey`), the one cookies and votes use. */
  id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  votingOpen: boolean;
  results?: { totalVotes: number; votes: Record<string, number> };
};

/** Public-safe facts about other records the nodes name, keyed by `String(id)`. Never private data. */
export type ArticleReferences = {
  stories?: Record<string, PublicStoryReference>;
  polls?: Record<string, PublicPollReference>;
};

export type ArticleBody = {
  format: typeof ARTICLE_BODY_FORMAT;
  version: typeof ARTICLE_BODY_VERSION;
  nodes: ArticleBodyNode[];
  /** Every asset the nodes reference, keyed by `String(id)`. */
  media: Record<string, ArticleMediaAsset>;
  /** Related Stories and Polls the nodes name, when there are any. */
  references?: ArticleReferences;
};

/** The two ways a public story body exists: imported HTML, kept forever, or the semantic body. */
export type PublicArticleBody = { format: "legacy-html"; html: string } | ArticleBody;

export function isArticleBlock(node: ArticleBodyNode): node is ArticleBlock {
  return node.type !== "paragraph" && node.type !== "heading" && node.type !== "list";
}
