import { ARTICLE_BLOCK_LIMITS as L, ARTICLE_BLOCK_TYPES } from "./blocks";
import { mediaKey } from "./media";
import { blockMediaIds, inlineMediaIds, missingReferences } from "./references";
import { safeHref } from "./text";
import { safeWebUrl, sourceRefs } from "./evidence";
import { calendarDate, finalScoreProblem } from "./final-score";
import { chartDataProblem } from "./native-chart";
import { isCanonicalSocialPost } from "./social";
import { ARTICLE_BODY_FORMAT, ARTICLE_BODY_VERSION, isArticleBlock, type ArticleBlockType, type ArticleBody } from "./types";
import { visualizationHeights, visualizationUrl } from "./visualization";

/**
 * The authoritative runtime validator for a complete `byline-v1` body.
 *
 * TypeScript cannot vouch for JSON that crossed a network or a file, so
 * snapshot production, snapshot acceptance and fixtures all read this. It is
 * closed: an unknown property, node type or block type is an error (the
 * privacy boundary: editor-only fields such as `captionsConfirmed`, Lexical
 * state or Payload metadata can never ride along). It checks shapes, bounds,
 * enums, stable ids, media and reference tables and inline footnotes, and
 * that every record a block names is in its table.
 */
type Errors = string[];
type Check = (value: unknown, path: string, errors: Errors) => void;
type Field = { optional?: boolean; check: Check };

const fail = (errors: Errors, path: string, message: string) => void errors.push(`${path}: ${message}`);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const str = (max: number, options: { min?: number; optional?: boolean; line?: boolean } = {}): Field => ({
  optional: options.optional,
  check: (value, path, errors) => {
    if (typeof value !== "string") return fail(errors, path, "must be text");
    if ((options.min ?? 0) > value.length) return fail(errors, path, `must have at least ${options.min} characters`);
    if (value.length > max) return fail(errors, path, `must be at most ${max} characters`);
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) return fail(errors, path, "contains control characters");
    if (options.line && /\n/.test(value)) return fail(errors, path, "must be a single line");
  }
});
const req = (max: number, line = false): Field => str(max, { min: 1, line });
const opt = (max: number, line = false): Field => str(max, { optional: true, line });
const idField: Field = { check: (value, path, errors) => (typeof value === "string" && value.length >= 1 && value.length <= 128 ? undefined : fail(errors, path, "must be a stable id")) };
const pick = (values: readonly string[], optional = false): Field => ({ optional, check: (value, path, errors) => (typeof value === "string" && values.includes(value) ? undefined : fail(errors, path, `must be one of ${values.join(", ")}`)) });
const bool: Field = { check: (value, path, errors) => (typeof value === "boolean" ? undefined : fail(errors, path, "must be true or false")) };
const mediaRef: Field = { check: (value, path, errors) => (typeof value === "number" && Number.isSafeInteger(value) ? undefined : typeof value === "string" && value !== "" ? undefined : fail(errors, path, "must be a Media id")) };
const optMediaRef: Field = { optional: true, check: mediaRef.check };
const percent: Field = { check: (value, path, errors) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? undefined : fail(errors, path, "must be between 0 and 100")) };
const webUrl = (optional = true): Field => ({ optional, check: (value, path, errors) => (typeof value === "string" && safeWebUrl(value) === value ? undefined : fail(errors, path, "must be a web address (http or https)")) });
const optPositiveInt: Field = { optional: true, check: (value, path, errors) => (typeof value === "number" && Number.isInteger(value) && value >= 1 ? undefined : fail(errors, path, "must be a whole number of 1 or more")) };
const positiveInt: Field = { check: (value, path, errors) => (typeof value === "number" && Number.isInteger(value) && value >= 1 ? undefined : fail(errors, path, "must be a whole number of 1 or more")) };

function closed(spec: Record<string, Field>): Check {
  return (value, path, errors) => {
    if (!isRecord(value)) return fail(errors, path, "must be an object");
    for (const key of Object.keys(value)) if (!(key in spec)) fail(errors, `${path}.${key}`, "is not allowed here");
    for (const [key, field] of Object.entries(spec)) {
      const present = value[key] !== undefined;
      if (!present) {
        if (!field.optional) fail(errors, `${path}.${key}`, "is required");
        continue;
      }
      field.check(value[key], `${path}.${key}`, errors);
    }
  };
}
const object = (spec: Record<string, Field>, optional = false): Field => ({ optional, check: closed(spec) });
const list = (item: Field, min: number, max: number): Field => ({
  check: (value, path, errors) => {
    if (!Array.isArray(value)) return fail(errors, path, "must be a list");
    if (value.length < min || value.length > max) fail(errors, path, `must have ${min} to ${max} items`);
    value.forEach((entry, index) => item.check(entry, `${path}[${index}]`, errors));
    const ids = value.map((entry) => (isRecord(entry) ? entry.id : undefined)).filter((id) => typeof id === "string");
    if (new Set(ids).size !== ids.length) fail(errors, path, "has a repeated id");
  }
});

// Inline content: text, links, line breaks and footnote references.
const trueFlag: Field = { optional: true, check: (value, path, errors) => (value === true ? undefined : fail(errors, path, "must be true when present")) };
const textRun = closed({ type: pick(["text"]), text: str(100000), bold: trueFlag, italic: trueFlag });
const inlineCheck: Check = (value, path, errors) => {
  if (!isRecord(value)) return fail(errors, path, "must be an object");
  switch (value.type) {
    case "text":
      return textRun(value, path, errors);
    case "lineBreak":
      return closed({ type: pick(["lineBreak"]) })(value, path, errors);
    case "link":
      closed({ type: pick(["link"]), href: { check: (href, hrefPath, errs) => (typeof href === "string" && safeHref(href) === href ? undefined : fail(errs, hrefPath, "must be a safe web, mail or phone address")) }, children: { check: (children, childPath, errs) => (Array.isArray(children) ? children.forEach((child, index) => textRun(child, `${childPath}[${index}]`, errs)) : fail(errs, childPath, "must be a list")) } })(value, path, errors);
      return;
    case "footnote":
      return closed({ type: pick(["footnote"]), id: idField, text: req(L.footnote) })(value, path, errors);
    case "source":
      if (value.kind === "web") return closed({ type: pick(["source"]), id: idField, kind: pick(["web"]), url: webUrl(false), label: req(L.sourceLabel, true), note: opt(L.sourceNote) })(value, path, errors);
      return closed({ type: pick(["source"]), id: idField, kind: pick(["document"]), media: mediaRef, page: optPositiveInt, label: req(L.sourceLabel, true), note: opt(L.sourceNote) })(value, path, errors);
    default:
      fail(errors, `${path}.type`, `unknown inline node "${String(value.type)}"`);
  }
};
const inlines: Field = { check: (value, path, errors) => (Array.isArray(value) ? value.forEach((child, index) => inlineCheck(child, `${path}[${index}]`, errors)) : fail(errors, path, "must be a list")) };

const paragraph: Field = object({ type: pick(["paragraph"]), children: inlines });
/** Plain paragraphs inside a block: text, links and line breaks only (no footnotes or sources). */
const paragraphs = (max: number): Field => ({
  check: (value, path, errors) => {
    if (!Array.isArray(value)) return fail(errors, path, "must be a list");
    let total = 0;
    value.forEach((entry, index) => {
      paragraph.check(entry, `${path}[${index}]`, errors);
      if (isRecord(entry) && Array.isArray(entry.children)) {
        for (const child of entry.children) {
          if (isRecord(child) && (child.type === "footnote" || child.type === "source")) fail(errors, `${path}[${index}]`, `${child.type === "source" ? "sources" : "footnotes"} belong in the story's own paragraphs`);
          if (isRecord(child) && typeof child.text === "string") total += child.text.length;
        }
      }
    });
    if (total > max) fail(errors, path, `must be at most ${max} characters in all`);
    if (!value.length) fail(errors, path, "must have at least one paragraph");
  }
});

const chapterList: Field = { optional: true, check: list(object({ id: idField, time: { check: (value, path, errors) => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= L.chapterTimeMax ? undefined : fail(errors, path, "must be whole seconds")) }, label: req(L.chapterLabel, true) }), 1, L.chaptersMax).check };
const tableData = (rowsMin: number, rowsMax: number, columnsMin: number, columnsMax: number, cell: number): Field => object({
  columns: list(object({ id: idField, label: str(cell, { line: true }) }), columnsMin, columnsMax),
  rows: list(object({ id: idField, cells: { check: (value, path, errors) => (Array.isArray(value) ? value.forEach((entry, index) => str(cell, { line: true }).check(entry, `${path}[${index}]`, errors)) : fail(errors, path, "must be a list")) } }), rowsMin, rowsMax)
}, true);
const side = object({ label: str(L.comparisonLabel), title: req(L.comparisonTitle, true), body: paragraphs(L.comparisonBody) });

const BLOCK_SCHEMAS: { readonly [K in ArticleBlockType]: Record<string, Field> } = {
  photo: { type: pick(["photo"]), id: idField, media: mediaRef, caption: str(L.caption), altOverride: opt(L.altText, true), placement: pick(["column", "wide", "full"]) },
  gallery: { type: pick(["gallery"]), id: idField, fit: pick(["natural", "crop"]), layout: pick(["grid", "essay", "featured"], true), items: list(object({ id: idField, media: mediaRef, caption: str(L.caption), altOverride: opt(L.altText, true) }), L.galleryMin, L.galleryMax) },
  portraitText: { type: pick(["portraitText"]), id: idField, media: mediaRef, altOverride: opt(L.altText, true), heading: opt(L.portraitHeading, true), body: paragraphs(L.portraitBody), caption: opt(L.caption), side: pick(["left", "right"]) },
  video: { type: pick(["video"]), id: idField, videoId: { check: (value, path, errors) => (typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value) ? undefined : fail(errors, path, "must be a YouTube video id")) }, title: req(L.videoTitle, true), caption: opt(L.caption), chapters: chapterList, transcript: opt(L.videoTranscript) },
  audio: { type: pick(["audio"]), id: idField, media: mediaRef, title: req(L.audioTitle, true), caption: opt(L.caption), transcript: req(L.audioTranscript), chapters: chapterList },
  reportedQuote: { type: pick(["reportedQuote"]), id: idField, text: req(L.quote), attribution: req(L.attribution, true), sourceUrl: webUrl(), sourceLabel: opt(L.quoteSourceLabel, true) },
  pullQuote: { type: pick(["pullQuote"]), id: idField, text: req(L.quote), attribution: opt(L.attribution, true) },
  keyFacts: { type: pick(["keyFacts"]), id: idField, heading: req(L.heading, true), facts: list(object({ id: idField, text: req(L.fact) }), 1, L.factsMax), presentation: pick(["standard", "compact"], true) },
  context: { type: pick(["context"]), id: idField, heading: req(L.heading, true), body: paragraphs(L.contextBody) },
  editorsNote: { type: pick(["editorsNote"]), id: idField, body: paragraphs(L.noteBody) },
  marginNote: { type: pick(["marginNote"]), id: idField, heading: opt(L.heading, true), body: paragraphs(L.noteBody) },
  expandable: { type: pick(["expandable"]), id: idField, heading: req(L.expandableHeading, true), body: paragraphs(L.expandableBody) },
  document: { type: pick(["document"]), id: idField, media: mediaRef, title: opt(L.documentTitle, true), context: opt(L.documentContext), source: opt(L.documentSource, true), pages: list(object({ id: idField, page: positiveInt, label: str(L.documentPageLabel, { line: true }), excerpt: opt(L.documentPageExcerpt) }), 0, L.documentPagesMax) },
  chartMap: {
    type: pick(["chartMap"]),
    id: idField,
    mode: pick(["native", "interactive", "static"]),
    url: { optional: true, check: (value, path, errors) => (typeof value === "string" && visualizationUrl(value)?.src === value ? undefined : fail(errors, path, "must be an allowed provider embed address")) },
    provider: pick(["datawrapper", "flourish", "google-maps", "openstreetmap"], true),
    image: { check: (value, path, errors) => (value === null ? undefined : mediaRef.check(value, path, errors)) },
    altOverride: opt(L.altText, true),
    title: req(L.chartTitle, true),
    dek: opt(L.chartDek),
    summary: req(L.chartSummary),
    source: opt(L.chartSource, true),
    notes: opt(L.chartNotes),
    credit: opt(L.chartCredit, true),
    height: pick(Object.keys(visualizationHeights)),
    chartType: pick(["bar", "line", "dot"], true),
    data: tableData(L.chartRowsMin, L.chartRowsMax, 2, L.chartSeriesMax + 1, L.chartLabel),
    sourceUrl: webUrl()
  },
  dataTable: {
    type: pick(["dataTable"]),
    id: idField,
    title: req(L.tableTitle, true),
    description: opt(L.tableDescription),
    columns: list(object({ id: idField, label: req(L.tableCell, true) }), L.tableColumnsMin, L.tableColumnsMax),
    rows: list(object({ id: idField, cells: { check: (value, path, errors) => (Array.isArray(value) ? value.forEach((cell, index) => str(L.tableCell, { line: true }).check(cell, `${path}[${index}]`, errors)) : fail(errors, path, "must be a list")) } }), 1, L.tableRowsMax),
    presentation: pick(["standard", "comparison"]),
    rowHeaders: bool,
    source: opt(L.tableSource, true),
    notes: opt(L.tableNotes)
  },
  comparison: { type: pick(["comparison"]), id: idField, heading: opt(L.heading, true), left: side, right: side },
  keyNumbers: { type: pick(["keyNumbers"]), id: idField, heading: opt(L.heading, true), source: opt(L.keyNumbersSource, true), items: list(object({ id: idField, value: req(L.keyNumberValue, true), label: req(L.keyNumberLabel, true), context: opt(L.keyNumberContext, true) }), L.keyNumbersMin, L.keyNumbersMax) },
  annotatedImage: { type: pick(["annotatedImage"]), id: idField, media: mediaRef, altOverride: opt(L.altText, true), caption: str(L.caption), placement: pick(["wide", "full"]), markers: list(object({ id: idField, x: percent, y: percent, title: str(L.annotationTitle, { line: true }), body: str(L.annotationBody) }), 1, L.annotationsMax) },
  beforeAfter: { type: pick(["beforeAfter"]), id: idField, before: mediaRef, after: mediaRef, beforeLabel: req(L.comparisonPhotoLabel, true), afterLabel: req(L.comparisonPhotoLabel, true), fit: pick(["cover", "contain"]), caption: str(L.caption), placement: pick(["wide", "full"]) },
  visualChapter: { type: pick(["visualChapter"]), id: idField, media: mediaRef, altOverride: opt(L.altText, true), eyebrow: opt(L.chapterEyebrow, true), heading: req(L.chapterHeading, true), dek: opt(L.chapterDek), placement: pick(["wide", "full"]), align: pick(["bottom-left", "center"]) },
  timeline: {
    type: pick(["timeline"]),
    id: idField,
    items: list(object({
      id: idField,
      label: str(L.timelineLabel, { line: true }),
      title: str(L.timelineTitle, { line: true }),
      body: str(L.timelineBody),
      current: bool,
      image: object({ media: mediaRef, altOverride: opt(L.altText, true), caption: opt(L.caption) }, true),
      link: object({ url: webUrl(false), label: opt(L.timelineLinkLabel, true) }, true),
      document: object({ media: mediaRef, page: optPositiveInt }, true)
    }), L.timelineMin, L.timelineMax)
  },
  relatedCoverage: { type: pick(["relatedCoverage"]), id: idField, heading: req(L.heading, true), stories: list(object({ id: idField, story: mediaRef }), L.relatedMin, L.relatedMax) },
  poll: { type: pick(["poll"]), id: idField, poll: mediaRef },
  repositoryInteractive: { type: pick(["repositoryInteractive"]), id: idField, key: req(L.interactiveKey, true), title: req(L.interactiveTitle, true), description: req(L.interactiveDescription) },
  repositoryTracker: { type: pick(["repositoryTracker"]), id: idField, key: req(L.trackerKey, true), title: req(L.trackerTitle, true), description: req(L.trackerDescription) },
  dataProject: { type: pick(["dataProject"]), id: idField, project: mediaRef, title: req(L.dataProjectTitle, true), description: req(L.dataProjectDescription) },
  event: { type: pick(["event"]), id: idField, event: mediaRef },
  socialPost: { type: pick(["socialPost"]), id: idField, url: req(L.webUrl, true), provider: pick(["instagram", "threads", "facebook", "tiktok", "x", "bluesky"]), postId: req(200, true), caption: opt(L.socialCaption) },
  finalScore: {
    type: pick(["finalScore"]),
    id: idField,
    sport: opt(L.finalScoreSport, true),
    teamA: req(L.finalScoreTeam, true),
    teamAScore: { check: (value, path, errors) => (value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= L.finalScoreMax) ? undefined : fail(errors, path, `must be a score from 0 to ${L.finalScoreMax}, or null`)) },
    teamB: req(L.finalScoreTeam, true),
    teamBScore: { check: (value, path, errors) => (value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= L.finalScoreMax) ? undefined : fail(errors, path, `must be a score from 0 to ${L.finalScoreMax}, or null`)) },
    status: pick(["final", "overtime", "tie", "forfeit"]),
    date: { optional: true, check: (value, path, errors) => (calendarDate(value) ? undefined : fail(errors, path, "must be a date (YYYY-MM-DD)")) },
    location: opt(L.finalScoreLocation, true),
    note: opt(L.finalScoreNote, true)
  }
};

const blockCheck: Check = (value, path, errors) => {
  if (!isRecord(value)) return fail(errors, path, "must be an object");
  const type = value.type;
  if (typeof type !== "string" || !(ARTICLE_BLOCK_TYPES as readonly string[]).includes(type)) return fail(errors, `${path}.type`, `unknown block type "${String(type)}"`);
  closed(BLOCK_SCHEMAS[type as ArticleBlockType])(value, path, errors);
};

const listItem: Check = (value, path, errors) => {
  closed({ children: inlines, list: { optional: true, check: (nested, nestedPath, errs) => listNode(nested, nestedPath, errs) } })(value, path, errors);
};
const listNode: Check = (value, path, errors) => {
  closed({ type: pick(["list"]), ordered: bool, items: { check: (items, itemsPath, errs) => (Array.isArray(items) ? items.forEach((item, index) => listItem(item, `${itemsPath}[${index}]`, errs)) : fail(errs, itemsPath, "must be a list")) } })(value, path, errors);
};

const nodeCheck: Check = (value, path, errors) => {
  if (!isRecord(value)) return fail(errors, path, "must be an object");
  switch (value.type) {
    case "paragraph":
      return closed({ type: pick(["paragraph"]), children: inlines })(value, path, errors);
    case "heading":
      return closed({ type: pick(["heading"]), level: { check: (level, levelPath, errs) => (level === 2 || level === 3 ? undefined : fail(errs, levelPath, "must be 2 or 3")) }, children: inlines })(value, path, errors);
    case "list":
      return listNode(value, path, errors);
    default:
      return blockCheck(value, path, errors);
  }
};

const mediaAsset = closed({
  id: mediaRef,
  kind: pick(["image", "document", "audio", "video", "other"]),
  src: req(2048, true),
  previewSrc: str(2048, { optional: true, min: 1, line: true }),
  width: { check: (value, path, errors) => (value === null || (typeof value === "number" && Number.isFinite(value) && value > 0) ? undefined : fail(errors, path, "must be a size or null")) },
  height: { check: (value, path, errors) => (value === null || (typeof value === "number" && Number.isFinite(value) && value > 0) ? undefined : fail(errors, path, "must be a size or null")) },
  mimeType: str(255, { line: true }),
  filename: str(512, { line: true }),
  filesize: { check: (value, path, errors) => (value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0) ? undefined : fail(errors, path, "must be a size or null")) },
  alt: str(L.altText),
  credit: str(400),
  focalPoint: object({ x: percent, y: percent }, true)
});

const storyReference = closed({ id: mediaRef, headline: req(300, true), href: { check: (value, path, errors) => (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? undefined : fail(errors, path, "must be a site-relative path")) }, section: str(120, { optional: true, min: 1, line: true }), publishedAt: { check: (value, path, errors) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? undefined : fail(errors, path, "must be a date and time")) }, thumbnail: optMediaRef });
const pollReference = closed({
  id: req(64, true),
  question: req(300, true),
  options: list(object({ id: req(64, true), label: req(200, true) }), 2, 12),
  votingOpen: bool,
  results: object({ totalVotes: { check: (value, path, errors) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? undefined : fail(errors, path, "must be a count")) }, votes: { check: (value, path, errors) => (isRecord(value) && Object.values(value).every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0) ? undefined : fail(errors, path, "must map answers to counts")) } }, true)
});

const eventReference = closed({
  id: mediaRef,
  title: req(200, true),
  eventType: str(60, { optional: true, min: 1, line: true }),
  startAt: { check: (value, path, errors) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? undefined : fail(errors, path, "must be a date and time")) },
  endAt: { optional: true, check: (value, path, errors) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? undefined : fail(errors, path, "must be a date and time")) },
  allDay: bool,
  location: str(200, { optional: true, min: 1, line: true }),
  description: str(2000, { optional: true, min: 1 }),
  externalUrl: webUrl(),
  eventStatus: pick(["scheduled", "canceled"])
});

const table = (entry: Check): Field => ({ check: (value, path, errors) => (isRecord(value) ? Object.entries(value).forEach(([key, item]) => entry(item, `${path}.${key}`, errors)) : fail(errors, path, "must be an object")) });

export type ArticleBodyValidation = { ok: true; body: ArticleBody } | { ok: false; errors: string[] };

export function validateArticleBody(value: unknown): ArticleBodyValidation {
  const errors: string[] = [];
  closed({
    format: pick([ARTICLE_BODY_FORMAT]),
    version: { check: (version, path, errs) => (version === ARTICLE_BODY_VERSION ? undefined : fail(errs, path, `must be ${ARTICLE_BODY_VERSION}`)) },
    nodes: { check: (nodes, path, errs) => (Array.isArray(nodes) ? nodes.forEach((node, index) => nodeCheck(node, `${path}[${index}]`, errs)) : fail(errs, path, "must be a list")) },
    media: table(mediaAsset),
    references: object({ stories: { optional: true, check: table(storyReference).check }, polls: { optional: true, check: table(pollReference).check }, events: { optional: true, check: table(eventReference).check } }, true)
  })(value, "body", errors);
  if (errors.length) return { ok: false, errors };

  const body = value as ArticleBody;
  // Cross-checks: ids are unique across blocks, tables agree with their keys, and every named record is in its table.
  const blocks = body.nodes.filter(isArticleBlock);
  const ids = blocks.map((block) => block.id);
  if (new Set(ids).size !== ids.length) errors.push("body.nodes: two blocks share an id");
  for (const [key, asset] of Object.entries(body.media)) if (mediaKey(asset.id) !== key) errors.push(`body.media.${key}: key does not match the asset's id`);
  for (const [key, story] of Object.entries(body.references?.stories ?? {})) if (mediaKey(story.id) !== key) errors.push(`body.references.stories.${key}: key does not match the story's id`);
  for (const [key, poll] of Object.entries(body.references?.polls ?? {})) if (poll.options.map((option) => option.id).length !== new Set(poll.options.map((option) => option.id)).size) errors.push(`body.references.polls.${key}: repeated answer id`);
  for (const block of blocks) for (const id of blockMediaIds(block)) if (!(mediaKey(id) in body.media)) errors.push(`${block.type} ${block.id}: Media ${String(id)} is not in the media table`);
  for (const [key, story] of Object.entries(body.references?.stories ?? {})) if (story.thumbnail !== undefined && !(mediaKey(story.thumbnail) in body.media)) errors.push(`body.references.stories.${key}: thumbnail ${String(story.thumbnail)} is not in the media table`);
  for (const [key, event] of Object.entries(body.references?.events ?? {})) if (mediaKey(event.id) !== key) errors.push(`body.references.events.${key}: key does not match the event's id`);
  for (const id of inlineMediaIds(body.nodes)) if (!(mediaKey(id) in body.media)) errors.push(`source: Media ${String(id)} is not in the media table`);
  for (const block of blocks) {
    if (block.type === "socialPost" && !isCanonicalSocialPost(block.url, block.provider, block.postId)) errors.push(`socialPost ${block.id}: not a canonical supported post address`);
    if (block.type === "finalScore") {
      const problem = finalScoreProblem(block);
      if (problem) errors.push(`finalScore ${block.id}: ${problem}`);
    }
    if (block.type === "chartMap" && block.mode === "native") {
      const problem = block.data && block.chartType ? chartDataProblem(block.data) : "a native chart needs a chart type and data";
      if (problem) errors.push(`chartMap ${block.id}: ${problem}`);
    }
    if (block.type === "chartMap" && block.mode !== "native" && (block.data || block.chartType)) errors.push(`chartMap ${block.id}: only a native chart has data`);
  }
  const missing = missingReferences(body);
  for (const id of missing.stories) errors.push(`related coverage: Story ${String(id)} is not in the reference table`);
  for (const id of missing.polls) errors.push(`poll: Poll ${String(id)} is not in the reference table`);
  for (const id of missing.events) errors.push(`event: Event ${String(id)} is not in the reference table`);
  const sourceIds = sourceRefs(body.nodes).map((ref) => ref.id);
  if (new Set(sourceIds).size !== sourceIds.length) errors.push("body.nodes: two sources share an id");
  const footnoteIds = body.nodes.flatMap((node) => (node.type === "paragraph" || node.type === "heading" ? node.children : node.type === "list" ? node.items.flatMap((item) => item.children) : [])).flatMap((child) => (child.type === "footnote" ? [child.id] : []));
  if (new Set(footnoteIds).size !== footnoteIds.length) errors.push("body.nodes: two footnotes share an id");
  return errors.length ? { ok: false, errors } : { ok: true, body };
}
