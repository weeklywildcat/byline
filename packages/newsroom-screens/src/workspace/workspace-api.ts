import type { CollectionApi } from "../collections/collection-api";
import type { ProtectedEditorialRequest } from "../editorial/editorial-rest";
import type { StoryVideoSettings } from "../editorial/story-video-model";
import type { ArticleNotesResponse } from "../story/notes-model";
import type {
  AppointmentInput,
  MediaAssignmentInput,
  MediaAssignmentsResponse,
  ReportingResponse,
  ResourcePurpose,
  ScheduleResponse,
  SourceInput,
  StoryResource,
  StoryWorkspace
} from "./workspace-types";

export type WorkspaceRequest = <T>(request: ProtectedEditorialRequest & { method?: "GET" | "POST" | "DELETE" }) => Promise<T>;

const story = (id: number) => `/byline/v1/editorial/stories/${id}`;

/**
 * Typed client for the protected Story Workspace surface. Every mutation
 * resolves with the freshly stored collection so callers can replace their
 * cache from the response instead of guessing.
 */
export function createWorkspaceClient(request: WorkspaceRequest, host: { collections?: CollectionApi } = {}) {
  return {
    /** The host's Collections (absent: the workspace shows none). */
    collections: host.collections as CollectionApi | undefined,
    getWorkspace: (storyId: number) => request<StoryWorkspace>({ path: `${story(storyId)}/workspace` }),
    saveBrief: (storyId: number, brief: string, expectedBrief?: string) =>
      request<{ brief: string }>({ path: `${story(storyId)}/brief`, method: "POST", data: { brief, ...(expectedBrief !== undefined ? { expectedBrief } : {}) } }),

    /** Article or Video, and the YouTube URL; needs `edit_post`. */
    saveFormat: (storyId: number, input: { format?: StoryVideoSettings["format"]; videoUrl?: string }) =>
      request<StoryVideoSettings>({ path: `${story(storyId)}/format`, method: "POST", data: input }),

    saveSource: (storyId: number, input: SourceInput, sourceId?: string) =>
      request<ReportingResponse>({ path: `${story(storyId)}/sources${sourceId ? `/${sourceId}` : ""}`, method: "POST", data: input }),
    deleteSource: (storyId: number, sourceId: string) =>
      request<ReportingResponse>({ path: `${story(storyId)}/sources/${sourceId}`, method: "DELETE" }),

    saveAppointment: (storyId: number, input: AppointmentInput, appointmentId?: string) =>
      request<ReportingResponse>({ path: `${story(storyId)}/appointments${appointmentId ? `/${appointmentId}` : ""}`, method: "POST", data: input }),
    deleteAppointment: (storyId: number, appointmentId: string) =>
      request<ReportingResponse>({ path: `${story(storyId)}/appointments/${appointmentId}`, method: "DELETE" }),

    saveMediaAssignment: (storyId: number, input: MediaAssignmentInput, assignmentId?: string) =>
      request<MediaAssignmentsResponse>({ path: `${story(storyId)}/media-assignments${assignmentId ? `/${assignmentId}` : ""}`, method: "POST", data: input }),
    deleteMediaAssignment: (storyId: number, assignmentId: string) =>
      request<MediaAssignmentsResponse>({ path: `${story(storyId)}/media-assignments/${assignmentId}`, method: "DELETE" }),

    addResource: (storyId: number, link: { label: string; url: string; purpose?: ResourcePurpose }) =>
      request<{ resources: StoryResource[] }>({ path: `${story(storyId)}/resources`, method: "POST", data: link }),
    updateResource: (storyId: number, resourceId: string, link: { label: string; url: string; purpose?: ResourcePurpose }) =>
      request<{ resources: StoryResource[] }>({ path: `${story(storyId)}/resources/${encodeURIComponent(resourceId)}`, method: "POST", data: link }),
    removeResource: (storyId: number, resourceId: string) =>
      request<{ resources: StoryResource[] }>({ path: `${story(storyId)}/resources/${encodeURIComponent(resourceId)}`, method: "DELETE" }),

    /** Open Note threads for one story, read from WordPress Core Notes. Read-only; `edit_post` required. */
    getNotes: (storyId: number, limit?: number) =>
      request<ArticleNotesResponse>({ path: `${story(storyId)}/notes${limit ? `?limit=${limit}` : ""}` }),

    getSchedule: (from: string, to: string, includeTasks = false) =>
      request<ScheduleResponse>({ path: `/byline/v1/editorial/schedule?from=${from}&to=${to}${includeTasks ? "&includeTasks=1" : ""}` })
  };
}

export type WorkspaceClient = ReturnType<typeof createWorkspaceClient>;
