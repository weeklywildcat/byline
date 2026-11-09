/// <reference types="vite/client" />
import type { ReactNode } from "react";
import { renderRepositoryTracker, type RepositoryTrackerRegistry } from "@byline/story-presentations/trackers";

/**
 * Repository Trackers on the public site: the registered tracker's
 * server-rendered content, with its own `styles.css` printed beside it (read
 * at build time, as a story presentation's is), so a tracker's CSS reaches
 * only the stories that place it and never joins the sitewide bundle.
 */
const stylesheets = import.meta.glob<string>("../../../packages/story-presentations/src/trackers/*/styles.css", { query: "?inline", import: "default", eager: true });

export function trackerStylesheet(key: string): string | null {
  return stylesheets[`../../../packages/story-presentations/src/trackers/${key}/styles.css`] ?? null;
}

export function renderPublicTracker(registry: RepositoryTrackerRegistry) {
  const render = renderRepositoryTracker(registry);
  return (block: { key: string; title: string; description: string }): ReactNode => {
    const css = registry[block.key]?.styles ? trackerStylesheet(block.key) : null;
    return (
      <>
        {css ? <style data-repository-tracker-styles={block.key} dangerouslySetInnerHTML={{ __html: css }} /> : null}
        {render(block)}
      </>
    );
  };
}
