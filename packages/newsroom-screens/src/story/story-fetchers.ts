import type { CollectionApi } from "../collections/collection-api";
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
  createStory?: (title: string, preset?: string) => Promise<StoryWorkspace>;
  getPresets?: () => Promise<HomePresetsPayload>;
};
