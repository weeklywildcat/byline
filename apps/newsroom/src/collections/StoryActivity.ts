import type { CollectionConfig } from "payload";
import { inIds, storyScope } from "../access/story-context";
import { nobody } from "../access/user";
import { activityActions } from "../newsroom/story-activity";

export const StoryActivity: CollectionConfig = {
  slug: "story-activity",
  admin: { hidden: true },
  lockDocuments: false,
  access: {
    read: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return scope.all ? true : inIds("story", [...scope.managed, ...scope.participant]);
    },
    create: nobody, update: nobody, delete: nobody
  },
  fields: [
    { name: "story", type: "relationship", relationTo: "stories", required: true, index: true },
    { name: "action", type: "select", required: true, options: activityActions },
    { name: "actor", type: "relationship", relationTo: "users" },
    { name: "recordId", type: "number" }
  ]
};
