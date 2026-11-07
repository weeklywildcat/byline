"use client";

import { createCalendarWorkspace, type CalendarWorkspace } from "@byline/newsroom-screens/calendar/calendar-workspace";
import { CalendarWorkspaceProvider } from "@byline/newsroom-screens/calendar/calendar-workspace-context";
import { usePreferences } from "@payloadcms/ui";
import { useRef, useState, type ReactNode } from "react";
import { payloadCalendarStorage } from "./calendar-preferences";

/**
 * The Calendar workspace's one owner, in the shell (as the Story switcher's
 * is): the selected date, the filters and the view, shared by the Calendar
 * screen, the Calendar workspace's contextual pane and the narrow-screen
 * controls sheet. It outlives each Calendar visit, so returning to the
 * Calendar lands on the same date; the view and the filters are the
 * account's Payload Preferences (read the first time the Calendar opens).
 */
export function CalendarWorkspaceShell({ children }: { children: ReactNode }) {
  const { getPreference, setPreference } = usePreferences();
  // Preferences functions may change identity between renders; the workspace always reaches the current ones.
  const store = useRef({ getPreference, setPreference });
  store.current = { getPreference, setPreference };
  const [workspace] = useState<CalendarWorkspace>(() =>
    createCalendarWorkspace(payloadCalendarStorage({
      getPreference: (key) => store.current.getPreference(key),
      setPreference: (key, value) => store.current.setPreference(key, value)
    }))
  );
  return <CalendarWorkspaceProvider workspace={workspace}>{children}</CalendarWorkspaceProvider>;
}
