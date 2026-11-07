"use client";

import type { CollectionApi } from "@byline/newsroom-screens/collections/collection-api";
import {
  collectionQueryParams,
  normalizeCollectionQuery,
  type Collection,
  type CollectionDetail,
  type CollectionList,
  type Interview,
  type SharedResource,
  type StoryCollections
} from "@byline/newsroom-screens/collections/collection-model";
import type { PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import { queryPath } from "@byline/newsroom-screens/planning/planning-api";
import type { StoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-types";
import { createBylineRequest } from "../home/payload-fetchers";

/**
 * The Payload newsroom's side of the shared `CollectionApi`: semantic
 * requests to `/api/byline/collections/...` (src/newsroom/collections.ts),
 * which read and write as the signed-in user. The list is filtered, sorted
 * and paged on the server.
 */
export function createPayloadCollectionApi(api: string): CollectionApi {
  const request = createBylineRequest(api);
  const base = "/collections";
  return {
    list: (query = {}) => request<CollectionList>(queryPath(base, collectionQueryParams(normalizeCollectionQuery(query)))),
    detail: (id) => request<CollectionDetail>(`${base}/${id}`),
    create: (input) => request<Collection>(base, "POST", input),
    update: (id, input) => request<Collection>(`${base}/${id}`, "PATCH", input),
    storyOptions: (search = "") => request<{ stories: PlanningStory[] }>(queryPath(`${base}/story-options`, { search })),
    createStory: (id, title, preset) => request<StoryWorkspace>(`${base}/${id}/stories/new`, "POST", preset ? { title, preset } : { title }),
    addStory: (id, storyId) => request(`${base}/${id}/stories`, "POST", { storyId }),
    removeStory: (id, storyId) => request(`${base}/${id}/stories/${storyId}`, "DELETE"),
    addMember: (id, userId) => request(`${base}/${id}/members`, "POST", { userId }),
    removeMember: (id, userId) => request(`${base}/${id}/members/${userId}`, "DELETE"),
    saveInterview: (id, input, interview) =>
      interview ? request<Interview>(`${base}/${id}/interviews/${interview.id}`, "PATCH", input) : request<Interview>(`${base}/${id}/interviews`, "POST", input),
    resourceOptions: (search = "") => request<{ resources: SharedResource[] }>(queryPath(`${base}/resource-options`, { search })),
    addResource: (id, input) => request<SharedResource>(`${base}/${id}/resources`, "POST", input),
    reuseResource: (id, resourceId) => request(`${base}/${id}/resources`, "POST", { resourceId }),
    unlinkResource: (id, resourceId) => request(`${base}/${id}/resources/${resourceId}`, "DELETE"),
    setResourceStories: (id, resource, storyIds) => request(`${base}/${id}/resources/${resource.id}/stories`, "PUT", { storyIds }),
    story: (storyId) => request<StoryCollections>(`/stories/${storyId}/collections`)
  };
}
