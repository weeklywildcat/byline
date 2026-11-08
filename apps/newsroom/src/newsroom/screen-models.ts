import { storyNoteSummary } from "./story-notes";
import { storyActivity } from "./story-activity";
import type { ContributorEntry, EditorialTask } from "@byline/newsroom-screens/editorial/editorial-model";
import type { HomeBootstrap, HomeVisualWork } from "@byline/newsroom-screens/home/newsroom-model";
import type { PlanningPerson, PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import type {
  HomeAppointment,
  MediaSummary,
  ReportingSummary,
  StoryAppointment,
  StoryMediaAssignment,
  StoryResource,
  StorySource,
  StoryWorkspace,
  WorkspaceCapabilities
} from "@byline/newsroom-screens/workspace/workspace-types";
import { APIError, type PayloadRequest, type Where } from "payload";
import { scopeManages, scopeParticipates, storyScope } from "../access/story-context";
import { atLeast, relationId, relationIds, requestUser, sameId, type NewsroomUser } from "../access/user";
import { WORKFLOW_OPTIONS } from "../domain/vocabulary";
import { effectiveWorkflow, workflowLabel } from "../domain/workflow";
import type { Appointment, CollectionInterview, Media, Person, ProductionAssignment, Section, Source, Story, StoryPlan, Task, User } from "../payload-types";
import { scheduledPublicationsForStories } from "./scheduled-publication";
import { collectionNames } from "./collections";
import { interviewAppointment } from "./schedule";

/**
 * Payload records → the newsroom screens' read models (@byline/newsroom-screens).
 *
 * The screens were written against Byline's own contracts (HomeBootstrap,
 * StoryWorkspace, EditorialTask…), not against WordPress. This module is the
 * Payload side of those contracts. Every read runs as the signed-in user with
 * `overrideAccess: false`, so a participant's workspace holds only the records
 * assigned to them, exactly as Payload access allows.
 *
 * Identity: the screens compare writers and editors by account ID. A byline
 * person with an enabled linked account is `{ kind: "user", id: <user id> }`;
 * a person without one is a guest, `{ kind: "guest", id: <person id> }`.
 */

export type ScreenContext = { req: PayloadRequest; user: NewsroomUser; timeZone: string; admin: string; now: Date };

export function screenContext(req: PayloadRequest, timeZone: string, now = new Date()): ScreenContext {
  const user = requestUser(req);
  if (!user) throw new APIError("Sign in to use the newsroom.", 401);
  return { req, user, timeZone, admin: req.payload.config.routes.admin, now };
}

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });
const num = (value: unknown) => Number(relationId(value));
const LIMITS = { stories: 200, tasks: 100, visualWork: 50, appointments: 100, activity: 16 } as const;

export const STATUSES = [
  ...WORKFLOW_OPTIONS.map((option) => ({ id: option.value, label: option.label, group: option.value === "on-hold" || option.value === "dropped" ? "sidelined" : "main", selectable: true })),
  { id: "published", label: "Published", group: "derived", selectable: false }
];

/* --------------------------------------------------------------- people */

export type People = {
  users: Map<string, Pick<User, "id" | "name" | "role" | "linkedPerson">>;
  personToUser: Map<string, number>;
  persons: Map<string, Pick<Person, "id" | "name" | "slug" | "newsroomRole" | "status">>;
};

export async function loadPeople(ctx: ScreenContext): Promise<People> {
  const [users, persons] = await Promise.all([
    // Everyone, never a first page: a missing account would silently drop someone's name from a byline.
    ctx.req.payload.find({ collection: "users", where: { enabled: { equals: true } }, depth: 0, pagination: false, sort: "name", select: { name: true, role: true, linkedPerson: true }, ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "people", depth: 0, pagination: false, sort: "name", select: { name: true, slug: true, newsroomRole: true, status: true }, ...asUser(ctx) })
  ]);
  const people: People = { users: new Map(), personToUser: new Map(), persons: new Map() };
  for (const user of users.docs) {
    people.users.set(String(user.id), user);
    const person = relationId(user.linkedPerson);
    if (person !== null) people.personToUser.set(String(person), user.id);
  }
  for (const person of persons.docs) people.persons.set(String(person.id), person);
  return people;
}

export function userPerson(people: People, userId: unknown): PlanningPerson | null {
  const user = people.users.get(String(relationId(userId)));
  return user ? { id: user.id, name: user.name, kind: "user", avatarUrl: null } : null;
}

/** A byline person as the screens' contributor entry (account-backed or guest). */
export function contributorEntry(people: People, personId: unknown, order = 0): ContributorEntry | null {
  const id = relationId(personId);
  if (id === null) return null;
  const person = people.persons.get(String(id));
  const userId = people.personToUser.get(String(id));
  const name = person?.name ?? people.users.get(String(userId))?.name;
  if (!name) return null;
  return userId !== undefined
    ? { id: userId, kind: "user", name, role: person?.newsroomRole ?? undefined, slug: person?.slug, order }
    : { id: Number(id), kind: "guest", name, role: person?.newsroomRole ?? undefined, slug: person?.slug, status: person?.status, order };
}

/** Back from a contributor entry to the person on the byline. */
export function personIdFor(people: People, entry: Pick<ContributorEntry, "id" | "kind">): number | null {
  if (entry.kind === "guest") return people.persons.has(String(entry.id)) ? Number(entry.id) : null;
  const linked = relationId(people.users.get(String(entry.id))?.linkedPerson);
  return linked === null ? null : Number(linked);
}

/** Everyone who can be given work: enabled accounts. */
function assignable(people: People): ContributorEntry[] {
  return [...people.users.values()].map((user, order) => ({ id: user.id, kind: "user" as const, name: user.name, order }));
}

/* -------------------------------------------------------------- records */

const RESOURCE_KINDS: Array<[string, string, string]> = [
  ["docs.google.com", "/document/", "Google Doc"],
  ["docs.google.com", "/spreadsheets/", "Google Sheet"],
  ["docs.google.com", "/presentation/", "Google Slides"],
  ["drive.google.com", "/drive/folders/", "Drive folder"],
  ["drive.google.com", "/file/", "Drive file"]
];

/** Deterministic link recognition (as in WordPress); never fetches the document. */
export function resourceKindLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const match = RESOURCE_KINDS.find(([host, prefix]) => parsed.hostname.toLowerCase() === host && parsed.pathname.startsWith(prefix));
    return match ? match[2] : "External link";
  } catch {
    return "External link";
  }
}

export function storyResources(plan: Pick<StoryPlan, "resources"> | null | undefined): StoryResource[] {
  return (plan?.resources ?? []).map((resource, index) => ({
    id: resource.id ?? `link-${index}`,
    label: resource.label,
    url: resource.url,
    kind: resourceKindLabel(resource.url),
    purpose: (resource.purpose ?? "other") as StoryResource["purpose"]
  }));
}

export function assigneeList(people: People, value: unknown) {
  return relationIds(value)
    .map((id) => people.users.get(String(id)))
    .filter((user): user is NonNullable<typeof user> => Boolean(user))
    .map((user) => ({ id: user.id, name: user.name }));
}

export function editorialTask(people: People, task: Task): EditorialTask {
  const assigneeId = relationIds(task.assignees)[0];
  const assignee = assigneeId !== undefined ? people.users.get(String(assigneeId)) : undefined;
  return {
    id: task.id,
    title: task.title,
    state: task.state === "completed" ? "completed" : "open",
    assignee: assignee ? { id: assignee.id, kind: "user", name: assignee.name } : null,
    assigneeId: assignee ? assignee.id : null,
    dueAt: task.due ?? null,
    priority: (task.priority ?? "normal") as EditorialTask["priority"],
    storyId: num(task.story) || null,
    collectionId: num(task.collection) || null,
    createdBy: null,
    completedAt: task.completedAt ?? null,
    order: 0
  };
}

function storySource(people: People, source: Source): StorySource {
  const assignees = assigneeList(people, source.assignees);
  return {
    id: String(source.id),
    label: source.label,
    role: source.role ?? "",
    organization: source.organization ?? "",
    status: (source.status ?? "planned") as StorySource["status"],
    assigneeIds: assignees.map((person) => person.id),
    assignees,
    notes: source.notes ?? "",
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
}

function storyAppointment(people: People, appointment: Appointment, sources: Map<string, string>): StoryAppointment {
  const assignees = assigneeList(people, appointment.assignees);
  const sourceId = relationId(appointment.source);
  return {
    id: String(appointment.id),
    title: appointment.title,
    kind: appointment.kind as StoryAppointment["kind"],
    status: appointment.status as StoryAppointment["status"],
    scheduleMode: appointment.scheduleMode as StoryAppointment["scheduleMode"],
    windowStart: appointment.windowStart ?? null,
    windowEnd: appointment.windowEnd ?? null,
    startAt: appointment.startAt ?? null,
    endAt: appointment.endAt ?? null,
    assigneeIds: assignees.map((person) => person.id),
    assignees,
    sourceId: sourceId === null ? null : String(sourceId),
    sourceLabel: sourceId === null ? null : (sources.get(String(sourceId)) ?? null),
    location: appointment.location ?? "",
    notes: appointment.notes ?? "",
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
}

function mediaAssignment(people: People, row: ProductionAssignment, index: number): StoryMediaAssignment {
  const assigneeId = relationIds(row.assignees)[0];
  const attachments = (Array.isArray(row.media) ? row.media : []).filter((media): media is Media => typeof media === "object" && media !== null);
  return {
    id: String(row.id),
    title: row.title,
    type: row.type as StoryMediaAssignment["type"],
    status: row.status as StoryMediaAssignment["status"],
    assigneeId: assigneeId === undefined ? 0 : Number(assigneeId),
    assignee: assigneeId === undefined ? null : userPerson(people, assigneeId),
    dueAt: row.deadline ?? "",
    notes: row.notes ?? "",
    attachmentIds: relationIds(row.media).map(Number),
    attachments: attachments.map((media) => ({ id: media.id, title: media.filename ?? undefined, url: media.url ?? null, previewUrl: media.thumbnailURL ?? media.url ?? null, mimeType: media.mimeType ?? null, isImage: Boolean(media.mimeType?.startsWith("image/")), alt: media.alt ?? "", creator: media.creator ?? "", creditText: media.credit ?? "" })),
    invalidAttachmentIds: [],
    mediaReadiness: null,
    featuredAttachmentId: null,
    order: index,
    isLegacy: row.legacyAssignmentId === "legacy-v1",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const openAppointment = (appointment: Pick<Appointment, "status">) => appointment.status !== "completed" && appointment.status !== "cancelled";

/** The note-free reporting roll-up (byline_story_reporting_summary). */
export function reportingSummary(sources: Pick<Source, "status">[], appointments: Appointment[], now: Date, today: string): ReportingSummary {
  const open = appointments.filter(openAppointment);
  const sortKey = (appointment: Appointment) => appointment.startAt ?? appointment.windowStart ?? "9999";
  const next = [...open]
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .find((appointment) =>
      appointment.scheduleMode === "exact"
        ? (appointment.endAt ?? appointment.startAt ?? "") >= now.toISOString()
        : appointment.scheduleMode === "window" && (appointment.windowEnd ?? appointment.windowStart ?? "") >= today
    );
  return {
    sources: sources.length,
    interviewed: sources.filter((source) => source.status === "interviewed").length,
    needsScheduling: sources.filter((source) => source.status === "needs-scheduling").length,
    toSchedule: open.filter((appointment) => appointment.scheduleMode !== "exact").length,
    nextAppointment: next
      ? { id: String(next.id), title: next.title, startAt: next.startAt ?? null, windowStart: next.windowStart ?? null, windowEnd: next.windowEnd ?? null, scheduleMode: next.scheduleMode as StoryAppointment["scheduleMode"] }
      : null
  };
}

function mediaSummary(rows: ProductionAssignment[]): MediaSummary {
  const open = rows.filter((row) => row.status !== "done");
  const due = open.map((row) => row.deadline).filter((value): value is string => Boolean(value)).sort();
  return { total: rows.length, open: open.length, assigneeIds: [...new Set(open.flatMap((row) => relationIds(row.assignees).map(Number)))], nextDueAt: due[0] ?? null };
}

/* -------------------------------------------------------------- stories */

export type StoryExtras = {
  tasks: Task[];
  production: ProductionAssignment[];
  sources: Source[];
  appointments: Appointment[];
  /** The next scheduled publish of an unpublished story, from Payload's own schedule; null when none. */
  scheduledAt: string | null;
};

function featured(story: Story): PlanningStory["featuredImage"] {
  const media = story.featuredMedia;
  if (!media || typeof media !== "object") return null;
  return { id: media.id, url: media.url ?? null, alt: media.alt ?? null, width: media.width ?? null, height: media.height ?? null };
}

/** published, then scheduled, then draft: the live story decides first, and none of it depends on the newsroom workflow. */
export function publicationState(story: Pick<Story, "_status" | "publishedAt">, scheduledAt: string | null): PlanningStory["publicationState"] {
  if (story._status === "published") return { id: "published", label: scheduledAt ? "Published · changes scheduled" : "Published", isPublished: true, isScheduled: Boolean(scheduledAt), scheduledAt, publishedAt: story.publishedAt ?? null };
  if (scheduledAt) return { id: "scheduled", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt, publishedAt: null };
  return { id: "draft", label: "Draft", isPublished: false, isScheduled: false, scheduledAt: null, publishedAt: story.publishedAt ?? null };
}

export function planningStory(ctx: ScreenContext, people: People, story: Story, plan: StoryPlan | null, extras: StoryExtras): PlanningStory & { reporting: ReportingSummary; mediaSummary: MediaSummary } {
  const published = story._status === "published";
  const workflow = effectiveWorkflow(plan?.workflow, story._status);
  const status = STATUSES.find((entry) => entry.id === workflow)!;
  const authors = relationIds(story.contributors)
    .map((id, order) => contributorEntry(people, id, order))
    .filter((entry): entry is ContributorEntry => entry !== null)
    .map((entry) => ({ id: Number(entry.id), name: entry.name, kind: entry.kind }));
  const writer = userPerson(people, plan?.createdBy) ?? authors.find((author) => author.kind === "user") ?? null;
  const primary = extras.production.find((row) => row.status !== "done") ?? extras.production[0];
  const section = story.section && typeof story.section === "object" ? (story.section as Section).name : null;
  const manages = scopeManagesSync(ctx, plan);
  return {
    id: story.id,
    title: story.headline?.trim() || "Untitled story",
    editUrl: `${ctx.admin}/collections/stories/${story.id}`,
    previewUrl: "",
    sections: section ? [section] : [],
    canEditPlanning: manages,
    authors,
    writer,
    editor: userPerson(people, plan?.editor),
    workflow: { id: status.id, label: workflowLabel(workflow), group: status.group as PlanningStory["workflow"]["group"], selectable: status.selectable },
    publicationState: publicationState(story, extras.scheduledAt),
    deadline: plan?.deadline ?? null,
    plannedPublication: plan?.plannedPublication ?? null,
    modifiedAt: story.updatedAt,
    visual: primary ? { type: primary.type as PlanningStory["visual"]["type"], status: primary.status as PlanningStory["visual"]["status"], label: primary.title } : { type: "none", status: "needed" },
    openTaskCount: extras.tasks.filter((task) => task.state !== "completed").length,
    featuredImage: featured(story),
    needsReview: workflow === "ready",
    reporting: reportingSummary(extras.sources, extras.appointments, ctx.now, localToday(ctx)),
    mediaSummary: mediaSummary(extras.production),
    notes: null
  };
}

// The plan alone decides management for the row (the full check is storyScope on mutations).
function scopeManagesSync(ctx: ScreenContext, plan: StoryPlan | null): boolean {
  if (atLeast(ctx.user, "editor")) return true;
  if (!plan) return false;
  return sameId(plan.createdBy, ctx.user.id) || sameId(plan.editor, ctx.user.id) || (ctx.user.linkedPerson !== null && relationIds(plan.contributors).some((id) => sameId(id, ctx.user.linkedPerson)));
}

export function localToday(ctx: ScreenContext) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ctx.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ctx.now);
}

const storySelect = { headline: true, _status: true, section: true, contributors: true, featuredMedia: true, updatedAt: true, publishedAt: true, format: true, video: true } as const;

/**
 * Stories with their work, complete: `pagination: false` with no `limit`, because
 * Payload still applies a limit when pagination is off and a capped read would
 * silently drop stories, tasks or assignments.
 *
 * Draft saves live in the versions table, so the newsroom reads each story's
 * latest draft. An unpublished rewrite of a published story is its managers'
 * work in progress (Stories `readVersions`): someone who only holds an
 * assignment on it reads the published story, never the rewrite. A rewrite
 * never makes a published story read as unpublished.
 */
export async function storiesWithExtras(ctx: ScreenContext, ids: number[]) {
  if (ids.length === 0) return { stories: [] as Story[], extras: new Map<number, StoryExtras>() };
  const byStory = { story: { in: ids } } satisfies Where;
  const all = { depth: 0, pagination: false, sort: "createdAt", ...asUser(ctx) } as const;
  const [stories, tasks, production, sources, appointments] = await Promise.all([
    readableStories(ctx, ids, storySelect, 1),
    ctx.req.payload.find({ collection: "tasks", where: byStory, ...all }),
    ctx.req.payload.find({ collection: "production-assignments", where: byStory, ...all }),
    ctx.req.payload.find({ collection: "sources", where: byStory, ...all, select: { story: true, status: true } }),
    ctx.req.payload.find({ collection: "appointments", where: byStory, ...all })
  ]);
  const extras = new Map<number, StoryExtras>(ids.map((id) => [id, { tasks: [], production: [], sources: [], appointments: [], scheduledAt: null }]));
  // A published story's upcoming rewrite is private to its managers, just like the rewrite itself.
  const scope = await storyScope(ctx.req);
  const scheduled = await scheduledPublicationsForStories(ctx, stories.filter((story) => story._status !== "published" || scopeManages(scope, story.id)).map((story) => story.id));
  for (const [id, at] of scheduled) {
    const entry = extras.get(id);
    if (entry) entry.scheduledAt = at;
  }
  for (const task of tasks.docs) extras.get(num(task.story))?.tasks.push(task);
  for (const row of production.docs) extras.get(num(row.story))?.production.push(row);
  for (const source of sources.docs) extras.get(num(source.story))?.sources.push(source as Source);
  for (const appointment of appointments.docs) extras.get(num(appointment.story))?.appointments.push(appointment);
  return { stories, extras };
}

/**
 * The stories this user may read, as they should see them: a manager reads
 * the latest draft (with the live publication state), anyone else the
 * published story, never an unpublished rewrite of it. Complete (no limit).
 */
export async function readableStories<S extends Record<string, true>>(ctx: ScreenContext, ids: number[], select: S, depth = 0): Promise<Story[]> {
  if (ids.length === 0) return [];
  const fields = { ...select, _status: true, publishedAt: true } as const;
  const [drafts, live, scope] = await Promise.all([
    ctx.req.payload.find({ collection: "stories", where: { id: { in: ids } }, draft: true, depth, pagination: false, select: fields, ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "stories", where: { id: { in: ids } }, depth, pagination: false, select: fields, ...asUser(ctx) }),
    storyScope(ctx.req)
  ]);
  // Whether a story is live comes from the story itself: a pending rewrite's version reads "draft".
  const liveById = new Map((live.docs as Story[]).map((story) => [story.id, story]));
  return (drafts.docs as Story[]).map((draft) => {
    const current = liveById.get(draft.id);
    if (current?._status !== "published") return draft;
    return scopeManages(scope, draft.id) ? { ...draft, _status: current._status, publishedAt: current.publishedAt } : current;
  });
}

/* ----------------------------------------------------------------- Home */

export async function homeBootstrap(ctx: ScreenContext): Promise<HomeBootstrap> {
  const errors: HomeBootstrap["errors"] = {};
  const people = await loadPeople(ctx);
  const me = userPerson(people, ctx.user.id) ?? { id: Number(ctx.user.id), name: "You", kind: "user" as const };
  const editor = atLeast(ctx.user, "editor");
  const mine = { assignees: { in: [ctx.user.id] } } satisfies Where;

  // Plans are access-limited: editors see the whole newsroom, staff their own and assigned stories.
  const [plans, tasks, visual, appointments, interviews] = await Promise.all([
    ctx.req.payload.find({ collection: "story-plans", where: { workflow: { not_equals: "dropped" } }, depth: 0, limit: LIMITS.stories, sort: "-updatedAt", ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "tasks", where: { and: [mine, { state: { equals: "open" } }] }, depth: 0, limit: LIMITS.tasks, sort: "due", ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "production-assignments", where: { and: [mine, { status: { not_equals: "done" } }] }, depth: 0, limit: LIMITS.visualWork, sort: "deadline", ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "appointments", where: { and: [mine, { status: { not_in: ["completed", "cancelled"] } }] }, depth: 0, limit: LIMITS.appointments, sort: "startAt", ...asUser(ctx) }),
    // Shared Collection interviews I'm conducting: Home's upcoming and scheduling signals, linking to the Collection.
    ctx.req.payload.find({ collection: "collection-interviews", where: { and: [{ interviewers: { in: [ctx.user.id] } }, { status: { not_in: ["completed", "follow-up", "cancelled"] } }] }, depth: 0, limit: LIMITS.appointments, sort: "startAt", select: { collection: true, interviewee: true, status: true, scheduleMode: true, windowStart: true, windowEnd: true, startAt: true, endAt: true, interviewers: true, location: true }, ...asUser(ctx) })
  ]);
  const planByStory = new Map(plans.docs.map((plan) => [num(plan.story), plan]));
  const ids = [...new Set([...planByStory.keys(), ...tasks.docs.map((t) => num(t.story)), ...visual.docs.map((v) => num(v.story)), ...appointments.docs.map((a) => num(a.story))])].filter(Number.isFinite);
  const { stories, extras } = await storiesWithExtras(ctx, ids);
  const rows = stories.map((story) => planningStory(ctx, people, story, planByStory.get(story.id) ?? null, extras.get(story.id)!));
  const title = (id: number) => rows.find((row) => row.id === id)?.title ?? "Story";
  const shared = interviews.docs as CollectionInterview[];
  const collectionTitles = await collectionNames(ctx, [...new Set(shared.map((row) => num(row.collection)))]);

  return {
    currentUser: me,
    people: assignable(people),
    timezone: ctx.timeZone,
    now: ctx.now.toISOString(),
    capabilities: { review: editor, createStory: true, uploadMedia: true },
    stories: rows,
    tasks: tasks.docs.map((task) => editorialTask(people, task)),
    visualWork: visual.docs.map((row): HomeVisualWork => {
      const assigneeId = relationIds(row.assignees)[0];
      return {
        id: String(row.id),
        story: { id: num(row.story), title: title(num(row.story)), editUrl: `${ctx.admin}/collections/stories/${num(row.story)}` },
        title: row.title,
        type: row.type as HomeVisualWork["type"],
        status: row.status as HomeVisualWork["status"],
        assignee: assigneeId === undefined ? null : userPerson(people, assigneeId),
        dueAt: row.deadline ?? null,
        notes: row.notes ?? "",
        attachmentIds: relationIds(row.media).map(Number)
      };
    }),
    appointments: [
      ...appointments.docs.map((appointment): HomeAppointment => {
        const { notes: _notes, assignees: _assignees, assigneeIds: _ids, createdAt: _c, updatedAt: _u, ...rest } = storyAppointment(people, appointment, new Map());
        return { ...rest, storyId: num(appointment.story), storyTitle: title(num(appointment.story)) };
      }),
      ...shared.map((row): HomeAppointment => {
        const { assignees: _assignees, assigneeIds: _ids, ...rest } = interviewAppointment(people, row, collectionTitles);
        return rest;
      })
    ],
    activity: await storyActivity(ctx, new Map(rows.map((row) => [row.id, row.title])), LIMITS.activity),
    errors,
    limits: { ...LIMITS }
  };
}

export async function searchStories(ctx: ScreenContext, query: string) {
  const text = query.trim().slice(0, 120);
  if (text.length < 2) return { stories: [] };
  const scope = await storyScope(ctx.req);
  if (!scope) return { stories: [] };
  const matches: Where = { or: [{ headline: { like: text } }, { deck: { like: text } }, { slug: { like: text } }] };
  const search = { collection: "stories", depth: 0, limit: 8, sort: "-updatedAt", select: { headline: true, slug: true, updatedAt: true }, ...asUser(ctx) } as const;
  const [drafts, publicRows] = await Promise.all([
    scope.all || scope.managed.length ? ctx.req.payload.find({
      ...search, draft: true, where: scope.all ? matches : { and: [matches, { id: { in: scope.managed } }] }
    }) : { docs: [] },
    scope.all ? { docs: [] } : ctx.req.payload.find({
      ...search, draft: false, where: { and: [matches, { _status: { equals: "published" } }, ...(scope.managed.length ? [{ id: { not_in: scope.managed } }] : [])] }
    })
  ]);
  return { stories: [...drafts.docs, ...publicRows.docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map((story) => ({
    id: story.id, title: story.headline?.trim() || "Untitled story", detail: story.slug
  })) };
}

/* ------------------------------------------------------------ Workspace */

export async function storyWorkspace(ctx: ScreenContext, storyId: number): Promise<StoryWorkspace> {
  const scope = await storyScope(ctx.req);
  const manager = scopeManages(scope, storyId);
  if (!manager && !scopeParticipates(scope, storyId)) throw new APIError("You are not part of this story.", 403);
  const people = await loadPeople(ctx);
  const plans = await ctx.req.payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, depth: 0, limit: 1, ...asUser(ctx) });
  const plan = plans.docs[0] ?? null;
  const { stories, extras } = await storiesWithExtras(ctx, [storyId]);
  const story = stories[0];
  if (!story) throw new APIError("This story does not exist.", 404);
  const work = extras.get(storyId)!;
  // Appointments need their sources' labels; sources need their notes, so read them in full.
  const sources = await ctx.req.payload.find({ collection: "sources", where: { story: { equals: storyId } }, depth: 0, limit: 100, sort: "createdAt", ...asUser(ctx) });
  const sourceLabels = new Map(sources.docs.map((source) => [String(source.id), source.label]));
  const production = await ctx.req.payload.find({ collection: "production-assignments", where: { story: { equals: storyId } }, depth: 1, limit: 100, sort: "createdAt", ...asUser(ctx) });
  const row = planningStory(ctx, people, story, plan, work);
  const editor = atLeast(ctx.user, "editor");
  const capabilities: WorkspaceCapabilities = manager
    ? { role: "manager", editArticle: true, changeStatus: true, assign: editor, editContributors: true, editBrief: true, manageReporting: true, addSource: true, addAppointment: true, manageMedia: true, assignMedia: editor, addTask: true, manageResources: true, review: editor }
    : { role: "participant", editArticle: false, changeStatus: false, assign: false, editContributors: false, editBrief: false, manageReporting: false, addSource: false, addAppointment: true, manageMedia: false, assignMedia: false, addTask: false, manageResources: false, review: false };
  const contributors = relationIds(story.contributors).map((id, order) => contributorEntry(people, id, order)).filter((entry): entry is ContributorEntry => entry !== null);
  const everyone = [...people.persons.keys()].map((id, order) => contributorEntry(people, id, order)).filter((entry): entry is ContributorEntry => entry !== null);

  return {
    story: { ...row, notes: await storyNoteSummary(ctx, storyId) },
    // Plans have no counter; their last change time detects stale workflow edits.
    revision: plan ? Date.parse(plan.updatedAt) : 0,
    timezone: ctx.timeZone,
    now: ctx.now.toISOString(),
    currentUser: userPerson(people, ctx.user.id),
    brief: plan?.brief ?? "",
    format: { format: story.format === "video" ? "video" : "standard", videoUrl: story.video?.url ?? "", video: null },
    sections: row.sections ?? [],
    contributors: { storyId, contributors, available: manager ? everyone : [], canEdit: manager, canCreateGuests: manager && editor },
    statuses: STATUSES,
    tasks: work.tasks.map((task) => editorialTask(people, task)),
    sources: sources.docs.map((source) => storySource(people, source)),
    appointments: work.appointments.map((appointment) => storyAppointment(people, appointment, sourceLabels)),
    reporting: row.reporting,
    mediaAssignments: production.docs.map((assignment, index) => mediaAssignment(people, assignment, index)),
    resources: storyResources(plan),
    activity: await storyActivity(ctx, new Map([[storyId, row.title]]), 30),
    previewUrl: "",
    people: manager ? assignable(people) : assignable(people).filter((person) => sameId(person.id, ctx.user.id)),
    capabilities,
    errors: {}
  };
}

export async function planFor(ctx: ScreenContext, storyId: number) {
  const plans = await ctx.req.payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, depth: 0, limit: 1, ...asUser(ctx) });
  const plan = plans.docs[0];
  if (!plan) throw new APIError("You are not part of this story.", 403);
  return plan;
}


/* ------------------------------------------- workspace mutation responses */

/** Sources, appointments and their roll-up, as this user may see them (ReportingResponse). */
export async function reportingFor(ctx: ScreenContext, storyId: number, people?: People) {
  const everyone = people ?? (await loadPeople(ctx));
  const byStory = { story: { equals: storyId } } satisfies Where;
  const [sources, appointments] = await Promise.all([
    ctx.req.payload.find({ collection: "sources", where: byStory, depth: 0, limit: 100, sort: "createdAt", ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "appointments", where: byStory, depth: 0, limit: 100, sort: "createdAt", ...asUser(ctx) })
  ]);
  const labels = new Map(sources.docs.map((source) => [String(source.id), source.label]));
  return {
    sources: sources.docs.map((source) => storySource(everyone, source)),
    appointments: appointments.docs.map((appointment) => storyAppointment(everyone, appointment, labels)),
    summary: reportingSummary(sources.docs, appointments.docs, ctx.now, localToday(ctx))
  };
}

/** Production assignments, as this user may see them (MediaAssignmentsResponse). */
export async function mediaFor(ctx: ScreenContext, storyId: number) {
  const people = await loadPeople(ctx);
  const rows = await ctx.req.payload.find({ collection: "production-assignments", where: { story: { equals: storyId } }, depth: 1, limit: 100, sort: "createdAt", ...asUser(ctx) });
  return { mediaAssignments: rows.docs.map((row, index) => mediaAssignment(people, row, index)) };
}
