import type { ContributorEntry, EditorialWorkflowPayload, TaskInput, TaskPatch } from "@byline/newsroom-screens/editorial/editorial-model";
import type { HomePresetsPayload } from "@byline/newsroom-screens/home/home-model";
import { addDataAndFileToRequest, APIError, type Endpoint, type PayloadHandler, type PayloadRequest } from "payload";
import { resetStoryScope, scopeManages, storyScope } from "../access/story-context";
import { atLeast } from "../access/user";
import { addDays, localDay, localToInstant, newsroomTimeZone } from "../domain/dates";
import { findPreset, STORY_PRESETS } from "../domain/presets";
import { isWorkflowStage } from "../domain/workflow";
import { validResourceUrl } from "../collections/StoryPlans";
import { editorialTask, homeBootstrap, loadPeople, personIdFor, planFor, screenContext, searchStories, storyResources, storyWorkspace, contributorEntry, type ScreenContext } from "./screen-models";

/**
 * The newsroom screens' API (`/api/byline/...`), the Payload side of the
 * contracts in @byline/newsroom-screens. Being an admin screen is not
 * permission: every handler re-checks the account and reads and writes as that
 * user (`overrideAccess: false`), so collection and field access decide.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

function handle(run: (ctx: ScreenContext, req: PayloadRequest) => Promise<unknown>): PayloadHandler {
  return async (req) => {
    try {
      const ctx = screenContext(req, newsroomTimeZone());
      const result = await run(ctx, req);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      const status = error instanceof APIError ? error.status : typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
      const message = status >= 500 ? "Byline couldn't finish that. Try again." : (error as Error).message;
      if (status >= 500) req.payload.logger.error({ err: error, msg: "Newsroom screen request failed" });
      return json({ message, code: `byline_${status}`, data: { status } }, status);
    }
  };
}

async function body<T>(req: PayloadRequest): Promise<T> {
  await addDataAndFileToRequest(req);
  return (req.data ?? {}) as T;
}

function idParam(req: PayloadRequest, name = "id"): number {
  const id = Number(req.routeParams?.[name]);
  if (!Number.isSafeInteger(id) || id <= 0) throw new APIError("Unknown record.", 404);
  return id;
}

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

async function createStory(ctx: ScreenContext, req: PayloadRequest) {
  const input = await body<{ title?: string; preset?: string }>(req);
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
  if (!input.storyId) throw new APIError("Choose a story for this task.", 400);
  const task = await req.payload.create({
    collection: "tasks",
    data: {
      story: Number(input.storyId),
      title: String(input.title ?? "").trim(),
      assignees: input.assigneeId ? [Number(input.assigneeId)] : [],
      due: instantOrNull(input.dueAt, ctx.timeZone),
      priority: input.priority ?? "normal",
      state: "open"
    },
    ...asUser(ctx)
  });
  return taskPayload(ctx, [task.id], Number(input.storyId));
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
  return {
    story: { postId: storyId, revision: Date.parse(updated.updatedAt) } as EditorialWorkflowPayload["story"],
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
  await req.payload.update({ collection: "stories", id: storyId, draft: true, data: { contributors: personIds as number[] }, ...asUser(ctx) });
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

/* ----------------------------------------------------------- endpoints */

export const newsroomEndpoints: Endpoint[] = [
  { path: "/byline/home", method: "get", handler: handle((ctx) => homeBootstrap(ctx)) },
  { path: "/byline/home/search", method: "get", handler: handle((ctx, req) => searchStories(ctx, String(req.searchParams.get("query") ?? ""))) },
  { path: "/byline/presets", method: "get", handler: handle(async () => presetsPayload()) },
  { path: "/byline/stories", method: "post", handler: handle(createStory) },
  { path: "/byline/stories/:id/workspace", method: "get", handler: handle((ctx, req) => storyWorkspace(ctx, idParam(req))) },
  { path: "/byline/stories/:id/workflow", method: "post", handler: handle(updateWorkflow) },
  { path: "/byline/stories/:id/contributors", method: "put", handler: handle(saveContributors) },
  { path: "/byline/stories/:id/resources", method: "post", handler: handle((ctx, req) => saveResources(ctx, req, "add")) },
  { path: "/byline/stories/:id/resources/:resourceId", method: "post", handler: handle((ctx, req) => saveResources(ctx, req, "update")) },
  { path: "/byline/stories/:id/resources/:resourceId", method: "delete", handler: handle((ctx, req) => saveResources(ctx, req, "remove")) },
  { path: "/byline/tasks", method: "post", handler: handle(createTask) },
  { path: "/byline/tasks/:id", method: "patch", handler: handle(updateTask) },
  { path: "/byline/tasks/:id", method: "delete", handler: handle(deleteTask) }
];
