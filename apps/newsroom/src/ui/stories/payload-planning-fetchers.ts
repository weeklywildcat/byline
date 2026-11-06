import { planningFilterParams, queryPath, type PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import type { PlanningResponse } from "@byline/newsroom-screens/planning/planning-model";
import { createBylineRequest } from "../home/payload-fetchers";
import { createPreferenceSavedViews, type PreferenceStore } from "./saved-views";

/**
 * The Payload newsroom's Stories fetchers (`PlanningFetchers`). The collection
 * comes from `GET /api/byline/planning`; Board moves and List edits go through
 * the one story planning write, `POST /api/byline/stories/:id/workflow`; saved
 * views are the reader's Payload Preferences. Media Desk, schedule, feedback
 * and content health are not offered, so the shared screens hide them.
 */
export function createPayloadPlanningFetchers(api: string, preferences: PreferenceStore): PlanningFetchers {
  const request = createBylineRequest(api);
  const workflow = (storyId: number, changes: Record<string, unknown>) => request(`/stories/${storyId}/workflow`, "POST", changes);
  return {
    getPlanning: (filters) => request<PlanningResponse>(queryPath("/planning", planningFilterParams(filters))),
    moveStory: (storyId, status) => workflow(storyId, { status }),
    updateStory: workflow,
    ...createPreferenceSavedViews(preferences)
  };
}
