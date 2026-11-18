import { APIError, type Access, type CollectionConfig, type Where } from "payload";
import { normalizeDefinition } from "./definition";
import { lockPollMediaReferences } from "./media-usage";
import { atLeast, editorsOnly, newsroomUser, nobody, requestUser, signedIn } from "../access/user";

/**
 * Wildcat Polls' management records (docs/wildcat-polls.md#data-model).
 *
 * Definitions and fieldwork metadata are Payload documents with explicit
 * access; respondents' answers are never documents (they live in
 * `byline_poll_responses`, src/polls/db.ts). None of these collections is in
 * the public projection or public change tracking (`public/tracking.ts`), so
 * nothing here can advance the public revision or start a site build.
 *
 * Every screen goes through `/api/byline/polls/*`, which re-checks the account
 * per survey (src/polls/access.ts). The REST access below is the floor for
 * anyone calling Payload's API directly.
 */

export const POLL_SURVEYS = "poll-surveys";
export const POLL_VERSIONS = "poll-versions";
export const POLL_LOCATIONS = "poll-locations";

export const SURVEY_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" }
] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number]["value"];

/** Editors read every survey; staff only the ones granted to them. */
const surveyRead: Access = ({ req }) => {
  const user = requestUser(req);
  if (!user) return false;
  if (atLeast(user, "editor")) return true;
  const where: Where = { or: [{ openToAllStaff: { equals: true } }, { interviewers: { in: [user.id] } }, { analysts: { in: [user.id] } }] };
  return where;
};

const versionRead: Access = ({ req }) => {
  const user = requestUser(req);
  if (!user) return false;
  if (atLeast(user, "editor")) return true;
  const where: Where = { or: [{ "survey.openToAllStaff": { equals: true } }, { "survey.interviewers": { in: [user.id] } }, { "survey.analysts": { in: [user.id] } }] };
  return where;
};

const hiddenFromStaff = ({ user }: { user: unknown }) => !atLeast(newsroomUser(user), "administrator");

export const PollSurveys: CollectionConfig = {
  slug: POLL_SURVEYS,
  labels: { singular: "Poll", plural: "Polls" },
  admin: { useAsTitle: "title", group: "Polls", hidden: hiddenFromStaff, defaultColumns: ["title", "status", "updatedAt"] },
  lockDocuments: false,
  access: { read: surveyRead, create: editorsOnly, update: editorsOnly, delete: ({ req }) => atLeast(requestUser(req), "administrator") },
  hooks: {
    beforeChange: [async ({ data, req }) => {
      if (data.draft != null) {
        const definition = normalizeDefinition(data.draft);
        await lockPollMediaReferences(req, definition);
        data.draft = definition;
      }
      return data;
    }]
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 200 },
    { name: "description", type: "textarea", maxLength: 2000 },
    { name: "status", type: "select", required: true, defaultValue: "draft", index: true, options: [...SURVEY_STATUSES] },
    { name: "owner", type: "relationship", relationTo: "users", index: true },
    { name: "currentVersion", type: "relationship", relationTo: POLL_VERSIONS, admin: { description: "The published version new respondents answer." } },
    { name: "draft", type: "json", admin: { description: "The working definition. Publishing copies it into a new, immutable version." } },
    { name: "draftRevision", type: "number", defaultValue: 0, admin: { readOnly: true } },
    { name: "draftSource", type: "text", maxLength: 300, admin: { description: "The workbook the draft was last imported from." } },
    { name: "openToAllStaff", type: "checkbox", defaultValue: false, admin: { description: "Any staff member may run fieldwork for this poll." } },
    { name: "interviewers", type: "relationship", relationTo: "users", hasMany: true, index: true, admin: { description: "Staff who may run fieldwork for this poll." } },
    { name: "analysts", type: "relationship", relationTo: "users", hasMany: true, index: true, admin: { description: "Staff who may read this poll's results." } },
    { name: "kioskEnabled", type: "checkbox", defaultValue: true },
    {
      name: "publicLink", type: "group", fields: [
        { name: "enabled", type: "checkbox", defaultValue: false },
        { name: "key", type: "text", unique: true, index: true, maxLength: 40 },
        { name: "opensAt", type: "date" },
        { name: "closesAt", type: "date" },
        { name: "accessCodeHash", type: "text", maxLength: 200, admin: { hidden: true } },
        { name: "hourlyLimit", type: "number", defaultValue: 300, min: 10, max: 5000 }
      ]
    },
    { name: "linkedStory", type: "relationship", relationTo: "stories" },
    { name: "linkedCollection", type: "relationship", relationTo: "collections" },
    { name: "methodology", type: "textarea", maxLength: 4000 },
    { name: "minimumGroup", type: "number", defaultValue: 5, min: 3, max: 50, required: true }
  ]
};

/**
 * Published definitions. A version is written once, by Publish, and never
 * changed: every response keeps the exact questions its respondent saw.
 */
export const PollVersions: CollectionConfig = {
  slug: POLL_VERSIONS,
  labels: { singular: "Poll version", plural: "Poll versions" },
  admin: { useAsTitle: "label", group: "Polls", hidden: hiddenFromStaff },
  lockDocuments: false,
  access: { read: versionRead, create: nobody, update: nobody, delete: nobody },
  hooks: {
    beforeOperation: [({ operation, args }) => {
      if (operation === "update" || operation === "updateByID") throw new APIError("A published poll version cannot be changed. Publish a new version instead.", 409);
      return args;
    }]
  },
  fields: [
    { name: "survey", type: "relationship", relationTo: POLL_SURVEYS, required: true, index: true },
    { name: "number", type: "number", required: true, min: 1 },
    { name: "label", type: "text", maxLength: 240 },
    { name: "definition", type: "json", required: true },
    { name: "mediaManifest", type: "json", admin: { hidden: true }, access: { read: () => false } },
    { name: "sourceFilename", type: "text", maxLength: 300 },
    { name: "sourceSha256", type: "text", maxLength: 64 },
    { name: "note", type: "text", maxLength: 500 },
    { name: "publishedBy", type: "relationship", relationTo: "users" },
    { name: "publishedAt", type: "date", required: true },
    { name: "questionCount", type: "number" }
  ],
  indexes: [{ fields: ["survey", "number"], unique: true }]
};

/** Places fieldwork happens (Cafeteria, Library…). Editors keep the list. */
export const PollLocations: CollectionConfig = {
  slug: POLL_LOCATIONS,
  labels: { singular: "Polling location", plural: "Polling locations" },
  admin: { useAsTitle: "name", group: "Polls", hidden: hiddenFromStaff },
  lockDocuments: false,
  access: { read: signedIn, create: editorsOnly, update: editorsOnly, delete: editorsOnly },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 120, unique: true },
    { name: "notes", type: "text", maxLength: 300 },
    { name: "active", type: "checkbox", defaultValue: true, index: true }
  ]
};
