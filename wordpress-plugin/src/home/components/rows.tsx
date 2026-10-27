/** Home-only rows. Rows Home shares with Story Peek (tasks, activity, loading) live in story/rows. */
import { ArrowUpRight, ChevronRight, CircleAlert, CircleDot } from "lucide-react";
import { ItemButton } from "../../admin-ui/components/item-button";
import { PeopleAvatars, anyPicture } from "../../admin-ui/components/people-avatars";
import { WorkStatusBadge, mediaIntensity } from "../../admin-ui/components/work-status-badge";
import { WorkflowBadge } from "../../story/story-parts";
import { StoryHoverCard } from "../../story/StoryHoverCard";
import { decodeEntities } from "../../admin-ui/lib/text";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../../admin-ui/ui/item";
import type { PlanningPerson, PlanningStory } from "../../planning/planning-model";
import { denseRowClassName, Row } from "../../story/rows";
import { dateLabel, dayDistance, exactDate, mediaAssignmentTitle, mediaStatusLabels, mediaTypeLabels, type AgendaEvent, type AttentionItem, type HomeVisualWork } from "../newsroom-model";

const Chevron = () => <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;

export function StoryRow({ story, timezone, onOpen, now }: { story: PlanningStory; timezone: string; onOpen: () => void; now: Date }) {
  const timing = story.deadline ? `Due ${dateLabel(story.deadline, timezone, now).toLowerCase()}` : story.plannedPublication ? `Planned ${dateLabel(story.plannedPublication, timezone, now).toLowerCase()}` : "No deadline";
  const writers = story.authors.length ? story.authors : story.writer ? [story.writer] : [];
  const tasks = story.openTaskCount ? ` · ${story.openTaskCount} open ${story.openTaskCount === 1 ? "task" : "tasks"}` : "";
  const row = <ItemButton size="sm" className={denseRowClassName} aria-label={`${decodeEntities(story.title) || "Untitled story"} ${timing}${tasks} ${story.workflow.label}${writers.length ? ` ${writers.map((person) => person.name).join(", ")}` : ""}`} onClick={onOpen}>
    {anyPicture(writers) ? <ItemMedia><PeopleAvatars people={writers} /></ItemMedia> : null}
    <ItemContent className="min-w-0 gap-0.5"><ItemTitle className="block w-full line-clamp-2 text-[15px] font-semibold leading-5">{decodeEntities(story.title) || "Untitled story"}</ItemTitle><ItemDescription className="text-xs leading-4"><span title={exactDate(story.deadline || story.plannedPublication, timezone)} className={story.deadline && dayDistance(story.deadline, timezone, now) < 0 ? "text-warning" : undefined}>{timing}</span>{tasks}</ItemDescription></ItemContent>
    <ItemActions className="shrink-0"><WorkflowBadge workflow={story.workflow} className="max-w-32" /></ItemActions>
  </ItemButton>;
  return <StoryHoverCard storyId={story.id} title={story.title} story={story}>{row}</StoryHoverCard>;
}

export function ReviewRow({ storyId, title, detail, people = [], onOpen }: { storyId: number; title: string; detail: string; people?: PlanningPerson[]; onOpen: () => void }) {
  const row = <ItemButton size="sm" className={denseRowClassName} aria-label={`${decodeEntities(title)} ${decodeEntities(detail)}`} onClick={onOpen}>
    {anyPicture(people) ? <ItemMedia><PeopleAvatars people={people} /></ItemMedia> : null}
    <ItemContent className="min-w-0 gap-0.5"><ItemTitle className="block w-full line-clamp-2 text-[15px] font-semibold leading-5">{decodeEntities(title)}</ItemTitle><ItemDescription className="line-clamp-1 text-xs leading-4" title={decodeEntities(detail)}>{decodeEntities(detail)}</ItemDescription></ItemContent>
    <ItemActions><Chevron /></ItemActions>
  </ItemButton>;
  return <StoryHoverCard storyId={storyId} title={title}>{row}</StoryHoverCard>;
}

export function AgendaItem({ event, timezone, onOpen }: { event: AgendaEvent; timezone: string; onOpen?: () => void }) {
  const time = event.date.includes("T") ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(event.date)) : "";
  const row = <Row size="sm" className={denseRowClassName} onOpen={onOpen}>
    <ItemContent className="min-w-0 gap-0.5"><ItemTitle className="block w-full line-clamp-2 leading-5">{decodeEntities(event.title)}</ItemTitle><ItemDescription className="line-clamp-1 text-xs leading-4" title={`${event.label}${event.detail ? ` · ${decodeEntities(event.detail)}` : ""}`}>{event.label}{event.detail ? ` · ${decodeEntities(event.detail)}` : ""}</ItemDescription></ItemContent>
    {time ? <ItemActions><span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{time}</span></ItemActions> : null}
  </Row>;
  return event.storyId ? <StoryHoverCard storyId={event.storyId} title={event.detail || event.title}>{row}</StoryHoverCard> : row;
}

export function AttentionRow({ item, storyTitle, onOpen }: { item: AttentionItem; storyTitle?: string; onOpen: () => void }) {
  const row = <ItemButton size="sm" className={denseRowClassName} onClick={onOpen}>
    <ItemMedia variant="icon">{item.urgent ? <CircleAlert className="text-warning" aria-hidden="true" /> : <CircleDot className="text-muted-foreground" aria-hidden="true" />}</ItemMedia>
    <ItemContent className="min-w-0 gap-0.5"><ItemTitle className="block w-full line-clamp-2 leading-5">{decodeEntities(item.title)}</ItemTitle><ItemDescription className="text-xs leading-4">{decodeEntities(item.detail)}</ItemDescription></ItemContent>
    <ItemActions><ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
  </ItemButton>;
  return item.storyId ? <StoryHoverCard storyId={item.storyId} title={storyTitle || item.title}>{row}</StoryHoverCard> : row;
}

export function MediaAssignmentRow({ media, timezone, now, onOpen }: { media: HomeVisualWork; timezone: string; now: Date; onOpen: () => void }) {
  const title = mediaAssignmentTitle(media);
  const row = <ItemButton size="sm" className={denseRowClassName} onClick={onOpen}>
    {media.assignee && anyPicture([media.assignee]) ? <ItemMedia><PeopleAvatars people={[media.assignee]} /></ItemMedia> : null}
    <ItemContent className="min-w-0 gap-0.5">
      <ItemTitle className="block w-full line-clamp-2 leading-5">{decodeEntities(title)}</ItemTitle>
      <ItemDescription className="text-xs leading-4">{decodeEntities(media.story.title)} · {mediaTypeLabels[media.type] || "Visual"}{media.dueAt ? ` · ${dateLabel(media.dueAt, timezone, now)}` : ""}</ItemDescription>
    </ItemContent>
    <ItemActions><WorkStatusBadge kind="production" intensity={mediaIntensity(media.status)} className="max-w-32">{mediaStatusLabels[media.status] || "Needed"}</WorkStatusBadge></ItemActions>
  </ItemButton>;
  return <StoryHoverCard storyId={media.story.id} title={media.story.title}>{row}</StoryHoverCard>;
}

