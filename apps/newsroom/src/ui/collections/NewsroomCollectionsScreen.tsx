"use client";

import { CollectionsScreen } from "@byline/newsroom-screens/collections/CollectionsScreen";
import { CollectionHostProvider, type CollectionHost } from "@byline/newsroom-screens/collections/collection-host";
import type { CollectionGuard } from "@byline/newsroom-screens/collections/collection-guard";
import { DEFAULT_COLLECTION_QUERY } from "@byline/newsroom-screens/collections/collection-model";
import { StoryHoverProvider } from "@byline/newsroom-screens/story/StoryHoverCard";
import { StoryPeekHost, useStoryPeek } from "@byline/newsroom-screens/story/StoryPeekHost";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Button } from "@byline/newsroom-ui/ui/button";
import { usePreferences } from "@payloadcms/ui";
import { PanelsTopLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { useBylineMediaPicker } from "../media/MediaWorkspaceShell";
import { useNewsroomRoutes } from "../shell/account";
import { useBylineCreate } from "../shell/create";
import { useShellLayout } from "../shell/layout";
import { useLeaveGuard, useShellNavigation } from "../shell/navigation";
import { useBylineSearch } from "../shell/search";
import { createPayloadPlanningFetchers } from "../stories/payload-planning-fetchers";
import { useCollectionsWorkspace } from "./CollectionsWorkspaceShell";
import { collectionsHistory, useCollectionRoute } from "./collection-route";

type Fetchers = ReturnType<typeof createPayloadHomeFetchers> & ReturnType<typeof createPayloadPlanningFetchers>;

/**
 * Byline Collections (`/admin/collections`): the shared Collections screens
 * inside the Byline shell. The list keeps the ordinary sidebar; an open
 * Collection (`?collection=<id>`) is a focused workspace, with the Collection
 * switcher in the sidebar on wide screens (sidebar-09) or in a sheet. The
 * address is the state (Collection, section, open interview), moved with
 * `history.pushState`, and Back, Forward and leaving all pass the open
 * workspace's unsaved-changes guard.
 */
export function NewsroomCollectionsScreen({ currentUserId }: { currentUserId: number }) {
  const routes = useNewsroomRoutes();
  const { getPreference, setPreference } = usePreferences();
  const fetchers = useMemo<Fetchers>(() => ({ ...createPayloadHomeFetchers(routes.api), ...createPayloadPlanningFetchers(routes.api, { getPreference, setPreference }) }), [routes.api, getPreference, setPreference]);
  return (
    <AdminRoot className="byline-collections" toaster={false}>
      <StoryHoverProvider fetchers={fetchers}>
        <StoryPeekHost fetchers={fetchers} workspaceUrl={routes.story}>
          <main className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-4 px-4 py-6 lg:px-6" data-byline-collections-screen="">
            <CollectionsBody fetchers={fetchers} currentUserId={currentUserId} />
          </main>
        </StoryPeekHost>
      </StoryHoverProvider>
    </AdminRoot>
  );
}

function CollectionsBody({ fetchers, currentUserId }: { fetchers: Fetchers; currentUserId: number }) {
  const routes = useNewsroomRoutes();
  const route = useCollectionRoute();
  const workspace = useCollectionsWorkspace();
  const { openStory } = useStoryPeek();
  const { setStoryOpener } = useBylineSearch();
  const { navigate } = useShellNavigation();
  const { actions, openCreate } = useBylineCreate();
  const { composition } = useShellLayout();
  const media = useBylineMediaPicker();
  const [query, setQuery] = useState(DEFAULT_COLLECTION_QUERY);

  // ⌘K opens a story in this screen's Peek rather than leaving Collections.
  useEffect(() => {
    setStoryOpener(openStory);
    return () => setStoryOpener(null);
  }, [openStory, setStoryOpener]);

  // One guard for the open Collection: the shell's links, the switcher, and Back and Forward all ask it.
  const onGuard = useCallback((guard: CollectionGuard | null) => { workspace.guardRef.current = guard; }, [workspace.guardRef]);
  useEffect(() => () => { workspace.guardRef.current = null; }, [workspace.guardRef]);
  useLeaveGuard(() => {
    const guard = workspace.guardRef.current;
    return { modified: guard?.isDirty() ?? false, saving: false, explicit: true, description: guard?.describe() };
  });
  // Reloading, closing the tab, or Back out of the newsroom document: only the browser's own prompt can ask.
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (workspace.guardRef.current?.isDirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [workspace.guardRef]);
  collectionsHistory.useGuard({
    dirty: () => workspace.guardRef.current?.isDirty() ?? false,
    ask: (proceed) => (workspace.guardRef.current ? workspace.guardRef.current.guard(proceed) : proceed()),
    location: `${route.collectionId ?? ""}:${route.tab}:${route.interviewId ?? ""}`
  });

  const storyHref = useCallback((storyId: number, options?: { appointmentId?: string }) => `${routes.story(storyId)}${options?.appointmentId ? `?appointment=${encodeURIComponent(options.appointmentId)}` : ""}`, [routes]);
  const leave = useCallback((href: string) => {
    const guard = workspace.guardRef.current;
    if (guard) guard.guard(() => navigate(href));
    else navigate(href);
  }, [navigate, workspace.guardRef]);
  const canCreate = actions.some((action) => action.kind === "collection");
  const host = useMemo<CollectionHost>(() => ({
    api: workspace.api,
    fetchers,
    currentUserId,
    openStory,
    storyHref,
    openStoryWorkspace: (storyId, options) => leave(storyHref(storyId, options)),
    onStoryCreated: (created) => navigate(created.workspaceUrl || routes.story(created.story.id)),
    calendarHref: (collectionId) => `${routes.admin}/calendar?collectionId=${collectionId}`,
    openCalendar: (collectionId) => leave(`${routes.admin}/calendar?collectionId=${collectionId}`),
    media,
    activity: false,
    createCollection: canCreate ? () => openCreate("collection") : undefined
  }), [workspace.api, fetchers, currentUserId, openStory, storyHref, leave, navigate, routes, media, canCreate, openCreate]);

  const narrow = route.collectionId !== null && composition !== "collection-workspace";
  return (
    <CollectionHostProvider value={host}>
      <h1 className="sr-only">Collections</h1>
      <CollectionsScreen
        route={route}
        onNavigate={workspace.move}
        query={query}
        onQueryChange={setQuery}
        onGuard={onGuard}
        switcher={
          narrow ? (
            <Button variant="outline" size="sm" className="pointer-coarse:min-h-11" onClick={() => workspace.setSheetOpen(true)} aria-haspopup="dialog" data-byline-switch-collection="">
              <PanelsTopLeft data-icon="inline-start" aria-hidden="true" />
              Switch collection
            </Button>
          ) : undefined
        }
      />
    </CollectionHostProvider>
  );
}
