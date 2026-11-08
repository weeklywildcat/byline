import type { CollectionConfig } from "payload";
import { nobody, requestUser } from "../access/user";
import { NOTIFICATION_KINDS } from "../domain/notifications";

/**
 * A person's notifications: their inbox, and the record of what was emailed.
 *
 * Private to the recipient. Rows are written only by the newsroom itself
 * (`newsroom/notifications.ts`, as the system) and marked read through
 * `/api/byline/notifications/read`; nobody creates, edits or deletes one
 * through the REST API. A row holds stable references and a short detail, never
 * copied story text. Never public: not in any projection.
 */
export const Notifications: CollectionConfig = {
  slug: "notifications",
  labels: { singular: "Notification", plural: "Notifications" },
  admin: { hidden: true },
  lockDocuments: false,
  access: {
    read: ({ req }) => {
      const user = requestUser(req);
      return user ? { recipient: { equals: user.id } } : false;
    },
    create: nobody,
    update: nobody,
    delete: nobody
  },
  fields: [
    { name: "recipient", type: "relationship", relationTo: "users", required: true, index: true },
    { name: "kind", type: "select", required: true, options: [...NOTIFICATION_KINDS] },
    { name: "story", type: "relationship", relationTo: "stories", index: true },
    { name: "actor", type: "relationship", relationTo: "users" },
    { name: "detail", type: "text", maxLength: 200 },
    { name: "data", type: "json" },
    { name: "dedupeKey", type: "text", unique: true, index: true },
    { name: "inbox", type: "checkbox", defaultValue: true, admin: { description: "Shown in the recipient's Byline inbox." } },
    { name: "readAt", type: "date", index: true },
    { name: "emailState", type: "select", defaultValue: "none", options: ["none", "pending", "sent", "failed", "skipped"] }
  ]
};
