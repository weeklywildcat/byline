import type { ArticleBlockType } from "./types";

/**
 * The one list of Byline body blocks, as CMS-independent metadata. Each
 * adapter keys its own part by the same `type`: the Payload block config and
 * normalizer in `@byline/editor`, the renderer in `@byline/ui`. Tests fail
 * when a registered type lacks any of them.
 *
 * The order here is the Add menu's order inside each family.
 */
export const ARTICLE_BLOCK_TYPES = [
  // Media
  "photo",
  "gallery",
  "portraitText",
  "video",
  "audio",
  // Explain
  "reportedQuote",
  "pullQuote",
  "keyFacts",
  "context",
  "editorsNote",
  "marginNote",
  "expandable",
  "document",
  // Data & visual
  "chartMap",
  "dataTable",
  "comparison",
  "keyNumbers",
  "annotatedImage",
  "beforeAfter",
  // Structure & interact
  "visualChapter",
  "timeline",
  "relatedCoverage",
  "poll",
  "repositoryInteractive"
] as const satisfies readonly ArticleBlockType[];

/** Editorial tasks, in the order the Add menu shows them. */
export type ArticleBlockFamily = "media" | "explain" | "data" | "structure";
export const ARTICLE_BLOCK_FAMILIES: ReadonlyArray<{ id: ArticleBlockFamily; label: string }> = [
  { id: "media", label: "Media" },
  { id: "explain", label: "Explain" },
  { id: "data", label: "Data & visual" },
  { id: "structure", label: "Structure & interact" }
];

/** A semantic icon name; each UI maps it to its own icon set. */
export type ArticleBlockIcon =
  | "photo" | "gallery" | "portrait" | "video" | "audio"
  | "quote" | "pullQuote" | "facts" | "context" | "editorsNote" | "marginNote" | "expandable" | "document"
  | "chart" | "table" | "comparison" | "numbers" | "annotated" | "beforeAfter"
  | "chapter" | "timeline" | "related" | "poll" | "interactive";

export type ArticleBlockDefinition = {
  type: ArticleBlockType;
  /** Newsroom language, used everywhere a writer meets the block. */
  label: string;
  /** One finished sentence: what the block is for. */
  description: string;
  family: ArticleBlockFamily;
  /** Other words writers search with (reporter language, never internal names). */
  aliases: readonly string[];
  icon: ArticleBlockIcon;
  /** Only editors and administrators may insert, change or remove it. */
  privileged?: true;
};

const define = <T extends ArticleBlockType>(definition: ArticleBlockDefinition & { type: T }) => definition;

export const ARTICLE_BLOCKS: { readonly [K in ArticleBlockType]: ArticleBlockDefinition & { type: K } } = {
  photo: define({ type: "photo", label: "Photo", description: "One photograph with this story's caption.", family: "media", aliases: ["image", "picture", "photograph", "wide photo", "full photo"], icon: "photo" }),
  gallery: define({ type: "gallery", label: "Photo Gallery", description: "Two or more photographs shown together.", family: "media", aliases: ["gallery", "photos", "photo pair", "pair", "photo essay", "slideshow"], icon: "gallery" }),
  portraitText: define({ type: "portraitText", label: "Portrait + Text", description: "A portrait beside the short passage that goes with it.", family: "media", aliases: ["profile", "portrait", "headshot", "bio", "person", "who is"], icon: "portrait" }),
  video: define({ type: "video", label: "Video", description: "A YouTube video, played right in the story.", family: "media", aliases: ["youtube", "clip", "film", "footage", "watch"], icon: "video" }),
  audio: define({ type: "audio", label: "Audio", description: "A recording with its transcript.", family: "media", aliases: ["interview", "recording", "podcast", "sound", "listen", "transcript"], icon: "audio" }),
  reportedQuote: define({ type: "reportedQuote", label: "Reported Quote", description: "A source's words, with who said them.", family: "explain", aliases: ["quote", "quotation", "source", "said"], icon: "quote" }),
  pullQuote: define({ type: "pullQuote", label: "Pull Quote", description: "A line from the story, set large between rules.", family: "explain", aliases: ["quote", "pullquote", "callout"], icon: "pullQuote" }),
  keyFacts: define({ type: "keyFacts", label: "Key Facts", description: "Verified facts, one per row.", family: "explain", aliases: ["facts", "fact box", "by the numbers", "at a glance"], icon: "facts" }),
  context: define({ type: "context", label: "Context", description: "Background in a few sentences, under a heading you choose.", family: "explain", aliases: ["why it matters", "what's next", "whats next", "how we know", "background", "explainer"], icon: "context" }),
  editorsNote: define({ type: "editorsNote", label: "Editor's Note", description: "A note in the editors' own voice.", family: "explain", aliases: ["note", "editor", "disclosure", "clarification", "update"], icon: "editorsNote", privileged: true }),
  marginNote: define({ type: "marginNote", label: "Margin Note", description: "Extra information that should not interrupt the story.", family: "explain", aliases: ["aside", "sidebar", "side note", "also", "by the way"], icon: "marginNote" }),
  expandable: define({ type: "expandable", label: "Expandable", description: "Detail a reader can open: methodology, a full statement.", family: "explain", aliases: ["methodology", "read more", "full statement", "details", "how we analyzed", "more"], icon: "expandable" }),
  document: define({ type: "document", label: "Document (PDF)", description: "A source document readers can open, with the pages that matter.", family: "explain", aliases: ["document", "doc", "pdf", "file", "records", "evidence"], icon: "document" }),
  chartMap: define({ type: "chartMap", label: "Chart / Map", description: "A chart or map, with what it shows in words.", family: "data", aliases: ["chart", "graph", "map", "datawrapper", "flourish", "google maps", "visualization", "infographic"], icon: "chart" }),
  dataTable: define({ type: "dataTable", label: "Data Table", description: "Rows and columns of figures, with headers.", family: "data", aliases: ["table", "spreadsheet", "data", "grid", "rows", "csv"], icon: "table" }),
  comparison: define({ type: "comparison", label: "Comparison", description: "Two sides explained next to each other.", family: "data", aliases: ["compare", "versus", "vs", "then and now", "current proposed", "two sides"], icon: "comparison" }),
  keyNumbers: define({ type: "keyNumbers", label: "Key Numbers", description: "The few figures a reader should remember.", family: "data", aliases: ["numbers", "stats", "statistics", "figures", "by the numbers", "big numbers"], icon: "numbers" }),
  annotatedImage: define({ type: "annotatedImage", label: "Annotated Image", description: "A photograph with numbered notes on the parts that matter.", family: "data", aliases: ["annotate", "labels", "callouts", "markers", "diagram", "explain photo"], icon: "annotated" }),
  beforeAfter: define({ type: "beforeAfter", label: "Before / After", description: "Two photographs with a slider to compare them.", family: "data", aliases: ["compare", "slider", "then and now", "change", "before and after", "comparison"], icon: "beforeAfter" }),
  visualChapter: define({ type: "visualChapter", label: "Visual Chapter", description: "A full-width photograph that opens a new part of the story.", family: "structure", aliases: ["chapter", "section", "divider", "break", "title card", "part"], icon: "chapter" }),
  timeline: define({ type: "timeline", label: "Timeline", description: "Events in order, each with a date label and what happened.", family: "structure", aliases: ["timeline", "chronology", "history", "events", "what happened"], icon: "timeline" }),
  relatedCoverage: define({ type: "relatedCoverage", label: "Related Coverage", description: "Up to three of our own stories worth reading next.", family: "structure", aliases: ["related", "read more", "see also", "more stories", "previous coverage", "links"], icon: "related" }),
  poll: define({ type: "poll", label: "Poll", description: "A reader poll from the Polls list.", family: "structure", aliases: ["survey", "vote", "question", "opinion", "reader poll"], icon: "poll" }),
  repositoryInteractive: define({ type: "repositoryInteractive", label: "Repository Interactive", description: "A custom interactive built by the developers.", family: "structure", aliases: ["interactive", "custom", "app", "widget", "game", "calculator"], icon: "interactive", privileged: true })
};

export function articleBlockDefinition(type: string): ArticleBlockDefinition | null {
  return (ARTICLE_BLOCKS as Record<string, ArticleBlockDefinition>)[type] ?? null;
}

export function isArticleBlockType(type: unknown): type is ArticleBlockType {
  return typeof type === "string" && (ARTICLE_BLOCK_TYPES as readonly string[]).includes(type);
}

/** The blocks only editors and administrators may insert, change or remove. */
export const PRIVILEGED_BLOCK_TYPES: readonly ArticleBlockType[] = ARTICLE_BLOCK_TYPES.filter((type) => "privileged" in ARTICLE_BLOCKS[type]);

export function isPrivilegedBlockType(type: unknown): boolean {
  return (PRIVILEGED_BLOCK_TYPES as readonly unknown[]).includes(type);
}

/** Bounds every adapter enforces (schemas, editors and normalizers read these, never literals). */
export const ARTICLE_BLOCK_LIMITS = {
  caption: 1000,
  altText: 600,
  quote: 1200,
  attribution: 200,
  heading: 80,
  galleryMin: 2,
  galleryMax: 24,
  fact: 400,
  factsMax: 12,
  contextBody: 2400,
  documentTitle: 200,
  documentContext: 1000,
  documentSource: 200,
  documentPagesMax: 12,
  documentPageLabel: 160,
  timelineMin: 2,
  timelineMax: 25,
  timelineLabel: 60,
  timelineTitle: 200,
  timelineBody: 1500,
  portraitHeading: 160,
  portraitBody: 2400,
  chapterEyebrow: 80,
  chapterHeading: 180,
  chapterDek: 500,
  videoTitle: 200,
  audioTitle: 200,
  audioTranscript: 40000,
  noteBody: 2400,
  expandableHeading: 160,
  expandableBody: 6000,
  chartTitle: 200,
  chartDek: 400,
  chartSummary: 1200,
  chartSource: 200,
  chartNotes: 600,
  chartCredit: 200,
  tableColumnsMin: 2,
  tableColumnsMax: 8,
  tableRowsMax: 40,
  tableCell: 500,
  tableTitle: 200,
  tableDescription: 600,
  tableSource: 200,
  tableNotes: 600,
  comparisonLabel: 40,
  comparisonTitle: 160,
  comparisonBody: 1200,
  keyNumbersMin: 2,
  keyNumbersMax: 4,
  keyNumberValue: 40,
  keyNumberLabel: 120,
  keyNumberContext: 200,
  keyNumbersSource: 200,
  annotationsMax: 12,
  annotationTitle: 120,
  annotationBody: 800,
  comparisonPhotoLabel: 40,
  relatedMin: 1,
  relatedMax: 3,
  interactiveKey: 64,
  interactiveTitle: 200,
  interactiveDescription: 1000,
  footnote: 1000
} as const;

/** The heading a new Context or Key Facts block starts with. */
export const DEFAULT_HEADINGS = { context: "Context", keyFacts: "Key facts", relatedCoverage: "Related coverage" } as const;

/** Headings writers reach for most, offered as quick choices on a Context block. */
export const CONTEXT_HEADING_SUGGESTIONS = ["Context", "Why it matters", "What's next", "How we know"] as const;

/** Headings offered as quick choices on an Expandable block. */
export const EXPANDABLE_HEADING_SUGGESTIONS = ["Methodology", "Read the full statement", "More details", "How we analyzed this"] as const;

/** The label Editor's Notes always print under. */
export const EDITORS_NOTE_LABEL = "Editor's note" as const;
