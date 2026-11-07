import type { ArticleBlockType } from "./types";

/**
 * The one list of Byline body blocks, as CMS-independent metadata. Each
 * adapter keys its own part by the same `type`: the Payload block config and
 * normalizer in `@byline/editor`, the renderer in `@byline/ui`. Tests fail
 * when a registered type lacks any of them.
 */
export const ARTICLE_BLOCK_TYPES = [
  "photo",
  "gallery",
  "reportedQuote",
  "pullQuote",
  "keyFacts",
  "context",
  "document",
  "timeline"
] as const satisfies readonly ArticleBlockType[];

/** Editorial tasks, in the order the Add menu shows them. */
export type ArticleBlockFamily = "media" | "explain" | "tell";
export const ARTICLE_BLOCK_FAMILIES: ReadonlyArray<{ id: ArticleBlockFamily; label: string }> = [
  { id: "media", label: "Media" },
  { id: "explain", label: "Explain" },
  { id: "tell", label: "Tell the story" }
];

/** A semantic icon name; each UI maps it to its own icon set. */
export type ArticleBlockIcon = "photo" | "gallery" | "quote" | "pullQuote" | "facts" | "context" | "document" | "timeline";

export type ArticleBlockDefinition = {
  type: ArticleBlockType;
  /** Newsroom language, used everywhere a writer meets the block. */
  label: string;
  /** One finished sentence: what the block is for. */
  description: string;
  family: ArticleBlockFamily;
  /** Other words writers search with. */
  aliases: readonly string[];
  icon: ArticleBlockIcon;
};

export const ARTICLE_BLOCKS: { readonly [K in ArticleBlockType]: ArticleBlockDefinition & { type: K } } = {
  photo: {
    type: "photo",
    label: "Photo",
    description: "One photograph with this story's caption.",
    family: "media",
    aliases: ["image", "picture", "photograph", "wide photo", "full photo"],
    icon: "photo"
  },
  gallery: {
    type: "gallery",
    label: "Photo Gallery",
    description: "Two or more photographs shown together.",
    family: "media",
    aliases: ["gallery", "photos", "photo pair", "pair", "photo essay", "slideshow"],
    icon: "gallery"
  },
  reportedQuote: {
    type: "reportedQuote",
    label: "Reported Quote",
    description: "A source's words, with who said them.",
    family: "explain",
    aliases: ["quote", "quotation", "source", "said"],
    icon: "quote"
  },
  pullQuote: {
    type: "pullQuote",
    label: "Pull Quote",
    description: "A line from the story, set large between rules.",
    family: "explain",
    aliases: ["quote", "pullquote", "callout"],
    icon: "pullQuote"
  },
  keyFacts: {
    type: "keyFacts",
    label: "Key Facts",
    description: "Verified facts, one per row.",
    family: "explain",
    aliases: ["facts", "fact box", "by the numbers", "at a glance"],
    icon: "facts"
  },
  context: {
    type: "context",
    label: "Context",
    description: "Background in a few sentences, under a heading you choose.",
    family: "explain",
    aliases: ["why it matters", "what's next", "whats next", "how we know", "background", "explainer"],
    icon: "context"
  },
  document: {
    type: "document",
    label: "Document (PDF)",
    description: "A source document readers can open, with the pages that matter.",
    family: "explain",
    aliases: ["document", "doc", "pdf", "file", "records", "evidence"],
    icon: "document"
  },
  timeline: {
    type: "timeline",
    label: "Timeline",
    description: "Events in order, each with a date label and what happened.",
    family: "tell",
    aliases: ["timeline", "chronology", "history", "events", "what happened"],
    icon: "timeline"
  }
};

export function articleBlockDefinition(type: string): ArticleBlockDefinition | null {
  return (ARTICLE_BLOCKS as Record<string, ArticleBlockDefinition>)[type] ?? null;
}

export function isArticleBlockType(type: unknown): type is ArticleBlockType {
  return typeof type === "string" && (ARTICLE_BLOCK_TYPES as readonly string[]).includes(type);
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
  timelineBody: 1500
} as const;

/** The heading a new Context or Key Facts block starts with. */
export const DEFAULT_HEADINGS = { context: "Context", keyFacts: "Key facts" } as const;

/** Headings writers reach for most, offered as quick choices on a Context block. */
export const CONTEXT_HEADING_SUGGESTIONS = ["Context", "Why it matters", "What's next", "How we know"] as const;
