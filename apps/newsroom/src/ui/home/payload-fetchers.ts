"use client";

import { storyCreateBody } from "@byline/newsroom-screens/story/story-fetchers";

import type { CorrectionInput, ContributorEntry, TaskInput, TaskPatch } from "@byline/newsroom-screens/editorial/editorial-model";
import type { CorrectionPayload, ContributorPayload, EditorialRestClient, TaskPayload } from "@byline/newsroom-screens/editorial/editorial-rest";
import type { WorkloadHints } from "@byline/newsroom-screens/editorial/workload-hints";
import type { HomePresetsPayload } from "@byline/newsroom-screens/home/home-model";
import type { HomeFetchers } from "@byline/newsroom-screens/home/home-api";
import type { HomeBootstrap } from "@byline/newsroom-screens/home/newsroom-model";
import type { WorkspaceClient } from "@byline/newsroom-screens/workspace/workspace-api";
import type { MediaAssignmentsResponse, ReportingResponse, ResourcePurpose, ScheduleResponse, StoryResource, StoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-types";
import { queryPath } from "@byline/newsroom-screens/planning/planning-api";
import type { StoryCorrections } from "../../newsroom/story-corrections";
import type { StoryDistributionView } from "../../distribution/server";
import { workloadHint } from "../../domain/workload";
import type { WorkloadView } from "../../newsroom/workload";
import { createPayloadCollectionApi } from "../collections/payload-collection-api";

/**
 * The Payload newsroom's fetchers for the shared Byline screens
 * (@byline/newsroom-screens). They call `/api/byline/...`
 * (src/newsroom/endpoints.ts), which reads and writes as the signed-in user.
 *
 * Errors keep the shape the screens already understand (`message`, `code`,
 * `data.status`). A screen method the newsroom has not ported yet rejects with
 * 501 rather than pretending to succeed; the screens show their own error state.
 */
export type ScreenError = { message: string; code: string; data: { status: number } };

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** One request to `/api/byline/...` as the signed-in user, failing with the screens' error shape. */
export function createBylineRequest(api: string) {
  return async function request<T>(path: string, method: Method = "GET", data?: unknown): Promise<T> {
    const response = await fetch(`${api}/byline${path}`, {
      method,
      credentials: "include",
      headers: data === undefined ? undefined : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error: ScreenError = {
        message: (body && typeof body.message === "string" && body.message) || "Byline couldn't finish that. Try again.",
        code: (body && typeof body.code === "string" && body.code) || `byline_${response.status}`,
        data: { status: response.status }
      };
      throw error;
    }
    return body as T;
  };
}

export function createPayloadHomeFetchers(api: string): HomeFetchers {
  const request = createBylineRequest(api);
  const notYet = (what: string) => () => Promise.reject<never>({ message: `${what} isn't available in the newsroom yet.`, code: "byline_not_ported", data: { status: 501 } } satisfies ScreenError);

  const getWorkspace = (storyId: number) => request<StoryWorkspace>(`/stories/${storyId}/workspace`);
  const collections = createPayloadCollectionApi(api);
  const link = (storyId: number, input: { label: string; url: string; purpose?: ResourcePurpose }) => request<{ resources: StoryResource[] }>(`/stories/${storyId}/resources`, "POST", input);

  const correctionPath = (storyId: number, id?: string | number) => `/stories/${storyId}/corrections${id === undefined ? "" : `/${encodeURIComponent(String(id))}`}`;
  const correctionPayload = (storyId: number, response: StoryCorrections): CorrectionPayload => ({
    storyId, canEdit: true, records: response.corrections.map((row) => ({
      id: row.id, type: row.type, date: row.date, publicText: row.text, recordedByUserId: Number(row.createdBy) || null, createdAt: row.createdAt, modifiedAt: row.updatedAt
    }))
  });
  const correctionInput = (input: CorrectionInput) => ({
    type: input.type === "editors-note" ? "editor-note" : input.type,
    text: input.publicText,
    date: input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? `${input.date}T12:00` : input.date,
    expected: input.expectedUpdatedAt
  });

  const editorial: EditorialRestClient = {
    getWorkflow: (id) => request(`/stories/${id}/workflow`),
    getWorkflowBootstrap: (id) => request(`/stories/${id}/workflow`),
    updateWorkflow: (storyId, changes) => request(`/stories/${storyId}/workflow`, "POST", changes),
    getReadiness: (id) => request(`/stories/${id}/readiness`),
    listTasks: notYet("The task list"),
    createTask: (input: TaskInput) => request<TaskPayload>("/tasks", "POST", input),
    updateTask: (taskId, patch: TaskPatch) => request(`/tasks/${encodeURIComponent(String(taskId))}`, "PATCH", patch),
    deleteTask: (taskId) => request<void>(`/tasks/${encodeURIComponent(String(taskId))}`, "DELETE"),
    getContributors: async (storyId) => (await getWorkspace(storyId)).contributors,
    saveContributors: (storyId, contributors: ContributorEntry[]) => request<ContributorPayload>(`/stories/${storyId}/contributors`, "PUT", { contributors }),
    createGuest: (input) => input.hasProfilePage || input.imageId
      ? Promise.reject({ message: "Set the portrait or profile page in People after adding the guest.", data: { status: 400 }, code: "byline_guest_profile" } satisfies ScreenError)
      : request("/people", "POST", { type: "guest", name: input.name, newsroomRole: input.role }),
    getCorrections: async (id) => correctionPayload(id, await request<StoryCorrections>(correctionPath(id))),
    createCorrection: async (id, input) => correctionPayload(id, await request<StoryCorrections>(correctionPath(id), "POST", correctionInput(input))),
    updateCorrection: async (id, correctionId, input) => correctionPayload(id, await request<StoryCorrections>(correctionPath(id, correctionId), "PATCH", correctionInput(input))),
    deleteCorrection: async (id, correctionId, expected) => correctionPayload(id, await request<StoryCorrections>(correctionPath(id, correctionId), "DELETE", { expected })),
    getActivity: (id) => request(`/stories/${id}/activity`),
    // The shared screens' summary of a Story's distribution; the newsroom's own surface is StoryDistribution / the desk.
    getDistribution: async (id) => {
      const view = await request<StoryDistributionView>(`/stories/${id}/distribution`);
      return { storyId: view.story.id, headline: view.copy.headline, canonicalUrl: view.copy.canonicalUrl ?? "", excerpt: view.copy.excerpt, channels: [], capabilities: { addToNewsletter: false } };
    },
    distributionAction: notYet("Distribution"),
    addToNewsletter: notYet("Newsletters")
  };

  // Advisory workload text for the people pickers, from the same endpoint as the Workload view. Only editors may read it;
  // for anyone else the pickers simply show names, so a refusal is not an error here.
  const getWorkloadHints = async (): Promise<WorkloadHints> => {
    try {
      const view = await request<WorkloadView>("/workload");
      return Object.fromEntries(view.rows.map((row) => [String(row.userId), workloadHint(row)] as const).filter(([, hint]) => hint));
    } catch (error) {
      if ((error as ScreenError | undefined)?.data?.status === 403) return {};
      throw error;
    }
  };

  const workspace: WorkspaceClient = {
    getWorkloadHints,
    // The Story workspace's Collections, interviews and resources.
    collections,
    getWorkspace,
    saveBrief: (storyId, brief, expectedBrief) => request<{ brief: string }>(`/stories/${storyId}/brief`, "POST", { brief, ...(expectedBrief !== undefined ? { expectedBrief } : {}) }),
    // Format and video are article fields: they are edited in the Story screen's form, never here.
    saveFormat: notYet("Changing the format here (use the story's Write tab)"),
    saveSource: (storyId, input, sourceId) => request<ReportingResponse>(`/stories/${storyId}/sources${sourceId ? `/${sourceId}` : ""}`, "POST", input),
    deleteSource: (storyId, sourceId) => request<ReportingResponse>(`/stories/${storyId}/sources/${sourceId}`, "DELETE"),
    saveAppointment: (storyId, input, appointmentId) => request<ReportingResponse>(`/stories/${storyId}/appointments${appointmentId ? `/${appointmentId}` : ""}`, "POST", input),
    deleteAppointment: (storyId, appointmentId) => request<ReportingResponse>(`/stories/${storyId}/appointments/${appointmentId}`, "DELETE"),
    saveMediaAssignment: (storyId, input, assignmentId) => request<MediaAssignmentsResponse>(`/stories/${storyId}/media-assignments${assignmentId ? `/${assignmentId}` : ""}`, "POST", input),
    deleteMediaAssignment: (storyId, assignmentId) => request<MediaAssignmentsResponse>(`/stories/${storyId}/media-assignments/${assignmentId}`, "DELETE"),
    addResource: link,
    updateResource: (storyId, resourceId, input) => request(`/stories/${storyId}/resources/${encodeURIComponent(resourceId)}`, "POST", input),
    removeResource: (storyId, resourceId) => request(`/stories/${storyId}/resources/${encodeURIComponent(resourceId)}`, "DELETE"),
    getNotes: (id) => request(`/stories/${id}/notes/previews`),
    getSchedule: (from: string, to: string, includeTasks = false) => request<ScheduleResponse>(queryPath("/schedule", { from, to, tasks: includeTasks ? 1 : undefined }))
  };

  return {
    // Story Peek's Collections, and ⌘K's Collection search.
    collections,
    getWorkspace,
    workspace,
    editorial,
    getWorkloadHints,
    createStory: (title, preset, details) => request<StoryWorkspace>("/stories", "POST", storyCreateBody(title, preset, details)),
    getPresets: () => request<HomePresetsPayload>("/presets"),
    getHome: () => request<HomeBootstrap>("/home"),
    searchStories: (query) => request(`/home/search?query=${encodeURIComponent(query)}`)
  };
}
