import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { __, _n, sprintf } from "@wordpress/i18n";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { useElementWidth } from "../admin-ui/lib/hooks";
import { cn } from "../admin-ui/lib/utils";
import { Button } from "../admin-ui/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../admin-ui/ui/table";
import { exactDate, relativeTime, shortDateTime, siteDay } from "../home/newsroom-model";
import { ProductionSummary, StoryDueLabel, plannedLabel, StoryTitleButton, WorkflowBadge } from "../story/story-parts";
import { StoryActionsMenu } from "./StoryActionsMenu";
import type { PlanningSort, PlanningSortKey, PlanningStory, PlanningWorkflowStatus } from "./planning-model";

export type StoryListProps = {
  stories: PlanningStory[];
  statuses: PlanningWorkflowStatus[];
  sort: PlanningSort;
  canMoveStories: boolean;
  movingStoryId?: number | null;
  timezone: string;
  now: Date;
  workspaceUrl: (storyId: number) => string;
  onSortChange: (key: PlanningSortKey) => void;
  onMoveStory: (story: PlanningStory, status: string) => Promise<unknown> | void;
  onOpenStory: (storyId: number) => void;
  /** Finished published stories the List left out, so it can say so. */
  hiddenPublished?: number;
};

/** Below this width a seven-column table is unreadable, so the list becomes compact rows. */
const TABLE_MIN_WIDTH = 820;

function SortHead({ label, sortKey, sort, onSortChange, className }: { label: string; sortKey: PlanningSortKey; sort: PlanningSort; onSortChange: (key: PlanningSortKey) => void; className?: string }) {
  const current = sort.key === sortKey;
  const Icon = !current ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return <TableHead className={className} aria-sort={current ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
    <Button variant="ghost" size="sm" className="-ml-2.5 h-7 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => onSortChange(sortKey)}>{label}<Icon data-icon="inline-end" aria-hidden="true" className={current ? undefined : "opacity-40"} /></Button>
  </TableHead>;
}

function People({ story }: { story: PlanningStory }) {
  const writers = story.authors.length ? story.authors : story.writer ? [story.writer] : [];
  return <div className="flex min-w-0 flex-col gap-0.5">
    {writers.length
      ? <span className="flex min-w-0 items-center gap-2"><PeopleAvatars people={writers} /><span className="truncate font-medium" title={writers.map((person) => person.name).join(", ")}>{writers.map((person) => person.name).join(", ")}</span></span>
      : <span className="text-muted-foreground">{__("Unassigned", "weekly-wildcat-headless")}</span>}
    {story.editor ? <span className="truncate text-xs text-muted-foreground">{sprintf(/* translators: %s: editor name. */ __("Edited by %s", "weekly-wildcat-headless"), story.editor.name)}</span> : null}
  </div>;
}

function shortDay(value: string, timezone: string): string {
  const day = siteDay(value, timezone);
  if (!day) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

function Deadline({ story, timezone, now }: { story: PlanningStory; timezone: string; now: Date }) {
  if (!story.deadline) return <span className="text-muted-foreground">{__("No deadline", "weekly-wildcat-headless")}</span>;
  return <div className="flex flex-col gap-0.5">
    <time dateTime={story.deadline} title={exactDate(story.deadline, timezone)} className="font-medium text-foreground">{shortDay(story.deadline, timezone)}</time>
    <StoryDueLabel value={story.deadline} timezone={timezone} now={now} empty="" className="text-xs" />
  </div>;
}

function Publication({ story, timezone }: { story: PlanningStory; timezone: string }) {
  const state = story.wordpressState;
  const actual = state.isPublished ? state.publishedAt : state.isScheduled ? state.scheduledAt : null;

  if (actual) {
    const stateLabel = state.isPublished ? __("Published", "weekly-wildcat-headless") : __("Scheduled", "weekly-wildcat-headless");
    return <div className="flex flex-col gap-0.5">
      <time dateTime={actual} title={exactDate(actual, timezone)} className="font-medium text-foreground">{shortDateTime(actual, timezone) || exactDate(actual, timezone)}</time>
      <span className="text-xs text-muted-foreground">{stateLabel}</span>
    </div>;
  }

  if (state.isPublished || state.isScheduled) {
    return <span className="font-medium">{state.label || (state.isPublished ? __("Published", "weekly-wildcat-headless") : __("Scheduled", "weekly-wildcat-headless"))}</span>;
  }

  if (story.plannedPublication) {
    return <div className="flex flex-col gap-0.5">
      <time dateTime={story.plannedPublication} title={exactDate(story.plannedPublication, timezone)} className="font-medium text-foreground">{plannedLabel(story.plannedPublication, timezone)}</time>
      <span className="text-xs text-muted-foreground">{__("Planned publication", "weekly-wildcat-headless")}</span>
    </div>;
  }

  return <div className="flex flex-col gap-0.5">
    <span className="text-muted-foreground">{__("Not scheduled", "weekly-wildcat-headless")}</span>
    <span className="text-xs text-muted-foreground">{state.label || __("Draft", "weekly-wildcat-headless")}</span>
  </div>;
}

export function StoryList(props: StoryListProps) {
  const { stories, statuses, sort, canMoveStories, movingStoryId, timezone, now, workspaceUrl, onSortChange, onMoveStory, onOpenStory, hiddenPublished = 0 } = props;
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const menu = (story: PlanningStory) => <StoryActionsMenu story={story} statuses={statuses} canMove={canMoveStories} disabled={movingStoryId === story.id} onMove={onMoveStory} workspaceUrl={workspaceUrl} />;

  const hidden = hiddenPublished > 0 ? <p className="px-1 text-xs text-muted-foreground">{sprintf(/* translators: %d: number of stories. */ _n("%d published story with nothing left to do is hidden.", "%d published stories with nothing left to do are hidden.", hiddenPublished, "weekly-wildcat-headless"), hiddenPublished)} {__("Use More filters to show them.", "weekly-wildcat-headless")}</p> : null;
  if (!stories.length) return <><Empty className="border"><EmptyHeader><EmptyTitle>{__("No stories match", "weekly-wildcat-headless")}</EmptyTitle><EmptyDescription>{__("Try clearing a filter, or choose a different saved view.", "weekly-wildcat-headless")}</EmptyDescription></EmptyHeader></Empty>{hidden}</>;

  const table = width === 0 || width >= TABLE_MIN_WIDTH;
  return <div className="flex flex-col gap-2"><div ref={ref} className="overflow-hidden rounded-xl border bg-card shadow-xs">
    {table
      ? <Table aria-label={__("Stories", "weekly-wildcat-headless")}>
        <TableHeader className="bg-muted/20">
          <TableRow className="hover:bg-transparent">
            <SortHead label={__("Story", "weekly-wildcat-headless")} sortKey="story" sort={sort} onSortChange={onSortChange} className="w-[34%]" />
            <SortHead label={__("Workflow", "weekly-wildcat-headless")} sortKey="workflow" sort={sort} onSortChange={onSortChange} />
            <SortHead label={__("People", "weekly-wildcat-headless")} sortKey="writer" sort={sort} onSortChange={onSortChange} />
            <SortHead label={__("Deadline", "weekly-wildcat-headless")} sortKey="deadline" sort={sort} onSortChange={onSortChange} />
            <SortHead label={__("Publication", "weekly-wildcat-headless")} sortKey="planned" sort={sort} onSortChange={onSortChange} />
            <TableHead className="text-xs font-semibold text-muted-foreground">{__("Work", "weekly-wildcat-headless")}</TableHead>
            <SortHead label={__("Updated", "weekly-wildcat-headless")} sortKey="modified" sort={sort} onSortChange={onSortChange} />
            <TableHead className="w-10"><span className="sr-only">{__("Actions", "weekly-wildcat-headless")}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stories.map((story) => <TableRow key={story.id} data-story-id={story.id} aria-busy={movingStoryId === story.id || undefined} className="h-16">
            <TableCell className="py-3 whitespace-normal"><StoryTitleButton story={story} onOpen={onOpenStory} className="text-[15px] font-semibold leading-5" /></TableCell>
            <TableCell className="py-3"><WorkflowBadge workflow={story.workflow} className="font-medium" /></TableCell>
            <TableCell className="max-w-60 py-3 whitespace-normal"><People story={story} /></TableCell>
            <TableCell className="py-3"><Deadline story={story} timezone={timezone} now={now} /></TableCell>
            <TableCell className="py-3 whitespace-normal"><Publication story={story} timezone={timezone} /></TableCell>
            <TableCell className="py-3"><ProductionSummary story={story} className="flex-row gap-2 whitespace-nowrap" /></TableCell>
            <TableCell className="py-3 text-muted-foreground">{story.modifiedAt ? <time dateTime={story.modifiedAt} title={exactDate(story.modifiedAt, timezone)}>{relativeTime(story.modifiedAt, timezone, now)}</time> : "—"}</TableCell>
            <TableCell className="py-3 text-right">{menu(story)}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      : <ItemGroup className="gap-0" aria-label={__("Stories", "weekly-wildcat-headless")}>
        {stories.map((story) => <Item key={story.id} size="sm" data-story-id={story.id} className={cn("border-b last:border-b-0 rounded-none")} aria-busy={movingStoryId === story.id || undefined}>
          <ItemContent>
            <ItemTitle className="line-clamp-2"><StoryTitleButton story={story} onOpen={onOpenStory} className="font-semibold" /></ItemTitle>
            <div className="text-sm"><People story={story} /></div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs"><StoryDueLabel value={story.deadline} timezone={timezone} now={now} prefix="Due " empty={__("No deadline", "weekly-wildcat-headless")} /><ProductionSummary story={story} className="flex-row gap-2" empty={null} /></div>
          </ItemContent>
          <ItemActions><WorkflowBadge workflow={story.workflow} />{menu(story)}</ItemActions>
        </Item>)}
      </ItemGroup>}
  </div>{hidden}</div>;
}
