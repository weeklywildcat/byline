import apiFetch from "@wordpress/api-fetch";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { InlineAlert } from "./admin-ui/components/inline-alert";
import { PlanningApp, createPlanningFetchers } from "./planning";
import { createStoryFetchers } from "./story/story-fetchers";
import "./planning/style.css";

type PlanningConfig = {
  nonce: string;
  /** wp_localize_script delivers top-level scalars as strings. */
  currentUserId: number | string;
  tab: string;
  view: string;
  capabilities: { manage?: boolean; editPosts?: boolean };
  urls: { planning: { stories: string; calendar?: string; media?: string; coverage?: string; performance?: string; contentHealth?: string; feedback?: string } };
};
declare global { interface Window { bylinePlanning?: PlanningConfig } }

class PlanningBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="byline-ui-root mr-5 mt-6"><InlineAlert onAction={() => window.location.reload()} actionLabel="Reload">Planning couldn't be displayed.</InlineAlert></div> : this.props.children;
  }
}

const root = document.getElementById("byline-admin-root");
const config = window.bylinePlanning;
if (root && config) {
  apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
  const request = <T,>(options: Parameters<typeof apiFetch>[0]) => apiFetch(options) as Promise<T>;
  const fetchers = { ...createPlanningFetchers(request), ...createStoryFetchers(request, config.capabilities) };
  createRoot(root).render(<PlanningBoundary>
    <PlanningApp
      fetchers={fetchers}
      tab={config.tab}
      view={config.view}
      currentUserId={Number(config.currentUserId) || null}
      storiesUrl={config.urls?.planning?.stories || "admin.php?page=byline-planning&tab=stories"}
      mine={new URLSearchParams(window.location.search).get("mine") === "1"}
      commandUrls={{
        stories: config.urls?.planning?.stories,
        calendar: config.urls?.planning?.calendar,
        media: config.urls?.planning?.media,
        coverage: config.urls?.planning?.coverage,
        performance: config.urls?.planning?.performance,
        contentHealth: config.urls?.planning?.contentHealth,
        feedback: config.urls?.planning?.feedback,
        upload: config.capabilities.editPosts ? "media-new.php" : undefined
      }}
    />
  </PlanningBoundary>);
}
