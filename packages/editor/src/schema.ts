import { ARTICLE_BLOCK_LIMITS as LIMITS, ARTICLE_BLOCKS, DEFAULT_HEADINGS, isStubEvent, visualizationHeights, visualizationUrl, type ArticleBlockType } from "@byline/article-body";
import { parseYouTubeVideoId } from "@byline/core";
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
const audioOnly = { mimeType: { contains: "audio/" } } as const;
const publishedStories = { _status: { equals: "published" } } as const;
const publicPolls = { status: { in: ["open", "closed"] } } as const;

const PLACEMENT_OPTIONS = [{ value: "column", label: "Column" }, { value: "wide", label: "Wide" }, { value: "full", label: "Full" }];
const MEDIA_PLACEMENT_OPTIONS = [{ value: "wide", label: "Wide" }, { value: "full", label: "Full" }];

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
  timeline: "Timeline",
  portraitText: "PortraitText",
  visualChapter: "VisualChapter",
  video: "Video",
  audio: "Audio",
  editorsNote: "EditorsNote",
  marginNote: "MarginNote",
  expandable: "Expandable",
  chartMap: "ChartMap",
  dataTable: "DataTable",
  comparison: "Comparison",
  keyNumbers: "KeyNumbers",
  annotatedImage: "AnnotatedImage",
  beforeAfter: "BeforeAfter",
  relatedCoverage: "RelatedCoverage",
  poll: "Poll",
  repositoryInteractive: "RepositoryInteractive"
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
  ]),
  portraitText: storyBlock("portraitText", [
    { name: "media", type: "upload", relationTo: "media", required: true, filterOptions: imageOnly },
    { name: "altOverride", type: "text", maxLength: LIMITS.altText },
    { name: "heading", type: "text", maxLength: LIMITS.portraitHeading },
    { name: "body", type: "textarea", required: true, maxLength: LIMITS.portraitBody },
    { name: "caption", type: "textarea", maxLength: LIMITS.caption },
    { name: "side", type: "select", required: true, defaultValue: "left", options: [{ value: "left", label: "Photo on the left" }, { value: "right", label: "Photo on the right" }] }
  ]),
  visualChapter: storyBlock("visualChapter", [
    { name: "media", type: "upload", relationTo: "media", required: true, filterOptions: imageOnly },
    { name: "altOverride", type: "text", maxLength: LIMITS.altText },
    { name: "eyebrow", type: "text", maxLength: LIMITS.chapterEyebrow },
    { name: "heading", type: "text", required: true, maxLength: LIMITS.chapterHeading },
    { name: "dek", type: "textarea", maxLength: LIMITS.chapterDek },
    { name: "placement", type: "select", required: true, defaultValue: "full", options: MEDIA_PLACEMENT_OPTIONS },
    { name: "align", type: "select", required: true, defaultValue: "bottom-left", options: [{ value: "bottom-left", label: "Bottom left" }, { value: "center", label: "Centered" }] }
  ]),
  video: storyBlock("video", [
    {
      name: "url",
      type: "text",
      required: true,
      maxLength: 2048,
      validate: (value: unknown) => (parseYouTubeVideoId(value) ? true : "Paste a YouTube address (youtube.com or youtu.be).")
    },
    { name: "title", type: "text", required: true, maxLength: LIMITS.videoTitle },
    { name: "caption", type: "textarea", maxLength: LIMITS.caption },
    {
      name: "captionsConfirmed",
      type: "checkbox",
      defaultValue: false,
      validate: (value: unknown) => (value === true ? true : "Confirm the video has captions before publishing.")
    }
  ]),
  audio: storyBlock("audio", [
    { name: "media", type: "upload", relationTo: "media", required: true, filterOptions: audioOnly },
    { name: "title", type: "text", required: true, maxLength: LIMITS.audioTitle },
    { name: "caption", type: "textarea", maxLength: LIMITS.caption },
    { name: "transcript", type: "textarea", required: true, maxLength: LIMITS.audioTranscript }
  ]),
  editorsNote: storyBlock("editorsNote", [{ name: "body", type: "textarea", required: true, maxLength: LIMITS.noteBody }]),
  marginNote: storyBlock("marginNote", [
    { name: "heading", type: "text", maxLength: LIMITS.heading },
    { name: "body", type: "textarea", required: true, maxLength: LIMITS.noteBody }
  ]),
  expandable: storyBlock("expandable", [
    { name: "heading", type: "text", required: true, maxLength: LIMITS.expandableHeading },
    { name: "body", type: "textarea", required: true, maxLength: LIMITS.expandableBody }
  ]),
  chartMap: storyBlock("chartMap", [
    { name: "mode", type: "select", required: true, defaultValue: "interactive", options: [{ value: "interactive", label: "Interactive chart or map" }, { value: "static", label: "Static graphic" }] },
    {
      name: "url",
      type: "text",
      maxLength: 2048,
      validate: (value: unknown, { siblingData }: { siblingData?: { mode?: unknown } }) => (siblingData?.mode === "static" || (typeof value === "string" && visualizationUrl(value)) ? true : "Paste a Datawrapper, Flourish, Google Maps or OpenStreetMap address.")
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      filterOptions: imageOnly,
      validate: (value: unknown, { siblingData }: { siblingData?: { mode?: unknown } }) => (siblingData?.mode !== "static" || value ? true : "Choose the graphic.")
    },
    { name: "altOverride", type: "text", maxLength: LIMITS.altText },
    { name: "title", type: "text", required: true, maxLength: LIMITS.chartTitle },
    { name: "dek", type: "textarea", maxLength: LIMITS.chartDek },
    { name: "summary", type: "textarea", required: true, maxLength: LIMITS.chartSummary },
    { name: "source", type: "text", maxLength: LIMITS.chartSource },
    { name: "notes", type: "textarea", maxLength: LIMITS.chartNotes },
    { name: "credit", type: "text", maxLength: LIMITS.chartCredit },
    { name: "height", type: "select", required: true, defaultValue: "standard", options: Object.keys(visualizationHeights).map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) }
  ]),
  dataTable: storyBlock("dataTable", [
    { name: "title", type: "text", required: true, maxLength: LIMITS.tableTitle },
    { name: "description", type: "textarea", maxLength: LIMITS.tableDescription },
    { name: "columns", type: "array", minRows: LIMITS.tableColumnsMin, maxRows: LIMITS.tableColumnsMax, fields: [{ name: "label", type: "text", maxLength: LIMITS.tableCell }] },
    // One JSON array of strings per row: the cells are a grid, not independent records.
    { name: "rows", type: "array", maxRows: LIMITS.tableRowsMax, fields: [{ name: "cells", type: "json" }] },
    { name: "presentation", type: "select", required: true, defaultValue: "standard", options: [{ value: "standard", label: "Standard" }, { value: "comparison", label: "Comparison" }] },
    { name: "rowHeaders", type: "checkbox", defaultValue: true },
    { name: "source", type: "text", maxLength: LIMITS.tableSource },
    { name: "notes", type: "textarea", maxLength: LIMITS.tableNotes }
  ]),
  comparison: storyBlock("comparison", [
    { name: "heading", type: "text", maxLength: LIMITS.heading },
    { name: "leftLabel", type: "text", maxLength: LIMITS.comparisonLabel },
    { name: "leftTitle", type: "text", required: true, maxLength: LIMITS.comparisonTitle },
    { name: "leftBody", type: "textarea", required: true, maxLength: LIMITS.comparisonBody },
    { name: "rightLabel", type: "text", maxLength: LIMITS.comparisonLabel },
    { name: "rightTitle", type: "text", required: true, maxLength: LIMITS.comparisonTitle },
    { name: "rightBody", type: "textarea", required: true, maxLength: LIMITS.comparisonBody }
  ]),
  keyNumbers: storyBlock("keyNumbers", [
    { name: "heading", type: "text", maxLength: LIMITS.heading },
    { name: "source", type: "text", maxLength: LIMITS.keyNumbersSource },
    {
      name: "items",
      type: "array",
      minRows: LIMITS.keyNumbersMin,
      maxRows: LIMITS.keyNumbersMax,
      fields: [
        { name: "value", type: "text", maxLength: LIMITS.keyNumberValue },
        { name: "label", type: "text", maxLength: LIMITS.keyNumberLabel },
        { name: "context", type: "text", maxLength: LIMITS.keyNumberContext }
      ]
    }
  ]),
  annotatedImage: storyBlock("annotatedImage", [
    { name: "media", type: "upload", relationTo: "media", required: true, filterOptions: imageOnly },
    { name: "altOverride", type: "text", maxLength: LIMITS.altText },
    { name: "caption", type: "textarea", maxLength: LIMITS.caption },
    { name: "placement", type: "select", required: true, defaultValue: "full", options: MEDIA_PLACEMENT_OPTIONS },
    {
      name: "markers",
      type: "array",
      maxRows: LIMITS.annotationsMax,
      fields: [
        { name: "x", type: "number", min: 0, max: 100, defaultValue: 50 },
        { name: "y", type: "number", min: 0, max: 100, defaultValue: 50 },
        { name: "title", type: "text", maxLength: LIMITS.annotationTitle },
        { name: "body", type: "textarea", maxLength: LIMITS.annotationBody }
      ]
    }
  ]),
  beforeAfter: storyBlock("beforeAfter", [
    { name: "before", type: "upload", relationTo: "media", required: true, filterOptions: imageOnly },
    { name: "after", type: "upload", relationTo: "media", required: true, filterOptions: imageOnly },
    { name: "beforeLabel", type: "text", defaultValue: "Before", maxLength: LIMITS.comparisonPhotoLabel },
    { name: "afterLabel", type: "text", defaultValue: "After", maxLength: LIMITS.comparisonPhotoLabel },
    { name: "fit", type: "select", required: true, defaultValue: "cover", options: [{ value: "cover", label: "Fill the frame" }, { value: "contain", label: "Show both complete" }] },
    { name: "caption", type: "textarea", maxLength: LIMITS.caption },
    { name: "placement", type: "select", required: true, defaultValue: "wide", options: MEDIA_PLACEMENT_OPTIONS }
  ]),
  relatedCoverage: storyBlock("relatedCoverage", [
    { name: "heading", type: "text", defaultValue: DEFAULT_HEADINGS.relatedCoverage, maxLength: LIMITS.heading },
    { name: "stories", type: "array", minRows: LIMITS.relatedMin, maxRows: LIMITS.relatedMax, fields: [{ name: "story", type: "relationship", relationTo: "stories", filterOptions: publishedStories }] }
  ]),
  poll: storyBlock("poll", [{ name: "poll", type: "relationship", relationTo: "polls", required: true, filterOptions: publicPolls }]),
  repositoryInteractive: storyBlock("repositoryInteractive", [
    { name: "key", type: "text", required: true, maxLength: LIMITS.interactiveKey },
    { name: "title", type: "text", required: true, maxLength: LIMITS.interactiveTitle },
    { name: "description", type: "textarea", required: true, maxLength: LIMITS.interactiveDescription }
  ])
};

export const BYLINE_FOOTNOTE_COMPONENT = "@byline/editor/client#BylineFootnote";

/**
 * The one inline block: a footnote reference. It sits in a paragraph where the
 * writer put the caret; its number is derived from document order and its note
 * is edited in a Popover on the reference itself, never in a form.
 */
export const BYLINE_FOOTNOTE_BLOCK: Block = {
  slug: "footnote",
  labels: { singular: "Footnote", plural: "Footnotes" },
  interfaceName: "BylineFootnoteInline",
  admin: { components: { Block: BYLINE_FOOTNOTE_COMPONENT }, disableBlockName: true },
  fields: [{ name: "text", type: "textarea", maxLength: LIMITS.footnote }]
};
