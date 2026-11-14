"use client";

import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { prefetchStoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-query";
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
  const routeWarm = useRef(new Set<number>());
  return useCallback((storyId: number) => {
    if (!Number.isSafeInteger(storyId) || storyId <= 0) return;
    if (!routeWarm.current.has(storyId) && prefetchFullRoute(router, workspaceUrl(storyId))) routeWarm.current.add(storyId);
    if (fetchers.getWorkspace) void prefetchStoryWorkspace(queryClient, storyId, fetchers.getWorkspace);
  }, [fetchers.getWorkspace, queryClient, router, workspaceUrl]);
}
