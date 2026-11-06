import type { CollectionConfig } from "payload";
import { atLeast, requestUser, signedIn } from "../access/user";
import { legacyIdField } from "../fields/slug";

/**
 * Canonical editorial assets. Originals are private: the file route enforces
 * this collection's `read` access, so an upload is never anonymously public
 * just because it exists. Publishing a story materializes the approved
 * renditions into the public bucket (Phase 5); `publicDelivery` records that.
 *
 * Credits belong to the asset. A story's caption belongs to the story.
 * Byline's crop intent (wide, card, standard, square, portrait, social) is
 * metadata in `artDirection`, never a destructive crop of the original.
 *
 * Folders are Payload's native folders (`MediaFolders.ts`): logical
 * organization only, so filing or moving an asset never changes its file URL
 * or moves its object in storage.
 *
 * The one image size, `library`, is the newsroom's private browsing preview
 * (at most 640px, WebP), so the Media Library grid never downloads camera
 * originals. It is served by the same file route as the original, under this
 * collection's `read` access, and it is not a publication rendition: it is
 * never part of `publicDelivery`.
 */
/** What the newsroom may upload. Video is deliberately absent until large-video storage is decided. */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "application/pdf", "audio/mpeg", "audio/mp4", "audio/wav"] as const;
export const IMAGE_MIME_TYPES = MEDIA_MIME_TYPES.filter((type) => type.startsWith("image/"));
export const AUDIO_MIME_TYPES = MEDIA_MIME_TYPES.filter((type) => type.startsWith("audio/"));

export const LIBRARY_PREVIEW_SIZE = "library";
export const LIBRARY_PREVIEW_MAX = 640;

/** Set only by the system (Phase 5 media jobs) or the controlled import, never by a person's request. */
const systemOnly = ({ req }: { req: { context?: Record<string, unknown> } }) => req.context?.bylineSystem === true || req.context?.bylineImport === true;

export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Media", plural: "Media" },
  admin: { useAsTitle: "filename", defaultColumns: ["filename", "alt", "credit", "updatedAt"], group: false },
  upload: {
    staticDir: process.env.BYLINE_MEDIA_LOCAL_DIR ?? "media",
    mimeTypes: [...MEDIA_MIME_TYPES],
    focalPoint: true,
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
    beforeChange: [
      ({ data, operation, req }) => {
        // The uploader is whoever uploads, never a value from the request (only the import keeps WordPress's).
        if (operation === "create" && !(req.context?.bylineImport === true && data.uploadedBy)) data.uploadedBy = requestUser(req)?.id ?? null;
        return data;
      }
    ]
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
    { name: "artDirection", type: "json", admin: { hidden: true } },
    {
      name: "publicDelivery",
      type: "group",
      admin: { readOnly: true, position: "sidebar" },
      // Publication state belongs to the publication pipeline: an upload or a metadata edit never changes it.
      access: { create: systemOnly, update: systemOnly },
      fields: [
        { name: "status", type: "select", defaultValue: "private", options: [{ value: "private", label: "Private" }, { value: "queued", label: "Queued" }, { value: "public", label: "Public" }, { value: "failed", label: "Failed" }] },
        { name: "contentHash", type: "text", admin: { hidden: true } },
        { name: "renditions", type: "json", admin: { hidden: true } },
        { name: "materializedAt", type: "date" }
      ]
    },
    { name: "uploadedBy", type: "relationship", relationTo: "users", index: true, admin: { readOnly: true, position: "sidebar" }, access: { update: systemOnly } },
    legacyIdField()
  ]
};
