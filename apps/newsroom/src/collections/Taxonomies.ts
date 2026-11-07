import { publicURLHooks } from "../public/url-changes";
import type { CollectionConfig } from "payload";
import { administratorsOnly, editorsOnly, signedIn } from "../access/user";
import { legacyIdField, slugField } from "../fields/slug";

/** Sections (News, Sports, Opinion…): the structural home of a story and its URL. WordPress called these categories. */
const urlChanges = publicURLHooks("sections");

export const Sections: CollectionConfig = {
  slug: "sections",
  admin: { useAsTitle: "name", defaultColumns: ["name", "slug", "hidden"], group: false },
  access: { read: signedIn, create: administratorsOnly, update: administratorsOnly, delete: administratorsOnly },
  hooks: { beforeChange: [urlChanges.beforeChange], afterChange: [urlChanges.afterChange] },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 80 },
    slugField("name", "sections"),
    { name: "description", type: "textarea", maxLength: 600 },
    {
      name: "hidden",
      label: "Internal (hidden from the public site)",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Stories only in an internal section never reach the public site." }
    },
    legacyIdField()
  ]
};

/** Topics: flexible subject tags. WordPress called these tags. */
export const Topics: CollectionConfig = {
  slug: "topics",
  admin: { useAsTitle: "name", defaultColumns: ["name", "slug"], group: "Records" },
  access: { read: signedIn, create: signedIn, update: editorsOnly, delete: editorsOnly },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 80 },
    slugField("name", "topics"),
    { name: "description", type: "textarea", maxLength: 600 },
    legacyIdField()
  ]
};
