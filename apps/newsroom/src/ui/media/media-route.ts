"use client";

import { mediaRouteSearch, parseMediaRoute, type MediaRoute } from "@byline/newsroom-screens/media/media-library-model";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { pushMediaEntry, replaceMediaEntry } from "./media-history";

/** The Media screen's query string for a route (`""` is Library → All media). */
export const mediaHrefSearch = mediaRouteSearch;

/** Where the Media screen is, from its address. The sidebar pane, the sheet and the screen all read the same one. */
export function useMediaRoute(): MediaRoute {
  const params = useSearchParams();
  const search = params?.toString() ?? "";
  return useMemo(() => parseMediaRoute(search), [search]);
}

/**
 * Moving within Media changes only the address's query, through the
 * browser's own history: Back and Forward work, a refresh keeps the folder
 * and the selected asset, and Library ↔ Work never reloads the page. Next's
 * router follows native `pushState` (useSearchParams updates) without a
 * server round trip, so Payload doesn't re-render (or remount) the shell.
 * Each entry carries a small marker (see `media-history.ts`) so that Back and
 * Forward can be guarded while file details are unsaved.
 */
export function useMediaNavigate(href: (route: MediaRoute) => string) {
  return useCallback((route: MediaRoute, options: { replace?: boolean } = {}) => {
    const next = href(route);
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === current) return;
    if (options.replace) replaceMediaEntry(next);
    else pushMediaEntry(next);
  }, [href]);
}
