"use client";

import { CalendarControls } from "@byline/newsroom-screens/calendar/CalendarControls";
import { useCalendarWorkspace } from "@byline/newsroom-screens/calendar/calendar-workspace-context";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { useNewsroomAccount } from "./account";
import { BylineIconRail } from "./BylineIconRail";
import type { ShellSidebarProps } from "./nav-items";
import { useNewsroomTimeZone } from "./timezone";

/**
 * The Calendar workspace's sidebar contents: shadcn sidebar-09's nested
 * composition (the global icon rail, then a contextual pane) with sidebar-12's
 * calendar controls in the pane: a mini month that moves the Calendar, and the
 * newsroom's real categories. Inside BylineSidebar's one
 * `<Sidebar collapsible="icon">`, so collapsing it (⌘\) leaves only the rail
 * and the pane is inert, not just clipped. The controls are the same
 * component, over the same Calendar workspace, as the narrow-screen sheet.
 */
export function CalendarWorkspaceSidebar(props: ShellSidebarProps & { active: string | null }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <>
      <BylineIconRail {...props} />
      <Sidebar collapsible="none" className="hidden min-w-0 flex-1 md:flex" inert={collapsed} aria-hidden={collapsed || undefined} data-byline-calendar-pane="">
        <CalendarPane />
      </Sidebar>
    </>
  );
}

function CalendarPane() {
  const account = useNewsroomAccount();
  const timezone = useNewsroomTimeZone();
  const { state } = useCalendarWorkspace();
  return (
    <>
      <SidebarHeader className="flex-row items-center justify-between gap-2 border-b border-sidebar-border p-4">
        <div className="text-base font-medium text-foreground">Calendar</div>
        {/* A count of unresolved appointments in view; the list itself stays on the Calendar. */}
        {state.needsScheduling ? <Badge variant="secondary" title="Appointments that still need an exact time">{state.needsScheduling} to schedule</Badge> : null}
      </SidebarHeader>
      <SidebarContent className="pt-2">
        <CalendarControls timezone={timezone} scheduleFeed currentUserId={account ? Number(account.id) : null} />
      </SidebarContent>
    </>
  );
}
