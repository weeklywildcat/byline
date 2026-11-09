/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  StoryArticle as SharedStoryArticle,
  findStoryPresentation,
  storyPresentationRegistry,
  type StoryArticleProps,
  type StoryPresentationHost
} from "@byline/story-presentations";

/**
 * The public site's host for `@byline/story-presentations`. The article
 * component, registry and resolver are shared with the newsroom's Live
 * Preview; what is Vite-specific lives here: a story's stylesheet is read as a
 * string at build time and printed with that story only, so it never joins the
 * sitewide bundle every article loads.
 */
const stylesheets = import.meta.glob<string>("../../../packages/story-presentations/src/stories/*/styles.css", { query: "?inline", import: "default", eager: true });

function storyStylesheet(name: string): string | null {
  return stylesheets[`../../../packages/story-presentations/src/stories/${name}/styles.css`] ?? null;
}

export const publicStoryHost: StoryPresentationHost = {
  styles: (name): ReactNode => {
    const css = storyStylesheet(name);
    return css ? <style data-story-presentation={name} dangerouslySetInnerHTML={{ __html: css }} /> : null;
  }
};

/** The fixture build (`BYLINE_CONTENT_MODE=weekly-wildcat-fixture`) also renders the fixture presentations. */
export function publicStoryRegistry() {
  const mode = process.env.BYLINE_CONTENT_MODE;
  return storyPresentationRegistry({ fixtures: mode === "weekly-wildcat-fixture" || mode === "weekly-wildcat-browser-fixture" });
}

/** The repository presentation registered for a story on the public site, or `null`. */
export function getStoryPresentation(storyId: number | string) {
  return findStoryPresentation(publicStoryRegistry(), storyId);
}

/** The shared `StoryArticle` with the public registry and this host. */
export function StoryArticle(props: Omit<StoryArticleProps, "registry" | "host">): ReactNode {
  return <SharedStoryArticle {...props} registry={publicStoryRegistry()} host={publicStoryHost} />;
}
