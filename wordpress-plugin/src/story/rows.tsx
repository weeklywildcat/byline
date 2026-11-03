/** Rows shared by every surface that lists story work: Home, Story Peek and the Stories views. Anything visual comes from Item, Badge, Checkbox and Skeleton. */
import type { ComponentProps, ReactNode } from "react";
import { Pencil } from "lucide-react";
import { cn } from "../admin-ui/lib/utils";
import { ItemButton } from "../admin-ui/components/item-button";
import { Checkbox } from "../admin-ui/ui/checkbox";
import { Button } from "../admin-ui/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Skeleton } from "../admin-ui/ui/skeleton";
import type { ContributorEntry, EditorialTask } from "../editorial/editorial-model";
import type { EditorialActivityRecord } from "../editorial/activity-model";
import { activityCopy, dateLabel, dayDistance, exactDate, relativeTime } from "../home/newsroom-model";
import { decodeEntities } from "../admin-ui/lib/text";
import { StoryHoverCard } from "./StoryHoverCard";
import { TaskQuickFields, type TaskQuickUpdate } from "./TaskQuickFields";

/** Opt-in density for work queues; shared Item defaults and other surfaces stay intact. */
export const denseRowClassName = "min-h-12 flex-nowrap gap-2 rounded-none border-0 border-b border-border/70 px-3 py-2 last:border-b-0 hover:bg-muted/40";

export function RowSkeletons({ count = 4 }: { count?: number }) {
  return <div aria-label="Loading newsroom work" aria-busy="true" className="flex flex-col gap-4 px-3 pb-2">{Array.from({ length: count }, (_, i) => <div key={i} className="flex flex-col gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></div>)}</div>;
}

/** A row that opens something when `onOpen` is given, and is plain text otherwise. */
export function Row({ onOpen, children, ...props }: { onOpen?: () => void; children: ReactNode } & Omit<ComponentProps<typeof Item>, "onClick">) {
  return onOpen ? <ItemButton onClick={onOpen} {...props}>{children}</ItemButton> : <Item {...props}>{children}</Item>;
}

/** `compact` leaves the story name out of the description, for rows already listed under their story. */
export function TaskRow({ task, storyTitle, compact, dense = false, timezone, onOpen, onEdit, onComplete, onUpdate, people = [], canAssign = false, pending, now }: { task: EditorialTask; storyTitle?: string; compact?: boolean; dense?: boolean; timezone: string; onOpen?: () => void; onEdit?: () => void; onComplete: () => void; onUpdate?: TaskQuickUpdate; people?: ContributorEntry[]; canAssign?: boolean; pending?: boolean; now: Date }) {
  const overdue = dayDistance(task.dueAt, timezone, now) < 0;
  const title = onOpen ? <button type="button" className={cn("text-left hover:underline", dense && "line-clamp-2")} onClick={onOpen}>{task.title}</button> : <span className={dense ? "line-clamp-2" : undefined}>{task.title}</span>;
  const hoverableTitle = !compact && task.storyId && storyTitle ? <StoryHoverCard storyId={task.storyId} title={storyTitle}>{title}</StoryHoverCard> : title;
  return <Item size="sm" data-task-id={task.id} className={dense ? cn(denseRowClassName, "@container/work-row") : undefined}>
    <ItemMedia><Checkbox aria-label={`Complete ${task.title}${storyTitle ? ` — ${decodeEntities(storyTitle)}` : ""}`} checked={task.state === "completed"} aria-disabled={pending || undefined} onCheckedChange={(checked) => { if (checked && !pending) onComplete(); }} /></ItemMedia>
    <ItemContent className={cn("gap-1", dense && "min-w-0 gap-0.5 @xl/work-row:grid @xl/work-row:grid-cols-[minmax(0,1fr)_auto] @xl/work-row:items-center @xl/work-row:gap-x-3")}>
      <ItemTitle className={dense ? "block w-full min-w-0 text-[15px] font-semibold leading-5 @xl/work-row:col-start-1 @xl/work-row:row-start-1" : "line-clamp-2"}>{hoverableTitle}</ItemTitle>
      {!compact && storyTitle ? <ItemDescription className={dense ? "line-clamp-1 text-xs leading-4 @xl/work-row:col-start-1 @xl/work-row:row-start-2" : undefined} title={decodeEntities(storyTitle)}>{decodeEntities(storyTitle)}</ItemDescription> : null}
      {onUpdate ? <TaskQuickFields task={task} timezone={timezone} now={now} people={people} canAssign={canAssign} disabled={pending} onUpdate={onUpdate} className={dense ? "gap-1 @xl/work-row:max-w-72 @xl/work-row:col-start-2 @xl/work-row:row-span-2 @xl/work-row:row-start-1 [&_button]:h-6 [&_button]:max-w-32 [&_button]:min-h-6 [&_button]:py-0 [&_button]:text-xs [&_button]:leading-4" : undefined} /> : task.priority === "urgent" ? <ItemDescription><span className="font-medium text-warning">Urgent</span></ItemDescription> : null}
    </ItemContent>
    {onEdit ? <ItemActions><Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${task.title}`} disabled={pending} onClick={onEdit}><Pencil aria-hidden="true" /></Button></ItemActions> : !onUpdate ? <ItemActions><time className={`text-xs whitespace-nowrap ${overdue ? "text-warning" : "text-muted-foreground"}`} dateTime={task.dueAt || undefined} title={exactDate(task.dueAt, timezone)}>{dateLabel(task.dueAt, timezone, now)}</time></ItemActions> : null}
  </Item>;
}

export function ActivityRow({ item, compact, dense = false, timezone, now, onOpen }: { item: EditorialActivityRecord; compact?: boolean; dense?: boolean; timezone: string; now: Date; onOpen?: () => void }) {
  const row = <Row size="xs" onOpen={onOpen} className={dense ? denseRowClassName : undefined}>
    <ItemContent className={dense ? "min-w-0 gap-0.5" : undefined}><ItemTitle className={dense ? "block w-full line-clamp-2 font-normal leading-5" : "line-clamp-none font-normal"}>{activityCopy(item)}</ItemTitle>{item.story?.title && !compact ? <ItemDescription className={dense ? "line-clamp-1 text-xs leading-4" : undefined} title={decodeEntities(item.story.title)}>{decodeEntities(item.story.title)}</ItemDescription> : null}</ItemContent>
    <ItemActions><time className="text-xs whitespace-nowrap text-muted-foreground" dateTime={item.occurredAt} title={exactDate(item.occurredAt, timezone)}>{relativeTime(item.occurredAt, timezone, now)}</time></ItemActions>
  </Row>;
  return item.story?.id && item.story.title && !compact ? <StoryHoverCard storyId={item.story.id} title={item.story.title}>{row}</StoryHoverCard> : row;
}
