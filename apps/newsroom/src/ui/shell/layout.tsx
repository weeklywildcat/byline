"use client";

import { useIsMobile, useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { storyIdFromPath } from "../../domain/navigation";
import { SIDEBAR_WIDTH, STORY_WORKSPACE_QUERY } from "./shell-config";

/**
 * Which composition the one sidebar has on this screen. A saved story's
 * Story screen on a wide enough screen is a Story workspace (the global icon
 * rail plus the Story list); everything else, including a story on a narrower
 * screen, has the ordinary sidebar. Viewport width is a layout capability,
 * never the reader's expanded/collapsed preference.
 */
export type ShellLayout = { storyId: number | null; storyWorkspace: boolean };

export function shellLayoutFor(pathname: string, adminRoute: string, wide: boolean): ShellLayout {
  const storyId = storyIdFromPath(pathname, adminRoute);
  return { storyId, storyWorkspace: storyId !== null && wide };
}

/**
 * The SidebarProvider's variables for a layout. Only the Story workspace
 * reserves sidebar-09's 350px (rail + list); changing it animates the one
 * sidebar's existing gap and container, never a second layout.
 */
export function shellSidebarStyle(layout: ShellLayout): CSSProperties {
  return {
    display: "contents",
    "--sidebar-width": `${layout.storyWorkspace ? SIDEBAR_WIDTH.storyWorkspace : SIDEBAR_WIDTH.default}px`,
    "--sidebar-width-icon": `${SIDEBAR_WIDTH.icon}px`,
    "--sidebar-width-mobile": `${SIDEBAR_WIDTH.mobile}px`
  } as CSSProperties;
}

const ShellLayoutContext = createContext<ShellLayout>({ storyId: null, storyWorkspace: false });

export const ShellLayoutProvider = ShellLayoutContext;
export const useShellLayout = () => use(ShellLayoutContext);

/** The current layout, from the address and the viewport (ordinary until hydrated). */
export function useCurrentShellLayout(adminRoute: string): ShellLayout {
  const pathname = usePathname() ?? "";
  const wide = useMediaQuery(STORY_WORKSPACE_QUERY);
  const { storyId, storyWorkspace } = shellLayoutFor(pathname, adminRoute, wide);
  return useMemo(() => ({ storyId, storyWorkspace }), [storyId, storyWorkspace]);
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
