import type { ReactNode } from "react";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import type { EditorialTask } from "../../editorial/editorial-model";
import type { EditorialActivityRecord } from "../../editorial/activity-model";
import type { PlanningStory } from "../../planning/planning-model";
import { activityCopy, dateLabel, dayDistance, exactDate, mediaStatusLabels, mediaTypeLabels, type AgendaEvent, type AttentionItem, type HomeVisualWork } from "../newsroom-model";

export function Surface({ title, children, className = "", action, subtitle }: { title: string; children: ReactNode; className?: string; action?: ReactNode; subtitle?: string }) {
  return <Card className={`home-surface ${className}`}><header className="home-surface-heading"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{action}</header>{children}</Card>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="home-empty">{children}</p>;
}
export function RowSkeletons({ count = 4 }: { count?: number }) {
  return <div aria-label="Loading newsroom work" aria-busy="true" className="home-skeletons">{Array.from({ length: count }, (_, i) => <div key={i}><Skeleton className="h-3 w-3/4" /><Skeleton className="mt-2 h-2.5 w-1/3" /></div>)}</div>;
}
export function TaskRow({ task, storyTitle, timezone, onOpen, onComplete, pending, now }: { task: EditorialTask; storyTitle?: string; timezone: string; onOpen?: () => void; onComplete: () => void; pending?: boolean; now: Date }) {
  return <li className="home-task-row" data-task-id={task.id}>
    <Checkbox aria-label={`Complete ${task.title}${storyTitle ? ` — ${storyTitle}` : ""}`} checked={task.state === "completed"} aria-disabled={pending || undefined} onCheckedChange={(checked) => { if (checked && !pending) onComplete(); }} />
    <div className="home-row-copy">{onOpen ? <button type="button" className="home-row-title" onClick={onOpen}>{task.title}</button> : <span className="home-row-title">{task.title}</span>}<span className="home-meta">{storyTitle || "Newsroom task"}{task.priority === "urgent" ? <span className="home-urgent-label">Urgent</span> : null}</span></div>
    <time className={`home-due ${dayDistance(task.dueAt, timezone, now) < 0 ? "home-overdue" : ""}`} dateTime={task.dueAt || undefined} title={exactDate(task.dueAt, timezone)}>{dateLabel(task.dueAt, timezone, now)}</time>
  </li>;
}
export function StoryRow({ story, timezone, onOpen, now }: { story: PlanningStory; timezone: string; onOpen: () => void; now: Date }) {
  return <li><button type="button" className="home-story-row" onClick={onOpen}><span className="home-row-copy"><span className="home-row-title">{story.title || "Untitled story"}</span><span className="home-meta">{story.deadline ? `Due ${dateLabel(story.deadline, timezone, now).toLowerCase()}` : story.plannedPublication ? `Planned ${dateLabel(story.plannedPublication, timezone, now).toLowerCase()}` : "No deadline"}{story.openTaskCount ? ` · ${story.openTaskCount} open ${story.openTaskCount === 1 ? "task" : "tasks"}` : ""}</span></span><Badge variant="outline" className="home-workflow">{story.workflow.label}</Badge></button></li>;
}
export function AgendaItem({ event, timezone, onOpen }: { event: AgendaEvent; timezone: string; onOpen?: () => void }) {
  const time = event.date.includes("T") ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(event.date)) : "";
  const copy = <><span className="home-row-title">{event.title}</span><span className="home-meta"><span className="home-agenda-label">{event.label}{event.detail ? ` · ${event.detail}` : ""}</span><span>{time}</span></span></>;
  return <li>{onOpen ? <button type="button" className="home-agenda-row" onClick={onOpen}>{copy}</button> : <div className="home-agenda-row">{copy}</div>}</li>;
}
export function AttentionRow({ item, onOpen }: { item: AttentionItem; onOpen: () => void }) {
  return <li><button type="button" className="home-attention-row" onClick={onOpen}>{item.urgent ? <CircleAlert size={15} className="home-attention-icon" aria-hidden="true" /> : <span className="home-attention-dot" />}<span className="home-row-copy"><span className="home-row-title">{item.title}</span><span className="home-meta">{item.detail}</span></span><ArrowUpRight size={14} className="home-row-arrow" aria-hidden="true" /></button></li>;
}
export function MediaAssignmentRow({ media, timezone, now, onOpen }: { media: HomeVisualWork; timezone: string; now: Date; onOpen: () => void }) {
  return <li><button type="button" className="home-story-row" onClick={onOpen}><span className="home-row-copy"><span className="home-row-title">{media.title || media.story.title}</span><span className="home-meta">{media.title ? `${media.story.title} · ` : ""}{mediaTypeLabels[media.type] || "Visual"} · {media.assignee?.name || "Unassigned"}{media.dueAt ? ` · ${dateLabel(media.dueAt, timezone, now)}` : ""}</span></span><Badge variant="outline" className="home-workflow">{mediaStatusLabels[media.status] || "Needed"}</Badge></button></li>;
}
export function ActivityRow({ item, timezone, onOpen }: { item: EditorialActivityRecord; timezone: string; onOpen?: () => void }) {
  const content = <><span className="home-activity-mark" aria-hidden="true" /><span className="home-row-copy"><span className="home-activity-copy">{activityCopy(item)}</span>{item.story?.title ? <span className="home-meta">{item.story.title}</span> : null}</span><time className="home-activity-time" dateTime={item.occurredAt} title={exactDate(item.occurredAt, timezone)}>{exactDate(item.occurredAt, timezone)}</time></>;
  return <li>{onOpen ? <button type="button" className="home-activity-row" onClick={onOpen}>{content}</button> : <div className="home-activity-row">{content}</div>}</li>;
}
export function PersonAvatar({ name, url }: { name: string; url?: string }) {
  return <Avatar size="sm"><AvatarImage src={url} alt="" /><AvatarFallback>{name.split(/\s+/).slice(0, 2).map((s) => s[0]).join("")}</AvatarFallback></Avatar>;
}
