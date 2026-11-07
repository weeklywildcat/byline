import {
  ARTICLE_BLOCK_LIMITS as LIMITS,
  CHAPTER_ALIGNS,
  CHAPTER_PLACEMENTS,
  DEFAULT_HEADINGS,
  PLACEMENTS,
  paragraphsFromText,
  squareRows,
  visualizationHeights,
  type ArticleBlockOf,
  type ArticleBlockType,
  type BeforeAfterFit,
  type ChapterAlign,
  type ChapterPlacement,
  type ChartMapHeight,
  type ChartMapMode,
  type DataTablePresentation,
  type GalleryFit,
  type MediaId,
  type Placement,
  type PortraitSide
} from "@byline/article-body";
import { parseYouTubeVideoId } from "@byline/core";

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
  portraitText: { media: MediaId | null; altOverride: string; heading: string; body: string; caption: string; side: PortraitSide };
  visualChapter: { media: MediaId | null; altOverride: string; eyebrow: string; heading: string; dek: string; placement: ChapterPlacement; align: ChapterAlign };
  video: { url: string; title: string; caption: string; captionsConfirmed: boolean };
  audio: { media: MediaId | null; title: string; caption: string; transcript: string };
  editorsNote: { body: string };
  marginNote: { heading: string; body: string };
  expandable: { heading: string; body: string };
  chartMap: { mode: ChartMapMode; url: string; image: MediaId | null; altOverride: string; title: string; dek: string; summary: string; source: string; notes: string; credit: string; height: ChartMapHeight };
  dataTable: { title: string; description: string; columns: Array<{ id: string; label: string }>; rows: Array<{ id: string; cells: string[] }>; presentation: DataTablePresentation; rowHeaders: boolean; source: string; notes: string };
  comparison: { heading: string; leftLabel: string; leftTitle: string; leftBody: string; rightLabel: string; rightTitle: string; rightBody: string };
  keyNumbers: { heading: string; source: string; items: Array<{ id: string; value: string; label: string; context: string }> };
  annotatedImage: { media: MediaId | null; altOverride: string; caption: string; placement: ChapterPlacement; markers: Array<{ id: string; x: number; y: number; title: string; body: string }> };
  beforeAfter: { before: MediaId | null; after: MediaId | null; beforeLabel: string; afterLabel: string; fit: BeforeAfterFit; caption: string; placement: ChapterPlacement };
  relatedCoverage: { heading: string; stories: Array<{ id: string; story: MediaId | null }> };
  poll: { poll: MediaId | null };
  repositoryInteractive: { key: string; title: string; description: string };
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
  },
  portraitText: (raw) => {
    const fields = record(raw);
    return { media: mediaIdOf(fields.media), altOverride: text(fields.altOverride), heading: text(fields.heading), body: text(fields.body), caption: text(fields.caption), side: fields.side === "right" ? "right" : "left" };
  },
  visualChapter: (raw) => {
    const fields = record(raw);
    return {
      media: mediaIdOf(fields.media),
      altOverride: text(fields.altOverride),
      eyebrow: text(fields.eyebrow),
      heading: text(fields.heading),
      dek: text(fields.dek),
      placement: CHAPTER_PLACEMENTS.includes(fields.placement as ChapterPlacement) ? (fields.placement as ChapterPlacement) : "full",
      align: CHAPTER_ALIGNS.includes(fields.align as ChapterAlign) ? (fields.align as ChapterAlign) : "bottom-left"
    };
  },
  video: (raw) => {
    const fields = record(raw);
    return { url: text(fields.url), title: text(fields.title), caption: text(fields.caption), captionsConfirmed: fields.captionsConfirmed === true };
  },
  audio: (raw) => {
    const fields = record(raw);
    return { media: mediaIdOf(fields.media), title: text(fields.title), caption: text(fields.caption), transcript: text(fields.transcript) };
  },
  editorsNote: (raw) => ({ body: text(record(raw).body) }),
  marginNote: (raw) => ({ heading: text(record(raw).heading), body: text(record(raw).body) }),
  expandable: (raw) => ({ heading: text(record(raw).heading), body: text(record(raw).body) }),
  chartMap: (raw) => {
    const fields = record(raw);
    return {
      mode: fields.mode === "static" ? "static" : "interactive",
      url: text(fields.url),
      image: mediaIdOf(fields.image),
      altOverride: text(fields.altOverride),
      title: text(fields.title),
      dek: text(fields.dek),
      summary: text(fields.summary),
      source: text(fields.source),
      notes: text(fields.notes),
      credit: text(fields.credit),
      height: typeof fields.height === "string" && fields.height in visualizationHeights ? (fields.height as ChartMapHeight) : "standard"
    };
  },
  dataTable: (raw) => {
    const fields = record(raw);
    const columns = rows(fields.columns).map((row, index) => ({ id: rowId(row, index), label: text(row.label) }));
    // A new table is a small grid to fill: three columns, three rows.
    while (columns.length < 3 && !Array.isArray(fields.columns)) columns.push({ id: `draft-c${columns.length}`, label: "" });
    while (columns.length < LIMITS.tableColumnsMin) columns.push({ id: `draft-c${columns.length}`, label: "" });
    const stored = rows(fields.rows).map((row, index) => ({ id: rowId(row, index), cells: Array.isArray(row.cells) ? row.cells.map(text) : [] }));
    while (stored.length < 3 && !Array.isArray(fields.rows)) stored.push({ id: `draft-r${stored.length}`, cells: [] });
    if (!stored.length) stored.push({ id: "draft-r0", cells: [] });
    return {
      title: text(fields.title),
      description: text(fields.description),
      columns,
      rows: squareRows(columns, stored),
      presentation: fields.presentation === "comparison" ? "comparison" : "standard",
      rowHeaders: fields.rowHeaders === undefined ? true : fields.rowHeaders === true,
      source: text(fields.source),
      notes: text(fields.notes)
    };
  },
  comparison: (raw) => {
    const fields = record(raw);
    return { heading: text(fields.heading), leftLabel: text(fields.leftLabel), leftTitle: text(fields.leftTitle), leftBody: text(fields.leftBody), rightLabel: text(fields.rightLabel), rightTitle: text(fields.rightTitle), rightBody: text(fields.rightBody) };
  },
  keyNumbers: (raw) => {
    const fields = record(raw);
    const items = rows(fields.items).map((row, index) => ({ id: rowId(row, index), value: text(row.value), label: text(row.label), context: text(row.context) }));
    while (items.length < LIMITS.keyNumbersMin) items.push({ id: `draft-${items.length}`, value: "", label: "", context: "" });
    return { heading: text(fields.heading), source: text(fields.source), items };
  },
  annotatedImage: (raw) => {
    const fields = record(raw);
    const percent = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50);
    return {
      media: mediaIdOf(fields.media),
      altOverride: text(fields.altOverride),
      caption: text(fields.caption),
      placement: fields.placement === "wide" ? "wide" : "full",
      markers: rows(fields.markers).map((row, index) => ({ id: rowId(row, index), x: percent(row.x), y: percent(row.y), title: text(row.title), body: text(row.body) }))
    };
  },
  beforeAfter: (raw) => {
    const fields = record(raw);
    return {
      before: mediaIdOf(fields.before),
      after: mediaIdOf(fields.after),
      beforeLabel: typeof fields.beforeLabel === "string" ? fields.beforeLabel : "Before",
      afterLabel: typeof fields.afterLabel === "string" ? fields.afterLabel : "After",
      fit: fields.fit === "contain" ? "contain" : "cover",
      caption: text(fields.caption),
      placement: fields.placement === "full" ? "full" : "wide"
    };
  },
  relatedCoverage: (raw) => {
    const fields = record(raw);
    const stories = rows(fields.stories).map((row, index) => ({ id: rowId(row, index), story: mediaIdOf(row.story) }));
    return { heading: typeof fields.heading === "string" ? fields.heading : DEFAULT_HEADINGS.relatedCoverage, stories: stories.length ? stories : [{ id: "draft-0", story: null }] };
  },
  poll: (raw) => ({ poll: mediaIdOf(record(raw).poll) }),
  repositoryInteractive: (raw) => ({ key: text(record(raw).key), title: text(record(raw).title), description: text(record(raw).description) })
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
  timeline: (id, fields) => ({ type: "timeline", id, items: fields.items.map((item) => ({ id: item.id, label: item.label, title: item.title, body: item.body, current: item.current })) }),
  portraitText: (id, fields) => ({
    type: "portraitText",
    id,
    media: fields.media,
    ...(fields.altOverride.trim() ? { altOverride: fields.altOverride } : {}),
    ...(fields.heading.trim() ? { heading: fields.heading } : {}),
    body: paragraphsFromText(fields.body, LIMITS.portraitBody),
    ...(fields.caption.trim() ? { caption: fields.caption } : {}),
    side: fields.side
  }),
  visualChapter: (id, fields) => ({
    type: "visualChapter",
    id,
    media: fields.media,
    ...(fields.altOverride.trim() ? { altOverride: fields.altOverride } : {}),
    ...(fields.eyebrow.trim() ? { eyebrow: fields.eyebrow } : {}),
    heading: fields.heading,
    ...(fields.dek.trim() ? { dek: fields.dek } : {}),
    placement: fields.placement,
    align: fields.align
  }),
  video: (id, fields) => ({ type: "video", id, videoId: parseYouTubeVideoId(fields.url), title: fields.title, ...(fields.caption.trim() ? { caption: fields.caption } : {}), captionsConfirmed: fields.captionsConfirmed }),
  audio: (id, fields) => ({ type: "audio", id, media: fields.media, title: fields.title, ...(fields.caption.trim() ? { caption: fields.caption } : {}), transcript: fields.transcript }),
  editorsNote: (id, fields) => ({ type: "editorsNote", id, body: paragraphsFromText(fields.body, LIMITS.noteBody) }),
  marginNote: (id, fields) => ({ type: "marginNote", id, ...(fields.heading.trim() ? { heading: fields.heading } : {}), body: paragraphsFromText(fields.body, LIMITS.noteBody) }),
  expandable: (id, fields) => ({ type: "expandable", id, heading: fields.heading, body: paragraphsFromText(fields.body, LIMITS.expandableBody) }),
  chartMap: (id, fields) => ({
    type: "chartMap",
    id,
    mode: fields.mode,
    ...(fields.mode === "interactive" ? { url: fields.url } : {}),
    image: fields.image,
    ...(fields.altOverride.trim() ? { altOverride: fields.altOverride } : {}),
    title: fields.title,
    ...(fields.dek.trim() ? { dek: fields.dek } : {}),
    summary: fields.summary,
    ...(fields.source.trim() ? { source: fields.source } : {}),
    ...(fields.notes.trim() ? { notes: fields.notes } : {}),
    ...(fields.credit.trim() ? { credit: fields.credit } : {}),
    height: fields.height
  }),
  dataTable: (id, fields) => ({
    type: "dataTable",
    id,
    title: fields.title,
    ...(fields.description.trim() ? { description: fields.description } : {}),
    columns: fields.columns.map((column) => ({ id: column.id, label: column.label })),
    rows: fields.rows.map((row) => ({ id: row.id, cells: [...row.cells] })),
    presentation: fields.presentation,
    rowHeaders: fields.rowHeaders,
    ...(fields.source.trim() ? { source: fields.source } : {}),
    ...(fields.notes.trim() ? { notes: fields.notes } : {})
  }),
  comparison: (id, fields) => ({
    type: "comparison",
    id,
    ...(fields.heading.trim() ? { heading: fields.heading } : {}),
    left: { label: fields.leftLabel, title: fields.leftTitle, body: paragraphsFromText(fields.leftBody, LIMITS.comparisonBody) },
    right: { label: fields.rightLabel, title: fields.rightTitle, body: paragraphsFromText(fields.rightBody, LIMITS.comparisonBody) }
  }),
  keyNumbers: (id, fields) => ({
    type: "keyNumbers",
    id,
    ...(fields.heading.trim() ? { heading: fields.heading } : {}),
    ...(fields.source.trim() ? { source: fields.source } : {}),
    items: fields.items.map((item) => ({ id: item.id, value: item.value, label: item.label, ...(item.context.trim() ? { context: item.context } : {}) }))
  }),
  annotatedImage: (id, fields) => ({
    type: "annotatedImage",
    id,
    media: fields.media,
    ...(fields.altOverride.trim() ? { altOverride: fields.altOverride } : {}),
    caption: fields.caption,
    placement: fields.placement,
    markers: fields.markers.map((marker) => ({ id: marker.id, x: marker.x, y: marker.y, title: marker.title, body: marker.body }))
  }),
  beforeAfter: (id, fields) => ({ type: "beforeAfter", id, before: fields.before, after: fields.after, beforeLabel: fields.beforeLabel, afterLabel: fields.afterLabel, fit: fields.fit, caption: fields.caption, placement: fields.placement }),
  relatedCoverage: (id, fields) => ({ type: "relatedCoverage", id, heading: fields.heading, stories: fields.stories.map((item) => ({ id: item.id, story: item.story })) }),
  poll: (id, fields) => ({ type: "poll", id, poll: fields.poll }),
  repositoryInteractive: (id, fields) => ({ type: "repositoryInteractive", id, key: fields.key, title: fields.title, description: fields.description })
};

/** A stored block node's fields as the semantic block. */
export function articleBlockFromFields<K extends ArticleBlockType>(type: K, id: string, raw: unknown): ArticleBlockOf<K> {
  const read = BLOCK_FIELD_READERS[type] as (raw: unknown) => BylineBlockFields[K];
  const toArticle = BLOCK_TO_ARTICLE[type] as (id: string, fields: BylineBlockFields[K]) => ArticleBlockOf<K>;
  return toArticle(id, read(raw));
}
