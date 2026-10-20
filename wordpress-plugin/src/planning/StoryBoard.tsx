import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements, autoScrollWindowForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { __ } from "@wordpress/i18n";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { cn } from "../admin-ui/lib/utils";
import { Badge } from "../admin-ui/ui/badge";
import { Card, CardContent } from "../admin-ui/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { StoryDueLabel, StorySignals, StoryTitleButton, WorkflowBadge } from "../story/story-parts";
import { StoryHoverCard } from "../story/StoryHoverCard";
import { StoryActionsMenu } from "./StoryActionsMenu";
import { boardWorkflowStatuses, type PlanningStory, type PlanningWorkflowStatus } from "./planning-model";

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
};

const DRAG_TYPE = "byline-story";

/** A story can be dragged only if the viewer may move stories and WordPress has not published it. */
const isMovable = (story: PlanningStory, canMoveStories: boolean) => canMoveStories && !story.wordpressState.isPublished;

function BoardCard({ story, statuses, canMoveStories, moving, moved, timezone, now, workspaceUrl, onMoveStory, onOpenStory }: Omit<StoryBoardProps, "stories" | "movingStoryId"> & { story: PlanningStory; moving: boolean; moved: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const movable = isMovable(story, canMoveStories);

  // Pragmatic drag and drop owns the pointer drag. Its native drag image is the card itself; the source stays in place, subdued.
  useEffect(() => {
    const element = ref.current;
    if (!element || !movable) return undefined;
    return draggable({
      element,
      getInitialData: () => ({ type: DRAG_TYPE, storyId: story.id, workflowId: story.workflow.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false)
    });
  }, [movable, story.id, story.workflow.id]);

  const writers = story.authors.length ? story.authors : story.writer ? [story.writer] : [];
  const names = writers.map((person) => person.name).join(", ");
  return <Card ref={ref} size="sm" role="listitem" data-story-id={story.id} data-dragging={dragging} data-moved={moved} aria-busy={moving || undefined}
    className={cn("gap-1.5 py-2.5 transition-colors duration-700", movable && "cursor-grab", "data-[dragging=true]:opacity-40 data-[moved=true]:bg-accent")}>
    <CardContent className="flex flex-col gap-1.5 px-3">
      <StoryHoverCard storyId={story.id} title={story.title} story={story}><StoryTitleButton story={story} onOpen={onOpenStory} className="text-sm leading-snug line-clamp-3" data-story-title={story.id} /></StoryHoverCard>
      <div className="flex min-w-0 items-center gap-2 text-xs">
        {writers.length
          ? <><PeopleAvatars people={writers} /><span className="truncate text-muted-foreground" title={names}>{names}</span></>
          : <span className="text-muted-foreground">{__("Unassigned", "weekly-wildcat-headless")}</span>}
      </div>
      <StoryDueLabel value={story.deadline} timezone={timezone} now={now} prefix="Due " empty={__("No deadline", "weekly-wildcat-headless")} className="text-xs" />
      <div className="-mb-1 flex items-center justify-between gap-1">
        <StorySignals story={story} className="min-w-0" />
        <StoryActionsMenu story={story} statuses={statuses} canMove={canMoveStories} disabled={moving} onMove={onMoveStory} workspaceUrl={workspaceUrl} className="ml-auto -mr-1.5" />
      </div>
    </CardContent>
  </Card>;
}

function BoardColumn({ status, stories, canMoveStories, ...card }: Omit<StoryBoardProps, "stories"> & { status: PlanningWorkflowStatus; stories: PlanningStory[]; movedId: number | null }) {
  const ref = useRef<HTMLElement | null>(null);
  const [over, setOver] = useState(false);
  const headingId = `board-column-${status.id}`;

  // The whole column is the drop target, empty or not. A column accepts any movable story that is not already in it.
  useEffect(() => {
    const element = ref.current;
    if (!element || !canMoveStories) return undefined;
    return dropTargetForElements({
      element,
      getData: () => ({ statusId: status.id }),
      canDrop: ({ source }) => source.data.type === DRAG_TYPE && source.data.workflowId !== status.id,
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false)
    });
  }, [canMoveStories, status.id]);

  return <section ref={ref} aria-labelledby={headingId} data-status={status.id} data-over={over}
    className="flex min-h-40 w-72 shrink-0 snap-start flex-col gap-2 rounded-xl border bg-background p-2 transition-colors data-[over=true]:bg-muted/60 data-[over=true]:ring-2 data-[over=true]:ring-ring/40 max-sm:w-[80vw] @5xl/planning:w-auto @5xl/planning:min-w-48 @5xl/planning:flex-1">
    <header className="flex items-center justify-between px-1.5 pt-0.5">
      <h3 id={headingId} className="text-sm font-medium"><WorkflowBadge workflow={status} className="max-w-none" /></h3>
      <Badge variant="secondary" aria-label={`${stories.length} ${stories.length === 1 ? __("story", "weekly-wildcat-headless") : __("stories", "weekly-wildcat-headless")}`}>{stories.length}</Badge>
    </header>
    <div role="list" aria-labelledby={headingId} className="flex flex-1 flex-col gap-2">
      {stories.map((story) => <BoardCard key={story.id} story={story} canMoveStories={canMoveStories} moving={card.movingStoryId === story.id} moved={card.movedId === story.id} statuses={card.statuses} timezone={card.timezone} now={card.now} workspaceUrl={card.workspaceUrl} onMoveStory={card.onMoveStory} onOpenStory={card.onOpenStory} />)}
      {stories.length ? null : <p className="px-1.5 py-2 text-xs text-muted-foreground">{__("No stories", "weekly-wildcat-headless")}</p>}
    </div>
  </section>;
}

/**
 * Stories by workflow stage. Pragmatic drag and drop owns dragging, drop targets
 * and auto-scroll; everything visible is Nova. Byline stores no order inside a
 * stage, so a column keeps its deterministic sort and a drop means "move to this
 * stage", never an insertion point. Every drag has an equivalent Move to menu.
 */
export function StoryBoard(props: StoryBoardProps) {
  const { stories, statuses, canMoveStories, onMoveStory } = props;
  const scroller = useRef<HTMLDivElement | null>(null);
  const [movedId, setMovedId] = useState<number | null>(null);
  const byId = useRef(new Map<number, PlanningStory>());
  byId.current = new Map(stories.map((story) => [story.id, story]));
  const mainStatuses = boardWorkflowStatuses(statuses);
  const sidelined = statuses.filter((status) => status.group === "sidelined");
  const columns = useMemo(() => new Map([...mainStatuses, ...sidelined].map((status) => [status.id, stories.filter((story) => story.workflow.id === status.id)])), [mainStatuses, sidelined, stories]);

  // One move path: the drop, the menu and the keyboard all end here. A moved card is flashed briefly and focus follows it to its new column.
  const move = useCallback(async (story: PlanningStory, status: string) => {
    await onMoveStory(story, status);
    setMovedId(story.id);
    window.setTimeout(() => setMovedId((current) => current === story.id ? null : current), 1400);
    requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (focused && focused !== document.body && !(focused instanceof HTMLElement && !focused.isConnected)) return;
      document.querySelector<HTMLElement>(`[data-story-title="${story.id}"]`)?.focus();
    });
  }, [onMoveStory]);

  useEffect(() => {
    if (!canMoveStories) return undefined;
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === DRAG_TYPE,
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        const story = byId.current.get(Number(source.data.storyId));
        const statusId = target ? String(target.data.statusId) : "";
        if (story && statusId && statusId !== story.workflow.id) void move(story, statusId);
      }
    });
  }, [canMoveStories, move]);

  // The board scrolls sideways when the stages do not fit; dragging near either edge scrolls it, and near the top or bottom of the window scrolls the page.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return undefined;
    return combine(autoScrollForElements({ element }), autoScrollWindowForElements());
  }, []);

  if (!stories.length && !mainStatuses.length) return <Empty className="border"><EmptyHeader><EmptyTitle>{__("No workflow stages", "weekly-wildcat-headless")}</EmptyTitle><EmptyDescription>{__("No workflow stages are available from the protected Planning API.", "weekly-wildcat-headless")}</EmptyDescription></EmptyHeader></Empty>;
  if (!stories.length) return <Empty className="border"><EmptyHeader><EmptyTitle>{__("No stories match", "weekly-wildcat-headless")}</EmptyTitle><EmptyDescription>{__("Try clearing a filter, or start a new story.", "weekly-wildcat-headless")}</EmptyDescription></EmptyHeader></Empty>;

  const column = (status: PlanningWorkflowStatus) => <BoardColumn key={status.id} {...props} status={status} stories={columns.get(status.id) || []} movedId={movedId} onMoveStory={move} />;
  return <div className="flex flex-col gap-4" aria-label={__("Stories by workflow stage", "weekly-wildcat-headless")}>
    <div ref={scroller} data-board-scroller="" className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 max-sm:items-start @5xl/planning:snap-none">{mainStatuses.map(column)}</div>
    {sidelined.length ? <section aria-labelledby="board-sidelined" className="flex flex-col gap-2">
      <h3 id="board-sidelined" className="text-sm font-medium text-muted-foreground">{__("Sidelined", "weekly-wildcat-headless")}</h3>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">{sidelined.map(column)}</div>
    </section> : null}
    {!canMoveStories ? <p className="text-xs text-muted-foreground">{__("You can view this board, but your account cannot move stories.", "weekly-wildcat-headless")}</p> : null}
  </div>;
}
