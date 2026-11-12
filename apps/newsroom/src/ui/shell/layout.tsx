"use client";

import { useIsMobile, useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, use, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { isCalendarPath, isCollectionsPath, isMediaPath, isStoriesPath, primaryLocationFor, storyIdFromPath } from "../../domain/navigation";
import { ADAPTIVE_NAVIGATION_QUERY, CALENDAR_WORKSPACE_MIN_WIDTH, CALENDAR_WORKSPACE_QUERY, COLLECTION_WORKSPACE_MIN_WIDTH, MEDIA_WORKSPACE_MIN_WIDTH, STORIES_WORKSPACE_MIN_WIDTH, STORY_WORKSPACE_MIN_WIDTH, COLLECTION_WORKSPACE_QUERY, MEDIA_WORKSPACE_QUERY, SIDEBAR_WIDTH, STORIES_WORKSPACE_QUERY, STORY_WORKSPACE_QUERY } from "./shell-config";

/**
 * Which composition the one sidebar has on this screen:
 * - `default`: the ordinary Byline sidebar (256px).
 * - `story-workspace`: a saved story's Story screen on a wide enough screen,
 *   shadcn sidebar-09's nested sidebars: the global icon rail plus the Story list.
 * - `calendar-workspace`: the Calendar on a wide enough screen: the icon rail
 *   plus the Calendar's controls (sidebar-12's mini calendar and categories).
 * - `media-workspace`: Media on a wide enough screen: the icon rail plus the
 *   Media navigator (Library scopes, Work views, sidebar-11's folder tree).
 * - `stories-workspace`: Stories on a wide enough screen: the icon rail plus
 *   the Stories pane (Views, Stages and Writers, each with a count). It is
 *   this one sidebar's composition, never a second column beside it.
 * - `collection-workspace`: an open Collection on a wide enough screen:
 *   sidebar-09's icon rail plus the Collection switcher. The Collections list
 *   itself keeps the ordinary sidebar.
 * Each workspace has its own breakpoint, measured for its own content. Below
 * it the screen offers its context in a temporary sheet. Viewport width is a layout capability, never the reader's
 * expanded/collapsed preference.
 */
export type ShellComposition = "default" | "story-workspace" | "calendar-workspace" | "media-workspace" | "stories-workspace" | "collection-workspace";

/**
 * What the address says, apart from width: the story whose screen this is,
 * whether this is Stories, the Calendar, Media or Collections, and which Collection
 * is open there (from the query: `?collection=<id>`).
 */
export type ShellRoute = { storyId: number | null; stories: boolean; calendar: boolean; media: boolean; collections: boolean; collectionId: number | null };

export type ShellLayout = ShellRoute & { composition: ShellComposition };

/** Which workspaces the viewport is wide enough for. */
export type ShellViewport = { storyWorkspace: boolean; calendarWorkspace: boolean; mediaWorkspace?: boolean; storiesWorkspace?: boolean; collectionWorkspace?: boolean };

export function shellRouteFor(pathname: string, adminRoute: string, search = ""): ShellRoute {
  const collections = isCollectionsPath(pathname, adminRoute);
  const collection = collections ? Number(new URLSearchParams(search).get("collection")) : NaN;
  return {
    storyId: storyIdFromPath(pathname, adminRoute),
    stories: isStoriesPath(pathname, adminRoute),
    calendar: isCalendarPath(pathname, adminRoute),
    media: isMediaPath(pathname, adminRoute),
    collections,
    collectionId: Number.isSafeInteger(collection) && collection > 0 ? collection : null
  };
}

export function shellCompositionFor(route: ShellRoute, viewport: ShellViewport): ShellComposition {
  if (route.storyId !== null && viewport.storyWorkspace) return "story-workspace";
  if (route.calendar && viewport.calendarWorkspace) return "calendar-workspace";
  if (route.media && viewport.mediaWorkspace) return "media-workspace";
  if (route.stories && viewport.storiesWorkspace) return "stories-workspace";
  if (route.collectionId !== null && viewport.collectionWorkspace) return "collection-workspace";
  return "default";
}

export function shellLayoutFor(pathname: string, adminRoute: string, viewport: ShellViewport, search = ""): ShellLayout {
  const route = shellRouteFor(pathname, adminRoute, search);
  return { ...route, composition: shellCompositionFor(route, viewport) };
}

/**
 * The SidebarProvider's variables for a layout. A workspace reserves its
 * width (rail + contextual pane); changing it animates the one sidebar's
 * existing gap and container, never a second layout.
 */
export function shellSidebarStyle(layout: Pick<ShellLayout, "composition">, options: { fromRoute?: boolean } = {}): CSSProperties {
  return {
    display: "contents",
    // Before hydration the viewport is unknown in JavaScript; the route's own media rule (`routeSidebarWidthRule`) picks the width.
    "--sidebar-width": options.fromRoute ? `var(${ROUTE_SIDEBAR_WIDTH_VAR}, ${SIDEBAR_WIDTH.default}px)` : `${SIDEBAR_WIDTH[COMPOSITION_WIDTH[layout.composition]]}px`,
    "--sidebar-width-icon": `${SIDEBAR_WIDTH.icon}px`,
    "--sidebar-width-mobile": `${SIDEBAR_WIDTH.mobile}px`
  } as CSSProperties;
}

const COMPOSITION_WIDTH: Record<ShellComposition, keyof typeof SIDEBAR_WIDTH> = { default: "default", "story-workspace": "storyWorkspace", "calendar-workspace": "calendarWorkspace", "media-workspace": "mediaWorkspace", "stories-workspace": "storiesWorkspace", "collection-workspace": "collectionWorkspace" };

const ROUTE_SIDEBAR_WIDTH_VAR = "--byline-route-sidebar-width";
const WORKSPACE_MIN_WIDTH: Record<Exclude<ShellComposition, "default">, number> = {
  "story-workspace": STORY_WORKSPACE_MIN_WIDTH,
  "calendar-workspace": CALENDAR_WORKSPACE_MIN_WIDTH,
  "media-workspace": MEDIA_WORKSPACE_MIN_WIDTH,
  "stories-workspace": STORIES_WORKSPACE_MIN_WIDTH,
  "collection-workspace": COLLECTION_WORKSPACE_MIN_WIDTH
};
/** Below this the header's adaptive navigation forces the ordinary sidebar (ADAPTIVE_NAVIGATION_QUERY). */
const ADAPTIVE_NAVIGATION_MAX = 1200;

/**
 * The CSS that gives the server-rendered page the sidebar width its route
 * will have once JavaScript knows the viewport, so a story (or the Calendar,
 * Media, Stories, a Collection) opened by a full page load does not paint at
 * 256px and then slide its content sideways. Null for routes without a workspace.
 */
export function routeSidebarWidthRule(route: ShellRoute): string | null {
  const composition = shellCompositionFor(route, { storyWorkspace: true, calendarWorkspace: true, mediaWorkspace: true, storiesWorkspace: true, collectionWorkspace: true });
  if (composition === "default") return null;
  const minWidth = Math.max(WORKSPACE_MIN_WIDTH[composition], ADAPTIVE_NAVIGATION_MAX);
  return `@media (min-width: ${minWidth}px) { :root { ${ROUTE_SIDEBAR_WIDTH_VAR}: ${SIDEBAR_WIDTH[COMPOSITION_WIDTH[composition]]}px; } }`;
}

const subscribeNothing = () => () => {};
/** False while rendering on the server and hydrating; true afterwards. */
export const useHydrated = () => useSyncExternalStore(subscribeNothing, () => true, () => false);

const ShellLayoutContext = createContext<ShellLayout>({ storyId: null, stories: false, calendar: false, media: false, collections: false, collectionId: null, composition: "default" });

export const ShellLayoutProvider = ShellLayoutContext;
export const useShellLayout = () => use(ShellLayoutContext);

export function usePrimaryLocation(adminRoute: string) {
  return primaryLocationFor(usePathname() ?? "", adminRoute);
}

export function useAdaptiveNavigation(adminRoute: string) {
  const location = usePrimaryLocation(adminRoute);
  const narrow = useMediaQuery(ADAPTIVE_NAVIGATION_QUERY);
  return Boolean(location && narrow);
}

/** The current layout, from the address and the viewport (ordinary until hydrated). */
export function useCurrentShellLayout(adminRoute: string, adaptive: boolean): ShellLayout {
  const pathname = usePathname() ?? "";
  // Only the open Collection is read from the query; other screens' queries never change the layout.
  const params = useSearchParams();
  const collection = isCollectionsPath(pathname, adminRoute) ? (params?.get("collection") ?? "") : "";
  const storyWorkspace = useMediaQuery(STORY_WORKSPACE_QUERY);
  const calendarWorkspace = useMediaQuery(CALENDAR_WORKSPACE_QUERY);
  const mediaWorkspace = useMediaQuery(MEDIA_WORKSPACE_QUERY);
  const storiesWorkspace = useMediaQuery(STORIES_WORKSPACE_QUERY);
  const collectionWorkspace = useMediaQuery(COLLECTION_WORKSPACE_QUERY);
  const route = shellRouteFor(pathname, adminRoute, collection ? `collection=${collection}` : "");
  const { storyId, stories, calendar, media, collections, collectionId } = route;
  const composition = adaptive ? "default" : shellCompositionFor(route, { storyWorkspace, calendarWorkspace, mediaWorkspace, storiesWorkspace, collectionWorkspace });
  return useMemo(() => ({ storyId, stories, calendar, media, collections, collectionId, composition }), [storyId, stories, calendar, media, collections, collectionId, composition]);
}

/**
 * The layout the sidebar's width follows. Payload renders the Nav inside each
 * page, so every navigation mounts a new sidebar element (sometimes a moment
 * after the address changes); given the new width at once it would jump. A
 * new width applies only once a sidebar is mounted: its styles are first
 * resolved at the previous width, then the new width applies before paint,
 * so the sidebar's own width transition runs, as it does for collapsing.
 * BylineSidebar calls `sync` when it mounts.
 */
export function useSidebarWidthLayout(layout: ShellLayout): { applied: ShellLayout; sync: () => void; fromRoute: boolean } {
  const hydrated = useHydrated();
  const [applied, setApplied] = useState(layout);
  const latest = useRef(layout);
  latest.current = layout;
  // The first layout after hydration is what the route's CSS already painted: take it as is, with nothing to animate.
  const settled = useRef(false);
  if (hydrated && !settled.current && applied !== layout) {
    settled.current = true;
    setApplied(layout);
  } else if (hydrated) settled.current = true;
  // Phones have no desktop sidebar to animate (or to wait for).
  const phone = useIsMobile();
  const sync = useCallback(() => {
    const gap = document.querySelector("[data-slot=sidebar-gap]");
    if (gap) void getComputedStyle(gap).width;
    else if (!phone) return;
    setApplied(latest.current);
  }, [phone]);
  useLayoutEffect(() => { if (hydrated && applied !== layout) sync(); }, [hydrated, applied, layout, sync]);
  return { applied, sync, fromRoute: !hydrated };
}

const SidebarWidthSyncContext = createContext<() => void>(() => {});
export const SidebarWidthSyncProvider = SidebarWidthSyncContext;

/** A newly mounted sidebar takes up any width change that waited for it. */
export function useSyncSidebarWidthOnMount() {
  const sync = use(SidebarWidthSyncContext);
  useLayoutEffect(() => { sync(); }, [sync]);
}
