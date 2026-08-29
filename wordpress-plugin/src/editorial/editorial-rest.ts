import type {
  ContributorEntry,
  CorrectionInput,
  CorrectionRecord,
  DistributionChannel,
  EditorialTask,
  EditorialActivityPayload,
  EditorialWorkflowPayload,
  ReadinessCheck,
  TaskInput,
  TaskPatch,
  WorkflowDateChanges
} from "./editorial-model";

/** The narrow request shape shared by WordPress apiFetch and test adapters. */
export type ProtectedEditorialRequest = {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  data?: unknown;
};

export type ProtectedEditorialFetcher = <T>(request: ProtectedEditorialRequest) => Promise<T>;

export type ReadinessPayload = {
  storyId: number;
  checks: ReadinessCheck[];
  generatedAt?: string;
};

export type TaskPayload = {
  storyId?: number;
  tasks: EditorialTask[];
  people?: ContributorEntry[];
  capabilities: {
    canEditLinkedStory: boolean;
    canAssign: boolean;
    canDelete: boolean;
    canManageUnlinked: boolean;
  };
};

export type ContributorPayload = {
  storyId: number;
  contributors: ContributorEntry[];
  available?: ContributorEntry[];
  canEdit: boolean;
};

export type CorrectionPayload = {
  storyId: number;
  records: CorrectionRecord[];
  legacyText?: string | null;
  canEdit: boolean;
};

export type DistributionPayload = {
  storyId: number;
  headline: string;
  canonicalUrl: string;
  excerpt?: string;
  channels: DistributionChannel[];
  capabilities: {
    addToNewsletter: boolean;
  };
};

export type EditorialRestClient = {
  getWorkflow: (storyId: number) => Promise<EditorialWorkflowPayload>;
  getWorkflowBootstrap: (storyId: number) => Promise<EditorialWorkflowPayload>;
  updateWorkflow: (storyId: number, changes: { status?: string } & WorkflowDateChanges & { editorId?: number | null; visuals?: string | null; expectedRevision?: number }) => Promise<EditorialWorkflowPayload>;
  getReadiness: (storyId: number) => Promise<ReadinessPayload>;
  listTasks: (storyId?: number) => Promise<TaskPayload>;
  createTask: (input: TaskInput) => Promise<TaskPayload>;
  updateTask: (taskId: number | string, patch: TaskPatch) => Promise<EditorialTask>;
  deleteTask: (taskId: number | string) => Promise<void>;
  getContributors: (storyId: number) => Promise<ContributorPayload>;
  saveContributors: (storyId: number, contributors: ContributorEntry[]) => Promise<ContributorPayload>;
  getCorrections: (storyId: number) => Promise<CorrectionPayload>;
  createCorrection: (storyId: number, input: CorrectionInput) => Promise<CorrectionPayload>;
  updateCorrection: (storyId: number, correctionId: number | string, input: CorrectionInput) => Promise<CorrectionPayload>;
  deleteCorrection: (storyId: number, correctionId: number | string) => Promise<CorrectionPayload>;
  getActivity: (storyId: number, limit?: number) => Promise<EditorialActivityPayload>;
  getDistribution: (storyId: number) => Promise<DistributionPayload>;
  distributionAction: (storyId: number, channelId: string, action: "send" | "schedule" | "markDistributed") => Promise<DistributionPayload>;
  addToNewsletter: (storyId: number) => Promise<DistributionPayload>;
};

const storyPath = (storyId: number) => `/byline/v1/editorial/stories/${storyId}`;
const taskPath = (taskId: number | string) => `/byline/v1/editorial/tasks/${encodeURIComponent(String(taskId))}`;

/**
 * Construct a client for the capability-protected REST surface. No component
 * calls REST directly, which keeps the panels usable with apiFetch, a nonce-
 * configured wrapper, or a host application's test transport.
 */
export function createEditorialRestClient(request: ProtectedEditorialFetcher): EditorialRestClient {
  return {
    getWorkflow: (storyId) => request<EditorialWorkflowPayload>({ path: storyPath(storyId) }),

    getWorkflowBootstrap: (storyId) => request<EditorialWorkflowPayload>({ path: `${storyPath(storyId)}/bootstrap` }),

    updateWorkflow: (storyId, changes) => request<EditorialWorkflowPayload>({
      path: storyPath(storyId),
      method: "POST",
      data: changes
    }),

    getReadiness: (storyId) => request<ReadinessPayload>({
      path: `/byline/v1/editorial/readiness/${storyId}`
    }),

    listTasks: (storyId) => request<TaskPayload>({
      path: storyId == null ? "/byline/v1/editorial/tasks" : `${storyPath(storyId)}/tasks`
    }),

    createTask: (input) => request<TaskPayload>({
      path: input.storyId == null ? "/byline/v1/editorial/tasks" : `${storyPath(input.storyId)}/tasks`,
      method: "POST",
      data: input
    }),

    updateTask: (taskId, patch) => request<EditorialTask>({
      path: taskPath(taskId),
      method: "POST",
      data: patch
    }),

    deleteTask: (taskId) => request<void>({ path: taskPath(taskId), method: "DELETE" }),

    getContributors: (storyId) => request<ContributorPayload>({
      path: `${storyPath(storyId)}/contributors`
    }),

    saveContributors: (storyId, contributors) => request<ContributorPayload>({
      path: `${storyPath(storyId)}/contributors`,
      method: "POST",
      data: { contributors }
    }),

    getCorrections: (storyId) => request<CorrectionPayload>({
      path: `${storyPath(storyId)}/corrections`
    }),

    createCorrection: (storyId, input) => request<CorrectionPayload>({
      path: `${storyPath(storyId)}/corrections`,
      method: "POST",
      data: input
    }),

    updateCorrection: (storyId, correctionId, input) => request<CorrectionPayload>({
      path: `${storyPath(storyId)}/corrections/${encodeURIComponent(String(correctionId))}`,
      method: "POST",
      data: input
    }),

    deleteCorrection: (storyId, correctionId) => request<CorrectionPayload>({
      path: `${storyPath(storyId)}/corrections/${encodeURIComponent(String(correctionId))}`,
      method: "DELETE"
    }),

    getActivity: (storyId, limit = 20) => request<EditorialActivityPayload>({
      path: `${storyPath(storyId)}/activity?limit=${Math.min(50, Math.max(1, Math.floor(limit)))}`
    }),

    getDistribution: (storyId) => request<DistributionPayload>({
      path: `${storyPath(storyId)}/distribution`
    }),

    distributionAction: (storyId, channelId, action) => request<DistributionPayload>({
      path: `${storyPath(storyId)}/distribution/${encodeURIComponent(channelId)}`,
      method: "POST",
      data: { action }
    }),

    addToNewsletter: (storyId) => request<DistributionPayload>({
      path: `${storyPath(storyId)}/distribution/newsletter`,
      method: "POST",
      data: { storyId }
    })
  };
}

export function describeProtectedRestFailure(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return "This newsroom service is temporarily unavailable. Your article is safe; try again when the connection returns.";
}
