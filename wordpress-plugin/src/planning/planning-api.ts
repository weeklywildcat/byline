import {
  normalizePlanningFilters,
  type ContentHealthResponse,
  type ContentHealthFixTarget,
  type ContentHealthSeverity,
  type CoverageResponse,
  type FeedbackResponse,
  type MediaDeskResponse,
  type PerformanceResponse,
  type PlanningFilters,
  type PlanningResponse,
  type SavedPlanningView
} from "./planning-model";

/**
 * The caller supplies WordPress' authenticated apiFetch (or a compatible
 * protected transport). Keeping the transport injected makes this package
 * usable from the existing admin shell without importing an entrypoint or
 * leaking credentials into the module.
 */
export type PlanningRequestOptions = {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  data?: unknown;
};

export type PlanningRequest = <T>(options: PlanningRequestOptions) => Promise<T>;

export const PLANNING_REST_ROUTES = {
  collection: "/byline/v1/editorial/planning",
  story: "/byline/v1/editorial/stories",
  savedViews: "/byline/v1/editorial/planning/views",
  media: "/byline/v1/admin/media",
  coverage: "/byline/v1/admin/coverage",
  feedback: "/byline/v1/admin/feedback",
  corrections: "/byline/v1/admin/editorial/corrections",
  performance: "/byline/v1/admin/analytics/performance",
  contentHealth: "/byline/v1/admin/content-health"
} as const;

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

  if (value.kind === "story-sidebar" && ["tasks", "visuals", "contributors", "workflow"].includes(String(value.panel))) {
    return { kind: "story-sidebar", panel: value.panel as "tasks" | "visuals" | "contributors" | "workflow" };
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
    scannerAvailable: source.scannerAvailable !== false
  };
}

export type PlanningFetchers = {
  /** Required protected collection request used by Board, List, and Calendar. */
  getPlanning: (filters?: Partial<PlanningFilters>) => Promise<PlanningResponse>;
  /** Optional so read-only installs can still render the collection. */
  moveStory?: (storyId: number, status: string) => Promise<unknown>;
  /** Lazy protected aggregate used by Story Quick View. */
  getStoryQuickView?: (storyId: number) => Promise<unknown>;
  /** Ordinary planning edits use the same protected story domain endpoint. */
  updateStory?: (storyId: number, changes: Record<string, unknown>) => Promise<unknown>;
  createStoryTask?: (storyId: number, input: Record<string, unknown>) => Promise<unknown>;
  updateTask?: (taskId: number | string, changes: Record<string, unknown>) => Promise<unknown>;
  getSavedViews?: () => Promise<SavedPlanningView[]>;
  saveSavedView?: (view: SavedPlanningViewInput) => Promise<SavedPlanningView>;
  deleteSavedView?: (viewId: string) => Promise<void>;
  getMediaDesk?: (filters?: Record<string, string | number | boolean | undefined>) => Promise<MediaDeskResponse>;
  updateMediaRequest?: (requestId: number, changes: Record<string, unknown>) => Promise<unknown>;
  getCoverage?: () => Promise<CoverageResponse>;
  createCoverage?: (input: Record<string, unknown>) => Promise<unknown>;
  addStoryToCoverage?: (coverageId: number, storyId: number) => Promise<unknown>;
  removeStoryFromCoverage?: (coverageId: number, storyId: number) => Promise<unknown>;
  createCoverageStory?: (coverageId: number, title: string) => Promise<unknown>;
  getFeedback?: () => Promise<FeedbackResponse>;
  updateFeedback?: (feedbackId: number, status: string) => Promise<unknown>;
  createCorrectionFromFeedback?: (feedbackId: number, input?: { text?: string; type?: string }) => Promise<unknown>;
  getPerformance?: (query?: Record<string, string | number | boolean | undefined>) => Promise<PerformanceResponse>;
  getContentHealth?: (query?: Record<string, string | number | boolean | undefined>) => Promise<ContentHealthResponse>;
  recheckContentHealth?: (issueId?: string) => Promise<unknown>;
};

function queryPath(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function planningFilterParams(filters?: Partial<PlanningFilters>): Record<string, string | number> {
  const applied = normalizePlanningFilters(filters);
  const params: Record<string, string | number> = {};

  if (applied.query) params.search = applied.query;
  if (applied.workflow) params.workflow = applied.workflow;
  if (applied.writerId !== null) params.writer = applied.writerId;
  if (applied.editorId !== null) params.editor = applied.editorId;
  if (applied.deadlineFrom) params.deadline_from = applied.deadlineFrom;
  if (applied.deadlineTo) params.deadline_to = applied.deadlineTo;
  if (applied.plannedFrom) params.planned_from = applied.plannedFrom;
  if (applied.plannedTo) params.planned_to = applied.plannedTo;
  if (applied.wordpressState) params.wordpress_state = applied.wordpressState;
  if (applied.visualStatus) params.visual_status = applied.visualStatus;
  if (applied.coverageId !== null) params.coverage = applied.coverageId;
  if (applied.mine) params.mine = 1;
  if (applied.unassigned) params.unassigned = 1;
  if (applied.overdue) params.overdue = 1;
  if (applied.needsReview) params.needs_review = 1;

  return params;
}

function idPath(path: string, id: string | number): string {
  return `${path}/${encodeURIComponent(String(id))}`;
}

/**
 * Builds the admin slice's REST contract around an authenticated WordPress
 * request function. The route names are intentionally grouped and stable;
 * the PHP layer remains the authority for capability and post-level checks.
 */
export function createPlanningFetchers(request: PlanningRequest): PlanningFetchers {
  return {
    getPlanning: (filters) => request<PlanningResponse>({
      path: queryPath(PLANNING_REST_ROUTES.collection, planningFilterParams(filters))
    }),

    moveStory: (storyId, status) => request({
      path: idPath(PLANNING_REST_ROUTES.story, storyId),
      method: "POST",
      data: { status }
    }),

    getStoryQuickView: (storyId) => request({
      path: `${idPath(PLANNING_REST_ROUTES.story, storyId)}/quick-view`
    }),

    updateStory: (storyId, changes) => request({
      path: idPath(PLANNING_REST_ROUTES.story, storyId),
      method: "POST",
      data: changes
    }),

    createStoryTask: (storyId, input) => request({
      path: `${idPath(PLANNING_REST_ROUTES.story, storyId)}/tasks`,
      method: "POST",
      data: input
    }),

    updateTask: (taskId, changes) => request({
      path: idPath("/byline/v1/editorial/tasks", taskId),
      method: "POST",
      data: changes
    }),

    getSavedViews: () => request<SavedPlanningView[]>({ path: PLANNING_REST_ROUTES.savedViews }),

    saveSavedView: (view) => request<SavedPlanningView>({
      path: PLANNING_REST_ROUTES.savedViews,
      method: "POST",
      data: { id: view.id, name: view.name.trim(), filters: view.filters, sort: view.sort }
    }),

    deleteSavedView: (viewId) => request<void>({
      path: idPath(PLANNING_REST_ROUTES.savedViews, viewId),
      method: "DELETE"
    }),

    getMediaDesk: (filters) => request<MediaDeskResponse>({
      path: queryPath(PLANNING_REST_ROUTES.media, filters ?? {})
    }),

    updateMediaRequest: (requestId, changes) => request({
      path: idPath(PLANNING_REST_ROUTES.media, requestId),
      method: "POST",
      data: changes
    }),

    getCoverage: () => request<CoverageResponse>({ path: PLANNING_REST_ROUTES.coverage }),

    createCoverage: (input) => request({
      path: PLANNING_REST_ROUTES.coverage,
      method: "POST",
      data: input
    }),

    addStoryToCoverage: (coverageId, storyId) => request({
      path: `${idPath(PLANNING_REST_ROUTES.coverage, coverageId)}/stories`,
      method: "POST",
      data: { storyId }
    }),

    removeStoryFromCoverage: (coverageId, storyId) => request({
      path: `${idPath(PLANNING_REST_ROUTES.coverage, coverageId)}/stories/${encodeURIComponent(String(storyId))}`,
      method: "DELETE"
    }),

    createCoverageStory: (coverageId, title) => request({
      path: `${idPath(PLANNING_REST_ROUTES.coverage, coverageId)}/stories`,
      method: "POST",
      data: { title }
    }),

    getFeedback: () => request<FeedbackResponse>({ path: PLANNING_REST_ROUTES.feedback }),

    updateFeedback: (feedbackId, status) => request({
      path: idPath(PLANNING_REST_ROUTES.feedback, feedbackId),
      method: "POST",
      data: { status }
    }),

    createCorrectionFromFeedback: (feedbackId, input) => request({
      path: `${idPath(PLANNING_REST_ROUTES.feedback, feedbackId)}/correction`,
      method: "POST",
      data: input ?? {}
    }),

    getPerformance: (query) => request<PerformanceResponse>({
      path: queryPath(PLANNING_REST_ROUTES.performance, query ?? {})
    }),

    getContentHealth: (query) => request<unknown>({
      path: queryPath(PLANNING_REST_ROUTES.contentHealth, query ?? {})
    }).then(normalizeContentHealthResponse),

    recheckContentHealth: (issueId) => request({
      path: issueId ? `${idPath(PLANNING_REST_ROUTES.contentHealth, issueId)}/recheck` : `${PLANNING_REST_ROUTES.contentHealth}/recheck`,
      method: "POST"
    })
  };
}

export { queryPath };
