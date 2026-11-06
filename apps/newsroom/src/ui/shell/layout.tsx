"use client";

import { useIsMobile, useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { isCalendarPath, isMediaPath, storyIdFromPath } from "../../domain/navigation";
import { CALENDAR_WORKSPACE_QUERY, MEDIA_WORKSPACE_QUERY, SIDEBAR_WIDTH, STORY_WORKSPACE_QUERY } from "./shell-config";

/**
 * Which composition the one sidebar has on this screen:
 * - `default`: the ordinary Byline sidebar (256px).
 * - `story-workspace`: a saved story's Story screen on a wide enough screen,
 *   shadcn sidebar-09's nested sidebars: the global icon rail plus the Story list.
 * - `calendar-workspace`: the Calendar on a wide enough screen: the icon rail
 *   plus the Calendar's controls (sidebar-12's mini calendar and categories).
 * - `media-workspace`: Media on a wide enough screen: the icon rail plus the
 *   Media navigator (Library scopes, Work views, sidebar-11's folder tree).
 * Each workspace has its own breakpoint, measured for its own content. Below
 * it the screen keeps the ordinary sidebar and offers its context in a
 * temporary sheet. Viewport width is a layout capability, never the reader's
 * expanded/collapsed preference.
 */
export type ShellComposition = "default" | "story-workspace" | "calendar-workspace" | "media-workspace";

/** What the address says, apart from width: the story whose screen this is, and whether this is the Calendar or Media. */
export type ShellRoute = { storyId: number | null; calendar: boolean; media: boolean };

export type ShellLayout = ShellRoute & { composition: ShellComposition };

/** Which workspaces the viewport is wide enough for. */
export type ShellViewport = { storyWorkspace: boolean; calendarWorkspace: boolean; mediaWorkspace?: boolean };

export function shellRouteFor(pathname: string, adminRoute: string): ShellRoute {
  return { storyId: storyIdFromPath(pathname, adminRoute), calendar: isCalendarPath(pathname, adminRoute), media: isMediaPath(pathname, adminRoute) };
}

export function shellCompositionFor(route: ShellRoute, viewport: ShellViewport): ShellComposition {
  if (route.storyId !== null && viewport.storyWorkspace) return "story-workspace";
  if (route.calendar && viewport.calendarWorkspace) return "calendar-workspace";
  if (route.media && viewport.mediaWorkspace) return "media-workspace";
  return "default";
}

export function shellLayoutFor(pathname: string, adminRoute: string, viewport: ShellViewport): ShellLayout {
  const route = shellRouteFor(pathname, adminRoute);
  return { ...route, composition: shellCompositionFor(route, viewport) };
}

/**
 * The SidebarProvider's variables for a layout. A workspace reserves its
 * width (rail + contextual pane); changing it animates the one sidebar's
 * existing gap and container, never a second layout.
 */
export function shellSidebarStyle(layout: Pick<ShellLayout, "composition">): CSSProperties {
  return {
    display: "contents",
    "--sidebar-width": `${SIDEBAR_WIDTH[COMPOSITION_WIDTH[layout.composition]]}px`,
    "--sidebar-width-icon": `${SIDEBAR_WIDTH.icon}px`,
    "--sidebar-width-mobile": `${SIDEBAR_WIDTH.mobile}px`
  } as CSSProperties;
}

const COMPOSITION_WIDTH: Record<ShellComposition, keyof typeof SIDEBAR_WIDTH> = { default: "default", "story-workspace": "storyWorkspace", "calendar-workspace": "calendarWorkspace", "media-workspace": "mediaWorkspace" };

const ShellLayoutContext = createContext<ShellLayout>({ storyId: null, calendar: false, media: false, composition: "default" });

export const ShellLayoutProvider = ShellLayoutContext;
export const useShellLayout = () => use(ShellLayoutContext);

/** The current layout, from the address and the viewport (ordinary until hydrated). */
export function useCurrentShellLayout(adminRoute: string): ShellLayout {
  const pathname = usePathname() ?? "";
  const storyWorkspace = useMediaQuery(STORY_WORKSPACE_QUERY);
  const calendarWorkspace = useMediaQuery(CALENDAR_WORKSPACE_QUERY);
  const mediaWorkspace = useMediaQuery(MEDIA_WORKSPACE_QUERY);
  const { storyId, calendar, media, composition } = shellLayoutFor(pathname, adminRoute, { storyWorkspace, calendarWorkspace, mediaWorkspace });
  return useMemo(() => ({ storyId, calendar, media, composition }), [storyId, calendar, media, composition]);
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
export function useSidebarWidthLayout(layout: ShellLayout): { applied: ShellLayout; sync: () => void } {
  const [applied, setApplied] = useState(layout);
  const latest = useRef(layout);
  latest.current = layout;
  // Phones have no desktop sidebar to animate (or to wait for).
  const phone = useIsMobile();
  const sync = useCallback(() => {
    const gap = document.querySelector("[data-slot=sidebar-gap]");
    if (gap) void getComputedStyle(gap).width;
    else if (!phone) return;
    setApplied(latest.current);
  }, [phone]);
  useLayoutEffect(() => { if (applied !== layout) sync(); }, [applied, layout, sync]);
  return { applied, sync };
}

const SidebarWidthSyncContext = createContext<() => void>(() => {});
export const SidebarWidthSyncProvider = SidebarWidthSyncContext;

/** A newly mounted sidebar takes up any width change that waited for it. */
export function useSyncSidebarWidthOnMount() {
  const sync = use(SidebarWidthSyncContext);
  useLayoutEffect(() => { sync(); }, [sync]);
}
