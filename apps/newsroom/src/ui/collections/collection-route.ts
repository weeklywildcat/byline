"use client";

import { collectionRoute, type CollectionRoute } from "@byline/newsroom-screens/collections/collection-model";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { createHistoryGuard } from "../shell/history-guard";

/** Collections' browser history and its Back/Forward guard for unsaved Collection edits. */
export const collectionsHistory = createHistoryGuard("bylineCollections");

/** The Collections screen's query for a route: `""` is the list; `?collection=12&tab=stories&interview=4`. */
export function collectionSearch(route: CollectionRoute): string {
  if (!route.collectionId) return "";
  const params = new URLSearchParams({ collection: String(route.collectionId) });
  if (route.interviewId) {
    params.set("tab", "reporting");
    params.set("interview", String(route.interviewId));
  } else if (route.tab !== "overview") params.set("tab", route.tab);
  return `?${params.toString()}`;
}

/** Where the Collections screen is, from its address. The switcher pane, its sheet and the screen read the same one. */
export function useCollectionRoute(): CollectionRoute {
  const params = useSearchParams();
  const collection = params?.get("collection");
  const tab = params?.get("tab");
  const interview = params?.get("interview");
  return useMemo(() => collectionRoute({ collection, tab, interview }), [collection, tab, interview]);
}
