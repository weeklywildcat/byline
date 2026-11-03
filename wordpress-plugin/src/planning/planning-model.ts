/**
 * Contracts and presentation-free helpers for the protected Planning API.
 *
 * Planning intentionally deals in normalized, private newsroom data. It does
 * not reuse the public wp/v2 post shape, which would either ship article
 * bodies to the planner or make private editorial fields look public.
 */

import { siteDay } from "../home/newsroom-model";
import type { ArticleNotesSummary } from "../story/notes-model";
import type { MediaSummary, ReportingSummary } from "../workspace/workspace-types";

export const PLANNING_VIEW_IDS = [
  "board",
  "list",
  "calendar",
  "media",
  "feedback",
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
  kind?: "user" | "guest";
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

export type PlanningVisualType = "none" | "photo" | "gallery" | "graphic" | "video" | "audio" | "other";
export type PlanningVisualStatus = "needed" | "assigned" | "in-progress" | "uploaded" | "selected" | "done";

export type PlanningVisualSummary = {
  type: PlanningVisualType;
  status: PlanningVisualStatus;
  label?: string;
  notes?: string;
  legacyNotes?: string;
  attachmentIds?: number[];
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
  sections?: string[];
  canEditPlanning?: boolean;
  id: number;
  title: string;
  editUrl: string;
  /** Draft preview link; empty when the viewer cannot edit the story. */
  previewUrl?: string;
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
  featuredImage: PlanningFeaturedImage | null;
  needsReview?: boolean;
  /** Note-free reporting roll-up (sources, interviews, appointments). Absent on older servers. */
  reporting?: ReportingSummary | null;
  /** Roll-up of production assignments. Absent on older servers. */
  mediaSummary?: MediaSummary | null;
  /**
   * WordPress Core Notes thread counts. Private, and `null` unless the viewer
   * may edit the story (not merely see it in the workspace). Absent on older servers.
   */
  notes?: ArticleNotesSummary | null;
};

export type PlanningCapabilities = {
  canMoveStories: boolean;
  canAssign: boolean;
  canManageSavedViews: boolean;
  canManageMedia: boolean;
  canManageFeedback: boolean;
};

export type PlanningSortKey = "story" | "workflow" | "writer" | "deadline" | "planned" | "modified";
export type PlanningSortDirection = "asc" | "desc";
export type PlanningSort = { key: PlanningSortKey; direction: PlanningSortDirection };

export const DEFAULT_PLANNING_SORT: PlanningSort = { key: "deadline", direction: "asc" };

export type PlanningFilters = {
  collectionId?: number;
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
  /** The site timezone every story date is read in. */
  timezone?: string;
  workflowStatuses: PlanningWorkflowStatus[];
  savedViews?: SavedPlanningView[];
  capabilities: PlanningCapabilities;
  currentUser?: PlanningPerson | null;
  total?: number;
  nextPage?: string | null;
};

export type MediaAttachmentChecks = {
  alt: boolean;
  credit: boolean;
  rights: boolean;
};

export type MediaAttachment = {
  id: number;
  title?: string;
  url?: string | null;
  previewUrl?: string | null;
  mimeType?: string | null;
  isImage?: boolean;
  alt?: string;
  creator?: string;
  creditText?: string;
  copyrightNotice?: string;
  licenseUrl?: string;
  acquireLicensePage?: string;
  checks?: MediaAttachmentChecks;
};

export type MediaReadiness = {
  attachmentIds?: number[];
  invalidAttachmentIds?: number[];
  missingAltIds?: number[];
  missingCreditIds?: number[];
  missingRightsIds?: number[];
  featuredAttachmentId?: number;
  ready?: boolean;
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
  attachments?: MediaAttachment[];
  invalidAttachmentIds?: number[];
  mediaReadiness?: MediaReadiness | null;
  featuredAttachmentId?: number | null;
};

/**
 * One production assignment (`GET /editorial/media` -> `assignments`). A story can
 * have several. `id` is a UUID, or `"legacy-v1"` for a story that still only has
 * its single original visual request.
 */
export type MediaAssignmentRow = {
  id: string;
  story: { id: number; title: string; editUrl: string };
  title: string;
  type: PlanningVisualType;
  status: PlanningVisualStatus;
  assignee: PlanningPerson | null;
  dueAt: string | null;
  notes: string;
  attachmentIds: number[];
  attachments?: MediaAttachment[];
  invalidAttachmentIds?: number[];
  mediaReadiness?: MediaReadiness | null;
  featuredAttachmentId?: number | null;
  order?: number;
  isLegacy?: boolean;
};

export type MediaDeskResponse = {
  requests: MediaRequest[];
  /** One row per production assignment. Missing on servers that predate assignments. */
  assignments?: MediaAssignmentRow[];
  /** Site timezone, when the server provides it; used to read due dates. */
  timezone?: string;
  assignees?: PlanningPerson[];
  capabilities?: Pick<PlanningCapabilities, "canAssign" | "canManageMedia">;
};

function mediaAttachmentId(value: unknown): number | null {
  const id = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value)
      : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeMediaAttachmentIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const ids: number[] = [];
  value.forEach((item) => {
    const id = mediaAttachmentId(item && typeof item === "object" ? (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).attachmentId : item);
    if (id !== null && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

export function mergeMediaAttachmentIds(current: unknown, additions: unknown): number[] {
  return normalizeMediaAttachmentIds([
    ...normalizeMediaAttachmentIds(current),
    ...normalizeMediaAttachmentIds(additions)
  ]);
}

export function removeMediaAttachmentId(current: unknown, attachmentId: unknown): number[] {
  const id = mediaAttachmentId(attachmentId);
  return id === null ? normalizeMediaAttachmentIds(current) : normalizeMediaAttachmentIds(current).filter((item) => item !== id);
}

/**
 * One note-free line for a story's reporting roll-up, e.g.
 * "3 sources · 1 interviewed · 1 needs scheduling". Empty when nothing is
 * being tracked. "Needs scheduling" counts the larger of sources waiting on a
 * time and open appointments with no exact time, since those are usually the
 * same people.
 */
export function reportingSummaryLine(reporting: ReportingSummary | null | undefined): string {
  if (!reporting) return "";
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const needs = Math.max(reporting.needsScheduling || 0, reporting.toSchedule || 0);
  const parts = [
    reporting.sources > 0 ? plural(reporting.sources, "source", "sources") : "",
    reporting.interviewed > 0 ? `${reporting.interviewed} interviewed` : "",
    needs > 0 ? `${needs} needs scheduling` : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

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

export type ContentHealthSeverity = "error" | "warning" | "info";

export type ContentHealthFixTarget =
  | {
      kind: "block";
      blockPath: number[];
      blockName?: string;
      attribute?: string;
      valueFingerprint?: string;
    }
  | {
      kind: "featured-image";
    }
  | {
      kind: "story-sidebar";
      panel: "tasks" | "visuals" | "contributors" | "workflow";
    }
  | {
      kind: "settings";
      url: string;
    };

/** The subset of a live Gutenberg block tree needed for safe navigation. */
export type ContentHealthEditorBlock = {
  name: string;
  clientId?: string;
  attributes?: Record<string, unknown>;
  innerBlocks?: ContentHealthEditorBlock[];
};

export type ContentHealthIssue = {
  id: string;
  type: string;
  severity: ContentHealthSeverity;
  problem: string;
  checkId?: string;
  category?: string;
  state?: "new" | "existing" | "regressed";
  data?: { url?: string };
  ignored?: { by: number; at: string; reason?: string; scope?: "story" | "global" } | null;
  story?: { id: number; title: string; editUrl: string } | null;
  lastCheckedAt?: string | null;
  fixUrl?: string | null;
  fixTarget?: ContentHealthFixTarget | null;
};

export type ContentHealthResponse = {
  issues: ContentHealthIssue[];
  lastRunAt?: string | null;
  scannerAvailable?: boolean;
  ignored?: ContentHealthIssue[];
  scanned?: number;
  eligible?: number;
  stale?: boolean;
  canScan?: boolean;
  canManageChecks?: boolean;
  definitions?: Record<string, { title: string; category: string; severity: ContentHealthSeverity; explanation: string; why: string; action: string }>;
  scan?: { running?: boolean; checked?: number; total?: number; failed?: number; startedAt?: string; lastFullScanAt?: string | null };
  disabledChecks?: Record<string, { by: number; at: string; reason?: string }>;
};

/**
 * Resolve a durable structural locator against the editor's current block
 * tree. Runtime clientIds are deliberately read only from the resolved block;
 * they are never part of the locator itself.
 */
export function resolveContentHealthBlockPath(
  blocks: ContentHealthEditorBlock[],
  target: Extract<ContentHealthFixTarget, { kind: "block" }>
): ContentHealthEditorBlock | null {
  if (!Array.isArray(target.blockPath) || target.blockPath.length === 0) return null;

  let current = blocks;
  let block: ContentHealthEditorBlock | undefined;
  for (const index of target.blockPath) {
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
    block = current[index];
    current = Array.isArray(block.innerBlocks) ? block.innerBlocks : [];
  }

  if (!block || (target.blockName && block.name !== target.blockName)) return null;
  return block;
}

export type CalendarEventType = "deadline" | "planned" | "scheduled" | "published" | "appointment" | "media" | "task";

/**
 * What kind of moment an event is. The Calendar renders a date as a date and a
 * timestamp as a time; it never turns one into the other.
 * - `date`: a site-local calendar day (deadlines, production and task due dates,
 *   and a planned publication that is only a date).
 * - `timed`: a real timestamp. A site-local `YYYY-MM-DDTHH:mm` string is read in
 *   the site timezone; one with `Z` or an offset is an instant.
 */
export type CalendarEventTiming =
  | { kind: "date"; date: string }
  | { kind: "timed"; start: string; end: string | null };

export type PlanningCalendarEvent = {
  id: string;
  /** Canonical date semantics for this event. */
  timing: CalendarEventTiming;
  storyId: number;
  storyTitle: string;
  storyUrl: string;
  type: CalendarEventType;
  /** Site-local (or, for story dates before the schedule feed loads, browser-local) `YYYY-MM-DD`. */
  date: string;
  exactDate: string;
  label: string;
  /** Visible text when it is not the story title (appointments, production and task deadlines). */
  title?: string;
  /** "10:15 AM" for an exact appointment, read in the site timezone. */
  timeLabel?: string;
  /** UTC instant used only to order timed events within a day. */
  sortTime?: string;
  /** Multi-line description for the native tooltip. */
  tooltip?: string;
  assigneeIds?: number[];
  assigneeNames?: string[];
  /** Story Workspace deep link. When present the event is a plain link, not a Quick View button. */
  href?: string;
  completed?: boolean;
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
    ].join(" "));

    if (query && !searchText.includes(query)) return false;
    if (applied.workflow && story.workflow.id !== applied.workflow) return false;
    if (applied.writerId !== null && story.writer?.id !== applied.writerId) return false;
    if (applied.editorId !== null && story.editor?.id !== applied.editorId) return false;
    if (!inDateRange(story.deadline, applied.deadlineFrom, applied.deadlineTo)) return false;
    if (!inDateRange(story.plannedPublication, applied.plannedFrom, applied.plannedTo)) return false;
    if (applied.wordpressState && story.wordpressState.id !== applied.wordpressState) return false;
    if (applied.visualStatus && story.visual.status !== applied.visualStatus) return false;
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

/**
 * Does a story still have something not done? Open tasks, production that is
 * not finished, appointments waiting for a time, or a review request.
 */
export function storyHasOpenWork(story: PlanningStory): boolean {
  if (story.openTaskCount > 0 || story.needsReview) return true;
  if ((story.mediaSummary?.open ?? 0) > 0) return true;
  if (story.visual && story.visual.type !== "none" && story.visual.status !== "done" && story.visual.status !== "selected") return true;
  return (story.reporting?.needsScheduling ?? 0) > 0;
}

/**
 * A published story is finished news, so the List hides it unless something on
 * it is still open. Choosing a WordPress state yourself, or asking for published
 * stories, shows them.
 */
export function hideFinishedPublished(stories: PlanningStory[], options: { showPublished?: boolean; wordpressState?: string } = {}): PlanningStory[] {
  if (options.showPublished || options.wordpressState) return stories;
  return stories.filter((story) => !story.wordpressState.isPublished || storyHasOpenWork(story));
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

/**
 * Replace one story without restoring a captured Planning collection. The
 * optional identity guard lets an in-flight mutation avoid overwriting a
 * newer update for the same story when its response arrives late.
 */
export function replacePlanningStory(
  stories: readonly PlanningStory[],
  storyId: number,
  nextStory: PlanningStory,
  expectedCurrent?: PlanningStory
): PlanningStory[] {
  return stories.map((story) => story.id === storyId && (!expectedCurrent || story === expectedCurrent) ? nextStory : story);
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

/**
 * Story-derived events: deadline, planned publication, WordPress schedule and
 * published date stay four separate events. With a site `timezone` the day is
 * read in that zone (matching appointments and production deadlines); without
 * one it falls back to the browser's, as before.
 */
/**
 * Is a planned publication only a day? A bare date is. So is the noon the
 * planned-publication picker writes when the editor chose only a day, whether it
 * arrives as site-local `…T12:00` or as the instant for noon in the site
 * timezone. Any other time is a real time and stays one.
 */
export function isPlannedDayOnly(value: string, timezone?: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  if (/^\d{4}-\d{2}-\d{2}[T ]12:00(?::00)?$/.test(value)) return true;
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return false;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return false;
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant) === "12:00";
  } catch {
    return false;
  }
}

export function planningCalendarEvents(stories: PlanningStory[], timezone?: string): PlanningCalendarEvent[] {
  const events: PlanningCalendarEvent[] = [];
  const add = (story: PlanningStory, type: CalendarEventType, value: string | null | undefined, label: string) => {
    if (!value || !parsePlanningDate(value)) return;
    const date = timezone ? siteDay(value, timezone) || planningDateKey(parsePlanningDate(value) as Date) : planningDateKey(parsePlanningDate(value) as Date);
    // A deadline is a day. A planned publication is a day until it carries a
    // real time: the picker stores noon as a placeholder when only a day was
    // chosen, so exactly 12:00 is still a day. WordPress's schedule and publish
    // date are always timestamps.
    const timing: CalendarEventTiming = type === "deadline" || (type === "planned" && isPlannedDayOnly(value, timezone))
      ? { kind: "date", date }
      : { kind: "timed", start: value, end: null };
    events.push({
      id: `${story.id}-${type}`,
      timing,
      storyId: story.id,
      storyTitle: story.title,
      storyUrl: story.editUrl,
      type,
      date,
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
