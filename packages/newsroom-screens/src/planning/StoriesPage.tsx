import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LayoutGrid, Plus } from "lucide-react";
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
import { StoryFilters } from "./StoryFilters";
import { StoryList } from "./StoryList";
import type { PlanningFetchers } from "./planning-api";
import { useMoveStory, usePlanningStories, useUpdatePlanningStory } from "./planning-query";
import { DEFAULT_PLANNING_SORT, DEFAULT_WORKFLOW_STATUSES, filterPlanningStories, hideFinishedPublished, normalizePlanningFilters, sortPlanningStories, type PlanningFilters, type PlanningPerson, type PlanningSort, type PlanningSortKey, type PlanningStory } from "./planning-model";
import { describePlanningError } from "./planning-model";

const VIEW_LABELS: Record<StoriesView, string> = { board: "Board", list: "List", calendar: "Calendar" };

/** Everyone seen so far as a story's people, so a filter's options do not shrink to whoever the current filter left. */
function mergePeople(known: PlanningPerson[], stories: PlanningStory[], pick: (story: PlanningStory) => Array<PlanningPerson | null>): PlanningPerson[] {
  const people = new Map(known.map((person) => [person.id, person]));
  stories.forEach((story) => pick(story).forEach((person) => { if (person) people.set(person.id, person); }));
  return Array.from(people.values()).sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * How the board is laid out: a reader preference kept in this browser, never a
 * filter, a saved view or part of the address.
 */
function BoardLayoutPicker({ value, onChange }: { value: BoardLayout; onChange: (layout: BoardLayout) => void }) {
  const current = BOARD_LAYOUT_OPTIONS.find((option) => option.id === value) ?? BOARD_LAYOUT_OPTIONS[0]!;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" aria-label={`Board layout: ${current.label}`} data-board-layout-picker="" />}>
      <LayoutGrid data-icon="inline-start" aria-hidden="true" /><span className="sr-only @3xl/stories:not-sr-only">{current.label}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
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
};

/**
 * Stories: one collection, several views. Board, List and (when the host has
 * one) Calendar are Tabs because they are alternate presentations of the same
 * filtered stories; each opens the one Story Peek, and Peek opens the one
 * Story Workspace.
 */
export function StoriesPage({ fetchers, currentUserId, initialView, initialFilters, workspaceUrl, onNewStory, renderCalendar, viewHref }: StoriesPageProps) {
  const { openStory } = useStoryPeek();
  const now = useNow();
  const hasCalendar = Boolean(renderCalendar);
  const presentations = useMemo(() => availableStoriesViews(hasCalendar), [hasCalendar]);
  const [requestedView, setView] = useState<StoriesView>(initialView);
  const view = supportedStoriesView(requestedView, hasCalendar);
  const [filters, setFilters] = useState<PlanningFilters>(() => normalizePlanningFilters(initialFilters));
  const [sort, setSort] = useState<PlanningSort>(DEFAULT_PLANNING_SORT);
  const [savedViewId, setSavedViewId] = useState<string | null>(null);
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
  const stories = useMemo(() => sortPlanningStories(filterPlanningStories(data?.stories || [], filters, userId ?? undefined), sort), [data, filters, sort, userId]);

  // The List is for work in progress: finished published stories stay out of it until asked for.
  const listStories = useMemo(() => hideFinishedPublished(stories, { showPublished, publicationState: filters.publicationState }), [filters.publicationState, showPublished, stories]);

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

  const apply = useCallback((applied: AppliedView) => { setFilters(normalizePlanningFilters(applied.filters)); setSort(applied.sort); setSavedViewId(applied.savedViewId); }, []);
  const changeFilters = useCallback((next: PlanningFilters) => { setFilters(next); }, []);
  const changeSort = useCallback((key: PlanningSortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }), []);
  const open = openStory;
  const storyViews = useStoryViews({ fetchers, filters, sort, selectedId: savedViewId, onApply: apply, initialViews: data?.savedViews });

  const loading = planning.isPending && !data;
  // Which story set (the views picker), how it is presented (Board | List | Calendar) and how it is
  // refined (the filter toolbar) stay three controls. One column: the app's sidebar is the page's only
  // navigation column; a permanent views rail beside Stories did not earn a second one.
  return <div className="@container/stories">
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title={"Stories"} description={"Track everything the newsroom is working on."} actions={onNewStory ? <Button type="button" onClick={onNewStory}><Plus data-icon="inline-start" aria-hidden="true" />New story</Button> : undefined} />
      <Tabs value={view} onValueChange={(next) => changeView(next as StoriesView)} className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <StoryViewsPicker views={storyViews} />
          <div className="flex items-center gap-2">
            {view === "board" ? <BoardLayoutPicker value={boardLayout} onChange={changeBoardLayout} /> : null}
            <TabsList variant="line" aria-label={"Stories presentation"}>
              {presentations.map((id) => <TabsTrigger key={id} value={id}>{VIEW_LABELS[id]}</TabsTrigger>)}
            </TabsList>
          </div>
        </div>
        <StoryFilters filters={filters} onChange={changeFilters} showPublished={view === "list" ? { value: showPublished, onChange: setShowPublished } : undefined} statuses={statuses} writers={people.writers} editors={people.editors} />
        {planning.isError && !data ? <InlineAlert onAction={() => void planning.refetch()}>{describePlanningError(planning.error, "Stories are unavailable right now.")}</InlineAlert> : null}
        {planning.isError && data ? <InlineAlert onAction={() => void planning.refetch()}>These stories may be out of date. Refreshing failed.</InlineAlert> : null}
        {loading
          ? <div role="status" aria-label={"Loading stories"} className="grid gap-3 @3xl/stories:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex flex-col gap-2 rounded-xl border p-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>)}</div>
          : <>
            <TabsContent value="board"><StoryBoard layout={boardLayout} stories={stories} statuses={statuses} canMoveStories={canMove} movingStoryId={movingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onMoveStory={move} onOpenStory={open} /></TabsContent>
            <TabsContent value="list"><StoryList stories={listStories} hiddenPublished={stories.length - listStories.length} statuses={statuses} sort={sort} canMoveStories={canMove} canAssignStories={canAssign} canUpdateStories={canUpdateStories} movingStoryId={movingStoryId} updatingStoryId={updatingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onSortChange={changeSort} onMoveStory={move} onUpdateStory={update} onOpenStory={open} /></TabsContent>
            {renderCalendar ? <TabsContent value="calendar">{renderCalendar({ collectionId: filters.collectionId, stories, timezone, currentUserId: userId, workspaceUrl, onOpenStory: open })}</TabsContent> : null}
          </>}
      </Tabs>
      <p role="status" aria-live="polite" className="sr-only">{loading ? "" : `${stories.length} ${stories.length === 1 ? "story" : "stories"} in this view.`}</p>
    </div>
    {storyViews.dialogs}
  </div>;
}
