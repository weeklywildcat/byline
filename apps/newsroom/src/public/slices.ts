import type { PayloadRequest } from "payload";
import type { PublicSlice } from "./revision";

/**
 * What each record contributes to the public projection, as an explicit
 * allowlist read from the record's MAIN row (docs/payload-build-snapshots.md
 * #public-mutation-coverage). A change outside the slice (a brief, the team,
 * interviews, tasks, workflow, uploader, folder, preparation state…) is not a
 * public change and never advances the public revision.
 *
 * The slices are deliberately a little wider than the projection where
 * narrowing would need brittle queries: e.g. a Media metadata edit counts
 * even when no published content references the asset.
 */

type Row = Record<string, unknown>;

const pick = (row: Row, fields: readonly string[]) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
const isPublished = (row: Row) => row._status === "published" && !row.deletedAt;
const relationId = (value: unknown): number | string | null => (value && typeof value === "object" ? ((value as Row).id as number | string) ?? null : (value as number | string | null) ?? null);

/** Every Story field the native snapshot (and its listings, archives, feeds and SEO) can read. */
export const STORY_PUBLIC_FIELDS = [
  "headline", "deck", "kicker", "section", "topics", "contributors", "featuredMedia", "featuredCaption",
  "contentFormat", "body", "legacyHtml", "format", "video", "presentation", "immersiveAlignment",
  "reportingNote", "liveCoverage", "slug", "publishedAt", "updatedAt"
] as const;

export const storyPublicSlice: PublicSlice = (row) => (isPublished(row) ? pick(row, STORY_PUBLIC_FIELDS) : null);

export const PAGE_PUBLIC_FIELDS = ["title", "slug", "parent", "summary", "body", "noindex", "publishedAt", "updatedAt"] as const;
export const pagePublicSlice: PublicSlice = (row) => (isPublished(row) ? pick(row, PAGE_PUBLIC_FIELDS) : null);

export const EVENT_PUBLIC_FIELDS = ["title", "slug", "eventType", "startAt", "endAt", "allDay", "location", "description", "externalUrl", "eventStatus"] as const;
export const eventPublicSlice: PublicSlice = (row) => (isPublished(row) ? pick(row, EVENT_PUBLIC_FIELDS) : null);

/** People reach bylines, author/guest profiles and the directory. Account linkage never does. */
export const PERSON_PUBLIC_FIELDS = ["name", "slug", "pronouns", "newsroomRole", "shortBio", "bio", "status", "portrait", "directoryVisible", "hasProfilePage", "publicEmail", "socials"] as const;
export const personPublicSlice: PublicSlice = (row) => pick(row, PERSON_PUBLIC_FIELDS);

export const sectionPublicSlice: PublicSlice = (row) => pick(row, ["name", "slug", "description", "hidden"]);
export const topicPublicSlice: PublicSlice = (row) => pick(row, ["name", "slug", "description"]);

/** A Collection reaches the public site only through its enabled public presentation. */
export const collectionPublicSlice: PublicSlice = (row) => {
  const presentation = (row.publicPresentation ?? {}) as Row;
  if (presentation.enabled !== true || !presentation.slug) return null;
  return { status: row.status ?? null, startDate: row.startDate ?? null, endDate: row.endDate ?? null, stories: row.stories ?? null, publicPresentation: presentation };
};

/**
 * A correction is public while its story is published. Read from the story's
 * main row in the same transaction. Conservative by design: any change to a
 * correction on a published story counts.
 */
export const correctionPublicSlice: PublicSlice = async (row, req: PayloadRequest) => {
  const storyId = relationId(row.story);
  if (storyId === null) return null;
  const story = (await req.payload.db.findOne({ collection: "stories", where: { id: { equals: storyId } }, req })) as Row | null;
  if (!story || !isPublished(story)) return null;
  return pick(row, ["story", "type", "text", "date", "publishedAt"]);
};

/**
 * Media fields a public attachment can show or that change its prepared
 * bytes. Deliberate over-invalidation: an edit counts whether or not any
 * published content references the asset (deciding that would mean querying
 * Lexical JSON). Organizational and machine fields (folder, uploader,
 * preparation status, manifests, timestamps) are never part of it; a
 * successful preparation re-queues the snapshot without a new revision.
 */
export const MEDIA_PUBLIC_FIELDS = ["filename", "mimeType", "filesize", "width", "height", "alt", "creator", "credit", "copyright", "license", "artDirection"] as const;
export const mediaPublicSlice: PublicSlice = (row) => pick(row, MEDIA_PUBLIC_FIELDS);

/** The published Publication Global, minus bookkeeping. A draft is never public. */
export const publicationGlobalSlice: PublicSlice = (row) => {
  if (row._status !== "published") return null;
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, globalType: _globalType, _status, ...fields } = row;
  return fields;
};

export const pollPublicSlice: PublicSlice = (row) => row.status === "open" || row.status === "closed"
  ? pick(row, ["pollKey", "question", "options", "status", "opensAt", "closesAt"]) : null;

export const liveUpdatePublicSlice: PublicSlice = async (row, req) => {
  if (row.state !== "published") return null;
  const storyId = relationId(row.story);
  if (storyId === null) return null;
  const story = await req.payload.db.findOne({ collection: "stories", where: { id: { equals: storyId } }, req }) as Row | null;
  if (!story || !isPublished(story)) return null;
  return pick(row, ["story", "headline", "body", "photo", "publishedAt", "pinned", "updatedAt"]);
};
