"use client";

import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { prefetchStoryWorkspace, WORKSPACE_STALE_TIME } from "@byline/newsroom-screens/workspace/workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { prefetchFullRoute } from "../shell/prefetch";
import { useCallback, useRef } from "react";

/**
 * One Story intent warmer for the Payload newsroom: preload the dynamic Next
 * route and the Story Workspace into the shell's shared QueryClient. The route
 * and data caches deduplicate repeated hover/focus/touch/Peek signals.
 */
export function useStoryPreload(fetchers: StoryFetchers, workspaceUrl: (storyId: number) => string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const routeWarm = useRef(new Map<number, number>());
  return useCallback((storyId: number) => {
    if (!Number.isSafeInteger(storyId) || storyId <= 0) return;
    const now = performance.now();
    const lastRouteWarm = routeWarm.current.get(storyId) ?? Number.NEGATIVE_INFINITY;
    if (now - lastRouteWarm >= WORKSPACE_STALE_TIME && prefetchFullRoute(router, workspaceUrl(storyId))) routeWarm.current.set(storyId, now);
    if (fetchers.getWorkspace) void prefetchStoryWorkspace(queryClient, storyId, fetchers.getWorkspace);
  }, [fetchers.getWorkspace, queryClient, router, workspaceUrl]);
}
