import { QueryClient } from "@tanstack/react-query";
import { homeKey } from "../home/home-query";
import { workspaceKey } from "../workspace/workspace-query";

export { workspaceKey, replaceWorkspaceTask } from "../workspace/workspace-query";

/** The one QueryClient configuration for every React 19 admin screen. */
export const createAdminQueryClient = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } });

/**
 * Server-state keys. A story lives in several collections at once (Home, the
 * Stories board and list, the Calendar feed, the Media Desk) and exactly one
 * workspace entry, which Story Peek and the full workspace share.
 */
export const planningRootKey = ["byline", "planning"] as const;
export const planningKey = (filters: unknown) => ["byline", "planning", filters] as const;
export const savedViewsKey = ["byline", "planning-views"] as const;
export const scheduleRootKey = ["byline", "schedule"] as const;
export const scheduleKey = (from: string, to: string, includeTasks: boolean) => ["byline", "schedule", from, to, includeTasks] as const;
export const mediaDeskKey = ["byline", "media-desk"] as const;
export const coverageKey = ["byline", "coverage"] as const;
export const feedbackKey = ["byline", "feedback"] as const;
export const performanceKey = ["byline", "performance"] as const;
export const contentHealthKey = ["byline", "content-health"] as const;
export { homeKey };

/**
 * After anything about a story changes, every collection that shows it is
 * stale. Only the active ones refetch; the rest refetch when next opened.
 */
export function invalidateStoryData(client: QueryClient, storyId?: number | null) {
  return Promise.all([
    client.invalidateQueries({ queryKey: homeKey }),
    client.invalidateQueries({ queryKey: planningRootKey }),
    client.invalidateQueries({ queryKey: scheduleRootKey }),
    client.invalidateQueries({ queryKey: mediaDeskKey }),
    ...(storyId ? [client.invalidateQueries({ queryKey: workspaceKey(storyId) })] : [])
  ]);
}
