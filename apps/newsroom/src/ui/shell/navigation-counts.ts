"use client";

import { useQuery } from "@tanstack/react-query";
import type { NavigationCounts } from "../../newsroom/navigation-counts";
import { createBylineRequest } from "../home/payload-fetchers";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";

export const NAVIGATION_COUNTS_QUERY = ["byline", "navigation-counts"] as const;

/**
 * The sidebar's open-work counts, from the shell's query cache. Payload
 * remounts the Nav on every navigation, so the cache (not the component) keeps
 * them; they refresh at most once a minute and whenever the window regains focus.
 * A failed read shows no counts rather than stale or invented ones.
 */
export function useNavigationCounts(): NavigationCounts | undefined {
  const account = useNewsroomAccount();
  const { api } = useNewsroomRoutes();
  const { data } = useQuery({
    queryKey: [...NAVIGATION_COUNTS_QUERY, account?.id ?? null],
    queryFn: () => createBylineRequest(api)<NavigationCounts>("/navigation-counts"),
    enabled: Boolean(account),
    staleTime: 60_000,
    retry: false
  });
  return data;
}
