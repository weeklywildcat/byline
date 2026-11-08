import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Columns3, LayoutGrid, List, Plus, type LucideIcon } from "lucide-react";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useDebouncedValue, useNow } from "@byline/newsroom-ui/lib/hooks";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { storiesViewFromRoute, writeStoriesViewPreference, type StoriesView } from "./stories-view";
import {
  applyStoriesLocation,
  defaultScopeSort,
  firstSortDirection,
  normalizeStoryScope,
  presentationForScope,
  promoteScopeFromFilters,
  resolveStoriesRoute,
  scopePresentations,
  storiesInScope,
  storyScopeCounts,
  STORY_SCOPE_IDS,
  STORY_SCOPE_LABELS,
  type StoryScope
} from "./stories-scope";
import { BOARD_LAYOUT_OPTIONS, browserStorage, isBoardLayout, preferredBoardLayout, writeBoardLayoutPreference, type BoardLayout } from "./stories-board-layout";
import { useStoryPeek } from "../story/StoryPeekHost";
import { PageHeader } from "./PlanningPage";
import { StoryViewsPicker, useStoryViews, type AppliedView } from "./StoryViews";
import { StoriesEmpty } from "./StoriesEmpty";
import { StoryBoard } from "./StoryBoard";
import { hasActiveFilters, StoryFilters } from "./StoryFilters";
import { StoryLibrary } from "./StoryLibrary";
import { StoryList } from "./StoryList";
import type { PlanningFetchers } from "./planning-api";
import { useMoveStory, usePlanningStories, useUpdatePlanningStory } from "./planning-query";
import { DEFAULT_WORKFLOW_STATUSES, EMPTY_PLANNING_FILTERS, filterPlanningStories, normalizePlanningFilters, sortPlanningStories, type PlanningFilters, type PlanningPerson, type PlanningSort, type PlanningSortKey, type PlanningStory } from "./planning-model";
import { describePlanningError } from "./planning-model";

const VIEW_LABELS: Record<StoriesView, string> = { board: "Board", list: "List", calendar: "Calendar" };
const VIEW_ICONS: Record<StoriesView, LucideIcon> = { board: Columns3, list: List, calendar: CalendarDays };

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

/**
 * How the stories in this scope are shown. Scope changes which stories; this changes only how
 * they look, so it is a compact single-choice group beside the scope, not a second set of tabs.
 * A scope with one presentation does not render it at all.
 */
function PresentationToggle({ value, options, onChange }: { value: StoriesView; options: StoriesView[]; onChange: (view: StoriesView) => void }) {
  return <ToggleGroup variant="outline" size="sm" spacing={0} aria-label={"Stories presentation"} value={[value]} onValueChange={(next) => {
    // Pressing the chosen one again would clear a single-choice group; a presentation is always chosen.
    const picked = next[0];
    if (picked && options.includes(picked as StoriesView)) onChange(picked as StoriesView);
  }}>
    {options.map((id) => {
      const Icon = VIEW_ICONS[id];
      return <ToggleGroupItem key={id} value={id} data-presentation={id} className="text-muted-foreground aria-pressed:font-semibold aria-pressed:text-foreground"><Icon data-icon="inline-start" aria-hidden="true" />{VIEW_LABELS[id]}</ToggleGroupItem>;
    })}
  </ToggleGroup>;
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

/** Where the reader is in Stories: which stories (scope) and, in Working, how they are shown (view). */
export type StoriesLocation = { scope: StoryScope; view: StoriesView };

/** The address of a Stories location when the host does not supply one: the current address with `scope=` or `view=` set. */
export function defaultStoriesLocationHref(currentHref: string, location: StoriesLocation): string {
  const url = applyStoriesLocation(new URL(currentHref), location);
  return `${url.pathname}${url.search}${url.hash}`;
}

export type StoriesPageProps = {
  fetchers: PlanningFetchers;
  currentUserId: number | null;
  /** The Working presentation to open on (and return to); a library scope always lists. */
  initialView: StoriesView;
  /** Which stories to open on. `publicationState: "published"` in `initialFilters` also means Published. Defaults to Working. */
  initialScope?: StoryScope;
  initialFilters?: Partial<PlanningFilters>;
  workspaceUrl: StoryWorkspaceUrl;
  /**
   * A page-level New story, for hosts without a global Create (WordPress).
   * A host whose shell already has Create (the Payload newsroom) omits it.
   */
  onNewStory?: () => void;
  /**
   * The host's calendar. Without one Stories offers only Board and List; a
   * Calendar presentation never appears without a calendar behind it.
   */
  renderCalendar?: (props: StoriesCalendarProps) => ReactNode;
  /** The address of a location, so a reload or a shared link lands on it. Defaults to the current address with `scope=` or `view=` set. */
  locationHref?: (location: StoriesLocation) => string;
};

/**
 * Stories: the one home of every story. Three things are chosen separately:
 *
 *  - Scope (Tabs): Working, Published or All, which stories you are looking at.
 *  - Presentation (ToggleGroup): Board, List or Calendar, only in Working; a library lists.
 *  - Refinement (the views picker and filter toolbar): which of those stories.
 *
 * Every presentation opens the one Story Peek, and Peek opens the one Story Workspace.
 */
export function StoriesPage({ fetchers, currentUserId, initialView, initialScope, initialFilters, workspaceUrl, onNewStory, renderCalendar, locationHref }: StoriesPageProps) {
  const { openStory } = useStoryPeek();
  const now = useNow();
  const hasCalendar = Boolean(renderCalendar);
  // Filters that name Published (an old link, a saved view) open the Published scope instead of a Working tab that would hide them.
  const [start] = useState(() => promoteScopeFromFilters(initialFilters, normalizeStoryScope(initialScope)));
  const [scope, setScope] = useState<StoryScope>(start.scope);
  const [workingView, setWorkingView] = useState<StoriesView>(initialView);
  const view = presentationForScope(scope, workingView, hasCalendar);
  const presentations = useMemo(() => scopePresentations(scope, hasCalendar), [scope, hasCalendar]);
  const [filters, setFilters] = useState<PlanningFilters>(start.filters);
  const [sorts, setSorts] = useState<Record<StoryScope, PlanningSort>>(() => ({ working: defaultScopeSort("working"), published: defaultScopeSort("published"), all: defaultScopeSort("all") }));
  const sort = sorts[scope];
  const [savedViewId, setSavedViewId] = useState<string | null>(null);
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
  // The planning response already carries every story the reader may see (the server narrows it by the refinements),
  // so the scope counts need no request of their own.
  const refined = useMemo(() => filterPlanningStories(data?.stories || [], filters, userId ?? undefined), [data, filters, userId]);
  const counts = useMemo(() => (data ? storyScopeCounts(refined) : null), [data, refined]);
  const stories = useMemo(() => sortPlanningStories(storiesInScope(refined, scope), sort), [refined, scope, sort]);
  // The Calendar plots publications too, so it keeps every refined story, not only the work queue.
  const calendarStories = useMemo(() => sortPlanningStories(refined, sorts.working), [refined, sorts.working]);

  useEffect(() => {
    if (!data) return;
    setPeople((current) => ({
      writers: mergePeople(current.writers, data.stories, (story) => [...story.authors, story.writer]),
      editors: mergePeople(current.editors, data.stories, (story) => [story.editor])
    }));
  }, [data]);

  // The address always names the scope and view, so a reload, a shared link and Back all land on the same one.
  const navigate = useCallback((location: StoriesLocation) => {
    window.history.pushState({ ...location }, "", locationHref ? locationHref(location) : defaultStoriesLocationHref(window.location.href, location));
  }, [locationHref]);
  const changeScope = useCallback((next: StoryScope) => {
    if (next === scope) return;
    setScope(next);
    // A saved view was chosen for a scope; leaving it abandons the view, so a tab never shows "(modified)" for being clicked.
    setSavedViewId(null);
    navigate({ scope: next, view: presentationForScope(next, workingView, hasCalendar) });
  }, [hasCalendar, navigate, scope, workingView]);
  const changeView = useCallback((next: StoriesView) => {
    setWorkingView(next);
    writeStoriesViewPreference(next, typeof window === "undefined" ? null : window.localStorage);
    navigate({ scope: "working", view: next });
  }, [navigate]);
  useEffect(() => {
    // Back and forward restore the scope and presentation the address names; hosts keep `scope=` and `view=` as the generic parameters.
    const restore = () => {
      const route = resolveStoriesRoute(new URL(window.location.href).searchParams);
      setScope(route.scope);
      const next = storiesViewFromRoute(route.view ?? undefined);
      if (next) setWorkingView(next);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const apply = useCallback((applied: AppliedView) => {
    const promoted = promoteScopeFromFilters(applied.filters, applied.scope ?? scope);
    setFilters(promoted.filters);
    setSorts((current) => ({ ...current, [promoted.scope]: applied.sort }));
    setSavedViewId(applied.savedViewId);
    if (promoted.scope !== scope) {
      setScope(promoted.scope);
      navigate({ scope: promoted.scope, view: presentationForScope(promoted.scope, workingView, hasCalendar) });
    }
  }, [hasCalendar, navigate, scope, workingView]);
  const changeFilters = useCallback((next: PlanningFilters) => { setFilters(next); }, []);
  const clearFilters = useCallback(() => setFilters({ ...EMPTY_PLANNING_FILTERS }), []);
  const changeSort = useCallback((key: PlanningSortKey) => setSorts((current) => {
    const existing = current[scope];
    return { ...current, [scope]: existing.key === key ? { key, direction: existing.direction === "asc" ? "desc" : "asc" } : { key, direction: firstSortDirection(key) } };
  }), [scope]);
  const open = openStory;
  const storyViews = useStoryViews({ fetchers, filters, scope, sort, selectedId: savedViewId, onApply: apply, initialViews: data?.savedViews });

  const loading = planning.isPending && !data;
  const filtersActive = hasActiveFilters(filters);
  // Which stories (the scope tabs), how they are shown (the presentation toggle), which of them (the views picker and
  // the filter toolbar) are separate controls. One column: the app's sidebar is the page's only navigation column.
  const body = <>
    <StoryFilters scope={scope} filters={filters} onChange={changeFilters} statuses={statuses} writers={people.writers} editors={people.editors} />
    {planning.isError && !data ? <InlineAlert onAction={() => void planning.refetch()}>{describePlanningError(planning.error, "Stories are unavailable right now.")}</InlineAlert> : null}
    {planning.isError && data ? <InlineAlert onAction={() => void planning.refetch()}>These stories may be out of date. Refreshing failed.</InlineAlert> : null}
    {loading
      ? <div role="status" aria-label={"Loading stories"} className="grid gap-3 @3xl/stories:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex flex-col gap-2 rounded-xl border p-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>)}</div>
      : view === "calendar" && renderCalendar
        ? renderCalendar({ collectionId: filters.collectionId, stories: calendarStories, timezone, currentUserId: userId, workspaceUrl, onOpenStory: open })
        : stories.length === 0
          ? <StoriesEmpty scope={scope} filtersActive={filtersActive} onClear={clearFilters} />
          : scope !== "working"
            ? <StoryLibrary scope={scope} stories={stories} statuses={statuses} sort={sort} canMoveStories={canMove} movingStoryId={movingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onSortChange={changeSort} onMoveStory={move} onOpenStory={open} />
            : view === "board"
              ? <StoryBoard layout={boardLayout} stories={stories} statuses={statuses} canMoveStories={canMove} movingStoryId={movingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onMoveStory={move} onOpenStory={open} />
              : <StoryList stories={stories} statuses={statuses} sort={sort} canMoveStories={canMove} canAssignStories={canAssign} canUpdateStories={canUpdateStories} movingStoryId={movingStoryId} updatingStoryId={updatingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onSortChange={changeSort} onMoveStory={move} onUpdateStory={update} onOpenStory={open} />}
  </>;

  return <div className="@container/stories">
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title={"Stories"} description={"The newsroom's stories, in progress and published."} actions={onNewStory ? <Button type="button" onClick={onNewStory}><Plus data-icon="inline-start" aria-hidden="true" />New story</Button> : undefined} />
      <Tabs value={scope} onValueChange={(next) => changeScope(normalizeStoryScope(next))} className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <TabsList variant="line" aria-label={"Stories scope"}>
            {STORY_SCOPE_IDS.map((id) => <TabsTrigger key={id} value={id} data-scope={id}>
              {STORY_SCOPE_LABELS[id]}
              {counts ? <span data-scope-count="" className="text-xs font-normal text-muted-foreground tabular-nums">{counts[id]}</span> : null}
            </TabsTrigger>)}
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <StoryViewsPicker views={storyViews} />
            {view === "board" ? <BoardLayoutPicker value={boardLayout} onChange={changeBoardLayout} /> : null}
            {presentations.length > 1 ? <PresentationToggle value={view} options={presentations} onChange={changeView} /> : null}
          </div>
        </div>
        {STORY_SCOPE_IDS.map((id) => <TabsContent key={id} value={id} className="flex flex-col gap-3">{id === scope ? body : null}</TabsContent>)}
      </Tabs>
      <p role="status" aria-live="polite" className="sr-only">{loading ? "" : `${stories.length} ${stories.length === 1 ? "story" : "stories"} in ${STORY_SCOPE_LABELS[scope]}.`}</p>
    </div>
    {storyViews.dialogs}
  </div>;
}
