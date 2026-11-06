import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { createViewDay, createViewList, createViewMonthAgenda, createViewMonthGrid, createViewWeek, createViewWeekAgenda } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { scheduleKey } from "../story/story-query";
import type { PlanningFetchers } from "../planning/planning-api";
import { describePlanningError, planningCalendarEvents, type PlanningStory } from "../planning/planning-model";
import { CALENDAR_COMPONENTS, CATEGORY_DOT_CLASSES } from "./calendar-events";
import { calendarHeading, createCalendarController } from "./calendar-controller";
import { mergeCalendarEvents, needsSchedulingItems, scheduleCalendarEvents, scheduleRangeFor, type CalendarLinks } from "./calendar-model";
import { selectedDay, viewForPreference } from "./calendar-workspace";
import { useCalendarWorkspace } from "./calendar-workspace-context";
import { CalendarControls } from "./CalendarControls";
import { CalendarNavigateProvider } from "./calendar-link";
import { NeedsScheduling } from "./NeedsScheduling";
import { CATEGORY_BY_EVENT_TYPE, CATEGORY_LABELS, SCHEDULE_X_CALENDARS, toScheduleXEvents, visibleRangeDays, type BylineScheduleXEvent } from "./schedule-x-adapter";

export type NewsroomCalendarProps = {
  /** The stories whose dates (deadline, planned publication, publication) the calendar shows. */
  stories: PlanningStory[];
  /** The newsroom timezone. Required: Schedule-X reads every event in it, never in the browser's. */
  timezone: string;
  /** The host's protected schedule feed. Without one the calendar shows story dates only. */
  getSchedule?: PlanningFetchers["getSchedule"];
  currentUserId: number | null;
  links: CalendarLinks;
  onOpenStory: (storyId: number) => void;
  collectionId?: number;
  /**
   * Where the date picker and filters are. `sheet`: a Filters button opens them
   * temporarily beside the calendar. `external`: the host shows
   * `CalendarControls` persistently (a contextual sidebar), so the toolbar
   * does not repeat them.
   */
  controls?: "sheet" | "external";
  /** Client navigation for a host with its own router. Without it, links are ordinary page loads. */
  navigate?: (href: string) => void;
};

/**
 * The newsroom Calendar. Schedule-X (with its shadcn theme) lays out and
 * responds; Byline decides what an event means. Events come from the host's
 * protected schedule feed through TanStack Query and one adapter, never from
 * Schedule-X's own fetching, and a click opens Story Peek, never Schedule-X's
 * own modal. Dragging is intentionally off: changing a date is a decision made
 * in the story, appointment, production or publishing record it belongs to.
 *
 * The date, the filters and the view belong to the Calendar workspace
 * (`CalendarWorkspaceProvider`), shared with every presentation of the
 * controls; this component keeps none of its own.
 */
export function NewsroomCalendar(props: NewsroomCalendarProps) {
  const { state } = useCalendarWorkspace();
  // Wait for remembered preferences, so the calendar opens in the reader's view.
  if (!state.ready) return <CalendarSkeleton />;
  return <CalendarNavigateProvider value={props.navigate ?? null}><CalendarSurface {...props} /></CalendarNavigateProvider>;
}

function CalendarSurface({ collectionId, stories, timezone, getSchedule, currentUserId, links, onOpenStory, controls = "sheet", navigate }: NewsroomCalendarProps) {
  const { workspace, state } = useCalendarWorkspace();
  const { filters } = state;
  const [controller] = useState(createCalendarController);
  const [eventsService] = useState(() => createEventsServicePlugin());
  const snapshot = state.calendar;
  // Schedule-X keeps the callbacks it was created with, so they read the latest handlers through a ref.
  const handlers = useRef({ onOpenStory, navigate });
  handlers.current = { onOpenStory, navigate };
  // The first view and date, read once: afterwards Schedule-X and the workspace stay in step.
  const [initial] = useState(() => ({ view: state.view || "month-grid", date: selectedDay(state, timezone) }));

  const calendar = useCalendarApp({
    theme: "shadcn",
    timezone,
    locale: typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US",
    defaultView: initial.view,
    selectedDate: initial.date,
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
        const href = (event as BylineScheduleXEvent).editHref;
        if (storyId > 0) handlers.current.onOpenStory(storyId);
        else if (href) (handlers.current.navigate ?? ((next: string) => window.location.assign(next)))(href);
      }
    }
  });

  // The mounted calendar is the workspace's: its date and view are the ones every control shows.
  useEffect(() => workspace.attach(controller), [workspace, controller]);

  // The reader's view, among those Schedule-X offers at this size (the agenda equivalent on a narrow screen).
  useEffect(() => {
    if (!snapshot.ready) return;
    const wanted = viewForPreference(state.view, snapshot.views, snapshot.small);
    if (wanted && wanted !== snapshot.view) controller.setView(wanted);
    // Only when the calendar first renders or changes size class; a reader's own choice goes through setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.ready, snapshot.small]);

  // The visible range, as Schedule-X reports it, decides which part of the schedule feed to load.
  const range = snapshot.range ? visibleRangeDays(snapshot.range) : null;
  const feedRange = range ? scheduleRangeFor([{ key: range.from }, { key: range.to }], 1) : null;
  const schedule = useQuery({
    queryKey: feedRange ? scheduleKey(feedRange.from, feedRange.to, filters.tasks, collectionId) : ["byline", "schedule", "idle"],
    queryFn: () => getSchedule!(feedRange!.from, feedRange!.to, filters.tasks, collectionId),
    enabled: Boolean(getSchedule && feedRange),
    placeholderData: keepPreviousData
  });
  const feed = schedule.data;

  const events = useMemo(
    () => mergeCalendarEvents(planningCalendarEvents(stories, timezone), scheduleCalendarEvents(feed, links, timezone), filters, currentUserId),
    [currentUserId, feed, filters, stories, timezone, links]
  );
  const needsScheduling = useMemo(() => needsSchedulingItems(feed, links, { mine: filters.mine, currentUserId }), [currentUserId, feed, filters.mine, links]);
  useEffect(() => { workspace.setNeedsScheduling(needsScheduling.length); }, [workspace, needsScheduling.length]);

  // TanStack Query is the only owner of the data; the events service just displays what the adapter produces.
  useEffect(() => { if (snapshot.ready) eventsService.set(toScheduleXEvents(events, timezone)); }, [events, eventsService, snapshot.ready, timezone]);

  const heading = calendarHeading(snapshot, typeof navigator === "undefined" ? undefined : navigator.language);
  const viewItems = snapshot.views.map((view) => ({ value: view.name, label: view.label }));
  const legend = useMemo(() => Array.from(new Set(events.map((event) => CATEGORY_BY_EVENT_TYPE[event.type]))), [events]);

  return <div className="flex min-w-0 flex-col gap-3" data-calendar="" data-calendar-controls-placement={controls}>
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-2 min-w-40 text-lg font-medium tracking-tight" aria-live="polite">{heading || <Skeleton className="h-6 w-40" />}</h2>
      <ButtonGroup aria-label="Calendar navigation">
        <Button variant="outline" onClick={() => workspace.today()}>Today</Button>
        <Button variant="outline" size="icon" aria-label="Previous" onClick={() => workspace.step(-1)}><ChevronLeft aria-hidden="true" /></Button>
        <Button variant="outline" size="icon" aria-label="Next" onClick={() => workspace.step(1)}><ChevronRight aria-hidden="true" /></Button>
      </ButtonGroup>
      <div className="ml-auto flex items-center gap-2">
        {viewItems.length ? <Select items={viewItems} value={snapshot.view} onValueChange={(next) => { if (next) workspace.setView(String(next)); }}>
          <SelectTrigger aria-label="Calendar view" className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{viewItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select> : null}
        {controls === "sheet" ? <CalendarControlsSheet timezone={timezone} scheduleFeed={Boolean(getSchedule)} currentUserId={currentUserId} /> : null}
      </div>
    </div>

    {schedule.isError ? <InlineAlert onAction={() => void schedule.refetch()}>{describePlanningError(schedule.error, "Appointments and production due dates could not be loaded. Story dates are still shown.")}</InlineAlert> : null}
    {getSchedule ? <NeedsScheduling items={needsScheduling} loading={schedule.isPending && !feed} onOpenStory={onOpenStory} /> : null}

    {/* With the controls in a sheet, a legend keeps colour connected to meaning; a persistent pane already shows each category's dot. */}
    {controls === "sheet" && legend.length ? <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Calendar legend">
      {legend.map((category) => <li key={category} className="flex items-center gap-1.5"><span aria-hidden="true" className={`size-2 rounded-full ${CATEGORY_DOT_CLASSES[category]}`} />{CATEGORY_LABELS[category]}</li>)}
    </ul> : null}

    <div className="min-w-0 overflow-hidden rounded-xl border" data-calendar-frame="">
      <ScheduleXCalendar calendarApp={calendar} customComponents={CALENDAR_COMPONENTS} />
    </div>
  </div>;
}

/**
 * The controls as a temporary right-hand sheet, for layouts with no room to
 * keep them beside the calendar. The same `CalendarControls` as a contextual
 * pane, over the same workspace.
 */
export function CalendarControlsSheet({ timezone, scheduleFeed, currentUserId }: { timezone: string; scheduleFeed: boolean; currentUserId: number | null }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} data-calendar-controls-trigger="">
      <ListFilter data-icon="inline-start" aria-hidden="true" />Filters
    </Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[20rem] max-w-[calc(100vw-2.5rem)] gap-0 overflow-y-auto bg-sidebar p-0 text-sidebar-foreground data-[side=right]:sm:max-w-[20rem]" data-calendar-controls-sheet="">
        <SheetHeader className="border-b border-sidebar-border p-4 pr-12">
          <SheetTitle className="text-base font-medium text-foreground">Calendar</SheetTitle>
          <SheetDescription className="sr-only">Choose a date and what the calendar shows.</SheetDescription>
        </SheetHeader>
        <div className="py-2">
          <CalendarControls timezone={timezone} scheduleFeed={scheduleFeed} currentUserId={currentUserId} />
        </div>
      </SheetContent>
    </Sheet>
  </>;
}

function CalendarSkeleton() {
  return <div role="status" aria-label="Loading calendar" className="flex flex-col gap-3">
    <div className="flex items-center gap-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-8 w-32" /><Skeleton className="ml-auto h-8 w-32" /></div>
    <Skeleton className="h-[34rem] w-full rounded-xl" />
  </div>;
}
