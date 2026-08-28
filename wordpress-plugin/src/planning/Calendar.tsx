import { Button, SelectControl } from "@wordpress/components";
import { useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import {
  monthCalendarDays,
  planningCalendarEvents,
  planningDateKey,
  weekCalendarDays,
  type CalendarEventType,
  type PlanningCalendarDay,
  type PlanningCalendarEvent,
  type PlanningStory
} from "./planning-model";
import { PlanningEmpty, PlanningStatusBadge, ViewHeader } from "./planning-ui";

export type PlanningCalendarProps = {
  stories: PlanningStory[];
  onOpenStory?: (story: PlanningStory) => void;
};

const EVENT_LABELS: Record<CalendarEventType, string> = {
  deadline: "Deadline",
  planned: "Planned publication",
  scheduled: "Scheduled in WordPress",
  published: "Published"
};

function eventClass(type: CalendarEventType): string {
  return `byline-planning-calendar-event byline-planning-calendar-event-${type}`;
}
function EventItem({ event, onOpenStory }: { event: PlanningCalendarEvent; onOpenStory?: (storyId: number) => void }) {
  const label = `${event.label}: ${event.storyTitle}, ${event.exactDate}`;
  if (onOpenStory) {
    return (
      <button type="button" className={eventClass(event.type)} onClick={() => onOpenStory(event.storyId)} aria-label={label} title={label}>
        <span aria-hidden="true">{event.label}</span>
        <span className="byline-planning-calendar-event-title">{event.storyTitle}</span>
      </button>
    );
  }

  return (
    <a className={eventClass(event.type)} href={event.storyUrl} aria-label={label} title={label}>
      <span aria-hidden="true">{event.label}</span>
      <span className="byline-planning-calendar-event-title">{event.storyTitle}</span>
    </a>
  );
}

function DayCell({
  day,
  events,
  onOpenStory
}: {
  day: PlanningCalendarDay;
  events: PlanningCalendarEvent[];
  onOpenStory?: (storyId: number) => void;
}) {
  const today = planningDateKey(new Date()) === day.key;
  return (
    <div className={`byline-planning-calendar-day${day.isCurrentMonth ? "" : " byline-planning-calendar-day-outside"}${today ? " byline-planning-calendar-day-today" : ""}`}>
      <time dateTime={day.key} className="byline-planning-calendar-day-number" aria-current={today ? "date" : undefined}>
        {day.date.getDate()}
      </time>
      {events.length ? (
        <ul className="byline-planning-calendar-events">
          {events.map((event) => (
            <li key={event.id}><EventItem event={event} onOpenStory={onOpenStory} /></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CalendarGrid({
  days,
  events,
  onOpenStory
}: {
  days: PlanningCalendarDay[];
  events: PlanningCalendarEvent[];
  onOpenStory?: (storyId: number) => void;
}) {
  const eventsByDate = useMemo(() => {
    const map = new Map<string, PlanningCalendarEvent[]>();
    events.forEach((event) => map.set(event.date, [...(map.get(event.date) || []), event]));
    return map;
  }, [events]);

  return (
    <div className="byline-planning-calendar-grid" role="grid" aria-label={__("Planning calendar", "weekly-wildcat-headless")}>
      {days.map((day) => (
        <div className="byline-planning-calendar-grid-cell" role="gridcell" key={day.key}>
          <DayCell day={day} events={eventsByDate.get(day.key) || []} onOpenStory={onOpenStory} />
        </div>
      ))}
    </div>
  );
}

export function PlanningCalendar({ stories, onOpenStory: onOpenStoryProp }: PlanningCalendarProps) {
  const [mode, setMode] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const events = useMemo(() => planningCalendarEvents(stories), [stories]);
  const storyById = useMemo(() => new Map(stories.map((story) => [story.id, story])), [stories]);
  const days = mode === "month" ? monthCalendarDays(cursor) : weekCalendarDays(cursor);

  const changeCursor = (amount: number) => {
    const next = new Date(cursor);
    if (mode === "month") next.setMonth(next.getMonth() + amount);
    else next.setDate(next.getDate() + amount * 7);
    setCursor(next);
  };

  const onOpenStory = (storyId: number) => {
    const story = storyById.get(storyId);
    if (story && onOpenStoryProp) onOpenStoryProp(story);
  };

  const heading = mode === "month"
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(cursor)
    : (() => {
        const week = weekCalendarDays(cursor);
        return `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(week[0].date)}–${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(week[6].date)}`;
      })();

  if (!stories.length) {
    return <PlanningEmpty label={__("Planning calendar", "weekly-wildcat-headless")} instructions={__("No stories with planning dates are available for this calendar.", "weekly-wildcat-headless")} />;
  }

  return (
    <section className="byline-planning-calendar" aria-labelledby="byline-planning-calendar-heading">
      <ViewHeader
        title={__("Calendar", "weekly-wildcat-headless")}
        description={__("Deadlines, planned publication targets, WordPress schedules, and published dates remain separate events.", "weekly-wildcat-headless")}
        actions={(
          <div className="byline-planning-calendar-controls">
            <Button variant="secondary" onClick={() => changeCursor(-1)} aria-label={__("Previous period", "weekly-wildcat-headless")}>‹</Button>
            <Button variant="secondary" onClick={() => setCursor(new Date())}>{__("Today", "weekly-wildcat-headless")}</Button>
            <Button variant="secondary" onClick={() => changeCursor(1)} aria-label={__("Next period", "weekly-wildcat-headless")}>›</Button>
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
      <div className="byline-planning-calendar-heading-row">
        <h3 id="byline-planning-calendar-heading">{heading}</h3>
        <div className="byline-planning-calendar-legend" aria-label={__("Calendar event legend", "weekly-wildcat-headless")}>
          {(Object.keys(EVENT_LABELS) as CalendarEventType[]).map((type) => <PlanningStatusBadge key={type} label={EVENT_LABELS[type]} tone={type === "deadline" ? "warning" : type === "published" ? "success" : type === "scheduled" ? "info" : "neutral"} />)}
        </div>
      </div>
      <div className="byline-planning-calendar-weekdays" role="row">
        {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
          const date = new Date(2024, 0, 1 + offset, 12);
          return <span role="columnheader" key={offset}>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)}</span>;
        })}
      </div>
      <CalendarGrid days={days} events={events} onOpenStory={onOpenStoryProp ? onOpenStory : undefined} />
      {!onOpenStoryProp ? <p className="byline-planning-help">{__("Select an event to open its WordPress editor link. A parent can provide onOpenStory for in-app quick details.", "weekly-wildcat-headless")}</p> : null}
    </section>
  );
}
