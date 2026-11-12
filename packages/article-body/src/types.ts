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
/**
 * A Source reference at the claim it supports: a public web page, or a PDF
 * from Media (optionally one page). Like a footnote, its visible number is
 * derived from document order and never stored; Sources and Footnotes number
 * independently. Never connected to the private newsroom `sources` records.
 */
export type SourceRef =
  | { type: "source"; id: string; kind: "web"; url: string; label: string; note?: string }
  | { type: "source"; id: string; kind: "document"; media: MediaId; page?: number; label: string; note?: string };
export type Inline = TextRun | LinkRun | LineBreak | FootnoteRef | SourceRef;

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

/**
 * How a photograph meets the screen edge on a phone. `auto` lets the
 * placement decide (column photos stay inset, wide and full ones reach the
 * edges); `bleed` is "Edge to edge". Captions always stay inset. Absent is
 * `auto`. See presentation.ts.
 */
export type PhonePresentation = "auto" | "inset" | "bleed";

/** Text set over a photograph: one of two publication-safe tones, on one of three scrims. Never a colour. */
export type OverlayTone = "light" | "dark";
export type ScrimStrength = "subtle" | "standard" | "strong";

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
  /** On a phone: absent or `auto` follows the placement. */
  phone?: PhonePresentation;
};

export type GalleryItem = { id: string; media: MediaId | null; caption: string; altOverride?: string };
/** Whole photographs (`natural`) or a tidy grid of equal crops (`crop`). The responsive column count belongs to the renderer. */
export type GalleryFit = "natural" | "crop";
/**
 * How the photographs are arranged: a responsive grid, a Photo Essay (one
 * large whole photograph after another, each with its caption) or Featured
 * (the first photograph dominant, the rest a grid below it). The order of
 * `items` is the only state Featured needs: the first item is featured.
 * Absent means `grid` (galleries saved before layouts existed).
 */
export type GalleryLayoutKind = "grid" | "essay" | "featured";
export const GALLERY_LAYOUTS: readonly GalleryLayoutKind[] = ["grid", "essay", "featured"];
export type GalleryBlock = { type: "gallery"; id: string; items: GalleryItem[]; fit: GalleryFit; layout?: GalleryLayoutKind };

/** A source's words, reported in the story, with an optional public link to where they were said or published. */
export type ReportedQuoteBlock = { type: "reportedQuote"; id: string; text: string; attribution: string; sourceUrl?: string; sourceLabel?: string };
/**
 * A line lifted from the story and set large. Standard sits in the reading
 * column; Breakout is larger and reaches past it on wide screens; Full is a
 * major pause as wide as the article. Absent means standard.
 */
export type PullQuotePresentation = "standard" | "breakout" | "full";
export type PullQuoteBlock = { type: "pullQuote"; id: string; text: string; attribution?: string; presentation?: PullQuotePresentation };

export type KeyFact = { id: string; text: string };
/** Standard: one ruled row per fact. Compact: two columns when the article canvas is wide enough. Absent means standard. */
export type KeyFactsPresentation = "standard" | "compact";
export type KeyFactsBlock = { type: "keyFacts"; id: string; heading: string; facts: KeyFact[]; presentation?: KeyFactsPresentation };

/**
 * Background the reader needs. The heading is the writer's ("Context", "Why it
 * matters", "What's next", "How we know"): one block, not four. The body is
 * bounded paragraphs: text with bold, italic and web links, nothing else
 * (see docs/article-editor.md, "Context body").
 */
export type ContextBlock = { type: "context"; id: string; heading: string; body: ParagraphNode[] };

/** A page worth reading: its number, a short label and, optionally, the reporter's note on what matters there. */
export type DocumentPageRef = { id: string; page: number; label: string; excerpt?: string };
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

/**
 * `label` is editorial text ("Fall 2026", "Oct. 17"), never a date object.
 * An event may carry supporting evidence: one photograph, one public web
 * link, one PDF (optionally a page). None is required.
 */
export type TimelineEventImage = { media: MediaId; altOverride?: string; caption?: string };
export type TimelineEventLink = { url: string; label?: string };
export type TimelineEventDocument = { media: MediaId; page?: number };
export type TimelineEvent = { id: string; label: string; title: string; body: string; current: boolean; image?: TimelineEventImage; link?: TimelineEventLink; document?: TimelineEventDocument };
export type TimelineBlock = { type: "timeline"; id: string; items: TimelineEvent[] };

/**
 * Feature Media (stored as `portraitText`, its first name): a photograph and
 * the short passage that belongs with it, in one of four presentations.
 *
 * - `split` (absent): photo beside the passage, the original Portrait + Text.
 * - `breakout`: a large photo carries the moment; the passage beside or below.
 * - `spotlight`: a big photo with a few words over it on wide screens, on a
 *   scrim (`tone`, `scrim`); photo then words on a phone.
 * - `sticky`: the photo stays in view while the passage beside it is read; an
 *   ordinary photo-then-passage sequence on a phone.
 *
 * `side` is the photo's side on wide screens. `phoneOrder` (Split only) and
 * `phone` decide the phone sequence. Source order is always the reading order.
 */
export type PortraitSide = "left" | "right";
export type FeatureMediaPresentation = "split" | "breakout" | "spotlight" | "sticky";
export type FeatureMediaPhoneOrder = "media" | "text";
export type PortraitTextBlock = {
  type: "portraitText";
  id: string;
  media: MediaId | null;
  altOverride?: string;
  heading?: string;
  body: ParagraphNode[];
  caption?: string;
  side: PortraitSide;
  presentation?: FeatureMediaPresentation;
  /** Split only: which comes first on a phone. Absent is the photo. */
  phoneOrder?: FeatureMediaPhoneOrder;
  /** On a phone: absent or `auto` follows the presentation. */
  phone?: PhonePresentation;
  /** Spotlight only: the words over the photo. */
  tone?: OverlayTone;
  scrim?: ScrimStrength;
};

/**
 * A Chapter (stored as `visualChapter`): a deliberate transition in a long
 * story. Its heading is an H2 of the story.
 *
 * - `media` (absent): the heading over a photograph, `height` tall.
 * - `text`: a typographic break; no photograph (`media` is null).
 * - `split`: photograph and heading side by side, photograph first when narrow.
 *
 * `height` (photo and split chapters) is absent for one saved before heights
 * existed, which keeps its original proportion. `tone` is the colour of the
 * words: absent means light over a photograph and dark on a text or split
 * chapter (a light-text text chapter sits on a dark band). `scrim` (photo
 * chapters) is how much the photo is darkened or lightened behind them.
 */
export type ChapterKind = "media" | "text" | "split";
export type ChapterHeight = "short" | "half" | "full";
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
  kind?: ChapterKind;
  height?: ChapterHeight;
  tone?: OverlayTone;
  scrim?: ScrimStrength;
};

/**
 * One YouTube video. `videoId` is the only fact the player needs. The
 * editorial `captionsConfirmed` flag exists only on a draft block (it gates
 * publishing); `finalizeBlock` removes it, so it never reaches a public body.
 */
/** A timestamped chapter of a recording or video. `time` is whole seconds from the start; the newsroom types "1:24". */
export type MediaChapter = { id: string; time: number; label: string };

export type VideoBlock = {
  type: "video";
  id: string;
  videoId: string | null;
  title: string;
  caption?: string;
  captionsConfirmed?: boolean;
  chapters?: MediaChapter[];
  transcript?: string;
};

/** A recording with the transcript that makes it publishable. */
export type AudioBlock = { type: "audio"; id: string; media: MediaId | null; title: string; caption?: string; transcript: string; chapters?: MediaChapter[] };

/** The editor's own voice. Only editors and administrators write it. */
export type EditorsNoteBlock = { type: "editorsNote"; id: string; body: ParagraphNode[] };
/** Supplementary information beside the narrative, never interrupting it. */
export type MarginNoteBlock = { type: "marginNote"; id: string; heading?: string; body: ParagraphNode[] };
/** Detail a reader can open (methodology, a full statement). Native disclosure, closed by default. */
export type ExpandableBlock = { type: "expandable"; id: string; heading: string; body: ParagraphNode[] };

/** `native`: a chart Byline draws from the reporter's own table. `interactive`: an allowlisted provider embed. `static`: an uploaded graphic. */
export type ChartMapMode = "native" | "interactive" | "static";
export type NativeChartType = "bar" | "line" | "dot";
export const NATIVE_CHART_TYPES: readonly NativeChartType[] = ["bar", "line", "dot"];
/** A native chart's data: the first column names each category, every other column is one series of numbers. */
export type NativeChartData = { columns: DataTableColumn[]; rows: DataTableRow[] };
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
  /** Native mode only: which chart, and the bounded table it draws. */
  chartType?: NativeChartType;
  data?: NativeChartData;
  /** Native mode only: an optional public link to the data's source. */
  sourceUrl?: string;
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
/** A registered, repository-owned tracker. Its content and design live in the repository; the article stores only the key and editorial text. */
export type RepositoryTrackerBlock = { type: "repositoryTracker"; id: string; key: string; title: string; description: string };
/**
 * A published Byline Data Project, by its stable ID. The project's rows,
 * bindings, releases, settings and presentation are never copied: the host
 * resolves them from the published Data Project when the story renders. Only
 * the article-facing heading and description belong to this story.
 */
export type DataProjectBlock = { type: "dataProject"; id: string; project: MediaId | null; title: string; description: string };
/** A published school or community Event. Facts come from `references.events`; nothing is copied. */
export type EventBlock = { type: "event"; id: string; event: MediaId | null };

/** The public post providers a Social Post accepts. */
export type SocialProvider = "instagram" | "threads" | "facebook" | "tiktok" | "x" | "bluesky";
/**
 * One public social post, by its canonical permalink. Provider and post id are
 * derived from the permalink by the one parser (`parseSocialPostUrl`), never
 * trusted from input; nothing a provider returns is ever stored.
 */
export type SocialPostBlock = { type: "socialPost"; id: string; url: string; provider?: SocialProvider; postId?: string; caption?: string };

/** How a game ended. The winner is derived from the scores, never stored. */
export type FinalScoreStatus = "final" | "overtime" | "tie" | "forfeit";
export const FINAL_SCORE_STATUSES: readonly FinalScoreStatus[] = ["final", "overtime", "tie", "forfeit"];
/** A result typed by the reporter. Article content, not a sports database: no team, game or season records. */
export type FinalScoreBlock = {
  type: "finalScore";
  id: string;
  sport?: string;
  teamA: string;
  teamAScore: number | null;
  teamB: string;
  teamBScore: number | null;
  status: FinalScoreStatus;
  /** Date only, `YYYY-MM-DD`: the day it was played, never an instant. */
  date?: string;
  location?: string;
  note?: string;
};

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
  | RepositoryInteractiveBlock
  | RepositoryTrackerBlock
  | DataProjectBlock
  | EventBlock
  | SocialPostBlock
  | FinalScoreBlock;

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

/** A published Event's public facts. Times are instants; the renderer reads them in the publication's timezone. */
export type PublicEventReference = {
  id: MediaId;
  title: string;
  eventType?: string;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  location?: string;
  description?: string;
  externalUrl?: string;
  eventStatus: "scheduled" | "canceled";
};

/**
 * A Data Project the host confirmed is published. Deliberately only the ID:
 * the story never carries the project's rows, bindings, releases or settings.
 */
export type PublicDataProjectReference = { id: MediaId };

/** Public-safe facts about other records the nodes name, keyed by `String(id)`. Never private data. */
export type ArticleReferences = {
  stories?: Record<string, PublicStoryReference>;
  polls?: Record<string, PublicPollReference>;
  events?: Record<string, PublicEventReference>;
};

export type ArticleBody = {
  format: typeof ARTICLE_BODY_FORMAT;
  version: typeof ARTICLE_BODY_VERSION;
  nodes: ArticleBodyNode[];
  /** Every asset the nodes reference, keyed by `String(id)`. */
  media: Record<string, ArticleMediaAsset>;
  /** Related Stories, Polls and Events the nodes name, when there are any. */
  references?: ArticleReferences;
};

/** The two ways a public story body exists: imported HTML, kept forever, or the semantic body. */
export type PublicArticleBody = { format: "legacy-html"; html: string } | ArticleBody;

export function isArticleBlock(node: ArticleBodyNode): node is ArticleBlock {
  return node.type !== "paragraph" && node.type !== "heading" && node.type !== "list";
}
