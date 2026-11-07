import {
  ARTICLE_BLOCK_LIMITS as LIMITS,
  DEFAULT_HEADINGS,
  PLACEMENTS,
  paragraphsFromText,
  type ArticleBlockOf,
  type ArticleBlockType,
  type GalleryFit,
  type MediaId,
  type Placement
} from "@byline/article-body";

/**
 * The fields a Byline block stores in Payload's Lexical document, and the
 * one mapping from them to the semantic `byline-v1` block.
 *
 * The block editors read and write these shapes; the normalizer turns them
 * into ArticleBlocks. Anything Payload adds to a block node (`blockName`, form
 * metadata, a populated Media document instead of its ID) is tolerated on read
 * and never carried forward.
 */
export type BylineBlockFields = {
  photo: { media: MediaId | null; caption: string; altOverride: string; placement: Placement };
  gallery: { items: Array<{ id: string; media: MediaId | null; caption: string; altOverride: string }>; fit: GalleryFit };
  reportedQuote: { text: string; attribution: string };
  pullQuote: { text: string; attribution: string };
  keyFacts: { heading: string; facts: Array<{ id: string; text: string }> };
  context: { heading: string; body: string };
  document: { media: MediaId | null; title: string; context: string; source: string; pages: Array<{ id: string; page: number | null; label: string }> };
  timeline: { items: Array<{ id: string; label: string; title: string; body: string; current: boolean }> };
};

type Raw = Record<string, unknown>;

const record = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const rows = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(record) : []);

/** A new row ID in Payload's array-row format (24 hex characters). */
export function newRowId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Stored rows keep their IDs; a row without one gets a stable stand-in so re-reading never changes it. */
const rowId = (row: Raw, index: number): string => (typeof row.id === "string" && row.id ? row.id : typeof row.id === "number" ? String(row.id) : `row-${index}`);

/** A relationship value as an ID: Payload stores the ID and may hand back the populated document. */
export function mediaIdOf(value: unknown): MediaId | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") return /^\d+$/.test(value) ? Number(value) : value;
  if (value && typeof value === "object" && "id" in value) return mediaIdOf((value as { id: unknown }).id);
  return null;
}

const pageNumber = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
};

/** Read one block's stored fields, filling the defaults a new block starts with. */
export const BLOCK_FIELD_READERS: { [K in ArticleBlockType]: (raw: unknown) => BylineBlockFields[K] } = {
  photo: (raw) => {
    const fields = record(raw);
    const placement = PLACEMENTS.includes(fields.placement as Placement) ? (fields.placement as Placement) : "column";
    return { media: mediaIdOf(fields.media), caption: text(fields.caption), altOverride: text(fields.altOverride), placement };
  },
  gallery: (raw) => {
    const fields = record(raw);
    return { items: rows(fields.items).map((row, index) => ({ id: rowId(row, index), media: mediaIdOf(row.media), caption: text(row.caption), altOverride: text(row.altOverride) })), fit: fields.fit === "crop" ? "crop" : "natural" };
  },
  reportedQuote: (raw) => ({ text: text(record(raw).text), attribution: text(record(raw).attribution) }),
  pullQuote: (raw) => ({ text: text(record(raw).text), attribution: text(record(raw).attribution) }),
  keyFacts: (raw) => {
    const fields = record(raw);
    const facts = rows(fields.facts).map((row, index) => ({ id: rowId(row, index), text: text(row.text) }));
    return { heading: typeof fields.heading === "string" ? fields.heading : DEFAULT_HEADINGS.keyFacts, facts: facts.length ? facts : [{ id: "draft-0", text: "" }] };
  },
  context: (raw) => {
    const fields = record(raw);
    return { heading: typeof fields.heading === "string" ? fields.heading : DEFAULT_HEADINGS.context, body: text(fields.body) };
  },
  document: (raw) => {
    const fields = record(raw);
    return { media: mediaIdOf(fields.media), title: text(fields.title), context: text(fields.context), source: text(fields.source), pages: rows(fields.pages).map((row, index) => ({ id: rowId(row, index), page: pageNumber(row.page), label: text(row.label) })) };
  },
  timeline: (raw) => {
    const items = rows(record(raw).items).map((row, index) => ({ id: rowId(row, index), label: text(row.label), title: text(row.title), body: text(row.body), current: row.current === true }));
    // A new timeline starts with two events to fill: a chronology needs at least two.
    while (items.length < LIMITS.timelineMin) items.push({ id: `draft-${items.length}`, label: "", title: "", body: "", current: false });
    return { items };
  }
};

/** Stored fields → the semantic block (unfinalized: readiness decides what publishes). */
export const BLOCK_TO_ARTICLE: { [K in ArticleBlockType]: (id: string, fields: BylineBlockFields[K]) => ArticleBlockOf<K> } = {
  photo: (id, fields) => ({ type: "photo", id, media: fields.media, caption: fields.caption, ...(fields.altOverride.trim() ? { altOverride: fields.altOverride } : {}), placement: fields.placement }),
  gallery: (id, fields) => ({ type: "gallery", id, fit: fields.fit, items: fields.items.map((item) => ({ id: item.id, media: item.media, caption: item.caption, ...(item.altOverride.trim() ? { altOverride: item.altOverride } : {}) })) }),
  reportedQuote: (id, fields) => ({ type: "reportedQuote", id, text: fields.text, attribution: fields.attribution }),
  pullQuote: (id, fields) => ({ type: "pullQuote", id, text: fields.text, ...(fields.attribution.trim() ? { attribution: fields.attribution } : {}) }),
  keyFacts: (id, fields) => ({ type: "keyFacts", id, heading: fields.heading, facts: fields.facts.map((fact) => ({ id: fact.id, text: fact.text })) }),
  context: (id, fields) => ({ type: "context", id, heading: fields.heading, body: paragraphsFromText(fields.body, LIMITS.contextBody) }),
  document: (id, fields) => ({
    type: "document",
    id,
    media: fields.media,
    ...(fields.title.trim() ? { title: fields.title } : {}),
    ...(fields.context.trim() ? { context: fields.context } : {}),
    ...(fields.source.trim() ? { source: fields.source } : {}),
    pages: fields.pages.map((ref) => ({ id: ref.id, page: ref.page ?? 0, label: ref.label }))
  }),
  timeline: (id, fields) => ({ type: "timeline", id, items: fields.items.map((item) => ({ id: item.id, label: item.label, title: item.title, body: item.body, current: item.current })) })
};

/** A stored block node's fields as the semantic block. */
export function articleBlockFromFields<K extends ArticleBlockType>(type: K, id: string, raw: unknown): ArticleBlockOf<K> {
  const read = BLOCK_FIELD_READERS[type] as (raw: unknown) => BylineBlockFields[K];
  const toArticle = BLOCK_TO_ARTICLE[type] as (id: string, fields: BylineBlockFields[K]) => ArticleBlockOf<K>;
  return toArticle(id, read(raw));
}
