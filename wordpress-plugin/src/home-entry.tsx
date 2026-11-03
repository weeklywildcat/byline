import { legacyHashHref } from "./admin-routing";
import apiFetch from "@wordpress/api-fetch";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { InlineAlert } from "./admin-ui/components/inline-alert";
import { HomeApp } from "./home/HomeApp";
import { createHomeFetchers } from "./home/home-api";
import type { HomeNavigationCapabilities } from "./home/home-model";
import { workspaceUrlFor } from "./home/newsroom-model";
import "./home/style.css";

type HomeConfig = {
  nonce: string;
  currentUserId: number;
  capabilities: HomeNavigationCapabilities;
  urls: {
    planning: { stories: string; calendar: string; media: string; contentHealth: string; feedback: string };
    integrations: { deployment: string };
    settings: { diagnostics: string };
  };
};
declare global { interface Window { bylineHome?: HomeConfig } }

class HomeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="byline-ui-root mr-5 mt-6"><InlineAlert onAction={() => window.location.reload()} actionLabel="Reload Home">Home couldn't be displayed.</InlineAlert></div> : this.props.children;
  }
}

const root = document.getElementById("byline-admin-root");
const config = window.bylineHome;
const legacyTarget = legacyHashHref(window.location.hash, window.location.href);
if (legacyTarget) window.location.replace(legacyTarget);
if (root && config && !legacyTarget) {
  apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
  const fetchers = createHomeFetchers((options) => apiFetch(options), {}, config.capabilities);
  createRoot(root).render(<HomeBoundary><HomeApp fetchers={fetchers} currentUserId={config.currentUserId} actionUrls={{
    planning: config.urls.planning.stories,
    calendar: config.urls.planning.calendar,
    media: config.urls.planning.media,
    upload: config.capabilities.editPosts ? "media-new.php" : undefined,
    contentHealth: config.urls.planning.contentHealth,
    feedback: config.urls.planning.feedback,
    deployment: config.urls.integrations.deployment,
    doctor: config.urls.settings.diagnostics,
    workspace: (storyId) => workspaceUrlFor(config.urls.planning.stories, storyId)
  }} /></HomeBoundary>);
}
