import { APIError, type CollectionConfig, type FieldAccess } from "payload";
import { validPersonSocialUrl } from "@byline/newsroom-screens/people/people-model";
import { atLeast, editorsOnly, editorsOnlyField, newsroomUser, requestUser, sameId, signedIn } from "../access/user";
import { PERSON_STATUS_OPTIONS } from "../domain/vocabulary";
import { legacyIdField, slugField } from "../fields/slug";
import { lockPersonRow } from "../db/people";

/** Editors manage people; a staff member may edit the public profile of the person their account writes as. */
const editorOrOwnProfile: FieldAccess = ({ req, id }) => {
  const user = requestUser(req);
  return atLeast(user, "editor") || Boolean(user && user.linkedPerson !== null && sameId(user.linkedPerson, id));
};

/**
 * Canonical public contributor identities: the names on bylines, author pages
 * and the staff directory. A current staff writer is User → Person; a guest is
 * a Person alone. People are never deleted by account changes.
 */
export const People: CollectionConfig = {
  slug: "people",
  labels: { singular: "Person", plural: "People" },
  admin: { useAsTitle: "name", defaultColumns: ["name", "newsroomRole", "status", "directoryVisible"], group: false, hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  access: {
    admin: ({ req }) => atLeast(requestUser(req), "administrator"),
    read: signedIn,
    create: editorsOnly,
    update: ({ req }) => {
      const user = requestUser(req);
      if (atLeast(user, "editor")) return true;
      return user?.linkedPerson != null ? { id: { equals: user.linkedPerson } } : false;
    },
    // Bylines reference people forever; retire a person with `status` instead.
    delete: ({ req }) => atLeast(requestUser(req), "administrator")
  },
  hooks: {
    beforeDelete: [async ({ req, id }) => {
      await lockPersonRow(req, id);
      // This is an integrity check, including drafts, trash and historical
      // versions the caller may not read. It never returns their contents.
      const [stories, versions, plans] = await Promise.all([
        req.payload.find({ collection: "stories", where: { contributors: { contains: id } }, trash: true, depth: 0, limit: 1, select: { headline: true }, overrideAccess: true, req }),
        req.payload.findVersions({ collection: "stories", where: { "version.contributors": { contains: id } }, depth: 0, limit: 1, overrideAccess: true, req }),
        req.payload.find({ collection: "story-plans", where: { contributors: { contains: id } }, depth: 0, limit: 1, select: { story: true }, overrideAccess: true, req })
      ]);
      if (stories.totalDocs || versions.totalDocs || plans.totalDocs) throw new APIError("This person is credited on stories. Set their status to Alumni instead; historical bylines must stay intact.", 409);
    }]
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 120, access: { update: editorOrOwnProfile } },
    slugField("name", "people", { access: { update: editorsOnlyField } }),
    { name: "pronouns", type: "text", maxLength: 40, access: { update: editorOrOwnProfile } },
    { name: "newsroomRole", label: "Newsroom role", type: "text", maxLength: 80, admin: { description: "Shown on bylines, e.g. Staff Writer." }, access: { update: editorsOnlyField } },
    { name: "shortBio", type: "textarea", maxLength: 400, access: { update: editorOrOwnProfile } },
    { name: "bio", label: "Public bio", type: "textarea", maxLength: 4000, access: { update: editorOrOwnProfile } },
    { name: "portrait", type: "upload", relationTo: "media", access: { update: editorOrOwnProfile } },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [...PERSON_STATUS_OPTIONS],
      index: true,
      access: { update: editorsOnlyField }
    },
    {
      name: "directoryVisible",
      label: "Show in the staff directory",
      type: "checkbox",
      defaultValue: true,
      access: { update: editorsOnlyField }
    },
    {
      name: "hasProfilePage",
      label: "Has a public profile page",
      type: "checkbox",
      defaultValue: true,
      admin: { description: "Off for one-off guests, who are credited without a page." },
      access: { update: editorsOnlyField }
    },
    { name: "publicEmail", type: "email", admin: { description: "Shown publicly. Leave empty to show none." }, access: { update: editorOrOwnProfile } },
    {
      name: "socials",
      type: "array",
      maxRows: 8,
      access: { update: editorOrOwnProfile },
      fields: [
        { name: "label", type: "text", required: true, maxLength: 40 },
        { name: "url", type: "text", required: true, validate: (value: unknown) => (validPersonSocialUrl(value) ? true : "Use an https:// link.") }
      ]
    },
    {
      name: "accounts",
      type: "join",
      collection: "users",
      on: "linkedPerson",
      admin: { description: "Accounts that write as this person." },
      access: { read: editorsOnlyField }
    },
    legacyIdField(),
    legacyIdField("legacyGuestId", "WordPress guest ID")
  ]
};
