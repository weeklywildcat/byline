import { createContext, use, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { CalendarWorkspace, CalendarWorkspaceState } from "./calendar-workspace";

const CalendarWorkspaceContext = createContext<CalendarWorkspace | null>(null);

/**
 * Provides the one Calendar workspace to the calendar and every presentation
 * of its controls. A host creates the workspace where it should live: in its
 * application shell, so a contextual sidebar can share it, or beside the
 * calendar when the controls only ever appear with it.
 */
export function CalendarWorkspaceProvider({ workspace, children }: { workspace: CalendarWorkspace; children: ReactNode }) {
  return <CalendarWorkspaceContext value={workspace}>{children}</CalendarWorkspaceContext>;
}

/** The Calendar workspace and its current state; reading it loads stored preferences once. */
export function useCalendarWorkspace(): { workspace: CalendarWorkspace; state: CalendarWorkspaceState } {
  const workspace = use(CalendarWorkspaceContext);
  if (!workspace) throw new Error("useCalendarWorkspace must be used inside a CalendarWorkspaceProvider.");
  const state = useSyncExternalStore(workspace.subscribe, workspace.getState, workspace.getState);
  useEffect(() => { void workspace.load(); }, [workspace]);
  return { workspace, state };
}
