import { body, handle, idParam, json } from "./http";
import { relatedSuggestions } from "./related-suggestions";
import { storyDistribution } from "./story-distribution";
import { changeStoryNote, storyNotePreviews, storyNotes } from "./story-notes";
import { inbox, markNotificationsRead } from "./notifications";
import { changeLiveUpdate, deleteLiveUpdate, liveDesk, postLiveUpdate, publicLiveFeed } from "./live-coverage";
import { contentHealth, healthDisposition, startHealthScan } from "./health/content-health";
import { pageContext } from "./site-pages";
import { publicationSettings, savePublicationSettings, saveSiteRow, sectionImpact, siteGroup, siteRows } from "./site";
import { commandSearch } from "./command-search";
import { changeCorrection, storyCorrections } from "./story-corrections";
import { restoreStoryVersion, storyVersion, storyVersions } from "./story-history";
import { storyReadiness } from "./story-readiness";
import { setScheduledPublication, trashStory } from "./scheduled-publication";
import { storyURLContext } from "./story-url";
import type { ContributorEntry, EditorialWorkflowPayload, TaskInput, TaskPatch } from "@byline/newsroom-screens/editorial/editorial-model";
import type { HomePresetsPayload } from "@byline/newsroom-screens/home/home-model";
import { APIError, type Endpoint, type PayloadRequest } from "payload";
import { resetStoryScope, scopeManages, storyScope } from "../access/story-context";
import { atLeast } from "../access/user";
import { addDays, localDay, localToInstant, newsroomTimeZone } from "../domain/dates";
import { findPreset, STORY_PRESETS } from "../domain/presets";
import { isWorkflowStage } from "../domain/workflow";
import { validResourceUrl } from "../collections/StoryPlans";
import { parsePlanningFilterParams } from "@byline/newsroom-screens/planning/planning-api";
import { parseMediaLibraryParams } from "@byline/newsroom-screens/media/media-library-model";
import type { MediaBulkPatch, MediaMetadataPatch } from "@byline/newsroom-screens/media/media-library-model";
import { createFolder, deleteFolder, deleteMedia, deleteMediaMany, libraryPage, mediaDetail, mediaNavigator, moveMedia, renameMedia, updateFolder, updateMedia, updateMediaMany, uploadMedia } from "./media-library";
import { mediaWork } from "./media-work";
import { artDirectionView, retryPublication, saveArtDirection } from "../publication-media/media-publication";
import { publicationMediaReport, type MediaRequirement } from "../publication-media/readiness";
import { buildMediaEndpoint } from "../publication-media/build-endpoint";
import { buildSnapshotEndpoints } from "../public/snapshot/endpoints";

/** `?lead=12&ids=3,4&alt=4`: referenced Media, plus body uses whose story-specific alt text is already complete. */
function readinessQuery(params: URLSearchParams): MediaRequirement[] {
  const id = (value: string) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  };
  const lead = id(params.get("lead") ?? "");
  const others = (params.get("ids") ?? "").split(",").map(id).filter((value): value is number => value !== null && value !== lead);
  const alt = new Set((params.get("alt") ?? "").split(",").map(id).filter((value): value is number => value !== null));
  return [
    ...(lead ? [{ id: lead, role: "image" as const, allowMissingAlt: false }] : []),
    ...[...new Set(others)].map((value) => ({ id: value, role: "file" as const, allowMissingAlt: alt.has(value) }))
  ].slice(0, 200);
}
import { planningResponse } from "./planning";
import { navigationCounts } from "./navigation-counts";
import { parseScheduleQuery, scheduleResponse, scheduleToday } from "./schedule";
import {
  addResource,
  addStory,
  collectionDetail,
  collectionList,
  createCollection,
  deleteCollection,
  deleteResource,
  parseCollectionQuery,
  removeStory,
  resourceOptions,
  reuseResource,
  saveInterview,
  setMember,
  setResourceStories,
  storyCollections,
  storyOptions,
  unlinkResource,
  updateCollection
} from "./collections";
import type { CollectionInput, InterviewInput, ResourceInput } from "@byline/newsroom-screens/collections/collection-model";
import { contributorEntry, editorialTask, homeBootstrap, loadPeople, mediaFor, personIdFor, planFor, reportingFor, screenContext, searchStories, storyResources, storyWorkspace, type ScreenContext } from "./screen-models";
import type { AppointmentInput, MediaAssignmentInput, SourceInput } from "@byline/newsroom-screens/workspace/workspace-types";
import { effectiveWorkflow } from "../domain/workflow";
import { relationId, sameId } from "../access/user";
import { parsePreviewContextQuery, storyPreviewContext } from "../preview/context";
import { createPerson, ownProfile, peopleList, personDetail, savePersonAccess, updatePerson } from "./people";
import { presenceHeartbeat, presenceSnapshot } from "./presence";
import { peopleQuery, type NewPerson, type PersonAccessInput, type PersonPatch } from "@byline/newsroom-screens/people/people-model";

/**
 * The newsroom screens' API (`/api/byline/...`), the Payload side of the
 * contracts in @byline/newsroom-screens. Being an admin screen is not
 * permission: every handler re-checks the account and reads and writes as that
 * user (`overrideAccess: false`), so collection and field access decide.
 */

/** A newsroom-local time from the screens, or null. */
function instantOrNull(value: unknown, timeZone: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return localToInstant(String(value), timeZone);
  } catch {
    throw new APIError("Use a valid date and time.", 400);
  }
}

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });

/* ------------------------------------------------------------- presets */

function presetsPayload(): HomePresetsPayload {
  return {
    presets: Object.fromEntries(
      STORY_PRESETS.map((preset) => [
        preset.id,
        {
          id: preset.id,
          label: preset.label,
          section: preset.section,
          workflow: preset.workflow,
          readiness: preset.readiness,
          media: preset.media,
          tasks: preset.tasks.map((task, index) => ({ key: `task-${index}`, when: "always", required: false, title: task.title }))
        }
      ])
    ),
    types: STORY_PRESETS.map((preset) => preset.id),
    revision: 1
  };
}

/** The one Story creation flow (Home, Stories, Create, and a Collection's New story). */
export async function createStory(ctx: ScreenContext, req: PayloadRequest, given?: { title?: string; preset?: string }) {
  const input = given ?? (await body<{ title?: string; preset?: string }>(req));
  const title = String(input.title ?? "").trim().slice(0, 300);
  if (!title) throw new APIError("Give the story a working headline.", 400);
  const preset = input.preset ? findPreset(input.preset) : null;
  if (input.preset && !preset) throw new APIError("That template no longer exists.", 400);
  const editor = atLeast(ctx.user, "editor");
  const today = localDay(ctx.now, ctx.timeZone);

  let section: number | null = null;
  if (preset) {
    const found = await req.payload.find({ collection: "sections", where: { slug: { equals: preset.section } }, depth: 0, limit: 1, ...asUser(ctx) });
    section = found.docs[0]?.id ?? null;
  }
  const story = await req.payload.create({
    collection: "stories",
    draft: true,
    data: {
      headline: title,
      contributors: ctx.user.linkedPerson !== null ? [Number(ctx.user.linkedPerson)] : [],
      ...(section ? { section } : {}),
      ...(preset?.format ? { format: preset.format } : {})
    },
    // The plan is created with the story; a preset seeds its stage, and its deadline only for editors.
    context: {
      bylinePlan: {
        ...(preset ? { workflow: preset.workflow.status } : {}),
        ...(preset && editor ? { deadline: addDays(today, preset.workflow.deadlinePolicy === "same-day" ? 0 : preset.workflow.deadlineOffsetDays) } : {})
      }
    },
    ...asUser(ctx)
  });
  // The creator manages the new story from here on; recompute who manages what.
  resetStoryScope(req);
  const failures: string[] = [];
  let tasks = 0;
  let production = 0;
  for (const task of preset?.tasks ?? []) {
    try {
      await req.payload.create({ collection: "tasks", data: { story: story.id, title: task.title, assignees: [Number(ctx.user.id)], state: "open", priority: "normal" }, ...asUser(ctx) });
      tasks += 1;
    } catch {
      failures.push(`Task "${task.title}" was not added.`);
    }
  }
  for (const assignment of preset?.production ?? []) {
    try {
      const deadline = assignment.dueOffsetDays !== undefined ? localToInstant(`${addDays(today, assignment.dueOffsetDays)}T17:00`, ctx.timeZone) : null;
      await req.payload.create({ collection: "production-assignments", data: { story: story.id, title: assignment.title, type: assignment.type, status: "needed", deadline }, ...asUser(ctx) });
      production += 1;
    } catch {
      failures.push(`"${assignment.title}" was not added.`);
    }
  }
  const workspace = await storyWorkspace(ctx, story.id);
  return { ...workspace, workspaceUrl: `${ctx.admin}/collections/stories/${story.id}`, template: { tasks, mediaAssignments: production, errors: failures } };
}

/* --------------------------------------------------------------- tasks */

async function taskPayload(ctx: ScreenContext, taskIds: Array<number | string>, storyId: number | null) {
  const people = await loadPeople(ctx);
  const found = taskIds.length ? await ctx.req.payload.find({ collection: "tasks", where: { id: { in: taskIds } }, depth: 0, limit: taskIds.length, ...asUser(ctx) }) : { docs: [] };
  return {
    ...(storyId ? { storyId } : {}),
    tasks: found.docs.map((task) => editorialTask(people, task)),
    capabilities: { canEditLinkedStory: true, canAssign: atLeast(ctx.user, "editor"), canDelete: true, canManageUnlinked: false }
  };
}

async function createTask(ctx: ScreenContext, req: PayloadRequest) {
  const input = await body<TaskInput>(req);
  if (!input.storyId && !input.collectionId) throw new APIError("Choose a story for this task.", 400);
  const task = await req.payload.create({
    collection: "tasks",
    data: {
      story: input.storyId ? Number(input.storyId) : null,
      collection: input.collectionId ? Number(input.collectionId) : null,
      title: String(input.title ?? "").trim(),
      assignees: input.assigneeId ? [Number(input.assigneeId)] : [],
      due: instantOrNull(input.dueAt, ctx.timeZone),
      priority: input.priority ?? "normal",
      state: "open"
    },
    ...asUser(ctx)
  });
  return taskPayload(ctx, [task.id], input.storyId ? Number(input.storyId) : null);
}

async function updateTask(ctx: ScreenContext, req: PayloadRequest) {
  const id = idParam(req);
  const patch = await body<TaskPatch>(req);
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = String(patch.title).trim();
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.assigneeId !== undefined) data.assignees = patch.assigneeId ? [Number(patch.assigneeId)] : [];
  if (patch.dueAt !== undefined) data.due = instantOrNull(patch.dueAt, ctx.timeZone);
  if (patch.state !== undefined) {
    data.state = patch.state === "completed" ? "completed" : "open";
    data.completedAt = patch.state === "completed" ? new Date().toISOString() : null;
  }
  const task = await req.payload.update({ collection: "tasks", id, data, ...asUser(ctx) });
  return editorialTask(await loadPeople(ctx), task);
}

async function deleteTask(ctx: ScreenContext, req: PayloadRequest) {
  await req.payload.delete({ collection: "tasks", id: idParam(req), ...asUser(ctx) });
  return new Response(null, { status: 204 });
}

/* ------------------------------------------------- workflow and writers */

async function workflowReadModel(ctx: ScreenContext, id: number): Promise<EditorialWorkflowPayload> {
  const data = await storyWorkspace(ctx, id);
  const { story, capabilities, revision } = data;
  const published = story.publicationState.isPublished;
  return {
    story: {
      postId: id, title: story.title, revision, status: story.workflow.id, postStatus: published ? "publish" : "draft", isPublished: published,
      editorId: story.editor ? Number(story.editor.id) : null, deadline: story.deadline, plannedPublication: story.plannedPublication,
      scheduledAt: story.publicationState.scheduledAt
    },
    statuses: data.statuses.map((item) => ({ ...item, group: item.group === "sidelined" || item.group === "derived" ? item.group : "main" })),
    capabilities: { changeStatus: capabilities.changeStatus, assign: capabilities.assign, changeDeadline: capabilities.assign, changePlannedPublication: capabilities.assign }
  };
}

async function updateWorkflow(ctx: ScreenContext, req: PayloadRequest): Promise<EditorialWorkflowPayload> {
  const storyId = idParam(req);
  const input = await body<{ status?: string; deadline?: string | null; plannedPublishAt?: string | null; plannedPublication?: string | null; editorId?: number | null; expectedRevision?: number }>(req);
  const plan = await planFor(ctx, storyId);
  if (typeof input.expectedRevision === "number" && input.expectedRevision > 0 && input.expectedRevision !== Date.parse(plan.updatedAt)) {
    throw new APIError("Someone else changed this story's plan. Reload to see the newer version.", 409);
  }
  const data: Record<string, unknown> = {};
  if (input.status !== undefined) {
    if (!isWorkflowStage(input.status)) throw new APIError("Choose a valid workflow stage.", 400);
    data.workflow = input.status;
  }
  if (input.deadline !== undefined) data.deadline = input.deadline ? String(input.deadline).slice(0, 10) : null;
  const planned = input.plannedPublishAt !== undefined ? input.plannedPublishAt : input.plannedPublication;
  if (planned !== undefined) data.plannedPublication = instantOrNull(planned, ctx.timeZone);
  if (input.editorId !== undefined) data.editor = input.editorId ? Number(input.editorId) : null;
  // Field access silently keeps fields a person may not change; refuse instead, so nobody thinks it saved.
  const editor = atLeast(ctx.user, "editor");
  if (!editor && ("deadline" in data || "plannedPublication" in data || "editor" in data)) throw new APIError("Only editors set deadlines, publication plans and editors.", 403);
  const updated = await req.payload.update({ collection: "story-plans", id: plan.id, data, ...asUser(ctx) });
  const story = await req.payload.findByID({ collection: "stories", id: storyId, draft: true, depth: 0, select: { _status: true, headline: true }, ...asUser(ctx) });
  const published = story._status === "published";
  return {
    story: {
      postId: storyId,
      revision: Date.parse(updated.updatedAt),
      title: story.headline ?? "",
      status: effectiveWorkflow(updated.workflow, story._status),
      storedStatus: updated.workflow,
      postStatus: published ? "publish" : "draft",
      isPublished: published,
      editorId: relationId(updated.editor) === null ? null : Number(relationId(updated.editor)),
      deadline: updated.deadline ?? null,
      plannedPublication: updated.plannedPublication ?? null
    },
    capabilities: { changeStatus: true, assign: editor, changeDeadline: editor, changePlannedPublication: editor }
  };
}

async function saveContributors(ctx: ScreenContext, req: PayloadRequest) {
  const storyId = idParam(req);
  if (!scopeManages(await storyScope(req), storyId)) throw new APIError("You can't change this story's byline.", 403);
  const input = await body<{ contributors?: ContributorEntry[] }>(req);
  const people = await loadPeople(ctx);
  const personIds = (input.contributors ?? []).map((entry) => personIdFor(people, entry));
  if (personIds.some((id) => id === null)) throw new APIError("One of those writers has no public byline yet.", 400);
  // The byline is article copy: it saves as a draft, like any other edit, and goes live when an editor publishes.
  // Respect Payload's document lock: someone editing the story owns its fields until they leave.
  await req.payload.update({ collection: "stories", id: storyId, draft: true, overrideLock: false, data: { contributors: personIds as number[] }, ...asUser(ctx) });
  const contributors = personIds.map((id, order) => contributorEntry(people, id, order)).filter((entry): entry is ContributorEntry => entry !== null);
  return { storyId, contributors, canEdit: true, canCreateGuests: false };
}

/* --------------------------------------------------------------- links */

async function saveResources(ctx: ScreenContext, req: PayloadRequest, change: "add" | "update" | "remove") {
  const storyId = idParam(req);
  const plan = await planFor(ctx, storyId);
  const resources = [...(plan.resources ?? [])];
  const resourceId = change === "add" ? null : String(req.routeParams?.resourceId ?? "");
  const index = resourceId === null ? -1 : resources.findIndex((resource) => resource.id === resourceId);
  if (change !== "add" && index < 0) throw new APIError("That link is no longer on this story.", 404);
  if (change === "remove") resources.splice(index, 1);
  else {
    const input = await body<{ label?: string; url?: string; purpose?: string }>(req);
    const label = String(input.label ?? "").trim();
    const url = String(input.url ?? "").trim();
    const valid = validResourceUrl(url);
    if (!label) throw new APIError("Give the link a name.", 400);
    if (valid !== true) throw new APIError(valid, 400);
    const next = { label, url, purpose: (input.purpose ?? "other") as NonNullable<typeof resources[number]["purpose"]> };
    if (change === "add") resources.push(next);
    else resources[index] = { ...resources[index], ...next };
  }
  const updated = await req.payload.update({ collection: "story-plans", id: plan.id, data: { resources }, ...asUser(ctx) });
  return { resources: storyResources(updated) };
}

/* ------------------------------------------------ workspace records */

type RecordCollection = "sources" | "appointments" | "production-assignments";

/** The record named in the URL, if it belongs to this story and this user may see it. */
async function storyRecord(ctx: ScreenContext, collection: RecordCollection, storyId: number, recordId: number) {
  const found = await ctx.req.payload.find({ collection, where: { id: { equals: recordId } }, depth: 0, limit: 1, ...asUser(ctx) });
  const record = found.docs[0];
  if (!record || !sameId(record.story, storyId)) throw new APIError("That is no longer on this story.", 404);
  return record;
}

/** Compare-and-swap, as in WordPress: a stale edit is a 409, never an overwrite. */
function checkFresh(record: { updatedAt: string }, expected: unknown) {
  if (typeof expected === "string" && expected !== "" && Date.parse(expected) !== Date.parse(record.updatedAt)) {
    throw new APIError("Someone else changed this while you were editing. Reload to see the newer version.", 409);
  }
}

const optionalRecordId = (req: PayloadRequest, name: string) => (req.routeParams?.[name] === undefined ? null : idParam(req, name));
const ids = (value: unknown) => (Array.isArray(value) ? value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : []);

async function saveBrief(ctx: ScreenContext, req: PayloadRequest) {
  const storyId = idParam(req);
  const input = await body<{ brief?: string; expectedBrief?: string }>(req);
  const plan = await planFor(ctx, storyId);
  if (input.expectedBrief !== undefined && input.expectedBrief !== (plan.brief ?? "")) {
    throw new APIError("The brief changed while you were editing it. Reload the story to see the newer version.", 409);
  }
  const updated = await req.payload.update({ collection: "story-plans", id: plan.id, data: { brief: String(input.brief ?? "") }, ...asUser(ctx) });
  return { brief: updated.brief ?? "" };
}

async function saveSource(ctx: ScreenContext, req: PayloadRequest) {
  const storyId = idParam(req);
  const sourceId = optionalRecordId(req, "sourceId");
  const input = await body<SourceInput>(req);
  const data: Record<string, unknown> = {};
  for (const key of ["label", "role", "organization", "status", "notes"] as const) if (input[key] !== undefined) data[key] = input[key];
  if (input.assigneeIds !== undefined) data.assignees = ids(input.assigneeIds);
  let saved: { id: number };
  if (sourceId === null) saved = await req.payload.create({ collection: "sources", data: { ...data, story: storyId } as never, ...asUser(ctx) });
  else {
    checkFresh(await storyRecord(ctx, "sources", storyId, sourceId), input.expectedUpdatedAt);
    saved = await req.payload.update({ collection: "sources", id: sourceId, data, ...asUser(ctx) });
  }
  return { ...(await reportingFor(ctx, storyId)), sourceId: String(saved.id) };
}

async function deleteRecord(ctx: ScreenContext, req: PayloadRequest, collection: RecordCollection, param: string) {
  const storyId = idParam(req);
  const recordId = idParam(req, param);
  await storyRecord(ctx, collection, storyId, recordId);
  await req.payload.delete({ collection, id: recordId, ...asUser(ctx) });
  return collection === "production-assignments" ? mediaFor(ctx, storyId) : reportingFor(ctx, storyId);
}

async function saveAppointment(ctx: ScreenContext, req: PayloadRequest) {
  const storyId = idParam(req);
  const appointmentId = optionalRecordId(req, "appointmentId");
  const input = await body<AppointmentInput>(req);
  const data: Record<string, unknown> = {};
  for (const key of ["title", "kind", "status", "scheduleMode", "location", "notes"] as const) if (input[key] !== undefined) data[key] = input[key];
  // A target window stays date-only; exact times arrive newsroom-local and are stored as UTC.
  if (input.windowStart !== undefined) data.windowStart = input.windowStart || null;
  if (input.windowEnd !== undefined) data.windowEnd = input.windowEnd || null;
  if (input.startAt !== undefined) data.startAt = instantOrNull(input.startAt, ctx.timeZone);
  if (input.endAt !== undefined) data.endAt = instantOrNull(input.endAt, ctx.timeZone);
  if (input.assigneeIds !== undefined) data.assignees = ids(input.assigneeIds);
  if (input.sourceId !== undefined) {
    const source = input.sourceId ? Number(input.sourceId) : null;
    if (source !== null) await storyRecord(ctx, "sources", storyId, source).catch(() => { throw new APIError("That source is no longer on this story.", 400); });
    data.source = source;
  }
  let saved: { id: number };
  if (appointmentId === null) saved = await req.payload.create({ collection: "appointments", data: { ...data, story: storyId } as never, ...asUser(ctx) });
  else {
    checkFresh(await storyRecord(ctx, "appointments", storyId, appointmentId), input.expectedUpdatedAt);
    saved = await req.payload.update({ collection: "appointments", id: appointmentId, data, ...asUser(ctx) });
  }
  return { ...(await reportingFor(ctx, storyId)), appointmentId: String(saved.id) };
}

async function saveMediaAssignment(ctx: ScreenContext, req: PayloadRequest) {
  const storyId = idParam(req);
  const assignmentId = optionalRecordId(req, "assignmentId");
  const input = await body<MediaAssignmentInput>(req);
  const data: Record<string, unknown> = {};
  for (const key of ["title", "type", "status", "notes"] as const) if (input[key] !== undefined) data[key] = input[key];
  if (input.attachmentIds !== undefined) data.media = ids(input.attachmentIds);
  if (input.assigneeId !== undefined) data.assignees = input.assigneeId ? [Number(input.assigneeId)] : [];
  if (input.dueAt !== undefined) data.deadline = instantOrNull(input.dueAt, ctx.timeZone);
  let saved: { id: number };
  if (assignmentId === null) saved = await req.payload.create({ collection: "production-assignments", data: { ...data, story: storyId } as never, ...asUser(ctx) });
  else {
    checkFresh(await storyRecord(ctx, "production-assignments", storyId, assignmentId), input.expectedUpdatedAt);
    saved = await req.payload.update({ collection: "production-assignments", id: assignmentId, data, ...asUser(ctx) });
  }
  return { ...(await mediaFor(ctx, storyId)), assignmentId: String(saved.id) };
}

/* --------------------------------------------------------------- media */

const optionalId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || value === "unfiled") return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new APIError("Unknown folder.", 400);
  return id;
};

async function uploadToLibrary(ctx: ScreenContext, req: PayloadRequest) {
  // Multipart: the file, and `_payload` ({ folderId }) as JSON (Payload's own convention).
  const input = await body<{ folderId?: unknown }>(req);
  return uploadMedia(ctx, optionalId(input.folderId));
}

async function moveToFolder(ctx: ScreenContext, req: PayloadRequest) {
  const input = await body<{ ids?: unknown; folderId?: unknown }>(req);
  return moveMedia(ctx, ids(input.ids), optionalId(input.folderId));
}

/* ----------------------------------------------------------- collections */

/**
 * A new story through the one Story creation flow, then added to the
 * Collection. If the link fails the story still exists (it is the reporter's
 * work, never silently deleted) and the response says so.
 */
async function createCollectionStory(ctx: ScreenContext, req: PayloadRequest) {
  const id = idParam(req);
  const input = await body<{ title?: string; preset?: string }>(req);
  const created = await createStory(ctx, req, input);
  try {
    await addStory(ctx, id, created.story.id);
  } catch {
    return { ...created, template: { ...created.template, errors: [...created.template.errors, "The story was created but couldn't be added to the Collection. Add it from the Collection's Stories."] } };
  }
  return created;
}

const collectionEndpoints: Endpoint[] = [
  // Fixed paths come before `/byline/collections/:id`.
  { path: "/byline/collections", method: "get", handler: handle((ctx, req) => collectionList(ctx, parseCollectionQuery(req.searchParams))) },
  { path: "/byline/collections", method: "post", handler: handle(async (ctx, req) => createCollection(ctx, await body<CollectionInput>(req))) },
  { path: "/byline/collections/story-options", method: "get", handler: handle((ctx, req) => storyOptions(ctx, String(req.searchParams.get("search") ?? ""))) },
  { path: "/byline/collections/resource-options", method: "get", handler: handle((ctx, req) => resourceOptions(ctx, String(req.searchParams.get("search") ?? ""))) },
  { path: "/byline/collections/:id", method: "get", handler: handle((ctx, req) => collectionDetail(ctx, idParam(req))) },
  { path: "/byline/collections/:id", method: "patch", handler: handle(async (ctx, req) => updateCollection(ctx, idParam(req), await body<CollectionInput>(req))) },
  { path: "/byline/collections/:id", method: "delete", handler: handle(async (ctx, req) => { await deleteCollection(ctx, idParam(req)); return new Response(null, { status: 204 }); }) },
  { path: "/byline/collections/:id/stories", method: "post", handler: handle(async (ctx, req) => addStory(ctx, idParam(req), Number((await body<{ storyId?: number }>(req)).storyId))) },
  { path: "/byline/collections/:id/stories/new", method: "post", handler: handle(createCollectionStory) },
  { path: "/byline/collections/:id/stories/:storyId", method: "delete", handler: handle((ctx, req) => removeStory(ctx, idParam(req), idParam(req, "storyId"))) },
  { path: "/byline/collections/:id/members", method: "post", handler: handle(async (ctx, req) => setMember(ctx, idParam(req), Number((await body<{ userId?: number }>(req)).userId), true)) },
  { path: "/byline/collections/:id/members/:userId", method: "delete", handler: handle((ctx, req) => setMember(ctx, idParam(req), idParam(req, "userId"), false)) },
  { path: "/byline/collections/:id/interviews", method: "post", handler: handle(async (ctx, req) => saveInterview(ctx, idParam(req), await body<InterviewInput>(req), null)) },
  { path: "/byline/collections/:id/interviews/:interviewId", method: "patch", handler: handle(async (ctx, req) => saveInterview(ctx, idParam(req), await body<InterviewInput>(req), idParam(req, "interviewId"))) },
  { path: "/byline/collections/:id/resources", method: "post", handler: handle(async (ctx, req) => {
    const input = await body<ResourceInput & { resourceId?: number }>(req);
    return input.resourceId ? reuseResource(ctx, idParam(req), Number(input.resourceId)) : addResource(ctx, idParam(req), input);
  }) },
  { path: "/byline/collections/:id/resources/:resourceId/stories", method: "put", handler: handle(async (ctx, req) => setResourceStories(ctx, idParam(req), idParam(req, "resourceId"), ids((await body<{ storyIds?: unknown }>(req)).storyIds))) },
  // Remove from this Collection (unlink). Deleting a shared resource is its own, editor-only request below.
  { path: "/byline/collections/:id/resources/:resourceId", method: "delete", handler: handle((ctx, req) => unlinkResource(ctx, idParam(req), idParam(req, "resourceId"))) },
  { path: "/byline/collection-resources/:id", method: "delete", handler: handle(async (ctx, req) => { await deleteResource(ctx, idParam(req)); return new Response(null, { status: 204 }); }) },
  { path: "/byline/stories/:id/collections", method: "get", handler: handle((ctx, req) => storyCollections(ctx, idParam(req))) }
];

/* ----------------------------------------------------------- endpoints */

export const newsroomEndpoints: Endpoint[] = [
  { path: "/byline/stories/:id/distribution", method: "get", handler: handle((ctx, req) => storyDistribution(ctx, idParam(req))) },
  { path: "/byline/stories/:id/live", method: "get", handler: handle((ctx, req) => liveDesk(ctx, idParam(req))) },
  { path: "/byline/stories/:id/live", method: "post", handler: handle(async (ctx, req) => postLiveUpdate(ctx, idParam(req), await body(req))) },
  { path: "/byline/stories/:id/live/:update", method: "patch", handler: handle(async (ctx, req) => changeLiveUpdate(ctx, idParam(req), idParam(req, "update"), await body(req))) },
  { path: "/byline/stories/:id/live/:update", method: "delete", handler: handle((ctx, req) => deleteLiveUpdate(ctx, idParam(req), idParam(req, "update"))) },
  // Public, read-only, published-only: what the Worker serves at /api/live/<id> between builds. No credentials, no cookies.
  { path: "/byline/live/:id", method: "get", handler: async (req) => {
    try {
      const id = Number((req.routeParams as { id?: string } | undefined)?.id);
      const feed = Number.isSafeInteger(id) && id > 0 ? await publicLiveFeed(req.payload, id) : null;
      return feed ? json(feed, 200, { "Cache-Control": "no-store" }) : json({ message: "Coverage not found." }, 404, { "Cache-Control": "no-store" });
    } catch (error) {
      req.payload.logger.error({ err: error, msg: "Public live feed failed" });
      return json({ message: "Live coverage is unavailable." }, 502, { "Cache-Control": "no-store" });
    }
  } },
  { path: "/byline/notifications", method: "get", handler: handle((ctx, req) => inbox(ctx, { unreadOnly: req.searchParams.get("unread") === "1", limit: Number(req.searchParams.get("limit")) || 20 })) },
  { path: "/byline/notifications/read", method: "post", handler: handle(async (ctx, req) => {
    const input = await body<{ ids?: unknown; all?: unknown }>(req);
    if (input.all === true) return markNotificationsRead(ctx, "all");
    if (!Array.isArray(input.ids)) throw new APIError("Choose notifications to mark read.", 400);
    return markNotificationsRead(ctx, input.ids.map(Number));
  }) },
  { path: "/byline/stories/:id/notes", method: "get", handler: handle((ctx, req) => storyNotes(ctx, idParam(req), req.searchParams.get("resolved") === "1", Math.max(1, Number(req.searchParams.get("page")) || 1))) },
  { path: "/byline/stories/:id/notes/previews", method: "get", handler: handle((ctx, req) => storyNotePreviews(ctx, idParam(req))) },
  { path: "/byline/stories/:id/notes", method: "post", handler: handle(async (ctx, req) => changeStoryNote(ctx, idParam(req), null, await body(req))) },
  { path: "/byline/stories/:id/notes/:note", method: "patch", handler: handle(async (ctx, req) => changeStoryNote(ctx, idParam(req), idParam(req, "note"), await body(req))) },
  { path: "/byline/content-health", method: "get", handler: handle((ctx) => contentHealth(ctx)) },
  { path: "/byline/content-health/scan", method: "post", handler: handle((ctx) => startHealthScan(ctx)) },
  { path: "/byline/content-health/stories/:id/recheck", method: "post", handler: handle((ctx, req) => startHealthScan(ctx, idParam(req))) },
  { path: "/byline/content-health/disposition", method: "post", handler: handle(async (ctx, req) => healthDisposition(ctx, await body(req))) },
  { path: "/byline/pages/:id/context", method: "get", handler: handle((ctx, req) => pageContext(ctx, idParam(req))) },
  { path: "/byline/pages/:id/schedule-publication", method: "post", handler: handle(async (ctx, req) => setScheduledPublication(ctx, idParam(req), await body(req), "pages")) },
  { path: "/byline/site/publication", method: "get", handler: handle((ctx) => publicationSettings(ctx)) },
  { path: "/byline/site/publication", method: "post", handler: handle(async (ctx, req) => savePublicationSettings(ctx, await body(req))) },
  { path: "/byline/site/sections/:id/impact", method: "get", handler: handle((ctx, req) => sectionImpact(ctx, idParam(req))) },
  { path: "/byline/site/:group", method: "get", handler: handle((ctx, req) => siteRows(ctx, siteGroup(req.routeParams?.group))) },
  { path: "/byline/site/:group", method: "post", handler: handle(async (ctx, req) => saveSiteRow(ctx, siteGroup(req.routeParams?.group), await body(req))) },
  { path: "/byline/site/:group/:id", method: "patch", handler: handle(async (ctx, req) => saveSiteRow(ctx, siteGroup(req.routeParams?.group), await body(req), idParam(req))) },
  { path: "/byline/site/:group/:id", method: "delete", handler: handle(async (ctx, req) => saveSiteRow(ctx, siteGroup(req.routeParams?.group), await body(req), idParam(req), true)) },
  { path: "/byline/stories/:id/corrections", method: "get", handler: handle((ctx, req) => storyCorrections(ctx, idParam(req))) },
  { path: "/byline/stories/:id/corrections", method: "post", handler: handle(async (ctx, req) => changeCorrection(ctx, idParam(req), null, await body(req))) },
  { path: "/byline/stories/:id/corrections/:correction", method: "patch", handler: handle(async (ctx, req) => changeCorrection(ctx, idParam(req), idParam(req, "correction"), await body(req))) },
  { path: "/byline/stories/:id/corrections/:correction", method: "delete", handler: handle(async (ctx, req) => changeCorrection(ctx, idParam(req), idParam(req, "correction"), await body(req), true)) },
  { path: "/byline/stories/:id/versions", method: "get", handler: handle((ctx, req) => storyVersions(ctx, idParam(req))) },
  { path: "/byline/stories/:id/versions/:version", method: "get", handler: handle((ctx, req) => storyVersion(ctx, idParam(req), idParam(req, "version"))) },
  { path: "/byline/stories/:id/restore-version", method: "post", handler: handle(async (ctx, req) => restoreStoryVersion(ctx, idParam(req), await body(req))) },
  { path: "/byline/stories/:id/readiness", method: "get", handler: handle((ctx, req) => storyReadiness(ctx, idParam(req))) },
  { path: "/byline/stories/:id/schedule-publication", method: "post", handler: handle(async (ctx, req) => setScheduledPublication(ctx, idParam(req), await body(req))) },
  { path: "/byline/stories/:id/trash", method: "post", handler: handle((ctx, req) => trashStory(ctx, idParam(req))) },
  { path: "/byline/stories/:id/public-url", method: "get", handler: handle((ctx, req) => storyURLContext(ctx, idParam(req))) },
  { path: "/byline/presence", method: "get", handler: handle(presenceSnapshot) },
  { path: "/byline/presence", method: "post", handler: handle(presenceHeartbeat) },
  { path: "/byline/people", method: "get", handler: handle((ctx, req) => peopleList(ctx, peopleQuery(req.searchParams))) },
  { path: "/byline/people", method: "post", handler: handle(async (ctx, req) => createPerson(ctx, await body<NewPerson>(req))) },
  { path: "/byline/people/:id", method: "get", handler: handle((ctx, req) => personDetail(ctx, idParam(req))) },
  { path: "/byline/people/:id", method: "patch", handler: handle(async (ctx, req) => updatePerson(ctx, idParam(req), await body<PersonPatch>(req))) },
  { path: "/byline/people/:id/access", method: "put", handler: handle(async (ctx, req) => savePersonAccess(ctx, idParam(req), await body<PersonAccessInput>(req))) },
  { path: "/byline/profile", method: "get", handler: handle((ctx) => ownProfile(ctx)) },
  { path: "/byline/home", method: "get", handler: handle((ctx) => homeBootstrap(ctx)) },
  { path: "/byline/command-search", method: "get", handler: handle((ctx, req) => commandSearch(ctx, req.searchParams.get("query") ?? "")) },
  { path: "/byline/home/search", method: "get", handler: handle((ctx, req) => searchStories(ctx, String(req.searchParams.get("query") ?? ""))) },
  { path: "/byline/presets", method: "get", handler: handle(async () => presetsPayload()) },
  // The Stories collection (Board and List). Board moves and inline edits use /stories/:id/workflow.
  { path: "/byline/planning", method: "get", handler: handle((ctx, req) => planningResponse(ctx, parsePlanningFilterParams(req.searchParams))) },
  // The sidebar's open-work counts (Stories, Media, Collections and the promoted Stories views).
  { path: "/byline/navigation-counts", method: "get", handler: handle((ctx) => navigationCounts(ctx)) },
  { path: "/byline/schedule", method: "get", handler: handle((ctx, req) => scheduleResponse(ctx, parseScheduleQuery(req.searchParams, scheduleToday(ctx)))) },
  { path: "/byline/stories", method: "post", handler: handle(createStory) },
  // Live Preview's presentation context: corrections, related/More by candidates, series. Not part of the typing loop.
  { path: "/byline/stories/:id/related-suggestions", method: "get", handler: handle((ctx, req) => relatedSuggestions(ctx, idParam(req))) },
  { path: "/byline/stories/:id/preview-context", method: "get", handler: handle((ctx, req) => storyPreviewContext(ctx, idParam(req), parsePreviewContextQuery(new URL(req.url ?? "http://x").searchParams))) },
  { path: "/byline/stories/:id/activity", method: "get", handler: handle(async (ctx, req) => {
    const storyId = idParam(req);
    const { activity } = await storyWorkspace(ctx, storyId);
    return { storyId, activity };
  }) },
  { path: "/byline/stories/:id/workspace", method: "get", handler: handle((ctx, req) => storyWorkspace(ctx, idParam(req))) },
  { path: "/byline/stories/:id/workflow", method: "get", handler: handle((ctx, req) => workflowReadModel(ctx, idParam(req))) },
  { path: "/byline/stories/:id/workflow", method: "post", handler: handle(updateWorkflow) },
  { path: "/byline/stories/:id/contributors", method: "put", handler: handle(saveContributors) },
  { path: "/byline/stories/:id/resources", method: "post", handler: handle((ctx, req) => saveResources(ctx, req, "add")) },
  { path: "/byline/stories/:id/resources/:resourceId", method: "post", handler: handle((ctx, req) => saveResources(ctx, req, "update")) },
  { path: "/byline/stories/:id/resources/:resourceId", method: "delete", handler: handle((ctx, req) => saveResources(ctx, req, "remove")) },
  { path: "/byline/stories/:id/brief", method: "post", handler: handle(saveBrief) },
  { path: "/byline/stories/:id/sources", method: "post", handler: handle(saveSource) },
  { path: "/byline/stories/:id/sources/:sourceId", method: "post", handler: handle(saveSource) },
  { path: "/byline/stories/:id/sources/:sourceId", method: "delete", handler: handle((ctx, req) => deleteRecord(ctx, req, "sources", "sourceId")) },
  { path: "/byline/stories/:id/appointments", method: "post", handler: handle(saveAppointment) },
  { path: "/byline/stories/:id/appointments/:appointmentId", method: "post", handler: handle(saveAppointment) },
  { path: "/byline/stories/:id/appointments/:appointmentId", method: "delete", handler: handle((ctx, req) => deleteRecord(ctx, req, "appointments", "appointmentId")) },
  { path: "/byline/stories/:id/media-assignments", method: "post", handler: handle(saveMediaAssignment) },
  { path: "/byline/stories/:id/media-assignments/:assignmentId", method: "post", handler: handle(saveMediaAssignment) },
  { path: "/byline/stories/:id/media-assignments/:assignmentId", method: "delete", handler: handle((ctx, req) => deleteRecord(ctx, req, "production-assignments", "assignmentId")) },
  // Media: the Library (Payload Media and its native folders) and Work (production assignments).
  // Fixed paths come before `/byline/media/:id`.
  { path: "/byline/media", method: "get", handler: handle((ctx, req) => libraryPage(ctx, parseMediaLibraryParams(req.searchParams))) },
  { path: "/byline/media/navigator", method: "get", handler: handle((ctx) => mediaNavigator(ctx)) },
  { path: "/byline/media/work", method: "get", handler: handle((ctx) => mediaWork(ctx)) },
  { path: "/byline/media/upload", method: "post", handler: handle(uploadToLibrary) },
  // Story header preflight: the same server rule Publish enforces, for the Media the form currently references.
  { path: "/byline/media/publication-readiness", method: "get", handler: handle((ctx, req) => publicationMediaReport(req.payload, readinessQuery(req.searchParams), { req })) },
  { path: "/byline/media/move", method: "post", handler: handle(moveToFolder) },
  { path: "/byline/media/bulk-update", method: "post", handler: handle(async (ctx, req) => { const input = await body<{ ids?: unknown; patch?: unknown }>(req); return updateMediaMany(ctx, ids(input.ids), (input.patch ?? {}) as MediaBulkPatch); }) },
  { path: "/byline/media/bulk-delete", method: "post", handler: handle(async (ctx, req) => deleteMediaMany(ctx, ids((await body<{ ids?: unknown }>(req)).ids))) },
  { path: "/byline/media/folders", method: "post", handler: handle(async (ctx, req) => createFolder(ctx, await body(req))) },
  { path: "/byline/media/folders/:id", method: "patch", handler: handle(async (ctx, req) => updateFolder(ctx, idParam(req), await body(req))) },
  { path: "/byline/media/folders/:id", method: "delete", handler: handle(async (ctx, req) => { await deleteFolder(ctx, idParam(req)); return new Response(null, { status: 204 }); }) },
  // Art direction (focal point, custom crops) and publication Retry: the only normal write paths for that state.
  { path: "/byline/media/:id/art-direction", method: "get", handler: handle((ctx, req) => artDirectionView(ctx, idParam(req))) },
  { path: "/byline/media/:id/art-direction", method: "put", handler: handle(async (ctx, req) => saveArtDirection(ctx, idParam(req), await body<Record<string, unknown>>(req))) },
  { path: "/byline/media/:id/rename", method: "post", handler: handle(async (ctx, req) => renameMedia(ctx, idParam(req), await body(req))) },
  { path: "/byline/media/:id/publication/retry", method: "post", handler: handle(async (ctx, req) => { await retryPublication(ctx, idParam(req)); return mediaDetail(ctx, idParam(req)); }) },
  { path: "/byline/media/:id", method: "get", handler: handle((ctx, req) => mediaDetail(ctx, idParam(req))) },
  { path: "/byline/media/:id", method: "patch", handler: handle(async (ctx, req) => updateMedia(ctx, idParam(req), await body<MediaMetadataPatch>(req))) },
  { path: "/byline/media/:id", method: "delete", handler: handle(async (ctx, req) => { await deleteMedia(ctx, idParam(req)); return new Response(null, { status: 204 }); }) },
  { path: "/byline/tasks", method: "post", handler: handle(createTask) },
  { path: "/byline/tasks/:id", method: "patch", handler: handle(updateTask) },
  { path: "/byline/tasks/:id", method: "delete", handler: handle(deleteTask) },
  ...collectionEndpoints,
  // Build-only (BYLINE_BUILD_TOKEN), never the signed-in newsroom: prepared publication blobs by SHA-256.
  buildMediaEndpoint,
  // Build-only public snapshot discovery, artifacts and direct-source recovery (BYLINE_BUILD_TOKEN).
  ...buildSnapshotEndpoints
];
