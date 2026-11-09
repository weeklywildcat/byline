import type { CollectionConfig } from "payload";
import { atLeast, editorsOnly, newsroomUser, nobody } from "../access/user";

/**
 * Front Page revisions (docs/front-page.md): atomic, immutable records of
 * editorial placements (slot id → Story id) over the code-owned homepage.
 * Editors think "change the homepage"; this is how that is stored.
 *
 * - `draft`: the one shared set of pending changes;
 * - `scheduled`: a draft waiting for its activation job;
 * - `active`: what the public homepage uses (exactly one, or none: automatic);
 * - `archived`: history, never mutated ("Use this lineup" copies it into a draft).
 *
 * Only `/api/byline/front-page/*` writes here (as the system, after checking
 * the editor), so the REST API offers nothing to create or change. Activation
 * advances the public revision; drafts and schedules never do.
 */
export const FrontPageRevisions: CollectionConfig = {
  slug: "front-page-revisions",
  labels: { singular: "Front Page revision", plural: "Front Page revisions" },
  admin: { group: "System", useAsTitle: "summary", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  lockDocuments: false,
  access: { read: editorsOnly, create: nobody, update: nobody, delete: nobody },
  fields: [
    {
      name: "state", type: "select", required: true, index: true, defaultValue: "draft",
      options: [{ value: "draft", label: "Draft" }, { value: "scheduled", label: "Scheduled" }, { value: "active", label: "Active" }, { value: "archived", label: "Archived" }]
    },
    // { [slotId]: storyId }. Editorial intent only: never layout, fonts, colors or packages.
    { name: "placements", type: "json", required: true },
    { name: "scheduledAt", type: "date", index: true },
    { name: "activatedAt", type: "date", index: true },
    { name: "createdBy", type: "relationship", relationTo: "users" },
    { name: "publishedBy", type: "relationship", relationTo: "users" },
    // Human history: "Changed Lead and In Focus".
    { name: "summary", type: "text", maxLength: 300 },
    { name: "basedOn", type: "relationship", relationTo: "front-page-revisions" },
    { name: "failure", type: "text", maxLength: 400 }
  ]
};
