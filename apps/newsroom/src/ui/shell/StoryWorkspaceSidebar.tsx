"use client";

import { Sidebar, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { BylineIconRail } from "./BylineIconRail";
import type { ShellSidebarProps } from "./nav-items";
import { StorySwitcherContent } from "./StorySwitcher";

/**
 * The Story workspace's sidebar contents, shadcn sidebar-09's nested
 * composition inside BylineSidebar's one `<Sidebar collapsible="icon">`
 * (which adds sidebar-09's `overflow-hidden *:data-[sidebar=sidebar]:flex-row`):
 * the global icon rail, then the Story list filling the rest of the 350px.
 * Collapsing the sidebar (the header's trigger, ⌘\) narrows it to the icon
 * width, so only the rail remains; the list is then inert, not just clipped.
 */
export function StoryWorkspaceSidebar(props: ShellSidebarProps & { active: string | null }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <>
      <BylineIconRail {...props} />
      <Sidebar collapsible="none" className="hidden min-w-0 flex-1 md:flex" inert={collapsed} aria-hidden={collapsed || undefined} data-byline-story-pane="">
        <StorySwitcherContent />
      </Sidebar>
    </>
  );
}
