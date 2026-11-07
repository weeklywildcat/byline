import type { PlanningStory } from "../planning/planning-model";
import type { StoryWorkspace } from "../workspace/workspace-types";
import type {
  Collection,
  CollectionDetail,
  CollectionInput,
  CollectionList,
  CollectionListQuery,
  Interview,
  InterviewInput,
  ResourceInput,
  SharedResource,
  StoryCollections,
} from "./collection-model";

/**
 * What the Collection screens need from a host. Semantic operations, never
 * addresses: WordPress implements them over `/byline/v1/editorial/collections`
 * (wordpress-plugin/src/collections/wordpress-collection-api.ts), Payload
 * over `/api/byline/collections` (apps/newsroom). The screens know neither.
 */
export type CollectionApi = {
  /** One page of the list, filtered and sorted (a host may do it in the browser). */
  list: (query?: Partial<CollectionListQuery>) => Promise<CollectionList>;
  detail: (id: number) => Promise<CollectionDetail>;
  create: (input: CollectionInput & { name: string }) => Promise<Collection>;
  update: (id: number, input: CollectionInput) => Promise<Collection>;
  /** Stories this reader may add, by headline. */
  storyOptions: (search?: string) => Promise<{ stories: PlanningStory[] }>;
  /** A new story through the host's one Story creation flow, then added to the Collection. */
  createStory: (
    id: number,
    title: string,
    preset?: string,
  ) => Promise<StoryWorkspace>;
  addStory: (id: number, storyId: number) => Promise<unknown>;
  /** Membership only; the story itself is untouched. */
  removeStory: (id: number, storyId: number) => Promise<unknown>;
  addMember: (id: number, userId: number) => Promise<unknown>;
  removeMember: (id: number, userId: number) => Promise<unknown>;
  /** Creates or edits a shared interview; its links (stories, interviewers, resources) save with it. */
  saveInterview: (
    id: number,
    input: InterviewInput,
    interview?: Interview,
  ) => Promise<Interview>;
  /** Shared resources from other Collections this reader can see, to reuse. */
  resourceOptions: (search?: string) => Promise<{ resources: SharedResource[] }>;
  addResource: (id: number, input: ResourceInput) => Promise<SharedResource>;
  reuseResource: (id: number, resourceId: number) => Promise<unknown>;
  /** Removes the resource from this Collection; it stays wherever else it is used. */
  unlinkResource: (id: number, resourceId: number) => Promise<unknown>;
  setResourceStories: (
    id: number,
    resource: SharedResource,
    storyIds: number[],
  ) => Promise<unknown>;
  /** A story's Collections, interviews and resources (Story Peek, the Story workspace). */
  story: (storyId: number) => Promise<StoryCollections>;
};

export const collectionsKey = ["byline", "collections"] as const;
export const collectionListKey = (query: Partial<CollectionListQuery> = {}) =>
  [...collectionsKey, "list", query] as const;
export const collectionKey = (id: number) =>
  ["byline", "collection", id] as const;
export const storyCollectionsKey = (id: number) =>
  ["byline", "story-collections", id] as const;
