import type { PlanningResponse } from "@byline/newsroom-screens/planning/planning-model";
import type { StoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-types";
import type { StoryRequest } from "@byline/newsroom-screens/story/story-fetchers";
import type { CollectionApi } from "@byline/newsroom-screens/collections/collection-api";
import {
  edgeChanges,
  normalizeCollectionQuery,
  visibleCollections,
  type Collection,
  type CollectionDetail,
  type CollectionHref,
  type CollectionList,
  type Interview,
  type SharedResource,
  type StoryCollections,
} from "@byline/newsroom-screens/collections/collection-model";

const path = "/byline/v1/editorial/collections";

/**
 * WordPress's side of the shared `CollectionApi`: the existing
 * `/byline/v1/editorial/collections` REST routes (collections-rest.php),
 * whose relationships are edges added and removed one at a time. The list
 * loads every page and filters in the browser, as WordPress always has.
 */
export function createWordPressCollectionApi(
  request: StoryRequest,
  currentUserId: number | null = null,
): CollectionApi {
  // Every view, search and filter reads one complete load, for a moment; any write starts afresh.
  let loaded: { at: number; list: Promise<CollectionList> } | null = null;
  const write = <T,>(pending: Promise<T>) => {
    loaded = null;
    return pending;
  };
  const link = (id: number, kind: string, target: number, linked: boolean, interview?: number) =>
    write(request<{ linked: boolean }>({
      path: `${path}/${id}${interview ? `/interviews/${interview}` : ""}/links/${kind}/${target}`,
      method: linked ? "POST" : "DELETE",
    }));
  const everything = (): Promise<CollectionList> => {
    if (!loaded || Date.now() - loaded.at > 15_000) {
      loaded = { at: Date.now(), list: loadAll() };
      loaded.list.catch(() => { loaded = null; });
    }
    return loaded.list.then((list) => ({ ...list, collections: [...list.collections] }));
  };
  const loadAll = async (): Promise<CollectionList> => {
    const first = await request<CollectionList>({ path });
    // All pages are loaded before filtering, so the list is never silently incomplete.
    for (let page = 2; page <= first.pages; page++) {
      const next = await request<CollectionList>({ path: `${path}?page=${page}` });
      first.collections.push(...next.collections);
    }
    return { ...first, capabilities: { canCreate: first.canCreate, activity: true } };
  };
  return {
    async list(input = {}) {
      const query = normalizeCollectionQuery(input);
      const all = await everything();
      const rows = visibleCollections(all.collections, query, currentUserId);
      const limit = query.limit ?? (rows.length || 1);
      const pages = Math.max(1, Math.ceil(rows.length / limit));
      return { ...all, collections: rows.slice((query.page - 1) * limit, query.page * limit), total: rows.length, pages };
    },
    detail: (id) => request<CollectionDetail>({ path: `${path}/${id}` }),
    create: (input) => write(request<Collection>({ path, method: "POST", data: input })),
    update: (id, input) => write(request<Collection>({ path: `${path}/${id}`, method: "POST", data: input })),
    storyOptions: (search = "") =>
      request<PlanningResponse>({ path: `${path}/story-options?search=${encodeURIComponent(search)}` }),
    createStory: (id, title, preset) =>
      write(request<StoryWorkspace>({ path: `${path}/${id}/stories`, method: "POST", data: { title, ...(preset ? { preset } : {}) } })),
    addStory: (id, storyId) => link(id, "story", storyId, true),
    removeStory: (id, storyId) => link(id, "story", storyId, false),
    addMember: (id, userId) => link(id, "member", userId, true),
    removeMember: (id, userId) => link(id, "member", userId, false),
    async saveInterview(id, input, interview?: Interview) {
      const { storyIds, interviewerIds, resourceIds, ...fields } = input;
      // Only links changed (Story Peek linking a story): no write to the interview itself.
      const saved = interview && !Object.keys(fields).length
        ? interview
        : await write(request<Interview>({ path: `${path}/${id}/interviews${interview ? `/${interview.id}` : ""}`, method: "POST", data: fields }));
      for (const [kind, previous, next] of [
        ["interview-story", interview?.storyIds ?? [], storyIds],
        ["interviewer", interview?.interviewers.map((p) => p.id) ?? [], interviewerIds],
        ["recording", interview?.resourceIds ?? [], resourceIds],
      ] as const) {
        if (!next) continue;
        for (const change of edgeChanges([...previous], [...next])) await link(id, kind, change.target, change.linked, saved.id);
      }
      return saved;
    },
    resourceOptions: (search = "") =>
      request<{ resources: SharedResource[] }>({ path: `${path}/resource-options?search=${encodeURIComponent(search)}` }),
    addResource: (id, input) =>
      write(request<SharedResource>({ path: `${path}/${id}/resources`, method: "POST", data: { label: input.label, url: input.url ?? "", ...(input.attachmentId ? { attachmentId: input.attachmentId } : {}) } })),
    reuseResource: (id, resourceId) => link(id, "resource", resourceId, true),
    unlinkResource: (id, resourceId) => link(id, "resource", resourceId, false),
    async setResourceStories(id, resource, storyIds) {
      for (const change of edgeChanges(resource.storyIds, storyIds)) {
        await write(request({ path: `${path}/${id}/resources/${resource.id}/links/resource-story/${change.target}`, method: change.linked ? "POST" : "DELETE" }));
      }
    },
    story: (storyId) => request<StoryCollections>({ path: `/byline/v1/editorial/stories/${storyId}/collections` }),
  };
}

/** The WordPress Planning screen's Collection address (`section`, because `tab` is Planning's own). */
export const wordpressCollectionHref: CollectionHref = (id, options = {}) =>
  `admin.php?page=byline-planning&tab=collections&collection=${id}${
    options.tab && options.tab !== "overview" && !options.interviewId ? `&section=${options.tab}` : ""
  }${options.interviewId ? `&section=reporting&interview=${options.interviewId}` : ""}`;
