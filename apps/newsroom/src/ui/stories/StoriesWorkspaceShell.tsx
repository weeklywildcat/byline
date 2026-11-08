"use client";

import { createStoriesWorkspace, type StoriesWorkspace } from "@byline/newsroom-screens/planning/stories-workspace";
import { StoriesWorkspaceProvider } from "@byline/newsroom-screens/planning/stories-workspace-context";
import { useState, type ReactNode } from "react";

/**
 * The Stories workspace's one owner, in the shell (beside the Calendar's):
 * the filters, the sort and the selected saved view, shared by the Stories
 * screen, the Stories workspace's contextual pane and the narrow-screen
 * Views sheet, plus the stories the screen last loaded, so the pane counts
 * without a read of its own. It outlives each Stories visit, so returning to
 * Stories lands on the same view; an address that names filters (a sidebar
 * shortcut, a shared link) starts that view instead.
 */
export function StoriesWorkspaceShell({ children }: { children: ReactNode }) {
  const [workspace] = useState<StoriesWorkspace>(() => createStoriesWorkspace());
  return <StoriesWorkspaceProvider workspace={workspace}>{children}</StoriesWorkspaceProvider>;
}
