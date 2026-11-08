import { createContext, use, useSyncExternalStore, type ReactNode } from "react";
import type { StoriesWorkspace, StoriesWorkspaceState } from "./stories-workspace";

const StoriesWorkspaceContext = createContext<StoriesWorkspace | null>(null);

/**
 * Provides the one Stories workspace to the Stories screen and every
 * presentation of its views (a contextual sidebar pane, a narrow-screen
 * sheet). A host creates it where it should live: in its application shell,
 * so the sidebar can share it.
 */
export function StoriesWorkspaceProvider({ workspace, children }: { workspace: StoriesWorkspace; children: ReactNode }) {
  return <StoriesWorkspaceContext value={workspace}>{children}</StoriesWorkspaceContext>;
}

/** The shell's Stories workspace, or null outside a provider (a host without one). */
export function useOptionalStoriesWorkspace(): StoriesWorkspace | null {
  return use(StoriesWorkspaceContext);
}

/** The Stories workspace; throws outside a provider. */
export function useStoriesWorkspace(): StoriesWorkspace {
  const workspace = use(StoriesWorkspaceContext);
  if (!workspace) throw new Error("useStoriesWorkspace must be used inside a StoriesWorkspaceProvider.");
  return workspace;
}

/** A workspace's current state, re-rendering on every change. */
export function useStoriesWorkspaceState(workspace: StoriesWorkspace): StoriesWorkspaceState {
  return useSyncExternalStore(workspace.subscribe, workspace.getState, workspace.getState);
}
