import { protectStoryMedia } from "../newsroom/story-media-uses";
import { artDirectionIntentsEqual, normalizeArtDirectionIntent, type ImageDimensions } from "@byline/core";
import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type CollectionBeforeOperationHook, type CollectionConfig, type PayloadRequest } from "payload";
import { atLeast, requestUser, signedIn } from "../access/user";
import { legacyIdField } from "../fields/slug";
import { privateMediaDir } from "../publication-media/paths";
import { queueOrRecordFailure } from "../publication-media/queue";

/**
 * Canonical editorial assets. Originals are private: the file route enforces
 * this collection's `read` access, so an upload is never anonymously public
 * just because it exists. Phase 5 prepares web-ready publication assets on
 * the newsroom volume; the static site build copies only referenced files into
 * its Cloudflare asset bundle. `publicationAssets` records readiness for that
 * build, not whether a file is already live.
 *
 * Credits belong to the asset. A story's caption belongs to the story.
 * Byline's crop intent (focal point plus wide, card, standard, square,
 * portrait and social crops) is editorial intent in `artDirection`
 * (`ImageArtDirectionIntent`), never a destructive crop of the original and
 * never generated output. It is written only through the art-direction API
 * (`publication-media/art-direction.ts`), the system or the controlled import.
 * Payload's native focal point is off: in Payload it re-processes the upload
 * synchronously, and publication processing belongs to the media job.
 *
 * Publication: `publicationRevision` counts changes to what the prepared
 * files are made from (the source file, the focal point, a custom crop) and
 * nothing else. Each such change invalidates the prepared generation in the
 * same write and queues `prepare-publication-media` (docs/publication-media.md).
 *
 * Folders are Payload's native folders (`MediaFolders.ts`): logical
 * organization only, so filing or moving an asset never changes its file URL
 * or moves or renames its source file on disk.
 *
 * The one image size, `library`, is the newsroom's private browsing preview
 * (at most 640px, WebP), so the Media Library grid never downloads camera
 * originals. It is served by the same file route as the original, under this
 * collection's `read` access, and it is not a publication rendition: it is
 * never part of `publicationAssets`.
 */
/** What the newsroom may upload. Video is deliberately absent until large-video storage is decided. */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "application/pdf", "audio/mpeg", "audio/mp4", "audio/wav"] as const;
export const IMAGE_MIME_TYPES = MEDIA_MIME_TYPES.filter((type) => type.startsWith("image/"));
export const AUDIO_MIME_TYPES = MEDIA_MIME_TYPES.filter((type) => type.startsWith("audio/"));

/**
 * The largest file one upload may carry. Payload's multipart default is
 * 20 MB, below a typical camera original; 50 MB covers full-resolution
 * JPEGs from the newsroom's cameras. Applied as Payload's own upload limit
 * (payload.config.ts), so the server refuses anything larger with a 413.
 */
export const MEDIA_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export const LIBRARY_PREVIEW_SIZE = "library";
export const LIBRARY_PREVIEW_MAX = 640;

/** Set only by the system (media jobs) or the controlled import, never by a person's request. */
const systemOnly = ({ req }: { req: { context?: Record<string, unknown> } }) => req.context?.bylineSystem === true || req.context?.bylineImport === true;
/** Art direction is also written by the dedicated art-direction API (which checks Media update access itself). */
const artDirectionWriter = ({ req }: { req: { context?: Record<string, unknown> } }) => systemOnly({ req }) || req.context?.bylineArtDirection === true;

/** Prepared-file internals (hashes, the manifest): administrators and system reads only. */
const internalsReader = ({ req }: { req: PayloadRequest }) => systemOnly({ req }) || atLeast(requestUser(req), "administrator");

type MediaData = Record<string, unknown> & { publicationAssets?: Record<string, unknown> | null };

const dimensionsOf = (doc: Record<string, unknown> | undefined): ImageDimensions | null =>
  typeof doc?.width === "number" && typeof doc?.height === "number" && doc.width > 0 && doc.height > 0 ? { width: doc.width, height: doc.height } : null;

/** A new file arrived in this write (Payload sets `req.file` for uploads and replacements). */
function sourceReplaced(data: MediaData, originalDoc: Record<string, unknown> | undefined, req: PayloadRequest) {
  if (req.file) return true;
  return Boolean(originalDoc) && ["filename", "filesize", "width", "height", "mimeType"].some((key) => data[key] !== undefined && data[key] !== originalDoc?.[key]);
}

/**
 * Keeps `artDirection` canonical intent and moves `publicationRevision` only
 * when the publication bytes can change. A bump marks the generation
 * preparing in this same write, so no moment claims the old files are current.
 */
const trackPublicationRevision: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  const media = data as MediaData;
  const dimensions = dimensionsOf({ ...originalDoc, ...media });
  const incoming = media.artDirection !== undefined ? media.artDirection : originalDoc?.artDirection;
  const intent = normalizeArtDirectionIntent(incoming, dimensions);
  media.artDirection = intent;
  let bump = operation === "create";
  if (operation === "update") {
    const previous = normalizeArtDirectionIntent(originalDoc?.artDirection, dimensionsOf(originalDoc));
    bump = sourceReplaced(media, originalDoc, req) || !artDirectionIntentsEqual(previous, intent);
  }
  const current = typeof originalDoc?.publicationRevision === "number" ? originalDoc.publicationRevision : 0;
  if (!bump) {
    // A person's write never moves these (field access already refuses them; this keeps the recorded values).
    if (!systemOnly({ req })) {
      media.publicationRevision = current;
      if (originalDoc?.publicationAssets) media.publicationAssets = originalDoc.publicationAssets;
    }
    return media;
  }
  media.publicationRevision = current + 1;
  const previousAssets = (originalDoc?.publicationAssets ?? {}) as Record<string, unknown>;
  media.publicationAssets = {
    ...previousAssets,
    status: "preparing",
    queuedAt: new Date().toISOString(),
    startedAt: null,
    failureCode: null,
    failureMessage: null
  };
  return media;
};

/**
 * Payload keeps its native focal columns because Media has image sizes, and
 * re-processes the upload synchronously when a request changes them. Byline's
 * focal point is `artDirection`, so native focal and crop edits are dropped
 * before Payload's upload handling sees them.
 */
const stripNativeFocalEdits: CollectionBeforeOperationHook = ({ args, operation }) => {
  if (operation !== "create" && operation !== "update" && operation !== "updateByID") return args;
  // The multipart limit is shared with private reporting files (larger); Media keeps its own.
  const size = (args.req?.file as { size?: number } | undefined)?.size;
  if (typeof size === "number" && size >= MEDIA_UPLOAD_MAX_BYTES) throw new APIError("That file is too large to upload.", 413);
  const data = args.data as Record<string, unknown> | undefined;
  if (data) {
    delete data.focalX;
    delete data.focalY;
  }
  const query = args.req?.query as Record<string, unknown> | undefined;
  if (query && "uploadEdits" in query) delete query.uploadEdits;
  return args;
};

/** Queues preparation for a new revision. A system write (the job itself) never queues another. */
const queuePreparation: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (req.context?.bylineMediaPreparation === true) return doc;
  const revision = typeof doc.publicationRevision === "number" ? doc.publicationRevision : null;
  if (revision === null) return doc;
  if (operation === "update" && previousDoc?.publicationRevision === revision) return doc;
  await queueOrRecordFailure(req.payload, { mediaId: doc.id as number, revision }, req);
  return doc;
};

export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Media", plural: "Media" },
  admin: { useAsTitle: "filename", defaultColumns: ["filename", "alt", "credit", "updatedAt"], group: false },
  upload: {
    // Resolved the same way by the web process and the Jobs worker (publication-media/paths.ts).
    staticDir: privateMediaDir(),
    mimeTypes: [...MEDIA_MIME_TYPES],
    // Byline's focal point lives in `artDirection`; Payload's would reprocess the upload synchronously.
    focalPoint: false,
    crop: false,
    // Public renditions are produced off the request by the media jobs (Phase 5). The one size made on
    // upload is the private browsing preview: small, fast to make, never published.
    imageSizes: [
      {
        name: LIBRARY_PREVIEW_SIZE,
        width: LIBRARY_PREVIEW_MAX,
        height: LIBRARY_PREVIEW_MAX,
        fit: "inside",
        withoutEnlargement: true,
        formatOptions: { format: "webp", options: { quality: 72 } }
      }
    ],
    // Never the original: Payload's own lists would otherwise load full-size camera files.
    adminThumbnail: LIBRARY_PREVIEW_SIZE
  },
  folders: true,
  access: {
    read: signedIn,
    create: signedIn,
    update: ({ req }) => {
      const user = requestUser(req);
      if (!user) return false;
      return atLeast(user, "editor") ? true : { uploadedBy: { equals: user.id } };
    },
    delete: ({ req }) => atLeast(requestUser(req), "editor")
  },
  hooks: {
    beforeDelete: [protectStoryMedia],
    beforeOperation: [stripNativeFocalEdits],
    beforeChange: [
      ({ data, operation, req }) => {
        // The uploader is whoever uploads, never a value from the request (only the import keeps WordPress's).
        if (operation === "create" && !(req.context?.bylineImport === true && data.uploadedBy)) data.uploadedBy = requestUser(req)?.id ?? null;
        return data;
      },
      trackPublicationRevision
    ],
    afterChange: [queuePreparation]
  },
  fields: [
    { name: "alt", label: "Alt text", type: "textarea", maxLength: 600, admin: { description: "What a reader who cannot see the image needs to know." } },
    {
      type: "row",
      fields: [
        { name: "creator", type: "text", maxLength: 160, admin: { description: "Photographer or artist." } },
        { name: "credit", type: "text", maxLength: 200, admin: { description: "As printed, e.g. Jane Doe / The Weekly Wildcat." } }
      ]
    },
    {
      type: "row",
      fields: [
        { name: "copyright", type: "text", maxLength: 200 },
        { name: "license", type: "text", maxLength: 200 }
      ]
    },
    { name: "sourceUrl", label: "Source URL", type: "text", maxLength: 2000 },
    { name: "capturedAt", type: "date" },
    // Editorial intent only (`ImageArtDirectionIntent`): no URLs, no renditions.
    { name: "artDirection", type: "json", admin: { hidden: true }, access: { create: artDirectionWriter, update: artDirectionWriter } },
    // What the prepared files are made from has changed this many times (source, focal point, custom crops).
    { name: "publicationRevision", type: "number", admin: { hidden: true }, access: { create: systemOnly, update: systemOnly } },
    {
      name: "publicationAssets",
      type: "group",
      admin: { readOnly: true, position: "sidebar" },
      // Prepared-asset state belongs to the publication pipeline: an upload or metadata edit never marks a file ready.
      // Whether a generation is current is `publicationMediaReadiness` (@byline/content), never `status` alone.
      access: { create: systemOnly, update: systemOnly },
      fields: [
        { name: "status", type: "select", defaultValue: "not-prepared", options: [{ value: "not-prepared", label: "Not prepared" }, { value: "preparing", label: "Preparing" }, { value: "ready", label: "Ready" }, { value: "failed", label: "Failed" }] },
        { name: "preparedRevision", type: "number", admin: { hidden: true } },
        { name: "recipeVersion", type: "number", admin: { hidden: true } },
        // Machine internals: only administrators and the system read them. Byline's screens get a summary (publication-media/media-publication.ts).
        { name: "sourceHash", type: "text", admin: { hidden: true }, access: { read: internalsReader } },
        { name: "manifest", type: "json", admin: { hidden: true }, access: { read: internalsReader } },
        { name: "preparedAt", type: "date" },
        { name: "queuedAt", type: "date", admin: { hidden: true } },
        { name: "startedAt", type: "date", admin: { hidden: true } },
        { name: "attempts", type: "number", admin: { hidden: true } },
        { name: "failureCode", type: "text", admin: { hidden: true } },
        { name: "failureMessage", type: "text", admin: { hidden: true } }
      ]
    },
    { name: "uploadedBy", type: "relationship", relationTo: "users", index: true, admin: { readOnly: true, position: "sidebar" }, access: { update: systemOnly } },
    // Capture provenance (docs/field-mode.md#media-provenance): where a photo was taken for, set by the capture
    // endpoint from what Byline already knew. Private: never part of the public Media projection.
    {
      name: "capture",
      type: "group",
      admin: { readOnly: true, position: "sidebar" },
      access: { create: systemOnly, update: systemOnly },
      fields: [
        { name: "story", type: "relationship", relationTo: "stories", index: true },
        { name: "assignment", type: "relationship", relationTo: "production-assignments", index: true },
        { name: "originalHash", type: "text", index: true },
        // The Field outbox's idempotency key: a retried upload finds this asset instead of making a second.
        { name: "clientKey", type: "text", unique: true, index: true }
      ]
    },
    legacyIdField()
  ]
};
