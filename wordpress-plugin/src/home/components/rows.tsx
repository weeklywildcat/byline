/** Home-only rows. Rows Home shares with Story Peek (tasks, activity, loading) live in story/rows. */
import { ArrowUpRight, ChevronRight, CircleAlert, CircleDot } from "lucide-react";
import { ItemButton } from "../../admin-ui/components/item-button";
import { PeopleAvatars, anyPicture } from "../../admin-ui/components/people-avatars";
import { WorkStatusBadge, mediaIntensity } from "../../admin-ui/components/work-status-badge";
import { WorkflowBadge } from "../../story/story-parts";
import { StoryHoverCard } from "../../story/StoryHoverCard";
import { decodeEntities } from "../../admin-ui/lib/text";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../../admin-ui/ui/item";
import type { PlanningStory } from "../../planning/planning-model";
import { Row } from "../../story/rows";
import { dateLabel, mediaAssignmentTitle, mediaStatusLabels, mediaTypeLabels, type AgendaEvent, type AttentionItem, type HomeVisualWork } from "../newsroom-model";

const Chevron = () => <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;

export function StoryRow({ story, timezone, onOpen, now }: { story: PlanningStory; timezone: string; onOpen: () => void; now: Date }) {
  const timing = story.deadline ? `Due ${dateLabel(story.deadline, timezone, now).toLowerCase()}` : story.plannedPublication ? `Planned ${dateLabel(story.plannedPublication, timezone, now).toLowerCase()}` : "No deadline";
  const row = <ItemButton size="sm" onClick={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-2">{decodeEntities(story.title) || "Untitled story"}</ItemTitle><ItemDescription>{timing}{story.openTaskCount ? ` · ${story.openTaskCount} open ${story.openTaskCount === 1 ? "task" : "tasks"}` : ""}</ItemDescription></ItemContent>
    <ItemActions>{story.authors.length > 1 ? <PeopleAvatars people={story.authors} /> : null}<WorkflowBadge workflow={story.workflow} className="max-w-32" /></ItemActions>
  </ItemButton>;
  return <StoryHoverCard storyId={story.id} title={story.title} story={story}>{row}</StoryHoverCard>;
}

export function ReviewRow({ storyId, title, detail, onOpen }: { storyId: number; title: string; detail: string; onOpen: () => void }) {
  const row = <ItemButton size="sm" onClick={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-2">{decodeEntities(title)}</ItemTitle><ItemDescription>{decodeEntities(detail)}</ItemDescription></ItemContent>
    <ItemActions><Chevron /></ItemActions>
  </ItemButton>;
  return <StoryHoverCard storyId={storyId} title={title}>{row}</StoryHoverCard>;
}

export function AgendaItem({ event, timezone, onOpen }: { event: AgendaEvent; timezone: string; onOpen?: () => void }) {
  const time = event.date.includes("T") ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(event.date)) : "";
  const row = <Row size="sm" onOpen={onOpen}>
    <ItemContent><ItemTitle className="line-clamp-2">{decodeEntities(event.title)}</ItemTitle><ItemDescription>{event.label}{event.detail ? ` · ${decodeEntities(event.detail)}` : ""}</ItemDescription></ItemContent>
    {time ? <ItemActions><span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{time}</span></ItemActions> : null}
  </Row>;
  return event.storyId ? <StoryHoverCard storyId={event.storyId} title={event.detail || event.title}>{row}</StoryHoverCard> : row;
}

export function AttentionRow({ item, onOpen }: { item: AttentionItem; onOpen: () => void }) {
  const row = <ItemButton size="sm" onClick={onOpen}>
    <ItemMedia variant="icon">{item.urgent ? <CircleAlert className="text-warning" aria-hidden="true" /> : <CircleDot className="text-muted-foreground" aria-hidden="true" />}</ItemMedia>
    <ItemContent><ItemTitle className="line-clamp-2">{decodeEntities(item.title)}</ItemTitle><ItemDescription>{decodeEntities(item.detail)}</ItemDescription></ItemContent>
    <ItemActions><ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
  </ItemButton>;
  return item.storyId ? <StoryHoverCard storyId={item.storyId} title={item.title}>{row}</StoryHoverCard> : row;
}

export function MediaAssignmentRow({ media, timezone, now, onOpen }: { media: HomeVisualWork; timezone: string; now: Date; onOpen: () => void }) {
  const title = mediaAssignmentTitle(media);
  const row = <ItemButton size="sm" onClick={onOpen}>
    {media.assignee && anyPicture([media.assignee]) ? <ItemMedia><PeopleAvatars people={[media.assignee]} /></ItemMedia> : null}
    <ItemContent>
      <ItemTitle className="line-clamp-2">{decodeEntities(title)}</ItemTitle>
      <ItemDescription>{decodeEntities(media.story.title)} · {mediaTypeLabels[media.type] || "Visual"} · {media.assignee?.name || "Unassigned"}{media.dueAt ? ` · ${dateLabel(media.dueAt, timezone, now)}` : ""}</ItemDescription>
    </ItemContent>
    <ItemActions><WorkStatusBadge kind="production" intensity={mediaIntensity(media.status)} className="max-w-32">{mediaStatusLabels[media.status] || "Needed"}</WorkStatusBadge></ItemActions>
  </ItemButton>;
  return <StoryHoverCard storyId={media.story.id} title={media.story.title}>{row}</StoryHoverCard>;
}

