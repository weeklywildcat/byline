"use client";

import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { MediaNavigator } from "../media/MediaNavigator";
import { BylineIconRail } from "./BylineIconRail";
import type { ShellSidebarProps } from "./nav-items";

/**
 * The Media workspace's sidebar contents: shadcn sidebar-09's nested
 * composition (the global icon rail, then a contextual pane) with the Media
 * navigator in the pane: Library scopes, Work views and sidebar-11's folder
 * tree. Inside BylineSidebar's one `<Sidebar collapsible="icon">`, so ⌘\
 * leaves only the rail and the pane is inert, not just clipped. The pane is
 * the same `MediaNavigator` as the narrow-screen sheet.
 */
export function MediaWorkspaceSidebar(props: ShellSidebarProps & { active: string | null }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <>
      <BylineIconRail {...props} />
      <Sidebar collapsible="none" className="hidden min-w-0 flex-1 md:flex" inert={collapsed} aria-hidden={collapsed || undefined} data-byline-media-pane="">
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <div className="text-base font-medium text-foreground">Media</div>
        </SidebarHeader>
        <SidebarContent className="pt-1">
          <nav aria-label="Media navigation" className="contents">
            <MediaNavigator />
          </nav>
        </SidebarContent>
      </Sidebar>
    </>
  );
}
