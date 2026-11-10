import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useDebouncedValue, useNow } from "@byline/newsroom-ui/lib/hooks";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import {
  availableStoriesViews,
  storiesViewFromRoute,
  supportedStoriesView,
  writeStoriesViewPreference,
  type StoriesView
} from "./stories-view";
import { BOARD_LAYOUT_OPTIONS, browserStorage, isBoardLayout, preferredBoardLayout, writeBoardLayoutPreference, type BoardLayout } from "./stories-board-layout";
import { useStoryPeek } from "../story/StoryPeekHost";
import { PageHeader } from "./PlanningPage";
import { StoryViewsPicker, useStoryViews, type AppliedView } from "./StoryViews";
import { StoryBoard } from "./StoryBoard";
import { siteDay } from "../home/newsroom-model";
import { StoryFilters } from "./StoryFilters";
import { StoryList } from "./StoryList";
import type { PlanningFetchers } from "./planning-api";
import { useMoveStory, usePlanningStories, useUpdatePlanningStory } from "./planning-query";
import { DEFAULT_WORKFLOW_STATUSES, filterPlanningStories, hideFinishedPublished, mergePeople, normalizePlanningFilters, sortPlanningStories, type PlanningFilters, type PlanningPerson, type PlanningSortKey, type PlanningStory } from "./planning-model";
import { createStoriesWorkspace, type StoriesWorkspace } from "./stories-workspace";
import { useStoriesWorkspaceState } from "./stories-workspace-context";
import { describePlanningError } from "./planning-model";

const VIEW_LABELS: Record<StoriesView, string> = { board: "Board", list: "List", calendar: "Calendar" };

/**
 * How the board is laid out: a reader preference kept in this browser, never a
 * filter, a saved view or part of the address.
 */
function BoardTab({ active, value, onChange }: { active: boolean; value: BoardLayout; onChange: (layout: BoardLayout) => void }) {
  if (!active) return <TabsTrigger value="board">Board</TabsTrigger>;

  const current = BOARD_LAYOUT_OPTIONS.find((option) => option.id === value) ?? BOARD_LAYOUT_OPTIONS[0]!;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<TabsTrigger value="board" aria-label={`Board, ${current.label} layout`} data-board-layout-picker="" />}>
      Board<ChevronDown data-icon="inline-end" aria-hidden="true" className="size-3.5" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Board layout</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => { if (isBoardLayout(next)) onChange(next); }}>
          {BOARD_LAYOUT_OPTIONS.map((option) => <DropdownMenuRadioItem key={option.id} value={option.id} closeOnClick>
            <span className="flex flex-col"><span>{option.label}</span><span className="text-xs text-muted-foreground">{option.description}</span></span>
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** A story's full Story Workspace address. Each host builds its own. */
export type StoryWorkspaceUrl = (storyId: number) => string;

/** What a host's calendar receives: the same filtered stories Board and List show. */
export type StoriesCalendarProps = {
  stories: PlanningStory[];
  /** The newsroom timezone every event is read in, never the browser's. */
  timezone: string;
  currentUserId: number | null;
  collectionId?: number;
  workspaceUrl: StoryWorkspaceUrl;
  onOpenStory: (storyId: number) => void;
};

/** The address of a Stories view when the host does not supply one: the current address with `view=` set. */
export function defaultStoriesViewHref(currentHref: string, view: StoriesView): string {
  const url = new URL(currentHref);
  url.searchParams.set("view", view);
  return `${url.pathname}${url.search}${url.hash}`;
}

export type StoriesPageProps = {
  fetchers: PlanningFetchers;
  currentUserId: number | null;
  initialView: StoriesView;
  initialFilters?: Partial<PlanningFilters>;
  workspaceUrl: StoryWorkspaceUrl;
  /**
   * A page-level New story, for hosts without a global Create (WordPress).
   * A host whose shell already has Create (the Payload newsroom) omits it.
   */
  onNewStory?: () => void;
  /**
   * The host's calendar. Without one Stories offers only Board and List; a
   * Calendar tab never appears without a calendar behind it.
   */
  renderCalendar?: (props: StoriesCalendarProps) => ReactNode;
  /** The address of a view, so a reload or a shared link lands on it. Defaults to the current address with `view=` set. */
  viewHref?: (view: StoriesView) => string;
  /**
   * The host's shared Stories workspace (the Payload shell's), so a sidebar
   * pane and a sheet read and write the same filters and count the same
   * stories. Without one (WordPress) the page keeps its own, exactly as before.
   */
  workspace?: StoriesWorkspace;
  /** The views picker above Board and List. A host hides it while a pane shows the views instead. */
  showViewsPicker?: boolean;
  /** A host control at the start of the tabs row (the Payload newsroom's Views sheet button on narrow screens). */
  viewsControl?: ReactNode;
};

/**
 * Stories: one collection, several views. Board, List and (when the host has
 * one) Calendar are Tabs because they are alternate presentations of the same
 * filtered stories; each opens the one Story Peek, and Peek opens the one
 * Story Workspace.
 */
export function StoriesPage({ fetchers, currentUserId, initialView, initialFilters, workspaceUrl, onNewStory, renderCalendar, viewHref, workspace, showViewsPicker = true, viewsControl }: StoriesPageProps) {
  const { openStory } = useStoryPeek();
  const now = useNow();
  const hasCalendar = Boolean(renderCalendar);
  const presentations = useMemo(() => availableStoriesViews(hasCalendar), [hasCalendar]);
  const [requestedView, setView] = useState<StoriesView>(initialView);
  const view = supportedStoriesView(requestedView, hasCalendar);
  // One store either way: the host's shared one, or the page's own (starting from the address's filters).
  const [ownWorkspace] = useState(() => workspace ? null : createStoriesWorkspace({ filters: initialFilters }));
  const store = (workspace ?? ownWorkspace)!;
  const { filters, sort, savedViewId } = useStoriesWorkspaceState(store);
  // A shared store outlives each visit: an address that names filters (a sidebar shortcut, a shared link) starts that view.
  useLayoutEffect(() => {
    if (workspace) workspace.applyInitialFilters(initialFilters);
    // Once per visit: later changes come from the reader, not the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);
  const [showPublished, setShowPublished] = useState(false);
  const [boardLayout, setBoardLayout] = useState<BoardLayout>(() => preferredBoardLayout(browserStorage()));
  const changeBoardLayout = useCallback((next: BoardLayout) => { setBoardLayout(next); writeBoardLayoutPreference(next, browserStorage()); }, []);
  const [people, setPeople] = useState<{ writers: PlanningPerson[]; editors: PlanningPerson[] }>({ writers: [], editors: [] });

  const planning = usePlanningStories(fetchers, useDebouncedValue(filters, 200));
  const data = planning.data;
  const statuses = data?.workflowStatuses?.length ? data.workflowStatuses : DEFAULT_WORKFLOW_STATUSES;
  const userId = currentUserId ?? data?.currentUser?.id ?? null;
  const timezone = data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const canMove = data?.capabilities.canMoveStories ?? false;
  const canAssign = data?.capabilities.canAssign ?? false;
  const { move, movingStoryId } = useMoveStory(fetchers, statuses);
  const { update, updatingStoryId, available: canUpdateStories } = useUpdatePlanningStory(fetchers);
  // The pane counts every story in scope (its Collection), not only the current view's: one more read only while filtered.
  const countScope = useMemo(() => normalizePlanningFilters({ collectionId: filters.collectionId }), [filters.collectionId]);
  const counted = usePlanningStories(fetchers, countScope, { enabled: Boolean(workspace) });
  const stories = useMemo(() => sortPlanningStories(filterPlanningStories(data?.stories || [], filters, userId ?? undefined), sort), [data, filters, sort, userId]);

  // Board and List are work-in-progress views. Finished published stories stay
  // out of both until requested; an explicit Published view always shows them.
  const workingStories = useMemo(() => hideFinishedPublished(stories, {
    showPublished,
    publicationState: filters.publicationState || (filters.workflow === "published" ? "published" : "")
  }), [filters.publicationState, filters.workflow, showPublished, stories]);
  const hiddenPublished = stories.length - workingStories.length;
  const visibleCount = view === "calendar" ? stories.length : workingStories.length;

  useEffect(() => {
    if (!data) return;
    setPeople((current) => ({
      writers: mergePeople(current.writers, data.stories, (story) => [...story.authors, story.writer]),
      editors: mergePeople(current.editors, data.stories, (story) => [story.editor])
    }));
  }, [data]);

  // The address always names the view, so a reload or a shared link lands on the same one.
  const changeView = useCallback((next: StoriesView) => {
    setView(next);
    writeStoriesViewPreference(next, typeof window === "undefined" ? null : window.localStorage);
    window.history.pushState({ view: next }, "", viewHref ? viewHref(next) : defaultStoriesViewHref(window.location.href, next));
  }, [viewHref]);
  useEffect(() => {
    // Back and forward restore the view the address names; hosts keep `view=` as the generic parameter.
    const restore = () => { const next = storiesViewFromRoute(new URL(window.location.href).searchParams.get("view") || undefined); if (next) setView(next); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const apply = useCallback((applied: AppliedView) => store.applyView(applied), [store]);
  const changeFilters = useCallback((next: PlanningFilters) => store.setFilters(next), [store]);
  const changeSort = useCallback((key: PlanningSortKey) => {
    const current = store.getState().sort;
    store.setSort(current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }, [store]);
  const open = openStory;
  const storyViews = useStoryViews({ fetchers, filters, sort, selectedId: savedViewId, onApply: apply, initialViews: data?.savedViews, timezone: data?.timezone });

  // What a shared workspace's pane counts and offers. Publishing is a no-op unless something changed.
  const countedStories = counted.data?.stories;
  const { savedViews, canSave, full, openSave, openManage } = storyViews;
  useEffect(() => {
    if (!workspace || !countedStories) return;
    workspace.publishData({ stories: countedStories, workflowStatuses: statuses, timezone, currentUserId: userId, savedViews, canSaveViews: canSave, savedViewsFull: full });
  }, [canSave, countedStories, full, savedViews, statuses, timezone, userId, workspace]);
  useEffect(() => {
    if (!workspace) return;
    workspace.setViewCommands({ openSave, openManage });
    return () => workspace.setViewCommands(null);
  });

  const loading = planning.isPending && !data;
  // Which story set (the views picker), how it is presented (Board | List | Calendar) and how it is
  // refined (the filter toolbar) stay three controls. One column: the app's sidebar is the page's only
  // navigation column; a permanent views rail beside Stories did not earn a second one.
  return <div className="@container/stories">
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title={"Stories"} description={"Track everything the newsroom is working on."} actions={onNewStory ? <Button type="button" onClick={onNewStory}><Plus data-icon="inline-start" aria-hidden="true" />New story</Button> : undefined} />
      <Tabs value={view} onValueChange={(next) => changeView(next as StoriesView)} className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {showViewsPicker || viewsControl ? <div className="flex items-center gap-2">
            {viewsControl}
            {showViewsPicker ? <StoryViewsPicker views={storyViews} /> : null}
          </div> : null}
          <div className={showViewsPicker || viewsControl ? "flex items-center gap-2" : "flex flex-1 flex-row-reverse items-center justify-between gap-2"}>
            <TabsList variant="line" aria-label={"Stories presentation"}>
              {presentations.map((id) => id === "board"
                ? <BoardTab key={id} active={view === "board"} value={boardLayout} onChange={changeBoardLayout} />
                : <TabsTrigger key={id} value={id}>{VIEW_LABELS[id]}</TabsTrigger>)}
            </TabsList>
          </div>
        </div>
        <StoryFilters today={siteDay(now, timezone)} filters={filters} onChange={changeFilters} showPublished={view === "board" || view === "list" ? { value: showPublished, onChange: setShowPublished } : undefined} statuses={statuses} writers={people.writers} editors={people.editors} />
        {(view === "board" || view === "list") && hiddenPublished > 0 ? <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground" role="status" data-hidden-published="">
          <span>{hiddenPublished} finished published {hiddenPublished === 1 ? "story is" : "stories are"} hidden from this view.</span>
          <Button type="button" size="xs" variant="link" className="h-auto p-0 text-xs any-pointer-coarse:min-h-11" onClick={() => setShowPublished(true)}>Show published</Button>
        </div> : null}
        {planning.isError && !data ? <InlineAlert onAction={() => void planning.refetch()}>{describePlanningError(planning.error, "Stories are unavailable right now.")}</InlineAlert> : null}
        {planning.isError && data ? <InlineAlert onAction={() => void planning.refetch()}>These stories may be out of date. Refreshing failed.</InlineAlert> : null}
        {loading
          ? <div role="status" aria-label={"Loading stories"} className="grid gap-3 @3xl/stories:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex flex-col gap-2 rounded-xl border p-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>)}</div>
          : <>
            <TabsContent value="board"><StoryBoard layout={boardLayout} stories={workingStories} statuses={statuses} canMoveStories={canMove} movingStoryId={movingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onMoveStory={move} onOpenStory={open} /></TabsContent>
            <TabsContent value="list"><StoryList stories={workingStories} hiddenPublished={hiddenPublished} statuses={statuses} sort={sort} canMoveStories={canMove} canAssignStories={canAssign} canUpdateStories={canUpdateStories} movingStoryId={movingStoryId} updatingStoryId={updatingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onSortChange={changeSort} onMoveStory={move} onUpdateStory={update} onOpenStory={open} /></TabsContent>
            {renderCalendar ? <TabsContent value="calendar">{renderCalendar({ collectionId: filters.collectionId, stories, timezone, currentUserId: userId, workspaceUrl, onOpenStory: open })}</TabsContent> : null}
          </>}
      </Tabs>
      <p role="status" aria-live="polite" className="sr-only">{loading ? "" : `${visibleCount} ${visibleCount === 1 ? "story" : "stories"} shown in this view.`}</p>
    </div>
    {storyViews.dialogs}
  </div>;
}
