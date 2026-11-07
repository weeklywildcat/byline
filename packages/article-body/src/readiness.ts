import { ARTICLE_BLOCK_LIMITS as LIMITS, ARTICLE_BLOCKS, DEFAULT_HEADINGS } from "./blocks";
import { isDocumentAsset, isImageAsset } from "./media";
import { cleanLine, cleanText, hasInlineText } from "./text";
import { isStubEvent } from "./timeline";
import type { ArticleBlock, ArticleBlockType, ArticleMediaAsset, DocumentPageRef, GalleryItem, MediaId, TimelineEvent } from "./types";

/**
 * Readiness: what keeps part of a block out of the published story.
 *
 * Writing is forgiving: an unfinished block saves, autosaves and stays
 * editable, and the editor shows these messages calmly beside it. Publishing
 * is strict: `finalizeBlock` returns only what is complete, so an unfinished
 * block never becomes malformed public output.
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

export function finalizeBlock(block: ArticleBlock, media: MediaLookup): Finalized {
  const issues: BlockIssue[] = [];
  const issue = (effect: BlockIssue["effect"], code: string, message: string, itemId?: string) => issues.push({ blockId: block.id, type: block.type, effect, code, message, ...(itemId ? { itemId } : {}) });
  const omit = (code: string, message: string): Finalized => {
    issue("omitted", code, message);
    return { block: null, issues };
  };

  switch (block.type) {
    case "photo": {
      if (block.media === null || block.media === undefined) return omit("photo-missing", "Choose a photograph.");
      if (!isImageAsset(media(block.media))) return omit("photo-unavailable", "This photograph is no longer in Media. Choose another.");
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
      const body = block.body.filter((paragraph) => hasInlineText(paragraph.children));
      if (!body.length) return omit("context-empty", "Write the context.");
      return { block: { type: "context", id: block.id, heading: cleanLine(block.heading, LIMITS.heading) || DEFAULT_HEADINGS.context, body }, issues };
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
  }
}

/** The writer-facing problems with a block while drafting (the same rules publishing applies). */
export function blockIssues(block: ArticleBlock, media: MediaLookup): BlockIssue[] {
  return finalizeBlock(block, media).issues;
}

export function blockLabel(type: ArticleBlockType): string {
  return ARTICLE_BLOCKS[type].label;
}
