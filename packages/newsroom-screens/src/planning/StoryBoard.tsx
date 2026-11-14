import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, GripVertical } from "lucide-react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements, autoScrollWindowForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import { useAnyCoarsePointer } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent } from "@byline/newsroom-ui/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { ProductionSummary, StoryAttentionSignals, StoryDueLabel, StoryTitleButton, WorkflowBadge } from "../story/story-parts";
import { StoryHoverCard } from "../story/StoryHoverCard";
import { StoryActionsMenu, StoryContextMenu } from "./StoryActionsMenu";
import { boardWorkflowStatuses, type PlanningStory, type PlanningWorkflowStatus } from "../planning/planning-model";
import { browserStorage, isStageCollapsed, readBoardCollapsed, writeBoardCollapsed, type BoardCollapsedChoices, type BoardLayout } from "./stories-board-layout";

export type StoryBoardProps = {
  /** Already filtered and in the order each column should show them. */
  stories: PlanningStory[];
  statuses: PlanningWorkflowStatus[];
  canMoveStories: boolean;
  movingStoryId?: number | null;
  timezone: string;
  now: Date;
  workspaceUrl: (storyId: number) => string;
  onMoveStory: (story: PlanningStory, status: string) => Promise<unknown> | void;
  onOpenStory: (storyId: number) => void;
  /** Lanes (the default), Dense or Stacked: the reader's preference, owned by Stories. */
  layout?: BoardLayout;
};

const DRAG_TYPE = "byline-story";
const PUBLISHED_STATUS: PlanningWorkflowStatus = { id: "published", label: "Published", group: "derived", selectable: false };

/** A story can be dragged only if the viewer may move stories and WordPress has not published it. */
const isMovable = (story: PlanningStory, canMoveStories: boolean) => canMoveStories && !story.publicationState.isPublished;

const storyCount = (count: number) => `${count} ${count === 1 ? "story" : "stories"}`;

type StoryItemProps = Pick<StoryBoardProps, "statuses" | "canMoveStories" | "timezone" | "now" | "workspaceUrl" | "onMoveStory" | "onOpenStory"> & {
  story: PlanningStory;
  moving: boolean;
  moved: boolean;
};

/** Everything a stage needs to draw its stories. */
type StageItems = Omit<StoryItemProps, "story" | "moving" | "moved"> & {
  movingStoryId?: number | null;
  movedId: number | null;
  /** The stage a story was just moved into: a folded one flashes in place of the hidden card. */
  movedStatusId: string | null;
};

const itemProps = (items: StageItems, story: PlanningStory): StoryItemProps => ({
  story, statuses: items.statuses, canMoveStories: items.canMoveStories, timezone: items.timezone, now: items.now,
  workspaceUrl: items.workspaceUrl, onMoveStory: items.onMoveStory, onOpenStory: items.onOpenStory,
  moving: items.movingStoryId === story.id, moved: items.movedId === story.id
});

/** Pragmatic drag and drop owns the pointer drag. Its native drag image is the item itself; the source stays in place, subdued. */
function useStoryDrag(element: HTMLElement | null, story: PlanningStory, movable: boolean) {
  const touch = useAnyCoarsePointer();
  const [handle, setHandle] = useState<HTMLSpanElement | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!element || !movable || (touch && !handle)) return undefined;
    return draggable({
      element,
      dragHandle: touch ? handle ?? undefined : undefined,
      getInitialData: () => ({ type: DRAG_TYPE, storyId: story.id, workflowId: story.workflow.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false)
    });
  }, [element, handle, movable, story.id, story.workflow.id, touch]);
  return { dragging, touch, setHandle };
}

/** The whole stage is the drop target, folded or not. It accepts any movable story that is not already in it. */
/** A stage takes a drop only when the reader may move a story there (Review and Ready come from review for non-editors). */
function useStageDrop(element: HTMLElement | null, status: PlanningWorkflowStatus, canMoveStories: boolean): boolean {
  const statusId = status.id;
  const accepts = canMoveStories && status.selectable;
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!element || !accepts) return undefined;
    return dropTargetForElements({
      element,
      getData: () => ({ statusId }),
      canDrop: ({ source }) => source.data.type === DRAG_TYPE && source.data.workflowId !== statusId,
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false)
    });
  }, [accepts, element, statusId]);
  return over;
}

/** A column body scrolls on its own, so dragging near its top or bottom scrolls it. */
function useAutoScroll(element: HTMLElement | null) {
  useEffect(() => element ? autoScrollForElements({ element }) : undefined, [element]);
}

const writersOf = (story: PlanningStory) => story.authors.length ? story.authors : story.writer ? [story.writer] : [];

/** The card's one meta row: who is writing it on the left, when it is due on the right. */
function StoryMeta({ story, timezone, now }: { story: PlanningStory; timezone: string; now: Date }) {
  const writers = writersOf(story);
  const names = writers.map((person) => person.name).join(", ");
  return <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
    <span className="flex min-w-0 items-center gap-1.5">
      {writers.length
        ? <><PeopleAvatars people={writers} /><span className="truncate text-muted-foreground" title={names}>{names}</span></>
        : <span className="text-muted-foreground">Unassigned</span>}
    </span>
    <StoryDueLabel value={story.deadline} timezone={timezone} now={now} prefix="" empty={null} className="shrink-0 whitespace-nowrap" />
  </div>;
}

/** The visible menu, shown on hover or focus (always on touch), so Move to stays reachable without right-click. */
function CornerMenu({ story, statuses, canMoveStories, moving, onMoveStory, workspaceUrl }: StoryItemProps) {
  return <StoryActionsMenu story={story} statuses={statuses} canMove={canMoveStories} disabled={moving} onMove={onMoveStory} workspaceUrl={workspaceUrl} size="icon-xs"
    className="absolute top-1 right-1 bg-card opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 any-pointer-coarse:opacity-100 data-popup-open:opacity-100" />;
}

function StoryDragHandle({ ref }: { ref: (element: HTMLSpanElement | null) => void }) {
  return <span ref={ref} aria-hidden="true" data-story-drag-handle="" className="absolute top-1 left-1 flex size-11 touch-none cursor-grab items-center justify-center text-muted-foreground">
    <GripVertical className="size-4" aria-hidden="true" />
  </span>;
}

/** Lanes and Stacked: a compact card, about 64px without signals. */
function BoardCard(props: StoryItemProps) {
  const { story, statuses, canMoveStories, moving, moved, timezone, now, workspaceUrl, onMoveStory, onOpenStory } = props;
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const movable = isMovable(story, canMoveStories);
  const { dragging, touch, setHandle } = useStoryDrag(element, story, movable);
  return <StoryContextMenu story={story} statuses={statuses} canMove={canMoveStories} disabled={moving} onMove={onMoveStory} workspaceUrl={workspaceUrl} onOpenStory={onOpenStory}>
    <Card ref={setElement} size="sm" role="listitem" data-story-id={story.id} data-dragging={dragging} data-moved={moved} aria-busy={moving || undefined}
      className={cn("relative shrink-0 gap-1 rounded-[10px] py-2 shadow-xs transition-colors duration-700 [content-visibility:auto] [contain-intrinsic-size:auto_64px]", movable && !touch && "cursor-grab", "data-[dragging=true]:opacity-40 data-[moved=true]:bg-accent")}>
      <CardContent className="flex flex-col gap-1 px-2.5">
        <StoryHoverCard storyId={story.id} title={story.title} story={story}><StoryTitleButton story={story} onOpen={onOpenStory} className={cn("pr-5 text-[13px] leading-[1.35] line-clamp-2 any-pointer-coarse:min-h-11 any-pointer-coarse:pr-11", touch && movable && "pl-10")} data-story-title={story.id} /></StoryHoverCard>
        <StoryMeta story={story} timezone={timezone} now={now} />
        <StoryAttentionSignals story={story} />
      </CardContent>
      {touch && movable ? <StoryDragHandle ref={setHandle} /> : null}
      <CornerMenu {...props} />
    </Card>
  </StoryContextMenu>;
}

/** Dense: a row, not a card, about 50px. Signals show the first one and a +N. */
function DenseRow(props: StoryItemProps) {
  const { story, statuses, canMoveStories, moving, moved, timezone, now, workspaceUrl, onMoveStory, onOpenStory } = props;
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const movable = isMovable(story, canMoveStories);
  const { dragging, touch, setHandle } = useStoryDrag(element, story, movable);
  const names = writersOf(story).map((person) => person.name).join(", ");
  return <StoryContextMenu story={story} statuses={statuses} canMove={canMoveStories} disabled={moving} onMove={onMoveStory} workspaceUrl={workspaceUrl} onOpenStory={onOpenStory}>
    <div ref={setElement} role="listitem" data-story-id={story.id} data-dragging={dragging} data-moved={moved} aria-busy={moving || undefined}
      className={cn("group/card relative shrink-0 border-b border-border/60 bg-card px-2.5 py-[7px] transition-colors duration-700 hover:bg-muted/40 [content-visibility:auto] [contain-intrinsic-size:auto_50px]", movable && !touch && "cursor-grab", "data-[dragging=true]:opacity-40 data-[moved=true]:bg-accent")}>
      <StoryHoverCard storyId={story.id} title={story.title} story={story}><StoryTitleButton story={story} onOpen={onOpenStory} className={cn("block w-full truncate pr-5 text-[13px] leading-[18px] font-medium any-pointer-coarse:min-h-11 any-pointer-coarse:pr-11", touch && movable && "pl-10")} data-story-title={story.id} /></StoryHoverCard>
      <div className="flex min-w-0 items-center gap-2 text-xs leading-4">
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={names || undefined}>{names || "Unassigned"}</span>
        {story.attention ? <StoryAttentionSignals story={story} limit={1} className="max-w-[55%] shrink flex-nowrap [&_[data-work-kind]]:h-4 [&_[data-work-kind]]:py-0" /> : <ProductionSummary story={story} maxSignals={1} empty={null} className="shrink-0 flex-nowrap gap-1 [&_[data-work-kind]]:h-4 [&_[data-work-kind]]:py-0 [&_button]:h-4" />}
        <StoryDueLabel value={story.deadline} timezone={timezone} now={now} prefix="" empty={null} className="shrink-0 whitespace-nowrap" />
      </div>
      {touch && movable ? <StoryDragHandle ref={setHandle} /> : null}
      <CornerMenu {...props} />
    </div>
  </StoryContextMenu>;
}

/** The stage's name and count. The count is plain text, read with its noun. */
function StageHeading({ id, status, count }: { id: string; status: PlanningWorkflowStatus; count: number }) {
  return <h3 id={id} className="flex min-w-0 items-center gap-2 text-sm font-medium">
    <WorkflowBadge workflow={status} />
    <span className="text-xs font-medium text-muted-foreground tabular-nums"><span aria-hidden="true">{count}</span><span className="sr-only">{storyCount(count)}</span></span>
  </h3>;
}

type StageProps = StageItems & {
  status: PlanningWorkflowStatus;
  stories: PlanningStory[];
  collapsed: boolean;
  onCollapsedChange: (statusId: string, collapsed: boolean) => void;
};

const overRing = "transition-colors data-[over=true]:ring-2 data-[over=true]:ring-ring/40";
const movedFlash = "duration-700 data-[moved=true]:bg-accent";
/** Below `sm` the board keeps the page scroll and card-width snap columns. */
const narrowColumn = "max-sm:w-[80vw] max-sm:flex-none max-sm:snap-start";

function LaneColumn({ status, stories, collapsed, onCollapsedChange, ...items }: StageProps) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const over = useStageDrop(element, status, items.canMoveStories);
  useAutoScroll(collapsed ? null : body);
  const headingId = `board-column-${status.id}`;

  if (collapsed) {
    return <button ref={setElement} type="button" aria-expanded="false" aria-label={`${status.label}, ${storyCount(stories.length)}. Expand`} data-status={status.id} data-over={over} data-collapsed="true" data-moved={items.movedStatusId === status.id}
      onClick={() => onCollapsedChange(status.id, false)}
      className={cn("flex w-10 shrink-0 flex-col items-center gap-2.5 rounded-xl bg-muted py-3 outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:snap-start", overRing, movedFlash)}>
      <span className="text-xs font-medium text-muted-foreground tabular-nums">{stories.length}</span>
      <WorkflowBadge workflow={status} className="h-auto max-h-48 w-5 max-w-none px-0 py-2 [writing-mode:vertical-rl]" />
    </button>;
  }

  return <section ref={setElement} aria-labelledby={headingId} data-status={status.id} data-over={over} data-collapsed="false"
    className={cn("flex min-h-0 min-w-60 flex-1 basis-0 flex-col rounded-xl bg-muted", overRing, narrowColumn)}>
    <header className="flex items-center justify-between gap-2 px-2.5 pt-2.5 pb-2">
      <StageHeading id={headingId} status={status} count={stories.length} />
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Collapse ${status.label}`} onClick={() => onCollapsedChange(status.id, true)}><ChevronsLeft aria-hidden="true" /></Button>
    </header>
    <div ref={setBody} role="list" aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5 max-sm:overflow-visible">
      {stories.map((story) => <BoardCard key={story.id} {...itemProps(items, story)} />)}
      {stories.length ? null : <p className="px-1 py-2 text-xs text-muted-foreground">No stories</p>}
    </div>
  </section>;
}

function DenseStage({ status, stories, collapsed, onCollapsedChange, ...items }: StageProps) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const over = useStageDrop(element, status, items.canMoveStories);
  useAutoScroll(collapsed ? null : body);
  const headingId = `board-column-${status.id}`;
  // An empty stage has nothing to open; a stage with stories can always be folded or opened again.
  const toggle = stories.length
    ? <Button type="button" variant="ghost" size="icon-xs" aria-label={`${collapsed ? "Expand" : "Collapse"} ${status.label}`} aria-expanded={!collapsed} onClick={() => onCollapsedChange(status.id, !collapsed)}>{collapsed ? <ChevronsRight aria-hidden="true" /> : <ChevronsLeft aria-hidden="true" />}</Button>
    : null;
  const header = <header className="flex items-center justify-between gap-1 border-b px-2.5 py-2"><StageHeading id={headingId} status={status} count={stories.length} />{toggle}</header>;

  if (collapsed) {
    return <section ref={setElement} aria-labelledby={headingId} data-status={status.id} data-over={over} data-collapsed="true" data-moved={items.movedStatusId === status.id}
      className={cn("flex w-37 shrink-0 flex-col overflow-hidden rounded-xl border bg-background max-sm:snap-start", overRing, movedFlash)}>
      {header}
      <div className="flex-1 p-2"><p className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">Drop here</p></div>
    </section>;
  }

  return <section ref={setElement} aria-labelledby={headingId} data-status={status.id} data-over={over} data-collapsed="false"
    className={cn("flex min-h-0 min-w-56 flex-1 basis-0 flex-col overflow-hidden rounded-xl border bg-background", overRing, narrowColumn)}>
    {header}
    <div ref={setBody} role="list" aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col overflow-y-auto max-sm:overflow-visible">
      {stories.map((story) => <DenseRow key={story.id} {...itemProps(items, story)} />)}
    </div>
  </section>;
}

/** Dense keeps sidelined stages out of the columns: a chip each, a drop target, opening its stories in a popover. */
function SidelinedChip({ status, stories, ...items }: StageItems & { status: PlanningWorkflowStatus; stories: PlanningStory[] }) {
  const [element, setElement] = useState<HTMLButtonElement | null>(null);
  const over = useStageDrop(element, status, items.canMoveStories);
  const listId = `board-sidelined-${status.id}`;
  return <Popover>
    <PopoverTrigger render={<Button ref={setElement} type="button" variant="outline" size="sm" data-status={status.id} data-over={over} data-moved={items.movedStatusId === status.id} aria-label={`${status.label}, ${storyCount(stories.length)}`} className={cn(overRing, movedFlash)} />}>
      <WorkflowBadge workflow={status} /><span className="text-xs text-muted-foreground tabular-nums">{stories.length}</span>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 gap-0 overflow-hidden p-0">
      <p id={listId} className="border-b px-2.5 py-2 text-xs font-medium text-muted-foreground">{status.label}</p>
      {stories.length
        ? <div role="list" aria-labelledby={listId} className="flex max-h-80 flex-col overflow-y-auto">{stories.map((story) => <DenseRow key={story.id} {...itemProps(items, story)} />)}</div>
        : <p className="px-2.5 py-3 text-xs text-muted-foreground">No stories</p>}
    </PopoverContent>
  </Popover>;
}

/** Stacked: one section per stage, the page scrolls. An empty section opens up while a story is being dragged, so there is room to drop. */
function StackedSection({ status, stories, dragActive, ...items }: StageItems & { status: PlanningWorkflowStatus; stories: PlanningStory[]; dragActive: boolean }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const over = useStageDrop(element, status, items.canMoveStories);
  const headingId = `board-column-${status.id}`;
  const empty = !stories.length;
  return <section ref={setElement} aria-labelledby={headingId} data-status={status.id} data-over={over} data-empty={empty} data-drag-active={dragActive}
    className={cn("flex flex-col gap-2 rounded-xl", overRing, empty && dragActive && "min-h-16 outline-1 outline-offset-4 outline-border outline-dashed")}>
    <header className="flex items-center gap-2">
      <StageHeading id={headingId} status={status} count={stories.length} />
      {empty ? <span className="text-xs text-muted-foreground">· No stories</span> : null}
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </header>
    {empty ? null : <div role="list" aria-labelledby={headingId} className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
      {stories.map((story) => <BoardCard key={story.id} {...itemProps(items, story)} />)}
    </div>}
  </section>;
}

/**
 * Lanes and Dense fill the rest of the window: the board's top is measured, and
 * columns scroll on their own instead of the page. Below `sm` the page scrolls.
 */
function useBoardTop(element: HTMLElement | null): number {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    if (!element) return undefined;
    const measure = () => setTop(Math.max(0, Math.round(element.getBoundingClientRect().top + window.scrollY)));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [element]);
  return top;
}

/**
 * Stories by workflow stage, as Lanes (the default), Dense or Stacked.
 * Pragmatic drag and drop owns dragging, drop targets and auto-scroll;
 * everything visible is Nova. Byline stores no order inside a stage, so a
 * stage keeps its deterministic sort and a drop means "move to this stage",
 * never an insertion point. Every drag has an equivalent Move to menu.
 */
export function StoryBoard(props: StoryBoardProps) {
  const { stories, statuses, canMoveStories, onMoveStory, layout = "lanes" } = props;
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [board, setBoard] = useState<HTMLDivElement | null>(null);
  const [moved, setMoved] = useState<{ storyId: number; statusId: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [choices, setChoices] = useState<BoardCollapsedChoices>(() => readBoardCollapsed(browserStorage()));
  const byId = useRef(new Map<number, PlanningStory>());
  byId.current = new Map(stories.map((story) => [story.id, story]));
  const mainStatuses = useMemo(() => boardWorkflowStatuses(statuses), [statuses]);
  const sidelined = useMemo(() => statuses.filter((status) => status.group === "sidelined"), [statuses]);
  // Published is a derived, read-only destination, never a workflow move target.
  // Only add it when visible stories require it; a Published-only filter should
  // show that column immediately, not a row of empty workflow columns.
  const publishedStories = useMemo(() => stories.filter((story) => story.publicationState.isPublished), [stories]);
  const publishedOnly = publishedStories.length > 0 && publishedStories.length === stories.length;
  const visibleMain = publishedOnly ? [] : mainStatuses;
  const visibleSidelined = publishedOnly ? [] : sidelined;
  const publishedStatus = statuses.find((status) => status.id === "published") ?? PUBLISHED_STATUS;
  const columns = useMemo(() => new Map([
    ...[...mainStatuses, ...sidelined].map((status): [string, PlanningStory[]] => [status.id, stories.filter((story) => !story.publicationState.isPublished && story.workflow.id === status.id)]),
    ["published", publishedStories] as [string, PlanningStory[]]
  ]), [mainStatuses, sidelined, publishedStories, stories]);
  const fitToWindow = layout !== "stacked";
  const top = useBoardTop(fitToWindow ? frame : null);

  // An explicit fold or unfold outlasts the empty rule, in this browser.
  const setCollapsed = useCallback((statusId: string, collapsed: boolean) => {
    setChoices((current) => {
      const next = { ...current, [statusId]: collapsed };
      writeBoardCollapsed(next, browserStorage());
      return next;
    });
  }, []);

  // One move path: the drop, the menu and the keyboard all end here. A moved card is flashed briefly and focus follows it to its new stage.
  // A folded destination (a rail, a Dense slot, a sidelined chip) keeps the reader's fold: it flashes instead, and focus lands on its control.
  const move = useCallback(async (story: PlanningStory, status: string) => {
    await onMoveStory(story, status);
    const flash = { storyId: story.id, statusId: status };
    setMoved(flash);
    window.setTimeout(() => setMoved((current) => current === flash ? null : current), 1400);
    requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (focused && focused !== document.body && !(focused instanceof HTMLElement && !focused.isConnected)) return;
      const title = board?.querySelector<HTMLElement>(`[data-story-title="${story.id}"]`);
      if (title) { title.focus(); return; }
      const stage = Array.from(board?.querySelectorAll<HTMLElement>("[data-status]") ?? []).find((element) => element.dataset.status === status);
      (stage?.matches("button") ? stage : stage?.querySelector<HTMLElement>("button"))?.focus();
    });
  }, [board, onMoveStory]);

  useEffect(() => {
    if (!canMoveStories) return undefined;
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === DRAG_TYPE,
      onDragStart: () => setDragActive(true),
      onDrop: ({ source, location }) => {
        setDragActive(false);
        const target = location.current.dropTargets[0];
        const story = byId.current.get(Number(source.data.storyId));
        const statusId = target ? String(target.data.statusId) : "";
        if (story && statusId && statusId !== story.workflow.id) void move(story, statusId);
      }
    });
  }, [canMoveStories, move]);

  // Lanes and Dense scroll sideways when the stages do not fit (each column also scrolls itself, and below `sm` the window does); Stacked scrolls only the window.
  useEffect(() => {
    if (!fitToWindow) return autoScrollWindowForElements();
    if (!scroller) return undefined;
    return combine(autoScrollForElements({ element: scroller }), autoScrollWindowForElements());
  }, [fitToWindow, scroller]);

  if (!stories.length && !mainStatuses.length) return <Empty className="border"><EmptyHeader><EmptyTitle>No workflow stages</EmptyTitle><EmptyDescription>No workflow stages are available from the protected Planning API.</EmptyDescription></EmptyHeader></Empty>;
  if (!stories.length) return <Empty className="border"><EmptyHeader><EmptyTitle>No stories match</EmptyTitle><EmptyDescription>Try clearing a filter, or start a new story.</EmptyDescription></EmptyHeader></Empty>;

  const items: StageItems = {
    statuses, canMoveStories, timezone: props.timezone, now: props.now, workspaceUrl: props.workspaceUrl,
    onMoveStory: move, onOpenStory: props.onOpenStory, movingStoryId: props.movingStoryId, movedId: moved?.storyId ?? null, movedStatusId: moved?.statusId ?? null
  };
  const storiesIn = (status: PlanningWorkflowStatus) => columns.get(status.id) || [];
  const stage = (status: PlanningWorkflowStatus) => {
    const inStage = storiesIn(status);
    const stageProps: StageProps = { ...items, status, stories: inStage, collapsed: isStageCollapsed(status.id, inStage.length, choices), onCollapsedChange: setCollapsed };
    return layout === "dense" ? <DenseStage key={status.id} {...stageProps} /> : <LaneColumn key={status.id} {...stageProps} />;
  };
  // The read-only notice sits above the board so a fitted board's measured top already accounts for it.
  const notice = !canMoveStories ? <p className="text-xs text-muted-foreground">You can view this board, but your account cannot move stories.</p> : null;
  const boardRoot = (children: ReactNode) => <div ref={setBoard} className="flex flex-col gap-2" aria-label={"Stories by workflow stage"} data-board-layout={layout}>{notice}{children}</div>;

  if (layout === "stacked") {
    return boardRoot(<div className="flex flex-col gap-4.5">
      {[...visibleMain, ...visibleSidelined, ...(publishedStories.length ? [publishedStatus] : [])].map((status) => <StackedSection key={status.id} {...items} status={status} stories={storiesIn(status)} dragActive={dragActive} />)}
    </div>);
  }

  return boardRoot(<div ref={setFrame} data-board-frame="" style={{ "--board-top": `${top}px` } as CSSProperties}
    className="flex flex-col gap-2 sm:h-[calc(100dvh-var(--board-top)-1.5rem)] sm:min-h-[420px]">
    <div ref={setScroller} data-board-scroller="" className="relative flex min-h-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto max-sm:items-start max-sm:pb-2 sm:snap-none">
      {visibleMain.map(stage)}
      {layout === "lanes" && visibleMain.length && (visibleSidelined.length || publishedStories.length) ? <div aria-hidden="true" data-board-divider="" className="my-1 w-px shrink-0 bg-border" /> : null}
      {layout === "lanes" ? visibleSidelined.map(stage) : null}
      {publishedStories.length ? stage(publishedStatus) : null}
    </div>
    {layout === "dense" && visibleSidelined.length ? <div className="flex shrink-0 flex-wrap items-center gap-2" data-board-sidelined="">
      <span className="text-xs font-medium text-muted-foreground">Sidelined</span>
      {visibleSidelined.map((status) => <SidelinedChip key={status.id} {...items} status={status} stories={storiesIn(status)} />)}
    </div> : null}
  </div>);
}
