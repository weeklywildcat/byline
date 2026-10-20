import apiFetch from "@wordpress/api-fetch";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
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
  urls: { planning: { stories: string } };
};
declare global { interface Window { bylineWorkspace?: WorkspaceConfig } }

class WorkspaceBoundary extends Component<{ children: ReactNode; storiesUrl: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="byline-home-root story-workspace-root"><p className="ws-inline-error" role="alert">The story workspace couldn't be displayed. <button type="button" onClick={() => window.location.reload()}>Reload</button> <a href={this.props.storiesUrl}>Back to Stories</a></p></div>
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
    <StoryWorkspaceApp storyId={config.storyId} appointmentId={config.appointmentId || ""} currentUserId={config.currentUserId} storiesUrl={storiesUrl} client={createWorkspaceClient(request)} editorial={createEditorialRestClient(request)} />
  </WorkspaceBoundary>);
}
