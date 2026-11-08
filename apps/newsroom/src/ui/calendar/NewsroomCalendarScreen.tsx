"use client";

import { NewsroomCalendar } from "@byline/newsroom-screens/calendar/NewsroomCalendar";
import type { CalendarLinks } from "@byline/newsroom-screens/calendar/calendar-model";
import { describePlanningError, EMPTY_PLANNING_FILTERS } from "@byline/newsroom-screens/planning/planning-model";
import { usePlanningStories } from "@byline/newsroom-screens/planning/planning-query";
import { StoryHoverProvider } from "@byline/newsroom-screens/story/StoryHoverCard";
import { StoryPeekHost, useStoryPeek } from "@byline/newsroom-screens/story/StoryPeekHost";
import { planningRootKey } from "@byline/newsroom-screens/story/story-query";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { useConfig, usePreferences } from "@payloadcms/ui";
import { collectionKey } from "@byline/newsroom-screens/collections/collection-api";
import { useCollectionLinks } from "@byline/newsroom-screens/collections/collection-links";
import { Button } from "@byline/newsroom-ui/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useCollectionsWorkspace } from "../collections/CollectionsWorkspaceShell";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { atLeast } from "../../access/user";
import { useNewsroomAccount, useNewsroomRoutes } from "../shell/account";
import { useShellLayout } from "../shell/layout";
import { useShellNavigation } from "../shell/navigation";
import { useBylineSearch } from "../shell/search";
import { useNewsroomTimeZone } from "../shell/timezone";
import { createPayloadPlanningFetchers } from "../stories/payload-planning-fetchers";
import { canReschedule, rescheduleRequest } from "./payload-reschedule";

type Fetchers = ReturnType<typeof createPayloadHomeFetchers> & ReturnType<typeof createPayloadPlanningFetchers>;

/**
 * Byline Calendar (`/admin/calendar`): the shared newsroom Calendar
 * (Schedule-X) inside the Byline shell. The shell owns the query cache, the
 * Calendar workspace (date, filters, view) and, on wide screens, the
 * contextual pane with the Calendar's controls; this screen supplies the
 * Payload fetchers, the one Story Peek and the Story screen's addresses.
 */
export function NewsroomCalendarScreen({ currentUserId }: { currentUserId: number }) {
  const { config } = useConfig();
  const { getPreference, setPreference } = usePreferences();
  const api = config.routes.api;
  const admin = config.routes.admin;
  const fetchers = useMemo<Fetchers>(() => ({ ...createPayloadHomeFetchers(api), ...createPayloadPlanningFetchers(api, { getPreference, setPreference }) }), [api, getPreference, setPreference]);
  const storyUrl = useMemo(() => (storyId: number) => `${admin}/collections/stories/${storyId}`, [admin]);

  // Byline's scoped Nova styles; the shell owns the one toaster.
  return (
    <AdminRoot className="byline-calendar" toaster={false}>
      <StoryHoverProvider fetchers={fetchers}>
        <StoryPeekHost fetchers={fetchers} workspaceUrl={storyUrl}>
          <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6" data-byline-calendar-screen="">
            <h1 className="sr-only">Calendar</h1>
            <CalendarBody fetchers={fetchers} currentUserId={currentUserId} admin={admin} />
          </main>
        </StoryPeekHost>
      </StoryHoverProvider>
    </AdminRoot>
  );
}

function CalendarBody({ fetchers, currentUserId, admin }: { fetchers: Fetchers; currentUserId: number; admin: string }) {
  const { openStory } = useStoryPeek();
  const { setStoryOpener } = useBylineSearch();
  const { navigate } = useShellNavigation();
  const { composition } = useShellLayout();
  const { state, isMobile } = useSidebar();
  const timezone = useNewsroomTimeZone();
  const client = useQueryClient();
  const account = useNewsroomAccount();
  const { api } = useNewsroomRoutes();
  const isEditor = atLeast(account, "editor");
  // Dragging an event to another day saves through the record that owns the date; the server has the final word.
  const reschedule = useMemo(() => ({ can: (kind: Parameters<typeof canReschedule>[0]) => canReschedule(kind, isEditor), apply: rescheduleRequest(api) }), [api, isEditor]);

  // ⌘K opens a story in this screen's Peek rather than leaving the Calendar.
  useEffect(() => {
    setStoryOpener(openStory);
    return () => setStoryOpener(null);
  }, [openStory, setStoryOpener]);

  // Arriving re-reads the stories: dates may have changed on a Story screen, whose edits use their own cache.
  useEffect(() => { void client.invalidateQueries({ queryKey: planningRootKey }); }, [client]);

  // `?collectionId=` scopes the Calendar to one Collection's work (`collection=`/`coverage=` were earlier names).
  const params = useSearchParams();
  const scope = Number(params?.get("collectionId") ?? params?.get("collection") ?? params?.get("coverage") ?? "");
  const collectionId = Number.isSafeInteger(scope) && scope > 0 ? scope : undefined;
  const collections = useCollectionsWorkspace();
  const collectionLinks = useCollectionLinks();
  const scoped = useQuery({ queryKey: collectionKey(collectionId ?? 0), queryFn: () => collections.api.detail(collectionId!), enabled: collectionId !== undefined, retry: false });

  // Story dates (deadline, planned publication, publication) from the Stories this account can see (in the Collection, when scoped).
  const filters = useMemo(() => (collectionId ? { ...EMPTY_PLANNING_FILTERS, collectionId } : EMPTY_PLANNING_FILTERS), [collectionId]);
  const planning = usePlanningStories(fetchers, filters);

  const links = useMemo<CalendarLinks>(() => ({
    // The Story screen opens Plan at the appointment when `appointment=` is present.
    story: (storyId, appointmentId) => `${admin}/collections/stories/${storyId}${appointmentId ? `?appointment=${encodeURIComponent(appointmentId)}` : ""}`,
    // A shared interview opens in its Collection's Reporting; a Collection task in its Tasks.
    collection: (id, interviewId) => collectionLinks.href?.(id, interviewId ? { interviewId } : { tab: "tasks" }) ?? `${admin}/collections?collection=${id}`
  }), [admin, collectionLinks]);

  // The controls live in the contextual pane while it is showing; otherwise the toolbar offers them in a sheet.
  const paneShowing = composition === "calendar-workspace" && state === "expanded" && !isMobile;

  return (
    <>
      {collectionId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-byline-calendar-scope="">
          <span>
            Showing <a className="font-medium underline" href={collectionLinks.href?.(collectionId)} onClick={(event) => { if (!collectionLinks.open || event.metaKey || event.ctrlKey) return; event.preventDefault(); collectionLinks.open(collectionId); }}>{scoped.data?.collection.name ?? "one Collection"}</a>: its stories, shared interviews and tasks.
          </span>
          <Button variant="ghost" size="sm" onClick={() => navigate(`${admin}/calendar`)}>Show the whole newsroom</Button>
        </div>
      ) : null}
      {planning.isError && !planning.data ? <InlineAlert onAction={() => void planning.refetch()}>{describePlanningError(planning.error, "Story dates could not be loaded. Appointments and production are still shown.")}</InlineAlert> : null}
      <NewsroomCalendar
        stories={planning.data?.stories ?? []}
        timezone={timezone}
        getSchedule={fetchers.getSchedule}
        collectionId={collectionId}
        currentUserId={currentUserId}
        links={links}
        onOpenStory={openStory}
        controls={paneShowing ? "external" : "sheet"}
        navigate={navigate}
        reschedule={reschedule}
      />
    </>
  );
}
