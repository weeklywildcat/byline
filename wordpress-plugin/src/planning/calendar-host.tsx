/**
 * WordPress's side of the shared newsroom Calendar
 * (@byline/newsroom-screens/calendar): wp-admin addresses, the reader's view
 * remembered in this browser, and the Calendar mounted as a view of Stories.
 * The calendar itself (model, Schedule-X adapter, controller, controls) is
 * shared with the Payload newsroom; nothing here re-implements it.
 */
import { useMemo, useState } from "react";
import { wordpressCollectionHref } from "../collections/wordpress-collection-api";
import type { CalendarLinks } from "@byline/newsroom-screens/calendar/calendar-model";
import { createCalendarWorkspace, type CalendarPreferenceStorage } from "@byline/newsroom-screens/calendar/calendar-workspace";
import { CalendarWorkspaceProvider } from "@byline/newsroom-screens/calendar/calendar-workspace-context";
import { NewsroomCalendar } from "@byline/newsroom-screens/calendar/NewsroomCalendar";
import type { PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import type { StoriesCalendarProps } from "@byline/newsroom-screens/planning/StoriesPage";

/** A Story Workspace address. `appointmentId` opens that appointment's scheduling dialog. */
export type WorkspaceUrl = (storyId: number, appointmentId?: string) => string;

/**
 * `admin.php?page=byline-planning&story=<id>[&appointment=<uuid>]`, derived from
 * a localized Planning admin URL so nothing hardcodes `/wp-admin/`. Any `tab`
 * (and similar route params) on the base URL is dropped: the workspace is a
 * view of the Planning page, not one of its tabs.
 */
export function createWorkspaceUrlBuilder(baseUrl?: string | null): WorkspaceUrl {
  const base = (baseUrl || "admin.php?page=byline-planning").split("#")[0];
  const [path, query = ""] = base.split("?");
  return (storyId, appointmentId) => {
    const params = new URLSearchParams(query);
    ["tab", "view", "mine", "story", "appointment"].forEach((key) => params.delete(key));
    if (!params.has("page")) params.set("page", "byline-planning");
    params.set("story", String(storyId));
    if (appointmentId) params.set("appointment", appointmentId);
    return `${path}?${params.toString()}`;
  };
}

/** The Calendar's links in wp-admin: Story Workspaces, and shared interviews on their collection. */
export function wordPressCalendarLinks(workspaceUrl: WorkspaceUrl): CalendarLinks {
  return {
    story: workspaceUrl,
    collection: (collectionId, interviewId) => wordpressCollectionHref(collectionId, interviewId ? { interviewId } : { tab: "reporting" })
  };
}

/** WordPress keeps the reader's calendar view in this browser, under the key it always used. */
export const CALENDAR_VIEW_STORAGE_KEY = "byline:calendar-view";

export function localCalendarStorage(storage: Pick<Storage, "getItem" | "setItem"> | null): CalendarPreferenceStorage {
  return {
    load: () => {
      try {
        return { view: storage?.getItem(CALENDAR_VIEW_STORAGE_KEY) || null };
      } catch {
        return null;
      }
    },
    save: ({ view }) => {
      try {
        if (view) storage?.setItem(CALENDAR_VIEW_STORAGE_KEY, view);
      } catch {
        // The view still applies for this session.
      }
    }
  };
}

/** Stories' Calendar view: the shared Calendar, with its controls in a temporary sheet. */
export function StoryCalendar({ getSchedule, workspaceUrl, ...calendar }: StoriesCalendarProps & { getSchedule?: PlanningFetchers["getSchedule"]; workspaceUrl: WorkspaceUrl }) {
  const [workspace] = useState(() => createCalendarWorkspace(localCalendarStorage(typeof window === "undefined" ? null : window.localStorage)));
  const links = useMemo(() => wordPressCalendarLinks(workspaceUrl), [workspaceUrl]);
  return <CalendarWorkspaceProvider workspace={workspace}>
    <NewsroomCalendar {...calendar} getSchedule={getSchedule} links={links} controls="sheet" />
  </CalendarWorkspaceProvider>;
}
