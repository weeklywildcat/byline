import type { CollectionConfig } from "payload";
import { nobody } from "../access/user";

/**
 * What YouTube says about a video: title, thumbnail, duration, upload date.
 *
 * The facts belong to the video, not to a Story version, so a background job
 * can fill them in without creating a Story version or touching its draft.
 * Rows are system-only (read with `overrideAccess` by the snapshot and the
 * Live Preview builder); nothing here is private, but nothing needs staff
 * access either. See `newsroom/video-facts.ts`.
 */
export const VideoFacts: CollectionConfig = {
  slug: "video-facts",
  admin: { hidden: true },
  lockDocuments: false,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: "videoId", type: "text", required: true, unique: true, index: true },
    { name: "status", type: "select", required: true, defaultValue: "found", options: ["found", "unavailable"] },
    { name: "data", type: "json" },
    { name: "fetchedAt", type: "date", required: true },
    { name: "attempts", type: "number", defaultValue: 0 }
  ]
};
