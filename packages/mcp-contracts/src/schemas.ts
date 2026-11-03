import { z } from "zod";
export const id = z.number().int().positive();
export const uuid = z.string().uuid();
export const recordId = z.union([uuid, z.literal("legacy-v1")]);
export const version = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Read the object and use its current version.");
export const date = z.iso.date();
export const instant = z.iso
  .datetime({ offset: true })
  .describe(
    "Explicit ISO 8601 time with Z or UTC offset. Use the WordPress site timezone to resolve local times.",
  );
export const clearTime = z.union([instant, z.literal("")]);
export const text = (max: number) => z.string().max(max);
export const title = text(240).trim().min(1);
export const workflow = z.enum([
  "pitch",
  "assigned",
  "reporting",
  "writing",
  "editing",
  "ready",
  "on-hold",
  "dropped",
]);
export const productionType = z.enum([
  "photo",
  "gallery",
  "graphic",
  "video",
  "audio",
  "other",
]);
export const productionStatus = z.enum([
  "needed",
  "assigned",
  "in-progress",
  "uploaded",
  "selected",
  "done",
]);
export const sourceStatus = z.enum([
  "planned",
  "contacted",
  "waiting",
  "needs-scheduling",
  "scheduled",
  "interviewed",
  "declined",
  "unavailable",
]);
export const appointmentStatus = z.enum([
  "planned",
  "tentative",
  "confirmed",
  "completed",
  "cancelled",
]);
export const purpose = z.enum([
  "draft",
  "interview-notes",
  "transcript",
  "research",
  "data",
  "folder",
  "other",
]);
export const priority = z.enum(["low", "normal", "high", "urgent"]);
export const limit = z.number().int().min(1).max(100).default(50);
export const offset = z.number().int().min(0).max(10000).default(0);
export const idempotencyKey = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{16,128}$/)
  .describe(
    "New opaque key for this create intent. Reuse this key on transport retries, never for different input. Retained 30 days.",
  );
export const person = z.object({
  id,
  name: z.string(),
  avatarUrl: z.string().optional(),
  kind: z.enum(["user", "guest"]).optional(),
});
const nullableText = z.string().nullable();
export const reportingSummary = z.object({
  sources: z.number(),
  interviewed: z.number(),
  needsScheduling: z.number(),
  toSchedule: z.number(),
  nextAppointment: z
    .object({
      id: z.string(),
      title: z.string(),
      startAt: nullableText.optional(),
      windowStart: nullableText.optional(),
      windowEnd: nullableText.optional(),
      scheduleMode: z.string(),
    })
    .nullable(),
});
export const story = z.object({
  id,
  title: z.string(),
  editUrl: z.string(),
  previewUrl: z.string().optional(),
  authors: z.array(person),
  writer: person.nullable(),
  editor: person.nullable(),
  workflow: z.object({
    id: z.string(),
    label: z.string(),
    group: z.string(),
    selectable: z.boolean(),
  }),
  wordpressState: z.object({
    id: z.string().optional(),
    status: z.string().optional(),
    label: z.string(),
    scheduledAt: nullableText.optional(),
    publishedAt: nullableText.optional(),
    date: nullableText.optional(),
  }),
  deadline: nullableText,
  plannedPublication: nullableText,
  modifiedAt: nullableText,
  openTaskCount: z.number(),
  needsReview: z.boolean(),
  reporting: reportingSummary.nullable().optional(),
  mediaSummary: z
    .object({
      total: z.number().optional(),
      open: z.number().optional(),
      assigneeIds: z.array(id).optional(),
      nextDueAt: nullableText.optional(),
    })
    .nullable()
    .optional(),
  notes: z
    .object({
      available: z.boolean().optional(),
      canView: z.boolean().optional(),
      openCount: z.number().optional(),
      resolvedCount: z.number().optional(),
      editUrl: z.string().optional(),
    })
    .nullable()
    .optional(),
});
export const task = z.object({
  id,
  title: z.string(),
  storyId: id.nullable(),
  collectionId: z.number().optional(),
  state: z.enum(["open", "completed"]),
  assigneeId: z.number(),
  assignee: person.nullable().optional(),
  priority,
  dueAt: nullableText,
  completedAt: nullableText,
  createdAt: z.string(),
  modifiedAt: z.string(),
  version: z.string(),
});
export const source = z.object({
  id: uuid,
  label: z.string(),
  role: z.string(),
  organization: z.string(),
  status: sourceStatus,
  assigneeIds: z.array(id),
  assignees: z.array(person).optional(),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const appointment = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  status: appointmentStatus,
  scheduleMode: z.enum(["unscheduled", "window", "exact"]),
  windowStart: nullableText,
  startAt: nullableText,
  windowEnd: nullableText,
  endAt: nullableText,
  assigneeIds: z.array(id),
  assignees: z.array(person).optional(),
  sourceId: nullableText,
  sourceLabel: nullableText.optional(),
  location: z.string(),
  notes: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export const production = z.object({
  id: z.string(),
  title: z.string(),
  type: productionType,
  status: productionStatus,
  assigneeId: z.number(),
  assignee: person.nullable().optional(),
  dueAt: z.string(),
  notes: z.string(),
  attachmentIds: z.array(id),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export const resource = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string(),
  kind: z.string(),
  purpose,
});
export const activity = z.object({
  id: z.number(),
  action: z.string(),
  storyId: z.number(),
  summary: z.string(),
  occurredAt: z.string(),
  actor: person.nullable(),
  context: z
    .object({
      source: z.string().optional(),
      mcpTool: z.string().optional(),
      requestId: z.string().optional(),
      taskId: z.number().optional(),
      collectionId: z.number().optional(),
      revision: z.number().optional(),
      status: z.string().optional(),
      operation: z.string().optional(),
    })
    .or(z.tuple([]))
    .optional(),
});
export const capabilities = z.object({
  role: z.enum(["manager", "participant"]),
  editArticle: z.boolean(),
  changeStatus: z.boolean(),
  assign: z.boolean(),
  editContributors: z.boolean(),
  editBrief: z.boolean(),
  manageReporting: z.boolean(),
  addSource: z.boolean(),
  addAppointment: z.boolean(),
  manageMedia: z.boolean(),
  assignMedia: z.boolean(),
  addTask: z.boolean(),
  manageResources: z.boolean(),
  review: z.boolean(),
});
export const workspace = z.object({
  story,
  revision: z.number(),
  timezone: z.string(),
  brief: z.string(),
  sections: z.array(z.string()),
  contributors: z.object({
    contributors: z.array(
      person.extend({
        type: z.string().optional(),
        role: z.string().optional(),
      }),
    ),
    canEdit: z.boolean().optional(),
  }),
  tasks: z.array(task),
  sources: z.array(source),
  appointments: z.array(appointment),
  mediaAssignments: z.array(production),
  resources: z.array(resource),
  resourcesVersion: version,
  activity: z.array(activity),
  previewUrl: z.string(),
  capabilities,
  errors: z.record(z.string(), z.string()),
  setup: z
    .array(
      z.object({ operation: z.string(), ok: z.boolean(), status: z.number() }),
    )
    .optional(),
  workspaceUrl: z.string().optional(),
  replayed: z.boolean().optional(),
});
export const collection = z.object({
  id,
  name: z.string(),
  brief: z.string(),
  type: z.string(),
  status: z.string(),
  lead: person.nullable(),
  members: z.array(person),
  startDate: z.string(),
  endDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version,
  storyIds: z.array(id),
  storyCount: z.number(),
  storyIdsTruncated: z.boolean().optional(),
  storySummary: z.record(z.string(), z.number()),
  interviewCount: z.number(),
  openTaskCount: z.number(),
  canEdit: z.boolean(),
});
export const interview = z.object({
  id,
  collectionId: id,
  sourceId: id,
  interviewee: z.string(),
  status: z.string(),
  scheduleMode: z.enum(["unscheduled", "window", "exact"]),
  windowStart: z.string(),
  windowEnd: z.string(),
  scheduledAt: z.string(),
  endAt: z.string(),
  location: z.string(),
  completedAt: z.string(),
  interviewers: z.array(person),
  storyIds: z.array(id),
  notes: z.string(),
  followUps: z.string(),
  resourceIds: z.array(id),
  createdAt: z.string(),
  updatedAt: z.string(),
  canEdit: z.boolean(),
}); // Contact details deliberately omitted.
export const collectionDetail = z.object({
  collection,
  stories: z.array(story),
  appointments: z
    .array(
      appointment
        .omit({ sourceId: true, location: true })
        .partial()
        .extend({ id: z.string(), title: z.string() }),
    )
    .optional(),
  interviews: z.array(interview),
  tasks: z.array(task),
  resources: z.array(
    z.object({
      id,
      label: z.string(),
      url: z.string(),
      kind: z.string(),
      attachmentId: z.number(),
      storyIds: z.array(id),
    }),
  ),
  activity: z.array(activity),
  work: z
    .array(
      z.object({
        storyId: id,
        tasks: z.array(task),
        production: z.array(production),
        sources: z.array(source),
        appointments: z.array(appointment),
      }),
    )
    .optional(),
  workLimit: z.number().optional(),
  hasMoreWork: z.boolean().optional(),
  storyLimit: z.number().optional(),
  hasMoreStories: z.boolean().optional(),
  interviewLimit: z.number().optional(),
  hasMoreInterviews: z.boolean().optional(),
});
export const article = z.object({
  id,
  title: z.string(),
  excerpt: z.string(),
  wordpressStatus: z.string(),
  modifiedAt: z.string(),
  version,
  scheduledAt: nullableText,
  sectionIds: z.array(id),
  tagIds: z.array(id),
  featuredMediaId: z.number(),
  editUrl: z.string(),
  canPublish: z.boolean(),
  canTrash: z.boolean(),
  blockMarkup: z.string().optional(),
});
export const taskFields = {
  title,
  assigneeId: z.number().int().min(0).optional(),
  priority: priority.optional(),
  dueAt: clearTime.optional(),
};
export const productionFields = {
  title: text(160).trim().min(1).optional(),
  type: productionType.optional(),
  status: productionStatus.optional(),
  assigneeId: z.number().int().min(0).optional(),
  dueAt: clearTime.optional(),
  notes: text(4000).optional(),
  attachmentIds: z.array(id).max(30).optional(),
};
export const sourceFields = {
  label: title,
  role: text(120).optional(),
  organization: text(160).optional(),
  status: sourceStatus.optional(),
  assigneeIds: z.array(id).max(4).optional(),
  notes: text(2000).optional(),
};
export const appointmentFields = {
  title,
  kind: z
    .enum([
      "interview",
      "meeting",
      "event",
      "photo",
      "press-conference",
      "game",
      "performance",
      "reporting",
      "other",
    ])
    .optional(),
  status: appointmentStatus.optional(),
  scheduleMode: z.enum(["unscheduled", "window", "exact"]).optional(),
  startAt: instant.nullable().optional(),
  endAt: instant.nullable().optional(),
  windowStart: date.nullable().optional(),
  windowEnd: date.nullable().optional(),
  location: text(240).optional(),
  notes: text(2000).optional(),
  assigneeIds: z.array(id).max(4).optional(),
  sourceId: uuid.nullable().optional(),
};
export const planning = z.strictObject({
  status: workflow.optional(),
  sectionIds: z.array(id).max(30).optional(),
  editorId: z.number().int().min(0).optional(),
  deadline: z.union([date, z.literal("")]).optional(),
  plannedPublishAt: clearTime.optional(),
  visuals: text(4000).optional(),
  contributors: z
    .array(z.strictObject({ type: z.enum(["user", "guest"]), id }))
    .max(10)
    .optional(),
});
export const filters = {
  sectionId: id.optional(),
  query: text(120).optional(),
  workflow: workflow.optional(),
  writer: id.optional(),
  editor: id.optional(),
  wordpress_state: z
    .enum(["draft", "pending", "future", "publish", "private"])
    .optional(),
  deadline_from: date.optional(),
  deadline_to: date.optional(),
  planned_from: date.optional(),
  planned_to: date.optional(),
  mine: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  overdue: z.boolean().optional(),
  needs_review: z.boolean().optional(),
  collectionId: id.optional(),
  visual_status: productionStatus.optional(),
  limit,
  offset,
};
