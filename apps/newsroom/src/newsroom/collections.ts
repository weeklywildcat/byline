import type { ContributorEntry, EditorialTask } from "@byline/newsroom-screens/editorial/editorial-model";
import type {
  Collection,
  CollectionDetail,
  CollectionInput,
  CollectionList,
  CollectionListQuery,
  Interview,
  InterviewInput,
  PublicCoveragePresentation,
  ResourceInput,
  SharedResource,
  StoryCollections
} from "@byline/newsroom-screens/collections/collection-model";
import { normalizeCollectionQuery } from "@byline/newsroom-screens/collections/collection-model";
import type { PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import type { ScheduleAppointment } from "@byline/newsroom-screens/workspace/workspace-types";
import { APIError, type Where } from "payload";
import {
  collectionCanArchive,
  collectionCanCreate,
  collectionCanManage,
  collectionCanManagePublic,
  collectionCanManageTeam,
  collectionScope,
  resetCollectionScope,
  type CollectionScope
} from "../access/collection-context";
import { inIds, scopeManages, storyScope } from "../access/story-context";
import { atLeast, relationId, relationIds, sameId } from "../access/user";
import { localToInstant } from "../domain/dates";
import { COLLECTION_STATUSES, COLLECTION_TYPES, RESOURCE_KIND_OPTIONS, type CollectionStatus, type CollectionType, type ResourceKind } from "../domain/vocabulary";
import { effectiveWorkflow, workflowLabel } from "../domain/workflow";
import type { Appointment, Collection as CollectionDoc, CollectionInterview, CollectionResource, Media, StoryPlan, Task } from "../payload-types";
import { assigneeList, editorialTask, loadPeople, planningStory, readableStories, resourceKindLabel, storiesWithExtras, userPerson, type People, type ScreenContext } from "./screen-models";

/**
 * Collections' read and write models (`/api/byline/collections/...`): the
 * shared screens' neutral DTOs (collection-model.ts), never raw Payload
 * documents. Every read and write runs as the signed-in user
 * (`overrideAccess: false`); Collection permissions come from
 * access/collection-context.ts, and story privacy from the same readable-story
 * rules as Planning, Home and the Calendar, so a Collection is never a side
 * channel for a story the reader cannot see. A system write is used only where
 * the access layer has already decided (reusing a resource another Collection
 * owns), and says so.
 */

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });
const asSystem = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: true as const, context: { bylineSystem: true } });
const all = { depth: 0, pagination: false } as const;
const num = (value: unknown) => Number(relationId(value));
const ids = (value: unknown) => relationIds(value).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
const unique = <T,>(values: T[]) => [...new Set(values)];

function forbidden(message: string): never {
  throw new APIError(message, 403);
}

async function scopeOf(ctx: ScreenContext): Promise<CollectionScope> {
  const scope = await collectionScope(ctx.req);
  if (!scope) throw new APIError("Sign in to use the newsroom.", 401);
  return scope;
}

/** The public page for a presentation that is actually live: the WordPress-authoritative site's, until cutover. */
function publicUrl(doc: CollectionDoc): string {
  const site = process.env.BYLINE_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const presentation = doc.publicPresentation;
  // Only a coverage WordPress already publishes is live; a Payload-only presentation is not, yet.
  return site && presentation?.enabled && presentation.slug && doc.legacyWordPressId ? `${site}/coverage/${presentation.slug}/` : "";
}

function presentationDto(doc: CollectionDoc, media: Map<number, Media>): PublicCoveragePresentation {
  const p = doc.publicPresentation ?? {};
  const artwork = num(p.artwork) || 0;
  return {
    publicEnabled: p.enabled === true,
    publicFormat: p.format === "series" ? "series" : "coverage",
    publicTitle: p.title ?? "",
    publicSlug: p.slug ?? "",
    publicDescription: p.description ?? "",
    publicOverview: p.overview ?? "",
    artworkAttachmentId: artwork,
    artworkPreviewUrl: artwork ? previewUrl(media.get(artwork)) : null,
    featuredStoryId: num(p.featuredStory) || 0,
    storyOrder: ids(p.storyOrder)
  };
}

const previewUrl = (media: Media | undefined) => (media ? (media.sizes?.library?.url ?? media.thumbnailURL ?? media.url ?? null) : null);

/** Collection DTOs for a page of documents: a fixed number of batched reads, whatever the page holds. */
async function collectionRows(ctx: ScreenContext, docs: CollectionDoc[], people?: People): Promise<{ rows: Collection[]; readable: Set<number> }> {
  if (!docs.length) return { rows: [], readable: new Set() };
  const scope = await scopeOf(ctx);
  const everyone = people ?? (await loadPeople(ctx));
  const docIds = docs.map((doc) => doc.id);
  const storyIds = unique(docs.flatMap((doc) => ids(doc.stories)));
  const artwork = unique(docs.map((doc) => num(doc.publicPresentation?.artwork)).filter((id) => id > 0));
  const [stories, interviews, tasks, media] = await Promise.all([
    readableStories(ctx, storyIds, { headline: true }),
    ctx.req.payload.find({ collection: "collection-interviews", where: { collection: { in: docIds } }, select: { collection: true }, ...all, ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "tasks", where: { and: [{ collection: { in: docIds } }, { state: { equals: "open" } }] }, select: { collection: true }, ...all, ...asUser(ctx) }),
    artwork.length ? ctx.req.payload.find({ collection: "media", where: { id: { in: artwork } }, select: { url: true, thumbnailURL: true, sizes: true }, ...all, ...asUser(ctx) }) : Promise.resolve({ docs: [] as Media[] })
  ]);
  const readable = new Set(stories.map((story) => story.id));
  const unpublished = stories.filter((story) => story._status !== "published").map((story) => story.id);
  const plans = unpublished.length
    ? await ctx.req.payload.find({ collection: "story-plans", where: { story: { in: unpublished } }, select: { story: true, workflow: true }, ...all, ...asUser(ctx) })
    : { docs: [] as StoryPlan[] };
  const stage = new Map<number, string>();
  for (const story of stories) stage.set(story.id, workflowLabel(effectiveWorkflow(undefined, story._status)));
  for (const plan of plans.docs) {
    const story = stories.find((item) => item.id === num(plan.story));
    if (story) stage.set(story.id, workflowLabel(effectiveWorkflow(plan.workflow, story._status)));
  }
  const count = (rows: Array<{ collection?: unknown }>) => {
    const counts = new Map<number, number>();
    for (const row of rows) counts.set(num(row.collection), (counts.get(num(row.collection)) ?? 0) + 1);
    return counts;
  };
  const interviewCounts = count(interviews.docs);
  const taskCounts = count(tasks.docs);
  const mediaById = new Map((media.docs as Media[]).map((item) => [item.id, item]));
  const rows = docs.map((doc): Collection => {
    const members = ids(doc.stories).filter((id) => readable.has(id));
    const summary: Record<string, number> = {};
    for (const id of members) summary[stage.get(id) ?? "Pitch"] = (summary[stage.get(id) ?? "Pitch"] ?? 0) + 1;
    const editor = atLeast(scope.user, "editor");
    return {
      id: doc.id,
      name: doc.name,
      brief: doc.brief ?? "",
      type: doc.type as Collection["type"],
      status: doc.status as Collection["status"],
      lead: userPerson(everyone, doc.lead),
      members: ids(doc.members).map((id) => userPerson(everyone, id)).filter((person): person is NonNullable<typeof person> => person !== null),
      startDate: doc.startDate ?? "",
      endDate: doc.endDate ?? "",
      archived: doc.status === "archived",
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      storyIds: members,
      storyCount: members.length,
      storySummary: summary,
      interviewCount: interviewCounts.get(doc.id) ?? 0,
      openTaskCount: taskCounts.get(doc.id) ?? 0,
      publicPresentation: presentationDto(doc, mediaById),
      publicUrl: publicUrl(doc),
      canPublish: collectionCanManagePublic(scope.user),
      canEdit: collectionCanManage(scope, doc.id),
      canManageTeam: collectionCanManageTeam(scope, doc.id),
      canArchive: collectionCanArchive(scope.user),
      canDuplicate: editor
    };
  });
  return { rows, readable };
}

/* ------------------------------------------------------------------ list */

export function parseCollectionQuery(params: URLSearchParams): CollectionListQuery {
  return normalizeCollectionQuery(Object.fromEntries(params.entries()));
}

const SORT: Record<CollectionListQuery["sort"], string[]> = { updated: ["-updatedAt", "-id"], name: ["name", "id"], start: ["startDate", "id"] };

/**
 * One page of the Collections list, filtered and sorted in PostgreSQL (never
 * every Collection loaded to filter in the browser). Mine is the reader's own
 * team: lead or member, never inferred from story assignments.
 */
export async function collectionList(ctx: ScreenContext, query: CollectionListQuery): Promise<CollectionList> {
  const conditions: Where[] = [];
  if (query.view === "active") conditions.push({ status: { not_equals: "archived" } });
  if (query.view === "archived") conditions.push({ status: { equals: "archived" } });
  if (query.view === "mine") conditions.push({ or: [{ lead: { equals: ctx.user.id } }, { members: { in: [ctx.user.id] } }] });
  if (query.search) conditions.push({ name: { like: query.search } });
  if (query.type) conditions.push({ type: { equals: query.type } });
  if (query.status) conditions.push({ status: { equals: query.status } });
  if (query.person) conditions.push({ or: [{ lead: { equals: query.person } }, { members: { in: [query.person] } }] });
  const limit = query.limit ?? 50;
  const [people, found] = await Promise.all([
    loadPeople(ctx),
    ctx.req.payload.find({ collection: "collections", where: conditions.length ? { and: conditions } : undefined, sort: SORT[query.sort], page: query.page, limit, depth: 0, ...asUser(ctx) })
  ]);
  const { rows } = await collectionRows(ctx, found.docs as CollectionDoc[], people);
  return {
    collections: rows,
    people: assignablePeople(people),
    timezone: ctx.timeZone,
    canCreate: collectionCanCreate(ctx.user),
    capabilities: { canCreate: collectionCanCreate(ctx.user), activity: false },
    total: found.totalDocs,
    pages: Math.max(1, found.totalPages)
  };
}

function assignablePeople(people: People): ContributorEntry[] {
  return [...people.users.values()].map((user, order) => ({ id: user.id, kind: "user" as const, name: user.name, order }));
}

/* ---------------------------------------------------------------- detail */

async function collectionDoc(ctx: ScreenContext, id: number): Promise<CollectionDoc> {
  const found = await ctx.req.payload.find({ collection: "collections", where: { id: { equals: id } }, depth: 0, limit: 1, ...asUser(ctx) });
  const doc = found.docs[0] as CollectionDoc | undefined;
  if (!doc) throw new APIError("That Collection no longer exists.", 404);
  return doc;
}

function interviewDto(people: People, row: CollectionInterview, readable: Set<number>, canManage: boolean): Interview {
  const interviewers = assigneeList(people, row.interviewers).map((person) => ({ ...person, kind: "user" as const }));
  return {
    id: row.id,
    collectionId: num(row.collection),
    interviewee: row.interviewee,
    status: row.status as Interview["status"],
    scheduleMode: row.scheduleMode as Interview["scheduleMode"],
    windowStart: row.windowStart ?? "",
    windowEnd: row.windowEnd ?? "",
    scheduledAt: row.startAt ?? "",
    endAt: row.endAt ?? "",
    location: row.location ?? "",
    completedAt: row.completedAt ?? "",
    interviewers,
    storyIds: ids(row.stories).filter((id) => readable.has(id)),
    notes: row.notes ?? "",
    followUps: row.followUps ?? "",
    resourceIds: ids(row.resources),
    // Field access already removed it for anyone outside the team; never even send an empty field to them.
    ...(canManage ? { privateContact: row.privateContact ?? "", canEditContact: true } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canEdit: canManage
  };
}

function resourceDto(row: CollectionResource, readable: Set<number>, media: Map<number, Media>): SharedResource {
  const file = num(row.media) || 0;
  const asset = media.get(file);
  const url = row.url || asset?.url || "";
  const kind = (RESOURCE_KIND_OPTIONS.find((option) => option.value === row.kind)?.label ?? "Web link") as string;
  return {
    id: row.id,
    label: row.label,
    url,
    kind: file ? (row.kind === "link" ? "Media file" : kind) : row.kind === "link" ? resourceKindLabel(url) : kind,
    attachmentId: file,
    storyIds: ids(row.stories).filter((id) => readable.has(id)),
    collectionCount: ids(row.collections).length
  };
}

async function mediaFor(ctx: ScreenContext, mediaIds: number[]) {
  if (!mediaIds.length) return new Map<number, Media>();
  const found = await ctx.req.payload.find({ collection: "media", where: { id: { in: mediaIds } }, select: { url: true, filename: true, mimeType: true, thumbnailURL: true, sizes: true }, ...all, ...asUser(ctx) });
  return new Map((found.docs as Media[]).map((item) => [item.id, item]));
}

/** A shared-feed appointment (Calendar's shape, never notes). */
function scheduleAppointment(people: People, row: Appointment, titles: Map<number, string>): ScheduleAppointment {
  const assignees = assigneeList(people, row.assignees);
  return {
    id: String(row.id),
    title: row.title,
    kind: row.kind as ScheduleAppointment["kind"],
    status: row.status as ScheduleAppointment["status"],
    scheduleMode: row.scheduleMode as ScheduleAppointment["scheduleMode"],
    windowStart: row.windowStart ?? null,
    windowEnd: row.windowEnd ?? null,
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
    assigneeIds: assignees.map((person) => person.id),
    assignees,
    sourceId: null,
    sourceLabel: null,
    location: row.location ?? "",
    storyId: num(row.story),
    storyTitle: titles.get(num(row.story)) ?? "Story"
  };
}

/**
 * One Collection's workspace: the Collection, its readable stories (as the
 * Stories list shows them), shared interviews, Collection tasks, a labelled
 * roll-up of open Story tasks, resources and the stories' appointments. A
 * fixed set of batched reads; nothing is read per story.
 */
export async function collectionDetail(ctx: ScreenContext, id: number): Promise<CollectionDetail> {
  const [doc, people, scope] = await Promise.all([collectionDoc(ctx, id), loadPeople(ctx), scopeOf(ctx)]);
  const { rows, readable } = await collectionRows(ctx, [doc], people);
  const collection = rows[0];
  const memberIds = ids(doc.stories).filter((story) => readable.has(story));
  const canManage = collectionCanManage(scope, id);
  const [{ stories, extras }, plans, interviews, tasks, storyTasks, resources, appointments] = await Promise.all([
    storiesWithExtras(ctx, memberIds),
    memberIds.length ? ctx.req.payload.find({ collection: "story-plans", where: { story: { in: memberIds } }, ...all, ...asUser(ctx) }) : Promise.resolve({ docs: [] as StoryPlan[] }),
    ctx.req.payload.find({ collection: "collection-interviews", where: { collection: { equals: id } }, sort: "createdAt", ...all, ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "tasks", where: { collection: { equals: id } }, sort: "createdAt", ...all, ...asUser(ctx) }),
    memberIds.length
      ? ctx.req.payload.find({ collection: "tasks", where: { and: [{ story: { in: memberIds } }, { state: { equals: "open" } }, { or: [{ collection: { exists: false } }, { collection: { not_equals: id } }] }] }, sort: "due", ...all, ...asUser(ctx) })
      : Promise.resolve({ docs: [] as Task[] }),
    ctx.req.payload.find({ collection: "collection-resources", where: { collections: { in: [id] } }, sort: "label", ...all, ...asUser(ctx) }),
    memberIds.length
      ? ctx.req.payload.find({ collection: "appointments", where: { and: [{ story: { in: memberIds } }, { status: { not_equals: "cancelled" } }] }, sort: "startAt", select: { story: true, title: true, kind: true, status: true, scheduleMode: true, windowStart: true, windowEnd: true, startAt: true, endAt: true, assignees: true, location: true }, ...all, ...asUser(ctx) })
      : Promise.resolve({ docs: [] as Appointment[] })
  ]);
  const planByStory = new Map((plans.docs as StoryPlan[]).map((plan) => [num(plan.story), plan]));
  const order = new Map(memberIds.map((storyId, index) => [storyId, index]));
  const storyRows: PlanningStory[] = stories
    .map((story) => planningStory(ctx, people, story, planByStory.get(story.id) ?? null, extras.get(story.id)!))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const titles = new Map(storyRows.map((story) => [story.id, story.title]));
  const media = await mediaFor(ctx, unique((resources.docs as CollectionResource[]).map((row) => num(row.media)).filter((mediaId) => mediaId > 0)));
  const task = (row: Task): EditorialTask => editorialTask(people, row);
  return {
    collection,
    stories: storyRows,
    interviews: (interviews.docs as CollectionInterview[]).map((row) => interviewDto(people, row, readable, canManage)),
    tasks: (tasks.docs as Task[]).map(task),
    storyTasks: (storyTasks.docs as Task[]).map(task),
    resources: (resources.docs as CollectionResource[]).map((row) => resourceDto(row, readable, media)),
    appointments: (appointments.docs as Appointment[]).map((row) => scheduleAppointment(people, row, titles))
  };
}

/* ------------------------------------------------------------- mutations */

function checkFresh(updatedAt: string, expected: unknown, what = "this") {
  if (typeof expected === "string" && expected !== "" && Date.parse(expected) !== Date.parse(updatedAt)) {
    throw new APIError(`Someone else changed ${what} while you were editing. Reload to see the newer version.`, 409);
  }
}

export async function createCollection(ctx: ScreenContext, input: CollectionInput) {
  if (!collectionCanCreate(ctx.user)) forbidden("Only editors can create Collections.");
  const name = String(input.name ?? "").trim();
  if (!name) throw new APIError("Give the Collection a name.", 400);
  if (!(COLLECTION_TYPES as readonly string[]).includes(String(input.type))) throw new APIError("Choose what kind of reporting this Collection is.", 400);
  const created = await ctx.req.payload.create({
    collection: "collections",
    data: {
      name,
      type: input.type as CollectionType,
      status: "planning",
      lead: input.leadId ? Number(input.leadId) : Number(ctx.user.id),
      ...(input.brief ? { brief: String(input.brief) } : {}),
      ...(input.startDate ? { startDate: input.startDate } : {}),
      ...(input.endDate ? { endDate: input.endDate } : {})
    },
    ...asUser(ctx)
  });
  resetCollectionScope(ctx.req);
  return (await collectionRows(ctx, [created as CollectionDoc])).rows[0];
}

/**
 * Coordinating changes, each checked against what this reader may do (the
 * hooks enforce the same again): the team needs the lead or an editor, the
 * public presentation and archiving an editor. The brief is compared with
 * the one the editor started from; a stale brief is a 409, never an overwrite.
 */
export async function updateCollection(ctx: ScreenContext, id: number, input: CollectionInput) {
  const scope = await scopeOf(ctx);
  const doc = await collectionDoc(ctx, id);
  if (!collectionCanManage(scope, id)) forbidden("You can't change this Collection.");
  checkFresh(doc.updatedAt, input.expectedUpdatedAt, "this Collection");
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = String(input.name);
  if (input.type !== undefined) {
    if (!(COLLECTION_TYPES as readonly string[]).includes(String(input.type))) throw new APIError("Choose a valid Collection type.", 400);
    data.type = input.type;
  }
  if (input.status !== undefined) {
    if (!(COLLECTION_STATUSES as readonly string[]).includes(String(input.status))) throw new APIError("Choose a valid Collection status.", 400);
    if ((input.status === "archived" || doc.status === "archived") && input.status !== doc.status && !collectionCanArchive(ctx.user)) forbidden("Only an editor can archive or restore a Collection.");
    data.status = input.status as CollectionStatus;
  }
  if (input.startDate !== undefined) data.startDate = input.startDate || null;
  if (input.endDate !== undefined) data.endDate = input.endDate || null;
  if (input.brief !== undefined) {
    if (input.expectedBrief !== undefined && input.expectedBrief !== (doc.brief ?? "")) throw new APIError("The brief changed while you were editing it. Reload to see the newer version; your draft is still on screen.", 409);
    data.brief = String(input.brief);
  }
  if (input.leadId !== undefined) {
    if (!collectionCanManageTeam(scope, id)) forbidden("Only the Collection's lead or an editor can change its lead.");
    if (!input.leadId) throw new APIError("A Collection needs a lead.", 400);
    data.lead = Number(input.leadId);
    // The new lead leaves the team list; the previous lead stays on the team.
    const previous = relationId(doc.lead);
    data.members = unique([...ids(doc.members), ...(previous !== null ? [Number(previous)] : [])]).filter((member) => member !== Number(input.leadId));
  }
  if (input.publicPresentation !== undefined) {
    if (!collectionCanManagePublic(ctx.user)) forbidden("Only an editor can change a Collection's public presentation.");
    const p = input.publicPresentation;
    const members = ids(doc.stories);
    if (ids(p.storyOrder).some((story) => !members.includes(story)) || (p.featuredStoryId && !members.includes(Number(p.featuredStoryId)))) throw new APIError("Choose stories that belong to this Collection.", 400);
    data.publicPresentation = {
      enabled: p.publicEnabled === true,
      format: p.publicFormat === "series" ? "series" : "coverage",
      title: p.publicTitle ?? "",
      slug: p.publicSlug ? String(p.publicSlug) : null,
      description: p.publicDescription ?? "",
      overview: p.publicOverview ?? "",
      artwork: p.artworkAttachmentId ? Number(p.artworkAttachmentId) : null,
      featuredStory: p.featuredStoryId ? Number(p.featuredStoryId) : null,
      // Stories this reader can't see stay where they were in the order.
      storyOrder: mergeHidden(ids(doc.publicPresentation?.storyOrder), ids(p.storyOrder), await readableIds(ctx, members))
    };
  }
  const updated = await ctx.req.payload.update({ collection: "collections", id, data, ...asUser(ctx) });
  if (input.leadId !== undefined) resetCollectionScope(ctx.req);
  return (await collectionRows(ctx, [updated as CollectionDoc])).rows[0];
}

async function readableIds(ctx: ScreenContext, storyIds: number[]): Promise<Set<number>> {
  return new Set((await readableStories(ctx, storyIds, { headline: true })).map((story) => story.id));
}

/** The reader's list, with the entries they can't see kept from the stored one. */
function mergeHidden(stored: number[], asked: number[], readable: Set<number>): number[] {
  return unique([...asked.filter((id) => readable.has(id)), ...stored.filter((id) => !readable.has(id))]);
}

export async function deleteCollection(ctx: ScreenContext, id: number) {
  if (!atLeast(ctx.user, "administrator")) forbidden("Only an administrator can delete a Collection. Archive it instead.");
  await ctx.req.payload.delete({ collection: "collections", id, ...asUser(ctx) });
}

/** Adds a story the reader can see. Membership only: the story itself is untouched. */
export async function addStory(ctx: ScreenContext, id: number, storyId: number) {
  const scope = await scopeOf(ctx);
  if (!collectionCanManage(scope, id)) forbidden("You can't add stories to this Collection.");
  if (!(await readableIds(ctx, [storyId])).has(storyId)) throw new APIError("That story isn't available to you.", 404);
  const doc = await collectionDoc(ctx, id);
  if (!ids(doc.stories).includes(storyId)) await ctx.req.payload.update({ collection: "collections", id, data: { stories: [...ids(doc.stories), storyId] }, ...asUser(ctx) });
  return { linked: true };
}

export async function removeStory(ctx: ScreenContext, id: number, storyId: number) {
  const scope = await scopeOf(ctx);
  if (!collectionCanManage(scope, id)) forbidden("You can't remove stories from this Collection.");
  const doc = await collectionDoc(ctx, id);
  if (ids(doc.stories).includes(storyId)) await ctx.req.payload.update({ collection: "collections", id, data: { stories: ids(doc.stories).filter((story) => story !== storyId) }, ...asUser(ctx) });
  return { linked: false };
}

export async function setMember(ctx: ScreenContext, id: number, userId: number, linked: boolean) {
  const scope = await scopeOf(ctx);
  if (!collectionCanManageTeam(scope, id)) forbidden("Only the Collection's lead or an editor can change its team.");
  const doc = await collectionDoc(ctx, id);
  if (linked && sameId(doc.lead, userId)) return { linked };
  const members = ids(doc.members);
  const next = linked ? unique([...members, userId]) : members.filter((member) => member !== userId);
  if (next.length !== members.length) await ctx.req.payload.update({ collection: "collections", id, data: { members: next }, ...asUser(ctx) });
  resetCollectionScope(ctx.req);
  return { linked };
}

/* ------------------------------------------------------------ interviews */

function instantOrNull(value: unknown, timeZone: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return localToInstant(String(value), timeZone);
  } catch {
    throw new APIError("Use a valid date and time.", 400);
  }
}

/**
 * Creates or edits a shared interview, its links saved with it. Linked
 * stories must be the Collection's (the hook refuses others); stories the
 * reader can't see keep their links. An edit names the version it started
 * from: someone else's newer save is a 409.
 */
export async function saveInterview(ctx: ScreenContext, id: number, input: InterviewInput, interviewId: number | null) {
  const scope = await scopeOf(ctx);
  if (!collectionCanManage(scope, id)) forbidden("You can't change this Collection's reporting.");
  let existing: CollectionInterview | null = null;
  if (interviewId !== null) {
    const found = await ctx.req.payload.find({ collection: "collection-interviews", where: { id: { equals: interviewId } }, depth: 0, limit: 1, ...asUser(ctx) });
    existing = (found.docs[0] as CollectionInterview | undefined) ?? null;
    if (!existing || !sameId(existing.collection, id)) throw new APIError("That interview is no longer in this Collection.", 404);
    checkFresh(existing.updatedAt, input.expectedUpdatedAt, "this interview");
  }
  const data: Record<string, unknown> = {};
  for (const key of ["interviewee", "status", "location", "notes", "followUps", "privateContact"] as const) if (input[key] !== undefined) data[key] = input[key];
  if (input.scheduleMode !== undefined) data.scheduleMode = input.scheduleMode;
  if (input.windowStart !== undefined) data.windowStart = input.windowStart || null;
  if (input.windowEnd !== undefined) data.windowEnd = input.windowEnd || null;
  if (input.scheduledAt !== undefined) data.startAt = instantOrNull(input.scheduledAt, ctx.timeZone);
  if (input.endAt !== undefined) data.endAt = instantOrNull(input.endAt, ctx.timeZone);
  if (input.completedAt !== undefined) data.completedAt = instantOrNull(input.completedAt, ctx.timeZone);
  if (input.scheduleMode === undefined && input.scheduledAt !== undefined) data.scheduleMode = data.startAt ? "exact" : existing?.scheduleMode ?? "unscheduled";
  if (input.storyIds !== undefined) {
    const stored = ids(existing?.stories);
    const asked = input.storyIds.map(Number);
    const readable = await readableIds(ctx, unique([...stored, ...asked]));
    // A story the reader can't see can't be linked by them; one already linked keeps its link.
    if (asked.some((story) => !readable.has(story) && !stored.includes(story))) throw new APIError("Add the story to this Collection before linking it to an interview.", 400);
    data.stories = mergeHidden(stored, asked, readable);
  }
  if (input.interviewerIds !== undefined) data.interviewers = input.interviewerIds.map(Number);
  if (input.resourceIds !== undefined) data.resources = input.resourceIds.map(Number);
  const saved =
    existing === null
      ? await ctx.req.payload.create({ collection: "collection-interviews", data: { ...data, collection: id } as never, ...asUser(ctx) })
      : await ctx.req.payload.update({ collection: "collection-interviews", id: existing.id, data, ...asUser(ctx) });
  const people = await loadPeople(ctx);
  return interviewDto(people, saved as CollectionInterview, await readableIds(ctx, ids((saved as CollectionInterview).stories)), true);
}

/* ------------------------------------------------------------- resources */

export async function addResource(ctx: ScreenContext, id: number, input: ResourceInput) {
  const scope = await scopeOf(ctx);
  if (!collectionCanManage(scope, id)) forbidden("You can't add resources to this Collection.");
  const media = input.attachmentId ? Number(input.attachmentId) : null;
  if (media !== null) {
    // Linking a file needs only reading it: the resource points to it, and Media keeps its own access.
    const found = await ctx.req.payload.find({ collection: "media", where: { id: { equals: media } }, depth: 0, limit: 1, select: { filename: true }, ...asUser(ctx) });
    if (!found.docs[0]) throw new APIError("That file is no longer in Media.", 404);
  }
  const kind = (RESOURCE_KIND_OPTIONS.some((option) => option.value === input.kind) ? input.kind : "link") as ResourceKind;
  const created = await ctx.req.payload.create({
    collection: "collection-resources",
    data: { label: String(input.label ?? ""), url: input.url ? String(input.url) : null, kind, media, collections: [id] },
    ...asUser(ctx)
  });
  const row = created as CollectionResource;
  return resourceDto(row, new Set(), await mediaFor(ctx, media ? [media] : []));
}

async function resourceIn(ctx: ScreenContext, resourceId: number) {
  const found = await ctx.req.payload.find({ collection: "collection-resources", where: { id: { equals: resourceId } }, depth: 0, limit: 1, ...asUser(ctx) });
  const resource = found.docs[0] as CollectionResource | undefined;
  if (!resource) throw new APIError("That resource no longer exists.", 404);
  return resource;
}

/**
 * Reuses a resource another Collection shares (every resource is readable,
 * but its other Collections may be ones this reader doesn't coordinate, so
 * the link is written by the system once this Collection's team is checked).
 */
export async function reuseResource(ctx: ScreenContext, id: number, resourceId: number) {
  const scope = await scopeOf(ctx);
  if (!collectionCanManage(scope, id)) forbidden("You can't add resources to this Collection.");
  const resource = await resourceIn(ctx, resourceId);
  if (!ids(resource.collections).includes(id)) await ctx.req.payload.update({ collection: "collection-resources", id: resourceId, data: { collections: [...ids(resource.collections), id] }, ...asSystem(ctx) });
  return { linked: true };
}

/** Removes the resource from this Collection only: other Collections keep it, and nothing is deleted. */
export async function unlinkResource(ctx: ScreenContext, id: number, resourceId: number) {
  const scope = await scopeOf(ctx);
  if (!collectionCanManage(scope, id)) forbidden("You can't remove resources from this Collection.");
  const [resource, doc] = await Promise.all([resourceIn(ctx, resourceId), collectionDoc(ctx, id)]);
  if (!ids(resource.collections).includes(id)) return { linked: false };
  const remaining = ids(resource.collections).filter((collection) => collection !== id);
  const others = remaining.length ? await ctx.req.payload.find({ collection: "collections", where: { id: { in: remaining } }, select: { stories: true }, ...all, ...asSystem(ctx) }) : { docs: [] };
  const stillMembers = new Set(others.docs.flatMap((other) => ids(other.stories)));
  const mine = new Set(ids(doc.stories));
  // Story links that only this Collection justified go with it.
  const stories = ids(resource.stories).filter((story) => !mine.has(story) || stillMembers.has(story));
  await ctx.req.payload.update({ collection: "collection-resources", id: resourceId, data: { collections: remaining, stories }, ...asSystem(ctx) });
  const interviews = await ctx.req.payload.find({ collection: "collection-interviews", where: { and: [{ collection: { equals: id } }, { resources: { in: [resourceId] } }] }, select: { resources: true }, ...all, ...asSystem(ctx) });
  for (const interview of interviews.docs) {
    await ctx.req.payload.update({ collection: "collection-interviews", id: interview.id, data: { resources: ids(interview.resources).filter((other) => other !== resourceId) }, ...asSystem(ctx) });
  }
  return { linked: false };
}

/** Which of this Collection's stories use a resource (its links to other Collections' stories are kept). */
export async function setResourceStories(ctx: ScreenContext, id: number, resourceId: number, storyIds: number[]) {
  const scope = await scopeOf(ctx);
  if (!collectionCanManage(scope, id)) forbidden("You can't change this Collection's resources.");
  const [resource, doc] = await Promise.all([resourceIn(ctx, resourceId), collectionDoc(ctx, id)]);
  if (!ids(resource.collections).includes(id)) throw new APIError("That resource isn't in this Collection.", 404);
  const members = ids(doc.stories);
  const asked = storyIds.map(Number);
  if (asked.some((story) => !members.includes(story) && !ids(resource.stories).includes(story))) throw new APIError("Add the story to the Collection before linking the resource to it.", 400);
  const outside = ids(resource.stories).filter((story) => !members.includes(story));
  const readable = await readableIds(ctx, members);
  const hidden = ids(resource.stories).filter((story) => members.includes(story) && !readable.has(story));
  await ctx.req.payload.update({ collection: "collection-resources", id: resourceId, data: { stories: unique([...outside, ...hidden, ...asked.filter((story) => members.includes(story))]) }, ...asSystem(ctx) });
  return { stories: asked };
}

/** Deletes a resource for good: editors only, and only once no Collection or interview uses it. */
export async function deleteResource(ctx: ScreenContext, resourceId: number) {
  if (!atLeast(ctx.user, "editor")) forbidden("Only an editor can delete a shared resource.");
  await resourceIn(ctx, resourceId);
  await ctx.req.payload.delete({ collection: "collection-resources", id: resourceId, ...asUser(ctx) });
}

/* --------------------------------------------------------------- options */

/** Stories this reader can add, by headline (as the newsroom search finds them). */
export async function storyOptions(ctx: ScreenContext, search: string) {
  const text = search.trim();
  const found = await ctx.req.payload.find({
    collection: "stories",
    where: text ? { headline: { like: text } } : undefined,
    draft: true,
    depth: 0,
    limit: 30,
    sort: "-updatedAt",
    select: { headline: true },
    ...asUser(ctx)
  });
  const people = await loadPeople(ctx);
  const storyIds = found.docs.map((story) => story.id);
  const { stories, extras } = await storiesWithExtras(ctx, storyIds);
  const plans = storyIds.length ? await ctx.req.payload.find({ collection: "story-plans", where: { story: { in: storyIds } }, ...all, ...asUser(ctx) }) : { docs: [] as StoryPlan[] };
  const planByStory = new Map((plans.docs as StoryPlan[]).map((plan) => [num(plan.story), plan]));
  return { stories: stories.map((story) => planningStory(ctx, people, story, planByStory.get(story.id) ?? null, extras.get(story.id)!)) };
}

/** Shared resources from Collections this reader can see, to reuse elsewhere. */
export async function resourceOptions(ctx: ScreenContext, search: string) {
  const text = search.trim();
  const found = await ctx.req.payload.find({
    collection: "collection-resources",
    where: { and: [{ collections: { exists: true } }, ...(text ? [{ label: { like: text } }] : [])] },
    sort: "-updatedAt",
    limit: 30,
    depth: 0,
    ...asUser(ctx)
  });
  const rows = found.docs as CollectionResource[];
  const media = await mediaFor(ctx, unique(rows.map((row) => num(row.media)).filter((mediaId) => mediaId > 0)));
  return { resources: rows.map((row) => resourceDto(row, new Set(), media)) };
}

/* --------------------------------------------------------- a story's view */

/**
 * A story's Collections, its shared interviews and resources, for Story Peek
 * and the Story workspace. Never private source details: those stay inside
 * the Collection.
 */
export async function storyCollections(ctx: ScreenContext, storyId: number): Promise<StoryCollections> {
  if (!(await readableIds(ctx, [storyId])).has(storyId)) throw new APIError("You can't see this story.", 403);
  const [found, linked, resources, people] = await Promise.all([
    ctx.req.payload.find({ collection: "collections", where: { stories: { in: [storyId] } }, sort: "name", ...all, ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "collection-interviews", where: { stories: { in: [storyId] } }, ...all, ...asUser(ctx) }),
    ctx.req.payload.find({ collection: "collection-resources", where: { stories: { in: [storyId] } }, ...all, ...asUser(ctx) }),
    loadPeople(ctx)
  ]);
  const { rows } = await collectionRows(ctx, found.docs as CollectionDoc[], people);
  const collectionIds = rows.map((row) => row.id);
  const available = collectionIds.length
    ? await ctx.req.payload.find({ collection: "collection-interviews", where: { and: [{ collection: { in: collectionIds } }, { stories: { not_in: [storyId] } }] }, ...all, ...asUser(ctx) })
    : { docs: [] as CollectionInterview[] };
  const scope = await scopeOf(ctx);
  const readable = new Set([storyId]);
  const peek = (row: CollectionInterview) => {
    const { privateContact: _private, canEditContact: _edit, ...rest } = interviewDto(people, row, readable, collectionCanManage(scope, row.collection));
    return rest;
  };
  const media = await mediaFor(ctx, unique((resources.docs as CollectionResource[]).map((row) => num(row.media)).filter((mediaId) => mediaId > 0)));
  return {
    canManage: scopeManages(await storyScope(ctx.req), storyId),
    collections: rows,
    interviews: (linked.docs as CollectionInterview[]).map(peek),
    availableInterviews: (available.docs as CollectionInterview[]).filter((row) => !ids(row.stories).includes(storyId)).map(peek),
    resources: (resources.docs as CollectionResource[]).map((row) => resourceDto(row, readable, media))
  };
}

/** For Calendar and Home: a Collection's name, to title its interviews and tasks. */
export async function collectionNames(ctx: ScreenContext, collectionIds: number[]): Promise<Map<number, string>> {
  if (!collectionIds.length) return new Map();
  const found = await ctx.req.payload.find({ collection: "collections", where: inIds("id", collectionIds), select: { name: true }, ...all, ...asUser(ctx) });
  return new Map(found.docs.map((doc) => [doc.id, doc.name]));
}
