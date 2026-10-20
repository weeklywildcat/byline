/**
 * Byline's renderers for Schedule-X events. Compact by design: one or two lines
 * of Nova type, an icon and a label so colour is never the only signal, and no
 * Card per event. Click opens Story Peek (handled by the calendar, not here).
 */
import { CalendarClock, Camera, CheckCheck, Clock, Flag, ListTodo, Newspaper, type LucideIcon } from "lucide-react";
import { cn } from "../admin-ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../admin-ui/ui/tooltip";
import { CATEGORY_BY_EVENT_TYPE, CATEGORY_LABELS, type BylineScheduleXEvent, type ScheduleXCategory } from "./schedule-x-adapter";
import type { CalendarEventType } from "./planning-model";

const ICONS: Record<CalendarEventType, LucideIcon> = { appointment: CalendarClock, deadline: Flag, media: Camera, task: ListTodo, planned: Newspaper, scheduled: Clock, published: CheckCheck };

/** One accent per category, from Tailwind's neutral-adjacent hues; the label and icon carry the meaning. */
export const CATEGORY_CLASSES: Record<ScheduleXCategory, string> = {
  appointment: "border-l-sky-600 bg-sky-50 text-sky-950",
  "story-deadline": "border-l-amber-600 bg-amber-50 text-amber-950",
  production: "border-l-violet-600 bg-violet-50 text-violet-950",
  "planned-publication": "border-l-emerald-600 bg-emerald-50 text-emerald-950",
  "wordpress-scheduled": "border-l-slate-600 bg-slate-100 text-slate-900",
  "task-deadline": "border-l-zinc-500 bg-zinc-100 text-zinc-900"
};
export const CATEGORY_DOT_CLASSES: Record<ScheduleXCategory, string> = {
  appointment: "bg-sky-600", "story-deadline": "bg-amber-600", production: "bg-violet-600", "planned-publication": "bg-emerald-600", "wordpress-scheduled": "bg-slate-600", "task-deadline": "bg-zinc-500"
};

/** The event's own words: "Interview Mrs. Hamby", "Canteen due", "Canteen scheduled". */
export function eventText(event: BylineScheduleXEvent): { primary: string; story: string | null } {
  const story = event.storyTitle || null;
  switch (event.bylineType) {
    case "appointment": return { primary: event.title || event.storyTitle, story };
    case "deadline": return { primary: `${event.storyTitle} due`, story: null };
    case "planned": return { primary: `${event.storyTitle} planned`, story: null };
    case "scheduled": return { primary: `${event.storyTitle} scheduled`, story: null };
    case "published": return { primary: `${event.storyTitle} published`, story: null };
    default: return { primary: event.title || event.storyTitle, story: event.title && event.title !== event.storyTitle ? story : null };
  }
}

const timeOf = (event: BylineScheduleXEvent) => event.timed && event.start instanceof Temporal.ZonedDateTime ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: event.start.timeZoneId }).format(new Date(event.start.epochMilliseconds)) : "";

function Chip({ event, children, className }: { event: BylineScheduleXEvent; children: React.ReactNode; className?: string }) {
  const category = CATEGORY_BY_EVENT_TYPE[event.bylineType];
  return <Tooltip>
    <TooltipTrigger render={<div data-event-category={category} data-event-type={event.bylineType} aria-label={`${CATEGORY_LABELS[category]}: ${eventText(event).primary}${timeOf(event) ? `, ${timeOf(event)}` : ""}`} className={cn("flex h-full w-full min-w-0 items-center gap-1 rounded-sm border-l-2 px-1.5 py-0.5 text-xs leading-tight", CATEGORY_CLASSES[category], event.completed && "line-through opacity-70", className)} />}>{children}</TooltipTrigger>
    <TooltipContent className="max-w-72 whitespace-pre-line">{event.tooltip}</TooltipContent>
  </Tooltip>;
}

function Icon({ event }: { event: BylineScheduleXEvent }) {
  const Glyph = ICONS[event.bylineType];
  return <Glyph aria-hidden="true" className="size-3 shrink-0 opacity-80" />;
}

/** One line in a month cell or the all-day row: icon, time when there is one, title. */
export function MonthGridEvent({ calendarEvent: event }: { calendarEvent: BylineScheduleXEvent }) {
  const time = timeOf(event);
  return <Chip event={event}><Icon event={event} />{time ? <span className="shrink-0 tabular-nums opacity-80">{time}</span> : null}<span className="truncate">{eventText(event).primary}</span></Chip>;
}

/** A timed block in the week and day grids: the time, then the title, with the story muted below. */
export function TimeGridEvent({ calendarEvent: event }: { calendarEvent: BylineScheduleXEvent }) {
  const text = eventText(event);
  return <Chip event={event} className="flex-col items-start justify-start gap-0 py-1">
    <span className="flex w-full items-center gap-1"><Icon event={event} /><span className="shrink-0 tabular-nums">{timeOf(event)}</span></span>
    <span className="w-full truncate font-medium">{text.primary}</span>
    {text.story ? <span className="w-full truncate opacity-70">{text.story}</span> : null}
  </Chip>;
}

/** A row in the agenda views: the kind of date is spelled out, and the one editor link a row may offer sits at the end. */
export function AgendaEvent({ calendarEvent: event }: { calendarEvent: BylineScheduleXEvent }) {
  const text = eventText(event);
  const time = timeOf(event);
  return <Chip event={event} className="gap-2 py-1.5 text-sm">
    <Icon event={event} />
    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-medium">{text.primary}</span><span className="truncate text-xs opacity-70">{[time, CATEGORY_LABELS[CATEGORY_BY_EVENT_TYPE[event.bylineType]], text.story].filter(Boolean).join(" · ")}</span></span>
    {event.editHref && (event.bylineType === "appointment" || event.bylineType === "media") ? <a href={event.editHref} className="shrink-0 rounded px-1 text-xs font-medium underline-offset-2 hover:underline">{event.bylineType === "appointment" ? "Edit appointment" : "Open workspace"}</a> : null}
  </Chip>;
}

/** Wired once, at module level: Schedule-X re-renders its calendar when this object's identity changes. */
export const CALENDAR_COMPONENTS = {
  monthGridEvent: MonthGridEvent,
  dateGridEvent: MonthGridEvent,
  timeGridEvent: TimeGridEvent,
  monthAgendaEvent: AgendaEvent,
  weekAgendaEvent: AgendaEvent
};
