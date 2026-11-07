import type { CollectionConfig } from "payload";
import { inIds, storyScope } from "../access/story-context";
import { nobody } from "../access/user";

export const StoryNotes: CollectionConfig = {
  slug: "story-notes",
  admin: { hidden: true },
  lockDocuments: false,
  access: {
    read: async ({ req }) => {
      const scope = await storyScope(req);
      return scope ? scope.all ? true : inIds("story", [...scope.managed, ...scope.participant]) : false;
    },
    create: nobody, update: nobody, delete: nobody
  },
  fields: [
    { name: "story", type: "relationship", relationTo: "stories", required: true, index: true },
    { name: "author", type: "relationship", relationTo: "users" },
    { name: "text", type: "textarea", required: true, maxLength: 4000 },
    { name: "resolved", type: "checkbox", defaultValue: false, index: true },
    { name: "replies", type: "array", maxRows: 100, fields: [
      { name: "author", type: "relationship", relationTo: "users" },
      { name: "text", type: "textarea", required: true, maxLength: 4000 },
      { name: "at", type: "date", required: true }
    ] }
  ]
};
