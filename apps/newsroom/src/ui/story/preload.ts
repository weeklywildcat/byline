"use client";

import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { prefetchStoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import type { PrefetchOptions } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * One Story intent warmer for the Payload newsroom: preload the dynamic Next
 * route and the Story Workspace into the shell's shared QueryClient. The route
 * and data caches deduplicate repeated hover/focus/touch/Peek signals.
 */
export function useStoryPreload(fetchers: StoryFetchers, workspaceUrl: (storyId: number) => string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback((storyId: number) => {
    if (!Number.isSafeInteger(storyId) || storyId <= 0) return;
    router.prefetch(workspaceUrl(storyId), { kind: "full" } as unknown as PrefetchOptions);
    if (fetchers.getWorkspace) void prefetchStoryWorkspace(queryClient, storyId, fetchers.getWorkspace);
  }, [fetchers.getWorkspace, queryClient, router, workspaceUrl]);
}
