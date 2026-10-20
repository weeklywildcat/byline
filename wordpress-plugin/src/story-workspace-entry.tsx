import apiFetch from "@wordpress/api-fetch";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { InlineAlert } from "./admin-ui/components/inline-alert";
import { buttonVariants } from "./admin-ui/ui/button";
import { createEditorialRestClient } from "./editorial/editorial-rest";
import { StoryWorkspaceApp } from "./workspace/StoryWorkspace";
import { createWorkspaceClient } from "./workspace/workspace-api";
import "./workspace/style.css";

type WorkspaceConfig = {
  nonce: string;
  currentUserId: number;
  storyId: number;
  /** Empty unless a deep link names an appointment. */
  appointmentId: string;
  urls: { planning: { stories: string; calendar?: string; media?: string; coverage?: string; performance?: string; contentHealth?: string; feedback?: string } };
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

const root = document.getElementById("byline-admin-root");
const config = window.bylineWorkspace;
if (root && config && config.storyId > 0) {
  apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
  const request = <T,>(options: Parameters<typeof apiFetch>[0]) => apiFetch(options) as Promise<T>;
  const storiesUrl = config.urls?.planning?.stories || "admin.php?page=byline-planning&tab=stories";
  createRoot(root).render(<WorkspaceBoundary storiesUrl={storiesUrl}>
    <StoryWorkspaceApp
      storyId={config.storyId}
      appointmentId={config.appointmentId || ""}
      currentUserId={config.currentUserId}
      storiesUrl={storiesUrl}
      client={createWorkspaceClient(request)}
      editorial={createEditorialRestClient(request)}
      searchStories={(query) => request({ path: `/byline/v1/editorial/home/search?query=${encodeURIComponent(query)}` })}
      commandUrls={{
        stories: config.urls?.planning?.stories,
        calendar: config.urls?.planning?.calendar,
        media: config.urls?.planning?.media,
        coverage: config.urls?.planning?.coverage,
        performance: config.urls?.planning?.performance,
        contentHealth: config.urls?.planning?.contentHealth,
        feedback: config.urls?.planning?.feedback,
        upload: "media-new.php"
      }}
    />
  </WorkspaceBoundary>);
}
