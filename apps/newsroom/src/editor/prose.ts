import { proseFeatures } from "@byline/editor/server";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

/**
 * The prose surface for every newsroom rich-text field that is not a story
 * body (pages, live updates): paragraphs, H2/H3, bold, italic, web links and
 * lists, defined once in @byline/editor. The story body adds the Byline story
 * blocks (`articleBodyEditor`). Writers state editorial meaning; Byline owns
 * presentation, so there is no alignment, colour, font, indent, table, HTML
 * or embed feature anywhere.
 */
export const proseEditor = lexicalEditor({ features: () => proseFeatures() });
