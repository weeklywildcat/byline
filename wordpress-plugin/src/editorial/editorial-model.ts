/**
 * Shared, presentation-free contracts for the reusable editorial panels.
 *
 * The admin entrypoints own loading and persistence. These helpers deliberately
 * accept plain values so they can be used by a WordPress REST adapter, a test
 * harness, or a future editor integration without creating a second data store.
 */

export type EditorialStatusGroup = "main" | "sidelined" | "derived";

export type WorkflowStatusDefinition = {
  id: string;
  label: string;
  group: EditorialStatusGroup;
  selectable: boolean;
};

/** Keep these identifiers in lockstep with the existing PHP workflow contract. */
export const DEFAULT_WORKFLOW_STATUSES: readonly WorkflowStatusDefinition[] = [
  { id: "pitch", label: "Pitch", group: "main", selectable: true },
  { id: "assigned", label: "Assigned", group: "main", selectable: true },
  { id: "reporting", label: "Reporting", group: "main", selectable: true },
  { id: "writing", label: "Writing", group: "main", selectable: true },
  { id: "editing", label: "Editing", group: "main", selectable: true },
  { id: "ready", label: "Ready for Review", group: "main", selectable: true },
  { id: "on-hold", label: "On Hold", group: "sidelined", selectable: true },
  { id: "dropped", label: "Dropped", group: "sidelined", selectable: true },
  { id: "published", label: "Published", group: "derived", selectable: false }
] as const;

export type ContributorKind = "user" | "guest";

/**
 * A contributor reference is intentionally small. Email addresses and internal
 * notes are accepted only for admin-side records and never projected publicly.
 */
export type ContributorRef = {
  id: number | string;
  kind: ContributorKind;
  name: string;
  role?: string;
  slug?: string;
  imageUrl?: string;
  publicUrl?: string;
  email?: string;
  internalNotes?: string;
  order?: number;
};

export type PublicContributor = {
  id: number | string;
  kind: ContributorKind;
  name: string;
  role?: string;
  slug?: string;
  imageUrl?: string;
  publicUrl?: string;
};

export type VisualStatus = "none" | "needed" | "assigned" | "in-progress" | "uploaded" | "selected" | "done";

export type VisualSummary = {
  type?: "none" | "photo" | "gallery" | "graphic" | "video" | "other";
  status: VisualStatus;
  label?: string;
};

export type WorkflowStory = {
  postId: number;
  /** Private revision used to detect stale collaborative edits. */
  revision?: number;
  title?: string;
  editUrl?: string;
  status: string;
  /** The stored workflow value. It remains separate from the derived display status. */
  storedStatus?: string;
  postStatus: string;
  isPublished: boolean;
  writer?: ContributorRef | null;
  editor?: ContributorRef | null;
  editorId?: number | null;
  deadline?: string | null;
  plannedPublication?: string | null;
  scheduledAt?: string | null;
  visual?: VisualSummary | null;
  /** Legacy free-text visual need, retained for compatibility. */
  visuals?: string | null;
  tasksOpen?: number;
  coverage?: string[];
  modifiedAt?: string | null;
};

export type WorkflowCapabilities = {
  changeStatus: boolean;
  assign?: boolean;
  changeDeadline?: boolean;
  changePlannedPublication?: boolean;
};

export type NotesAvailability = {
  available: boolean;
  url?: string;
  message?: string;
};

export type EditorialWorkflowPayload = {
  story: WorkflowStory;
  statuses?: WorkflowStatusDefinition[];
  capabilities: WorkflowCapabilities;
  writer?: ContributorRef | null;
  editors?: ContributorRef[];
  notes?: NotesAvailability;
};

export type WorkflowDateChanges = {
  deadline?: string | null;
  plannedPublication?: string | null;
};

export type WorkflowStage = WorkflowStatusDefinition & {
  isCurrent: boolean;
  isDone: boolean;
};

export const DATE_FIELD_LABELS = {
  deadline: "Deadline",
  plannedPublication: "Planned publication",
  scheduled: "WordPress scheduled",
  published: "Published"
} as const;

export type EditorialDateKind = keyof typeof DATE_FIELD_LABELS;

export type EditorialDateField = {
  kind: EditorialDateKind;
  value: string | null | undefined;
  label: string;
};

const DAY_MS = 86_400_000;

/** Parse a WordPress date without letting a date-only value cross a timezone boundary. */
export function parseEditorialDate(value: string | null | undefined): Date | null {
  if (!value || !value.trim()) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateAtNoon(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
}

export function formatExactEditorialDate(
  value: string | null | undefined,
  locale?: string,
  timeZone?: string
): string {
  const parsed = parseEditorialDate(value);
  if (!parsed) return "Not set";

  const hasTime = typeof value === "string" && value.includes("T");
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(hasTime ? { timeStyle: "short" as const } : {}),
    ...(timeZone ? { timeZone } : {})
  }).format(parsed);
}

/**
 * Human-friendly urgency text for deadlines. The exact date remains available
 * separately in the UI so relative wording never becomes the only date signal.
 */
export function describeDeadline(value: string | null | undefined, now = new Date()): string {
  const parsed = parseEditorialDate(value);
  if (!parsed) return "No deadline";

  const delta = Math.round((dateAtNoon(parsed).getTime() - dateAtNoon(now).getTime()) / DAY_MS);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";

  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(parsed);
  if (delta > 1) return `${weekday} · ${delta} days`;
  return `${weekday} · ${Math.abs(delta)} days overdue`;
}

export function workflowDateFields(story: WorkflowStory): EditorialDateField[] {
  return [
    { kind: "deadline", value: story.deadline, label: DATE_FIELD_LABELS.deadline },
    { kind: "plannedPublication", value: story.plannedPublication, label: DATE_FIELD_LABELS.plannedPublication },
    { kind: "scheduled", value: story.scheduledAt, label: DATE_FIELD_LABELS.scheduled }
  ];
}

export function isPublishedStory(story: Pick<WorkflowStory, "isPublished" | "postStatus">): boolean {
  return story.isPublished || story.postStatus === "publish";
}

/** Published is derived from WordPress and must never become a move target. */
export function effectiveWorkflowStatus(story: Pick<WorkflowStory, "status" | "postStatus" | "isPublished">): string {
  return isPublishedStory(story) ? "published" : story.status;
}

export function workflowStages(
  statuses: WorkflowStatusDefinition[] = [...DEFAULT_WORKFLOW_STATUSES],
  current: string
): { main: WorkflowStage[]; sidelined: WorkflowStage[] } {
  const main = statuses.filter((status) => status.group === "main");
  const sidelined = statuses.filter((status) => status.group === "sidelined");
  const currentIndex = main.findIndex((status) => status.id === current);

  return {
    main: main.map((status, index) => ({
      ...status,
      isCurrent: status.id === current,
      isDone: currentIndex >= 0 && index < currentIndex
    })),
    sidelined: sidelined.map((status) => ({ ...status, isCurrent: status.id === current, isDone: false }))
  };
}

export function selectableWorkflowStatuses(
  statuses: WorkflowStatusDefinition[] = [...DEFAULT_WORKFLOW_STATUSES]
): WorkflowStatusDefinition[] {
  return statuses.filter((status) => status.selectable && status.group !== "derived");
}

export function workflowStatusLabel(
  status: string,
  statuses: WorkflowStatusDefinition[] = [...DEFAULT_WORKFLOW_STATUSES]
): string {
  return statuses.find((candidate) => candidate.id === status)?.label ?? status;
}

export type ReadinessState = "pass" | "warning" | "error";

export type ReadinessFix = {
  label: string;
  href?: string;
  actionId?: string;
};

export type ReadinessCheck = {
  id: string;
  label: string;
  state: ReadinessState;
  explanation: string;
  fix?: ReadinessFix;
};

export type ReadinessSummary = {
  passed: number;
  warnings: number;
  errors: number;
  total: number;
  label: string;
  canPublish: boolean;
};

export function summarizeReadiness(checks: ReadinessCheck[]): ReadinessSummary {
  const passed = checks.filter((check) => check.state === "pass").length;
  const warnings = checks.filter((check) => check.state === "warning").length;
  const errors = checks.filter((check) => check.state === "error").length;
  return {
    passed,
    warnings,
    errors,
    total: checks.length,
    label: `${passed}/${checks.length} ready`,
    // Warnings are intentionally non-blocking; only errors prevent readiness.
    canPublish: errors === 0
  };
}

export function readinessStateLabel(state: ReadinessState): string {
  if (state === "pass") return "Pass";
  if (state === "warning") return "Warning";
  return "Error";
}

export type TaskState = "open" | "completed";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type EditorialTask = {
  id: number | string;
  title: string;
  state: TaskState;
  assignee?: ContributorRef | null;
  assigneeId?: number | null;
  dueAt?: string | null;
  priority: TaskPriority;
  storyId?: number | null;
  coverageId?: number | null;
  createdBy?: ContributorRef | null;
  completedAt?: string | null;
  order: number;
};

export type TaskPermissionContext = {
  canEditLinkedStory: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canManageUnlinked: boolean;
};

export type TaskInput = {
  title: string;
  assigneeId?: number | null;
  dueAt?: string | null;
  priority: TaskPriority;
  storyId?: number | null;
  coverageId?: number | null;
};

export type TaskPatch = Partial<Pick<EditorialTask, "title" | "state" | "assigneeId" | "dueAt" | "priority" | "order">>;

export function canEditTask(task: Pick<EditorialTask, "storyId">, context: TaskPermissionContext): boolean {
  return task.storyId == null ? context.canManageUnlinked : context.canEditLinkedStory;
}

export function canAssignTask(task: Pick<EditorialTask, "storyId">, context: TaskPermissionContext): boolean {
  return canEditTask(task, context) && context.canAssign;
}

export function canDeleteTask(task: Pick<EditorialTask, "storyId">, context: TaskPermissionContext): boolean {
  return canEditTask(task, context) && context.canDelete;
}

/** Return the same object for a no-op, making retries and duplicate clicks safe. */
export function setTaskCompletionState(
  task: EditorialTask,
  state: TaskState,
  completedAt = new Date().toISOString()
): EditorialTask {
  if (task.state === state) return task;
  return {
    ...task,
    state,
    completedAt: state === "completed" ? task.completedAt ?? completedAt : null
  };
}

export function taskStateLabel(state: TaskState): string {
  return state === "completed" ? "Completed" : "Open";
}

export type ContributorEntry = ContributorRef & { order?: number };

export function contributorKey(contributor: Pick<ContributorRef, "id" | "kind">): string {
  return `${contributor.kind}:${String(contributor.id)}`;
}

export function orderContributors(entries: ContributorEntry[]): ContributorEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.order ?? a.index) - (b.entry.order ?? b.index))
    .map(({ entry }, index) => ({ ...entry, order: index }));
}

export function moveContributor(entries: ContributorEntry[], index: number, direction: "up" | "down"): ContributorEntry[] {
  const ordered = orderContributors(entries);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= ordered.length || nextIndex < 0 || nextIndex >= ordered.length) return ordered;
  const next = [...ordered];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next.map((entry, order) => ({ ...entry, order }));
}

/** Strip fields that are never needed by the public article or schema output. */
export function projectContributorPublic(entry: ContributorEntry): PublicContributor {
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    ...(entry.role ? { role: entry.role } : {}),
    ...(entry.slug ? { slug: entry.slug } : {}),
    ...(entry.imageUrl ? { imageUrl: entry.imageUrl } : {}),
    ...(entry.publicUrl ? { publicUrl: entry.publicUrl } : {})
  };
}

export function projectContributorsPublic(entries: ContributorEntry[]): PublicContributor[] {
  return orderContributors(entries).map(projectContributorPublic);
}

export type CorrectionType = "correction" | "clarification" | "editors-note" | "substantive-update";

export type CorrectionRecord = {
  id: number | string;
  type: CorrectionType;
  date?: string | null;
  publicText: string;
  recordedByUserId?: number | null;
  createdAt?: string | null;
  modifiedAt?: string | null;
  legacy?: boolean;
};

export type CorrectionInput = Pick<CorrectionRecord, "type" | "date" | "publicText">;

export type { EditorialActivityActor, EditorialActivityPayload, EditorialActivityRecord, EditorialActivityStory } from "./activity-model";

export function correctionTypeLabel(type: CorrectionType): string {
  if (type === "editors-note") return "Editor's note";
  if (type === "substantive-update") return "Substantive update";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Legacy Correction Notice blocks are read-only compatibility data. If a story
 * has structured records, the legacy text is not appended again, preventing a
 * migration from duplicating the same public notice.
 */
export function normalizeCorrectionRecords(
  records: CorrectionRecord[] | null | undefined,
  legacyText: string | null | undefined
): CorrectionRecord[] {
  const structured = (records ?? []).filter((record) => record.publicText.trim());
  if (structured.length > 0 || !legacyText?.trim()) return structured;

  return [
    {
      id: "legacy-correction-notice",
      type: "correction",
      date: null,
      publicText: legacyText.trim(),
      legacy: true
    }
  ];
}

export function projectCorrectionPublic(record: CorrectionRecord): Pick<CorrectionRecord, "id" | "type" | "date" | "publicText" | "createdAt" | "modifiedAt"> {
  return {
    id: record.id,
    type: record.type,
    date: record.date ?? null,
    publicText: record.publicText,
    createdAt: record.createdAt ?? null,
    modifiedAt: record.modifiedAt ?? null
  };
}

export type DistributionStatus = "ready" | "not-configured" | "pending" | "distributed" | "skipped" | "failed";
export type DistributionAction = "copy" | "markDistributed" | "send" | "schedule";

export type DistributionChannel = {
  id: string;
  label: string;
  status: DistributionStatus;
  configured: boolean;
  capabilities: Partial<Record<DistributionAction, boolean>>;
  provider?: string;
  distributedAt?: string | null;
  distributedBy?: ContributorRef | null;
  externalUrl?: string | null;
  lastError?: string | null;
};

export type DistributionPanelCapabilities = {
  addToNewsletter: boolean;
};

export function canUseDistributionAction(
  channel: DistributionChannel,
  action: DistributionAction
): boolean {
  if (action === "copy") return channel.capabilities.copy !== false;
  if (!channel.configured) return false;
  return channel.capabilities[action] === true;
}

export function distributionStatusLabel(status: DistributionStatus): string {
  if (status === "not-configured") return "Not configured";
  if (status === "distributed") return "Distributed";
  if (status === "pending") return "Pending";
  if (status === "skipped") return "Skipped";
  if (status === "failed") return "Failed";
  return "Ready";
}

export type DistributionCopyKind = "caption" | "headline-url" | "url";

export function buildDistributionCopy(
  kind: DistributionCopyKind,
  headline: string,
  canonicalUrl: string,
  excerpt = ""
): string {
  if (kind === "url") return canonicalUrl;
  if (kind === "caption") return excerpt.trim() ? `${headline}\n\n${excerpt.trim()}\n\n${canonicalUrl}` : `${headline}\n\n${canonicalUrl}`;
  return `${headline}\n${canonicalUrl}`;
}

export function describeEditorialError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}
