import type { CollectionApi } from "../collections/collection-api";
import type { GetWorkloadHints } from "../editorial/workload-hints";
import type { HomePresetsPayload } from "../home/home-model";
import type { EditorialRestClient } from "../editorial/editorial-rest";
import type { WorkspaceClient } from "../workspace/workspace-api";
import type { StoryWorkspace } from "../workspace/workspace-types";

/** What Story Peek and the New story dialog need, whichever screen mounts them. */
export type StoryFetchers = {
  collections?: CollectionApi;
  /** The Story Workspace read model: the one source for Peek and the full workspace. */
  getWorkspace?: (storyId: number) => Promise<StoryWorkspace>;
  workspace?: WorkspaceClient;
  editorial?: EditorialRestClient;
  /** Creates a draft, optionally from a template preset; resolves with the full workspace payload plus `workspaceUrl`/`template`. */
  createStory?: (title: string, preset?: string, details?: StoryCreateDetails) => Promise<StoryWorkspace>;
  getPresets?: () => Promise<HomePresetsPayload>;
  /** Advisory workload text for the people pickers (editors only). Absent, the pickers show names alone. */
  getWorkloadHints?: GetWorkloadHints;
};

/** New story's optional details (HomePresetsPayload.create says which a host offers). */
export type StoryCreateDetails = { sectionId?: number | null; writerIds?: number[]; deadline?: string | null };

/** The one request body for creating a story, shared by every host. */
export function storyCreateBody(title: string, preset?: string, details: StoryCreateDetails = {}): Record<string, unknown> {
  return {
    title,
    ...(preset ? { preset } : {}),
    ...(details.sectionId ? { sectionId: details.sectionId } : {}),
    ...(details.writerIds?.length ? { writerIds: details.writerIds } : {}),
    ...(details.deadline ? { deadline: details.deadline } : {})
  };
}
