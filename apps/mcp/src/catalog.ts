import { z } from "zod";
import * as s from "./schemas";
import { BylineError, errorSchema, safeError } from "./errors";
import type { Access } from "./types";
import type { WordPress } from "./wordpress";
export interface ToolContext {
  wp: WordPress;
  access: Access;
  requestId: string;
  disconnect: () => Promise<{ revoked: true; credentialRevoked: boolean }>;
}
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  permission: string;
  api: string;
  capability?: string;
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  input: z.ZodType;
  data: z.ZodType;
  output: z.ZodType;
  run: (input: unknown, context: ToolContext) => Promise<unknown>;
}
const catalog: ToolDefinition[] = [];
function define<I extends z.ZodType, O extends z.ZodType>(
  meta: Omit<
    ToolDefinition,
    "input" | "data" | "output" | "run" | "destructive" | "idempotent"
  > & { destructive?: boolean; idempotent?: boolean },
  input: I,
  data: O,
  run: (input: z.infer<I>, context: ToolContext) => Promise<unknown>,
) {
  const output = z.strictObject({
    ok: z.boolean(),
    data: data.optional(),
    error: errorSchema.optional(),
    requestId: z.string(),
  });
  catalog.push({
    ...meta,
    destructive: meta.destructive ?? false,
    idempotent: meta.idempotent ?? meta.readOnly,
    input,
    data,
    output,
    run: async (raw, ctx) => {
      const validated = input.parse(raw);
      try {
        return await run(validated, ctx);
      } catch (error) {
        if (error instanceof z.ZodError)
          throw new BylineError("upstream_unavailable");
        throw error;
      }
    },
  });
}
function read<I extends z.ZodType, O extends z.ZodType>(
  name: string,
  title: string,
  description: string,
  input: I,
  data: O,
  api: string,
  run: (v: z.infer<I>, ctx: ToolContext) => Promise<unknown>,
  permission = "edit_posts; target read permission",
  capability?: string,
) {
  define(
    { name, title, description, permission, api, readOnly: true, capability },
    input,
    data,
    run,
  );
}
function write<I extends z.ZodType, O extends z.ZodType>(
  name: string,
  title: string,
  description: string,
  input: I,
  data: O,
  api: string,
  run: (v: z.infer<I>, ctx: ToolContext) => Promise<unknown>,
  options: {
    destructive?: boolean;
    idempotent?: boolean;
    permission?: string;
    capability?: string;
  } = {},
) {
  define(
    {
      name,
      title,
      description,
      permission:
        options.permission ?? "Canonical target/field mutation permission",
      api,
      readOnly: false,
      ...options,
    },
    input,
    data,
    run,
  );
}
const empty = z.strictObject({});
const storyId = z.strictObject({ storyId: s.id });
const storyPath = (id: number) => `/byline/v1/editorial/stories/${id}`;
const collectionPath = (id: number) => `/byline/v1/editorial/collections/${id}`;
const getWorkspace = (ctx: ToolContext, id: number) =>
  ctx.wp
    .request(`${storyPath(id)}/workspace`)
    .then((v) => s.workspace.parse(v));
function query(path: string, args: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(args))
    if (v !== undefined) q.set(k, String(v));
  return `${path}?${q}`;
}
function mutate(
  ctx: ToolContext,
  tool: string,
  path: string,
  data: unknown,
  method = "POST",
  options: { idempotencyKey?: string; expectedVersion?: string } = {},
) {
  return ctx.wp.request(path, method, data, { tool, ...options });
}
const result = z.object({
  deleted: z.boolean().optional(),
  linked: z.boolean().optional(),
});
const storyList = z.object({
  stories: z.array(s.story),
  timezone: z.string(),
  total: z.number(),
  hasMore: z.boolean(),
});
read(
  "byline.capabilities",
  "Your Byline access",
  "Read the connected WordPress identity, site timezone and capability flags. Object and field permissions are checked on every operation.",
  empty,
  z.object({
    user: s.person,
    timezone: z.string(),
    version: z.string(),
    capabilities: z.record(z.string(), z.boolean()),
  }),
  "/editorial/access",
  async (_, ctx) => ctx.access,
);
write(
  "byline.disconnect",
  "Disconnect this Byline connection",
  "Permanently revoke this connection and its WordPress Application Password. Other client connections remain separate. This connection stops working immediately; WordPress cleanup retries after an outage.",
  empty,
  z.object({ revoked: z.literal(true), credentialRevoked: z.boolean() }),
  "OAuth connection vault",
  async (_, ctx) => ctx.disconnect(),
  {
    destructive: true,
    idempotent: true,
    permission: "Authenticated connection owner",
  },
);
const home = z.object({
  currentUser: s.person,
  timezone: z.string(),
  now: z.string(),
  stories: z.array(s.story),
  tasks: z.array(s.task),
  visualWork: z.array(
    z.object({
      id: z.string(),
      story: z.object({ id: s.id, title: z.string() }),
      title: z.string(),
      type: s.productionType,
      status: s.productionStatus,
      assignee: s.person.nullable(),
      dueAt: z.string().nullable(),
    }),
  ),
  appointments: z.array(
    s.appointment.partial().extend({ id: z.string(), title: z.string() }),
  ),
  activity: z.array(s.activity),
  errors: z.record(z.string(), z.string()),
  limits: z.object({
    stories: z.number(),
    tasks: z.number(),
    visualWork: z.number(),
    appointments: z.number(),
    activity: z.number(),
  }),
});
read(
  "newsroom.today",
  "Your newsroom work today",
  "Read the same authorized work, story context, appointments and service errors as Byline Today. Queue data is bounded; limits and errors describe incomplete sections.",
  empty,
  home,
  "/editorial/home",
  async (_, ctx) => ctx.wp.request("/byline/v1/editorial/home"),
);
const scheduleInput = z
  .strictObject({
    from: s.date,
    to: s.date,
    includeTasks: z.boolean().default(true),
    collectionId: s.id.optional(),
  })
  .refine(
    (v) =>
      v.to >= v.from && Date.parse(v.to) - Date.parse(v.from) <= 124 * 86400000,
    { message: "Choose a range of at most 124 days." },
  );
const event = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  storyId: z.number().nullable().optional(),
  storyTitle: z.string().optional(),
  collectionId: z.number().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  windowStart: z.string().nullable().optional(),
  windowEnd: z.string().nullable().optional(),
  scheduleMode: z.string().optional(),
  status: z.string().optional(),
  kind: z.string().optional(),
  dueAt: z.string().optional(),
  assignees: z.array(s.person).optional(),
});
read(
  "newsroom.schedule",
  "Newsroom commitments and publication dates",
  "Read exact appointments, unscheduled target windows, work deadlines, story deadlines, planned publication and actual WordPress schedules. Dates follow the returned WordPress site timezone; a window is never an exact time.",
  scheduleInput,
  z.object({
    timezone: z.string(),
    from: s.date,
    to: s.date,
    appointments: z.array(event),
    needsScheduling: z.array(event),
    mediaDeadlines: z.array(event),
    taskDeadlines: z.array(event),
    storyDates: z.array(
      z.object({
        id: z.string(),
        storyId: s.id,
        title: z.string(),
        kind: z.enum([
          "story-deadline",
          "planned-publication",
          "wordpress-scheduled",
        ]),
        at: z.string(),
        day: s.date,
      }),
    ),
    bounded: z.boolean(),
    storyCandidateLimit: z.number(),
  }),
  "/editorial/schedule",
  async (v, ctx) =>
    ctx.wp.request(
      query("/byline/v1/editorial/schedule", {
        ...v,
        includeTasks: v.includeTasks ? 1 : 0,
      }),
    ),
);
read(
  "stories.search",
  "Find newsroom stories",
  "Search authorized story planning summaries by workflow, WordPress publication state, people, dates, collection and blockers. Use bounded pagination. Bodies and private reporting notes are excluded.",
  z.strictObject(s.filters),
  storyList,
  "/editorial/planning",
  async (v, ctx) => ctx.wp.request(query("/byline/v1/editorial/planning", v)),
);
read(
  "newsroom.search",
  "Search the newsroom",
  "Find authorized stories by text and optional collection. Use staff.list, tasks.list or collections.list for their specific domains.",
  z.strictObject({
    query: s.text(120).min(1),
    collectionId: s.id.optional(),
    limit: s.limit,
    offset: s.offset,
  }),
  storyList,
  "/editorial/planning",
  async (v, ctx) => ctx.wp.request(query("/byline/v1/editorial/planning", v)),
);
read(
  "newsroom.summary",
  "Bounded factual newsroom overview",
  "Return counts and story IDs from an authorized planning sample: workflow, overdue internal deadlines, review work, missing writers and reporting/production blockers. This is factual data, not a readiness prediction. hasMore means the sample is incomplete.",
  z.strictObject({ limit: s.limit, collectionId: s.id.optional() }),
  z.object({
    timezone: z.string(),
    sampleSize: z.number(),
    hasMore: z.boolean(),
    byWorkflow: z.record(z.string(), z.number()),
    overdueStoryIds: z.array(s.id),
    needsReviewIds: z.array(s.id),
    unassignedStoryIds: z.array(s.id),
    needsSchedulingIds: z.array(s.id),
    productionBlockerIds: z.array(s.id),
  }),
  "/editorial/planning",
  async (v, ctx) => {
    const rows = storyList.parse(
      await ctx.wp.request(query("/byline/v1/editorial/planning", v)),
    );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: rows.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const byWorkflow: Record<string, number> = {};
    for (const r of rows.stories)
      byWorkflow[r.workflow.id] = (byWorkflow[r.workflow.id] ?? 0) + 1;
    return {
      timezone: rows.timezone,
      sampleSize: rows.stories.length,
      hasMore: rows.hasMore,
      byWorkflow,
      overdueStoryIds: rows.stories
        .filter(
          (r) =>
            r.deadline &&
            r.deadline < today &&
            !["publish", "trash"].includes(r.wordpressState.id ?? ""),
        )
        .map((r) => r.id),
      needsReviewIds: rows.stories
        .filter((r) => r.needsReview)
        .map((r) => r.id),
      unassignedStoryIds: rows.stories
        .filter((r) => !r.authors.length)
        .map((r) => r.id),
      needsSchedulingIds: rows.stories
        .filter((r) => (r.reporting?.needsScheduling ?? 0) > 0)
        .map((r) => r.id),
      productionBlockerIds: rows.stories
        .filter((r) => (r.mediaSummary?.open ?? 0) > 0)
        .map((r) => r.id),
    };
  },
);
read(
  "staff.list",
  "Find newsroom staff",
  "List assignment identities using display name and ID only. No emails, usernames, profile secrets or authentication fields.",
  z.strictObject({
    query: s.text(100).optional(),
    limit: s.limit,
    offset: s.offset,
  }),
  z.object({ staff: z.array(s.person), limit: z.number(), offset: z.number() }),
  "/editorial/staff",
  async (v, ctx) => ctx.wp.request(query("/byline/v1/editorial/staff", v)),
);
read(
  "staff.get",
  "Staff member and authorized workload",
  "Read a staff identity plus a bounded sample of stories they write/edit and tasks assigned to them. Every upstream read uses your permissions; omitted work is not evidence that no other work exists.",
  z.strictObject({ staffId: s.id, limit: s.limit }),
  z.object({
    staff: z.array(s.person),
    writing: storyList,
    editing: storyList,
    tasks: z.array(s.task),
  }),
  "/editorial/staff/{id}; /editorial/planning; /editorial/tasks",
  async (v, ctx) => {
    const identity = z
      .object({ staff: z.array(s.person) })
      .parse(await ctx.wp.request(`/byline/v1/editorial/staff/${v.staffId}`));
    const [writing, editing, tasks] = await Promise.all([
      ctx.wp.request(
        query("/byline/v1/editorial/planning", {
          writer: v.staffId,
          limit: v.limit,
        }),
      ),
      ctx.wp.request(
        query("/byline/v1/editorial/planning", {
          editor: v.staffId,
          limit: v.limit,
        }),
      ),
      ctx.wp.request(
        query("/byline/v1/editorial/tasks", {
          assigneeId: v.staffId,
          limit: v.limit,
        }),
      ),
    ]);
    return {
      ...identity,
      writing,
      editing,
      tasks: z.object({ tasks: z.array(s.task) }).parse(tasks).tasks,
    };
  },
);
read(
  "story.get",
  "Full story planning context",
  "Read the canonical Story Workspace: brief, contributors, tasks, sources, appointments, production, private links, permitted activity, capabilities and revision tokens. Assigned participants see their permitted records only. Article body and note text require separate reads.",
  storyId,
  s.workspace,
  "/editorial/stories/{id}/workspace",
  async (v, ctx) => getWorkspace(ctx, v.storyId),
);
write(
  "story.create",
  "Create a newsroom story plan",
  "Create a draft, optionally from a Byline preset, with explicit planning fields, brief, starter tasks, production work and collection membership. Setup outcomes are returned individually; a draft survives partial setup failure. Templates never invent sources or interviews.",
  z.strictObject({
    title: s.title,
    preset: z
      .enum(["news", "sports-recap", "opinion", "photo-story", "breaking"])
      .optional(),
    planning: s.planning.optional(),
    brief: s.text(4000).optional(),
    tasks: z.array(z.strictObject(s.taskFields)).max(20).optional(),
    production: z.array(z.strictObject(s.productionFields)).max(12).optional(),
    collectionId: s.id.optional(),
    idempotencyKey: s.idempotencyKey,
  }),
  s.workspace,
  "/editorial/story-plans",
  async ({ idempotencyKey, ...v }, ctx) =>
    mutate(ctx, "story.create", "/byline/v1/editorial/story-plans", v, "POST", {
      idempotencyKey,
    }),
  {
    permission:
      "create_posts; setup uses each canonical field/domain permission",
  },
);
write(
  "story.update_planning",
  "Update story planning",
  "Patch only supplied workflow, assigned editor, contributors, internal deadline, planned publication or visual needs. Read story.get for expectedRevision first. Published is derived; this operation never publishes. Use empty date strings to clear dates.",
  z.strictObject({
    storyId: s.id,
    expectedRevision: z.number().int().min(0),
    changes: s.planning.refine(
      (v) => Object.keys(v).length > 0,
      "Supply a planning change.",
    ),
  }),
  s.workspace,
  "/editorial/stories/{id}",
  async (v, ctx) => {
    await mutate(ctx, "story.update_planning", storyPath(v.storyId), {
      ...v.changes,
      expectedRevision: v.expectedRevision,
    });
    return getWorkspace(ctx, v.storyId);
  },
  {
    permission:
      "edit_post; editor/deadline/planned date require edit_others_posts",
  },
);
write(
  "story.set_brief",
  "Write the private story brief",
  "Replace the planning brief using the exact expectedBrief read from story.get. The brief is private planning text, separate from article copy and WordPress Notes.",
  z.strictObject({
    storyId: s.id,
    brief: s.text(4000),
    expectedBrief: s.text(4000),
  }),
  z.object({ brief: z.string() }),
  "/editorial/stories/{id}/brief",
  async (v, ctx) =>
    mutate(ctx, "story.set_brief", `${storyPath(v.storyId)}/brief`, {
      brief: v.brief,
      expectedBrief: v.expectedBrief,
    }),
);
read(
  "tasks.list",
  "Find actionable work",
  "List authorized canonical Byline tasks by story, collection, assignee or state. Use tasks for work to complete; use appointments for an interview or event with attendance timing.",
  z.strictObject({
    storyId: s.id.optional(),
    collectionId: s.id.optional(),
    assigneeId: s.id.optional(),
    state: z.enum(["open", "completed"]).optional(),
    limit: s.limit,
  }),
  z.object({ tasks: z.array(s.task) }),
  "/editorial/tasks",
  async (v, ctx) => ctx.wp.request(query("/byline/v1/editorial/tasks", v)),
);
read(
  "task.get",
  "Read a task and its version",
  "Inspect a task before changing it. version covers canonical task fields including metadata changes.",
  z.strictObject({ taskId: s.id }),
  s.task,
  "/editorial/tasks/{id}",
  async (v, ctx) => ctx.wp.request(`/byline/v1/editorial/tasks/${v.taskId}`),
);
write(
  "task.create",
  "Create actionable story or collection work",
  "Create a small piece of work someone needs to complete. Use appointment.create for an interview/event with attendance timing. Use an existing story or collection ID; assignment permissions are enforced by WordPress.",
  z
    .strictObject({
      storyId: s.id.optional(),
      collectionId: s.id.optional(),
      ...s.taskFields,
      idempotencyKey: s.idempotencyKey,
    })
    .refine(
      (v) => Boolean(v.storyId) !== Boolean(v.collectionId),
      "Choose exactly one story or collection.",
    ),
  s.task,
  "/editorial/tasks",
  async ({ idempotencyKey, ...v }, ctx) =>
    mutate(ctx, "task.create", "/byline/v1/editorial/tasks", v, "POST", {
      idempotencyKey,
    }),
);
write(
  "task.update",
  "Update a task",
  "Patch supplied title, assignee, due time or priority using the version from task.get. Use complete/reopen for task state.",
  z.strictObject({
    taskId: s.id,
    expectedVersion: s.version,
    changes: z
      .strictObject(s.taskFields)
      .partial()
      .refine((v) => Object.keys(v).length > 0),
  }),
  s.task,
  "/editorial/tasks/{id}",
  async (v, ctx) =>
    mutate(
      ctx,
      "task.update",
      `/byline/v1/editorial/tasks/${v.taskId}`,
      v.changes,
      "POST",
      { expectedVersion: v.expectedVersion },
    ),
);
for (const [name, state] of [
  ["complete", "completed"],
  ["reopen", "open"],
] as const)
  write(
    `task.${name}`,
    `${name === "complete" ? "Complete" : "Reopen"} a task`,
    `Set a task to ${state} using its current version. This changes task work state only.`,
    z.strictObject({ taskId: s.id, expectedVersion: s.version }),
    s.task,
    "/editorial/tasks/{id}",
    async (v, ctx) =>
      mutate(
        ctx,
        `task.${name}`,
        `/byline/v1/editorial/tasks/${v.taskId}`,
        { state },
        "POST",
        { expectedVersion: v.expectedVersion },
      ),
  );
write(
  "task.delete",
  "Permanently delete a task",
  "Delete a task and its canonical record permanently. Prefer completing work to preserve its history.",
  z.strictObject({ taskId: s.id, expectedVersion: s.version }),
  result,
  "/editorial/tasks/{id}",
  async (v, ctx) =>
    mutate(
      ctx,
      "task.delete",
      `/byline/v1/editorial/tasks/${v.taskId}`,
      undefined,
      "DELETE",
      { expectedVersion: v.expectedVersion },
    ),
  { destructive: true },
);
const reporting = z.object({
  sources: z.array(s.source),
  appointments: z.array(s.appointment),
  sourceId: z.string().optional(),
  appointmentId: z.string().optional(),
});
read(
  "sources.list",
  "Story reporting sources",
  "Read your permitted story-scoped reporting targets and their current status. These records deliberately have no phone/email fields.",
  storyId,
  z.object({ sources: z.array(s.source) }),
  "/editorial/stories/{id}/workspace",
  async (v, ctx) => getWorkspace(ctx, v.storyId),
);
write(
  "source.create",
  "Add a reporting target",
  "Add a known reporting target to a story: label, role, organization, assignees and authorized private notes. Use a task for vague work such as interview three students until specific targets are known.",
  z.strictObject({
    storyId: s.id,
    ...s.sourceFields,
    idempotencyKey: s.idempotencyKey,
  }),
  reporting,
  "/editorial/stories/{id}/sources",
  async ({ storyId, idempotencyKey, ...v }, ctx) =>
    mutate(ctx, "source.create", `${storyPath(storyId)}/sources`, v, "POST", {
      idempotencyKey,
    }),
);
write(
  "source.update",
  "Update a reporting source",
  "Patch a story source using expectedUpdatedAt from story.get or sources.list. Assigned participants may change only the records and fields the canonical domain permits.",
  z.strictObject({
    storyId: s.id,
    sourceId: s.uuid,
    expectedUpdatedAt: s.instant,
    changes: z
      .strictObject(s.sourceFields)
      .partial()
      .refine((v) => Object.keys(v).length > 0),
  }),
  reporting,
  "/editorial/stories/{id}/sources/{uuid}",
  async (v, ctx) =>
    mutate(
      ctx,
      "source.update",
      `${storyPath(v.storyId)}/sources/${v.sourceId}`,
      { ...v.changes, expectedUpdatedAt: v.expectedUpdatedAt },
    ),
);
write(
  "source.delete",
  "Remove a reporting source",
  "Permanently remove a story reporting target. Canonical behavior clears linked appointments’ source reference; appointments and other work remain.",
  z.strictObject({
    storyId: s.id,
    sourceId: s.uuid,
    expectedUpdatedAt: s.instant,
  }),
  reporting,
  "/editorial/stories/{id}/sources/{uuid}",
  async (v, ctx) =>
    mutate(
      ctx,
      "source.delete",
      `${storyPath(v.storyId)}/sources/${v.sourceId}`,
      { expectedUpdatedAt: v.expectedUpdatedAt },
      "DELETE",
    ),
  { destructive: true },
);
read(
  "appointments.list",
  "Story appointments and interviews",
  "Read permitted reporting commitments, including exact times, fuzzy date windows and unscheduled work. This does not list task deadlines or publication dates.",
  storyId,
  z.object({ appointments: z.array(s.appointment) }),
  "/editorial/stories/{id}/workspace",
  async (v, ctx) => getWorkspace(ctx, v.storyId),
);
write(
  "appointment.create",
  "Create a reporting appointment",
  "Create an interview, meeting, event, photo call or other reporting commitment for a story. Use this for something someone needs to attend at an exact time or target window. Do not use it for a task deadline or publication date. Never invent a time for a fuzzy window.",
  z.strictObject({
    storyId: s.id,
    ...s.appointmentFields,
    idempotencyKey: s.idempotencyKey,
  }),
  reporting,
  "/editorial/stories/{id}/appointments",
  async ({ storyId, idempotencyKey, ...v }, ctx) =>
    mutate(
      ctx,
      "appointment.create",
      `${storyPath(storyId)}/appointments`,
      v,
      "POST",
      { idempotencyKey },
    ),
);
write(
  "appointment.update",
  "Edit a reporting appointment",
  "Patch appointment details or switch between unscheduled, date-window and exact-time modes using its current updatedAt. WordPress normalizes mode-specific fields and enforces assignment permissions.",
  z.strictObject({
    storyId: s.id,
    appointmentId: s.uuid,
    expectedUpdatedAt: s.instant,
    changes: z
      .strictObject(s.appointmentFields)
      .partial()
      .refine((v) => Object.keys(v).length > 0),
  }),
  reporting,
  "/editorial/stories/{id}/appointments/{uuid}",
  async (v, ctx) =>
    mutate(
      ctx,
      "appointment.update",
      `${storyPath(v.storyId)}/appointments/${v.appointmentId}`,
      { ...v.changes, expectedUpdatedAt: v.expectedUpdatedAt },
    ),
);
write(
  "appointment.schedule",
  "Schedule or reschedule an appointment",
  "Set an explicit exact appointment time, resolved in the returned WordPress site timezone and supplied with an offset. This schedules attendance, never article publication.",
  z.strictObject({
    storyId: s.id,
    appointmentId: s.uuid,
    expectedUpdatedAt: s.instant,
    startAt: s.instant,
    endAt: s.instant.nullable().optional(),
    status: z.enum(["tentative", "confirmed"]).optional(),
  }),
  reporting,
  "/editorial/stories/{id}/appointments/{uuid}",
  async ({ storyId, appointmentId, ...v }, ctx) =>
    mutate(
      ctx,
      "appointment.schedule",
      `${storyPath(storyId)}/appointments/${appointmentId}`,
      { ...v, scheduleMode: "exact" },
    ),
);
write(
  "appointment.set_status",
  "Change appointment status",
  "Set planned, tentative, confirmed, completed or cancelled using the current updatedAt. Cancelled and completed appointments remain in history.",
  z.strictObject({
    storyId: s.id,
    appointmentId: s.uuid,
    expectedUpdatedAt: s.instant,
    status: s.appointmentStatus,
  }),
  reporting,
  "/editorial/stories/{id}/appointments/{uuid}",
  async ({ storyId, appointmentId, ...v }, ctx) =>
    mutate(
      ctx,
      "appointment.set_status",
      `${storyPath(storyId)}/appointments/${appointmentId}`,
      v,
    ),
);
write(
  "appointment.delete",
  "Permanently remove an appointment",
  "Delete this appointment only. Prefer cancelled/completed status to preserve reporting history. The linked source, tasks and links remain.",
  z.strictObject({
    storyId: s.id,
    appointmentId: s.uuid,
    expectedUpdatedAt: s.instant,
  }),
  reporting,
  "/editorial/stories/{id}/appointments/{uuid}",
  async ({ storyId, appointmentId, ...v }, ctx) =>
    mutate(
      ctx,
      "appointment.delete",
      `${storyPath(storyId)}/appointments/${appointmentId}`,
      v,
      "DELETE",
    ),
  { destructive: true },
);
read(
  "production.list",
  "Story production assignments",
  "Read photo, gallery, graphic, video, audio and other assignments. Each has separate owners, delivery deadlines, status, files and concurrency timestamps.",
  storyId,
  z.object({ mediaAssignments: z.array(s.production) }),
  "/editorial/stories/{id}/workspace",
  async (v, ctx) => getWorkspace(ctx, v.storyId),
);
const productionResult = z.object({
  mediaAssignments: z.array(s.production),
  assignmentId: z.string().optional(),
});
write(
  "production.create",
  "Create a production assignment",
  "Add a photo, gallery, graphic, video, audio or other production deliverable to a story. Its delivery deadline is separate from appointment attendance or publication.",
  z.strictObject({
    storyId: s.id,
    ...s.productionFields,
    type: s.productionType,
    idempotencyKey: s.idempotencyKey,
  }),
  productionResult,
  "/editorial/stories/{id}/media-assignments",
  async ({ storyId, idempotencyKey, ...v }, ctx) =>
    mutate(
      ctx,
      "production.create",
      `${storyPath(storyId)}/media-assignments`,
      v,
      "POST",
      { idempotencyKey },
    ),
);
write(
  "production.update",
  "Edit a production assignment",
  "Patch production title, type, assignee, due date, notes or files using the current updatedAt. Participant restrictions remain authoritative.",
  z.strictObject({
    storyId: s.id,
    assignmentId: s.recordId,
    expectedUpdatedAt: z.string().max(40),
    changes: z
      .strictObject(s.productionFields)
      .partial()
      .refine((v) => Object.keys(v).length > 0),
  }),
  productionResult,
  "/editorial/stories/{id}/media-assignments/{uuid}",
  async (v, ctx) =>
    mutate(
      ctx,
      "production.update",
      `${storyPath(v.storyId)}/media-assignments/${v.assignmentId}`,
      { ...v.changes, expectedUpdatedAt: v.expectedUpdatedAt },
    ),
);
write(
  "production.set_status",
  "Change production status",
  "Set needed, assigned, in-progress, uploaded, selected or done using the current updatedAt. This changes a production assignment only.",
  z.strictObject({
    storyId: s.id,
    assignmentId: s.recordId,
    expectedUpdatedAt: z.string().max(40),
    status: s.productionStatus,
  }),
  productionResult,
  "/editorial/stories/{id}/media-assignments/{uuid}",
  async ({ storyId, assignmentId, ...v }, ctx) =>
    mutate(
      ctx,
      "production.set_status",
      `${storyPath(storyId)}/media-assignments/${assignmentId}`,
      v,
    ),
);
for (const action of ["attach_media", "remove_media"] as const)
  write(
    `production.${action}`,
    action === "attach_media"
      ? "Attach existing Media Library files"
      : "Unlink production media",
    `${
      action === "attach_media" ? "Attach" : "Unlink"
    } explicit existing Media Library IDs. Reads the current assignment and preserves unrelated files; the expectedUpdatedAt check prevents stale replacement. No remote URL downloads and no binary upload.`,
    z.strictObject({
      storyId: s.id,
      assignmentId: s.recordId,
      expectedUpdatedAt: z.string().max(40),
      mediaIds: z.array(s.id).min(1).max(30),
    }),
    productionResult,
    "/editorial/stories/{id}/media-assignments/{uuid}",
    async (v, ctx) => {
      const workspace = await getWorkspace(ctx, v.storyId);
      const assignment = workspace.mediaAssignments.find(
        (a) => a.id === v.assignmentId,
      );
      if (!assignment) throw new BylineError("not_found");
      if (assignment.updatedAt !== v.expectedUpdatedAt)
        throw new BylineError("conflict");
      const attachmentIds =
        action === "attach_media"
          ? [...new Set([...assignment.attachmentIds, ...v.mediaIds])]
          : assignment.attachmentIds.filter((id) => !v.mediaIds.includes(id));
      return mutate(
        ctx,
        `production.${action}`,
        `${storyPath(v.storyId)}/media-assignments/${v.assignmentId}`,
        { attachmentIds, expectedUpdatedAt: v.expectedUpdatedAt },
      );
    },
  );
write(
  "production.delete",
  "Remove a production assignment",
  "Permanently delete one production assignment. Does not delete Media Library files. Canonical featured-image protections still apply.",
  z.strictObject({
    storyId: s.id,
    assignmentId: s.recordId,
    expectedUpdatedAt: z.string().max(40),
  }),
  productionResult,
  "/editorial/stories/{id}/media-assignments/{uuid}",
  async ({ storyId, assignmentId, ...v }, ctx) =>
    mutate(
      ctx,
      "production.delete",
      `${storyPath(storyId)}/media-assignments/${assignmentId}`,
      v,
      "DELETE",
    ),
  { destructive: true },
);
read(
  "resources.list",
  "Private story links",
  "Read private working draft, interview notes, transcript, research, data and folder links. Byline manages link records only and never fetches their targets.",
  storyId,
  z.object({ resources: z.array(s.resource), resourcesVersion: s.version }),
  "/editorial/stories/{id}/workspace",
  async (v, ctx) => getWorkspace(ctx, v.storyId),
);
const linkFields = {
  label: s.text(120).trim().min(1),
  url: z
    .url()
    .max(2048)
    .refine((v) => {
      const url = new URL(v);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !/[\x00-\x20\x7f]/.test(v)
      );
    }, "Use an HTTP(S) URL without credentials."),
  purpose: s.purpose.optional(),
};
const links = z.object({
  resources: z.array(s.resource),
  resourcesVersion: s.version,
});
write(
  "resource.add",
  "Add a private story link",
  "Add a supplied link with a label and purpose. Google resource kinds are derived by Byline; the target is never fetched. Use purpose=draft for the intended working draft.",
  z.strictObject({
    storyId: s.id,
    ...linkFields,
    expectedVersion: s.version,
    idempotencyKey: s.idempotencyKey,
  }),
  links,
  "/editorial/stories/{id}/resources",
  async ({ storyId, expectedVersion, idempotencyKey, ...v }, ctx) => {
    await mutate(
      ctx,
      "resource.add",
      `${storyPath(storyId)}/resources`,
      v,
      "POST",
      { expectedVersion, idempotencyKey },
    );
    return getWorkspace(ctx, storyId);
  },
);
write(
  "resource.update",
  "Edit a private story link",
  "Replace the supplied label, URL and purpose for one existing link, preserving all other records through compare-and-swap. Read resources.list for resourcesVersion first.",
  z.strictObject({
    storyId: s.id,
    resourceId: s.uuid,
    expectedVersion: s.version,
    ...linkFields,
  }),
  links,
  "/editorial/stories/{id}/resources/{uuid}",
  async ({ storyId, resourceId, expectedVersion, ...v }, ctx) => {
    await mutate(
      ctx,
      "resource.update",
      `${storyPath(storyId)}/resources/${resourceId}`,
      v,
      "POST",
      { expectedVersion },
    );
    return getWorkspace(ctx, storyId);
  },
);
write(
  "resource.remove",
  "Remove a private story link",
  "Remove the Byline link record using resourcesVersion. The linked document is untouched.",
  z.strictObject({
    storyId: s.id,
    resourceId: s.uuid,
    expectedVersion: s.version,
  }),
  links,
  "/editorial/stories/{id}/resources/{uuid}",
  async (v, ctx) => {
    await mutate(
      ctx,
      "resource.remove",
      `${storyPath(v.storyId)}/resources/${v.resourceId}`,
      undefined,
      "DELETE",
      { expectedVersion: v.expectedVersion },
    );
    return getWorkspace(ctx, v.storyId);
  },
  { destructive: true },
);
read(
  "collections.list",
  "Find coordinated coverage collections",
  "List current Collections with planning metadata, permitted story IDs, workflow counts and open work. Collections are the current newsroom coordination model.",
  z.strictObject({
    query: s.text(100).optional(),
    page: z.number().int().min(1).max(100).default(1),
  }),
  z.object({
    collections: z.array(s.collection),
    total: z.number(),
    pages: z.number(),
    timezone: z.string(),
    canCreate: z.boolean(),
  }),
  "/editorial/collections",
  async ({ query: search, ...v }, ctx) =>
    ctx.wp.request(
      query("/byline/v1/editorial/collections", { ...v, search, bounded: 1 }),
    ),
);
read(
  "collection.get",
  "Inspect a complete coverage collection",
  "Read collection planning, permitted story summaries, tasks, shared interviews, resources and authorized activity in one bounded aggregate. Shared contact details and article bodies are excluded.",
  z.strictObject({ collectionId: s.id }),
  s.collectionDetail,
  "/editorial/collections/{id}",
  async (v, ctx) =>
    ctx.wp.request(query(collectionPath(v.collectionId), { bounded: 1 })),
);
const collectionFields = {
  name: s.title,
  brief: s.text(4000).optional(),
  type: z.enum(["event", "ongoing", "series", "project", "other"]).optional(),
  status: z.enum(["planning", "active", "wrapping-up", "archived"]).optional(),
  leadId: s.id.optional(),
  startDate: z.union([s.date, z.literal("")]).optional(),
  endDate: z.union([s.date, z.literal("")]).optional(),
};
write(
  "collection.create",
  "Create a coverage collection",
  "Create an editorial coordination package with name, brief, lead, type and planning dates. Add stories with collection.add_stories.",
  z.strictObject({ ...collectionFields, idempotencyKey: s.idempotencyKey }),
  s.collection,
  "/editorial/collections",
  async ({ idempotencyKey, ...v }, ctx) => {
    const result = await mutate(
      ctx,
      "collection.create",
      "/byline/v1/editorial/collections",
      v,
      "POST",
      { idempotencyKey },
    );
    const wrapped = z.object({ collection: s.collection }).safeParse(result);
    return wrapped.success ? wrapped.data.collection : result;
  },
  { capability: "edit_others_posts", permission: "edit_others_posts" },
);
write(
  "collection.update",
  "Update collection planning",
  "Patch supplied collection planning fields using version from collection.get. Archive via status=archived to preserve stories and reporting relationships.",
  z.strictObject({
    collectionId: s.id,
    expectedVersion: s.version,
    changes: z
      .strictObject(collectionFields)
      .partial()
      .refine((v) => Object.keys(v).length > 0),
  }),
  s.collection,
  "/editorial/collections/{id}",
  async (v, ctx) =>
    mutate(
      ctx,
      "collection.update",
      collectionPath(v.collectionId),
      v.changes,
      "POST",
      { expectedVersion: v.expectedVersion },
    ),
  { permission: "Collection editor, lead or member" },
);
const bulkItem = z.object({
  id: z.union([z.string(), z.number()]),
  ok: z.boolean(),
  error: errorSchema.optional(),
});
const bulkResult = z.object({
  dryRun: z.boolean(),
  results: z.array(bulkItem),
  succeeded: z.number(),
  failed: z.number(),
});
async function bulk<T extends { id: string | number }>(
  items: T[],
  ctx: ToolContext,
  dryRun: boolean,
  run: (v: T) => Promise<unknown>,
) {
  const results = [];
  for (const item of items) {
    try {
      await run(item);
      results.push({ id: item.id, ok: true });
    } catch (error) {
      results.push({
        id: item.id,
        ok: false,
        error: safeError(error, ctx.requestId),
      });
    }
  }
  return {
    dryRun,
    results,
    succeeded: results.filter((i) => i.ok).length,
    failed: results.filter((i) => !i.ok).length,
  };
}
for (const action of ["add_stories", "remove_stories"] as const)
  write(
    `collection.${action}`,
    action === "add_stories"
      ? "Add explicit stories to a collection"
      : "Remove explicit stories from a collection",
    `Change membership for at most 20 explicit story IDs. Each story is separately authorized and each outcome is reported. ${
      action === "remove_stories" ? "Stories themselves remain intact." : ""
    }`,
    z.strictObject({
      collectionId: s.id,
      storyIds: z.array(s.id).min(1).max(20),
      dryRun: z.boolean().default(false),
    }),
    bulkResult,
    "/editorial/collections/{id}/links/story/{target}",
    async (v, ctx) =>
      bulk(
        v.storyIds.map((id) => ({ id })),
        ctx,
        v.dryRun,
        async (item) => {
          if (v.dryRun) {
            const detail = s.collectionDetail.parse(
              await ctx.wp.request(
                query(collectionPath(v.collectionId), { bounded: 1 }),
              ),
            );
            const w = await getWorkspace(ctx, item.id);
            if (!detail.collection.canEdit || w.capabilities.role !== "manager")
              throw new BylineError("forbidden");
            return;
          }
          return mutate(
            ctx,
            `collection.${action}`,
            `${collectionPath(v.collectionId)}/links/story/${item.id}`,
            undefined,
            action === "add_stories" ? "POST" : "DELETE",
          );
        },
      ),
    {
      idempotent: true,
      permission: "Collection edit permission; manager context for every story",
    },
  );
read(
  "interviews.list",
  "Shared interviews in a collection",
  "Read reusable collection interviews, their status, schedule, interviewers and linked story IDs. Distinct from story-scoped appointments and sources; protected contact details are excluded.",
  z.strictObject({ collectionId: s.id }),
  z.object({ interviews: z.array(s.interview) }),
  "/editorial/collections/{id}",
  async (v, ctx) =>
    ctx.wp.request(query(collectionPath(v.collectionId), { bounded: 1 })),
);
const interviewFields = {
  interviewee: s.title,
  status: z
    .enum(["planned", "scheduled", "completed", "follow-up", "cancelled"])
    .optional(),
  scheduleMode: z.enum(["unscheduled", "window", "exact"]).optional(),
  scheduledAt: s.clearTime.optional(),
  endAt: s.clearTime.optional(),
  windowStart: z.union([s.date, z.literal("")]).optional(),
  windowEnd: z.union([s.date, z.literal("")]).optional(),
  location: s.text(240).optional(),
  notes: s.text(2000).optional(),
  followUps: s.text(2000).optional(),
};
write(
  "interview.create",
  "Create a shared collection interview",
  "Create an interview in a coverage collection that can later be linked to several stories and interviewers. Do not use this to create a duplicate of a story appointment.",
  z.strictObject({
    collectionId: s.id,
    ...interviewFields,
    idempotencyKey: s.idempotencyKey,
  }),
  s.interview,
  "/editorial/collections/{id}/interviews",
  async ({ collectionId, idempotencyKey, ...v }, ctx) =>
    mutate(
      ctx,
      "interview.create",
      `${collectionPath(collectionId)}/interviews`,
      v,
      "POST",
      { idempotencyKey },
    ),
  { permission: "Collection edit permission" },
);
write(
  "interview.update",
  "Update a shared collection interview",
  "Patch shared interview details or scheduling using the current updatedAt. Contact fields are intentionally excluded from MCP.",
  z.strictObject({
    collectionId: s.id,
    interviewId: s.id,
    expectedUpdatedAt: s.instant,
    changes: z
      .strictObject(interviewFields)
      .partial()
      .refine((v) => Object.keys(v).length > 0),
  }),
  s.interview,
  "/editorial/collections/{id}/interviews/{id}",
  async (v, ctx) =>
    mutate(
      ctx,
      "interview.update",
      `${collectionPath(v.collectionId)}/interviews/${v.interviewId}`,
      { ...v.changes, expectedUpdatedAt: v.expectedUpdatedAt },
    ),
  { permission: "Collection edit permission" },
);
write(
  "interview.link",
  "Link a shared interview to a story or interviewer",
  "Add or remove an explicit story/interviewer relationship using the canonical collection checks. Add a story to the collection before linking it.",
  z.strictObject({
    collectionId: s.id,
    interviewId: s.id,
    kind: z.enum(["interview-story", "interviewer"]),
    targetId: s.id,
    linked: z.boolean(),
  }),
  result,
  "/editorial/collections/{id}/interviews/{id}/links/{kind}/{target}",
  async (v, ctx) =>
    mutate(
      ctx,
      "interview.link",
      `${collectionPath(v.collectionId)}/interviews/${v.interviewId}/links/${
        v.kind
      }/${v.targetId}`,
      undefined,
      v.linked ? "POST" : "DELETE",
    ),
  {
    idempotent: true,
    permission: "Collection edit permission; linked story manager",
  },
);
const presetId = z.enum([
  "news",
  "sports-recap",
  "opinion",
  "photo-story",
  "breaking",
]);
const preset = z.object({
  id: z.string(),
  label: z.string(),
  section: z.string(),
  workflow: z.object({
    status: z.string(),
    deadlineOffsetDays: z.number().optional(),
    deadlinePolicy: z.string().optional(),
  }),
  tasks: z.array(
    z.object({
      key: z.string(),
      title: z.string().optional(),
      label: z.string().optional(),
      when: z.string(),
      required: z.boolean().optional(),
    }),
  ),
  mediaAssignments: z
    .array(
      z.object({
        title: z.string(),
        type: s.productionType,
        dueOffsetDays: z.number().optional(),
      }),
    )
    .optional(),
});
const presetPayload = z.object({ preset, revision: z.number() });
read(
  "presets.list",
  "Story planning templates",
  "Read existing Byline preset seeds. They seed workflow, deadlines, tasks and production, never article text, fake sources or fabricated appointments.",
  empty,
  z.object({
    presets: z.union([z.array(preset), z.record(z.string(), preset)]),
    types: z.array(z.string()),
    revision: z.number(),
  }),
  "/editorial/presets",
  async (_, ctx) => ctx.wp.request("/byline/v1/editorial/presets"),
);
read(
  "preset.get",
  "Inspect a story template",
  "Read one built-in template and its revision before changing its newsroom defaults.",
  z.strictObject({ presetId }),
  presetPayload,
  "/editorial/presets/{type}",
  async (v, ctx) =>
    ctx.wp.request(`/byline/v1/editorial/presets/${v.presetId}`),
);
write(
  "preset.update",
  "Update a story template",
  "Patch the existing template’s label, section, workflow defaults, starter tasks or production descriptors. This changes future story seeds only.",
  z.strictObject({
    presetId,
    expectedRevision: z.number().int().min(0),
    changes: z
      .strictObject({
        label: s.text(80).min(1).optional(),
        section: s.text(80).optional(),
        workflow: z
          .strictObject({
            status: s.workflow.optional(),
            deadlineOffsetDays: z.number().int().min(0).max(365).optional(),
            deadlinePolicy: z.enum(["none", "relative"]).optional(),
          })
          .optional(),
        tasks: z
          .array(
            z.strictObject({
              key: s.text(60).min(1),
              title: s.title,
              when: z.literal("always"),
              required: z.boolean().optional(),
            }),
          )
          .max(8)
          .optional(),
        mediaAssignments: z
          .array(
            z.strictObject({
              title: s.text(160).min(1),
              type: s.productionType,
              dueOffsetDays: z.number().int().min(0).max(365).optional(),
            }),
          )
          .max(4)
          .optional(),
      })
      .refine((v) => Object.keys(v).length > 0),
  }),
  presetPayload,
  "/editorial/presets/{type}",
  async (v, ctx) =>
    mutate(ctx, "preset.update", `/byline/v1/editorial/presets/${v.presetId}`, {
      changes: v.changes,
      expectedRevision: v.expectedRevision,
    }),
  {
    capability: "canManagePresets",
    permission: "byline_editorial_presets_can_edit",
  },
);
write(
  "preset.reset",
  "Reset a template to built-in defaults",
  "Discard saved overrides for one existing template, using the current preset revision. Existing stories are unaffected.",
  z.strictObject({ presetId, expectedRevision: z.number().int().min(0) }),
  presetPayload,
  "/editorial/presets/{type}/reset",
  async (v, ctx) =>
    mutate(
      ctx,
      "preset.reset",
      `/byline/v1/editorial/presets/${v.presetId}/reset`,
      { expectedRevision: v.expectedRevision },
    ),
  {
    destructive: true,
    capability: "canManagePresets",
    permission: "byline_editorial_presets_can_edit",
  },
);
read(
  "article.get",
  "Read article metadata or explicit draft content",
  "Inspect article version, publication state, excerpt, sections and featured media. Raw Gutenberg block markup is returned ONLY when includeBody=true. Read before editing or publishing.",
  z.strictObject({ storyId: s.id, includeBody: z.boolean().default(false) }),
  s.article,
  "/editorial/articles/{id}",
  async (v, ctx) =>
    ctx.wp.request(
      query(`/byline/v1/editorial/articles/${v.storyId}`, {
        includeBody: v.includeBody,
      }),
    ),
  "edit_post",
);
const articleBase = { storyId: s.id, expectedVersion: s.version };
function articleWrite<I extends z.ZodRawShape>(
  name: string,
  title: string,
  description: string,
  fields: I,
  action: string,
  destructive = false,
  capability?: string,
) {
  write(
    name,
    title,
    description,
    z.strictObject({ ...articleBase, ...fields }),
    s.article,
    `/editorial/articles/{id}/${action}`,
    async (input, ctx) => {
      const { storyId, ...v } = input as {
        storyId: number;
        expectedVersion: string;
      };
      return mutate(
        ctx,
        name,
        `/byline/v1/editorial/articles/${storyId}/${action}`,
        v,
      );
    },
    {
      destructive,
      capability,
      permission: `edit_post; WordPress native controller ${
        action === "publish" || action === "schedule" || action === "unpublish"
          ? "and publish_posts"
          : ""
      }`,
    },
  );
}
articleWrite(
  "article.update_draft",
  "Replace draft Gutenberg content",
  "Replace the full article body of a draft or pending article with supplied raw Gutenberg block markup. Destructive full replacement: require explicit user intent and a version from article.get. Preserve all intended blocks; never convert markup to plain text. Refuses an active editor lock.",
  { blockMarkup: s.text(524288), confirm: z.literal(true) },
  "draft",
  true,
);
articleWrite(
  "story.set_title",
  "Change a story title",
  "Change the canonical WordPress headline using the article version, leaving planning and publication state intact.",
  { title: s.title },
  "title",
);
articleWrite(
  "article.set_excerpt",
  "Set an article excerpt",
  "Replace only the article excerpt using the current article version.",
  { excerpt: s.text(4000) },
  "excerpt",
);
articleWrite(
  "article.set_terms",
  "Set article sections and tags",
  "Replace only supplied section/tag memberships with explicit existing IDs. Empty arrays clear that membership. WordPress enforces taxonomy assignment permissions.",
  {
    sectionIds: z.array(s.id).max(30).optional(),
    tagIds: z.array(s.id).max(30).optional(),
  },
  "terms",
);
articleWrite(
  "article.set_featured_media",
  "Set the featured Media Library image",
  "Select an existing Media Library attachment ID as the article featured image, or zero to clear. No URL download.",
  { mediaId: z.number().int().min(0) },
  "featured-media",
);
articleWrite(
  "article.schedule",
  "Schedule actual WordPress publication",
  "Schedule this article for a specific future publication instant. This is actual WordPress scheduling, separate from a story deadline or planned publication target. Require explicit user intent.",
  { publishAt: s.instant, confirm: z.literal(true) },
  "schedule",
  true,
  "publish_posts",
);
articleWrite(
  "article.unschedule",
  "Return a scheduled article to draft",
  "Cancel actual WordPress scheduled publication and return the article to draft. Require explicit user intent.",
  { confirm: z.literal(true) },
  "unschedule",
  true,
  "publish_posts",
);
articleWrite(
  "article.publish",
  "Publish an article now",
  "Publish this article now with the connected WordPress user. Require the user’s explicit publication request and current article version. Ready for Review is never permission to publish.",
  { confirm: z.literal(true) },
  "publish",
  true,
  "publish_posts",
);
articleWrite(
  "article.unpublish",
  "Unpublish an article",
  "Return a published/private article to draft. This affects public availability and may trigger the normal publication build. Require explicit user intent.",
  { confirm: z.literal(true) },
  "unpublish",
  true,
  "publish_posts",
);
articleWrite(
  "article.trash",
  "Move an article to WordPress Trash",
  "Trash this article using normal delete_post permissions. Removes public availability. Refuses when WordPress Trash is disabled to prevent permanent deletion.",
  { confirm: z.literal(true) },
  "trash",
  true,
);
articleWrite(
  "article.restore",
  "Restore a trashed article as a draft",
  "Restore a trashed article into draft. Does not republish or restore an old scheduled time.",
  {},
  "restore",
);
read(
  "sections.list",
  "Available newsroom sections",
  "List existing WordPress categories/sections for assignment. No taxonomy administration.",
  z.strictObject({
    query: s.text(100).optional(),
    limit: s.limit,
    offset: s.offset,
  }),
  z.object({
    terms: z.array(z.object({ id: s.id, name: z.string(), slug: z.string() })),
  }),
  "/editorial/terms/category",
  async (v, ctx) =>
    ctx.wp.request(query("/byline/v1/editorial/terms/category", v)),
);
read(
  "tags.search",
  "Find existing article tags",
  "Search existing WordPress tags by text for assignment. No arbitrary taxonomy administration.",
  z.strictObject({
    query: s.text(100).optional(),
    limit: s.limit,
    offset: s.offset,
  }),
  z.object({
    terms: z.array(z.object({ id: s.id, name: z.string(), slug: z.string() })),
  }),
  "/editorial/terms/post_tag",
  async (v, ctx) =>
    ctx.wp.request(query("/byline/v1/editorial/terms/post_tag", v)),
);
read(
  "notes.list",
  "Permitted WordPress Article Notes",
  "Read lazy-loaded WordPress Core Notes only when you can edit the article. Workspace participation alone does not grant Notes visibility.",
  z.strictObject({
    storyId: s.id,
    limit: z.number().int().min(1).max(20).default(3),
  }),
  z.object({
    summary: z.object({
      available: z.boolean().optional(),
      canView: z.boolean().optional(),
      openCount: z.number().optional(),
      resolvedCount: z.number().optional(),
      editUrl: z.string().optional(),
    }),
    open: z.array(
      z.object({
        id: z.union([z.number(), z.string()]),
        content: z.string().optional(),
        text: z.string().optional(),
        author: s.person.nullable().optional(),
        createdAt: z.string().optional(),
        excerpt: z.string().optional(),
        replyCount: z.number().optional(),
        updatedAt: z.string().nullable().optional(),
        replies: z
          .array(
            z.object({
              id: z.union([z.number(), z.string()]),
              content: z.string().optional(),
              text: z.string().optional(),
            }),
          )
          .optional(),
      }),
    ),
  }),
  "/editorial/stories/{id}/notes",
  async (v, ctx) =>
    ctx.wp.request(query(`${storyPath(v.storyId)}/notes`, { limit: v.limit })),
  "edit_post",
);
read(
  "activity.story",
  "Story activity history",
  "Read authorized human activity summaries and bounded safe audit metadata. Assignment-only workspace participation does not grant the story activity trail.",
  z.strictObject({
    storyId: s.id,
    limit: z.number().int().min(1).max(50).default(20),
  }),
  z.object({
    items: z.array(s.activity).optional(),
    activity: z.array(s.activity).optional(),
    records: z.array(s.activity).optional(),
  }),
  "/editorial/stories/{id}/activity",
  async (v, ctx) =>
    ctx.wp.request(
      query(`${storyPath(v.storyId)}/activity`, { limit: v.limit }),
    ),
  "Story activity permission",
);
const feedback = z.object({
  id: s.id,
  type: z.string(),
  status: z.string(),
  text: z.string().optional(),
  message: z.string().optional(),
  createdAt: z.string().optional(),
  story: z.object({ id: s.id, title: z.string() }).nullable().optional(),
});
read(
  "feedback.list",
  "Editorial feedback queue",
  "List authorized feedback for editorial triage. Private submitter/contact fields are excluded from MCP output.",
  z.strictObject({
    status: z.enum(["new", "reviewed", "closed", "spam"]).optional(),
    limit: s.limit,
  }),
  z.object({
    feedback: z.array(feedback).optional(),
    items: z.array(feedback).optional(),
    count: z.number().optional(),
  }),
  "/admin/feedback",
  async (v, ctx) => ctx.wp.request(query("/byline/v1/admin/feedback", v)),
  "edit_others_posts or manage_byline",
  "canManageFeedback",
);
read(
  "feedback.get",
  "Inspect editorial feedback",
  "Read one feedback item permitted by the canonical feedback policy.",
  z.strictObject({ feedbackId: s.id }),
  feedback,
  "/admin/feedback/{id}",
  async (v, ctx) => ctx.wp.request(`/byline/v1/admin/feedback/${v.feedbackId}`),
  "Canonical feedback item permission",
  "canManageFeedback",
);
write(
  "feedback.set_status",
  "Triage editorial feedback",
  "Set new, reviewed, closed or spam on one feedback item. This never edits the article itself.",
  z.strictObject({
    feedbackId: s.id,
    status: z.enum(["new", "reviewed", "closed", "spam"]),
  }),
  feedback,
  "/admin/feedback/{id}",
  async ({ feedbackId, ...v }, ctx) =>
    mutate(
      ctx,
      "feedback.set_status",
      `/byline/v1/admin/feedback/${feedbackId}`,
      v,
    ),
  {
    capability: "canManageFeedback",
    permission: "Canonical feedback item permission",
  },
);
const health = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      type: z.string().optional(),
      severity: z.string(),
      problem: z.string().optional(),
      message: z.string().optional(),
      story: z
        .object({ id: s.id, title: z.string(), editUrl: z.string().optional() })
        .nullable()
        .optional(),
      lastCheckedAt: z.string().optional(),
    }),
  ),
  lastRunAt: z.string().nullable().optional(),
  checkedAt: z.string().optional(),
});
read(
  "content_health.list",
  "Content health issues",
  "Read authorized scanner issues. This reports current factual checks, not AI-generated quality judgements.",
  z.strictObject({ storyId: s.id.optional(), limit: s.limit }),
  health,
  "/admin/content-health",
  async ({ storyId, limit }, ctx) =>
    ctx.wp.request(
      query("/byline/v1/admin/content-health", { postId: storyId, limit }),
    ),
);
write(
  "content_health.recheck",
  "Recheck story content health",
  "Run the canonical content health check for one editable story. Does not edit content or mark unfixed issues resolved.",
  storyId,
  health,
  "/admin/content-health/{id}/recheck",
  async (v, ctx) =>
    mutate(
      ctx,
      "content_health.recheck",
      `/byline/v1/admin/content-health/${v.storyId}/recheck`,
      {},
    ),
  { permission: "Canonical content health edit-story permission" },
);
read(
  "system.status",
  "Safe Byline system status",
  "Read the plugin version, WordPress site timezone and permitted deployment lifecycle facts. No hook URLs, environment variables, integration tokens or raw diagnostics.",
  empty,
  z.object({
    version: z.string(),
    timezone: z.string(),
    deployment: z
      .object({
        configured: z.boolean(),
        lastTriggeredAt: z.string().optional(),
        expectedRevision: z.number().optional(),
        jobStatus: z.string().nullable().optional(),
        publicRevision: z.number().optional(),
        pending: z.boolean().optional(),
      })
      .optional(),
  }),
  "/editorial/system",
  async (_, ctx) => ctx.wp.request("/byline/v1/editorial/system"),
);
write(
  "deployment.trigger",
  "Trigger the configured publication deployment",
  "Ask the canonical durable deployment system to queue/coalesce a publication build. Has external side effects; require explicit user intent. Never exposes the deploy hook or its credential.",
  z.strictObject({ confirm: z.literal(true) }),
  z.object({
    configured: z.boolean(),
    pending: z.boolean(),
    jobStatus: z.string().nullable(),
    expectedRevision: z.number(),
    publicRevision: z.number(),
  }),
  "/admin/deployment/trigger",
  async (_, ctx) =>
    mutate(
      ctx,
      "deployment.trigger",
      "/byline/v1/admin/deployment/trigger",
      {},
    ),
  {
    destructive: true,
    capability: "canTriggerDeployment",
    permission: "byline_can_manage_deployment",
  },
);
write(
  "stories.move_many",
  "Move explicit stories between workflow stages",
  "Change workflow for up to 20 explicit stories, each with its own expectedRevision. Returns every success/failure; dryRun validates current access and revisions without writing. Published is derived and cannot be selected.",
  z.strictObject({
    items: z
      .array(
        z.strictObject({
          id: s.id,
          expectedRevision: z.number().int().min(0),
          workflow: s.workflow,
        }),
      )
      .min(1)
      .max(20),
    dryRun: z.boolean().default(false),
  }),
  bulkResult,
  "/editorial/stories/{id}",
  async (v, ctx) =>
    bulk(v.items, ctx, v.dryRun, async (item) => {
      if (v.dryRun) {
        const w = await getWorkspace(ctx, item.id);
        if (!w.capabilities.changeStatus) throw new BylineError("forbidden");
        if (w.revision !== item.expectedRevision)
          throw new BylineError("conflict");
        return;
      }
      return mutate(ctx, "stories.move_many", storyPath(item.id), {
        status: item.workflow,
        expectedRevision: item.expectedRevision,
      });
    }),
);
const poll = z.object({
  id: z.string(),
  postId: s.id,
  question: z.string(),
  status: z.string(),
  opensAt: z.string(),
  closesAt: z.string(),
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      position: z.number().optional(),
      votes: z.number().optional(),
      percentage: z.number().optional(),
    }),
  ),
  totalVotes: z.number().optional(),
});
read(
  "polls.list",
  "Newsroom polls",
  "List polls you can edit when the publication enables polls. Voting records and voter identities are never returned.",
  z.strictObject({ limit: s.limit, offset: s.offset }),
  z.object({ polls: z.array(poll) }),
  "/editorial/polls",
  async (v, ctx) => ctx.wp.request(query("/byline/v1/editorial/polls", v)),
  "edit_byline_polls and object edit_byline_poll",
  "canReadPolls",
);
read(
  "poll.get",
  "Inspect a newsroom poll",
  "Read a permitted poll question, stable option identities, status and schedule without vote records.",
  z.strictObject({ pollId: s.id }),
  poll,
  "/editorial/polls/{id}",
  async (v, ctx) => ctx.wp.request(`/byline/v1/editorial/polls/${v.pollId}`),
  "edit_byline_poll",
  "canReadPolls",
);
read(
  "poll.results",
  "Aggregate poll results",
  "Read aggregate counts and percentages for a poll you may edit. Never returns voter-identifying data or inserts/manipulates votes.",
  z.strictObject({ pollId: s.id }),
  poll,
  "/editorial/polls/{id}?results=true",
  async (v, ctx) =>
    ctx.wp.request(`/byline/v1/editorial/polls/${v.pollId}?results=true`),
  "edit_byline_poll and canonical results capability",
  "canReadPolls",
);
export const tools: readonly ToolDefinition[] = catalog;
