import { APIError, type CollectionBeforeChangeHook, type CollectionConfig, type Field } from "payload";
import {
  createStoryRecords,
  deleteStoryRecords,
  guardAssignedWork,
  limitPerStory,
  managersOnlyField,
  readStoryRecords,
  updateStoryRecords
} from "../access/workspace-records";
import { atLeast, newsroomUser, relationId, sameId } from "../access/user";
import { normalizeAppointmentTiming, TimingError } from "../domain/schedule";
import {
  APPOINTMENT_KIND_OPTIONS,
  APPOINTMENT_STATUS_OPTIONS,
  LIMITS,
  PRODUCTION_STATUS_OPTIONS,
  PRODUCTION_TYPE_OPTIONS,
  SCHEDULE_MODE_OPTIONS,
  SOURCE_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS
} from "../domain/vocabulary";

/**
 * The Story Workspace's records: separate objects that all point at one story
 * (docs/story-workspace.md). Each has its own owner, deadline and status
 * vocabulary; none of them is the story's workflow or publication state, and
 * none is ever public.
 */

const storyField: Field = {
  name: "story",
  type: "relationship",
  relationTo: "stories",
  required: true,
  index: true,
  access: { update: () => false }
};

const assigneesField: Field = {
  name: "assignees",
  type: "relationship",
  relationTo: "users",
  hasMany: true,
  maxRows: LIMITS.assignees,
  index: true
};

const shared = {
  admin: { group: "System", hidden: ({ user }: { user: unknown }) => !atLeast(newsroomUser(user), "administrator") },
  access: {
    read: readStoryRecords,
    update: updateStoryRecords,
    delete: deleteStoryRecords
  }
} as const;

export const Tasks: CollectionConfig = {
  slug: "tasks",
  ...shared,
  admin: { ...shared.admin, useAsTitle: "title", defaultColumns: ["title", "story", "due", "state"] },
  access: { ...shared.access, create: createStoryRecords({ allowParticipants: false }) },
  hooks: { beforeChange: [guardAssignedWork] },
  fields: [
    storyField,
    { name: "title", type: "text", required: true, maxLength: LIMITS.line },
    assigneesField,
    { name: "due", type: "date", index: true, admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "priority", type: "select", defaultValue: "normal", options: [...TASK_PRIORITY_OPTIONS] },
    { name: "state", type: "select", defaultValue: "open", index: true, options: [{ value: "open", label: "Open" }, { value: "completed", label: "Completed" }] },
    { name: "completedAt", type: "date", admin: { readOnly: true } }
  ]
};

/**
 * Story-scoped reporting targets, not a CRM: `label` need not be a real name
 * ("Name TBD"), and there are deliberately no phone, email or address fields.
 */
export const Sources: CollectionConfig = {
  slug: "sources",
  ...shared,
  admin: { ...shared.admin, useAsTitle: "label", defaultColumns: ["label", "story", "status"] },
  access: { ...shared.access, create: createStoryRecords({ allowParticipants: false }) },
  hooks: {
    beforeChange: [guardAssignedWork, limitPerStory("sources", LIMITS.sourcesPerStory, "sources")],
    afterDelete: [
      // Removing a source unlinks its appointments and deletes nothing else.
      async ({ doc, req }) => {
        await req.payload.update({
          collection: "appointments",
          where: { source: { equals: doc.id } },
          data: { source: null },
          overrideAccess: true,
          context: { bylineSystem: true },
          req
        });
      }
    ]
  },
  fields: [
    storyField,
    { name: "label", type: "text", required: true, maxLength: LIMITS.line },
    { name: "role", type: "text", maxLength: LIMITS.line },
    { name: "organization", type: "text", maxLength: LIMITS.line },
    { name: "status", type: "select", defaultValue: "planned", index: true, options: [...SOURCE_STATUS_OPTIONS] },
    assigneesField,
    { name: "notes", label: "Private notes", type: "textarea", maxLength: LIMITS.notes }
  ]
};

/** The mode decides which timing fields survive; a window stays date-only and never becomes a timestamp. */
const normalizeTiming: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const merged = { ...originalDoc, ...data };
  try {
    Object.assign(data, normalizeAppointmentTiming(merged));
  } catch (error) {
    throw new APIError(error instanceof TimingError ? error.message : "Check the appointment time.", 400);
  }
  const source = relationId(data.source);
  if (source !== null && !sameId(source, originalDoc?.source)) {
    const found = await req.payload.find({ collection: "sources", where: { id: { equals: source } }, depth: 0, limit: 1, overrideAccess: true, req });
    if (!sameId(found.docs[0]?.story, merged.story)) throw new APIError("That source is not on this story.", 400);
  }
  if (data.status === "completed" && !originalDoc?.completedAt) data.completedAt = new Date().toISOString();
  return data;
};

export const Appointments: CollectionConfig = {
  slug: "appointments",
  ...shared,
  admin: { ...shared.admin, useAsTitle: "title", defaultColumns: ["title", "story", "scheduleMode", "startAt", "status"] },
  // Participants who hold only assigned work may create appointments for themselves.
  access: { ...shared.access, create: createStoryRecords({ allowParticipants: true }) },
  hooks: { beforeChange: [guardAssignedWork, normalizeTiming, limitPerStory("appointments", LIMITS.appointmentsPerStory, "appointments")] },
  fields: [
    storyField,
    { name: "title", type: "text", required: true, maxLength: LIMITS.line },
    { name: "source", type: "relationship", relationTo: "sources", index: true },
    { name: "kind", type: "select", required: true, defaultValue: "other", options: [...APPOINTMENT_KIND_OPTIONS] },
    { name: "status", type: "select", required: true, defaultValue: "planned", index: true, options: [...APPOINTMENT_STATUS_OPTIONS] },
    { name: "scheduleMode", type: "select", required: true, defaultValue: "unscheduled", options: [...SCHEDULE_MODE_OPTIONS] },
    { name: "startAt", type: "date", index: true, admin: { date: { pickerAppearance: "dayAndTime" }, condition: (data) => data?.scheduleMode === "exact" } },
    { name: "endAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" }, condition: (data) => data?.scheduleMode === "exact" } },
    { name: "windowStart", type: "text", index: true, admin: { description: "First day (YYYY-MM-DD).", condition: (data) => data?.scheduleMode === "window" } },
    { name: "windowEnd", type: "text", admin: { description: "Last day (YYYY-MM-DD), optional.", condition: (data) => data?.scheduleMode === "window" } },
    { name: "location", type: "text", maxLength: LIMITS.line },
    assigneesField,
    { name: "notes", label: "Private notes", type: "textarea", maxLength: LIMITS.notes },
    { name: "completedAt", type: "date", admin: { readOnly: true } }
  ]
};

/**
 * Photo, gallery, graphic, video and audio work. A participant holding the
 * assignment updates its status, notes and files but not what was asked for,
 * by whom, or when.
 */
export const ProductionAssignments: CollectionConfig = {
  slug: "production-assignments",
  labels: { singular: "Production assignment", plural: "Production assignments" },
  ...shared,
  admin: { ...shared.admin, useAsTitle: "title", defaultColumns: ["title", "type", "story", "deadline", "status"] },
  access: { ...shared.access, create: createStoryRecords({ allowParticipants: false }) },
  hooks: { beforeChange: [guardAssignedWork, limitPerStory("production-assignments", LIMITS.productionPerStory, "production assignments")] },
  fields: [
    storyField,
    { name: "type", type: "select", required: true, defaultValue: "photo", options: [...PRODUCTION_TYPE_OPTIONS], access: { update: managersOnlyField } },
    { name: "title", type: "text", required: true, maxLength: LIMITS.line, access: { update: managersOnlyField } },
    { ...assigneesField, access: { update: managersOnlyField } } as Field,
    { name: "deadline", type: "date", index: true, admin: { date: { pickerAppearance: "dayAndTime" } }, access: { update: managersOnlyField } },
    { name: "status", type: "select", required: true, defaultValue: "needed", index: true, options: [...PRODUCTION_STATUS_OPTIONS] },
    { name: "notes", type: "textarea", maxLength: LIMITS.notes },
    { name: "media", type: "upload", relationTo: "media", hasMany: true, maxRows: 60 },
    legacyAssignmentId()
  ]
};

/** `legacy-v1` for the single WordPress visual request materialized on import, else the WordPress UUID. */
function legacyAssignmentId(): Field {
  return {
    name: "legacyAssignmentId",
    type: "text",
    index: true,
    admin: { readOnly: true, hidden: true },
    access: { update: () => false, create: ({ req }) => req.context?.bylineImport === true }
  };
}
