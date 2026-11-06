"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Sidebar } from "@byline/newsroom-ui/ui/sidebar";
import { usePathname } from "next/navigation";
import { activeNavKey } from "../../domain/navigation";
import { DefaultSidebar } from "./DefaultSidebar";
import { useShellLayout, useSyncSidebarWidthOnMount } from "./layout";
import type { ShellSidebarProps } from "./nav-items";
import { CalendarWorkspaceSidebar } from "./CalendarWorkspaceSidebar";
import { StoryWorkspaceSidebar } from "./StoryWorkspaceSidebar";

export type { ShellNavLink } from "./nav-items";

/** shadcn sidebar-09: the nested inner sidebars (rail, contextual pane) lie side by side inside the outer one. */
export const WORKSPACE_SIDEBAR_CLASS = "overflow-hidden *:data-[sidebar=sidebar]:flex-row";

/**
 * The global Byline sidebar, rendered by Payload's `admin.components.Nav`.
 * There is one sidebar (one SidebarProvider, one expanded/collapsed state);
 * its composition is contextual. Ordinary screens get the global app
 * sidebar; on a wide enough screen a story's Story screen is a Story
 * workspace and the Calendar a Calendar workspace, shadcn sidebar-09's nested
 * sidebars (the global icon rail plus a contextual pane: the Story list, or
 * the Calendar's controls). The outer `Sidebar` stays the same element
 * whatever the composition, so moving between them animates the one
 * sidebar's width. Nothing here names Payload.
 */
export function BylineSidebar(props: ShellSidebarProps) {
  return (
    <AdminRoot className="byline-shell-nav" toaster={false}>
      <ContextualSidebar {...props} />
    </AdminRoot>
  );
}

function ContextualSidebar(props: ShellSidebarProps) {
  const pathname = usePathname() ?? "";
  const { composition } = useShellLayout();
  // Inside the root, so the sidebar element exists when this runs.
  useSyncSidebarWidthOnMount();
  const active = activeNavKey(props.items, pathname, props.adminRoute);
  return (
    <Sidebar collapsible="icon" className={composition === "default" ? undefined : WORKSPACE_SIDEBAR_CLASS} mobileTitle="Byline" mobileDescription="Newsroom navigation and account" data-composition={composition}>
      {composition === "story-workspace" ? <StoryWorkspaceSidebar {...props} active={active} /> : composition === "calendar-workspace" ? <CalendarWorkspaceSidebar {...props} active={active} /> : <DefaultSidebar {...props} active={active} />}
    </Sidebar>
  );
}
