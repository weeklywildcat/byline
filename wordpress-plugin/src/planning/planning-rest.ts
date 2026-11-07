/**
 * The WordPress adapter for the shared Planning screens: Byline's REST routes
 * under /byline/v1 and the translation between WordPress's vocabulary and the
 * neutral Planning contract. Only this module knows a WordPress route or a
 * `post_status`; the screens in @byline/newsroom-screens never do.
 */
import { planningFilterParams, queryPath, normalizeContentHealthResponse, type PlanningFetchers, type PlanningRequest } from "@byline/newsroom-screens/planning/planning-api";
import type { FeedbackResponse, MediaDeskResponse, PlanningFilters, PlanningResponse, SavedPlanningView } from "@byline/newsroom-screens/planning/planning-model";
import type { ScheduleResponse } from "@byline/newsroom-screens/workspace/workspace-types";

export const PLANNING_REST_ROUTES = {
  collection: "/byline/v1/editorial/planning",
  story: "/byline/v1/editorial/stories",
  savedViews: "/byline/v1/editorial/planning/views",
  media: "/byline/v1/admin/media",
  schedule: "/byline/v1/editorial/schedule",
  feedback: "/byline/v1/admin/feedback",
  corrections: "/byline/v1/admin/editorial/corrections",
  contentHealth: "/byline/v1/admin/content-health"
} as const;

/** Neutral publication state ↔ WordPress `post_status`. */
const POST_STATUS: Record<string, string> = { draft: "draft", scheduled: "future", published: "publish" };

/**
 * The Planning query string as the WordPress endpoint reads it: the
 * publication-state filter is the post status, under its legacy
 * `wordpress_state` name.
 */
export function wordPressPlanningParams(filters?: Partial<PlanningFilters>): Record<string, string | number> {
  const { publication_state: state, ...params } = planningFilterParams(filters);
  return state ? { ...params, wordpress_state: POST_STATUS[String(state)] ?? String(state) } : params;
}

/** Saved-view filters as WordPress stores them (`wordpressState` holds a post status). */
export function wordPressSavedFilters(filters: PlanningFilters): Record<string, unknown> {
  const { publicationState, ...rest } = filters;
  return { ...rest, wordpressState: publicationState ? POST_STATUS[publicationState] ?? publicationState : "" };
}

function idPath(path: string, id: string | number): string {
  return `${path}/${encodeURIComponent(String(id))}`;
}

/** `POST /editorial/stories/<storyId>/media-assignments/<assignmentId>` (a UUID, or `legacy-v1`). */
export function mediaAssignmentPath(storyId: number, assignmentId: string): string {
  return `${idPath(PLANNING_REST_ROUTES.story, storyId)}/media-assignments/${encodeURIComponent(assignmentId)}`;
}

/**
 * Builds the admin slice's REST contract around an authenticated WordPress
 * request function. The route names are intentionally grouped and stable;
 * the PHP layer remains the authority for capability and post-level checks.
 */
export function createPlanningFetchers(request: PlanningRequest): PlanningFetchers {
  return {
    getPlanning: (filters) => request<PlanningResponse>({
      path: queryPath(PLANNING_REST_ROUTES.collection, wordPressPlanningParams(filters))
    }),

    moveStory: (storyId, status) => request({
      path: idPath(PLANNING_REST_ROUTES.story, storyId),
      method: "POST",
      data: { status }
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
      data: { id: view.id, name: view.name.trim(), filters: wordPressSavedFilters(view.filters), sort: view.sort }
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

    updateMediaAssignment: (storyId, assignmentId, changes) => request({
      path: mediaAssignmentPath(storyId, assignmentId),
      method: "POST",
      data: changes
    }),

    getSchedule: (from, to, includeTasks = false, collectionId) => request<ScheduleResponse>({
      path: queryPath(PLANNING_REST_ROUTES.schedule, { from, to, includeTasks: includeTasks ? 1 : undefined, collectionId })
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

    getContentHealth: (query) => request<unknown>({
      path: queryPath(PLANNING_REST_ROUTES.contentHealth, query ?? {})
    }).then(normalizeContentHealthResponse),

    runContentHealthScan: () => request({ path: `${PLANNING_REST_ROUTES.contentHealth}/scan`, method: "POST" }),
    recheckContentHealth: (storyId) => request({
      path: `${PLANNING_REST_ROUTES.contentHealth}/story/${storyId}/recheck`, method: "POST"
    }),
    setContentHealthDisposition: (input) => request({
      path: `${PLANNING_REST_ROUTES.contentHealth}/disposition`, method: "POST", data: { ...input, postId: input.storyId }
    })
  };
}
