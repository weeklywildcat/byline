"use client";

import type { StoryPresentationEntry, StoryPresentationHost, VisualStoryClient } from "@byline/story-presentations";
import { useEffect, useMemo, useState } from "react";

/**
 * The newsroom's (Next.js) host adapter for a repository story's own assets.
 * The registry, resolver, `StoryArticle` and the stories themselves are the
 * shared package's; only loading differs per bundler (the public site's Vite
 * adapter is apps/web/lib/story-presentation-host.tsx). A story's stylesheet
 * and `client.ts` are separate dynamic chunks, requested only when that story
 * is the one being previewed, so ordinary stories never download a flagship's
 * CSS or JS.
 */
const loadStyles = (name: string) => import(`../../../../packages/story-presentations/src/stories/${name}/styles.css`);
const loadClient = (name: string) => import(`../../../../packages/story-presentations/src/stories/${name}/client.ts`) as Promise<{ default: VisualStoryClient }>;

/** Stylesheets arrive as side effects of loading their chunk, so the host prints nothing itself. */
const HOST: StoryPresentationHost = { styles: () => null };

export function useStoryAssets(entry: StoryPresentationEntry | null): { host: StoryPresentationHost; ready: boolean } {
  const name = entry?.name ?? null;
  const visual = entry?.kind === "visual-story";
  const [loaded, setLoaded] = useState<string | null>(null);
  const ready = name === null || loaded === name;

  useEffect(() => {
    if (!name) return;
    let live = true;
    // A story may have no stylesheet; that is not an error.
    loadStyles(name).catch(() => undefined).finally(() => live && setLoaded(name));
    return () => {
      live = false;
    };
  }, [name]);

  // A flagship visual story's progressive enhancement, once its narrative is on the page.
  useEffect(() => {
    if (!name || !visual || !ready) return;
    const root = document.querySelector<HTMLElement>(`[data-visual-story="${name}"]`);
    if (!root) return;
    let live = true;
    let cleanup: void | (() => void);
    loadClient(name).then((module) => {
      if (live) cleanup = module.default(root);
    }).catch(() => undefined);
    return () => {
      live = false;
      if (typeof cleanup === "function") cleanup();
    };
  }, [name, visual, ready]);

  return useMemo(() => ({ host: HOST, ready }), [ready]);
}
