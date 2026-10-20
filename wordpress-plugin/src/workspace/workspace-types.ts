/**
 * The protected Story Workspace contract (`GET /byline/v1/editorial/stories/<id>/workspace`)
 * and the reporting / production records inside it.
 *
 * Everything here is private newsroom data. None of it is ever part of the
 * public site, the Astro snapshots, or a public WordPress REST response.
 */
import type { ContributorEntry, EditorialTask } from "../editorial/editorial-model";
import type { EditorialActivityRecord } from "../editorial/activity-model";
import type { ContributorPayload } from "../editorial/editorial-rest";
import type { MediaAttachment, MediaReadiness, PlanningPerson, PlanningStory } from "../planning/planning-model";

export const SOURCE_STATUSES = ["planned", "contacted", "waiting", "needs-scheduling", "scheduled", "interviewed", "declined", "unavailable"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const APPOINTMENT_KINDS = ["interview", "meeting", "event", "photo", "press-conference", "game", "performance", "reporting", "other"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];

export const APPOINTMENT_STATUSES = ["planned", "tentative", "confirmed", "completed", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const SCHEDULE_MODES = ["unscheduled", "window", "exact"] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

export const MEDIA_ASSIGNMENT_TYPES = ["photo", "gallery", "graphic", "video", "audio", "other"] as const;
export type MediaAssignmentType = (typeof MEDIA_ASSIGNMENT_TYPES)[number];

export const MEDIA_ASSIGNMENT_STATUSES = ["needed", "assigned", "in-progress", "uploaded", "selected", "done"] as const;
export type MediaAssignmentStatus = (typeof MEDIA_ASSIGNMENT_STATUSES)[number];

export const RESOURCE_PURPOSES = ["draft", "interview-notes", "transcript", "research", "data", "folder", "other"] as const;
export type ResourcePurpose = (typeof RESOURCE_PURPOSES)[number];

export type Assignee = { id: number; name: string };

/** A story-scoped reporting target. Never a global contact record: no phone or email. */
export type StorySource = {
  id: string;
  label: string;
  role: string;
  organization: string;
  status: SourceStatus;
  assigneeIds: number[];
  assignees: Assignee[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Where and when somebody has to be. Exact times are UTC instants; a target
 * window is date-only (YYYY-MM-DD) in the WordPress site timezone.
 */
export type StoryAppointment = {
  id: string;
  title: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  scheduleMode: ScheduleMode;
  windowStart: string | null;
  windowEnd: string | null;
  startAt: string | null;
  endAt: string | null;
  assigneeIds: number[];
  assignees: Assignee[];
  sourceId: string | null;
  sourceLabel: string | null;
  location: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryMediaAssignment = {
  id: string;
  title: string;
  type: MediaAssignmentType;
  status: MediaAssignmentStatus;
  assigneeId: number;
  assignee: PlanningPerson | null;
  dueAt: string;
  notes: string;
  attachmentIds: number[];
  attachments: MediaAttachment[];
  invalidAttachmentIds: number[];
  mediaReadiness: MediaReadiness | null;
  featuredAttachmentId: number | null;
  order: number;
  isLegacy: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoryResource = { id: string; label: string; url: string; kind: string; purpose: ResourcePurpose };

/** Note-free roll-up carried by Planning rows and the workspace. */
export type ReportingSummary = {
  sources: number;
  interviewed: number;
  needsScheduling: number;
  toSchedule: number;
  nextAppointment: Pick<StoryAppointment, "id" | "title" | "startAt" | "windowStart" | "windowEnd" | "scheduleMode"> | null;
};

export type MediaSummary = { total: number; open: number; assigneeIds: number[]; nextDueAt: string | null };

export type WorkspaceCapabilities = {
  role: "manager" | "participant";
  editArticle: boolean;
  changeStatus: boolean;
  assign: boolean;
  editContributors: boolean;
  editBrief: boolean;
  manageReporting: boolean;
  addSource: boolean;
  addAppointment: boolean;
  manageMedia: boolean;
  assignMedia: boolean;
  addTask: boolean;
  manageResources: boolean;
  review: boolean;
};

export type WorkspaceStatus = { id: string; label: string; group: string; selectable: boolean };

/** `story` is a Planning row plus the reporting roll-up. */
export type WorkspaceStory = PlanningStory & { reporting: ReportingSummary | null; mediaSummary: MediaSummary | null };

export type WorkspaceSection = "reporting" | "brief" | "contributors" | "tasks" | "media" | "resources" | "activity";

export type StoryWorkspace = {
  story: WorkspaceStory;
  revision: number;
  timezone: string;
  now: string;
  currentUser: PlanningPerson | null;
  brief: string;
  sections: string[];
  contributors: ContributorPayload;
  statuses: WorkspaceStatus[];
  tasks: EditorialTask[];
  sources: StorySource[];
  appointments: StoryAppointment[];
  reporting: ReportingSummary | null;
  mediaAssignments: StoryMediaAssignment[];
  resources: StoryResource[];
  activity: EditorialActivityRecord[];
  previewUrl: string;
  people: ContributorEntry[];
  capabilities: WorkspaceCapabilities;
  /** A section that failed to load; the rest of the payload is still valid. */
  errors: Partial<Record<WorkspaceSection, string>>;
  /** Present on `POST /editorial/stories`. */
  workspaceUrl?: string;
  template?: { tasks: number; mediaAssignments: number; errors: string[] };
};

/** Fields accepted by `POST /editorial/stories/<id>/sources[/<uuid>]`. */
export type SourceInput = Partial<Pick<StorySource, "label" | "role" | "organization" | "status" | "assigneeIds" | "notes">> & { expectedUpdatedAt?: string };

/** Fields accepted by `POST /editorial/stories/<id>/appointments[/<uuid>]`. Exact times are site-local `YYYY-MM-DDTHH:mm`. */
export type AppointmentInput = Partial<Pick<StoryAppointment, "title" | "kind" | "status" | "scheduleMode" | "windowStart" | "windowEnd" | "assigneeIds" | "sourceId" | "location" | "notes">> & {
  startAt?: string | null;
  endAt?: string | null;
  expectedUpdatedAt?: string;
};

export type MediaAssignmentInput = Partial<Pick<StoryMediaAssignment, "title" | "type" | "status" | "notes" | "attachmentIds" | "order">> & {
  assigneeId?: number;
  dueAt?: string | null;
  expectedUpdatedAt?: string;
};

export type ReportingResponse = { sources: StorySource[]; appointments: StoryAppointment[]; summary: ReportingSummary | null; sourceId?: string; appointmentId?: string };
export type MediaAssignmentsResponse = { mediaAssignments: StoryMediaAssignment[]; assignmentId?: string };

/** One row of the Calendar / Home schedule feed (`GET /editorial/schedule`). Notes are never included. */
export type ScheduleAppointment = Omit<StoryAppointment, "notes" | "createdAt" | "updatedAt"> & { storyId: number; storyTitle: string };
export type ScheduleMediaDeadline = { id: string; storyId: number; storyTitle: string; title: string; type: MediaAssignmentType; status: MediaAssignmentStatus; dueAt: string; assignee: PlanningPerson | null };
export type ScheduleTaskDeadline = { id: number; storyId: number | null; storyTitle: string; title: string; dueAt: string; assignee: PlanningPerson | null };
export type ScheduleResponse = {
  timezone: string;
  from: string;
  to: string;
  appointments: ScheduleAppointment[];
  needsScheduling: ScheduleAppointment[];
  mediaDeadlines: ScheduleMediaDeadline[];
  taskDeadlines: ScheduleTaskDeadline[];
};

/** The slice of an appointment Home receives for the signed-in user. */
export type HomeAppointment = Omit<ScheduleAppointment, "assignees" | "assigneeIds" | "notes">;
