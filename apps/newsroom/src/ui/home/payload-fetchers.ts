"use client";

import type { ContributorEntry, TaskInput, TaskPatch } from "@byline/newsroom-screens/editorial/editorial-model";
import type { ContributorPayload, EditorialRestClient, TaskPayload } from "@byline/newsroom-screens/editorial/editorial-rest";
import type { HomePresetsPayload } from "@byline/newsroom-screens/home/home-model";
import type { HomeFetchers } from "@byline/newsroom-screens/home/home-api";
import type { HomeBootstrap } from "@byline/newsroom-screens/home/newsroom-model";
import type { WorkspaceClient } from "@byline/newsroom-screens/workspace/workspace-api";
import type { MediaAssignmentsResponse, ReportingResponse, ResourcePurpose, StoryResource, StoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-types";

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

export function createPayloadHomeFetchers(api: string): HomeFetchers {
  async function request<T>(path: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET", data?: unknown): Promise<T> {
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
  }

  const notYet = (what: string) => () => Promise.reject<never>({ message: `${what} isn't available in the newsroom yet.`, code: "byline_not_ported", data: { status: 501 } } satisfies ScreenError);

  const getWorkspace = (storyId: number) => request<StoryWorkspace>(`/stories/${storyId}/workspace`);
  const link = (storyId: number, input: { label: string; url: string; purpose?: ResourcePurpose }) => request<{ resources: StoryResource[] }>(`/stories/${storyId}/resources`, "POST", input);

  const editorial: EditorialRestClient = {
    getWorkflow: notYet("The workflow panel"),
    getWorkflowBootstrap: notYet("The workflow panel"),
    updateWorkflow: (storyId, changes) => request(`/stories/${storyId}/workflow`, "POST", changes),
    getReadiness: notYet("Readiness checks"),
    listTasks: notYet("The task list"),
    createTask: (input: TaskInput) => request<TaskPayload>("/tasks", "POST", input),
    updateTask: (taskId, patch: TaskPatch) => request(`/tasks/${encodeURIComponent(String(taskId))}`, "PATCH", patch),
    deleteTask: (taskId) => request<void>(`/tasks/${encodeURIComponent(String(taskId))}`, "DELETE"),
    getContributors: async (storyId) => (await getWorkspace(storyId)).contributors,
    saveContributors: (storyId, contributors: ContributorEntry[]) => request<ContributorPayload>(`/stories/${storyId}/contributors`, "PUT", { contributors }),
    createGuest: notYet("Adding a guest contributor"),
    getCorrections: notYet("Corrections"),
    createCorrection: notYet("Corrections"),
    updateCorrection: notYet("Corrections"),
    deleteCorrection: notYet("Corrections"),
    getActivity: notYet("Story activity"),
    getDistribution: notYet("Distribution"),
    distributionAction: notYet("Distribution"),
    addToNewsletter: notYet("Newsletters")
  };

  const workspace: WorkspaceClient = {
    // WordPress story collections are not part of the Payload model; nothing on Home calls this.
    collections: new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "then" ? notYet("Collections") : undefined) }) as WorkspaceClient["collections"],
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
    getNotes: notYet("Article notes"),
    getSchedule: notYet("The calendar")
  };

  return {
    // Collections (WordPress story collections) are not part of the Payload model; screens hide them when absent.
    getWorkspace,
    workspace,
    editorial,
    createStory: (title, preset) => request<StoryWorkspace>("/stories", "POST", preset ? { title, preset } : { title }),
    getPresets: () => request<HomePresetsPayload>("/presets"),
    getHome: () => request<HomeBootstrap>("/home"),
    searchStories: (query) => request(`/home/search?query=${encodeURIComponent(query)}`)
  };
}
