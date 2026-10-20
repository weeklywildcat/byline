import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { createViewDay, createViewList, createViewMonthAgenda, createViewMonthGrid, createViewWeek, createViewWeekAgenda } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import { __ } from "@wordpress/i18n";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button } from "../admin-ui/ui/button";
import { ButtonGroup } from "../admin-ui/ui/button-group";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../admin-ui/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { Skeleton } from "../admin-ui/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../admin-ui/ui/tooltip";
import { scheduleKey } from "../story/story-query";
import { CALENDAR_COMPONENTS, CATEGORY_DOT_CLASSES } from "./calendar-events";
import { calendarHeading, createCalendarController } from "./calendar-controller";
import { DEFAULT_CALENDAR_FILTERS, mergeCalendarEvents, needsSchedulingItems, scheduleCalendarEvents, scheduleRangeFor, type CalendarFilters, type WorkspaceUrl } from "./calendar-model";
import { NeedsScheduling } from "./NeedsScheduling";
import type { PlanningFetchers } from "./planning-api";
import { describePlanningError, planningCalendarEvents, type PlanningStory } from "./planning-model";
import { CATEGORY_BY_EVENT_TYPE, CATEGORY_LABELS, SCHEDULE_X_CALENDARS, toScheduleXEvents, visibleRangeDays, type BylineScheduleXEvent } from "./schedule-x-adapter";

export type StoryCalendarProps = {
  stories: PlanningStory[];
  /** The WordPress site timezone. Required: Schedule-X reads every event in it, never in the browser's. */
  timezone: string;
  getSchedule?: PlanningFetchers["getSchedule"];
  currentUserId: number | null;
  workspaceUrl: WorkspaceUrl;
  onOpenStory: (storyId: number) => void;
};

const VIEW_KEY = "byline:calendar-view";
const readView = () => { try { return window.localStorage.getItem(VIEW_KEY) || undefined; } catch { return undefined; } };
const writeView = (view: string) => { try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* the view still works for this session */ } };

const FILTERS: Array<{ key: keyof CalendarFilters; label: string }> = [
  { key: "appointments", label: __("Appointments", "weekly-wildcat-headless") },
  { key: "deadlines", label: __("Story deadlines", "weekly-wildcat-headless") },
  { key: "media", label: __("Production", "weekly-wildcat-headless") },
  { key: "publication", label: __("Publication", "weekly-wildcat-headless") },
  { key: "wordpress", label: __("WordPress schedule", "weekly-wildcat-headless") },
  { key: "tasks", label: __("Task due dates", "weekly-wildcat-headless") }
];

/**
 * The Stories calendar. Schedule-X (with its shadcn theme) lays out and
 * responds; Byline decides what an event means. Events come from the protected
 * schedule feed through TanStack Query and one adapter, never from Schedule-X's
 * own fetching, and a click opens Story Peek, never Schedule-X's own modal.
 * Dragging is intentionally off: changing a date is a decision made in the
 * story, appointment, production or WordPress form it belongs to.
 */
export function StoryCalendar({ stories, timezone, getSchedule, currentUserId, workspaceUrl, onOpenStory }: StoryCalendarProps) {
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_CALENDAR_FILTERS);
  const [controller] = useState(createCalendarController);
  const [eventsService] = useState(() => createEventsServicePlugin());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  // Schedule-X keeps the callbacks it was created with, so they read the latest handler through a ref.
  const openStory = useRef(onOpenStory);
  openStory.current = onOpenStory;

  const calendar = useCalendarApp({
    theme: "shadcn",
    timezone,
    locale: typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US",
    defaultView: readView() || "month-grid",
    // Order matters: on a narrow screen Schedule-X falls back to the first small-screen view, which should be the month agenda.
    views: [createViewMonthGrid(), createViewMonthAgenda(), createViewWeek(), createViewWeekAgenda(), createViewDay(), createViewList()],
    calendars: SCHEDULE_X_CALENDARS,
    monthGridOptions: { nEventsPerDay: 4 },
    weekOptions: { gridHeight: 1100 },
    events: [],
    plugins: [eventsService, controller.plugin],
    callbacks: {
      onEventClick: (event, uiEvent) => {
        // A real link inside an event (Edit appointment) does its own thing.
        if ((uiEvent.target as HTMLElement | null)?.closest?.("a[href]")) return;
        const storyId = Number((event as BylineScheduleXEvent).storyId);
        if (storyId > 0) openStory.current(storyId);
      }
    }
  });

  // The visible range, as Schedule-X reports it, decides which part of the schedule feed to load.
  const range = snapshot.range ? visibleRangeDays(snapshot.range) : null;
  const feedRange = range ? scheduleRangeFor([{ key: range.from }, { key: range.to }], 1) : null;
  const schedule = useQuery({
    queryKey: feedRange ? scheduleKey(feedRange.from, feedRange.to, filters.tasks) : ["byline", "schedule", "idle"],
    queryFn: () => getSchedule!(feedRange!.from, feedRange!.to, filters.tasks),
    enabled: Boolean(getSchedule && feedRange),
    placeholderData: keepPreviousData
  });
  const feed = schedule.data;

  const events = useMemo(
    () => mergeCalendarEvents(planningCalendarEvents(stories, timezone), scheduleCalendarEvents(feed, workspaceUrl, timezone), filters, currentUserId),
    [currentUserId, feed, filters, stories, timezone, workspaceUrl]
  );
  const needsScheduling = useMemo(() => needsSchedulingItems(feed, workspaceUrl, { mine: filters.mine, currentUserId }), [currentUserId, feed, filters.mine, workspaceUrl]);

  // TanStack Query is the only owner of the data; the events service just displays what the adapter produces.
  useEffect(() => { if (snapshot.ready) eventsService.set(toScheduleXEvents(events, timezone)); }, [events, eventsService, snapshot.ready, timezone]);
  useEffect(() => { if (snapshot.ready && snapshot.view) writeView(snapshot.view); }, [snapshot.ready, snapshot.view]);

  const legend = useMemo(() => Array.from(new Set(events.map((event) => CATEGORY_BY_EVENT_TYPE[event.type]))), [events]);
  const heading = calendarHeading(snapshot, typeof navigator === "undefined" ? undefined : navigator.language);
  const viewItems = snapshot.views.map((view) => ({ value: view.name, label: view.label }));

  return <div className="flex min-w-0 flex-col gap-3" data-calendar="">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-2 min-w-40 text-lg font-medium tracking-tight" aria-live="polite">{heading || <Skeleton className="h-6 w-40" />}</h2>
      <ButtonGroup aria-label={__("Calendar navigation", "weekly-wildcat-headless")}>
        <Button variant="outline" onClick={controller.today}>{__("Today", "weekly-wildcat-headless")}</Button>
        <Tooltip><TooltipTrigger render={<Button variant="outline" size="icon" aria-label={__("Previous", "weekly-wildcat-headless")} onClick={() => controller.step(-1)} />}><ChevronLeft aria-hidden="true" /></TooltipTrigger><TooltipContent>{__("Previous", "weekly-wildcat-headless")}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger render={<Button variant="outline" size="icon" aria-label={__("Next", "weekly-wildcat-headless")} onClick={() => controller.step(1)} />}><ChevronRight aria-hidden="true" /></TooltipTrigger><TooltipContent>{__("Next", "weekly-wildcat-headless")}</TooltipContent></Tooltip>
      </ButtonGroup>
      <div className="ml-auto flex items-center gap-2">
        {viewItems.length ? <Select items={viewItems} value={snapshot.view} onValueChange={(next) => { if (next) controller.setView(String(next)); }}>
          <SelectTrigger aria-label={__("Calendar view", "weekly-wildcat-headless")} className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{viewItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select> : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}><ListFilter data-icon="inline-start" aria-hidden="true" />{__("Filters", "weekly-wildcat-headless")}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{__("Show on calendar", "weekly-wildcat-headless")}</DropdownMenuLabel>
              {FILTERS.filter((item) => getSchedule || (item.key !== "appointments" && item.key !== "media" && item.key !== "tasks")).map((item) => <DropdownMenuCheckboxItem key={item.key} checked={filters[item.key]} onCheckedChange={(checked) => setFilters((current) => ({ ...current, [item.key]: Boolean(checked) }))} closeOnClick={false}>{item.label}</DropdownMenuCheckboxItem>)}
            </DropdownMenuGroup>
            {getSchedule ? <><DropdownMenuSeparator /><DropdownMenuCheckboxItem checked={filters.mine} disabled={!currentUserId} onCheckedChange={(checked) => setFilters((current) => ({ ...current, mine: Boolean(checked) }))} closeOnClick={false}>{__("My schedule", "weekly-wildcat-headless")}</DropdownMenuCheckboxItem></> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    {schedule.isError ? <InlineAlert onAction={() => void schedule.refetch()}>{describePlanningError(schedule.error, __("Appointments and production due dates could not be loaded. Story dates are still shown.", "weekly-wildcat-headless"))}</InlineAlert> : null}
    {getSchedule ? <NeedsScheduling items={needsScheduling} loading={schedule.isPending && !feed} onOpenStory={onOpenStory} /> : null}

    {legend.length ? <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={__("Calendar legend", "weekly-wildcat-headless")}>
      {legend.map((category) => <li key={category} className="flex items-center gap-1.5"><span aria-hidden="true" className={`size-2 rounded-full ${CATEGORY_DOT_CLASSES[category]}`} />{CATEGORY_LABELS[category]}</li>)}
    </ul> : null}

    <div className="min-w-0 overflow-hidden rounded-xl border" data-calendar-frame="">
      <ScheduleXCalendar calendarApp={calendar} customComponents={CALENDAR_COMPONENTS} />
    </div>
  </div>;
}

