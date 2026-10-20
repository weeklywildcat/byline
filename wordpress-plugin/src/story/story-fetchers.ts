import type { PlanningRequestOptions } from "../planning/planning-api";
import type { HomePresetsPayload } from "../home/home-model";
import { createEditorialRestClient, type EditorialRestClient } from "../editorial/editorial-rest";
import { createWorkspaceClient, type WorkspaceClient } from "../workspace/workspace-api";
import type { StoryWorkspace } from "../workspace/workspace-types";

export type StoryRequest = <T>(options: PlanningRequestOptions) => Promise<T>;

/** What Story Peek and the New story dialog need, whichever screen mounts them. */
export type StoryFetchers = {
  /** The Story Workspace read model: the one source for Peek and the full workspace. */
  getWorkspace?: (storyId: number) => Promise<StoryWorkspace>;
  workspace?: WorkspaceClient;
  editorial?: EditorialRestClient;
  /** Creates a draft, optionally from a template preset; resolves with the full workspace payload plus `workspaceUrl`/`template`. */
  createStory?: (title: string, preset?: string) => Promise<StoryWorkspace>;
  getPresets?: () => Promise<HomePresetsPayload>;
};

export type StoryCapabilities = { editPosts?: boolean; manage?: boolean };

/**
 * The capability checks keep known-forbidden requests out of the browser while
 * the server remains the final authorization boundary.
 */
export function createStoryFetchers(request: StoryRequest, capabilities: StoryCapabilities = {}, paths: { presets?: string } = {}): StoryFetchers {
  const fetchers: StoryFetchers = {};
  if (capabilities.editPosts !== false) {
    fetchers.workspace = createWorkspaceClient(request);
    fetchers.getWorkspace = fetchers.workspace.getWorkspace;
    fetchers.createStory = (title, preset) => request<StoryWorkspace>({ path: "/byline/v1/editorial/stories", method: "POST", data: preset ? { title, preset } : { title } });
    fetchers.editorial = createEditorialRestClient(request);
  }
  if (capabilities.editPosts !== false || capabilities.manage) {
    fetchers.getPresets = () => request<HomePresetsPayload>({ path: paths.presets || "/byline/v1/editorial/presets" });
  }
  return fetchers;
}
