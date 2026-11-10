import { activityFor } from "../newsroom/story-activity";
import { APIError, type CollectionConfig, type FieldAccess } from "payload";
import { inIds, scopeManages, storyScope } from "../access/story-context";
import { atLeast, editorsOnlyField, newsroomUser, requestUser } from "../access/user";
import { dateOnly, TimingError } from "../domain/schedule";
import { notifyAfterPlanChange } from "../newsroom/notification-hooks";
import { COVERAGE_STATE_OPTIONS, LIVE_MODE_OPTIONS } from "../domain/live-coverage";
import { LIMITS, RESOURCE_PURPOSE_OPTIONS, WORKFLOW_OPTIONS } from "../domain/vocabulary";

const systemOnly: FieldAccess = ({ req }) => req.context?.bylineSystem === true || req.context?.bylineImport === true;

const managersField: FieldAccess = async ({ req, doc }) => scopeManages(await storyScope(req), doc?.story);

/** Private links: https/http only, no embedded credentials, no control characters. */
export function validResourceUrl(value: unknown): true | string {
  if (typeof value !== "string" || value.length > 2000 || /[\u0000-\u001f\u007f\s]/.test(value)) return "Paste a web address.";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "Use an http(s) link.";
    if (url.username || url.password) return "Links cannot contain a username or password.";
    return true;
  } catch {
    return "Paste a web address.";
  }
}

/**
 * A story's newsroom plan: workflow stage, assigned editor, deadline, planned
 * publication, private brief and links. One per story, created with it.
 *
 * It is deliberately not versioned with the article: a workflow change is an
 * editorial decision that applies immediately, autosave never touches it, and a
 * version restore never brings back old planning. Nothing here is public.
 *
 * Field rules port docs/newsroom-os.md: anyone who manages the story
 * moves its workflow and edits the brief and links; only editors assign the
 * editor or set the deadline and planned publication.
 */
export const StoryPlans: CollectionConfig = {
  slug: "story-plans",
  labels: { singular: "Story plan", plural: "Story plans" },
  admin: { useAsTitle: "id", group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  access: {
    read: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return scope.all ? true : inIds("story", [...scope.managed, ...scope.participant]);
    },
    // Plans are created with their story.
    create: ({ req }) => req.context?.bylineSystem === true || req.context?.bylineImport === true,
    update: async ({ req }) => {
      const scope = await storyScope(req);
      if (!scope) return false;
      return scope.all ? true : inIds("story", scope.managed);
    },
    delete: ({ req }) => atLeast(requestUser(req), "administrator")
  },
  hooks: {
    afterChange: [activityFor("plan"), notifyAfterPlanChange],
    beforeValidate: [
      ({ data }) => {
        if (data && data.deadline !== undefined) {
          try {
            data.deadline = dateOnly(data.deadline) || null;
          } catch (error) {
            throw new APIError(error instanceof TimingError ? error.message : "Use a date like 2026-11-12.", 400);
          }
        }
        return data;
      }
    ]
  },
  fields: [
    // Routing remembers the last public address even while the Story is offline.
    { name: "lastPublicPath", type: "text", hidden: true, access: { create: () => false, update: () => false } },
    { name: "story", type: "relationship", relationTo: "stories", required: true, unique: true, index: true, access: { update: () => false } },
    {
      name: "workflow",
      type: "select",
      required: true,
      defaultValue: "pitch",
      index: true,
      options: [...WORKFLOW_OPTIONS],
      admin: { description: "Never changes on its own. Published is shown from the story's publication state." },
      access: { update: managersField }
    },
    // The stage a Story was in when it was put On Hold or Dropped, so Resume returns it there (newsroom/lifecycle.ts).
    { name: "sidelinedFrom", type: "select", options: [...WORKFLOW_OPTIONS], admin: { readOnly: true }, access: { update: systemOnly, create: systemOnly } },
    { name: "editor", type: "relationship", relationTo: "users", index: true, access: { update: editorsOnlyField, create: systemOnly } },
    {
      name: "deadline",
      type: "text",
      index: true,
      admin: { description: "Internal date (YYYY-MM-DD). It never schedules publication." },
      access: { update: editorsOnlyField }
    },
    { name: "plannedPublication", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } }, access: { update: editorsOnlyField } },
    { name: "brief", type: "textarea", maxLength: LIMITS.brief, access: { update: managersField } },
    {
      name: "resources",
      label: "Files & links",
      type: "array",
      maxRows: LIMITS.resourcesPerStory,
      access: { update: managersField },
      fields: [
        { name: "label", type: "text", required: true, maxLength: LIMITS.line },
        { name: "url", type: "text", required: true, validate: validResourceUrl },
        { name: "purpose", type: "select", defaultValue: "other", options: [...RESOURCE_PURPOSE_OPTIONS] }
      ]
    },
    {
      name: "contributors",
      type: "relationship",
      relationTo: "people",
      hasMany: true,
      index: true,
      admin: { readOnly: true, description: "Copied from the story's latest save; used for access." },
      access: { update: systemOnly, create: systemOnly }
    },
    { name: "createdBy", type: "relationship", relationTo: "users", index: true, admin: { readOnly: true }, access: { update: systemOnly, create: systemOnly } },
    // The New Story template it was created from, for Distribution policy (docs/distribution.md#policy).
    { name: "preset", type: "text", maxLength: 60, admin: { readOnly: true }, access: { update: systemOnly, create: systemOnly } },
    // When the configured Distribution was created (first publication): seeding happens once.
    { name: "distributionSeededAt", type: "date", admin: { readOnly: true }, access: { update: systemOnly, create: systemOnly } },
    {
      // "May publish live updates" (access/live-context.ts): this Story's live updates only. Editors control it.
      name: "livePublishers",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
      maxRows: 12,
      index: true,
      admin: { description: "May publish live updates on this story (only live updates; never the article)." },
      access: { update: editorsOnlyField, create: systemOnly }
    },
    {
      // Live coverage's operational state (domain/live-coverage.ts). Unversioned on purpose: going live must
      // never publish unpublished article copy, and a version restore must never rewind coverage. Only the
      // live-coverage domain (newsroom/live-state.ts), after its own editor check, writes these.
      name: "liveCoverage",
      type: "group",
      admin: { description: "Story mode and coverage state. Live is a mode of this story, not a second story." },
      fields: [
        { name: "mode", type: "select", defaultValue: "standard", options: [...LIVE_MODE_OPTIONS], access: { update: systemOnly, create: systemOnly } },
        { name: "state", type: "select", defaultValue: "off", options: [...COVERAGE_STATE_OPTIONS], access: { update: systemOnly, create: systemOnly } },
        { name: "startedAt", type: "date", access: { update: systemOnly, create: systemOnly }, admin: { readOnly: true } },
        { name: "endedAt", type: "date", access: { update: systemOnly, create: systemOnly }, admin: { readOnly: true } }
      ]
    }
  ]
};
