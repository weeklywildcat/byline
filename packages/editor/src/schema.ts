import { ARTICLE_BLOCK_LIMITS as LIMITS, ARTICLE_BLOCKS, DEFAULT_HEADINGS, isStubEvent, type ArticleBlockType } from "@byline/article-body";
import type { Block, Field, Validate } from "payload";
import { blockIconDataUri } from "./icons";

/**
 * Payload block configs for the Byline story blocks, one per registered
 * type. Labels, slugs and icons come from the contract's registry, so the
 * slash menu, the Add menu and the article all name a block the same way.
 *
 * Every block renders through one Byline component (`BylineStoryBlock`), which
 * draws the shared article primitives and edits the Lexical node directly.
 * Payload's generic block form is never shown.
 *
 * Validation here is structural and runs when a story is published (drafts and
 * autosave skip it): a Photo needs its photograph, a Document a PDF, and so on.
 * Unfinished parts that are harmless (an empty fact row, a timeline event with
 * only a date) are dropped by the normalizer instead of blocking publication.
 */

export const BYLINE_BLOCK_COMPONENT = "@byline/editor/client#BylineStoryBlock";

const imageOnly = { mimeType: { contains: "image/" } } as const;
const pdfOnly = { mimeType: { equals: "application/pdf" } } as const;

const hasText = (value: unknown) => typeof value === "string" && value.trim() !== "";

const someFact: Validate = (value) => (Array.isArray(value) && value.some((row) => hasText((row as { text?: unknown })?.text)) ? true : "Add at least one fact.");
const enoughEvents: Validate = (value) => {
  const events = Array.isArray(value) ? value.filter((row) => !isStubEvent({ title: String((row as { title?: unknown })?.title ?? ""), body: String((row as { body?: unknown })?.body ?? "") })) : [];
  return events.length >= LIMITS.timelineMin ? true : `A timeline needs at least ${LIMITS.timelineMin} events with a headline or explanation.`;
};

const PASCAL: Record<ArticleBlockType, string> = {
  photo: "Photo",
  gallery: "Gallery",
  reportedQuote: "ReportedQuote",
  pullQuote: "PullQuote",
  keyFacts: "KeyFacts",
  context: "Context",
  document: "Document",
  timeline: "Timeline"
};

function storyBlock(type: ArticleBlockType, fields: Field[]): Block {
  const definition = ARTICLE_BLOCKS[type];
  return {
    slug: type,
    labels: { singular: definition.label, plural: definition.label },
    interfaceName: `Byline${PASCAL[type]}Block`,
    admin: {
      components: { Block: BYLINE_BLOCK_COMPONENT },
      disableBlockName: true,
      images: { icon: { url: blockIconDataUri(definition.icon), alt: "" } }
    },
    fields
  };
}

export const BYLINE_BODY_BLOCKS: { readonly [K in ArticleBlockType]: Block } = {
  photo: storyBlock("photo", [
    { name: "media", type: "upload", relationTo: "media", required: true, filterOptions: imageOnly },
    { name: "caption", type: "textarea", maxLength: LIMITS.caption },
    { name: "altOverride", type: "text", maxLength: LIMITS.altText },
    { name: "placement", type: "select", required: true, defaultValue: "column", options: [{ value: "column", label: "Column" }, { value: "wide", label: "Wide" }, { value: "full", label: "Full" }] }
  ]),
  gallery: storyBlock("gallery", [
    {
      name: "items",
      type: "array",
      minRows: LIMITS.galleryMin,
      maxRows: LIMITS.galleryMax,
      fields: [
        { name: "media", type: "upload", relationTo: "media", required: true, filterOptions: imageOnly },
        { name: "caption", type: "textarea", maxLength: LIMITS.caption },
        { name: "altOverride", type: "text", maxLength: LIMITS.altText }
      ]
    },
    { name: "fit", type: "select", required: true, defaultValue: "natural", options: [{ value: "natural", label: "Whole photographs" }, { value: "crop", label: "Even grid" }] }
  ]),
  reportedQuote: storyBlock("reportedQuote", [
    { name: "text", type: "textarea", required: true, maxLength: LIMITS.quote },
    { name: "attribution", type: "text", required: true, maxLength: LIMITS.attribution }
  ]),
  pullQuote: storyBlock("pullQuote", [
    { name: "text", type: "textarea", required: true, maxLength: LIMITS.quote },
    { name: "attribution", type: "text", maxLength: LIMITS.attribution }
  ]),
  keyFacts: storyBlock("keyFacts", [
    { name: "heading", type: "text", defaultValue: DEFAULT_HEADINGS.keyFacts, maxLength: LIMITS.heading },
    { name: "facts", type: "array", maxRows: LIMITS.factsMax, validate: someFact, fields: [{ name: "text", type: "textarea", maxLength: LIMITS.fact }] }
  ]),
  context: storyBlock("context", [
    { name: "heading", type: "text", defaultValue: DEFAULT_HEADINGS.context, maxLength: LIMITS.heading },
    { name: "body", type: "textarea", required: true, maxLength: LIMITS.contextBody }
  ]),
  document: storyBlock("document", [
    { name: "media", type: "upload", relationTo: "media", required: true, filterOptions: pdfOnly },
    { name: "title", type: "text", maxLength: LIMITS.documentTitle },
    { name: "context", type: "textarea", maxLength: LIMITS.documentContext },
    { name: "source", type: "text", maxLength: LIMITS.documentSource },
    {
      name: "pages",
      type: "array",
      maxRows: LIMITS.documentPagesMax,
      fields: [
        { name: "page", type: "number", required: true, min: 1 },
        { name: "label", type: "text", maxLength: LIMITS.documentPageLabel }
      ]
    }
  ]),
  timeline: storyBlock("timeline", [
    {
      name: "items",
      type: "array",
      maxRows: LIMITS.timelineMax,
      validate: enoughEvents,
      fields: [
        { name: "label", type: "text", maxLength: LIMITS.timelineLabel },
        { name: "title", type: "text", maxLength: LIMITS.timelineTitle },
        { name: "body", type: "textarea", maxLength: LIMITS.timelineBody },
        { name: "current", type: "checkbox", defaultValue: false }
      ]
    }
  ])
};
