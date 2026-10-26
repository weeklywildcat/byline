import type { PlanningResponse } from "../planning/planning-model";
import type { StoryWorkspace } from "../workspace/workspace-types";
import type { StoryRequest } from "../story/story-fetchers";
import type {
  Collection,
  CollectionDetail,
  CollectionInput,
  CollectionList,
  Interview,
  InterviewInput,
  SharedResource,
  StoryCollections,
} from "./collection-model";
export function createCollectionApi(request: StoryRequest) {
  const path = "/byline/v1/editorial/collections";
  return {
    async list(): Promise<CollectionList> {
      const first = await request<CollectionList>({ path });
      // All pages are loaded before client-side filtering, avoiding silently incomplete lists.
      for (let page = 2; page <= first.pages; page++) {
        const next = await request<CollectionList>({
          path: `${path}?page=${page}`,
        });
        first.collections.push(...next.collections);
      }
      return first;
    },
    stories: (search = "") =>
      request<PlanningResponse>({
        path: `${path}/story-options?search=${encodeURIComponent(search)}`,
      }),
    createStory: (id: number, title: string, preset?: string) =>
      request<StoryWorkspace>({
        path: `${path}/${id}/stories`,
        method: "POST",
        data: { title, ...(preset ? { preset } : {}) },
      }),
    detail: (id: number) =>
      request<CollectionDetail>({ path: `${path}/${id}` }),
    save: (input: CollectionInput, id?: number) =>
      request<Collection>({
        path: id ? `${path}/${id}` : path,
        method: "POST",
        data: input,
      }),
    interview: (id: number, input: InterviewInput, interviewId?: number) =>
      request<Interview>({
        path: `${path}/${id}/interviews${interviewId ? `/${interviewId}` : ""}`,
        method: "POST",
        data: input,
      }),
    link: (
      id: number,
      kind: string,
      target: number,
      linked: boolean,
      interview?: number,
    ) =>
      request<{ linked: boolean }>({
        path: `${path}/${id}${
          interview ? `/interviews/${interview}` : ""
        }/links/${kind}/${target}`,
        method: linked ? "POST" : "DELETE",
      }),
    resourceOptions: (search = "") =>
      request<{ resources: SharedResource[] }>({
        path: `${path}/resource-options?search=${encodeURIComponent(search)}`,
      }),
    resourceStory: (
      id: number,
      resource: number,
      story: number,
      linked: boolean,
    ) =>
      request({
        path: `${path}/${id}/resources/${resource}/links/resource-story/${story}`,
        method: linked ? "POST" : "DELETE",
      }),
    resource: (
      id: number,
      input: { label: string; url: string; attachmentId?: number },
    ) =>
      request<SharedResource>({
        path: `${path}/${id}/resources`,
        method: "POST",
        data: input,
      }),
    story: (id: number) =>
      request<StoryCollections>({
        path: `/byline/v1/editorial/stories/${id}/collections`,
      }),
  };
}
export type CollectionApi = ReturnType<typeof createCollectionApi>;
export const collectionsKey = ["byline", "collections"] as const;
export const collectionKey = (id: number) =>
  ["byline", "planning", "collection", id] as const;
export const storyCollectionsKey = (id: number) =>
  ["byline", "story-collections", id] as const;
