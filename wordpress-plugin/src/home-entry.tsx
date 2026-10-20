import apiFetch from "@wordpress/api-fetch";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HomeApp } from "./home/HomeApp";
import { createHomeFetchers } from "./home/home-api";
import type { HomeNavigationCapabilities } from "./home/home-model";
import "./home/style.css";

type HomeConfig = {
  nonce: string;
  currentUserId: number;
  capabilities: HomeNavigationCapabilities;
  urls: {
    planning: { stories: string; calendar: string; contentHealth: string; feedback: string };
    integrations: { deployment: string };
    settings: { diagnostics: string };
  };
};
declare global { interface Window { bylineHome?: HomeConfig } }

class HomeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="byline-home-root"><p className="home-inline-error" role="alert">Home couldn't be displayed. <button type="button" onClick={() => window.location.reload()}>Reload Home</button></p></div> : this.props.children;
  }
}

const root = document.getElementById("byline-admin-root");
const config = window.bylineHome;
if (root && config) {
  apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
  const fetchers = createHomeFetchers((options) => apiFetch(options), {}, config.capabilities);
  createRoot(root).render(<HomeBoundary><HomeApp fetchers={fetchers} currentUserId={config.currentUserId} actionUrls={{
    planning: config.urls.planning.stories,
    calendar: config.urls.planning.calendar,
    upload: config.capabilities.editPosts ? "media-new.php" : undefined,
    contentHealth: config.urls.planning.contentHealth,
    feedback: config.urls.planning.feedback,
    deployment: config.urls.integrations.deployment,
    doctor: config.urls.settings.diagnostics
  }} /></HomeBoundary>);
}
