import { QueryClient } from "@tanstack/react-query";
import type { EditorialTask } from "../editorial/editorial-model";
import type { StoryWorkspace } from "./workspace-types";

/** One query per story serves Home's Story Peek, hover previews and the full Story workspace. */
export const workspaceKey = (storyId: number) => ["byline", "workspace", storyId] as const;

/**
 * Article Notes previews. A sibling of the workspace key, not a child: saving a
 * task must not refetch Notes, and Notes are never edited from Byline. They go
 * stale on their own and refetch when the window regains focus.
 */
export const articleNotesKey = (storyId: number) => ["byline", "article-notes", storyId] as const;

/** A warmed workspace stays fresh long enough for hover -> Peek -> Story navigation to reuse one request. */
export const WORKSPACE_STALE_TIME = 30_000;

export type WorkspaceLoader = (storyId: number) => Promise<StoryWorkspace>;

export function workspaceQueryOptions(storyId: number, getWorkspace: WorkspaceLoader) {
  return {
    queryKey: workspaceKey(storyId),
    queryFn: () => getWorkspace(storyId),
    staleTime: WORKSPACE_STALE_TIME
  };
}

/**
 * Warm one Story workspace into the caller's QueryClient. TanStack Query
 * deduplicates an in-flight request and skips a fresh cached one, so several
 * intent signals never multiply the API traffic.
 */
export function prefetchStoryWorkspace(client: QueryClient, storyId: number, getWorkspace: WorkspaceLoader): Promise<void> {
  if (!Number.isSafeInteger(storyId) || storyId <= 0) return Promise.resolve();
  return client.prefetchQuery(workspaceQueryOptions(storyId, getWorkspace));
}

/**
 * Standalone hosts (the legacy WordPress surface) still need a cache of their
 * own. The Payload newsroom does not use this client: its shell owns the one
 * shared QueryClient so a preloaded workspace survives into the Story screen.
 */
export const workspaceQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: WORKSPACE_STALE_TIME, retry: 1, refetchOnWindowFocus: true } }
});

/** Replace one task. Used for optimistic completion and for rollback. */
export function replaceWorkspaceTask(data: StoryWorkspace | undefined, task: EditorialTask): StoryWorkspace | undefined {
  if (!data) return data;
  return { ...data, tasks: data.tasks.map((item) => (item.id === task.id ? task : item)) };
}
