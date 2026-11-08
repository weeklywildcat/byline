/** Home-only rows. Rows Home shares with Story Peek (tasks, activity, loading) live in story/rows. */
import { ArrowUpRight, ChevronRight, CircleAlert, CircleDot } from "lucide-react";
import { ItemButton } from "@byline/newsroom-ui/components/item-button";
import { PeopleAvatars, anyPicture } from "@byline/newsroom-ui/components/people-avatars";
import { WorkStatusBadge, mediaIntensity } from "@byline/newsroom-ui/components/work-status-badge";
import { StoryHoverCard } from "../../story/StoryHoverCard";
import { decodeEntities } from "@byline/newsroom-ui/lib/text";
import { ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import type { PlanningPerson } from "../../planning/planning-model";
import { denseRowClassName } from "../../story/rows";
import { dateLabel, dayDistance, exactDate, mediaAssignmentTitle, mediaStatusLabels, mediaTypeLabels, type AttentionItem, type HomeVisualWork } from "../newsroom-model";

const Chevron = () => <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;

/** A right-aligned due label: the one warning when overdue, muted otherwise. */
function DueLabel({ value, timezone, now }: { value: string | null; timezone: string; now: Date }) {
  if (!value) return null;
  const overdue = dayDistance(value, timezone, now) < 0;
  return <time dateTime={value} title={exactDate(value, timezone)} className={`text-xs whitespace-nowrap tabular-nums ${overdue ? "font-medium text-warning" : "text-muted-foreground"}`}>{dateLabel(value, timezone, now)}</time>;
}

export function ReviewRow({ storyId, title, detail, people = [], onOpen }: { storyId: number; title: string; detail: string; people?: PlanningPerson[]; onOpen: () => void }) {
  const row = <ItemButton size="sm" className={denseRowClassName} aria-label={`${decodeEntities(title)} ${decodeEntities(detail)}`} onClick={onOpen}>
    {anyPicture(people) ? <ItemMedia><PeopleAvatars people={people} /></ItemMedia> : null}
    <ItemContent className="min-w-0 gap-0.5"><ItemTitle className="block w-full line-clamp-2 text-[15px] font-semibold leading-5">{decodeEntities(title)}</ItemTitle><ItemDescription className="line-clamp-1 text-xs leading-4" title={decodeEntities(detail)}>{decodeEntities(detail)}</ItemDescription></ItemContent>
    <ItemActions><Chevron /></ItemActions>
  </ItemButton>;
  return <StoryHoverCard storyId={storyId} title={title}>{row}</StoryHoverCard>;
}

export function AttentionRow({ item, storyTitle, onOpen }: { item: AttentionItem; storyTitle?: string; onOpen: () => void }) {
  const row = <ItemButton size="sm" className={denseRowClassName} onClick={onOpen}>
    <ItemMedia variant="icon">{item.urgent ? <CircleAlert className="text-warning" aria-hidden="true" /> : <CircleDot className="text-muted-foreground" aria-hidden="true" />}</ItemMedia>
    <ItemContent className="min-w-0 gap-0.5"><ItemTitle className="block w-full line-clamp-2 leading-5">{decodeEntities(item.title)}</ItemTitle><ItemDescription className="text-xs leading-4">{decodeEntities(item.detail)}</ItemDescription></ItemContent>
    {/* A reporting appointment still needing a time is reporting work waiting on the reader. */}
    <ItemActions>{item.reason === "scheduling" ? <WorkStatusBadge kind="reporting" intensity="action">Needs scheduling</WorkStatusBadge> : <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />}</ItemActions>
  </ItemButton>;
  return item.storyId ? <StoryHoverCard storyId={item.storyId} title={storyTitle || item.title}>{row}</StoryHoverCard> : row;
}

export function MediaAssignmentRow({ media, timezone, now, onOpen }: { media: HomeVisualWork; timezone: string; now: Date; onOpen: () => void }) {
  const title = mediaAssignmentTitle(media);
  const row = <ItemButton size="sm" className={denseRowClassName} onClick={onOpen}>
    {media.assignee && anyPicture([media.assignee]) ? <ItemMedia><PeopleAvatars people={[media.assignee]} /></ItemMedia> : null}
    <ItemContent className="min-w-0 gap-0.5">
      <ItemTitle className="block w-full line-clamp-2 leading-5">{decodeEntities(title)}</ItemTitle>
      <ItemDescription className="line-clamp-1 text-xs leading-4">{decodeEntities(media.story.title)} · {mediaTypeLabels[media.type] || "Visual"}</ItemDescription>
    </ItemContent>
    <ItemActions className="gap-2"><DueLabel value={media.dueAt} timezone={timezone} now={now} /><WorkStatusBadge kind="production" intensity={mediaIntensity(media.status)} className="max-w-32">{mediaStatusLabels[media.status] || "Needed"}</WorkStatusBadge></ItemActions>
  </ItemButton>;
  return <StoryHoverCard storyId={media.story.id} title={media.story.title}>{row}</StoryHoverCard>;
}
