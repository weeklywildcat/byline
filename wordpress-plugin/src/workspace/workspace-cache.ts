/**
 * Pure transforms of the cached workspace payload. Mutation responses replace
 * only the slice they own; nothing here refetches or reinvents server data.
 */
import type { EditorialTask } from "../editorial/editorial-model";
import type { EditorialWorkflowPayload } from "../editorial/editorial-model";
import type { MediaAssignmentsResponse, ReportingResponse, StoryResource, StoryWorkspace, WorkspaceStory } from "./workspace-types";

type Data = StoryWorkspace | undefined;

export function applyReporting(data: Data, response: ReportingResponse): Data {
  if (!data) return data;
  return { ...data, sources: response.sources, appointments: response.appointments, reporting: response.summary, story: { ...data.story, reporting: response.summary } };
}

export function applyMedia(data: Data, response: MediaAssignmentsResponse): Data {
  return data ? { ...data, mediaAssignments: response.mediaAssignments } : data;
}

export function applyResources(data: Data, resources: StoryResource[]): Data {
  return data ? { ...data, resources } : data;
}

export function applyBrief(data: Data, brief: string): Data {
  return data ? { ...data, brief } : data;
}

export function applyTask(data: Data, task: EditorialTask): Data {
  return data ? { ...data, tasks: data.tasks.map((item) => (String(item.id) === String(task.id) ? task : item)) } : data;
}

export function removeTask(data: Data, taskId: number | string): Data {
  return data ? { ...data, tasks: data.tasks.filter((item) => String(item.id) !== String(taskId)) } : data;
}

/** Tasks the server returned that the cache has not seen yet, appended in order. */
export function appendNewTasks(data: Data, tasks: EditorialTask[]): Data {
  if (!data) return data;
  const known = new Set(data.tasks.map((task) => String(task.id)));
  const fresh = tasks.filter((task) => !known.has(String(task.id)) && (task.storyId == null || task.storyId === data.story.id));
  return fresh.length ? { ...data, tasks: [...data.tasks, ...fresh] } : data;
}

export type StoryPatch = { workflow?: WorkspaceStory["workflow"]; deadline?: string | null; plannedPublication?: string | null; editor?: StoryWorkspace["story"]["editor"] };

export function patchStory(data: Data, patch: StoryPatch): Data {
  return data ? { ...data, story: { ...data.story, ...patch } } : data;
}

/** Fold the server's view of the changed workflow fields (and its new revision) into the cache. */
export function applyWorkflowPayload(data: Data, payload: EditorialWorkflowPayload): Data {
  if (!data) return data;
  const next = payload.story;
  const status = next.status ? data.statuses.find((candidate) => candidate.id === next.status) : undefined;
  const editor = next.editorId ? data.people.find((person) => Number(person.id) === next.editorId) : undefined;
  return {
    ...data,
    revision: typeof next.revision === "number" ? next.revision : data.revision,
    story: {
      ...data.story,
      ...(status ? { workflow: status as WorkspaceStory["workflow"] } : {}),
      ...("deadline" in next ? { deadline: next.deadline ?? null } : {}),
      ...("plannedPublication" in next ? { plannedPublication: next.plannedPublication ?? null } : {}),
      ...(next.editorId === null ? { editor: null } : editor ? { editor: { id: Number(editor.id), name: editor.name } } : {})
    }
  };
}
