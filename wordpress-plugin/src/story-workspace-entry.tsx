import apiFetch from "@wordpress/api-fetch";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { buttonVariants } from "@byline/newsroom-ui/ui/button";
import { createEditorialRestClient } from "@byline/newsroom-screens/editorial/editorial-rest";
import { StoryWorkspaceApp, useOptionalWorkspace } from "@byline/newsroom-screens/workspace/StoryWorkspace";
import { wordpressMediaPicker } from "./workspace/media-library";
import { createWorkspaceClient } from "@byline/newsroom-screens/workspace/workspace-api";
import { createWordPressCollectionApi } from "./collections/wordpress-collection-api";
import { WordPressCollectionLinks } from "./collections/WordPressCollections";
import { createHomeFetchers, type HomeFetchers } from "@byline/newsroom-screens/home/home-api";
import type { CommandAction, HomeActionUrls } from "@byline/newsroom-screens/home/HomeCommands";
import { workspaceUrlFor } from "@byline/newsroom-screens/home/newsroom-model";
import { ExternalLink, Pencil } from "lucide-react";
import { newsroomSearchUrls, WordPressNewsroomSearch, type PlanningUrls } from "./newsroom-search";
import "./workspace/style.css";

type WorkspaceConfig = {
  nonce: string;
  currentUserId: number;
  storyId: number;
  /** Empty unless a deep link names an appointment. */
  appointmentId: string;
  urls: { planning: PlanningUrls };
  capabilities: { manage?: boolean; editPosts?: boolean };
};
declare global { interface Window { bylineWorkspace?: WorkspaceConfig } }

class WorkspaceBoundary extends Component<{ children: ReactNode; storiesUrl: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="byline-ui-root mr-5 mt-6"><InlineAlert onAction={() => window.location.reload()} actionLabel="Reload"><span>The story workspace couldn't be displayed. <a className={buttonVariants({ variant: "link", size: "xs" })} href={this.props.storiesUrl}>Back to Stories</a></span></InlineAlert></div>
      : this.props.children;
  }
}

function WorkspaceSearch({ fetchers, urls, storiesUrl }: { fetchers: HomeFetchers; urls: HomeActionUrls; storiesUrl: string }) {
  const workspace = useOptionalWorkspace();
  const editUrl = workspace?.caps.editArticle ? workspace.data.story.editUrl : null;
  const previewUrl = workspace?.data.previewUrl;
  const actions: CommandAction[] = [];
  if (editUrl) actions.push({ id: "edit-current-story", label: "Edit current article", icon: Pencil, run: () => window.location.assign(editUrl) });
  if (previewUrl) actions.push({ id: "preview-current-story", label: "Preview current article", icon: ExternalLink, run: () => window.location.assign(previewUrl) });
  return <WordPressNewsroomSearch fetchers={fetchers} urls={urls} onStory={(id) => window.location.assign(workspaceUrlFor(storiesUrl, id))} actions={actions} />;
}

const root = document.getElementById("byline-admin-root");
const config = window.bylineWorkspace;
if (root && config && config.storyId > 0) {
  apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
  const request = <T,>(options: Parameters<typeof apiFetch>[0]) => apiFetch(options) as Promise<T>;
  const storiesUrl = config.urls?.planning?.stories || "admin.php?page=byline-planning&tab=stories";
  const collections = createWordPressCollectionApi(request, config.currentUserId);
  const search = <WorkspaceSearch fetchers={createHomeFetchers(request, {}, config.capabilities, { collections })} urls={newsroomSearchUrls(config.urls?.planning)} storiesUrl={storiesUrl} />;
  createRoot(root).render(<WorkspaceBoundary storiesUrl={storiesUrl}>
    <WordPressCollectionLinks><StoryWorkspaceApp storyId={config.storyId} appointmentId={config.appointmentId || ""} currentUserId={config.currentUserId} storiesUrl={storiesUrl} client={createWorkspaceClient(request, { collections })} headerAction={search} editorial={createEditorialRestClient(request)} media={wordpressMediaPicker} /></WordPressCollectionLinks>
  </WorkspaceBoundary>);
}
