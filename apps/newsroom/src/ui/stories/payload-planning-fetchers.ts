import { planningFilterParams, queryPath, type PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import type { PlanningResponse } from "@byline/newsroom-screens/planning/planning-model";
import type { ScheduleResponse } from "@byline/newsroom-screens/workspace/workspace-types";
import { createBylineRequest } from "../home/payload-fetchers";
import { createPreferenceSavedViews, type PreferenceStore } from "./saved-views";

/**
 * The Payload newsroom's Stories fetchers (`PlanningFetchers`). The collection
 * comes from `GET /api/byline/planning`; Board moves and List edits go through
 * the one story planning write, `POST /api/byline/stories/:id/workflow`; saved
 * views are the reader's Payload Preferences; the Calendar's schedule feed is
 * `GET /api/byline/schedule`. Media Desk, feedback and content health are not
 * offered, so the shared screens hide them.
 */
export function createPayloadPlanningFetchers(api: string, preferences: PreferenceStore): PlanningFetchers {
  const request = createBylineRequest(api);
  const workflow = (storyId: number, changes: Record<string, unknown>) => request(`/stories/${storyId}/workflow`, "POST", changes);
  return {
    getPlanning: (filters) => request<PlanningResponse>(queryPath("/planning", planningFilterParams(filters))),
    moveStory: (storyId, status) => workflow(storyId, { status }),
    updateStory: workflow,
    getSchedule: (from, to, includeTasks = false, coverageId) => request<ScheduleResponse>(scheduleQuery(from, to, includeTasks, coverageId)),
    ...createPreferenceSavedViews(preferences)
  };
}

/** `GET /api/byline/schedule` for a newsroom-day range; tasks only when asked for. */
export function scheduleQuery(from: string, to: string, includeTasks = false, coverageId?: number): string {
  return queryPath("/schedule", { from, to, tasks: includeTasks ? 1 : undefined, coverage: coverageId });
}
