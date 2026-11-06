import { APIError, type CollectionConfig } from "payload";
import { editorsOnly, signedIn } from "../access/user";
import { legacyIdField } from "../fields/slug";

const KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Poll definitions. `pollKey` and each answer's `optionId` are the public,
 * stable identifiers that cookies (`ww_poll_voted_<pollId>`) and vote rows use;
 * they never change once set. Votes are not documents: they live in the
 * dedicated `byline_poll_votes` table (src/db/poll-votes.ts), which no admin
 * screen or REST/GraphQL route exposes.
 */
export const Polls: CollectionConfig = {
  slug: "polls",
  admin: { useAsTitle: "question", defaultColumns: ["question", "status", "opensAt", "closesAt"], group: false },
  access: { read: signedIn, create: editorsOnly, update: editorsOnly, delete: editorsOnly },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (originalDoc?.pollKey && data.pollKey !== undefined && data.pollKey !== originalDoc.pollKey) {
          throw new APIError("A poll's ID cannot change after it is created.", 400);
        }
        const seen = new Set<string>();
        for (const option of (data.options ?? []) as Array<{ optionId?: string }>) {
          if (!option.optionId || !KEY.test(option.optionId)) throw new APIError("Each answer needs an ID of lowercase letters, numbers and hyphens.", 400);
          if (seen.has(option.optionId)) throw new APIError("Two answers share an ID.", 400);
          seen.add(option.optionId);
        }
        return data;
      }
    ]
  },
  fields: [
    { name: "question", type: "text", required: true, maxLength: 300 },
    {
      name: "pollKey",
      label: "Poll ID",
      type: "text",
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) => (typeof value === "string" && KEY.test(value) ? true : "Use lowercase letters, numbers and hyphens."),
      admin: { description: "Public and permanent: browsers remember votes by it." }
    },
    {
      name: "options",
      label: "Answers",
      type: "array",
      minRows: 2,
      maxRows: 12,
      required: true,
      fields: [
        { name: "optionId", label: "Answer ID", type: "text", required: true },
        { name: "label", type: "text", required: true, maxLength: 200 }
      ]
    },
    { name: "status", type: "select", required: true, defaultValue: "draft", index: true, options: [{ value: "draft", label: "Draft" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed" }] },
    { type: "row", fields: [{ name: "opensAt", type: "date" }, { name: "closesAt", type: "date" }] },
    { name: "story", type: "relationship", relationTo: "stories", admin: { description: "Optional story this poll belongs to." } },
    legacyIdField()
  ]
};
