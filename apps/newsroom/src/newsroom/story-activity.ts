import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, PayloadRequest } from "payload";
import type { EditorialActivityRecord } from "@byline/newsroom-screens/editorial/editorial-model";
import { relationChanged, relationId, relationIds, requestUser } from "../access/user";
import type { ScreenContext } from "./screen-models";

const summaries = {
  "story-created": "Created the story", "story-published": "Published the story", "story-unpublished": "Unpublished the story",
  "workflow-changed": "Moved workflow", "editor-changed": "Changed the assigned editor", "contributors-changed": "Changed the byline",
  "task-created": "Added a task", "task-completed": "Completed a task", "task-reopened": "Reopened a task",
  "source-added": "Added a source", "source-updated": "Updated a source",
  "appointment-added": "Added an appointment", "appointment-updated": "Updated an appointment", "appointment-completed": "Completed an appointment",
  "production-added": "Added a production assignment", "production-changed": "Changed a production assignment's status",
  "publication-scheduled": "Scheduled publication", "publication-rescheduled": "Rescheduled publication", "publication-cancelled": "Cancelled scheduled publication",
  "version-restored": "Restored a version", "url-changed": "Changed the public URL",
  "correction-added": "Added a public notice", "correction-updated": "Edited a public notice", "correction-removed": "Removed a public notice",
  "recording-captured": "Captured a recording", "file-captured": "Added a reporting file", "transcript-completed": "Transcript completed", "transcript-imported": "Imported a transcript",
  "quote-verified": "Verified a quote", "off-record-override": "Approved public use of off-the-record words",
  "material-made-confidential": "Made reporting material confidential", "material-made-normal": "Made reporting material visible to the story team",
  "live-submitted": "Sent a live update to the desk", "live-published-from-field": "Posted a live update from the field", "live-queued-sent": "Sent a queued live update",
  "live-publishers-changed": "Changed who may publish live updates",
  "homepage-featured": "Proposed featuring on the homepage",
  "distribution-assigned": "Assigned distribution", "distribution-ready": "Marked distribution ready", "distribution-posted": "Recorded a distribution as posted", "distribution-failed": "Distribution failed", "distribution-skipped": "Skipped a distribution"
} as const;
export type ActivityAction = keyof typeof summaries;
export const activityActions = Object.keys(summaries) as ActivityAction[];

export async function recordStoryActivity(req: PayloadRequest, story: unknown, action: ActivityAction, record?: unknown) {
  const id = Number(relationId(story));
  if (!Number.isSafeInteger(id) || id <= 0 || req.context?.bylineImport === true) return;
  await req.payload.create({
    collection: "story-activity", data: {
      story: id, action, recordId: Number(relationId(record)) || null, actor: Number(requestUser(req)?.id) || null
    }, req, depth: 0, overrideAccess: true
  });
}

export async function storyActivity(ctx: ScreenContext, titles: ReadonlyMap<number, string>, limit: number): Promise<EditorialActivityRecord[]> {
  if (!titles.size) return [];
  const { payload } = ctx.req;
  const read = { req: ctx.req, depth: 0, overrideAccess: false as const };
  const { docs } = await payload.find({ collection: "story-activity", where: { story: { in: [...titles.keys()] } }, limit, sort: ["-createdAt", "-id"], ...read });
  const actors = [...new Set(docs.map((row) => relationId(row.actor)).filter((id) => id !== null))];
  const users = actors.length ? (await payload.find({ collection: "users", where: { id: { in: actors } }, pagination: false, select: { name: true }, ...read })).docs : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  return docs.map((row) => {
    const id = Number(relationId(row.story));
    const actorId = Number(relationId(row.actor));
    const name = names.get(actorId);
    return { id: row.id, action: row.action, storyId: id, story: { id, title: titles.get(id) ?? "Story" }, summary: summaries[row.action], actor: name ? { id: actorId, name } : null, occurredAt: row.createdAt };
  });
}

export const beforeStoryActivity: CollectionBeforeChangeHook = async ({ req, data, originalDoc, operation }) => {
  if (operation !== "update" || req.context?.bylineImport === true) return data;
  const id = originalDoc?.id;
  if (id != null && (data._status === "published" || data._status === "draft")) {
    const row = await req.payload.db.findOne({ collection: "stories", where: { id: { equals: id } }, req });
    req.context[`bylineActivityStatus:${id}`] = (row as { _status?: string } | null)?._status;
  }
  return data;
};

export const afterStoryActivity: CollectionAfterChangeHook = async ({ req, doc, operation, previousDoc }) => {
  if (req.context?.bylineImport === true) return doc;
  const key = `bylineActivityStatus:${doc.id}`;
  const before = req.context[key];
  delete req.context[key];
  if (operation === "create") await recordStoryActivity(req, doc.id, "story-created");
  if (doc.versionRestored) await recordStoryActivity(req, doc.id, "version-restored");
  if (operation === "update" && relationIds(doc.contributors).map(String).join(",") !== relationIds(previousDoc?.contributors).map(String).join(",")) {
    await recordStoryActivity(req, doc.id, "contributors-changed");
  }
  // Autosaves and restores to draft don't change the main document.
  if (operation === "create" || before != null) {
    const current = await req.payload.db.findOne({ collection: "stories", where: { id: { equals: doc.id } }, req });
    if ((current as { _status?: string } | null)?._status === "published" && before !== "published") await recordStoryActivity(req, doc.id, "story-published");
    if ((current as { _status?: string } | null)?._status === "draft" && before === "published") await recordStoryActivity(req, doc.id, "story-unpublished");
  }
  return doc;
};

type Kind = "plan" | "task" | "source" | "appointment" | "production";
export function activityFor(kind: Kind): CollectionAfterChangeHook {
  return async ({ doc, operation, previousDoc: previous, req }) => {
    if (req.context?.bylineImport === true || !doc.story) return doc;
    const create = operation === "create";
    const actions: ActivityAction[] = [];
    if (kind === "plan" && !create) {
      if (doc.workflow !== previous?.workflow) actions.push("workflow-changed");
      if (relationChanged(doc.editor, previous?.editor)) actions.push("editor-changed");
    }
    if (kind === "task") {
      if (create) actions.push("task-created");
      else if (doc.state !== previous?.state) actions.push(doc.state === "open" ? "task-reopened" : "task-completed");
    }
    if (kind === "source") actions.push(create ? "source-added" : "source-updated");
    if (kind === "appointment") {
      if (create) actions.push("appointment-added");
      else if (doc.status === "completed" && previous?.status !== doc.status) actions.push("appointment-completed");
      else if (["scheduleMode", "startAt", "endAt", "windowStart", "windowEnd"].some((field) => doc[field] !== previous?.[field])) actions.push("appointment-updated");
    }
    if (kind === "production") {
      if (create) actions.push("production-added");
      else if (doc.status !== previous?.status) actions.push("production-changed");
    }
    for (const action of actions) await recordStoryActivity(req, doc.story, action, doc.id);
    return doc;
  };
}
