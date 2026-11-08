import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStoryPeek } from "@byline/newsroom-screens/story/StoryPeekHost";
import { CollectionsScreen } from "@byline/newsroom-screens/collections/CollectionsScreen";
import { CollectionDialog } from "@byline/newsroom-screens/collections/CollectionDialog";
import { CollectionHostProvider, type CollectionHost } from "@byline/newsroom-screens/collections/collection-host";
import { CollectionLinksProvider, type CollectionLinks } from "@byline/newsroom-screens/collections/collection-links";
import { collectionsKey } from "@byline/newsroom-screens/collections/collection-api";
import type { CollectionGuard } from "@byline/newsroom-screens/collections/collection-guard";
import { collectionRoute, type CollectionRoute } from "@byline/newsroom-screens/collections/collection-model";
import type { PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { wordpressMediaPicker } from "../workspace/media-library";
import { wordpressCollectionHref } from "./wordpress-collection-api";

/** A Story Workspace address (planning/calendar-host.tsx builds it); `appointmentId` opens that appointment. */
type WorkspaceUrl = (storyId: number, appointmentId?: string) => string;

const INDEX_URL = "admin.php?page=byline-planning&tab=collections";

function routeFromLocation(): CollectionRoute {
  const params = new URLSearchParams(window.location.search);
  return collectionRoute({ collection: params.get("collection"), tab: params.get("section"), interview: params.get("interview") });
}

const hrefFor = (route: CollectionRoute) =>
  route.collectionId ? wordpressCollectionHref(route.collectionId, { tab: route.tab, ...(route.interviewId ? { interviewId: route.interviewId } : {}) }) : INDEX_URL;

/** WordPress's Collection addresses for the shared screens (Story Peek, Home, the Story workspace). */
export const wordpressCollectionLinks: CollectionLinks = {
  href: wordpressCollectionHref,
  open: (id, options) => window.location.assign(wordpressCollectionHref(id, options)),
};

export function WordPressCollectionLinks({ children }: { children: ReactNode }) {
  return <CollectionLinksProvider value={wordpressCollectionLinks}>{children}</CollectionLinksProvider>;
}

/**
 * WordPress's host for the shared Collections screens, on its Planning page:
 * wp-admin addresses (`section=`, since `tab` is Planning's own), Story Peek,
 * the Story Workspace, the WordPress Media Library and the Collection
 * activity list WordPress keeps.
 */
export function WordPressCollections({ fetchers, currentUserId, workspaceUrl }: { fetchers: PlanningFetchers & StoryFetchers; currentUserId: number | null; workspaceUrl: WorkspaceUrl }) {
  const { openStory } = useStoryPeek();
  const client = useQueryClient();
  const [route, setRoute] = useState(routeFromLocation);
  const [creating, setCreating] = useState(false);
  const guard = useRef<CollectionGuard | null>(null);
  useEffect(() => {
    const pop = () => setRoute(routeFromLocation());
    // Leaving wp-admin (or reloading) with an unsaved brief, interview or public presentation asks first.
    const unload = (event: BeforeUnloadEvent) => {
      if (guard.current?.isDirty()) event.preventDefault();
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  const navigate = useCallback((next: CollectionRoute, options: { replace?: boolean } = {}) => {
    const href = hrefFor(next);
    if (options.replace) window.history.replaceState({}, "", href);
    else window.history.pushState({}, "", href);
    setRoute(next);
  }, []);
  const api = fetchers.collections!;
  const host = useMemo<CollectionHost>(
    () => ({
      api,
      fetchers,
      currentUserId,
      openStory,
      storyHref: (storyId, options) => workspaceUrl(storyId, options?.appointmentId),
      openStoryWorkspace: (storyId, options) => window.location.assign(workspaceUrl(storyId, options?.appointmentId)),
      onStoryCreated: (created) => window.location.assign(created.workspaceUrl || workspaceUrl(created.story.id)),
      calendarHref: (collectionId) => `admin.php?page=byline-planning&tab=calendar&collection=${collectionId}`,
      media: wordpressMediaPicker,
      activity: true,
      createCollection: () => setCreating(true),
    }),
    [api, fetchers, currentUserId, openStory, workspaceUrl],
  );
  return (
    <CollectionHostProvider value={host}>
      <CollectionsScreen route={route} onNavigate={navigate} onGuard={(next) => { guard.current = next; }} />
      {creating ? (
        <CollectionDialog
          api={api}
          onClose={() => setCreating(false)}
          onSaved={(collection) => {
            setCreating(false);
            void client.invalidateQueries({ queryKey: collectionsKey });
            navigate({ collectionId: collection.id, tab: "overview", interviewId: null });
          }}
        />
      ) : null}
    </CollectionHostProvider>
  );
}
