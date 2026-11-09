import type { Access, CollectionConfig, GlobalConfig } from "payload";
import { inIds, storyScope } from "../access/story-context";
import { administratorsOnly, atLeast, editorsOnly, newsroomUser, nobody, requestUser } from "../access/user";
import { DESTINATION_KINDS, DESTINATIONS } from "../distribution/destinations";
import { defaultDistributionSettings, DISTRIBUTION_LEVELS, DISTRIBUTION_STATES, stateLabel } from "../distribution/model";
import { STORY_PRESETS } from "../domain/presets";

/**
 * Who may read Distribution work: editors see all of it; everyone else sees
 * the work on Stories they manage or hold assigned work on, and any item
 * they own. Writes go only through `/api/byline/distribution/*` (as the
 * system, after `distribution/server.ts` checks the person), so the REST API
 * offers nothing to create, change or delete.
 */
export const readDistribution: Access = async ({ req }) => {
  const user = requestUser(req);
  if (!user) return false;
  if (atLeast(user, "editor")) return true;
  const scope = await storyScope(req);
  const stories = scope && !scope.all ? [...scope.managed, ...scope.participant] : [];
  return { or: [inIds("story", stories), { owner: { equals: user.id } }] };
};

const options = (values: readonly string[], label: (value: string) => string) => values.map((value) => ({ value, label: label(value) }));
const kindOptions = options(DESTINATION_KINDS, (kind) => DESTINATIONS[kind as keyof typeof DESTINATIONS].label);

/**
 * Distribution items (docs/distribution.md): one Story's work for one
 * destination. Private newsroom workflow, never public and never in a
 * projection. Pending slots reference the Story (`*Mode: story`) instead of
 * copying it; `sent` is the append-only record of what actually went out.
 */
export const DistributionItems: CollectionConfig = {
  slug: "distribution-items",
  labels: { singular: "Distribution item", plural: "Distribution items" },
  admin: { group: "System", useAsTitle: "destination", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  lockDocuments: false,
  // One item per Story and destination: seeding and "Add" can never duplicate.
  indexes: [{ fields: ["story", "destination"], unique: true }],
  access: { read: readDistribution, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: "story", type: "relationship", relationTo: "stories", required: true, index: true },
    { name: "destination", type: "select", required: true, index: true, options: kindOptions },
    { name: "expectation", type: "select", required: true, defaultValue: "prepare", options: options(DISTRIBUTION_LEVELS, (level) => level[0].toUpperCase() + level.slice(1)) },
    { name: "state", type: "select", required: true, defaultValue: "planned", index: true, options: options(DISTRIBUTION_STATES, (state) => stateLabel(state as never)) },
    { name: "owner", type: "relationship", relationTo: "users", index: true },
    { name: "headlineMode", type: "select", required: true, defaultValue: "story", options: ["story", "custom"] },
    { name: "headline", type: "text", maxLength: 300 },
    { name: "textMode", type: "select", required: true, defaultValue: "story", options: ["story", "custom"] },
    { name: "text", type: "textarea", maxLength: 5000 },
    { name: "mediaMode", type: "select", required: true, defaultValue: "story", options: ["story", "custom", "none"] },
    { name: "media", type: "upload", relationTo: "media" },
    { name: "plannedFor", type: "date", index: true },
    { name: "scheduledFor", type: "date", index: true },
    { name: "note", type: "textarea", maxLength: 2000 },
    { name: "permalink", type: "text", maxLength: 2048 },
    { name: "postedAt", type: "date", index: true },
    { name: "postedBy", type: "relationship", relationTo: "users" },
    { name: "approvedAt", type: "date" },
    { name: "approvedBy", type: "relationship", relationTo: "users" },
    // Append-only: SentSnapshot[] (distribution/model.ts).
    { name: "sent", type: "json" },
    { name: "failure", type: "text", maxLength: 400 },
    { name: "failedAt", type: "date" },
    { name: "createdBy", type: "relationship", relationTo: "users" }
  ]
};

const starter = defaultDistributionSettings();

function httpsOrEmpty(value: unknown): true | string {
  if (value === null || value === undefined || value === "") return true;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password ? true : "Use an https:// address.";
  } catch {
    return "Use an https:// address.";
  }
}

/**
 * Which destinations this publication uses and the policy that seeds them
 * (docs/distribution.md#policy). Private: never in the Publication Global
 * or a public projection. Administrators edit it; until it is first saved
 * the starter configuration applies (its defaults here).
 */
export const DistributionSettings: GlobalConfig = {
  slug: "distribution-settings",
  label: "Distribution settings",
  admin: { group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  access: { read: editorsOnly, update: administratorsOnly },
  hooks: { beforeChange: [({ data }) => ({ ...data, customized: true })] },
  fields: [
    { name: "customized", type: "checkbox", defaultValue: false, admin: { hidden: true } },
    {
      name: "destinations", type: "array", labels: { singular: "Destination", plural: "Destinations" },
      defaultValue: Object.values(starter.destinations).map(({ kind, enabled, requiresApproval }) => ({ kind, enabled, requiresApproval })),
      validate: (rows: unknown) => {
        const kinds = (Array.isArray(rows) ? rows : []).map((row) => (row as { kind?: unknown }).kind);
        return new Set(kinds).size === kinds.length ? true : "List each destination once.";
      },
      fields: [
        { type: "row", fields: [
          { name: "kind", type: "select", required: true, options: kindOptions },
          { name: "enabled", type: "checkbox", defaultValue: true },
          { name: "requiresApproval", label: "Staff need an editor's approval", type: "checkbox", defaultValue: false }
        ] },
        { name: "label", type: "text", maxLength: 60, admin: { description: "Shown to staff instead of the destination's name (for example “Morning announcements”)." } },
        { name: "accountUrl", label: "Account address", type: "text", maxLength: 500, validate: httpsOrEmpty, admin: { description: "Where “Open …” goes: the publication's profile or page." } }
      ]
    },
    {
      name: "rules", type: "array", labels: { singular: "Policy rule", plural: "Policy rules" },
      admin: { description: "For each destination the first matching rule applies. Prepare: Byline creates the work when a Story is first published. Eligible: created, not urgent. Optional: suggested on the Story only. An empty template or section list matches every Story." },
      defaultValue: starter.rules.map(({ destination, level }) => ({ destination, level })),
      fields: [
        { type: "row", fields: [
          { name: "destination", type: "select", required: true, options: kindOptions },
          { name: "level", type: "select", required: true, defaultValue: "prepare", options: options(DISTRIBUTION_LEVELS, (level) => level[0].toUpperCase() + level.slice(1)) }
        ] },
        { name: "presets", label: "Story templates", type: "select", hasMany: true, options: STORY_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })) },
        { name: "sections", type: "relationship", relationTo: "sections", hasMany: true }
      ]
    }
  ]
};
