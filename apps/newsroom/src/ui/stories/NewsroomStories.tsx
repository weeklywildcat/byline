"use client";

import type { PlanningFilters } from "@byline/newsroom-screens/planning/planning-model";
import { StoriesPage } from "@byline/newsroom-screens/planning/StoriesPage";
import { preferredStoriesView, storiesViewFromRoute, type StoriesView } from "@byline/newsroom-screens/planning/stories-view";
import { StoryHoverProvider } from "@byline/newsroom-screens/story/StoryHoverCard";
import { StoryPeekHost, useStoryPeek } from "@byline/newsroom-screens/story/StoryPeekHost";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { useConfig, usePreferences } from "@payloadcms/ui";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useBylineCreate } from "../shell/create";
import { useBylineSearch } from "../shell/search";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { createPayloadPlanningFetchers } from "./payload-planning-fetchers";

export type NewsroomStoriesProps = {
  currentUserId: number;
  /** `view=` from the address, when it names one. */
  view?: string;
  initialFilters?: Partial<PlanningFilters>;
};

const subscribeNever = () => () => {};

/**
 * Byline Stories (`/admin/stories`): the shared StoriesPage, Board and List,
 * inside the Byline shell. The shell owns the query cache, Create, Search and
 * toasts; this host supplies the Payload fetchers, the one Story Peek, and the
 * Story screen's address. No calendar yet, so Stories offers Board and List.
 */
export function NewsroomStories({ currentUserId, view, initialFilters }: NewsroomStoriesProps) {
  const { config } = useConfig();
  const { getPreference, setPreference } = usePreferences();
  const api = config.routes.api;
  const admin = config.routes.admin;
  const fetchers = useMemo(() => ({ ...createPayloadHomeFetchers(api), ...createPayloadPlanningFetchers(api, { getPreference, setPreference }) }), [api, getPreference, setPreference]);
  const workspaceUrl = useMemo(() => (storyId: number) => `${admin}/collections/stories/${storyId}`, [admin]);
  // The reader's last view lives in this browser, so the screen decides it once it is in one.
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  const initialView: StoriesView | null = inBrowser ? (storiesViewFromRoute(view) ?? preferredStoriesView("board", window.localStorage)) : null;

  // Byline's scoped Nova styles; the shell owns the one toaster.
  return (
    <AdminRoot className="byline-stories" toaster={false}>
      <StoryHoverProvider fetchers={fetchers}>
        <StoryPeekHost fetchers={fetchers} workspaceUrl={workspaceUrl}>
          <main className="@container/planning mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6">
            {initialView ? <StoriesBody fetchers={fetchers} currentUserId={currentUserId} initialView={initialView} initialFilters={initialFilters} workspaceUrl={workspaceUrl} /> : <StoriesPlaceholder />}
          </main>
        </StoryPeekHost>
      </StoryHoverProvider>
    </AdminRoot>
  );
}

function StoriesBody({ fetchers, currentUserId, initialView, initialFilters, workspaceUrl }: { fetchers: Parameters<typeof StoriesPage>[0]["fetchers"]; currentUserId: number; initialView: StoriesView; initialFilters?: Partial<PlanningFilters>; workspaceUrl: (storyId: number) => string }) {
  const { openStory } = useStoryPeek();
  const { openCreate } = useBylineCreate();
  const { setStoryOpener } = useBylineSearch();
  // ⌘K opens a story in this screen's Peek rather than leaving Stories.
  useEffect(() => {
    setStoryOpener(openStory);
    return () => setStoryOpener(null);
  }, [openStory, setStoryOpener]);
  return <StoriesPage fetchers={fetchers} currentUserId={currentUserId} initialView={initialView} initialFilters={initialFilters} workspaceUrl={workspaceUrl} onNewStory={() => openCreate("story")} />;
}

function StoriesPlaceholder() {
  return (
    <div role="status" aria-label="Loading stories" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
