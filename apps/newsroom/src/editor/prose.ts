import {
  BoldFeature,
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
  lexicalEditor
} from "@payloadcms/richtext-lexical";

/**
 * The journalism prose surface: paragraphs, H2/H3, bold, italic, links and
 * lists. Writers state editorial meaning; Byline owns presentation, so there is
 * deliberately no alignment, color, font size, indent, table, HTML or embed
 * feature here. Byline story blocks join through `BlocksFeature` in Phase 3
 * (`@byline/editor`), not through extra formatting.
 */
export function proseFeatures() {
  return [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ["h2", "h3"] }),
    BoldFeature(),
    ItalicFeature(),
    LinkFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    InlineToolbarFeature()
  ];
}

export const proseEditor = lexicalEditor({ features: () => proseFeatures() });
