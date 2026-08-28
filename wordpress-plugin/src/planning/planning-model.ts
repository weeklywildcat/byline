/**
 * Contracts and presentation-free helpers for the protected Planning API.
 *
 * Planning intentionally deals in normalized, private newsroom data. It does
 * not reuse the public wp/v2 post shape, which would either ship article
 * bodies to the planner or make private editorial fields look public.
 */

export const PLANNING_VIEW_IDS = [
  "board",
  "list",
  "calendar",
  "media",
  "coverage",
  "feedback",
  "performance",
  "content-health"
] as const;

export type PlanningView = (typeof PLANNING_VIEW_IDS)[number];

export type PlanningWorkflowGroup = "main" | "sidelined" | "derived";

export type PlanningWorkflowStatus = {
  id: string;
  label: string;
  group: PlanningWorkflowGroup;
  selectable: boolean;
};

/**
 * These labels are only a vocabulary fallback for an older endpoint. Story
 * state always comes from the injected REST response; the UI never invents
 * story records when the collection is unavailable.
 */
export const DEFAULT_WORKFLOW_STATUSES: PlanningWorkflowStatus[] = [
  { id: "pitch", label: "Pitch", group: "main", selectable: true },
  { id: "assigned", label: "Assigned", group: "main", selectable: true },
  { id: "reporting", label: "Reporting", group: "main", selectable: true },
  { id: "writing", label: "Writing", group: "main", selectable: true },
  { id: "editing", label: "Editing", group: "main", selectable: true },
  { id: "ready", label: "Ready for Review", group: "main", selectable: true },
  { id: "on-hold", label: "On Hold", group: "sidelined", selectable: true },
  { id: "dropped", label: "Dropped", group: "sidelined", selectable: true },
  { id: "published", label: "Published", group: "derived", selectable: false }
];

export type PlanningPerson = {
  id: number;
  name: string;
  avatarUrl?: string | null;
};

export type PlanningWordPressState = {
  id: string;
  label: string;
  isPublished: boolean;
  isScheduled: boolean;
  scheduledAt?: string | null;
  publishedAt?: string | null;
};

export type PlanningVisualType = "none" | "photo" | "gallery" | "graphic" | "video" | "other";
export type PlanningVisualStatus = "needed" | "assigned" | "in-progress" | "uploaded" | "selected" | "done";

export type PlanningVisualSummary = {
  type: PlanningVisualType;
  status: PlanningVisualStatus;
  label?: string;
  notes?: string;
  legacyNotes?: string;
  attachmentIds?: number[];
};

export type PlanningCoverageReference = {
  id: number;
  title: string;
  slug?: string;
};

export type PlanningFeaturedImage = {
  id: number;
  url?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  isSelectedVisual?: boolean;
};

export type PlanningStory = {
  id: number;
  title: string;
  editUrl: string;
  authors: PlanningPerson[];
  writer: PlanningPerson | null;
  editor: PlanningPerson | null;
  workflow: PlanningWorkflowStatus;
  wordpressState: PlanningWordPressState;
  deadline: string | null;
  plannedPublication: string | null;
  modifiedAt: string | null;
  visual: PlanningVisualSummary;
  openTaskCount: number;
  coverage: PlanningCoverageReference[];
  featuredImage: PlanningFeaturedImage | null;
  needsReview?: boolean;
};

export type PlanningCapabilities = {
  canMoveStories: boolean;
  canAssign: boolean;
  canManageSavedViews: boolean;
  canManageMedia: boolean;
  canManageCoverage: boolean;
  canManageFeedback: boolean;
};

export type PlanningSortKey = "story" | "workflow" | "writer" | "deadline" | "planned" | "modified";
export type PlanningSortDirection = "asc" | "desc";
export type PlanningSort = { key: PlanningSortKey; direction: PlanningSortDirection };

export const DEFAULT_PLANNING_SORT: PlanningSort = { key: "deadline", direction: "asc" };

export type PlanningFilters = {
  query: string;
  workflow: string;
  writerId: number | null;
  editorId: number | null;
  deadlineFrom: string;
  deadlineTo: string;
  plannedFrom: string;
  plannedTo: string;
  wordpressState: string;
  visualStatus: string;
  coverageId: number | null;
  mine: boolean;
  unassigned: boolean;
  overdue: boolean;
  needsReview: boolean;
};

export const EMPTY_PLANNING_FILTERS: PlanningFilters = {
  query: "",
  workflow: "",
  writerId: null,
  editorId: null,
  deadlineFrom: "",
  deadlineTo: "",
  plannedFrom: "",
  plannedTo: "",
  wordpressState: "",
  visualStatus: "",
  coverageId: null,
  mine: false,
  unassigned: false,
  overdue: false,
  needsReview: false
};

export type SavedPlanningView = {
  id: string;
  name: string;
  ownerId: number;
  filters: PlanningFilters;
  sort: PlanningSort;
  updatedAt?: string | null;
};

export type PlanningResponse = {
  stories: PlanningStory[];
  workflowStatuses: PlanningWorkflowStatus[];
  savedViews?: SavedPlanningView[];
  capabilities: PlanningCapabilities;
  currentUser?: PlanningPerson | null;
  total?: number;
  nextPage?: string | null;
};

export type MediaRequest = {
  id: number;
  story: { id: number; title: string; editUrl: string };
  type: PlanningVisualType;
  status: PlanningVisualStatus;
  assignee: PlanningPerson | null;
  dueAt: string | null;
  notes: string;
  legacyNotes?: string;
  attachmentIds: number[];
  featuredAttachmentId?: number | null;
};

export type MediaDeskResponse = {
  requests: MediaRequest[];
  assignees?: PlanningPerson[];
  capabilities?: Pick<PlanningCapabilities, "canAssign" | "canManageMedia">;
};

export type CoverageStatus = "active" | "upcoming" | "past" | "draft" | "archived";

export type CoverageItem = {
  id: number;
  title: string;
  slug: string;
  shortDescription?: string;
  artwork?: { url: string; alt?: string; width?: number; height?: number } | null;
  startAt: string | null;
  endAt: string | null;
  status: CoverageStatus;
  publicLandingEnabled: boolean;
  staff: PlanningPerson[];
  storyCount: number;
  plannedStoryCount: number;
  stories?: Array<{ id: number; title: string; editUrl: string; isPublished: boolean }>;
};

export type CoverageResponse = {
  coverage: CoverageItem[];
  capabilities?: Pick<PlanningCapabilities, "canManageCoverage">;
};

export type FeedbackStatus = "new" | "reviewed" | "closed" | "spam";
export type FeedbackType = "correction" | "tip" | "general";

export type FeedbackItem = {
  id: number;
  type: FeedbackType;
  status: FeedbackStatus;
  message: string;
  name?: string | null;
  email?: string | null;
  createdAt: string;
  story?: { id: number; title: string; url: string; editUrl?: string } | null;
};

export type FeedbackResponse = {
  feedback: FeedbackItem[];
  capabilities?: Pick<PlanningCapabilities, "canManageFeedback">;
};

export type PerformanceMetric = {
  id: string;
  label: string;
  value?: number | string | null;
  formatted?: string | null;
  supported: boolean;
  description?: string;
};

export type PerformanceResponse = {
  provider?: { id: string; label: string; configured: boolean } | null;
  metrics: PerformanceMetric[];
  topStories?: Array<{ story: PlanningStory; views?: number; trend?: number | null }>;
  sources?: Array<{ label: string; value: number; percentage?: number }>;
  newsletter?: { label: string; value?: number | string | null; supported: boolean }[];
  searchGaps?: Array<{ query: string; count: number }>;
};

export type ContentHealthSeverity = "error" | "warning" | "info";

export type ContentHealthIssue = {
  id: string;
  type: string;
  severity: ContentHealthSeverity;
  problem: string;
  story?: { id: number; title: string; editUrl: string } | null;
  lastCheckedAt?: string | null;
  fixUrl?: string | null;
};

export type ContentHealthResponse = {
  issues: ContentHealthIssue[];
  lastRunAt?: string | null;
  scannerAvailable?: boolean;
};

export type CalendarEventType = "deadline" | "planned" | "scheduled" | "published";

export type PlanningCalendarEvent = {
  id: string;
  storyId: number;
  storyTitle: string;
  storyUrl: string;
  type: CalendarEventType;
  date: string;
  exactDate: string;
  label: string;
};

export type OptionalResource<T> = {
  data: T | null;
  error: string | null;
  available: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

/** Parse date-only values in local time and timestamps using their offset. */
export function parsePlanningDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0, 0);
    return isValidDate(date) ? date : null;
  }

  const date = new Date(value);
  return isValidDate(date) ? date : null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

export function planningDateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function exactPlanningDate(value: string | null | undefined): string {
  const date = parsePlanningDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: value?.includes("T") ? "short" : undefined
  }).format(date);
}

/**
 * Deadline copy is deliberately relative while its exact value remains in the
 * title/accessible name. Planned publication uses a separate formatter so the
 * two concepts cannot collapse into one label.
 */
export function relativePlanningDate(value: string | null | undefined, now = new Date()): string {
  const date = parsePlanningDate(value);
  if (!date) return "";

  const delta = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";

  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  if (delta > 1) return `${weekday} · ${delta} days`;
  return `${Math.abs(delta)} ${Math.abs(delta) === 1 ? "day" : "days"} overdue`;
}

export function isPlanningDateOverdue(value: string | null | undefined, now = new Date()): boolean {
  const date = parsePlanningDate(value);
  return Boolean(date && startOfDay(date).getTime() < startOfDay(now).getTime());
}

export type PlanningStoryDates = {
  deadline: { value: string | null; relative: string; exact: string };
  plannedPublication: { value: string | null; exact: string };
  scheduled: { value: string | null; exact: string };
  published: { value: string | null; exact: string };
};

export function storyDateSemantics(story: PlanningStory): PlanningStoryDates {
  return {
    deadline: {
      value: story.deadline,
      relative: relativePlanningDate(story.deadline),
      exact: exactPlanningDate(story.deadline)
    },
    plannedPublication: {
      value: story.plannedPublication,
      exact: exactPlanningDate(story.plannedPublication)
    },
    scheduled: {
      value: story.wordpressState.scheduledAt ?? null,
      exact: exactPlanningDate(story.wordpressState.scheduledAt)
    },
    published: {
      value: story.wordpressState.publishedAt ?? null,
      exact: exactPlanningDate(story.wordpressState.publishedAt)
    }
  };
}

function normalized(value: string | null | undefined): string {
  return (value || "").trim().toLocaleLowerCase();
}

function inDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  const date = parsePlanningDate(value);
  if (!date) return false;
  const key = planningDateKey(date);
  return (!from || key >= from) && (!to || key <= to);
}

export function normalizePlanningFilters(filters?: Partial<PlanningFilters>): PlanningFilters {
  return {
    ...EMPTY_PLANNING_FILTERS,
    ...filters,
    query: filters?.query ?? EMPTY_PLANNING_FILTERS.query,
    workflow: filters?.workflow ?? EMPTY_PLANNING_FILTERS.workflow,
    writerId: filters?.writerId ?? EMPTY_PLANNING_FILTERS.writerId,
    editorId: filters?.editorId ?? EMPTY_PLANNING_FILTERS.editorId,
    coverageId: filters?.coverageId ?? EMPTY_PLANNING_FILTERS.coverageId,
    mine: Boolean(filters?.mine),
    unassigned: Boolean(filters?.unassigned),
    overdue: Boolean(filters?.overdue),
    needsReview: Boolean(filters?.needsReview)
  };
}

export function filterPlanningStories(
  stories: PlanningStory[],
  filters: Partial<PlanningFilters> = {},
  currentUserId?: number,
  now = new Date()
): PlanningStory[] {
  const applied = normalizePlanningFilters(filters);
  const query = normalized(applied.query);

  return stories.filter((story) => {
    const searchText = normalized([
      story.title,
      story.writer?.name,
      story.editor?.name,
      ...story.authors.map((author) => author.name),
      ...story.coverage.map((coverage) => coverage.title)
    ].join(" "));

    if (query && !searchText.includes(query)) return false;
    if (applied.workflow && story.workflow.id !== applied.workflow) return false;
    if (applied.writerId !== null && story.writer?.id !== applied.writerId) return false;
    if (applied.editorId !== null && story.editor?.id !== applied.editorId) return false;
    if (!inDateRange(story.deadline, applied.deadlineFrom, applied.deadlineTo)) return false;
    if (!inDateRange(story.plannedPublication, applied.plannedFrom, applied.plannedTo)) return false;
    if (applied.wordpressState && story.wordpressState.id !== applied.wordpressState) return false;
    if (applied.visualStatus && story.visual.status !== applied.visualStatus) return false;
    if (applied.coverageId !== null && !story.coverage.some((coverage) => coverage.id === applied.coverageId)) return false;
    if (applied.mine && (!currentUserId || (story.writer?.id !== currentUserId && story.editor?.id !== currentUserId))) return false;
    if (applied.unassigned && story.editor !== null) return false;
    if (applied.overdue && !isPlanningDateOverdue(story.deadline, now)) return false;
    if (applied.needsReview && !(story.needsReview || story.workflow.id === "ready" || story.workflow.id === "ready-for-review")) return false;

    return true;
  });
}

function emptyLast(): number {
  return Number.MAX_SAFE_INTEGER;
}

function storySortValue(story: PlanningStory, key: PlanningSortKey): string | number {
  switch (key) {
    case "story":
      return normalized(story.title);
    case "workflow":
      return normalized(story.workflow.label);
    case "writer":
      return normalized(story.writer?.name);
    case "deadline":
      return parsePlanningDate(story.deadline)?.getTime() ?? emptyLast();
    case "planned":
      return parsePlanningDate(story.plannedPublication)?.getTime() ?? emptyLast();
    case "modified":
      return parsePlanningDate(story.modifiedAt)?.getTime() ?? 0;
  }
}

export function sortPlanningStories(stories: PlanningStory[], sort: PlanningSort = DEFAULT_PLANNING_SORT): PlanningStory[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...stories].sort((left, right) => {
    const leftValue = storySortValue(left, sort.key);
    const rightValue = storySortValue(right, sort.key);
    if (leftValue < rightValue) return -1 * direction;
    if (leftValue > rightValue) return 1 * direction;
    return left.id - right.id;
  });
}

export function boardWorkflowStatuses(statuses: PlanningWorkflowStatus[] = DEFAULT_WORKFLOW_STATUSES): PlanningWorkflowStatus[] {
  return statuses.filter((status) => status.group === "main");
}

export function movableWorkflowStatuses(statuses: PlanningWorkflowStatus[] = DEFAULT_WORKFLOW_STATUSES): PlanningWorkflowStatus[] {
  return statuses.filter((status) => status.group !== "derived" && status.selectable);
}

export function canMovePlanningStory(story: PlanningStory, targetStatus: string, statuses: PlanningWorkflowStatus[]): boolean {
  if (story.wordpressState.isPublished) return false;
  const target = statuses.find((status) => status.id === targetStatus);
  return Boolean(target && target.group !== "derived" && target.selectable);
}

export type PlanningMoveResult = { moved: boolean; story: PlanningStory; error?: string };

export function applyPlanningMove(
  story: PlanningStory,
  targetStatus: string,
  statuses: PlanningWorkflowStatus[]
): PlanningMoveResult {
  if (story.workflow.id === targetStatus) return { moved: false, story };
  if (!canMovePlanningStory(story, targetStatus, statuses)) {
    return {
      moved: false,
      story,
      error: story.wordpressState.isPublished
        ? "Published is derived from WordPress and cannot be moved as a workflow stage."
        : "That workflow stage is not available for this story."
    };
  }

  const target = statuses.find((status) => status.id === targetStatus);
  if (!target) return { moved: false, story, error: "That workflow stage is not available for this story." };
  return { moved: true, story: { ...story, workflow: target } };
}

export function filterSavedViewsForUser(views: SavedPlanningView[], ownerId: number): SavedPlanningView[] {
  return views.filter((view) => view.ownerId === ownerId);
}

export function serializeSavedPlanningView(view: SavedPlanningView): string {
  return JSON.stringify({
    id: view.id,
    name: view.name.trim(),
    ownerId: view.ownerId,
    filters: normalizePlanningFilters(view.filters),
    sort: view.sort
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlanningSort(value: unknown): value is PlanningSort {
  if (!isRecord(value)) return false;
  return ["story", "workflow", "writer", "deadline", "planned", "modified"].includes(String(value.key))
    && (value.direction === "asc" || value.direction === "desc");
}

export function deserializeSavedPlanningView(value: string, expectedOwnerId?: number): SavedPlanningView | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.name !== "string" || !parsed.name.trim()) return null;
    if (typeof parsed.ownerId !== "number" || !isRecord(parsed.filters) || !isPlanningSort(parsed.sort)) return null;
    if (expectedOwnerId !== undefined && parsed.ownerId !== expectedOwnerId) return null;

    return {
      id: parsed.id,
      name: parsed.name.trim(),
      ownerId: parsed.ownerId,
      filters: normalizePlanningFilters(parsed.filters as Partial<PlanningFilters>),
      sort: parsed.sort
    };
  } catch {
    return null;
  }
}

export function planningCalendarEvents(stories: PlanningStory[]): PlanningCalendarEvent[] {
  const events: PlanningCalendarEvent[] = [];
  const add = (story: PlanningStory, type: CalendarEventType, value: string | null | undefined, label: string) => {
    if (!value || !parsePlanningDate(value)) return;
    events.push({
      id: `${story.id}-${type}`,
      storyId: story.id,
      storyTitle: story.title,
      storyUrl: story.editUrl,
      type,
      date: planningDateKey(parsePlanningDate(value) as Date),
      exactDate: exactPlanningDate(value),
      label
    });
  };

  stories.forEach((story) => {
    add(story, "deadline", story.deadline, "Deadline");
    add(story, "planned", story.plannedPublication, "Planned publication");
    add(story, "scheduled", story.wordpressState.scheduledAt, "Scheduled in WordPress");
    add(story, "published", story.wordpressState.publishedAt, "Published");
  });

  return events.sort((left, right) => left.date.localeCompare(right.date) || left.storyTitle.localeCompare(right.storyTitle));
}

export type PlanningCalendarDay = { date: Date; key: string; isCurrentMonth: boolean };

export function monthCalendarDays(month: Date): PlanningCalendarDay[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12, 0, 0, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, key: planningDateKey(date), isCurrentMonth: date.getMonth() === month.getMonth() };
  });
}

export function weekCalendarDays(date: Date): PlanningCalendarDay[] {
  const day = startOfDay(date);
  const mondayOffset = (day.getDay() + 6) % 7;
  const start = new Date(day);
  start.setDate(day.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    return { date: next, key: planningDateKey(next), isCurrentMonth: next.getMonth() === date.getMonth() };
  });
}

export function describePlanningError(error: unknown, fallback = "Planning data is unavailable right now."): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

export function optionalApiFallback<T>(error: unknown, fallback: T | null, label: string): OptionalResource<T> {
  return {
    data: fallback,
    error: describePlanningError(error, `${label} is unavailable right now.`),
    available: false
  };
}
