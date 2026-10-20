import { createContext, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EditorialRestClient } from "../editorial/editorial-rest";
import type { WorkspaceClient } from "./workspace-api";
import { workspaceKey } from "./workspace-query";
import type { StoryWorkspace, WorkspaceCapabilities, WorkspaceSection } from "./workspace-types";
import type { NewsroomCommandUrls, StorySearchResult } from "../story/NewsroomCommands";

export type WorkspaceEnv = {
  storyId: number;
  /** A deep-linked appointment to open once the workspace has loaded. */
  appointmentId: string;
  currentUserId: number;
  storiesUrl: string;
  client: WorkspaceClient;
  editorial: EditorialRestClient;
  searchStories?: (query: string) => Promise<{ stories: StorySearchResult[] }>;
  commandUrls?: NewsroomCommandUrls;
};

export type WorkspaceContextValue = WorkspaceEnv & {
  data: StoryWorkspace;
  timezone: string;
  now: Date;
  caps: WorkspaceCapabilities;
  /** Re-read the workspace from the server. */
  reload: () => Promise<unknown>;
  /** Politely announce a result to assistive technology. */
  announce: (message: string) => void;
  sectionError: (section: WorkspaceSection) => string | undefined;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside the Story Workspace.");
  return value;
}

/** Cache access for mutations: replace a slice from a response, never guess. */
export function useWorkspaceCache() {
  const queries = useQueryClient();
  const { storyId } = useWorkspace();
  const key = workspaceKey(storyId);
  return {
    read: () => queries.getQueryData<StoryWorkspace>(key),
    write: (update: (data: StoryWorkspace | undefined) => StoryWorkspace | undefined) => queries.setQueryData<StoryWorkspace>(key, update),
    cancel: () => queries.cancelQueries({ queryKey: key }),
    invalidate: () => queries.invalidateQueries({ queryKey: key })
  };
}
