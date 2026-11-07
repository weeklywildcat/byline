import { ARTICLE_BLOCK_TYPES } from "@byline/article-body";
import {
  BlocksFeature,
  BoldFeature,
  createServerFeature,
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  lexicalEditor,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature
} from "@payloadcms/richtext-lexical";
import { BYLINE_BODY_BLOCKS } from "./schema";

export { BYLINE_BODY_BLOCKS, BYLINE_BLOCK_COMPONENT } from "./schema";

/**
 * The journalism prose surface: paragraphs, H2/H3, bold, italic, links and
 * lists, with Payload's inline toolbar for a selection. Writers state
 * meaning; Byline owns presentation, so there is deliberately no alignment,
 * colour, font, size, indent, table, code, HTML or embed feature. Links are
 * web addresses only (no internal document links until the public site can
 * resolve them).
 *
 * Subscript, superscript and inline code stay off: the legacy corpus has no
 * reporting that needs them (docs/article-editor.md).
 */
export function proseFeatures() {
  return [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ["h2", "h3"] }),
    BoldFeature(),
    ItalicFeature(),
    LinkFeature({ enabledCollections: [] }),
    UnorderedListFeature(),
    OrderedListFeature(),
    InlineToolbarFeature()
  ];
}

/**
 * Byline's canvas: the article's own body element and CSS for the editing
 * surface, the explicit Add menu, keyboard routing for the blocks' inline
 * fields and their announcements. Client side: `BylineCanvasFeatureClient`.
 */
export const BylineCanvasFeature = createServerFeature({
  key: "bylineCanvas",
  feature: { ClientFeature: "@byline/editor/client#BylineCanvasFeatureClient" }
});

/** The story body: prose plus the Byline story blocks, in the Add menu's order. */
export function articleBodyFeatures() {
  return [...proseFeatures(), BlocksFeature({ blocks: ARTICLE_BLOCK_TYPES.map((type) => BYLINE_BODY_BLOCKS[type]) }), BylineCanvasFeature()];
}

/**
 * The `stories.body` editor. Payload's own "+" handle is replaced by Byline's
 * Add menu; Payload's drag handle stays for moving whole blocks.
 */
export const articleBodyEditor = lexicalEditor({
  features: () => articleBodyFeatures(),
  admin: {
    hideAddBlockButton: true,
    hideGutter: true,
    placeholder: "Write the story. Type / to add a photo, quote, facts or a timeline."
  }
});
