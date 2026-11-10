import type {
  ContributorEntry,
  GuestInput,
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
  canCreateGuests?: boolean;
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
  createGuest: (input: GuestInput) => Promise<Record<string, unknown>>;
  getCorrections: (storyId: number) => Promise<CorrectionPayload>;
  createCorrection: (storyId: number, input: CorrectionInput) => Promise<CorrectionPayload>;
  updateCorrection: (storyId: number, correctionId: number | string, input: CorrectionInput) => Promise<CorrectionPayload>;
  deleteCorrection: (storyId: number, correctionId: number | string, expectedUpdatedAt?: string) => Promise<CorrectionPayload>;
  getActivity: (storyId: number, limit?: number) => Promise<EditorialActivityPayload>;
  getDistribution: (storyId: number) => Promise<DistributionPayload>;
  distributionAction: (storyId: number, channelId: string, action: "send" | "schedule" | "markDistributed") => Promise<DistributionPayload>;
  addToNewsletter: (storyId: number) => Promise<DistributionPayload>;
};

export function describeProtectedRestFailure(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return "This newsroom service is temporarily unavailable. Your article is safe; try again when the connection returns.";
}
