import type { ReactElement } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { __, _n, sprintf } from "@wordpress/i18n";
import { anyPicture, PeopleAvatars } from "../admin-ui/components/people-avatars";
import { DatePicker } from "../admin-ui/components/pickers";
import { useElementWidth } from "../admin-ui/lib/hooks";
import { cn } from "../admin-ui/lib/utils";
import { Button } from "../admin-ui/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../admin-ui/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../admin-ui/ui/table";
import { exactDate, relativeTime, shortDateTime, siteDay } from "../home/newsroom-model";
import { ProductionSummary, StoryDueLabel, plannedLabel, StoryTitleButton, WorkflowBadge } from "../story/story-parts";
import { StoryHoverCard } from "../story/StoryHoverCard";
import { StoryActionsMenu, StoryContextMenu } from "./StoryActionsMenu";
import { isPlannedDayOnly, movableWorkflowStatuses, type PlanningSort, type PlanningSortKey, type PlanningStory, type PlanningWorkflowStatus } from "./planning-model";

export type StoryListProps = {
  stories: PlanningStory[];
  additionalActions?: (story: PlanningStory) => Array<{ id: string; label: string; run: () => void }>;
  statuses: PlanningWorkflowStatus[];
  sort: PlanningSort;
  canMoveStories: boolean;
  canAssignStories: boolean;
  canUpdateStories: boolean;
  movingStoryId?: number | null;
  updatingStoryId?: number | null;
  timezone: string;
  now: Date;
  workspaceUrl: (storyId: number) => string;
  onSortChange: (key: PlanningSortKey) => void;
  onMoveStory: (story: PlanningStory, status: string) => Promise<unknown> | void;
  onUpdateStory: (story: PlanningStory, changes: Record<string, unknown>, patch: Partial<PlanningStory>, label: string) => Promise<unknown> | void;
  onOpenStory: (storyId: number) => void;
  /** Finished published stories the List left out, so it can say so. */
  hiddenPublished?: number;
};

/** Below this width a seven-column table is unreadable, so the list becomes compact rows. */
const TABLE_MIN_WIDTH = 820;

function SortHead({ label, sortKey, sort, onSortChange, className }: { label: string; sortKey: PlanningSortKey; sort: PlanningSort; onSortChange: (key: PlanningSortKey) => void; className?: string }) {
  const current = sort.key === sortKey;
  const Icon = !current ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return <TableHead className={cn("h-9", className)} aria-sort={current ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
    <Button variant="ghost" size="sm" className="-ml-2.5 h-7 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => onSortChange(sortKey)}>{label}<Icon data-icon="inline-end" aria-hidden="true" className={current ? undefined : "opacity-40"} /></Button>
  </TableHead>;
}

function People({ story }: { story: PlanningStory }) {
  const writers = story.authors.length ? story.authors : story.writer ? [story.writer] : [];
  return <div className="flex min-w-0 items-center gap-2">
    {anyPicture(writers) ? <span className="flex shrink-0"><PeopleAvatars people={writers} /></span> : null}
    <div className="flex min-w-0 flex-col">
      {writers.length
        ? <span className="truncate font-medium" title={writers.map((person) => person.name).join(", ")}>{writers.map((person) => person.name).join(", ")}</span>
        : <span className="text-muted-foreground">{__("Unassigned", "weekly-wildcat-headless")}</span>}
      {story.editor ? <span className="truncate text-xs leading-3.5 text-muted-foreground" title={story.editor.name}>{sprintf(/* translators: %s: editor name. */ __("Edited by %s", "weekly-wildcat-headless"), story.editor.name)}</span> : null}
    </div>
  </div>;
}

function shortDay(value: string, timezone: string): string {
  const day = siteDay(value, timezone);
  if (!day) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

function InlineWorkflow({ story, statuses, canMove, disabled, onMove }: { story: PlanningStory; statuses: PlanningWorkflowStatus[]; canMove: boolean; disabled?: boolean; onMove: (story: PlanningStory, status: string) => void }) {
  const stages = movableWorkflowStatuses(statuses);
  if (!canMove || story.wordpressState.isPublished || !stages.length) return <WorkflowBadge workflow={story.workflow} className="font-medium" />;

  const items = stages.map((stage) => ({ value: stage.id, label: stage.label }));
  return <Select items={items} value={story.workflow.id} disabled={disabled} onValueChange={(value) => {
    if (value && value !== story.workflow.id) onMove(story, String(value));
  }}>
    <SelectTrigger
      aria-label={sprintf(/* translators: %s: current workflow. */ __("Workflow: %s", "weekly-wildcat-headless"), story.workflow.label)}
      className="h-auto border-transparent bg-transparent p-0 shadow-none hover:bg-transparent data-popup-open:bg-transparent dark:bg-transparent dark:hover:bg-transparent [&>svg]:ml-0.5 [&>svg]:opacity-0 hover:[&>svg]:opacity-70 focus-visible:[&>svg]:opacity-70 data-popup-open:[&>svg]:opacity-70"
    >
      <WorkflowBadge workflow={story.workflow} className="font-medium" />
    </SelectTrigger>
    <SelectContent align="start" alignItemWithTrigger={false}>
      {stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}

function Deadline({ story, timezone, now, editable, disabled, onChange }: { story: PlanningStory; timezone: string; now: Date; editable: boolean; disabled?: boolean; onChange: (value: string | null) => void }) {
  if (!editable) {
    if (!story.deadline) return <span className="text-muted-foreground" title={__("No deadline", "weekly-wildcat-headless")}>—</span>;
    return <div className="flex flex-col gap-0">
      <time dateTime={story.deadline} title={exactDate(story.deadline, timezone)} className="font-medium text-foreground">{shortDay(story.deadline, timezone)}</time>
      <StoryDueLabel value={story.deadline} timezone={timezone} now={now} empty="" className="text-xs leading-3.5" />
    </div>;
  }

  return <div className="flex flex-col gap-0 [&>button]:min-h-5 [&>button]:py-0 [&>button]:leading-5">
    <DatePicker appearance="value" label={__("Deadline", "weekly-wildcat-headless")} dateOnly value={story.deadline} timezone={timezone} disabled={disabled} placeholder="—" displayValue={story.deadline ? shortDay(story.deadline, timezone) : undefined} onChange={onChange} />
    {story.deadline ? <StoryDueLabel value={story.deadline} timezone={timezone} now={now} empty="" className="text-xs leading-3.5" /> : null}
  </div>;
}

function Publication({ story, timezone, editable, disabled, onChange }: { story: PlanningStory; timezone: string; editable: boolean; disabled?: boolean; onChange: (value: string | null) => void }) {
  const state = story.wordpressState;
  const actual = state.isPublished ? state.publishedAt : state.isScheduled ? state.scheduledAt : null;
  const planned = story.plannedPublication;
  const plannedText = planned ? (isPlannedDayOnly(planned, timezone) ? shortDay(planned, timezone) : plannedLabel(planned, timezone)) : undefined;

  if (actual) {
    const stateLabel = state.isPublished ? __("Published", "weekly-wildcat-headless") : __("Scheduled", "weekly-wildcat-headless");
    return <div className="flex flex-col gap-0">
      <time dateTime={actual} title={exactDate(actual, timezone)} className="font-medium leading-5 text-foreground">{shortDateTime(actual, timezone) || exactDate(actual, timezone)}</time>
      {state.isScheduled ? <span className="text-xs leading-3.5 text-muted-foreground">{stateLabel}</span> : null}
    </div>;
  }

  if (state.isPublished || state.isScheduled) {
    return <span className="font-medium">{state.label || (state.isPublished ? __("Published", "weekly-wildcat-headless") : __("Scheduled", "weekly-wildcat-headless"))}</span>;
  }

  if (editable) {
    return <div title={planned ? exactDate(planned, timezone) : undefined} className="flex flex-col gap-0 [&>button]:min-h-5 [&>button]:py-0 [&>button]:leading-5">
      <DatePicker appearance="value" label={__("Planned publication", "weekly-wildcat-headless")} dateOnly value={planned} timezone={timezone} disabled={disabled} placeholder="—" displayValue={plannedText} onChange={onChange} />
      {story.plannedPublication ? <span className="text-xs leading-3.5 text-muted-foreground">{__("Planned", "weekly-wildcat-headless")}</span> : null}
    </div>;
  }

  if (story.plannedPublication) {
    return <div className="flex flex-col gap-0">
      <time dateTime={story.plannedPublication} title={exactDate(story.plannedPublication, timezone)} className="font-medium text-foreground">{plannedText}</time>
      <span className="text-xs leading-3.5 text-muted-foreground">{__("Planned", "weekly-wildcat-headless")}</span>
    </div>;
  }

  return <span className="text-muted-foreground" title={__("Not scheduled", "weekly-wildcat-headless")}>—</span>;
}

export function StoryList(props: StoryListProps) {
  const { stories, statuses, sort, canMoveStories, canAssignStories, canUpdateStories, movingStoryId, updatingStoryId, timezone, now, workspaceUrl, onSortChange, onMoveStory, onUpdateStory, onOpenStory, hiddenPublished = 0 } = props;
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const busy = (story: PlanningStory) => movingStoryId === story.id || updatingStoryId === story.id;
  const menu = (story: PlanningStory) => <StoryActionsMenu additionalActions={props.additionalActions?.(story)} story={story} statuses={statuses} canMove={canMoveStories && story.canEditPlanning !== false} disabled={busy(story)} onMove={onMoveStory} workspaceUrl={workspaceUrl} />;
  const context = (story: PlanningStory, child: ReactElement) => <StoryContextMenu key={story.id} additionalActions={props.additionalActions?.(story)} story={story} statuses={statuses} canMove={canMoveStories && story.canEditPlanning !== false} disabled={busy(story)} onMove={onMoveStory} workspaceUrl={workspaceUrl} onOpenStory={onOpenStory}>{child}</StoryContextMenu>;

  const hidden = hiddenPublished > 0 ? <p className="px-1 text-xs text-muted-foreground">{sprintf(/* translators: %d: number of stories. */ _n("%d published story with nothing left to do is hidden.", "%d published stories with nothing left to do are hidden.", hiddenPublished, "weekly-wildcat-headless"), hiddenPublished)} {__("Use More filters to show them.", "weekly-wildcat-headless")}</p> : null;
  if (!stories.length) return <><Empty className="border"><EmptyHeader><EmptyTitle>{__("No stories match", "weekly-wildcat-headless")}</EmptyTitle><EmptyDescription>{__("Try clearing a filter, or choose a different saved view.", "weekly-wildcat-headless")}</EmptyDescription></EmptyHeader></Empty>{hidden}</>;

  const table = width === 0 || width >= TABLE_MIN_WIDTH;
  return <div className="flex flex-col gap-2"><div ref={ref} className="overflow-hidden rounded-xl border bg-card shadow-xs">
    {table
      ? <Table className="table-fixed border-collapse" aria-label={__("Stories", "weekly-wildcat-headless")}>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <SortHead label={__("Story", "weekly-wildcat-headless")} sortKey="story" sort={sort} onSortChange={onSortChange} className="pl-3" />
            <SortHead label={__("Workflow", "weekly-wildcat-headless")} sortKey="workflow" sort={sort} onSortChange={onSortChange} className="w-[12%]" />
            <SortHead label={__("People", "weekly-wildcat-headless")} sortKey="writer" sort={sort} onSortChange={onSortChange} className="w-[15%]" />
            <SortHead label={__("Deadline", "weekly-wildcat-headless")} sortKey="deadline" sort={sort} onSortChange={onSortChange} className="w-[10%]" />
            <SortHead label={__("Publication", "weekly-wildcat-headless")} sortKey="planned" sort={sort} onSortChange={onSortChange} className="w-[14%]" />
            <TableHead className="h-9 w-[16%] text-xs font-semibold text-muted-foreground">{__("Work", "weekly-wildcat-headless")}</TableHead>
            <SortHead label={__("Updated", "weekly-wildcat-headless")} sortKey="modified" sort={sort} onSortChange={onSortChange} className="w-[8%]" />
            <TableHead className="h-9 w-9"><span className="sr-only">{__("Actions", "weekly-wildcat-headless")}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stories.map((story) => context(story, <TableRow key={story.id} data-story-id={story.id} aria-busy={busy(story) || undefined} className="h-12 cursor-pointer border-b border-border/70 hover:bg-muted/40" onClick={(event) => {
            // Only bare row/cell space opens Peek. Descendants (including portal
            // controls) keep their own interactions; the title is the keyboard route.
            if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
              (event.target === event.currentTarget || (event.target instanceof HTMLTableCellElement && event.target.parentElement === event.currentTarget))) onOpenStory(story.id);
          }}>
            <TableCell className="py-2 pl-3 whitespace-normal"><StoryHoverCard storyId={story.id} title={story.title} story={story}><StoryTitleButton story={story} onOpen={onOpenStory} className="line-clamp-2 text-[15px] font-semibold leading-5" /></StoryHoverCard></TableCell>
            <TableCell className="py-2 [&_[data-slot=select-trigger]]:max-w-full [&_[data-slot=badge]]:max-w-full"><InlineWorkflow story={story} statuses={statuses} canMove={canMoveStories && story.canEditPlanning !== false} disabled={busy(story)} onMove={onMoveStory} /></TableCell>
            <TableCell className="py-2 whitespace-normal"><People story={story} /></TableCell>
            <TableCell className="py-2"><Deadline story={story} timezone={timezone} now={now} editable={canAssignStories && canUpdateStories && story.canEditPlanning !== false} disabled={busy(story)} onChange={(deadline) => onUpdateStory(story, { deadline: deadline || "" }, { deadline }, __("Deadline", "weekly-wildcat-headless"))} /></TableCell>
            <TableCell className="py-2 whitespace-normal"><Publication story={story} timezone={timezone} editable={canAssignStories && canUpdateStories && story.canEditPlanning !== false} disabled={busy(story)} onChange={(plannedPublication) => onUpdateStory(story, { plannedPublishAt: plannedPublication || "" }, { plannedPublication }, __("Planned publication", "weekly-wildcat-headless"))} /></TableCell>
            <TableCell className="py-2"><ProductionSummary story={story} maxSignals={2} className="flex-row gap-x-1.5 gap-y-1 [&_[data-slot=badge]]:max-w-full" /></TableCell>
            <TableCell className="py-2 text-xs text-muted-foreground">{story.modifiedAt ? <time dateTime={story.modifiedAt} title={exactDate(story.modifiedAt, timezone)}>{relativeTime(story.modifiedAt, timezone, now)}</time> : "—"}</TableCell>
            <TableCell className="py-2 text-right">{menu(story)}</TableCell>
          </TableRow>))}
        </TableBody>
      </Table>
      : <ItemGroup className="gap-0" aria-label={__("Stories", "weekly-wildcat-headless")}>
        {stories.map((story) => context(story, <Item key={story.id} size="sm" data-story-id={story.id} className="rounded-none border-0 border-b border-border/70 last:border-b-0" aria-busy={busy(story) || undefined}>
          <ItemContent>
            <ItemTitle><StoryHoverCard storyId={story.id} title={story.title} story={story}><StoryTitleButton story={story} onOpen={onOpenStory} className="line-clamp-2 font-semibold" /></StoryHoverCard></ItemTitle>
            <div className="text-sm"><People story={story} /></div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              {canAssignStories && canUpdateStories && story.canEditPlanning !== false
                ? <DatePicker appearance="value" label={__("Deadline", "weekly-wildcat-headless")} dateOnly value={story.deadline} timezone={timezone} disabled={busy(story)} placeholder={__("No deadline", "weekly-wildcat-headless")} displayValue={story.deadline ? shortDay(story.deadline, timezone) : undefined} onChange={(deadline) => onUpdateStory(story, { deadline: deadline || "" }, { deadline }, __("Deadline", "weekly-wildcat-headless"))} />
                : <StoryDueLabel value={story.deadline} timezone={timezone} now={now} prefix="Due " empty={__("No deadline", "weekly-wildcat-headless")} />}
              <ProductionSummary story={story} className="flex-row gap-2" empty={null} />
            </div>
          </ItemContent>
          <ItemActions><InlineWorkflow story={story} statuses={statuses} canMove={canMoveStories && story.canEditPlanning !== false} disabled={busy(story)} onMove={onMoveStory} />{menu(story)}</ItemActions>
        </Item>))}
      </ItemGroup>}
  </div>{hidden}</div>;
}
