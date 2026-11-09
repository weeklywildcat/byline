import type { CollectionApi } from "../collections/collection-api";
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

export type WorkspaceClient = {
  collections?: CollectionApi;
  getWorkspace: (storyId: number) => Promise<StoryWorkspace>;
  saveBrief: (storyId: number, brief: string, expectedBrief?: string) => Promise<{ brief: string }>;
  saveFormat: (storyId: number, input: { format?: StoryVideoSettings["format"]; videoUrl?: string }) => Promise<StoryVideoSettings>;
  saveSource: (storyId: number, input: SourceInput, sourceId?: string) => Promise<ReportingResponse>;
  deleteSource: (storyId: number, sourceId: string) => Promise<ReportingResponse>;
  saveAppointment: (storyId: number, input: AppointmentInput, appointmentId?: string) => Promise<ReportingResponse>;
  deleteAppointment: (storyId: number, appointmentId: string) => Promise<ReportingResponse>;
  saveMediaAssignment: (storyId: number, input: MediaAssignmentInput, assignmentId?: string) => Promise<MediaAssignmentsResponse>;
  deleteMediaAssignment: (storyId: number, assignmentId: string) => Promise<MediaAssignmentsResponse>;
  addResource: (storyId: number, link: { label: string; url: string; purpose?: ResourcePurpose }) => Promise<{ resources: StoryResource[] }>;
  updateResource: (storyId: number, resourceId: string, link: { label: string; url: string; purpose?: ResourcePurpose }) => Promise<{ resources: StoryResource[] }>;
  removeResource: (storyId: number, resourceId: string) => Promise<{ resources: StoryResource[] }>;
  getNotes: (storyId: number, limit?: number) => Promise<ArticleNotesResponse>;
  getSchedule: (from: string, to: string, includeTasks?: boolean) => Promise<ScheduleResponse>;
};
