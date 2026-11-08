import type { CollectionConfig } from "payload";
import { nobody } from "../access/user";

/** Private scan progress, per-story findings and editorial dispositions. */
export const ContentHealth: CollectionConfig = {
  slug: "content-health",
  admin: { hidden: true },
  lockDocuments: false,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: "key", type: "text", unique: true, required: true },
    { name: "kind", type: "select", index: true, required: true, options: ["scan", "story", "disposition"] },
    { name: "data", type: "json", required: true }
  ]
};
