/** Home-only rows. Rows Home shares with Story Peek (tasks, activity, loading) live in story/rows. */
import { ArrowUpRight, ChevronRight, CircleAlert, CircleDot } from "lucide-react";
import { ItemButton } from "../../admin-ui/components/item-button";
import { PeopleAvatars, anyPicture } from "../../admin-ui/components/people-avatars";
import { StatusBadge } from "../../admin-ui/components/status-badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../../admin-ui/ui/item";
import type { PlanningStory } from "../../planning/planning-model";
import { Row } from "../../story/rows";
import { dateLabel, mediaStatusLabels, mediaTypeLabels, type AgendaEvent, type AttentionItem, type HomeVisualWork } from "../newsroom-model";

const Chevron = () => <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;

export function StoryRow({ story, timezone, onOpen, now }: { story: PlanningStory; timezone: string; onOpen: () => void; now: Date }) {
  const timing = story.deadline ? `Due ${dateLabel(story.deadline, timezone, now).toLowerCase()}` : story.plannedPublication ? `Planned ${dateLabel(story.plannedPublication, timezone, now).toLowerCase()}` : "No deadline";
  return <ItemButton size="sm" onClick={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-2">{story.title || "Untitled story"}</ItemTitle><ItemDescription>{timing}{story.openTaskCount ? ` · ${story.openTaskCount} open ${story.openTaskCount === 1 ? "task" : "tasks"}` : ""}</ItemDescription></ItemContent>
    <ItemActions>{story.authors.length > 1 ? <PeopleAvatars people={story.authors} /> : null}<StatusBadge className="max-w-32 truncate">{story.workflow.label}</StatusBadge></ItemActions>
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
    {media.assignee && anyPicture([media.assignee]) ? <ItemMedia><PeopleAvatars people={[media.assignee]} /></ItemMedia> : null}
    <ItemContent>
      <ItemTitle className="line-clamp-2">{media.title || media.story.title}</ItemTitle>
      <ItemDescription>{media.title ? `${media.story.title} · ` : ""}{mediaTypeLabels[media.type] || "Visual"} · {media.assignee?.name || "Unassigned"}{media.dueAt ? ` · ${dateLabel(media.dueAt, timezone, now)}` : ""}</ItemDescription>
    </ItemContent>
    <ItemActions><StatusBadge tone={media.status === "needed" ? "attention" : "neutral"} className="max-w-32 truncate">{mediaStatusLabels[media.status] || "Needed"}</StatusBadge></ItemActions>
  </ItemButton>;
}

