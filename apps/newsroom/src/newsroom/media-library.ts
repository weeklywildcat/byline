import {
  mediaKind,
  mediaMetadataGaps,
  MEDIA_FIELD_LIMITS,
  MEDIA_METADATA_FIELDS,
  MEDIA_RECENT_DAYS,
  type MediaAssetDetail,
  type MediaDeliveryState,
  type MediaFolder,
  type MediaFolderRef,
  type MediaLibraryAsset,
  type MediaLibraryPage,
  type MediaLibraryQuery,
  type MediaMetadataPatch,
  type MediaNavigatorData,
  type MediaPersonRef,
  type MediaUsage
} from "@byline/newsroom-screens/media/media-library-model";
import type { MediaMoveResult } from "@byline/newsroom-screens/media/media-library-api";
import { sql } from "@payloadcms/db-postgres";
import { APIError, type Where } from "payload";
import { atLeast, relationId, relationIds, sameId } from "../access/user";
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES, LIBRARY_PREVIEW_SIZE, MEDIA_MIME_TYPES } from "../collections/Media";
import { MEDIA_FOLDERS_SLUG } from "../collections/MediaFolders";
import { addDays, localDay, localToInstant } from "../domain/dates";
import { PRODUCTION_TYPE_OPTIONS } from "../domain/vocabulary";
import type { FolderInterface, Media } from "../payload-types";
import { readableStories, type ScreenContext } from "./screen-models";

/**
 * The Byline Media Library over Payload Media (`/api/byline/media/*`).
 *
 * The screens get the neutral contract in
 * `@byline/newsroom-screens/media/media-library-model`, never Payload's Media
 * documents: no storage keys, no internal hashes or renditions, no raw query
 * syntax. Every read and write runs as the signed-in account
 * (`overrideAccess: false`): Media is readable by every newsroom account,
 * editable by editors and by whoever uploaded it, deletable by editors;
 * folders are readable by everyone and managed by editors
 * (`collections/MediaFolders.ts`).
 *
 * Grid previews are the private `library` image size, never the original.
 */

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });
const num = (value: unknown) => Number(relationId(value));

/** A small original may stand in for a missing preview; a camera original never does. */
export const ORIGINAL_AS_PREVIEW_MAX_BYTES = 1_500_000;

const empty = (field: string): Where => ({ or: [{ [field]: { exists: false } }, { [field]: { equals: "" } }] });
const isImage: Where = { mimeType: { in: [...IMAGE_MIME_TYPES] } };

/** The Payload side of `mediaMetadataGaps`: assets with at least one concrete gap. */
export const NEEDS_METADATA: Where = {
  or: [
    { and: [isImage, empty("alt")] },
    { and: [isImage, empty("credit"), empty("creator")] },
    { and: [empty("copyright"), empty("license"), empty("sourceUrl")] }
  ]
};

/* ------------------------------------------------------------- mapping */

type Lookup = { users: Map<string, string>; folders: Map<string, MediaFolder> };

function previewUrl(media: Media): string | null {
  const size = (media.sizes as Record<string, { url?: string | null } | undefined> | undefined)?.[LIBRARY_PREVIEW_SIZE];
  if (size?.url) return size.url;
  if (mediaKind(media.mimeType) === "image" && typeof media.filesize === "number" && media.filesize <= ORIGINAL_AS_PREVIEW_MAX_BYTES) return media.url ?? null;
  return null;
}

function deliveryState(media: Media): MediaDeliveryState {
  const status = media.publicDelivery?.status;
  return status === "queued" || status === "public" || status === "failed" ? status : "private";
}

export function libraryAsset(ctx: ScreenContext, media: Media, lookup: Lookup): MediaLibraryAsset {
  const uploaderId = relationId(media.uploadedBy);
  const folderId = relationId(media.folder);
  const folder = folderId === null ? undefined : lookup.folders.get(String(folderId));
  const editor = atLeast(ctx.user, "editor");
  const text = (value: string | null | undefined) => value ?? "";
  const asset = {
    alt: text(media.alt),
    creator: text(media.creator),
    credit: text(media.credit),
    copyright: text(media.copyright),
    license: text(media.license),
    sourceUrl: text(media.sourceUrl),
    mimeType: media.mimeType ?? ""
  };
  return {
    id: media.id,
    filename: media.filename ?? `File ${media.id}`,
    kind: mediaKind(media.mimeType),
    filesize: media.filesize ?? null,
    width: media.width ?? null,
    height: media.height ?? null,
    previewUrl: previewUrl(media),
    url: media.url ?? null,
    ...asset,
    capturedAt: media.capturedAt ?? null,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    uploadedBy: uploaderId === null ? null : { id: Number(uploaderId), name: lookup.users.get(String(uploaderId)) ?? "Former account" },
    folder: folder ? { id: folder.id, name: folder.name } : null,
    publicDelivery: deliveryState(media),
    gaps: mediaMetadataGaps(asset),
    canUpdate: editor || sameId(uploaderId, ctx.user.id),
    canDelete: editor
  };
}

async function allFolders(ctx: ScreenContext): Promise<MediaFolder[]> {
  const found = await ctx.req.payload.find({ collection: MEDIA_FOLDERS_SLUG, depth: 0, pagination: false, sort: "name", select: { name: true, folder: true }, ...asUser(ctx) });
  const counts = await folderAssetCounts(ctx);
  return (found.docs as FolderInterface[]).map((folder) => ({ id: folder.id, name: folder.name, parentId: relationId(folder.folder) === null ? null : num(folder.folder), assetCount: counts.get(folder.id) ?? 0 }));
}

/**
 * Files per folder in one grouped query. Media is readable by every newsroom
 * account, so a count reveals nothing a Library read would not.
 */
async function folderAssetCounts(ctx: ScreenContext): Promise<Map<number, number>> {
  const db = ctx.req.payload.db as unknown as { drizzle: { execute: (query: unknown) => Promise<{ rows: Array<{ folder_id: number; count: number | string }> }> } };
  const result = await db.drizzle.execute(sql`select folder_id, count(*) as count from media where folder_id is not null group by folder_id`);
  return new Map(result.rows.map((row) => [Number(row.folder_id), Number(row.count)]));
}

async function userNames(ctx: ScreenContext, ids: Array<number | string>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))];
  if (!unique.length) return new Map();
  const found = await ctx.req.payload.find({ collection: "users", where: { id: { in: unique } }, depth: 0, pagination: false, select: { name: true }, ...asUser(ctx) });
  return new Map(found.docs.map((user) => [String(user.id), user.name ?? "Account"]));
}

async function lookupFor(ctx: ScreenContext, media: Media[], folders?: MediaFolder[]): Promise<Lookup> {
  const [users, list] = await Promise.all([
    userNames(ctx, media.map((item) => relationId(item.uploadedBy)).filter((id): id is number | string => id !== null)),
    folders ? Promise.resolve(folders) : allFolders(ctx)
  ]);
  return { users, folders: new Map(list.map((folder) => [String(folder.id), folder])) };
}

/* -------------------------------------------------------------- browse */

const SORTS = { newest: "-createdAt", oldest: "createdAt", name: "filename", captured: "-capturedAt" } as const;

/** The Payload query for one Library page. Folder and Library scope are navigation; the rest are filters. */
export function libraryWhere(ctx: ScreenContext, query: MediaLibraryQuery): Where {
  const and: Where[] = [];
  const search = query.search.trim();
  // A search from a folder looks across all media unless asked to stay in the folder.
  const everywhere = search !== "" && query.folderId !== null && query.searchScope === "all";
  if (query.folderId !== null && !everywhere) and.push({ folder: { equals: query.folderId } });
  if (query.folderId === null) {
    if (query.source === "unfiled") and.push({ folder: { exists: false } });
    if (query.source === "mine") and.push({ uploadedBy: { equals: ctx.user.id } });
    if (query.source === "needs-metadata") and.push(NEEDS_METADATA);
    if (query.source === "recent") and.push({ createdAt: { greater_than_equal: localToInstant(`${addDays(localDay(ctx.now, ctx.timeZone), -MEDIA_RECENT_DAYS)}T00:00`, ctx.timeZone) } });
  }
  if (search) {
    and.push({ or: (["filename", ...MEDIA_METADATA_FIELDS] as const).map((field) => ({ [field]: { like: search } })) });
  }
  if (query.type === "image") and.push(isImage);
  if (query.type === "audio") and.push({ mimeType: { in: [...AUDIO_MIME_TYPES] } });
  if (query.type === "document") and.push({ mimeType: { equals: "application/pdf" } });
  if (query.uploaderId !== null) and.push({ uploadedBy: { equals: query.uploaderId } });
  if (query.needsMetadata) and.push(NEEDS_METADATA);
  if (query.capturedFrom) and.push({ capturedAt: { greater_than_equal: localToInstant(`${query.capturedFrom}T00:00`, ctx.timeZone) } });
  if (query.capturedTo) and.push({ capturedAt: { less_than: localToInstant(`${addDays(query.capturedTo, 1)}T00:00`, ctx.timeZone) } });
  if (query.delivery === "private") and.push({ or: [{ "publicDelivery.status": { equals: "private" } }, { "publicDelivery.status": { exists: false } }] });
  else if (query.delivery) and.push({ "publicDelivery.status": { equals: query.delivery } });
  return and.length ? { and } : {};
}

export async function libraryPage(ctx: ScreenContext, query: MediaLibraryQuery): Promise<MediaLibraryPage> {
  const result = await ctx.req.payload.find({
    collection: "media",
    where: libraryWhere(ctx, query),
    sort: [SORTS[query.sort], "-id"],
    page: query.page,
    limit: query.limit,
    depth: 0,
    ...asUser(ctx)
  });
  const lookup = await lookupFor(ctx, result.docs);
  return {
    assets: result.docs.map((media) => libraryAsset(ctx, media, lookup)),
    page: result.page ?? query.page,
    totalPages: result.totalPages,
    totalDocs: result.totalDocs,
    hasNextPage: result.hasNextPage
  };
}

export async function mediaNavigator(ctx: ScreenContext): Promise<MediaNavigatorData> {
  const recentFrom = localToInstant(`${addDays(localDay(ctx.now, ctx.timeZone), -MEDIA_RECENT_DAYS)}T00:00`, ctx.timeZone);
  const count = (where?: Where) => ctx.req.payload.count({ collection: "media", ...(where ? { where } : {}), ...asUser(ctx) }).then((result) => result.totalDocs);
  const [folders, all, recent, mine, needs, unfiled, uploaders] = await Promise.all([
    allFolders(ctx),
    count(),
    count({ createdAt: { greater_than_equal: recentFrom } }),
    count({ uploadedBy: { equals: ctx.user.id } }),
    count(NEEDS_METADATA),
    count({ folder: { exists: false } }),
    uploaderOptions(ctx)
  ]);
  const editor = atLeast(ctx.user, "editor");
  return {
    folders,
    counts: { all, recent, mine, "needs-metadata": needs, unfiled },
    capabilities: { canUpload: true, canManageFolders: editor, canDelete: editor, acceptedMimeTypes: [...MEDIA_MIME_TYPES], maxUploadBytes: uploadLimit(ctx) },
    uploaders
  };
}

/** Payload's multipart limit (MEDIA_UPLOAD_MAX_BYTES, 50 MB); the upload flow says so before sending a larger file. */
export function uploadLimit(ctx: ScreenContext): number {
  const configured = (ctx.req.payload.config.upload as { limits?: { fileSize?: number } } | undefined)?.limits?.fileSize;
  return typeof configured === "number" && configured > 0 ? configured : 20 * 1024 * 1024;
}

/** People who have uploaded anything, for the Uploader filter. */
async function uploaderOptions(ctx: ScreenContext): Promise<MediaPersonRef[]> {
  const db = ctx.req.payload.db as unknown as { drizzle: { execute: (query: unknown) => Promise<{ rows: Array<{ uploaded_by_id: number }> }> } };
  const result = await db.drizzle.execute(sql`select distinct uploaded_by_id from media where uploaded_by_id is not null`);
  const names = await userNames(ctx, result.rows.map((row) => row.uploaded_by_id));
  return [...names].map(([id, name]) => ({ id: Number(id), name })).sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------- detail */

const TYPE_LABEL = new Map<string, string>(PRODUCTION_TYPE_OPTIONS.map((option) => [option.value, option.label]));

type UsageSearch = { usages: MediaUsage[]; total: number };

/**
 * The records that link to an asset through a relationship, as this account
 * may read them, and how many more exist that it may not. Rich-text uploads
 * are not scanned: the inspector calls these "Linked uses".
 */
export async function linkedUses(ctx: ScreenContext, mediaId: number): Promise<UsageSearch> {
  const { payload } = ctx.req;
  const system = { req: ctx.req, overrideAccess: true as const };
  const [stories, assignments, artwork, resources, live, people, totals] = await Promise.all([
    payload.find({ collection: "stories", where: { featuredMedia: { equals: mediaId } }, draft: true, depth: 0, pagination: false, select: { headline: true }, ...asUser(ctx) }),
    payload.find({ collection: "production-assignments", where: { media: { in: [mediaId] } }, depth: 0, pagination: false, select: { title: true, type: true, story: true }, ...asUser(ctx) }),
    payload.find({ collection: "collections", where: { "publicPresentation.artwork": { equals: mediaId } }, depth: 0, pagination: false, select: { name: true }, ...asUser(ctx) }),
    payload.find({ collection: "collection-resources", where: { media: { equals: mediaId } }, depth: 0, pagination: false, select: { label: true, collections: true }, ...asUser(ctx) }),
    payload.find({ collection: "live-updates", where: { photo: { equals: mediaId } }, depth: 0, pagination: false, select: { headline: true, story: true }, ...asUser(ctx) }),
    payload.find({ collection: "people", where: { portrait: { equals: mediaId } }, depth: 0, pagination: false, select: { name: true }, ...asUser(ctx) }),
    linkedUseTotal(ctx, mediaId, system)
  ]);
  const storyIds = [...new Set([...stories.docs.map((story) => story.id), ...assignments.docs.map((row) => num(row.story)), ...live.docs.map((row) => num(row.story))])];
  const readable = await readableStories(ctx, storyIds, { headline: true });
  const headline = new Map(readable.map((story) => [story.id, story.headline?.trim() || "Untitled story"]));
  const usages: MediaUsage[] = [
    ...stories.docs.filter((story) => headline.has(story.id)).map((story) => ({ kind: "story-featured" as const, title: headline.get(story.id)!, role: "Featured image", storyId: story.id, recordId: story.id })),
    ...assignments.docs.map((row) => ({ kind: "production-assignment" as const, title: headline.get(num(row.story)) ?? row.title, role: `${TYPE_LABEL.get(row.type) ?? "Production"} assignment · ${row.title}`, storyId: headline.has(num(row.story)) ? num(row.story) : null, recordId: row.id })),
    ...artwork.docs.map((row) => ({ kind: "collection-artwork" as const, title: row.name, role: "Collection public artwork", storyId: null, collectionId: row.id, recordId: row.id })),
    ...resources.docs.map((row) => ({ kind: "collection-resource" as const, title: row.label, role: "Collection resource", storyId: null, collectionId: relationIds(row.collections).map(Number)[0] ?? null, recordId: row.id })),
    ...live.docs.map((row) => ({ kind: "live-update-photo" as const, title: row.headline?.trim() || headline.get(num(row.story)) || "Live update", role: "Live update photo", storyId: headline.has(num(row.story)) ? num(row.story) : null, recordId: row.id })),
    ...people.docs.map((row) => ({ kind: "person-portrait" as const, title: row.name, role: "Portrait", storyId: null, recordId: row.id }))
  ];
  return { usages, total: totals };
}

/** Every relationship use, readable or not (for honest counts and for refusing a delete). */
async function linkedUseTotal(ctx: ScreenContext, mediaId: number, system: { req: ScreenContext["req"]; overrideAccess: true }): Promise<number> {
  const { payload } = ctx.req;
  const counts = await Promise.all([
    payload.count({ collection: "stories", where: { featuredMedia: { equals: mediaId } }, ...system }),
    payload.find({ collection: "stories", where: { featuredMedia: { equals: mediaId } }, draft: true, depth: 0, pagination: false, select: { headline: true }, ...system }).then((found) => ({ totalDocs: found.docs.length })),
    payload.count({ collection: "production-assignments", where: { media: { in: [mediaId] } }, ...system }),
    payload.count({ collection: "collections", where: { "publicPresentation.artwork": { equals: mediaId } }, ...system }),
    payload.count({ collection: "collection-resources", where: { media: { equals: mediaId } }, ...system }),
    payload.count({ collection: "live-updates", where: { photo: { equals: mediaId } }, ...system }),
    payload.count({ collection: "people", where: { portrait: { equals: mediaId } }, ...system })
  ]);
  // A story counts once whether its live or draft version links the asset (the larger of the two).
  const [live, draft, ...rest] = counts.map((count) => count.totalDocs);
  return Math.max(live, draft) + rest.reduce((sum, value) => sum + value, 0);
}

export async function mediaDetail(ctx: ScreenContext, id: number): Promise<MediaAssetDetail> {
  const found = await ctx.req.payload.find({ collection: "media", where: { id: { equals: id } }, depth: 0, limit: 1, ...asUser(ctx) });
  const media = found.docs[0];
  if (!media) throw new APIError("That file is no longer in Media.", 404);
  const folders = await allFolders(ctx);
  const [lookup, uses] = await Promise.all([lookupFor(ctx, [media], folders), linkedUses(ctx, id)]);
  const asset = libraryAsset(ctx, media, lookup);
  const path: MediaFolderRef[] = [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<number>();
  let current = asset.folder ? byId.get(asset.folder.id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift({ id: current.id, name: current.name });
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return { ...asset, folderPath: path, usages: uses.usages, usagesComplete: false, hiddenUsageCount: Math.max(0, uses.total - uses.usages.length) };
}

/* ----------------------------------------------------------- mutations */

/** A folder this account can see, or a 400 (never a database error from a dangling id). */
async function existingFolder(ctx: ScreenContext, folderId: number | null): Promise<number | null> {
  if (folderId === null) return null;
  const found = await ctx.req.payload.find({ collection: MEDIA_FOLDERS_SLUG, where: { id: { equals: folderId } }, depth: 0, limit: 1, select: { name: true }, ...asUser(ctx) });
  if (!found.docs[0]) throw new APIError("That folder no longer exists.", 400);
  return folderId;
}

function sourceUrlOrThrow(value: string): string {
  const text = value.trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    // fall through
  }
  throw new APIError("Use a full web address for the source, starting with https://.", 400);
}

/** The newsroom day a picture was made, kept as noon in the newsroom so it never shifts a day. */
function capturedInstant(ctx: ScreenContext, value: string | null): string | null {
  if (value === null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new APIError("Use a captured date like 2026-11-04.", 400);
  return localToInstant(`${value}T12:00`, ctx.timeZone);
}

export async function updateMedia(ctx: ScreenContext, id: number, patch: MediaMetadataPatch): Promise<MediaAssetDetail> {
  const found = await ctx.req.payload.find({ collection: "media", where: { id: { equals: id } }, depth: 0, limit: 1, select: { updatedAt: true }, ...asUser(ctx) });
  const current = found.docs[0];
  if (!current) throw new APIError("That file is no longer in Media.", 404);
  if (typeof patch.expectedUpdatedAt === "string" && patch.expectedUpdatedAt && Date.parse(patch.expectedUpdatedAt) !== Date.parse(current.updatedAt)) {
    throw new APIError("Someone else changed this file's details while you were editing. Reload to see the newer version.", 409);
  }
  const data: Record<string, unknown> = {};
  for (const field of MEDIA_METADATA_FIELDS) {
    const value = patch[field];
    if (value === undefined) continue;
    const text = String(value).trim();
    if (text.length > MEDIA_FIELD_LIMITS[field]) throw new APIError(`Keep that under ${MEDIA_FIELD_LIMITS[field]} characters.`, 400);
    data[field] = field === "sourceUrl" ? sourceUrlOrThrow(text) : text;
  }
  if (patch.capturedAt !== undefined) data.capturedAt = capturedInstant(ctx, patch.capturedAt);
  if (patch.folderId !== undefined) data.folder = await existingFolder(ctx, patch.folderId);
  if (Object.keys(data).length) await ctx.req.payload.update({ collection: "media", id, data, overrideLock: false, ...asUser(ctx) });
  return mediaDetail(ctx, id);
}

export async function moveMedia(ctx: ScreenContext, ids: number[], folderId: number | null): Promise<MediaMoveResult> {
  const folder = await existingFolder(ctx, folderId);
  const result: MediaMoveResult = { moved: [], failed: [] };
  // One at a time, each as this account: a file someone else uploaded stays where it is.
  for (const id of [...new Set(ids)].slice(0, 200)) {
    try {
      await ctx.req.payload.update({ collection: "media", id, data: { folder }, overrideLock: false, ...asUser(ctx) });
      result.moved.push(id);
    } catch (error) {
      const status = (error as { status?: number }).status;
      result.failed.push({ id, message: status === 403 ? "You can only move files you uploaded." : status === 404 ? "That file is no longer in Media." : "That file couldn't be moved." });
    }
  }
  return result;
}

export async function deleteMedia(ctx: ScreenContext, id: number): Promise<void> {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors delete files from Media.", 403);
  const uses = await linkedUseTotal(ctx, id, { req: ctx.req, overrideAccess: true });
  if (uses > 0) throw new APIError(`This file is linked from ${uses} ${uses === 1 ? "place" : "places"}. Unlink it before deleting it.`, 409);
  await ctx.req.payload.delete({ collection: "media", id, overrideLock: false, ...asUser(ctx) });
}

export async function uploadMedia(ctx: ScreenContext, folderId: number | null): Promise<MediaLibraryAsset> {
  const file = ctx.req.file;
  if (!file) throw new APIError("Choose a file to upload.", 400);
  if (!(MEDIA_MIME_TYPES as readonly string[]).includes(String(file.mimetype).toLowerCase())) throw new APIError("Media accepts JPEG, PNG, WebP, AVIF and GIF images, PDFs, and MP3, M4A or WAV audio.", 400);
  const folder = await existingFolder(ctx, folderId);
  // Payload's own upload operation: its MIME check, the private library preview, storage and Media access.
  const created = await ctx.req.payload.create({ collection: "media", data: { folder }, file, ...asUser(ctx) });
  const lookup = await lookupFor(ctx, [created]);
  return libraryAsset(ctx, created, lookup);
}

/* -------------------------------------------------------------- folders */

function folderRecord(folder: FolderInterface, assetCount = 0): MediaFolder {
  return { id: folder.id, name: folder.name, parentId: relationId(folder.folder) === null ? null : num(folder.folder), assetCount };
}

export async function createFolder(ctx: ScreenContext, input: { name?: unknown; parentId?: unknown }): Promise<MediaFolder> {
  const parent = input.parentId === null || input.parentId === undefined || input.parentId === "" ? null : Number(input.parentId);
  const created = await ctx.req.payload.create({ collection: MEDIA_FOLDERS_SLUG, data: { name: String(input.name ?? ""), folder: await existingFolder(ctx, parent) }, ...asUser(ctx) });
  return folderRecord(created as FolderInterface);
}

export async function updateFolder(ctx: ScreenContext, id: number, input: { name?: unknown; parentId?: unknown }): Promise<MediaFolder> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = String(input.name);
  if (input.parentId !== undefined) data.folder = await existingFolder(ctx, input.parentId === null || input.parentId === "" ? null : Number(input.parentId));
  const updated = await ctx.req.payload.update({ collection: MEDIA_FOLDERS_SLUG, id, data, ...asUser(ctx) });
  const counts = await folderAssetCounts(ctx);
  return folderRecord(updated as FolderInterface, counts.get(id) ?? 0);
}

export async function deleteFolder(ctx: ScreenContext, id: number): Promise<void> {
  await ctx.req.payload.delete({ collection: MEDIA_FOLDERS_SLUG, id, ...asUser(ctx) });
}
