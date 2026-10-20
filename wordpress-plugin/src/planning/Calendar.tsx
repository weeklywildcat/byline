import { Button, SelectControl } from "@wordpress/components";
import { useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";

import { siteDay } from "../home/newsroom-model";
import type { ScheduleResponse } from "../workspace/workspace-types";
import {
  CALENDAR_EVENT_CATEGORY,
  CALENDAR_EVENT_LABELS,
  CALENDAR_EVENT_ORDER,
  DEFAULT_CALENDAR_FILTERS,
  createWorkspaceUrlBuilder,
  mergeCalendarEvents,
  needsSchedulingItems,
  scheduleCalendarEvents,
  scheduleCoversVisible,
  scheduleRangeFor,
  type CalendarFilters,
  type LoadedSchedule,
  type NeedsSchedulingItem,
  type WorkspaceUrl
} from "./calendar-model";
import type { PlanningFetchers } from "./planning-api";
import {
  describePlanningError,
  monthCalendarDays,
  planningCalendarEvents,
  planningDateKey,
  weekCalendarDays,
  type CalendarEventType,
  type PlanningCalendarDay,
  type PlanningCalendarEvent,
  type PlanningStory
} from "./planning-model";
import { PlanningEmpty, PlanningNotice, ViewHeader } from "./planning-ui";

export type PlanningCalendarProps = {
  stories: PlanningStory[];
  onOpenStory?: (story: PlanningStory) => void;
  /** Schedule feed (appointments, production deadlines, needs-scheduling). Optional: without it the calendar shows story dates only. */
  getSchedule?: PlanningFetchers["getSchedule"];
  /** Powers the "My schedule" filter. */
  currentUserId?: number | null;
  /** Story Workspace deep link. `appointmentId` opens that appointment's scheduling dialog. */
  workspaceUrl?: WorkspaceUrl;
  /** Change this number to force the schedule feed to reload (the Planning "Refresh" button). */
  reloadSignal?: number;
};

const DAY_EVENT_LIMIT = 4;

function eventClass(event: PlanningCalendarEvent): string {
  return `byline-planning-calendar-event byline-planning-calendar-event-${event.type}${event.completed ? " byline-planning-calendar-event-completed" : ""}`;
}

function eventAriaLabel(event: PlanningCalendarEvent): string {
  const title = event.title || event.storyTitle;
  const when = event.timeLabel ? `${event.timeLabel}, ${event.exactDate}` : event.exactDate;
  const story = event.title && event.storyTitle ? `, ${__("story", "weekly-wildcat-headless")} ${event.storyTitle}` : "";
  const people = event.assigneeNames?.length ? `, ${event.assigneeNames.join(", ")}` : "";
  return `${event.label}: ${title}${story}${people}, ${when}`;
}

function EventContent({ event }: { event: PlanningCalendarEvent }) {
  const prefix = event.timeLabel ?? (event.type === "media" ? null : event.label);
  return (
    <>
      {prefix ? <span aria-hidden="true" className={event.timeLabel ? "byline-planning-calendar-event-time" : undefined}>{prefix}</span> : null}
      <span className="byline-planning-calendar-event-title" aria-hidden="true">{event.title || event.storyTitle}</span>
    </>
  );
}

function EventItem({ event, onOpenStory }: { event: PlanningCalendarEvent; onOpenStory?: (storyId: number) => void }) {
  const label = eventAriaLabel(event);
  const title = event.tooltip || label;

  if (event.href) {
    return (
      <a className={eventClass(event)} href={event.href} aria-label={label} title={title}>
        <EventContent event={event} />
      </a>
    );
  }

  if (event.type === "task") {
    // A task with no story has nowhere to go; it stays readable but is not a dead link.
    return (
      <span className={eventClass(event)} role="note" aria-label={label} title={title}>
        <EventContent event={event} />
      </span>
    );
  }

  if (onOpenStory) {
    return (
      <button type="button" className={eventClass(event)} onClick={() => onOpenStory(event.storyId)} aria-label={label} title={label}>
        <EventContent event={event} />
      </button>
    );
  }

  return (
    <a className={eventClass(event)} href={event.storyUrl} aria-label={label} title={label}>
      <EventContent event={event} />
    </a>
  );
}

function DayCell({
  day,
  events,
  today,
  limit,
  onOpenStory
}: {
  day: PlanningCalendarDay;
  events: PlanningCalendarEvent[];
  today: boolean;
  limit: number;
  onOpenStory?: (storyId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = !expanded && events.length > limit ? events.length - limit : 0;
  const shown = hidden ? events.slice(0, limit) : events;

  return (
    <div className={`byline-planning-calendar-day${day.isCurrentMonth ? "" : " byline-planning-calendar-day-outside"}${today ? " byline-planning-calendar-day-today" : ""}`}>
      <time dateTime={day.key} className="byline-planning-calendar-day-number" aria-current={today ? "date" : undefined}>
        {day.date.getDate()}
      </time>
      {events.length ? (
        <ul className="byline-planning-calendar-events">
          {shown.map((event) => (
            <li key={event.id}><EventItem event={event} onOpenStory={onOpenStory} /></li>
          ))}
          {hidden ? (
            <li>
              <button type="button" className="byline-planning-calendar-more" onClick={() => setExpanded(true)}>
                {sprintf(/* translators: %d: number of hidden calendar events. */ __("+%d more", "weekly-wildcat-headless"), hidden)}
              </button>
            </li>
          ) : null}
          {expanded && events.length > limit ? (
            <li>
              <button type="button" className="byline-planning-calendar-more" onClick={() => setExpanded(false)}>
                {__("Show fewer", "weekly-wildcat-headless")}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function CalendarGrid({
  days,
  events,
  todayKey,
  limit,
  onOpenStory
}: {
  days: PlanningCalendarDay[];
  events: PlanningCalendarEvent[];
  todayKey: string;
  limit: number;
  onOpenStory?: (storyId: number) => void;
}) {
  const eventsByDate = useMemo(() => {
    const map = new Map<string, PlanningCalendarEvent[]>();
    events.forEach((event) => map.set(event.date, [...(map.get(event.date) || []), event]));
    return map;
  }, [events]);

  const weeks: PlanningCalendarDay[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

  return (
    <div className="byline-planning-calendar-grid" role="grid" aria-label={__("Planning calendar", "weekly-wildcat-headless")}>
      {weeks.map((week) => (
        <div className="byline-planning-calendar-week" role="row" key={week[0].key}>
          {week.map((day) => (
            <div className="byline-planning-calendar-grid-cell" role="gridcell" key={day.key}>
              <DayCell day={day} events={eventsByDate.get(day.key) || []} today={todayKey === day.key} limit={limit} onOpenStory={onOpenStory} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CalendarFilterBar({
  filters,
  canFilterMine,
  hasSchedule,
  onChange
}: {
  filters: CalendarFilters;
  canFilterMine: boolean;
  hasSchedule: boolean;
  onChange: (next: CalendarFilters) => void;
}) {
  const toggle = (key: keyof CalendarFilters) => onChange({ ...filters, [key]: !filters[key] });
  const pill = (key: keyof CalendarFilters, label: string, hint: string, disabled = false) => (
    <Button key={key} variant="secondary" size="compact" className="byline-planning-calendar-filter" isPressed={filters[key]} aria-pressed={filters[key]} disabled={disabled} label={hint} showTooltip onClick={() => toggle(key)}>
      {label}
    </Button>
  );
  return (
    <div className="byline-planning-calendar-filters" role="group" aria-label={__("Show on calendar", "weekly-wildcat-headless")}>
      {/* Without the schedule feed there are no appointments, production or task dates to filter. */}
      {hasSchedule ? pill("appointments", __("Appointments", "weekly-wildcat-headless"), __("Interviews, meetings and other exact appointments", "weekly-wildcat-headless")) : null}
      {pill("deadlines", __("Deadlines", "weekly-wildcat-headless"), __("Story deadlines", "weekly-wildcat-headless"))}
      {hasSchedule ? pill("media", __("Media", "weekly-wildcat-headless"), __("Photo, video and other production due dates", "weekly-wildcat-headless")) : null}
      {pill("publication", __("Publication", "weekly-wildcat-headless"), __("Planned, scheduled and published dates", "weekly-wildcat-headless"))}
      {hasSchedule ? (
        <>
          <span className="byline-planning-calendar-filter-divider" aria-hidden="true" />
          {pill("mine", __("My schedule", "weekly-wildcat-headless"), canFilterMine ? __("Only appointments, production and tasks assigned to you", "weekly-wildcat-headless") : __("Your account could not be identified", "weekly-wildcat-headless"), !canFilterMine)}
          {pill("tasks", __("Tasks", "weekly-wildcat-headless"), __("Open task due dates", "weekly-wildcat-headless"))}
        </>
      ) : null}
    </div>
  );
}

const NEEDS_SCHEDULING_PREVIEW = 5;

/**
 * Open appointments that have a target window or no date at all. They are never
 * placed in a day cell and never shown with a time: assigning an exact date and
 * time happens in the story workspace, which each item links to.
 */
function NeedsSchedulingPanel({ items, loading }: { items: NeedsSchedulingItem[]; loading: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, NEEDS_SCHEDULING_PREVIEW);
  return (
    <section className="byline-planning-needs-scheduling" aria-labelledby="byline-planning-needs-scheduling-heading">
      <h3 id="byline-planning-needs-scheduling-heading">
        {__("Needs scheduling", "weekly-wildcat-headless")}
        <span className="byline-planning-count">{items.length}</span>
      </h3>
      {items.length ? (
        <>
          <ul className="byline-planning-needs-scheduling-list">
            {shown.map((item) => (
              <li key={item.id}>
                <a href={item.href} className="byline-planning-needs-scheduling-item">
                  <span className="byline-planning-needs-scheduling-title">{item.title}</span>
                  <span className="byline-planning-needs-scheduling-meta">
                    {[item.storyTitle, item.assigneeNames.length ? item.assigneeNames.join(", ") : __("Unassigned", "weekly-wildcat-headless")].filter(Boolean).join(" · ")}
                  </span>
                  <span className={`byline-planning-needs-scheduling-target${item.hasTarget ? "" : " byline-planning-muted"}`}>{item.target}</span>
                </a>
              </li>
            ))}
          </ul>
          {items.length > NEEDS_SCHEDULING_PREVIEW ? (
            <Button variant="link" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll}>
              {showAll ? __("Show fewer", "weekly-wildcat-headless") : sprintf(/* translators: %d: item count. */ __("Show all %d", "weekly-wildcat-headless"), items.length)}
            </Button>
          ) : null}
          <p className="byline-planning-help">{__("Open one to set its exact date and time in the story workspace.", "weekly-wildcat-headless")}</p>
        </>
      ) : (
        <p className="byline-planning-muted">{loading ? __("Checking for appointments that need a time…", "weekly-wildcat-headless") : __("Nothing is waiting for an exact time.", "weekly-wildcat-headless")}</p>
      )}
    </section>
  );
}

export function PlanningCalendar({
  stories,
  onOpenStory: onOpenStoryProp,
  getSchedule,
  currentUserId = null,
  workspaceUrl: workspaceUrlProp,
  reloadSignal = 0
}: PlanningCalendarProps) {
  const [mode, setMode] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_CALENDAR_FILTERS);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loaded, setLoaded] = useState<LoadedSchedule | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const generation = useRef(0);
  const seenReload = useRef(`${reloadSignal}:${retryTick}`);

  const workspaceUrl = useMemo(() => workspaceUrlProp || createWorkspaceUrlBuilder(), [workspaceUrlProp]);
  const storyById = useMemo(() => new Map(stories.map((story) => [story.id, story])), [stories]);
  const cursorTime = cursor.getTime();
  const days = useMemo(() => (mode === "month" ? monthCalendarDays(cursor) : weekCalendarDays(cursor)), [mode, cursorTime]); // eslint-disable-line react-hooks/exhaustive-deps
  const timezone = schedule?.timezone;
  const includeTasks = filters.tasks;
  const hasSchedule = Boolean(getSchedule);

  // Fetch the schedule feed for the visible range (plus a week either side) and
  // again only when navigation leaves it, tasks are switched on, or a reload is asked for.
  useEffect(() => {
    if (!getSchedule) return;
    const reloadKey = `${reloadSignal}:${retryTick}`;
    const forced = seenReload.current !== reloadKey;
    seenReload.current = reloadKey;
    if (!forced && scheduleCoversVisible(loaded, days, includeTasks)) return;
    const range = scheduleRangeFor(days);
    if (!range) return;

    const current = ++generation.current;
    setIsFetching(true);
    getSchedule(range.from, range.to, includeTasks)
      .then((next) => {
        if (current !== generation.current) return;
        setSchedule(next);
        setLoaded({ ...range, includeTasks });
        setScheduleError(null);
      })
      .catch((error: unknown) => {
        if (current !== generation.current) return;
        setScheduleError(describePlanningError(error, __("The schedule is unavailable right now.", "weekly-wildcat-headless")));
      })
      .finally(() => {
        if (current === generation.current) setIsFetching(false);
      });
  }, [days, getSchedule, includeTasks, loaded, reloadSignal, retryTick]);

  useEffect(() => () => { generation.current += 1; }, []);

  const events = useMemo(
    () => mergeCalendarEvents(planningCalendarEvents(stories, timezone), scheduleCalendarEvents(schedule, workspaceUrl, timezone), filters, currentUserId),
    [currentUserId, filters, schedule, stories, timezone, workspaceUrl]
  );
  const needsScheduling = useMemo(
    () => needsSchedulingItems(schedule, workspaceUrl, { mine: filters.mine, currentUserId }),
    [currentUserId, filters.mine, schedule, workspaceUrl]
  );
  const todayKey = timezone ? siteDay(new Date(), timezone) : planningDateKey(new Date());

  const legendTypes: CalendarEventType[] = CALENDAR_EVENT_ORDER.filter((type) => filters[CALENDAR_EVENT_CATEGORY[type]] && (hasSchedule || (type !== "appointment" && type !== "media" && type !== "task")));

  const changeCursor = (amount: number) => {
    const next = new Date(cursor);
    if (mode === "month") {
      next.setDate(1);
      next.setMonth(next.getMonth() + amount);
    } else {
      next.setDate(next.getDate() + amount * 7);
    }
    setCursor(next);
  };

  const onOpenStory = (storyId: number) => {
    const story = storyById.get(storyId);
    if (story && onOpenStoryProp) onOpenStoryProp(story);
  };

  const heading = mode === "month"
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(cursor)
    : `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(days[0].date)}–${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(days[6].date)}`;

  if (!stories.length && !getSchedule) {
    return <PlanningEmpty label={__("Planning calendar", "weekly-wildcat-headless")} instructions={__("No stories with planning dates are available for this calendar.", "weekly-wildcat-headless")} />;
  }

  return (
    <section className="byline-planning-calendar" aria-labelledby="byline-planning-calendar-heading">
      <ViewHeader
        title={__("Calendar", "weekly-wildcat-headless")}
        description={__("Appointments, deadlines, production due dates, planned publication targets, WordPress schedules and published dates are separate events.", "weekly-wildcat-headless")}
        actions={(
          <div className="byline-planning-calendar-controls">
            <Button variant="secondary" onClick={() => changeCursor(-1)} aria-label={mode === "month" ? __("Previous month", "weekly-wildcat-headless") : __("Previous week", "weekly-wildcat-headless")}>‹</Button>
            <Button variant="secondary" onClick={() => setCursor(new Date())}>{__("Today", "weekly-wildcat-headless")}</Button>
            <Button variant="secondary" onClick={() => changeCursor(1)} aria-label={mode === "month" ? __("Next month", "weekly-wildcat-headless") : __("Next week", "weekly-wildcat-headless")}>›</Button>
            <SelectControl
              __nextHasNoMarginBottom
              label={__("Calendar view", "weekly-wildcat-headless")}
              hideLabelFromVision
              value={mode}
              options={[
                { label: __("Month", "weekly-wildcat-headless"), value: "month" },
                { label: __("Week", "weekly-wildcat-headless"), value: "week" }
              ]}
              onChange={(value: string) => setMode(value === "week" ? "week" : "month")}
            />
          </div>
        )}
      />

      <CalendarFilterBar filters={filters} canFilterMine={Boolean(currentUserId)} hasSchedule={hasSchedule} onChange={setFilters} />

      {scheduleError ? (
        <PlanningNotice status="warning">
          {__("Appointments and production due dates could not be loaded. Story dates are still shown.", "weekly-wildcat-headless")}{" "}
          <Button variant="link" onClick={() => setRetryTick((tick) => tick + 1)}>{__("Try again", "weekly-wildcat-headless")}</Button>
        </PlanningNotice>
      ) : null}

      {hasSchedule && (schedule || !scheduleError) ? <NeedsSchedulingPanel items={needsScheduling} loading={isFetching && !schedule} /> : null}

      <div className="byline-planning-calendar-heading-row">
        <h3 id="byline-planning-calendar-heading">{heading}</h3>
        <ul className="byline-planning-calendar-legend" aria-label={__("Calendar event legend", "weekly-wildcat-headless")}>
          {legendTypes.map((type) => (
            <li key={type} className="byline-planning-calendar-legend-item">
              <span className={`byline-planning-calendar-swatch byline-planning-calendar-event-${type}`} aria-hidden="true" />
              {CALENDAR_EVENT_LABELS[type]}
            </li>
          ))}
        </ul>
      </div>
      <div className="byline-planning-calendar-weekdays" role="row">
        {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
          const date = new Date(2024, 0, 1 + offset, 12);
          return <span role="columnheader" key={offset}>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)}</span>;
        })}
      </div>
      <CalendarGrid days={days} events={events} todayKey={todayKey} limit={mode === "week" ? Number.MAX_SAFE_INTEGER : DAY_EVENT_LIMIT} onOpenStory={onOpenStoryProp ? onOpenStory : undefined} />
      <p className="byline-planning-app-status" role="status" aria-live="polite">
        {isFetching && hasSchedule ? __("Loading schedule…", "weekly-wildcat-headless") : ""}
      </p>
      {!onOpenStoryProp ? <p className="byline-planning-help">{__("Select an event to open its WordPress editor link. A parent can provide onOpenStory for in-app quick details.", "weekly-wildcat-headless")}</p> : null}
    </section>
  );
}
