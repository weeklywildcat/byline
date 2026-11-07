import path from "node:path";
import { normalizeArtDirectionIntent, artDirectionIntentsEqual, parseArtDirectionIntentInput } from "@byline/core";
import { publicationMediaReadiness, validatePublicationMediaManifest } from "@byline/content";
import type { MediaArtDirection } from "@byline/newsroom-screens/media/art-direction-model";
import type { MediaPublicationDetail } from "@byline/newsroom-screens/media/media-library-model";
import { APIError, commitTransaction, initTransaction, killTransaction, type Where } from "payload";
import sharp from "sharp";
import { LIBRARY_PREVIEW_SIZE } from "../collections/Media";
import type { Media } from "../payload-types";
import type { ScreenContext } from "../newsroom/screen-models";
import { privateMediaDir } from "./paths";
import { queueOrRecordFailure } from "./queue";
import { lockMediaRow, markPreparationQueued } from "./state";

/**
 * Media's publication side for people: the inspector's publication detail,
 * the art-direction API (`/api/byline/media/:id/art-direction`) and Retry
 * (`/api/byline/media/:id/publication/retry`). Reads run as the account;
 * writes check the Media collection's own update access (uploader or editor).
 * Nothing here exposes storage paths, hashes or the raw manifest.
 */
const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });

/** The Media collection's own `update` access for this account and asset (never a copy of the rule). */
export async function canUpdateMedia(ctx: ScreenContext, id: number): Promise<boolean> {
  const access = ctx.req.payload.collections.media.config.access.update;
  const result = await access({ req: ctx.req, id });
  if (result === true) return true;
  if (!result) return false;
  const count = await ctx.req.payload.count({ collection: "media", where: { and: [{ id: { equals: id } }, result as Where] }, overrideAccess: true, req: ctx.req });
  return count.totalDocs > 0;
}

export function publicationDetail(media: Pick<Media, "publicationAssets" | "publicationRevision">, canUpdate: boolean): MediaPublicationDetail {
  const assets = media.publicationAssets ?? {};
  const revision = typeof media.publicationRevision === "number" ? media.publicationRevision : 0;
  const readiness = publicationMediaReadiness(assets, revision);
  const state = readiness.ready ? "ready" : readiness.reason === "preparing" || readiness.reason === "failed" ? readiness.reason : "not-prepared";
  const manifest = validatePublicationMediaManifest(assets.manifest);
  const warnings = manifest.ok && manifest.manifest.kind === "image" ? manifest.manifest.warnings.map((warning) => warning.message) : [];
  return {
    state,
    reason: readiness.ready ? "ready" : readiness.reason,
    currentRevision: revision,
    preparedRevision: typeof assets.preparedRevision === "number" ? assets.preparedRevision : null,
    preparedAt: assets.preparedAt ?? null,
    failureMessage: state === "failed" ? assets.failureMessage ?? "Preparation failed." : null,
    warnings: readiness.ready ? warnings : [],
    canRetry: canUpdate && !readiness.ready
  };
}

/**
 * Media records with their publication state read as the system. The
 * manifest and source hash are hidden from people's reads (field access), but
 * Byline's screens need them to summarize readiness; only the summary leaves.
 */
export async function withPublicationState<T extends Pick<Media, "id">>(ctx: ScreenContext, docs: T[]): Promise<Array<T & Pick<Media, "publicationAssets" | "publicationRevision">>> {
  if (!docs.length) return [];
  const found = await ctx.req.payload.find({ collection: "media", where: { id: { in: docs.map((doc) => doc.id) } }, depth: 0, pagination: false, overrideAccess: true, req: ctx.req, select: { publicationAssets: true, publicationRevision: true } });
  const state = new Map(found.docs.map((doc) => [doc.id, doc]));
  return docs.map((doc) => ({ ...doc, publicationAssets: state.get(doc.id)?.publicationAssets ?? undefined, publicationRevision: state.get(doc.id)?.publicationRevision ?? null }));
}

async function findMedia(ctx: ScreenContext, id: number): Promise<Media> {
  const found = await ctx.req.payload.find({ collection: "media", where: { id: { equals: id } }, depth: 0, limit: 1, ...asUser(ctx) });
  const media = found.docs[0];
  if (!media) throw new APIError("That file is no longer in Media.", 404);
  return (await withPublicationState(ctx, [media]))[0] as Media;
}

/** Animated GIF/WebP, from the prepared manifest when it has one, else the original's header. */
async function isAnimated(media: Media): Promise<boolean> {
  const manifest = validatePublicationMediaManifest(media.publicationAssets?.manifest);
  if (manifest.ok && manifest.manifest.kind === "image") return manifest.manifest.source.animated;
  if (media.mimeType !== "image/gif" && media.mimeType !== "image/webp") return false;
  if (!media.filename) return false;
  try {
    const meta = await sharp(path.join(privateMediaDir(), path.basename(media.filename))).metadata();
    return (meta.pages ?? 1) > 1;
  } catch {
    return false;
  }
}

function imageDimensions(media: Media) {
  if (!media.mimeType?.startsWith("image/") || !media.width || !media.height) throw new APIError("Art direction is for photos and graphics.", 400);
  return { width: media.width, height: media.height };
}

export async function artDirectionView(ctx: ScreenContext, id: number): Promise<MediaArtDirection> {
  const media = await findMedia(ctx, id);
  const dimensions = imageDimensions(media);
  const canUpdate = await canUpdateMedia(ctx, id);
  const sizes = media.sizes as Record<string, { url?: string | null } | undefined> | undefined;
  return {
    mediaId: media.id,
    filename: media.filename ?? `File ${media.id}`,
    alt: media.alt ?? "",
    ...dimensions,
    imageUrl: media.url ?? "",
    previewUrl: sizes?.[LIBRARY_PREVIEW_SIZE]?.url ?? null,
    animated: await isAnimated(media),
    intent: normalizeArtDirectionIntent(media.artDirection, dimensions),
    updatedAt: media.updatedAt,
    canUpdate,
    publication: publicationDetail(media, canUpdate)
  };
}

/**
 * Saves a focal point and custom crops. Validated and canonicalized here
 * (known shapes, finite 0–100 focal point, crops inside the photo and of
 * their shape, automatic-equivalent crops dropped) and compared-and-swapped
 * under a row lock, so two editors never silently overwrite each other's crop
 * work. A change bumps the publication revision and queues preparation in the
 * same transaction (collections/Media.ts).
 */
export async function saveArtDirection(ctx: ScreenContext, id: number, input: Record<string, unknown>): Promise<MediaArtDirection> {
  if (typeof input.expectedUpdatedAt !== "string" || !input.expectedUpdatedAt) throw new APIError("Reload this photo before saving its crops.", 400);
  const started = await initTransaction(ctx.req);
  try {
    await lockMediaRow(ctx.req, id);
    const media = await findMedia(ctx, id);
    if (!(await canUpdateMedia(ctx, id))) throw new APIError("Only the person who uploaded this file, or an editor, can change its crops.", 403);
    if (Date.parse(media.updatedAt) !== Date.parse(input.expectedUpdatedAt)) throw new APIError("Someone else changed this photo while you were editing. Reload to see their version.", 409);
    const dimensions = imageDimensions(media);
    const parsed = parseArtDirectionIntentInput({ focalPoint: input.focalPoint, crops: input.crops }, dimensions);
    if (!parsed.ok) throw new APIError(parsed.error, 400);
    if (Object.keys(parsed.intent.crops).length && (await isAnimated(media))) throw new APIError("Animations keep their whole frame: set a focal point, not custom crops.", 400);
    const current = normalizeArtDirectionIntent(media.artDirection, dimensions);
    if (!artDirectionIntentsEqual(current, parsed.intent)) {
      await ctx.req.payload.update({ collection: "media", id, data: { artDirection: parsed.intent }, context: { bylineArtDirection: true }, overrideLock: false, ...asUser(ctx) });
    }
    if (started) await commitTransaction(ctx.req);
  } catch (error) {
    if (started) await killTransaction(ctx.req);
    throw error;
  }
  return artDirectionView(ctx, id);
}

/** Queues preparation again for the asset's current revision, as the system, after checking this account's Media permission. */
export async function retryPublication(ctx: ScreenContext, id: number): Promise<void> {
  const media = await findMedia(ctx, id);
  if (!(await canUpdateMedia(ctx, id))) throw new APIError("Only the person who uploaded this file, or an editor, can retry it.", 403);
  const revision = typeof media.publicationRevision === "number" ? media.publicationRevision : null;
  if (revision === null) throw new APIError("This file has no publication revision yet.", 409);
  if (publicationMediaReadiness(media.publicationAssets, revision).ready) return;
  await markPreparationQueued(ctx.req.payload, id, revision);
  await queueOrRecordFailure(ctx.req.payload, { mediaId: id, revision });
}
