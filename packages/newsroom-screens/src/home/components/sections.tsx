/**
 * Home's newsroom cards: the week strip, the Desk, the Site and the Budget.
 * Every visual piece is a Nova primitive (Card, Button, Badge, Table, Tabs)
 * with Tailwind layout; colors are Nova tokens and the shared workBadgeColors.
 */
import { useEffect, useId, useRef, type ComponentType, type ReactElement, type ReactNode } from "react";
import { ArrowRight, CalendarCheck, Camera, CircleAlert, CircleCheck, Clock, Flag, HeartPulse, LoaderCircle, Mic, Plus, type LucideIcon } from "lucide-react";
import { anyPicture, PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import { WorkStatusBadge, workBadgeColors } from "@byline/newsroom-ui/components/work-status-badge";
import { decodeEntities } from "@byline/newsroom-ui/lib/text";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Empty, EmptyDescription } from "@byline/newsroom-ui/ui/empty";
import { ItemButton } from "@byline/newsroom-ui/components/item-button";
import { ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { DEFAULT_WORKFLOW_STATUSES, type PlanningStory } from "../../planning/planning-model";
import { StoryContextMenu } from "../../planning/StoryActionsMenu";
import { StoryHoverCard } from "../../story/StoryHoverCard";
import { productionSignal, StoryTitleButton, WorkflowBadge, workflowBadgeSpec } from "../../story/story-parts";
import { publishDate, type DeskStage } from "../desk-model";
import { dayDistance, exactDate, shortDateTime, type AgendaCategory, type AgendaEvent, type WeekAgenda } from "../newsroom-model";

/* ------------------------------------------------------------- card frame */

/** A Home section: a Card with an icon, a two-line title and an action, rows flush with its edges. */
export function HomeCard({ icon: Icon, title, description, action, below, footer, className, children }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; below?: ReactNode; footer?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId();
  return <Card role="region" aria-labelledby={id} className={cn("gap-0 py-0 shadow-xs", className)}>
    <CardHeader className="flex items-center gap-3 border-b border-border/60 px-4.5 py-3.5 [.border-b]:pb-3.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <CardTitle id={id} role="heading" aria-level={2} className="text-sm leading-5 font-semibold">{title}</CardTitle>
        {description ? <CardDescription className="line-clamp-2 text-xs leading-4 sm:line-clamp-1">{description}</CardDescription> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
    </CardHeader>
    {below}
    <CardContent className="px-0">{children}</CardContent>
    {footer ? <div data-home-card-footer="" className="flex items-center justify-between gap-3 border-t bg-muted/40 px-4.5 py-2">{footer}</div> : null}
  </Card>;
}

/** A card-header link ("Calendar →"). */
export const cardLink = (href: string, label: string, ariaLabel?: string) => <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={href} aria-label={ariaLabel}>{label}<ArrowRight data-icon="inline-end" aria-hidden="true" /></a>;

/** A group's plain heading inside a card, with its count. */
export function GroupHeading({ label, count }: { label: string; count: number }) {
  return <h3 className="flex items-center gap-2 px-4.5 pt-4 pb-2 text-xs font-semibold text-foreground/80">{label}<Badge variant="secondary" className="h-4 min-w-4 px-1.5 text-[11px] tabular-nums">{count}</Badge></h3>;
}

export function Quiet({ children }: { children: ReactNode }) {
  return <Empty className="min-h-0 items-start px-4.5 py-3 text-left"><EmptyDescription>{children}</EmptyDescription></Empty>;
}

/* --------------------------------------------------------------- the week */

/** The calendar's fixed categories. The icon always carries the meaning; hue only repeats it. */
export const AGENDA_CATEGORIES: Record<AgendaCategory, { label: string; icon: LucideIcon; className: string }> = {
  publication: { label: "Publication", icon: CalendarCheck, className: "text-green-700 dark:text-green-300" },
  deadline: { label: "Story deadline", icon: Flag, className: "text-orange-700 dark:text-orange-300" },
  appointment: { label: "Appointment", icon: Mic, className: "text-muted-foreground" },
  photo: { label: "Photo shoot", icon: Camera, className: "text-blue-700 dark:text-blue-300" }
};

const DAY_ITEM_LIMIT = 4;
const dayDate = (day: string) => new Date(`${day}T12:00:00Z`);
const weekdayName = (day: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(dayDate(day));
const dayLong = (day: string) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(dayDate(day));

function WeekItem({ event, timezone, onOpen }: { event: AgendaEvent; timezone: string; onOpen?: () => void }) {
  const category = AGENDA_CATEGORIES[event.category];
  const Icon = category.icon;
  const time = event.date.includes("T") && event.category !== "deadline" ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(event.date)) : "";
  const label = `${event.label}${time ? ` ${time}` : ""}: ${decodeEntities(event.title)}${event.detail ? ` · ${decodeEntities(event.detail)}` : ""}`;
  const body = <>
    <Icon className={cn("mt-0.5 size-3 shrink-0", category.className)} aria-hidden="true" />
    <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{time ? <span className="text-muted-foreground tabular-nums">{time} </span> : null}{decodeEntities(event.title)}</span>
  </>;
  const className = "flex w-full items-start gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs leading-4 text-foreground";
  const item = onOpen
    ? <button type="button" data-week-event={event.category} className={cn(className, "hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring")} aria-label={label} title={label} onClick={onOpen}>{body}</button>
    : <span data-week-event={event.category} className={className} title={label}>{body}</span>;
  return <li>{event.storyId ? <StoryHoverCard storyId={event.storyId} title={event.detail || event.title}>{item}</StoryHoverCard> : item}</li>;
}

/**
 * Seven site days, Sunday to Saturday, always side by side. When Home is too
 * narrow for seven readable columns (a tablet held upright, a phone) the strip
 * scrolls sideways with today brought into view. `onPlan` (a weekday with
 * nothing to publish) opens New story.
 */
export function WeekStrip({ week, timezone, calendarHref, onOpen, onPlan }: { week: WeekAgenda; timezone: string; calendarHref?: string; onOpen: (event: AgendaEvent) => (() => void) | undefined; onPlan?: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  // A scrolled strip opens on today (or the week's first day), never mid-column.
  useEffect(() => {
    const strip = scroller.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const today = strip.querySelector<HTMLElement>("[data-today]");
    strip.scrollLeft = today ? Math.max(0, today.offsetLeft - strip.offsetLeft) : 0;
  }, [week.start]);
  return <>
    <div ref={scroller} tabIndex={-1} className="snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none [scrollbar-width:thin]">
    <ol aria-label="Days" className="grid min-w-full grid-cols-[repeat(7,minmax(136px,1fr))]">
      {week.days.map((day) => {
        const shown = day.events.slice(0, DAY_ITEM_LIMIT);
        const more = day.events.length - shown.length;
        return <li key={day.day} data-week-day={day.day} data-today={day.isToday || undefined} aria-label={dayLong(day.day)} aria-current={day.isToday ? "date" : undefined}
          className={cn("relative flex min-h-40 min-w-0 snap-start flex-col gap-2 border-border/50 px-3 py-3 not-last:border-r", day.isToday && "bg-muted/40 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-foreground", day.isPast && "opacity-70")}>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground">{weekdayName(day.day)}</span>
            <span className="text-base leading-6 font-semibold tabular-nums">{dayDate(day.day).getUTCDate()}</span>
            <span className={cn("text-xs leading-4", day.isToday ? "font-medium text-foreground" : day.nothingPlanned ? "text-warning" : "text-muted-foreground")}>
              {day.isToday ? (day.toPublish ? `Today · ${day.toPublish} to publish` : day.nothingPlanned ? "Today · Nothing planned" : "Today") : day.toPublish ? `${day.toPublish} to publish` : day.nothingPlanned ? "Nothing planned" : " "}
            </span>
          </div>
          {shown.length ? <ul className="-mx-1 flex flex-col gap-0.5" aria-label={`${dayLong(day.day)} commitments`}>
            {shown.map((event) => <WeekItem key={event.id} event={event} timezone={timezone} onOpen={onOpen(event)} />)}
            {more > 0 ? <li className="px-1 text-xs leading-4 text-muted-foreground">{calendarHref ? <a href={calendarHref} className="hover:underline">+{more} more</a> : `+${more} more`}</li> : null}
          </ul> : null}
          {day.nothingPlanned && onPlan ? <Button type="button" variant="outline" size="xs" className="w-fit border-dashed text-muted-foreground shadow-none" onClick={onPlan} aria-label={`Plan a story for ${dayLong(day.day)}`}><Plus data-icon="inline-start" aria-hidden="true" />Plan a story</Button> : null}
        </li>;
      })}
    </ol>
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/40 px-4.5 py-2 text-xs text-muted-foreground" aria-label="Legend">
      {(Object.keys(AGENDA_CATEGORIES) as AgendaCategory[]).map((key) => { const { icon: Icon, label, className } = AGENDA_CATEGORIES[key]; return <span key={key} className="inline-flex items-center gap-1.5"><Icon className={cn("size-3", className)} aria-hidden="true" />{label}</span>; })}
      {week.nextWeekCount ? <span className="ml-auto tabular-nums">{week.nextWeekCount} more next week</span> : null}
    </div>
  </>;
}

/* --------------------------------------------------------------- the desk */

const stageSpec = (id: string) => workflowBadgeSpec[id] ?? { kind: "neutral" as const, intensity: "settled" as const };

/** Where the scope's active stories sit: a stacked bar and a Stage · Stories · Last change table. */
export function DeskStages({ stages, stageHref }: { stages: DeskStage[]; stageHref?: (stage: DeskStage) => string }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  return <div className="flex flex-col gap-3 px-4.5 pt-4 pb-3">
    <div role="img" aria-label={`${total} active ${total === 1 ? "story" : "stories"}: ${stages.map((stage) => `${stage.label} ${stage.count}`).join(", ")}`} className="flex h-2 gap-0.5 overflow-hidden rounded-full">
      {stages.map((stage) => { const { kind, intensity } = stageSpec(stage.id); return <span key={stage.id} data-desk-segment={stage.id} className={cn("h-full min-w-1 border", workBadgeColors[kind][intensity])} style={{ flexGrow: stage.count, flexBasis: 0 }} />; })}
    </div>
    <Table className="text-sm" aria-label="Stories by stage">
      <TableHeader>
        <TableRow className="border-border/50 hover:bg-transparent">
          <TableHead className="h-7 px-0 text-xs font-medium text-muted-foreground">Stage</TableHead>
          <TableHead className="h-7 w-16 text-right text-xs font-medium text-muted-foreground">Stories</TableHead>
          <TableHead className="h-7 w-24 pr-0 text-right text-xs font-medium text-muted-foreground" title="Days since the least recently changed story in the stage last changed">Last change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stages.map((stage) => {
          const { kind, intensity } = stageSpec(stage.id);
          const label = <><span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[2px] border", workBadgeColors[kind][intensity])} />{stage.label}</>;
          return <TableRow key={stage.id} data-desk-stage={stage.id} className="border-border/50 hover:bg-muted/40">
            <TableCell className="h-8 px-0 py-1">{stageHref ? <a href={stageHref(stage)} className="inline-flex items-center gap-2 hover:underline">{label}</a> : <span className="inline-flex items-center gap-2">{label}</span>}</TableCell>
            <TableCell className="py-1 text-right font-medium tabular-nums">{stage.count}</TableCell>
            <TableCell className={cn("py-1 pr-0 text-right text-xs tabular-nums", stage.stale ? "font-medium text-warning" : "text-muted-foreground")}>{stage.ageDays === null ? "—" : stage.ageDays === 0 ? "Today" : `${stage.ageDays}d`}{stage.stale ? <span className="sr-only"> (stale)</span> : null}</TableCell>
          </TableRow>;
        })}
      </TableBody>
    </Table>
  </div>;
}

/* --------------------------------------------------------------- the site */

export type SiteRow = { key: string; icon: LucideIcon; iconClassName?: string; label: string; value: ReactNode; title?: string; href?: string; onOpen?: () => void };

/** Three quiet facts about the public site, each one row with its icon, label and value. */
export function SiteRows({ rows }: { rows: SiteRow[] }) {
  return <ul className="flex flex-col">
    {rows.map((row) => {
      const Icon = row.icon;
      const content = <><Icon className={cn("size-4 shrink-0", row.iconClassName ?? "text-muted-foreground")} aria-hidden="true" /><span className="min-w-0 flex-1 truncate text-sm">{row.label}</span><span className="max-w-[60%] truncate text-right text-sm tabular-nums" title={row.title}>{row.value}</span></>;
      const className = "flex h-10 w-full items-center gap-3 px-4.5 text-left";
      return <li key={row.key} data-site-row={row.key} className="border-border/50 not-first:border-t">
        {row.href ? <a href={row.href} className={cn(className, "hover:bg-muted/40")}>{content}</a>
          : row.onOpen ? <button type="button" className={cn(className, "hover:bg-muted/40")} onClick={row.onOpen}>{content}</button>
            : <div className={className}>{content}</div>}
      </li>;
    })}
  </ul>;
}

export const siteIcons = { live: CircleCheck, pending: LoaderCircle, failed: CircleAlert, scheduled: Clock, health: HeartPulse } satisfies Record<string, ComponentType>;

/* ------------------------------------------------------------- the budget */

function PublishCell({ story, timezone, now, inline = false }: { story: PlanningStory; timezone: string; now: Date; inline?: boolean }) {
  const value = publishDate(story);
  if (!value) return <span className="text-muted-foreground">Not scheduled</span>;
  const overdue = dayDistance(value, timezone, now);
  if (overdue < 0) return <time dateTime={value} title={exactDate(value, timezone)} className="font-medium text-warning">{Math.abs(overdue)}d overdue</time>;
  if (inline) return <time dateTime={value} title={exactDate(value, timezone)} className="text-muted-foreground tabular-nums">{story.publicationState.isScheduled ? "Scheduled" : "Planned"} {shortDateTime(value, timezone)}</time>;
  return <span className="flex flex-col items-end">
    <time dateTime={value} title={exactDate(value, timezone)} className="leading-5 text-foreground">{shortDateTime(value, timezone)}</time>
    <span className="text-xs leading-4 text-muted-foreground">{story.publicationState.isScheduled ? "Scheduled" : "Planned"}</span>
  </span>;
}

function BudgetPeople({ story }: { story: PlanningStory }) {
  const writers = story.authors.length ? story.authors : story.writer ? [story.writer] : [];
  if (!writers.length) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  return anyPicture(writers) ? <PeopleAvatars people={writers} /> : <span className="block truncate text-xs" title={writers.map((person) => person.name).join(", ")}>{writers.map((person) => person.name).join(", ")}</span>;
}

/** The Budget table, as in the Stories List: quiet rows that open Story Peek, with the List's hover preview and context menu. */
export function BudgetTable({ stories, label, timezone, now, onOpen, workspaceUrl }: { stories: PlanningStory[]; label: string; timezone: string; now: Date; onOpen: (storyId: number) => void; workspaceUrl?: (storyId: number) => string }) {
  const context = (story: PlanningStory, child: ReactElement) => workspaceUrl
    ? <StoryContextMenu key={story.id} story={story} statuses={DEFAULT_WORKFLOW_STATUSES} canMove={false} onMove={() => undefined} workspaceUrl={workspaceUrl} onOpenStory={onOpen}>{child}</StoryContextMenu>
    : child;
  // A narrow Home (a phone, a tablet held upright beside the sidebar) lists stories as rows; a wide one is a table.
  return <>
  <div className="hidden @2xl/home:block">
  <Table className="table-fixed border-collapse" aria-label={label}>
    <TableHeader className="bg-muted/40">
      <TableRow className="border-border/50 hover:bg-transparent">
        <TableHead className="h-9 pl-4.5 text-xs font-semibold text-muted-foreground">Story</TableHead>
        <TableHead className="hidden h-9 w-[12%] text-xs font-semibold text-muted-foreground @3xl/home:table-cell">Section</TableHead>
        <TableHead className="hidden h-9 w-[14%] text-xs font-semibold text-muted-foreground @3xl/home:table-cell">People</TableHead>
        <TableHead className="h-9 w-32 text-xs font-semibold text-muted-foreground @3xl/home:w-[14%]">Workflow</TableHead>
        <TableHead className="hidden h-9 w-[14%] text-xs font-semibold text-muted-foreground @3xl/home:table-cell">Art</TableHead>
        <TableHead className="h-9 w-28 pr-4.5 text-right text-xs font-semibold text-muted-foreground @3xl/home:w-[13%]">Publish</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {stories.map((story) => {
        const art = productionSignal(story);
        return context(story, <TableRow key={story.id} data-story-id={story.id} className="h-14 cursor-pointer border-border/50 hover:bg-muted/40" onClick={(event) => {
          // Only bare row/cell space opens Peek; the title button is the keyboard route.
          if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
            (event.target === event.currentTarget || (event.target instanceof HTMLTableCellElement && event.target.parentElement === event.currentTarget))) onOpen(story.id);
        }}>
          <TableCell className="py-2 pl-4.5"><StoryHoverCard storyId={story.id} title={story.title} story={story}><StoryTitleButton story={story} onOpen={onOpen} className="block w-full truncate text-sm font-medium" /></StoryHoverCard></TableCell>
          <TableCell className="hidden truncate py-2 text-xs text-muted-foreground @3xl/home:table-cell" title={story.sections?.join(", ")}>{story.sections?.length ? story.sections.join(", ") : "—"}</TableCell>
          <TableCell className="hidden py-2 @3xl/home:table-cell"><BudgetPeople story={story} /></TableCell>
          <TableCell className="py-2 [&_[data-slot=badge]]:max-w-full"><WorkflowBadge workflow={story.workflow} /></TableCell>
          <TableCell className="hidden py-2 @3xl/home:table-cell [&_[data-slot=badge]]:max-w-full">{art ? <WorkStatusBadge kind={art.kind} intensity={art.intensity}>{art.label}</WorkStatusBadge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
          <TableCell className="py-2 pr-4.5 text-right text-sm tabular-nums"><PublishCell story={story} timezone={timezone} now={now} /></TableCell>
        </TableRow>);
      })}
    </TableBody>
  </Table>
  </div>
  <ItemGroup aria-label={label} className="gap-0 @2xl/home:hidden">
    {stories.map((story) => {
      const art = productionSignal(story);
      return context(story, <ItemButton key={story.id} size="sm" data-story-id={story.id} className="min-h-14 flex-nowrap rounded-none border-0 border-t border-border/50 px-4.5 py-2.5 first:border-t-0 hover:bg-muted/40" onClick={() => onOpen(story.id)}>
        <ItemContent className="min-w-0 gap-1">
          <ItemTitle className="block w-full line-clamp-2 text-sm leading-5 font-medium">{decodeEntities(story.title) || "Untitled story"}</ItemTitle>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs [&_[data-slot=badge]]:max-w-40">
            <WorkflowBadge workflow={story.workflow} />
            {art ? <WorkStatusBadge kind={art.kind} intensity={art.intensity}>{art.label}</WorkStatusBadge> : null}
            <PublishCell story={story} timezone={timezone} now={now} inline />
          </span>
        </ItemContent>
      </ItemButton>);
    })}
  </ItemGroup>
  </>;
}
