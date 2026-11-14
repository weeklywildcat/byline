"use client";

import type { PlanningFilters } from "@byline/newsroom-screens/planning/planning-model";
import { StoriesNavigator } from "@byline/newsroom-screens/planning/StoriesNavigator";
import { StoriesPage } from "@byline/newsroom-screens/planning/StoriesPage";
import { useStoriesWorkspace } from "@byline/newsroom-screens/planning/stories-workspace-context";
import { preferredStoriesView, storiesViewFromRoute, type StoriesView } from "@byline/newsroom-screens/planning/stories-view";
import { StoryPeekHost, useStoryPeek } from "@byline/newsroom-screens/story/StoryPeekHost";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { useConfig, usePreferences } from "@payloadcms/ui";
import { PanelLeft } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useShellLayout } from "../shell/layout";
import { useBylineSearch } from "../shell/search";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { useStoryPreload } from "../story/preload";
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
 * toasts (so Stories shows no New story of its own); this host supplies the
 * Payload fetchers, the one Story Peek, and the Story screen's address. No
 * calendar yet, so Stories offers Board and List. The filters live in the
 * shell's Stories workspace: on a wide screen its pane shows the views (so
 * the page's views picker steps aside); narrower screens keep the picker and
 * open the same pane in a Views sheet.
 */
export function NewsroomStories({ currentUserId, view, initialFilters }: NewsroomStoriesProps) {
  const { config } = useConfig();
  const { getPreference, setPreference } = usePreferences();
  const api = config.routes.api;
  const admin = config.routes.admin;
  const fetchers = useMemo(() => ({ ...createPayloadHomeFetchers(api), ...createPayloadPlanningFetchers(api, { getPreference, setPreference }) }), [api, getPreference, setPreference]);
  const workspaceUrl = useMemo(() => (storyId: number) => `${admin}/collections/stories/${storyId}`, [admin]);
  const preloadStory = useStoryPreload(fetchers, workspaceUrl);
  // The reader's last view lives in this browser, so the screen decides it once it is in one.
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  const initialView: StoriesView | null = inBrowser ? (storiesViewFromRoute(view) ?? preferredStoriesView("board", window.localStorage)) : null;

  // Byline's scoped Nova styles; the shell owns the one toaster.
  return (
    <AdminRoot className="byline-stories" toaster={false}>
      <StoryPeekHost fetchers={fetchers} workspaceUrl={workspaceUrl} preloadStory={preloadStory}>
        <main className="@container/planning mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6">
          {initialView ? <StoriesBody fetchers={fetchers} currentUserId={currentUserId} initialView={initialView} initialFilters={initialFilters} workspaceUrl={workspaceUrl} /> : <StoriesPlaceholder />}
        </main>
      </StoryPeekHost>
    </AdminRoot>
  );
}

function StoriesBody({ fetchers, currentUserId, initialView, initialFilters, workspaceUrl }: { fetchers: Parameters<typeof StoriesPage>[0]["fetchers"]; currentUserId: number; initialView: StoriesView; initialFilters?: Partial<PlanningFilters>; workspaceUrl: (storyId: number) => string }) {
  const { openStory } = useStoryPeek();
  const { setStoryOpener } = useBylineSearch();
  const workspace = useStoriesWorkspace();
  const paneOwnsViews = useStoriesPaneShowing();
  // ⌘K opens a story in this screen's Peek rather than leaving Stories.
  useEffect(() => {
    setStoryOpener(openStory);
    return () => setStoryOpener(null);
  }, [openStory, setStoryOpener]);
  // No page-level New story: the shell's Create is already beside it.
  return <StoriesPage fetchers={fetchers} currentUserId={currentUserId} initialView={initialView} initialFilters={initialFilters} workspaceUrl={workspaceUrl} workspace={workspace} showViewsPicker={!paneOwnsViews} viewsControl={paneOwnsViews ? undefined : <StoriesViewsSheet />} />;
}

/** Whether the Stories workspace's pane is on screen (wide enough, and the sidebar not collapsed to its rail). */
function useStoriesPaneShowing(): boolean {
  const { composition } = useShellLayout();
  const { state, isMobile } = useSidebar();
  return composition === "stories-workspace" && state === "expanded" && !isMobile;
}

/** The narrow screens' Stories views: the same StoriesNavigator as the pane, in a sheet that closes once a view is chosen. */
function StoriesViewsSheet() {
  const workspace = useStoriesWorkspace();
  const [open, setOpen] = useState(false);
  const paneShowing = useStoriesPaneShowing();
  // The pane took over (the window grew): never two navigators at once.
  useEffect(() => { if (paneShowing && open) setOpen(false); }, [paneShowing, open]);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog" data-stories-views-sheet-trigger="">
        <PanelLeft data-icon="inline-start" aria-hidden="true" />Views
      </Button>
      <Sheet open={open && !paneShowing} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[20rem] max-w-[calc(100vw-2.5rem)] gap-0 overflow-y-auto bg-sidebar p-0 text-sidebar-foreground data-[side=left]:sm:max-w-[20rem]" data-stories-views-sheet="">
          <SheetHeader className="border-b border-sidebar-border p-4 pr-12">
            <SheetTitle className="text-base font-medium text-foreground">Stories</SheetTitle>
            <SheetDescription className="sr-only">Views, stages and writers, each with its count.</SheetDescription>
          </SheetHeader>
          <StoriesNavigator workspace={workspace} onChosen={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
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
