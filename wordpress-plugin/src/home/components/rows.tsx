/** Home's rows: shadcn Item compositions. Anything visual comes from Item, Badge, Checkbox and Skeleton. */
import { ArrowUpRight, ChevronRight, CircleAlert, CircleDot } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { ItemButton } from "../../admin-ui/components/item-list";
import { StatusBadge } from "../../admin-ui/components/status-badge";
import { Checkbox } from "../../admin-ui/ui/checkbox";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../../admin-ui/ui/item";
import { Skeleton } from "../../admin-ui/ui/skeleton";
import type { EditorialTask } from "../../editorial/editorial-model";
import type { EditorialActivityRecord } from "../../editorial/activity-model";
import type { PlanningStory } from "../../planning/planning-model";
import { activityCopy, dateLabel, dayDistance, exactDate, relativeTime, mediaStatusLabels, mediaTypeLabels, type AgendaEvent, type AttentionItem, type HomeVisualWork } from "../newsroom-model";

export function RowSkeletons({ count = 4 }: { count?: number }) {
  return <div aria-label="Loading newsroom work" aria-busy="true" className="flex flex-col gap-4 px-3 pb-2">{Array.from({ length: count }, (_, i) => <div key={i} className="flex flex-col gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></div>)}</div>;
}

const Chevron = () => <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;

/** A row that opens something when `onOpen` is given, and is plain text otherwise. */
function Row({ onOpen, children, ...props }: { onOpen?: () => void; children: ReactNode } & Omit<ComponentProps<typeof Item>, "onClick">) {
  return onOpen ? <ItemButton onClick={onOpen} {...props}>{children}</ItemButton> : <Item {...props}>{children}</Item>;
}

export function TaskRow({ task, storyTitle, timezone, onOpen, onComplete, pending, now }: { task: EditorialTask; storyTitle?: string; timezone: string; onOpen?: () => void; onComplete: () => void; pending?: boolean; now: Date }) {
  const overdue = dayDistance(task.dueAt, timezone, now) < 0;
  return <Item size="sm" data-task-id={task.id}>
    <Checkbox aria-label={`Complete ${task.title}${storyTitle ? ` — ${storyTitle}` : ""}`} checked={task.state === "completed"} aria-disabled={pending || undefined} onCheckedChange={(checked) => { if (checked && !pending) onComplete(); }} />
    <ItemContent>
      <ItemTitle className="line-clamp-2">{onOpen ? <button type="button" className="text-left hover:underline" onClick={onOpen}>{task.title}</button> : task.title}</ItemTitle>
      <ItemDescription>{storyTitle || "Newsroom task"}{task.priority === "urgent" ? <span className="font-medium text-warning"> · Urgent</span> : null}</ItemDescription>
    </ItemContent>
    <ItemActions><time className={`text-xs whitespace-nowrap ${overdue ? "text-warning" : "text-muted-foreground"}`} dateTime={task.dueAt || undefined} title={exactDate(task.dueAt, timezone)}>{dateLabel(task.dueAt, timezone, now)}</time></ItemActions>
  </Item>;
}

export function StoryRow({ story, timezone, onOpen, now }: { story: PlanningStory; timezone: string; onOpen: () => void; now: Date }) {
  const timing = story.deadline ? `Due ${dateLabel(story.deadline, timezone, now).toLowerCase()}` : story.plannedPublication ? `Planned ${dateLabel(story.plannedPublication, timezone, now).toLowerCase()}` : "No deadline";
  return <ItemButton size="sm" onClick={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-2">{story.title || "Untitled story"}</ItemTitle><ItemDescription>{timing}{story.openTaskCount ? ` · ${story.openTaskCount} open ${story.openTaskCount === 1 ? "task" : "tasks"}` : ""}</ItemDescription></ItemContent>
    <ItemActions><StatusBadge className="max-w-32 truncate">{story.workflow.label}</StatusBadge></ItemActions>
  </ItemButton>;
}

export function ReviewRow({ title, detail, onOpen }: { title: string; detail: string; onOpen: () => void }) {
  return <ItemButton size="sm" onClick={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-2">{title}</ItemTitle><ItemDescription>{detail}</ItemDescription></ItemContent>
    <ItemActions><Chevron /></ItemActions>
  </ItemButton>;
}

export function AgendaItem({ event, timezone, onOpen }: { event: AgendaEvent; timezone: string; onOpen?: () => void }) {
  const time = event.date.includes("T") ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(event.date)) : "";
  return <Row size="sm" onOpen={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-2">{event.title}</ItemTitle><ItemDescription>{event.label}{event.detail ? ` · ${event.detail}` : ""}</ItemDescription></ItemContent>
    {time ? <ItemActions><span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{time}</span></ItemActions> : null}
  </Row>;
}

export function AttentionRow({ item, onOpen }: { item: AttentionItem; onOpen: () => void }) {
  return <ItemButton size="sm" onClick={onOpen}>
    <ItemMedia variant="icon">{item.urgent ? <CircleAlert className="text-warning" aria-hidden="true" /> : <CircleDot className="text-muted-foreground" aria-hidden="true" />}</ItemMedia>
    <ItemContent><ItemTitle className="line-clamp-2">{item.title}</ItemTitle><ItemDescription>{item.detail}</ItemDescription></ItemContent>
    <ItemActions><ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
  </ItemButton>;
}

export function MediaAssignmentRow({ media, timezone, now, onOpen }: { media: HomeVisualWork; timezone: string; now: Date; onOpen: () => void }) {
  return <ItemButton size="sm" onClick={onOpen}>
    <ItemContent>
      <ItemTitle className="line-clamp-2">{media.title || media.story.title}</ItemTitle>
      <ItemDescription>{media.title ? `${media.story.title} · ` : ""}{mediaTypeLabels[media.type] || "Visual"} · {media.assignee?.name || "Unassigned"}{media.dueAt ? ` · ${dateLabel(media.dueAt, timezone, now)}` : ""}</ItemDescription>
    </ItemContent>
    <ItemActions><StatusBadge tone={media.status === "needed" ? "attention" : "neutral"} className="max-w-32 truncate">{mediaStatusLabels[media.status] || "Needed"}</StatusBadge></ItemActions>
  </ItemButton>;
}

export function ActivityRow({ item, timezone, now, onOpen }: { item: EditorialActivityRecord; timezone: string; now: Date; onOpen?: () => void }) {
  return <Row size="xs" onOpen={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-none font-normal">{activityCopy(item)}</ItemTitle>{item.story?.title ? <ItemDescription>{item.story.title}</ItemDescription> : null}</ItemContent>
    <ItemActions><time className="text-xs whitespace-nowrap text-muted-foreground" dateTime={item.occurredAt} title={exactDate(item.occurredAt, timezone)}>{relativeTime(item.occurredAt, timezone, now)}</time></ItemActions>
  </Row>;
}
