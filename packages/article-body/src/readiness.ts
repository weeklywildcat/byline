import { ARTICLE_BLOCK_LIMITS as LIMITS, ARTICLE_BLOCKS, DEFAULT_HEADINGS } from "./blocks";
import { squareRows } from "./data-table";
import { isDocumentAsset, isImageAsset, mediaKey } from "./media";
import type { ReferenceLookup } from "./references";
import { cleanLine, cleanText, hasInlineText } from "./text";
import { isStubEvent } from "./timeline";
import { visualizationHeights, visualizationUrl } from "./visualization";
import type {
  AnnotationMarker,
  ArticleBlock,
  ArticleBlockType,
  ArticleMediaAsset,
  ComparisonSide,
  DataTableRow,
  DocumentPageRef,
  GalleryItem,
  KeyNumber,
  MediaId,
  ParagraphNode,
  TimelineEvent
} from "./types";

/**
 * Readiness: what keeps part of a block out of the published story.
 *
 * Writing is forgiving: an unfinished block saves, autosaves and stays
 * editable, and the editor shows these messages calmly beside it. Publishing
 * is strict: `finalizeBlock` returns only what is complete, so an unfinished
 * block never becomes malformed public output.
 *
 * `omitted` means the whole block is left out; `dropped` means one part of it
 * is (an empty marker, a missing story). Neither is ever silent: every one
 * produces a `BlockIssue` the editor and the normalizer report.
 */
export type BlockIssue = {
  blockId: string;
  type: ArticleBlockType;
  /** `omitted`: the whole block is left out. `dropped`: one part of it is. */
  effect: "omitted" | "dropped";
  code: string;
  message: string;
  itemId?: string;
};

export type MediaLookup = (id: MediaId) => ArticleMediaAsset | null | undefined;

type Finalized = { block: ArticleBlock | null; issues: BlockIssue[] };

const optional = (value: string): string | undefined => (value ? value : undefined);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const clampPercent = (value: unknown): number => {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 50;
  return Math.round(Math.min(100, Math.max(0, number)) * 10) / 10;
};

const paragraphs = (body: readonly ParagraphNode[]): ParagraphNode[] => body.filter((paragraph) => hasInlineText(paragraph.children));

export function finalizeBlock(block: ArticleBlock, media: MediaLookup, refs: ReferenceLookup = {}): Finalized {
  const issues: BlockIssue[] = [];
  const issue = (effect: BlockIssue["effect"], code: string, message: string, itemId?: string) => issues.push({ blockId: block.id, type: block.type, effect, code, message, ...(itemId ? { itemId } : {}) });
  const omit = (code: string, message: string): Finalized => {
    issue("omitted", code, message);
    return { block: null, issues };
  };
  /** A required image: missing and unavailable are different problems for a writer. */
  const image = (id: MediaId | null | undefined, missing: [string, string], gone: [string, string]): Finalized | null => {
    if (id === null || id === undefined) return omit(...missing);
    if (!isImageAsset(media(id))) return omit(...gone);
    return null;
  };

  switch (block.type) {
    case "photo": {
      const problem = image(block.media, ["photo-missing", "Choose a photograph."], ["photo-unavailable", "This photograph is no longer in Media. Choose another."]);
      if (problem) return problem;
      return { block: { type: "photo", id: block.id, media: block.media, caption: cleanText(block.caption, LIMITS.caption), altOverride: optional(cleanLine(block.altOverride, LIMITS.altText)), placement: block.placement ?? "column" }, issues };
    }
    case "gallery": {
      const items: GalleryItem[] = [];
      for (const item of block.items) {
        if (item.media === null || item.media === undefined) {
          issue("dropped", "gallery-item-missing", "An empty photograph slot is left out.", item.id);
          continue;
        }
        if (!isImageAsset(media(item.media))) {
          issue("dropped", "gallery-item-unavailable", "A photograph that is no longer in Media is left out.", item.id);
          continue;
        }
        items.push({ id: item.id, media: item.media, caption: cleanText(item.caption, LIMITS.caption), altOverride: optional(cleanLine(item.altOverride, LIMITS.altText)) });
      }
      if (items.length < LIMITS.galleryMin) return omit("gallery-too-small", `A gallery needs at least ${LIMITS.galleryMin} photographs.`);
      return { block: { type: "gallery", id: block.id, items: items.slice(0, LIMITS.galleryMax), fit: block.fit === "crop" ? "crop" : "natural" }, issues };
    }
    case "portraitText": {
      const problem = image(block.media, ["portrait-missing", "Choose the portrait photograph."], ["portrait-unavailable", "This photograph is no longer in Media. Choose another."]);
      if (problem) return problem;
      const body = paragraphs(block.body);
      if (!body.length) return omit("portrait-empty", "Write the passage that goes with the portrait.");
      return {
        block: {
          type: "portraitText",
          id: block.id,
          media: block.media,
          altOverride: optional(cleanLine(block.altOverride, LIMITS.altText)),
          heading: optional(cleanLine(block.heading, LIMITS.portraitHeading)),
          body,
          caption: optional(cleanText(block.caption, LIMITS.caption)),
          side: block.side === "right" ? "right" : "left"
        },
        issues
      };
    }
    case "visualChapter": {
      const problem = image(block.media, ["chapter-missing", "Choose the photograph for this chapter."], ["chapter-unavailable", "This photograph is no longer in Media. Choose another."]);
      if (problem) return problem;
      const heading = cleanLine(block.heading, LIMITS.chapterHeading);
      if (!heading) return omit("chapter-heading", "Write the chapter's heading.");
      return {
        block: {
          type: "visualChapter",
          id: block.id,
          media: block.media,
          altOverride: optional(cleanLine(block.altOverride, LIMITS.altText)),
          eyebrow: optional(cleanLine(block.eyebrow, LIMITS.chapterEyebrow)),
          heading,
          dek: optional(cleanText(block.dek, LIMITS.chapterDek)),
          placement: block.placement === "wide" ? "wide" : "full",
          align: block.align === "center" ? "center" : "bottom-left"
        },
        issues
      };
    }
    case "video": {
      if (!block.videoId || !VIDEO_ID.test(block.videoId)) return omit("video-url", "Paste a YouTube address.");
      const title = cleanLine(block.title, LIMITS.videoTitle);
      if (!title) return omit("video-title", "Give the video a title.");
      // Required by accessibility policy: the editor confirms captions exist before this publishes.
      if (block.captionsConfirmed !== true) return omit("video-captions", "Confirm the video has captions before publishing.");
      return { block: { type: "video", id: block.id, videoId: block.videoId, title, caption: optional(cleanText(block.caption, LIMITS.caption)) }, issues };
    }
    case "audio": {
      if (block.media === null || block.media === undefined) return omit("audio-missing", "Choose an audio file.");
      if (media(block.media)?.kind !== "audio") return omit("audio-incompatible", "Choose an audio file from Media.");
      const title = cleanLine(block.title, LIMITS.audioTitle);
      if (!title) return omit("audio-title", "Give the recording a title.");
      const transcript = cleanText(block.transcript, LIMITS.audioTranscript);
      if (!transcript) return omit("audio-transcript", "A transcript is required to publish audio.");
      return { block: { type: "audio", id: block.id, media: block.media, title, caption: optional(cleanText(block.caption, LIMITS.caption)), transcript }, issues };
    }
    case "reportedQuote": {
      const text = cleanText(block.text, LIMITS.quote);
      const attribution = cleanLine(block.attribution, LIMITS.attribution);
      if (!text) return omit("quote-empty", "Type the quote.");
      if (!attribution) return omit("quote-unattributed", "Say who said it.");
      return { block: { type: "reportedQuote", id: block.id, text, attribution }, issues };
    }
    case "pullQuote": {
      const text = cleanText(block.text, LIMITS.quote);
      if (!text) return omit("quote-empty", "Type the line to pull out.");
      return { block: { type: "pullQuote", id: block.id, text, attribution: optional(cleanLine(block.attribution, LIMITS.attribution)) }, issues };
    }
    case "keyFacts": {
      const facts = block.facts.map((fact) => ({ id: fact.id, text: cleanText(fact.text, LIMITS.fact) })).filter((fact) => fact.text);
      if (!facts.length) return omit("facts-empty", "Add at least one fact.");
      return { block: { type: "keyFacts", id: block.id, heading: cleanLine(block.heading, LIMITS.heading) || DEFAULT_HEADINGS.keyFacts, facts: facts.slice(0, LIMITS.factsMax) }, issues };
    }
    case "context": {
      const body = paragraphs(block.body);
      if (!body.length) return omit("context-empty", "Write the context.");
      return { block: { type: "context", id: block.id, heading: cleanLine(block.heading, LIMITS.heading) || DEFAULT_HEADINGS.context, body }, issues };
    }
    case "editorsNote": {
      const body = paragraphs(block.body);
      if (!body.length) return omit("note-empty", "Write the editor's note.");
      return { block: { type: "editorsNote", id: block.id, body }, issues };
    }
    case "marginNote": {
      const body = paragraphs(block.body);
      if (!body.length) return omit("note-empty", "Write the note.");
      return { block: { type: "marginNote", id: block.id, heading: optional(cleanLine(block.heading, LIMITS.heading)), body }, issues };
    }
    case "expandable": {
      const heading = cleanLine(block.heading, LIMITS.expandableHeading);
      if (!heading) return omit("expandable-heading", "Say what is inside: the heading is what readers click.");
      const body = paragraphs(block.body);
      if (!body.length) return omit("expandable-empty", "Write what opens.");
      return { block: { type: "expandable", id: block.id, heading, body }, issues };
    }
    case "document": {
      if (block.media === null || block.media === undefined) return omit("document-missing", "Choose a PDF.");
      if (!isDocumentAsset(media(block.media))) return omit("document-incompatible", "Choose a PDF from Media.");
      const pages: DocumentPageRef[] = [];
      for (const ref of block.pages) {
        if (!Number.isInteger(ref.page) || ref.page < 1) {
          issue("dropped", "document-page-invalid", "A page reference without a page number is left out.", ref.id);
          continue;
        }
        pages.push({ id: ref.id, page: ref.page, label: cleanLine(ref.label, LIMITS.documentPageLabel) });
      }
      return {
        block: {
          type: "document",
          id: block.id,
          media: block.media,
          title: optional(cleanLine(block.title, LIMITS.documentTitle)),
          context: optional(cleanText(block.context, LIMITS.documentContext)),
          source: optional(cleanLine(block.source, LIMITS.documentSource)),
          pages: pages.slice(0, LIMITS.documentPagesMax)
        },
        issues
      };
    }
    case "chartMap": {
      const title = cleanLine(block.title, LIMITS.chartTitle);
      if (!title) return omit("chart-title", "Give the chart or map a title.");
      const summary = cleanText(block.summary, LIMITS.chartSummary);
      if (!summary) return omit("chart-summary", "Say in words what it shows. Readers who cannot see it need this.");
      const height = block.height in visualizationHeights ? block.height : "standard";
      const common = { id: block.id, title, dek: optional(cleanText(block.dek, LIMITS.chartDek)), summary, source: optional(cleanLine(block.source, LIMITS.chartSource)), notes: optional(cleanText(block.notes, LIMITS.chartNotes)), credit: optional(cleanLine(block.credit, LIMITS.chartCredit)), height } as const;
      let fallback: MediaId | null = block.image ?? null;
      if (block.mode === "static") {
        const problem = image(fallback, ["chart-image", "Choose the graphic."], ["chart-image-unavailable", "This graphic is no longer in Media. Choose another."]);
        if (problem) return problem;
        return { block: { type: "chartMap", mode: "static", image: fallback, altOverride: optional(cleanLine(block.altOverride, LIMITS.altText)), ...common }, issues };
      }
      const embed = visualizationUrl(block.url ?? "");
      if (!embed) return omit("chart-url", "Paste a Datawrapper, Flourish, Google Maps or OpenStreetMap address. Other addresses are not allowed.");
      if (fallback !== null && !isImageAsset(media(fallback))) {
        issue("dropped", "chart-fallback-unavailable", "The fallback graphic is no longer in Media and is left out.");
        fallback = null;
      }
      return { block: { type: "chartMap", mode: "interactive", url: embed.src, provider: embed.provider, image: fallback, altOverride: optional(cleanLine(block.altOverride, LIMITS.altText)), ...common }, issues };
    }
    case "dataTable": {
      const title = cleanLine(block.title, LIMITS.tableTitle);
      if (!title) return omit("table-title", "Give the table a title.");
      const columns = block.columns.slice(0, LIMITS.tableColumnsMax).map((column) => ({ id: column.id, label: cleanLine(column.label, LIMITS.tableCell) }));
      if (columns.length < LIMITS.tableColumnsMin) return omit("table-columns", `A table needs at least ${LIMITS.tableColumnsMin} columns.`);
      if (columns.some((column) => !column.label)) return omit("table-headers", "Every column needs a header.");
      const rows: DataTableRow[] = [];
      for (const row of squareRows(columns, block.rows)) {
        const cells = row.cells.map((cell) => cleanLine(cell, LIMITS.tableCell));
        if (cells.every((cell) => !cell)) {
          issue("dropped", "table-row-empty", "An empty row is left out.", row.id);
          continue;
        }
        rows.push({ id: row.id, cells });
      }
      if (!rows.length) return omit("table-rows", "Add at least one row of data.");
      return {
        block: {
          type: "dataTable",
          id: block.id,
          title,
          description: optional(cleanText(block.description, LIMITS.tableDescription)),
          columns,
          rows: rows.slice(0, LIMITS.tableRowsMax),
          presentation: block.presentation === "comparison" ? "comparison" : "standard",
          rowHeaders: block.rowHeaders === true,
          source: optional(cleanLine(block.source, LIMITS.tableSource)),
          notes: optional(cleanText(block.notes, LIMITS.tableNotes))
        },
        issues
      };
    }
    case "comparison": {
      const side = (value: ComparisonSide, name: string): ComparisonSide | null => {
        const title = cleanLine(value.title, LIMITS.comparisonTitle);
        const body = paragraphs(value.body);
        if (!title || !body.length) {
          issue("omitted", "comparison-side", `The ${name} side needs a title and a passage.`);
          return null;
        }
        return { label: cleanLine(value.label, LIMITS.comparisonLabel), title, body };
      };
      const left = side(block.left, "left");
      const right = side(block.right, "right");
      if (!left || !right) return { block: null, issues };
      return { block: { type: "comparison", id: block.id, heading: optional(cleanLine(block.heading, LIMITS.heading)), left, right }, issues };
    }
    case "keyNumbers": {
      const items: KeyNumber[] = [];
      for (const item of block.items) {
        const value = cleanLine(item.value, LIMITS.keyNumberValue);
        const label = cleanLine(item.label, LIMITS.keyNumberLabel);
        if (!value || !label) {
          if (value || label) issue("dropped", "number-incomplete", "A number needs both the figure and what it counts. It is left out.", item.id);
          continue;
        }
        items.push({ id: item.id, value, label, context: optional(cleanLine(item.context, LIMITS.keyNumberContext)) });
      }
      if (items.length < LIMITS.keyNumbersMin) return omit("numbers-too-few", `Key Numbers needs at least ${LIMITS.keyNumbersMin} complete numbers.`);
      return { block: { type: "keyNumbers", id: block.id, heading: optional(cleanLine(block.heading, LIMITS.heading)), source: optional(cleanLine(block.source, LIMITS.keyNumbersSource)), items: items.slice(0, LIMITS.keyNumbersMax) }, issues };
    }
    case "annotatedImage": {
      const problem = image(block.media, ["annotated-missing", "Choose the photograph."], ["annotated-unavailable", "This photograph is no longer in Media. Choose another."]);
      if (problem) return problem;
      const markers: AnnotationMarker[] = [];
      for (const marker of block.markers) {
        const title = cleanLine(marker.title, LIMITS.annotationTitle);
        const body = cleanText(marker.body, LIMITS.annotationBody);
        if (!title && !body) {
          issue("dropped", "marker-empty", "A marker with no note is left out.", marker.id);
          continue;
        }
        markers.push({ id: marker.id, x: clampPercent(marker.x), y: clampPercent(marker.y), title, body });
      }
      if (!markers.length) return omit("annotated-markers", "Add at least one marker with a note.");
      return { block: { type: "annotatedImage", id: block.id, media: block.media, altOverride: optional(cleanLine(block.altOverride, LIMITS.altText)), caption: cleanText(block.caption, LIMITS.caption), placement: block.placement === "wide" ? "wide" : "full", markers: markers.slice(0, LIMITS.annotationsMax) }, issues };
    }
    case "beforeAfter": {
      const before = image(block.before, ["compare-before", "Choose the Before photograph."], ["compare-before-unavailable", "The Before photograph is no longer in Media. Choose another."]);
      if (before) return before;
      const after = image(block.after, ["compare-after", "Choose the After photograph."], ["compare-after-unavailable", "The After photograph is no longer in Media. Choose another."]);
      if (after) return after;
      return {
        block: {
          type: "beforeAfter",
          id: block.id,
          before: block.before,
          after: block.after,
          beforeLabel: cleanLine(block.beforeLabel, LIMITS.comparisonPhotoLabel) || "Before",
          afterLabel: cleanLine(block.afterLabel, LIMITS.comparisonPhotoLabel) || "After",
          fit: block.fit === "contain" ? "contain" : "cover",
          caption: cleanText(block.caption, LIMITS.caption),
          placement: block.placement === "wide" ? "wide" : "full"
        },
        issues
      };
    }
    case "timeline": {
      const items: TimelineEvent[] = [];
      let current = false;
      for (const event of block.items) {
        const clean = { id: event.id, label: cleanLine(event.label, LIMITS.timelineLabel), title: cleanLine(event.title, LIMITS.timelineTitle), body: cleanText(event.body, LIMITS.timelineBody), current: false };
        if (isStubEvent(clean)) {
          if (clean.label) issue("dropped", "timeline-stub", "An event with only a date label is left out. Add what happened.", event.id);
          continue;
        }
        // At most one event is the latest.
        clean.current = Boolean(event.current) && !current;
        current ||= clean.current;
        items.push(clean);
      }
      if (items.length < LIMITS.timelineMin) return omit("timeline-too-short", `A timeline needs at least ${LIMITS.timelineMin} events with something to say.`);
      return { block: { type: "timeline", id: block.id, items: items.slice(0, LIMITS.timelineMax) }, issues };
    }
    case "relatedCoverage": {
      const stories: Array<{ id: string; story: MediaId | null }> = [];
      const seen = new Set<string>();
      for (const item of block.stories) {
        if (item.story === null || item.story === undefined) {
          issue("dropped", "related-empty", "An empty slot is left out.", item.id);
          continue;
        }
        const key = mediaKey(item.story);
        if (seen.has(key)) {
          issue("dropped", "related-duplicate", "The same story twice. The second is left out.", item.id);
          continue;
        }
        if (!refs.story?.(item.story)) {
          issue("dropped", "related-unavailable", "A story that is not published, or is gone, is left out.", item.id);
          continue;
        }
        seen.add(key);
        stories.push({ id: item.id, story: item.story });
      }
      if (stories.length < LIMITS.relatedMin) return omit("related-none", "Choose at least one published story.");
      return { block: { type: "relatedCoverage", id: block.id, heading: cleanLine(block.heading, LIMITS.heading) || DEFAULT_HEADINGS.relatedCoverage, stories: stories.slice(0, LIMITS.relatedMax) }, issues };
    }
    case "poll": {
      if (block.poll === null || block.poll === undefined) return omit("poll-missing", "Choose a poll.");
      const poll = refs.poll?.(block.poll);
      if (!poll) return omit("poll-unavailable", "This poll is not public yet, or is gone. Choose another.");
      if (poll.options.length < 2) return omit("poll-options", "A poll needs at least two answers.");
      return { block: { type: "poll", id: block.id, poll: block.poll }, issues };
    }
    case "repositoryInteractive": {
      const key = cleanLine(block.key, LIMITS.interactiveKey);
      if (!key) return omit("interactive-key", "Choose an interactive.");
      if (refs.interactive?.(key) !== true) return omit("interactive-unregistered", "This interactive is not in the site's code. It cannot publish until a developer adds it.");
      const title = cleanLine(block.title, LIMITS.interactiveTitle);
      const description = cleanText(block.description, LIMITS.interactiveDescription);
      if (!title) return omit("interactive-title", "Give the interactive a title.");
      if (!description) return omit("interactive-description", "Describe what it shows in words, for readers who cannot use it.");
      return { block: { type: "repositoryInteractive", id: block.id, key, title, description }, issues };
    }
    default:
      return assertNever(block);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled block: ${JSON.stringify(value)}`);
}

/**
 * Whether an issue stops a story from publishing. A block left out whole always
 * does, and so does a drop that would lose substantive content (a story, photo,
 * graphic or number the writer chose). An empty marker, row or page reference
 * is harmless and publishes without it.
 */
const BLOCKING_DROPS: ReadonlySet<string> = new Set(["related-unavailable", "gallery-item-unavailable", "chart-fallback-unavailable", "number-incomplete"]);
export function isBlockingIssue(issue: Pick<BlockIssue, "effect" | "code">): boolean {
  return issue.effect === "omitted" || BLOCKING_DROPS.has(issue.code);
}

/** The writer-facing problems with a block while drafting (the same rules publishing applies). */
export function blockIssues(block: ArticleBlock, media: MediaLookup, refs: ReferenceLookup = {}): BlockIssue[] {
  return finalizeBlock(block, media, refs).issues;
}

export function blockLabel(type: ArticleBlockType): string {
  return ARTICLE_BLOCKS[type].label;
}
