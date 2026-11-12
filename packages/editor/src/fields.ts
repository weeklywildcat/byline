import {
  ARTICLE_BLOCK_LIMITS as LIMITS,
  CHAPTER_ALIGNS,
  CHAPTER_PLACEMENTS,
  DEFAULT_HEADINGS,
  PLACEMENTS,
  boundedParagraphs,
  parseSocialPostUrl,
  parseTimestamp,
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
  type FinalScoreStatus,
  type GalleryFit,
  type GalleryLayoutKind,
  type KeyFactsPresentation,
  type NativeChartType,
  type ParagraphNode,
  type MediaId,
  type Placement,
  type PortraitSide,
  CHAPTER_HEIGHTS,
  CHAPTER_KINDS,
  FEATURE_MEDIA_PRESENTATIONS,
  PHONE_PRESENTATIONS,
  PULL_QUOTE_PRESENTATIONS,
  OVERLAY_TONES,
  SCRIM_STRENGTHS,
  presetValue,
  type ChapterHeight,
  type ChapterKind,
  type FeatureMediaPhoneOrder,
  type FeatureMediaPresentation,
  type OverlayTone,
  type PhonePresentation,
  type PullQuotePresentation,
  type ScrimStrength
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
  /** `phone`: absent is Auto (presentation.ts). Presentation choices are read as stored and only defaulted where they are used, so an old block stays exactly as it was. */
  photo: { media: MediaId | null; caption: string; altOverride: string; placement: Placement; phone: PhonePresentation };
  gallery: { items: Array<{ id: string; media: MediaId | null; caption: string; altOverride: string }>; fit: GalleryFit; layout: GalleryLayoutKind };
  reportedQuote: { text: string; attribution: string; sourceUrl: string; sourceLabel: string };
  pullQuote: { text: string; attribution: string; presentation: PullQuotePresentation };
  keyFacts: { heading: string; facts: Array<{ id: string; text: string }>; presentation: KeyFactsPresentation };
  /** Bounded paragraphs. Stored as JSON; a Context saved before formatting holds plain text, read as paragraphs. */
  context: { heading: string; body: ParagraphNode[] };
  document: { media: MediaId | null; title: string; context: string; source: string; pages: Array<{ id: string; page: number | null; label: string; excerpt: string }> };
  timeline: { items: TimelineFields[] };
  portraitText: { media: MediaId | null; altOverride: string; heading: string; body: string; caption: string; side: PortraitSide; presentation: FeatureMediaPresentation; phoneOrder: FeatureMediaPhoneOrder; phone: PhonePresentation; tone: OverlayTone; scrim: ScrimStrength };
  /** `height` is null for a chapter saved before heights existed: it keeps its original proportion until a writer picks one. */
  /** `tone` is the words' colour as stored; null follows the kind (chapterTone). */
  visualChapter: { media: MediaId | null; altOverride: string; eyebrow: string; heading: string; dek: string; placement: ChapterPlacement; align: ChapterAlign; kind: ChapterKind; height: ChapterHeight | null; tone: OverlayTone | null; scrim: ScrimStrength };
  video: { url: string; title: string; caption: string; captionsConfirmed: boolean; chapters: ChapterFields[]; transcript: string };
  audio: { media: MediaId | null; title: string; caption: string; transcript: string; chapters: ChapterFields[] };
  editorsNote: { body: string };
  marginNote: { heading: string; body: string };
  expandable: { heading: string; body: string };
  chartMap: {
    mode: ChartMapMode;
    url: string;
    image: MediaId | null;
    altOverride: string;
    title: string;
    dek: string;
    summary: string;
    source: string;
    notes: string;
    credit: string;
    height: ChartMapHeight;
    chartType: NativeChartType;
    columns: Array<{ id: string; label: string }>;
    rows: Array<{ id: string; cells: string[] }>;
    sourceUrl: string;
  };
  dataTable: { title: string; description: string; columns: Array<{ id: string; label: string }>; rows: Array<{ id: string; cells: string[] }>; presentation: DataTablePresentation; rowHeaders: boolean; source: string; notes: string };
  comparison: { heading: string; leftLabel: string; leftTitle: string; leftBody: string; rightLabel: string; rightTitle: string; rightBody: string };
  keyNumbers: { heading: string; source: string; items: Array<{ id: string; value: string; label: string; context: string }> };
  annotatedImage: { media: MediaId | null; altOverride: string; caption: string; placement: ChapterPlacement; markers: Array<{ id: string; x: number; y: number; title: string; body: string }> };
  beforeAfter: { before: MediaId | null; after: MediaId | null; beforeLabel: string; afterLabel: string; fit: BeforeAfterFit; caption: string; placement: ChapterPlacement };
  relatedCoverage: { heading: string; stories: Array<{ id: string; story: MediaId | null }> };
  poll: { poll: MediaId | null };
  repositoryInteractive: { key: string; title: string; description: string };
  repositoryTracker: { key: string; title: string; description: string };
  dataProject: { project: MediaId | null; title: string; description: string };
  event: { event: MediaId | null };
  socialPost: { url: string; caption: string };
  finalScore: { sport: string; teamA: string; teamAScore: number | null; teamB: string; teamBScore: number | null; status: FinalScoreStatus; date: string; location: string; note: string };
};

/** A chapter as stored: `time` is null until the writer types one. */
export type ChapterFields = { id: string; time: number | null; label: string };
/** A timeline event as stored: its text, and its optional evidence as flat fields. */
export type TimelineFields = {
  id: string;
  label: string;
  title: string;
  body: string;
  current: boolean;
  media: MediaId | null;
  altOverride: string;
  caption: string;
  linkUrl: string;
  linkLabel: string;
  document: MediaId | null;
  documentPage: number | null;
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

const chaptersOf = (value: unknown): ChapterFields[] => rows(value).map((row, index) => ({ id: rowId(row, index), time: parseTimestamp(row.time), label: text(row.label) }));
const score = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);

const pageNumber = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
};

/** Read one block's stored fields, filling the defaults a new block starts with. */
export const BLOCK_FIELD_READERS: { [K in ArticleBlockType]: (raw: unknown) => BylineBlockFields[K] } = {
  photo: (raw) => {
    const fields = record(raw);
    const placement = PLACEMENTS.includes(fields.placement as Placement) ? (fields.placement as Placement) : "column";
    return { media: mediaIdOf(fields.media), caption: text(fields.caption), altOverride: text(fields.altOverride), placement, phone: presetValue(PHONE_PRESENTATIONS, fields.phone) ?? "auto" };
  },
  gallery: (raw) => {
    const fields = record(raw);
    const layout: GalleryLayoutKind = fields.layout === "essay" || fields.layout === "featured" ? fields.layout : "grid";
    return { items: rows(fields.items).map((row, index) => ({ id: rowId(row, index), media: mediaIdOf(row.media), caption: text(row.caption), altOverride: text(row.altOverride) })), fit: fields.fit === "crop" ? "crop" : "natural", layout };
  },
  reportedQuote: (raw) => ({ text: text(record(raw).text), attribution: text(record(raw).attribution), sourceUrl: text(record(raw).sourceUrl), sourceLabel: text(record(raw).sourceLabel) }),
  pullQuote: (raw) => ({ text: text(record(raw).text), attribution: text(record(raw).attribution), presentation: presetValue(PULL_QUOTE_PRESENTATIONS, record(raw).presentation) ?? "standard" }),
  keyFacts: (raw) => {
    const fields = record(raw);
    const facts = rows(fields.facts).map((row, index) => ({ id: rowId(row, index), text: text(row.text) }));
    return { heading: typeof fields.heading === "string" ? fields.heading : DEFAULT_HEADINGS.keyFacts, facts: facts.length ? facts : [{ id: "draft-0", text: "" }], presentation: fields.presentation === "compact" ? "compact" : "standard" };
  },
  context: (raw) => {
    const fields = record(raw);
    return { heading: typeof fields.heading === "string" ? fields.heading : DEFAULT_HEADINGS.context, body: boundedParagraphs(fields.body, LIMITS.contextBody) };
  },
  document: (raw) => {
    const fields = record(raw);
    return { media: mediaIdOf(fields.media), title: text(fields.title), context: text(fields.context), source: text(fields.source), pages: rows(fields.pages).map((row, index) => ({ id: rowId(row, index), page: pageNumber(row.page), label: text(row.label), excerpt: text(row.excerpt) })) };
  },
  timeline: (raw) => {
    const items: TimelineFields[] = rows(record(raw).items).map((row, index) => ({
      id: rowId(row, index),
      label: text(row.label),
      title: text(row.title),
      body: text(row.body),
      current: row.current === true,
      media: mediaIdOf(row.media),
      altOverride: text(row.altOverride),
      caption: text(row.caption),
      linkUrl: text(row.linkUrl),
      linkLabel: text(row.linkLabel),
      document: mediaIdOf(row.document),
      documentPage: pageNumber(row.documentPage)
    }));
    // A new timeline starts with two events to fill: a chronology needs at least two.
    while (items.length < LIMITS.timelineMin) items.push(blankTimelineEvent(`draft-${items.length}`));
    return { items };
  },
  portraitText: (raw) => {
    const fields = record(raw);
    return {
      media: mediaIdOf(fields.media),
      altOverride: text(fields.altOverride),
      heading: text(fields.heading),
      body: text(fields.body),
      caption: text(fields.caption),
      side: fields.side === "right" ? "right" : "left",
      presentation: presetValue(FEATURE_MEDIA_PRESENTATIONS, fields.presentation) ?? "split",
      phoneOrder: fields.phoneOrder === "text" ? "text" : "media",
      phone: presetValue(PHONE_PRESENTATIONS, fields.phone) ?? "auto",
      tone: fields.tone === "dark" ? "dark" : "light",
      scrim: presetValue(SCRIM_STRENGTHS, fields.scrim) ?? "standard"
    };
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
      align: CHAPTER_ALIGNS.includes(fields.align as ChapterAlign) ? (fields.align as ChapterAlign) : "bottom-left",
      kind: presetValue(CHAPTER_KINDS, fields.kind) ?? "media",
      height: presetValue(CHAPTER_HEIGHTS, fields.height) ?? null,
      tone: presetValue(OVERLAY_TONES, fields.tone) ?? null,
      scrim: presetValue(SCRIM_STRENGTHS, fields.scrim) ?? "standard"
    };
  },
  video: (raw) => {
    const fields = record(raw);
    return { url: text(fields.url), title: text(fields.title), caption: text(fields.caption), captionsConfirmed: fields.captionsConfirmed === true, chapters: chaptersOf(fields.chapters), transcript: text(fields.transcript) };
  },
  audio: (raw) => {
    const fields = record(raw);
    return { media: mediaIdOf(fields.media), title: text(fields.title), caption: text(fields.caption), transcript: text(fields.transcript), chapters: chaptersOf(fields.chapters) };
  },
  editorsNote: (raw) => ({ body: text(record(raw).body) }),
  marginNote: (raw) => ({ heading: text(record(raw).heading), body: text(record(raw).body) }),
  expandable: (raw) => ({ heading: text(record(raw).heading), body: text(record(raw).body) }),
  chartMap: (raw) => {
    const fields = record(raw);
    const columns = rows(fields.columns).map((row, index) => ({ id: rowId(row, index), label: text(row.label) }));
    // A new chart starts as a small table to fill: a label column and one series, three rows.
    while (columns.length < 2) columns.push({ id: `draft-c${columns.length}`, label: "" });
    const stored = rows(fields.rows).map((row, index) => ({ id: rowId(row, index), cells: Array.isArray(row.cells) ? row.cells.map(text) : [] }));
    while (stored.length < 3 && !Array.isArray(fields.rows)) stored.push({ id: `draft-r${stored.length}`, cells: [] });
    return {
      mode: fields.mode === "static" ? "static" : fields.mode === "interactive" ? "interactive" : "native",
      url: text(fields.url),
      image: mediaIdOf(fields.image),
      altOverride: text(fields.altOverride),
      title: text(fields.title),
      dek: text(fields.dek),
      summary: text(fields.summary),
      source: text(fields.source),
      notes: text(fields.notes),
      credit: text(fields.credit),
      height: typeof fields.height === "string" && fields.height in visualizationHeights ? (fields.height as ChartMapHeight) : "standard",
      chartType: fields.chartType === "line" || fields.chartType === "dot" ? fields.chartType : "bar",
      columns,
      rows: squareRows(columns, stored),
      sourceUrl: text(fields.sourceUrl)
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
  repositoryInteractive: (raw) => ({ key: text(record(raw).key), title: text(record(raw).title), description: text(record(raw).description) }),
  repositoryTracker: (raw) => ({ key: text(record(raw).key), title: text(record(raw).title), description: text(record(raw).description) }),
  dataProject: (raw) => ({ project: mediaIdOf(record(raw).project), title: text(record(raw).title), description: text(record(raw).description) }),
  event: (raw) => ({ event: mediaIdOf(record(raw).event) }),
  socialPost: (raw) => ({ url: text(record(raw).url), caption: text(record(raw).caption) }),
  finalScore: (raw) => {
    const fields = record(raw);
    const status: FinalScoreStatus = fields.status === "overtime" || fields.status === "tie" || fields.status === "forfeit" ? fields.status : "final";
    return { sport: text(fields.sport), teamA: text(fields.teamA), teamAScore: score(fields.teamAScore), teamB: text(fields.teamB), teamBScore: score(fields.teamBScore), status, date: text(fields.date), location: text(fields.location), note: text(fields.note) };
  }
};

/** An empty timeline event (a new one, or the blanks a new timeline starts with). */
export function blankTimelineEvent(id: string): TimelineFields {
  return { id, label: "", title: "", body: "", current: false, media: null, altOverride: "", caption: "", linkUrl: "", linkLabel: "", document: null, documentPage: null };
}

const chaptersToArticle = (chapters: ChapterFields[]) => (chapters.length ? { chapters: chapters.map((chapter) => ({ id: chapter.id, time: chapter.time ?? -1, label: chapter.label })) } : {});
const optionalText = <K extends string>(key: K, value: string) => (value.trim() ? ({ [key]: value } as Record<K, string>) : {});

/** Stored fields → the semantic block (unfinalized: readiness decides what publishes). */
export const BLOCK_TO_ARTICLE: { [K in ArticleBlockType]: (id: string, fields: BylineBlockFields[K]) => ArticleBlockOf<K> } = {
  photo: (id, fields) => ({ type: "photo", id, media: fields.media, caption: fields.caption, ...(fields.altOverride.trim() ? { altOverride: fields.altOverride } : {}), placement: fields.placement, ...(fields.phone !== "auto" ? { phone: fields.phone } : {}) }),
  gallery: (id, fields) => ({ type: "gallery", id, fit: fields.fit, layout: fields.layout, items: fields.items.map((item) => ({ id: item.id, media: item.media, caption: item.caption, ...(item.altOverride.trim() ? { altOverride: item.altOverride } : {}) })) }),
  reportedQuote: (id, fields) => ({ type: "reportedQuote", id, text: fields.text, attribution: fields.attribution, ...optionalText("sourceUrl", fields.sourceUrl), ...optionalText("sourceLabel", fields.sourceLabel) }),
  pullQuote: (id, fields) => ({ type: "pullQuote", id, text: fields.text, ...(fields.attribution.trim() ? { attribution: fields.attribution } : {}), ...(fields.presentation !== "standard" ? { presentation: fields.presentation } : {}) }),
  keyFacts: (id, fields) => ({ type: "keyFacts", id, heading: fields.heading, facts: fields.facts.map((fact) => ({ id: fact.id, text: fact.text })), presentation: fields.presentation }),
  context: (id, fields) => ({ type: "context", id, heading: fields.heading, body: fields.body }),
  document: (id, fields) => ({
    type: "document",
    id,
    media: fields.media,
    ...(fields.title.trim() ? { title: fields.title } : {}),
    ...(fields.context.trim() ? { context: fields.context } : {}),
    ...(fields.source.trim() ? { source: fields.source } : {}),
    pages: fields.pages.map((ref) => ({ id: ref.id, page: ref.page ?? 0, label: ref.label, ...optionalText("excerpt", ref.excerpt) }))
  }),
  timeline: (id, fields) => ({
    type: "timeline",
    id,
    items: fields.items.map((item) => ({
      id: item.id,
      label: item.label,
      title: item.title,
      body: item.body,
      current: item.current,
      ...(item.media !== null ? { image: { media: item.media, ...optionalText("altOverride", item.altOverride), ...optionalText("caption", item.caption) } } : {}),
      ...(item.linkUrl.trim() ? { link: { url: item.linkUrl, ...optionalText("label", item.linkLabel) } } : {}),
      ...(item.document !== null ? { document: { media: item.document, ...(item.documentPage ? { page: item.documentPage } : {}) } } : {})
    }))
  }),
  portraitText: (id, fields) => ({
    type: "portraitText",
    id,
    media: fields.media,
    ...(fields.altOverride.trim() ? { altOverride: fields.altOverride } : {}),
    ...(fields.heading.trim() ? { heading: fields.heading } : {}),
    body: paragraphsFromText(fields.body, LIMITS.portraitBody),
    ...(fields.caption.trim() ? { caption: fields.caption } : {}),
    side: fields.side,
    // Only what applies to the chosen presentation (finalizeBlock drops defaults the same way).
    ...(fields.presentation !== "split" ? { presentation: fields.presentation } : {}),
    ...(fields.presentation === "split" && fields.phoneOrder === "text" ? { phoneOrder: "text" as const } : {}),
    ...(fields.phone !== "auto" ? { phone: fields.phone } : {}),
    ...(fields.presentation === "spotlight" ? { ...(fields.tone === "dark" ? { tone: "dark" as const } : {}), ...(fields.scrim !== "standard" ? { scrim: fields.scrim } : {}) } : {})
  }),
  visualChapter: (id, fields) => ({
    type: "visualChapter",
    id,
    // A text chapter keeps any photograph it once had in its stored fields (switching back restores it) but never names it.
    media: fields.kind === "text" ? null : fields.media,
    ...(fields.kind !== "text" && fields.altOverride.trim() ? { altOverride: fields.altOverride } : {}),
    ...(fields.eyebrow.trim() ? { eyebrow: fields.eyebrow } : {}),
    heading: fields.heading,
    ...(fields.dek.trim() ? { dek: fields.dek } : {}),
    placement: fields.placement,
    align: fields.align,
    ...(fields.kind !== "media" ? { kind: fields.kind } : {}),
    ...(fields.kind !== "text" && fields.height ? { height: fields.height } : {}),
    ...(fields.tone && fields.tone !== (fields.kind === "media" ? "light" : "dark") ? { tone: fields.tone } : {}),
    ...(fields.kind === "media" && fields.scrim !== "standard" ? { scrim: fields.scrim } : {})
  }),
  video: (id, fields) => ({ type: "video", id, videoId: parseYouTubeVideoId(fields.url), title: fields.title, ...(fields.caption.trim() ? { caption: fields.caption } : {}), captionsConfirmed: fields.captionsConfirmed, ...chaptersToArticle(fields.chapters), ...optionalText("transcript", fields.transcript) }),
  audio: (id, fields) => ({ type: "audio", id, media: fields.media, title: fields.title, ...(fields.caption.trim() ? { caption: fields.caption } : {}), transcript: fields.transcript, ...chaptersToArticle(fields.chapters) }),
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
    height: fields.height,
    ...(fields.mode === "native" ? { chartType: fields.chartType, data: { columns: fields.columns.map((column) => ({ ...column })), rows: fields.rows.map((row) => ({ id: row.id, cells: [...row.cells] })) }, ...optionalText("sourceUrl", fields.sourceUrl) } : {})
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
  repositoryInteractive: (id, fields) => ({ type: "repositoryInteractive", id, key: fields.key, title: fields.title, description: fields.description }),
  repositoryTracker: (id, fields) => ({ type: "repositoryTracker", id, key: fields.key, title: fields.title, description: fields.description }),
  dataProject: (id, fields) => ({ type: "dataProject", id, project: fields.project, title: fields.title, description: fields.description }),
  event: (id, fields) => ({ type: "event", id, event: fields.event }),
  socialPost: (id, fields) => {
    const parsed = parseSocialPostUrl(fields.url);
    return { type: "socialPost", id, url: fields.url, ...(parsed.ok ? { provider: parsed.provider, postId: parsed.postId } : {}), ...optionalText("caption", fields.caption) };
  },
  finalScore: (id, fields) => ({
    type: "finalScore",
    id,
    ...optionalText("sport", fields.sport),
    teamA: fields.teamA,
    teamAScore: fields.teamAScore,
    teamB: fields.teamB,
    teamBScore: fields.teamBScore,
    status: fields.status,
    ...optionalText("date", fields.date),
    ...optionalText("location", fields.location),
    ...optionalText("note", fields.note)
  })
};

/**
 * What a newly inserted block starts with, where that differs from what an
 * absent field means for a stored one (Payload's `defaultValue` would apply to
 * old blocks too). A new Chapter is Half screen; one saved before heights
 * existed keeps its original proportion.
 */
export const NEW_BLOCK_FIELDS: Partial<Record<ArticleBlockType, Readonly<Record<string, unknown>>>> = {
  visualChapter: { kind: "media", height: "half" }
};

/** Fills a new block's starting presets into the fields it is being inserted with, never overriding one already given. */
export function withNewBlockFields(fields: Record<string, unknown>): Record<string, unknown> {
  const type = fields.blockType;
  const defaults = typeof type === "string" ? NEW_BLOCK_FIELDS[type as ArticleBlockType] : undefined;
  if (!defaults) return fields;
  for (const [key, value] of Object.entries(defaults)) if (fields[key] === undefined) fields[key] = value;
  return fields;
}

/** A stored block node's fields as the semantic block. */
export function articleBlockFromFields<K extends ArticleBlockType>(type: K, id: string, raw: unknown): ArticleBlockOf<K> {
  const read = BLOCK_FIELD_READERS[type] as (raw: unknown) => BylineBlockFields[K];
  const toArticle = BLOCK_TO_ARTICLE[type] as (id: string, fields: BylineBlockFields[K]) => ArticleBlockOf<K>;
  return toArticle(id, read(raw));
}
