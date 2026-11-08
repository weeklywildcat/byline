"use client";

import { StoriesNavigator, StoriesNavigatorCount } from "@byline/newsroom-screens/planning/StoriesNavigator";
import { useStoriesWorkspace } from "@byline/newsroom-screens/planning/stories-workspace-context";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { BylineIconRail } from "./BylineIconRail";
import type { ShellSidebarProps } from "./nav-items";

/**
 * The Stories workspace's sidebar contents: shadcn sidebar-09's nested
 * composition (the global icon rail, then a contextual pane) with the Stories
 * navigator in the pane: Views, Stages and Writers, each with a count. Inside
 * BylineSidebar's one `<Sidebar collapsible="icon">`, so ⌘\ leaves only the
 * rail and the pane is inert, not just clipped. This is the one sidebar's
 * composition, not the removed StoryViewsRail's second column. The pane is
 * the same StoriesNavigator, over the same Stories workspace, as the
 * narrow-screen sheet.
 */
export function StoriesWorkspaceSidebar(props: ShellSidebarProps & { active: string | null }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <>
      <BylineIconRail {...props} />
      <Sidebar collapsible="none" className="hidden min-w-0 flex-1 md:flex" inert={collapsed} aria-hidden={collapsed || undefined} data-byline-stories-pane="">
        <StoriesPane />
      </Sidebar>
    </>
  );
}

function StoriesPane() {
  const workspace = useStoriesWorkspace();
  return (
    <>
      <SidebarHeader className="flex-row items-center justify-between gap-2 border-b border-sidebar-border p-4">
        <div className="text-base font-medium text-foreground">Stories</div>
        <StoriesNavigatorCount workspace={workspace} />
      </SidebarHeader>
      <SidebarContent className="pt-1">
        <StoriesNavigator workspace={workspace} />
      </SidebarContent>
    </>
  );
}
