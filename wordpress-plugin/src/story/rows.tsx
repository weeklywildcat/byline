/** Rows shared by every surface that lists story work: Home, Story Peek and the Stories views. Anything visual comes from Item, Badge, Checkbox and Skeleton. */
import type { ComponentProps, ReactNode } from "react";
import { ItemButton } from "../admin-ui/components/item-button";
import { Checkbox } from "../admin-ui/ui/checkbox";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Skeleton } from "../admin-ui/ui/skeleton";
import type { ContributorEntry, EditorialTask } from "../editorial/editorial-model";
import type { EditorialActivityRecord } from "../editorial/activity-model";
import { activityCopy, dateLabel, dayDistance, exactDate, relativeTime } from "../home/newsroom-model";
import { decodeEntities } from "../admin-ui/lib/text";
import { StoryHoverCard } from "./StoryHoverCard";
import { TaskQuickFields, type TaskQuickUpdate } from "./TaskQuickFields";

export function RowSkeletons({ count = 4 }: { count?: number }) {
  return <div aria-label="Loading newsroom work" aria-busy="true" className="flex flex-col gap-4 px-3 pb-2">{Array.from({ length: count }, (_, i) => <div key={i} className="flex flex-col gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></div>)}</div>;
}

/** A row that opens something when `onOpen` is given, and is plain text otherwise. */
export function Row({ onOpen, children, ...props }: { onOpen?: () => void; children: ReactNode } & Omit<ComponentProps<typeof Item>, "onClick">) {
  return onOpen ? <ItemButton onClick={onOpen} {...props}>{children}</ItemButton> : <Item {...props}>{children}</Item>;
}

/** `compact` leaves the story name out of the description, for rows already listed under their story. */
export function TaskRow({ task, storyTitle, compact, timezone, onOpen, onComplete, onUpdate, people = [], canAssign = false, pending, now }: { task: EditorialTask; storyTitle?: string; compact?: boolean; timezone: string; onOpen?: () => void; onComplete: () => void; onUpdate?: TaskQuickUpdate; people?: ContributorEntry[]; canAssign?: boolean; pending?: boolean; now: Date }) {
  const overdue = dayDistance(task.dueAt, timezone, now) < 0;
  const title = onOpen ? <button type="button" className="text-left hover:underline" onClick={onOpen}>{task.title}</button> : <span>{task.title}</span>;
  const hoverableTitle = !compact && task.storyId && storyTitle ? <StoryHoverCard storyId={task.storyId} title={storyTitle}>{title}</StoryHoverCard> : title;
  return <Item size="sm" data-task-id={task.id}>
    <ItemMedia><Checkbox aria-label={`Complete ${task.title}${storyTitle ? ` — ${decodeEntities(storyTitle)}` : ""}`} checked={task.state === "completed"} aria-disabled={pending || undefined} onCheckedChange={(checked) => { if (checked && !pending) onComplete(); }} /></ItemMedia>
    <ItemContent className="gap-1">
      <ItemTitle className="line-clamp-2">{hoverableTitle}</ItemTitle>
      {!compact && storyTitle ? <ItemDescription>{decodeEntities(storyTitle)}</ItemDescription> : null}
      {onUpdate ? <TaskQuickFields task={task} timezone={timezone} now={now} people={people} canAssign={canAssign} disabled={pending} onUpdate={onUpdate} /> : task.priority === "urgent" ? <ItemDescription><span className="font-medium text-warning">Urgent</span></ItemDescription> : null}
    </ItemContent>
    {!onUpdate ? <ItemActions><time className={`text-xs whitespace-nowrap ${overdue ? "text-warning" : "text-muted-foreground"}`} dateTime={task.dueAt || undefined} title={exactDate(task.dueAt, timezone)}>{dateLabel(task.dueAt, timezone, now)}</time></ItemActions> : null}
  </Item>;
}

export function ActivityRow({ item, compact, timezone, now, onOpen }: { item: EditorialActivityRecord; compact?: boolean; timezone: string; now: Date; onOpen?: () => void }) {
  const row = <Row size="xs" onOpen={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-none font-normal">{activityCopy(item)}</ItemTitle>{item.story?.title && !compact ? <ItemDescription>{decodeEntities(item.story.title)}</ItemDescription> : null}</ItemContent>
    <ItemActions><time className="text-xs whitespace-nowrap text-muted-foreground" dateTime={item.occurredAt} title={exactDate(item.occurredAt, timezone)}>{relativeTime(item.occurredAt, timezone, now)}</time></ItemActions>
  </Row>;
  return item.story?.id && item.story.title && !compact ? <StoryHoverCard storyId={item.story.id} title={item.story.title}>{row}</StoryHoverCard> : row;
}
