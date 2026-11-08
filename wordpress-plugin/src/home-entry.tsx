import { legacyHashHref } from "./admin-routing";
import apiFetch from "@wordpress/api-fetch";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { HomeApp } from "@byline/newsroom-screens/home/HomeApp";
import { createHomeFetchers } from "@byline/newsroom-screens/home/home-api";
import type { HomeNavigationCapabilities } from "@byline/newsroom-screens/home/home-model";
import { workspaceUrlFor } from "@byline/newsroom-screens/home/newsroom-model";
import { localHomePreferences } from "@byline/newsroom-screens/home/desk-model";
import { createWordPressCollectionApi } from "./collections/wordpress-collection-api";
import { WordPressCollectionLinks } from "./collections/WordPressCollections";
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
  const fetchers = createHomeFetchers((options) => apiFetch(options), {}, config.capabilities, { collections: createWordPressCollectionApi((options) => apiFetch(options), config.currentUserId) });
  // The Mine | Newsroom choice is remembered in this browser, as the Calendar view is.
  const preferences = localHomePreferences(window.localStorage);
  createRoot(root).render(<HomeBoundary><WordPressCollectionLinks><HomeApp fetchers={fetchers} currentUserId={config.currentUserId} preferences={preferences} actionUrls={{
    planning: config.urls.planning.stories,
    calendar: config.urls.planning.calendar,
    media: config.urls.planning.media,
    upload: config.capabilities.editPosts ? "media-new.php" : undefined,
    contentHealth: config.urls.planning.contentHealth,
    feedback: config.urls.planning.feedback,
    deployment: config.urls.integrations.deployment,
    doctor: config.urls.settings.diagnostics,
    workspace: (storyId) => workspaceUrlFor(config.urls.planning.stories, storyId)
  }} /></WordPressCollectionLinks></HomeBoundary>);
}
