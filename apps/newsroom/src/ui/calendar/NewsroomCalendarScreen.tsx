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
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { useShellLayout } from "../shell/layout";
import { useShellNavigation } from "../shell/navigation";
import { useBylineSearch } from "../shell/search";
import { useNewsroomTimeZone } from "../shell/timezone";
import { createPayloadPlanningFetchers } from "../stories/payload-planning-fetchers";

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

  // ⌘K opens a story in this screen's Peek rather than leaving the Calendar.
  useEffect(() => {
    setStoryOpener(openStory);
    return () => setStoryOpener(null);
  }, [openStory, setStoryOpener]);

  // Arriving re-reads the stories: dates may have changed on a Story screen, whose edits use their own cache.
  useEffect(() => { void client.invalidateQueries({ queryKey: planningRootKey }); }, [client]);

  // Story dates (deadline, planned publication, publication) from the whole Stories collection this account can see.
  const planning = usePlanningStories(fetchers, EMPTY_PLANNING_FILTERS);

  const links = useMemo<CalendarLinks>(() => ({
    // The Story screen opens Plan at the appointment when `appointment=` is present.
    story: (storyId, appointmentId) => `${admin}/collections/stories/${storyId}${appointmentId ? `?appointment=${encodeURIComponent(appointmentId)}` : ""}`
  }), [admin]);

  // The controls live in the contextual pane while it is showing; otherwise the toolbar offers them in a sheet.
  const paneShowing = composition === "calendar-workspace" && state === "expanded" && !isMobile;

  return (
    <>
      {planning.isError && !planning.data ? <InlineAlert onAction={() => void planning.refetch()}>{describePlanningError(planning.error, "Story dates could not be loaded. Appointments and production are still shown.")}</InlineAlert> : null}
      <NewsroomCalendar
        stories={planning.data?.stories ?? []}
        timezone={timezone}
        getSchedule={fetchers.getSchedule}
        currentUserId={currentUserId}
        links={links}
        onOpenStory={openStory}
        controls={paneShowing ? "external" : "sheet"}
        navigate={navigate}
      />
    </>
  );
}
