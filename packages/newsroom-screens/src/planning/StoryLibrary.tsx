import { Fragment, type ReactElement, type ReactNode } from "react";
import { useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { exactDate, relativeTime, siteDay } from "../home/newsroom-model";
import { StoryHoverCard } from "../story/StoryHoverCard";
import { StoryTitleButton } from "../story/story-parts";
import { sectionNames } from "../workspace/workspace-model";
import { StoryActionsMenu, StoryContextMenu } from "./StoryActionsMenu";
import { SortHead, StoryPeople } from "./StoryList";
import { groupByPublishedDay, type StoryScope } from "./stories-scope";
import type { PlanningSort, PlanningSortKey, PlanningStory, PlanningWorkflowStatus } from "./planning-model";

export type StoryLibraryScope = Exclude<StoryScope, "working">;

export type StoryLibraryProps = {
  scope: StoryLibraryScope;
  /** Already scoped, filtered and sorted. */
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
};

/** Below this width six columns are unreadable, so the library becomes compact rows. */
const TABLE_MIN_WIDTH = 720;

/* ---------------------------------------------------------------- dates */

const clock = (value: string, timezone: string) => new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: timezone }).format(new Date(value));

/** "Jun 29", with the year once it is not this year's. */
function dayLabel(value: string, timezone: string, now: Date): string {
  const day = siteDay(value, timezone);
  if (!day) return "";
  const sameYear = siteDay(now, timezone).slice(0, 4) === day.slice(0, 4);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/** When a story went (or goes) live: the actual time if there is one, else what was planned. */
function publicationWhen(story: PlanningStory): { at: string | null; kind: "published" | "scheduled" | "planned" | "none" } {
  const state = story.publicationState;
  if (state.isPublished && state.publishedAt) return { at: state.publishedAt, kind: "published" };
  if (state.isScheduled && state.scheduledAt) return { at: state.scheduledAt, kind: "scheduled" };
  if (story.plannedPublication) return { at: story.plannedPublication, kind: "planned" };
  return { at: null, kind: "none" };
}

const sectionsOf = (story: PlanningStory) => (story.sections?.length ? sectionNames(story.sections) : "");

/* ---------------------------------------------------------------- cells */

/** Draft, Scheduled or Published, in words; a draft also says which stage it is in. Never a badge. */
function StateText({ story }: { story: PlanningStory }) {
  const state = story.publicationState;
  if (state.isPublished) return <span className="font-medium text-foreground">Published</span>;
  return <div className="flex flex-col">
    <span className="font-medium text-foreground">{state.isScheduled ? "Scheduled" : "Draft"}</span>
    <span className="text-xs leading-3.5 text-muted-foreground">{story.workflow.label}</span>
  </div>;
}

function When({ story, timezone, now, timeOnly }: { story: PlanningStory; timezone: string; now: Date; timeOnly?: boolean }) {
  const when = publicationWhen(story);
  if (!when.at) return <span className="text-muted-foreground" title="Not scheduled">—</span>;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(when.at);
  const text = timeOnly && !dateOnly ? clock(when.at, timezone) : [dayLabel(when.at, timezone, now), dateOnly ? "" : clock(when.at, timezone)].filter(Boolean).join(", ");
  return <div className="flex flex-col">
    <time dateTime={when.at} title={exactDate(when.at, timezone)} className={cn("tabular-nums", when.kind === "published" ? "text-foreground" : "text-muted-foreground")}>{text}</time>
    {when.kind === "scheduled" || when.kind === "planned" ? <span className="text-xs leading-3.5 text-muted-foreground">{when.kind === "scheduled" ? "Scheduled" : "Planned"}</span> : null}
  </div>;
}

function Updated({ story, timezone, now }: { story: PlanningStory; timezone: string; now: Date }) {
  return story.modifiedAt ? <time dateTime={story.modifiedAt} title={exactDate(story.modifiedAt, timezone)} className="text-muted-foreground">{relativeTime(story.modifiedAt, timezone, now)}</time> : <span className="text-muted-foreground">—</span>;
}

/* -------------------------------------------------------------- columns */

type Cells = { timezone: string; now: Date; groupedByDay: boolean };

export type LibraryColumn = {
  id: string;
  label: string;
  sortKey?: PlanningSortKey;
  className?: string;
  cell: (story: PlanningStory, cells: Cells) => ReactNode;
};

const peopleColumn: LibraryColumn = { id: "people", label: "People", sortKey: "writer", className: "w-[19%]", cell: (story) => <StoryPeople story={story} /> };
const updatedColumn: LibraryColumn = { id: "updated", label: "Updated", sortKey: "modified", className: "w-[9%] text-xs", cell: (story, { timezone, now }) => <Updated story={story} timezone={timezone} now={now} /> };
const sectionColumn: LibraryColumn = { id: "section", label: "Section", className: "w-[11%]", cell: (story) => sectionsOf(story) ? <span className="line-clamp-2 text-muted-foreground" title={sectionsOf(story)}>{sectionsOf(story)}</span> : <span className="text-muted-foreground">—</span> };

/**
 * Published answers "what have we published?", All answers "find any story". Each is
 * a column list over the one table / compact-row renderer below, not a mode switch inside it.
 * Section is left out when no story in the list has one (WordPress does not supply it).
 */
export function libraryColumns(scope: StoryLibraryScope, title: (story: PlanningStory) => ReactNode, options: { showSection: boolean }): LibraryColumn[] {
  const story: LibraryColumn = { id: "story", label: "Story", sortKey: "story", className: "pl-3", cell: title };
  const section = options.showSection ? [sectionColumn] : [];
  if (scope === "published") {
    return [
      story,
      ...section,
      peopleColumn,
      { id: "published", label: "Published", sortKey: "published", className: "w-[13%]", cell: (item, cells) => <When story={item} timezone={cells.timezone} now={cells.now} timeOnly={cells.groupedByDay} /> },
      updatedColumn
    ];
  }
  return [
    story,
    { id: "state", label: "State", className: "w-[10%]", cell: (item) => <StateText story={item} /> },
    ...section,
    peopleColumn,
    { id: "publication", label: "Publication", sortKey: "planned", className: "w-[13%]", cell: (item, cells) => <When story={item} timezone={cells.timezone} now={cells.now} /> },
    updatedColumn
  ];
}

/* ---------------------------------------------------------------- list */

export function StoryLibrary(props: StoryLibraryProps) {
  const { scope, stories, statuses, sort, canMoveStories, movingStoryId, timezone, now, workspaceUrl, onSortChange, onMoveStory, onOpenStory } = props;
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const busy = (story: PlanningStory) => movingStoryId === story.id;
  const canMove = (story: PlanningStory) => canMoveStories && story.canEditPlanning !== false;
  const menu = (story: PlanningStory) => <StoryActionsMenu story={story} statuses={statuses} canMove={canMove(story)} disabled={busy(story)} onMove={onMoveStory} workspaceUrl={workspaceUrl} />;
  const context = (story: PlanningStory, child: ReactElement) => <StoryContextMenu key={story.id} story={story} statuses={statuses} canMove={canMove(story)} disabled={busy(story)} onMove={onMoveStory} workspaceUrl={workspaceUrl} onOpenStory={onOpenStory}>{child}</StoryContextMenu>;

  // Day separators answer "what ran today?", so they appear only while Published runs by publication time.
  const groupedByDay = scope === "published" && sort.key === "published";
  const groups = groupedByDay ? groupByPublishedDay(stories, timezone, now) : [{ key: "all", label: "", stories }];
  const showSection = stories.some((story) => story.sections?.length);
  const title = (story: PlanningStory, className: string) => <StoryHoverCard storyId={story.id} title={story.title} story={story}><StoryTitleButton story={story} onOpen={onOpenStory} className={className} /></StoryHoverCard>;
  const columns = libraryColumns(scope, (story) => title(story, "line-clamp-2 text-[15px] font-semibold leading-5"), { showSection });
  const cells: Cells = { timezone, now, groupedByDay };
  const label = scope === "published" ? "Published stories" : "All stories";

  const table = width === 0 || width >= TABLE_MIN_WIDTH;
  return <div ref={ref} data-story-library={scope} className="overflow-hidden rounded-xl border bg-card shadow-xs">
    {table
      ? <Table className="table-fixed border-collapse" aria-label={label}>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => column.sortKey
              ? <SortHead key={column.id} label={column.label} sortKey={column.sortKey} sort={sort} onSortChange={onSortChange} className={column.className} />
              : <TableHead key={column.id} className={cn("h-9 text-xs font-semibold text-muted-foreground", column.className)}>{column.label}</TableHead>)}
            <TableHead className="h-9 w-9"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => <Fragment key={group.key}>
            {groupedByDay ? <TableRow data-day-group={group.key} className="border-b border-border/70 bg-muted/30 hover:bg-muted/30"><TableCell colSpan={columns.length + 1} className="py-1.5 pl-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</TableCell></TableRow> : null}
            {group.stories.map((story) => context(story, <TableRow key={story.id} data-story-id={story.id} aria-busy={busy(story) || undefined} className="h-12 cursor-pointer border-b border-border/70 hover:bg-muted/40" onClick={(event) => {
              // Only bare row/cell space opens Peek; the title is the keyboard route.
              if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
                (event.target === event.currentTarget || (event.target instanceof HTMLTableCellElement && event.target.parentElement === event.currentTarget))) onOpenStory(story.id);
            }}>
              {columns.map((column) => <TableCell key={column.id} className={cn("py-2 whitespace-normal", column.id === "story" && "pl-3")}>{column.cell(story, cells)}</TableCell>)}
              <TableCell className="py-2 text-right">{menu(story)}</TableCell>
            </TableRow>))}
          </Fragment>)}
        </TableBody>
      </Table>
      : <div aria-label={label} className="flex flex-col">
        {groups.map((group) => <section key={group.key} aria-label={group.label || undefined} className="flex flex-col">
          {groupedByDay ? <h3 data-day-group={group.key} className="border-b border-border/70 bg-muted/30 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h3> : null}
          <ItemGroup className="gap-0">
            {group.stories.map((story) => context(story, <CompactRow key={story.id} scope={scope} story={story} cells={cells} title={title(story, "line-clamp-2 font-semibold")} busy={busy(story)} menu={menu(story)} />))}
          </ItemGroup>
        </section>)}
      </div>}
  </div>;
}

/** Headline, then section · people, then when. The desktop columns, in the words a narrow screen has room for. */
function CompactRow({ scope, story, cells, title, busy, menu }: { scope: StoryLibraryScope; story: PlanningStory; cells: Cells; title: ReactNode; busy: boolean; menu: ReactNode }) {
  const writers = story.authors.length ? story.authors : story.writer ? [story.writer] : [];
  const people = [sectionsOf(story), writers.map((person) => person.name).join(", ")].filter(Boolean).join(" · ");
  const when = publicationWhen(story);
  const state = story.publicationState;
  const day = when.at ? dayLabel(when.at, cells.timezone, cells.now) : "";
  const updated = story.modifiedAt ? `Updated ${relativeTime(story.modifiedAt, cells.timezone, cells.now)}` : "";
  // Published says "Published Jun 29"; All's state already says it, so its date stands alone.
  const publication = !day ? "" : when.kind === "planned" ? `Planned ${day}` : scope === "published" ? `Published ${day}` : day;
  const stateText = scope === "all" ? (state.isPublished ? "Published" : state.isScheduled ? "Scheduled" : `Draft · ${story.workflow.label}`) : "";
  const detail = [stateText, publication, updated].filter(Boolean);
  return <Item size="sm" data-story-id={story.id} className="rounded-none border-0 border-b border-border/70 last:border-b-0" aria-busy={busy || undefined}>
    <ItemContent>
      <ItemTitle>{title}</ItemTitle>
      {people ? <ItemDescription className="line-clamp-1">{people}</ItemDescription> : null}
      <ItemDescription className="line-clamp-1 text-xs">{detail.join(" · ")}</ItemDescription>
    </ItemContent>
    <ItemActions>{menu}</ItemActions>
  </Item>;
}
