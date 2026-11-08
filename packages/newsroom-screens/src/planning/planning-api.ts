import {
  normalizePlanningFilters,
  sanitizePlanningFilters,
  type ContentHealthResponse,
  type ContentHealthFixTarget,
  type ContentHealthSeverity,
  type FeedbackResponse,
  type MediaDeskResponse,
  type PlanningFilters,
  type PlanningResponse,
  type SavedPlanningView
} from "./planning-model";
import { normalizeStorySidebarPanel } from "../editorial/story-sidebar-navigation";
import type { ScheduleResponse } from "../workspace/workspace-types";

/**
 * The Planning screens' data contract. Each host supplies `PlanningFetchers`
 * over its own protected transport (the WordPress plugin over its REST routes,
 * the Payload newsroom over /api/byline); nothing here knows a route.
 */
export type PlanningRequestOptions = {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  data?: unknown;
};

export type PlanningRequest = <T>(options: PlanningRequestOptions) => Promise<T>;

export type SavedPlanningViewInput = Pick<SavedPlanningView, "name" | "filters" | "sort"> & { id?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeBlockName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\/[a-z0-9-]+$/i.test(value) && value.length <= 120;
}

function isSafeAttributePath(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value);
}

function isSafeFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8,64}$/i.test(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function normalizeContentHealthFixTarget(value: unknown): ContentHealthFixTarget | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;

  if (value.kind === "block") {
    if (!Array.isArray(value.blockPath) || value.blockPath.length === 0 || value.blockPath.length > 32) return null;
    const blockPath = value.blockPath.map((item) => typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 10000 ? item : null);
    if (blockPath.some((item) => item === null)) return null;
    const target: Extract<ContentHealthFixTarget, { kind: "block" }> = {
      kind: "block",
      blockPath: blockPath as number[]
    };
    if (value.blockName !== undefined) {
      if (!isSafeBlockName(value.blockName)) return null;
      target.blockName = value.blockName;
    }
    if (value.attribute !== undefined) {
      if (!isSafeAttributePath(value.attribute)) return null;
      target.attribute = value.attribute;
    }
    if (value.valueFingerprint !== undefined) {
      if (!isSafeFingerprint(value.valueFingerprint)) return null;
      target.valueFingerprint = value.valueFingerprint.toLowerCase();
    }
    return target;
  }

  if (value.kind === "featured-image") return { kind: "featured-image" };

  if (value.kind === "story-sidebar") {
    if (!hasOnlyKeys(value, ["kind", "panel"])) return null;
    const panel = normalizeStorySidebarPanel(value.panel);
    return panel ? { kind: "story-sidebar", panel } : null;
  }

  if (value.kind === "settings" && typeof value.url === "string" && value.url.trim() !== "") {
    return { kind: "settings", url: value.url };
  }

  return null;
}

/**
 * The Content Health service predates Planning and intentionally keeps its
 * detailed check vocabulary (`good`, `message`, `objectId`). Normalize that
 * private response at the transport boundary so the view only renders real
 * actionable issues and never has to know the storage format.
 */
export function normalizeContentHealthResponse(payload: unknown): ContentHealthResponse {
  const source = isRecord(payload) ? payload : {};
  const rawIssues = Array.isArray(source.issues) ? source.issues : [];
  const issues = rawIssues.flatMap((value, index) => {
    if (!isRecord(value)) return [];
    const rawSeverity = String(value.severity ?? "warning").toLowerCase();
    if (rawSeverity === "good" || rawSeverity === "pass") return [];
    const severity: ContentHealthSeverity = rawSeverity === "error" ? "error" : rawSeverity === "info" ? "info" : "warning";
    const storyValue = isRecord(value.story) ? value.story : null;
    const storyId = Number(value.postId ?? value.objectId ?? storyValue?.id ?? 0);
    const story = storyValue || storyId > 0
      ? {
          id: storyId,
          title: String(storyValue?.title ?? value.storyTitle ?? "Story"),
          editUrl: String(storyValue?.editUrl ?? value.fixUrl ?? "")
        }
      : null;
    return [{
      id: String(value.id ?? `${String(value.type ?? "content")}-${index}`),
      type: String(value.type ?? value.id ?? "content"),
      severity,
      checkId: String(value.checkId ?? value.type ?? value.id ?? "content").replace(/^link-[a-f0-9]+$/, "broken-link"),
      category: String(value.category ?? (String(value.type ?? value.id).startsWith("link") || value.type === "broken-link" ? "links" : "images-accessibility")),
      state: value.state === "new" || value.state === "regressed" ? value.state as "new" | "regressed" : "existing" as const,
      data: isRecord(value.data) ? { url: typeof value.data.url === "string" ? value.data.url : undefined } : undefined,
      ignored: isRecord(value.ignored) ? { by: Number(value.ignored.by), at: String(value.ignored.at), reason: String(value.ignored.reason ?? ""), scope: value.ignored.scope === "global" ? "global" as const : "story" as const } : null,
      problem: String(value.problem ?? value.message ?? value.label ?? "Content issue"),
      story,
      lastCheckedAt: value.lastCheckedAt == null ? (value.checkedAt == null ? null : String(value.checkedAt)) : String(value.lastCheckedAt),
      fixUrl: value.fixUrl == null ? null : String(value.fixUrl),
      fixTarget: normalizeContentHealthFixTarget(value.fixTarget ?? (isRecord(value.data) ? value.data.fixTarget : null))
    }];
  });
  const checkedAt = source.lastRunAt ?? source.checkedAt;

  return {
    issues,
    lastRunAt: checkedAt == null ? null : String(checkedAt),
    scannerAvailable: source.scannerAvailable !== false,
    ignored: Array.isArray(source.ignored) ? normalizeContentHealthResponse({ issues: source.ignored }).issues : [],
    scanned: Number(source.scanned ?? 0), eligible: Number(source.eligible ?? 0),
    stale: source.stale !== false, canScan: source.canScan === true, canManageChecks: source.canManageChecks === true,
    definitions: isRecord(source.definitions) ? source.definitions as ContentHealthResponse["definitions"] : {},
    scan: isRecord(source.scan) ? source.scan as ContentHealthResponse["scan"] : {},
    disabledChecks: isRecord(source.disabledChecks) ? source.disabledChecks as ContentHealthResponse["disabledChecks"] : {}
  };
}

export type PlanningFetchers = {
  /** Required protected collection request used by Board, List, and Calendar. */
  getPlanning: (filters?: Partial<PlanningFilters>) => Promise<PlanningResponse>;
  /** Optional so read-only installs can still render the collection. */
  moveStory?: (storyId: number, status: string) => Promise<unknown>;
  /** Ordinary planning edits use the same protected story domain endpoint. */
  updateStory?: (storyId: number, changes: Record<string, unknown>) => Promise<unknown>;
  createStoryTask?: (storyId: number, input: Record<string, unknown>) => Promise<unknown>;
  updateTask?: (taskId: number | string, changes: Record<string, unknown>) => Promise<unknown>;
  getSavedViews?: () => Promise<SavedPlanningView[]>;
  saveSavedView?: (view: SavedPlanningViewInput) => Promise<SavedPlanningView>;
  deleteSavedView?: (viewId: string) => Promise<void>;
  getMediaDesk?: (filters?: Record<string, string | number | boolean | undefined>) => Promise<MediaDeskResponse>;
  /** Legacy per-story update (`POST /admin/media/<storyId>`). Also owns the story-level featured image. */
  updateMediaRequest?: (requestId: number, changes: Record<string, unknown>) => Promise<unknown>;
  /** Update one production assignment (`MediaAssignmentInput`: status, assigneeId, dueAt, attachmentIds, notes, title, type). */
  updateMediaAssignment?: (storyId: number, assignmentId: string, changes: Record<string, unknown>) => Promise<unknown>;
  /** The Calendar's schedule feed. Site-local day range, at most about four months. */
  getSchedule?: (from: string, to: string, includeTasks?: boolean, collectionId?: number) => Promise<ScheduleResponse>;
  getFeedback?: () => Promise<FeedbackResponse>;
  updateFeedback?: (feedbackId: number, status: string) => Promise<unknown>;
  createCorrectionFromFeedback?: (feedbackId: number, input?: { text?: string; type?: string }) => Promise<unknown>;
  getContentHealth?: (query?: Record<string, string | number | boolean | undefined>) => Promise<ContentHealthResponse>;
  runContentHealthScan?: () => Promise<unknown>;
  recheckContentHealth?: (storyId: number) => Promise<unknown>;
  setContentHealthDisposition?: (input: { storyId?: number; checkId: string; scope?: "story" | "global"; restore?: boolean; reason?: string }) => Promise<unknown>;
};

function queryPath(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

/**
 * The neutral query-string form of PlanningFilters, also the Planning cache
 * key. A host adapter renames what its server expects (WordPress reads
 * `wordpress_state`); `parsePlanningFilterParams` reads this form back.
 */
export function planningFilterParams(filters?: Partial<PlanningFilters>): Record<string, string | number> {
  const applied = normalizePlanningFilters(filters);
  const params: Record<string, string | number> = {};

  if (applied.collectionId) params.collectionId = applied.collectionId;
  if (applied.query) params.search = applied.query;
  if (applied.workflow) params.workflow = applied.workflow;
  if (applied.writerId !== null) params.writer = applied.writerId;
  if (applied.editorId !== null) params.editor = applied.editorId;
  if (applied.deadlineFrom) params.deadline_from = applied.deadlineFrom;
  if (applied.deadlineTo) params.deadline_to = applied.deadlineTo;
  if (applied.plannedFrom) params.planned_from = applied.plannedFrom;
  if (applied.plannedTo) params.planned_to = applied.plannedTo;
  if (applied.publishedFrom) params.published_from = applied.publishedFrom;
  if (applied.publishedTo) params.published_to = applied.publishedTo;
  if (applied.publicationState) params.publication_state = applied.publicationState;
  if (applied.visualStatus) params.visual_status = applied.visualStatus;
  if (applied.mine) params.mine = 1;
  if (applied.unassigned) params.unassigned = 1;
  if (applied.overdue) params.overdue = 1;
  if (applied.needsReview) params.needs_review = 1;

  return params;
}

/** A Planning query string back into validated filters (the server side of `planningFilterParams`). */
export function parsePlanningFilterParams(params: URLSearchParams): PlanningFilters {
  const value = (key: string) => params.get(key) ?? undefined;
  return sanitizePlanningFilters({
    collectionId: value("collectionId"),
    query: value("search"),
    workflow: value("workflow"),
    writerId: value("writer"),
    editorId: value("editor"),
    deadlineFrom: value("deadline_from"),
    deadlineTo: value("deadline_to"),
    plannedFrom: value("planned_from"),
    plannedTo: value("planned_to"),
    publishedFrom: value("published_from"),
    publishedTo: value("published_to"),
    publicationState: value("publication_state"),
    visualStatus: value("visual_status"),
    mine: value("mine"),
    unassigned: value("unassigned"),
    overdue: value("overdue"),
    needsReview: value("needs_review")
  });
}

/**
 * The filters a Stories address names: the neutral filter parameters
 * (`workflow=reporting`, `needs_review=1`…) plus `collection=` (and its earlier
 * name `coverage=`). Home, the sidebar and shared links open Stories this way.
 */
export function storiesRouteFilters(params: URLSearchParams): PlanningFilters {
  const filters = parsePlanningFilterParams(params);
  if (filters.collectionId) return filters;
  const collection = Number(params.get("collection") ?? params.get("coverage"));
  return Number.isSafeInteger(collection) && collection > 0 ? { ...filters, collectionId: collection } : filters;
}

/** A Stories address narrowed to `filters`. `base` is the host's Stories URL (relative ones resolve against `origin`). */
export function storiesHref(base: string, filters: Partial<PlanningFilters>, origin = typeof window === "undefined" ? "http://localhost/" : window.location.href): string {
  const url = new URL(base, origin);
  Object.entries(planningFilterParams(filters)).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.origin === new URL(origin).origin ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

export { queryPath };
