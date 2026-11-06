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
 */
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Media", plural: "Media" },
  admin: { useAsTitle: "filename", defaultColumns: ["filename", "alt", "credit", "updatedAt"], group: false },
  upload: {
    staticDir: process.env.BYLINE_MEDIA_LOCAL_DIR ?? "media",
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "application/pdf", "audio/mpeg", "audio/mp4", "audio/wav"],
    focalPoint: true,
    crop: false,
    // Renditions are produced off the request by the media jobs (Phase 5), not synchronously on upload.
    imageSizes: [],
    adminThumbnail: ({ doc }) => (typeof doc.url === "string" ? doc.url : null)
  },
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
        if (operation === "create" && !data.uploadedBy) data.uploadedBy = requestUser(req)?.id ?? null;
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
      fields: [
        { name: "status", type: "select", defaultValue: "private", options: [{ value: "private", label: "Private" }, { value: "queued", label: "Queued" }, { value: "public", label: "Public" }, { value: "failed", label: "Failed" }] },
        { name: "contentHash", type: "text", admin: { hidden: true } },
        { name: "renditions", type: "json", admin: { hidden: true } },
        { name: "materializedAt", type: "date" }
      ]
    },
    { name: "uploadedBy", type: "relationship", relationTo: "users", admin: { readOnly: true, position: "sidebar" } },
    legacyIdField()
  ]
};
