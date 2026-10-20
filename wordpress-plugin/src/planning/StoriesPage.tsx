import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { __, sprintf } from "@wordpress/i18n";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { useDebouncedValue, useNow } from "../admin-ui/lib/hooks";
import { Button } from "../admin-ui/ui/button";
import { Skeleton } from "../admin-ui/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../admin-ui/ui/tabs";
import { STORIES_VIEW_IDS, storiesViewFromRoute, writeStoriesViewPreference, type StoriesView } from "../home/navigation-model";
import { useStoryPeek } from "../story/StoryPeekHost";
import type { WorkspaceUrl } from "./calendar-model";
import { PageHeader } from "./PlanningPage";
import { SavedViews, type AppliedView } from "./SavedViews";
import { StoryBoard } from "./StoryBoard";
import { StoryCalendar } from "./StoryCalendar";
import { StoryFilters } from "./StoryFilters";
import { StoryList } from "./StoryList";
import type { PlanningFetchers } from "./planning-api";
import { storiesViewHref } from "./planning-routing";
import { useMoveStory, usePlanningStories, useUpdatePlanningStory } from "./planning-query";
import { DEFAULT_PLANNING_SORT, DEFAULT_WORKFLOW_STATUSES, filterPlanningStories, hideFinishedPublished, normalizePlanningFilters, sortPlanningStories, type PlanningFilters, type PlanningPerson, type PlanningSort, type PlanningSortKey, type PlanningStory } from "./planning-model";
import { describePlanningError } from "./planning-model";

const VIEW_LABELS: Record<StoriesView, string> = { board: __("Board", "weekly-wildcat-headless"), list: __("List", "weekly-wildcat-headless"), calendar: __("Calendar", "weekly-wildcat-headless") };

/** Everyone seen so far as a story's people, so a filter's options do not shrink to whoever the current filter left. */
function mergePeople(known: PlanningPerson[], stories: PlanningStory[], pick: (story: PlanningStory) => Array<PlanningPerson | null>): PlanningPerson[] {
  const people = new Map(known.map((person) => [person.id, person]));
  stories.forEach((story) => pick(story).forEach((person) => { if (person) people.set(person.id, person); }));
  return Array.from(people.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export type StoriesPageProps = {
  fetchers: PlanningFetchers;
  currentUserId: number | null;
  initialView: StoriesView;
  initialFilters?: Partial<PlanningFilters>;
  workspaceUrl: WorkspaceUrl;
  onNewStory?: () => void;
};

/**
 * Stories: one collection, three views. Board, List and Calendar are Tabs
 * because they are alternate presentations of the same filtered stories; each
 * opens the one Story Peek, and Peek opens the one Story Workspace.
 */
export function StoriesPage({ fetchers, currentUserId, initialView, initialFilters, workspaceUrl, onNewStory }: StoriesPageProps) {
  const { openStory } = useStoryPeek();
  const now = useNow();
  const [view, setView] = useState<StoriesView>(initialView);
  const [filters, setFilters] = useState<PlanningFilters>(() => normalizePlanningFilters(initialFilters));
  const [sort, setSort] = useState<PlanningSort>(DEFAULT_PLANNING_SORT);
  const [savedViewId, setSavedViewId] = useState<string | null>(null);
  const [showPublished, setShowPublished] = useState(false);
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
  const listStories = useMemo(() => hideFinishedPublished(stories, { showPublished, wordpressState: filters.wordpressState }), [filters.wordpressState, showPublished, stories]);

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
    window.history.pushState({ view: next }, "", storiesViewHref(window.location.href, next));
  }, []);
  useEffect(() => {
    const restore = () => { const next = storiesViewFromRoute(new URL(window.location.href).searchParams.get("view") || undefined); if (next) setView(next); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const apply = useCallback((applied: AppliedView) => { setFilters(normalizePlanningFilters(applied.filters)); setSort(applied.sort); setSavedViewId(applied.savedViewId); }, []);
  const changeFilters = useCallback((next: PlanningFilters) => { setFilters(next); }, []);
  const changeSort = useCallback((key: PlanningSortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }), []);
  const open = openStory;

  const loading = planning.isPending && !data;
  return <>
    <PageHeader title={__("Stories", "weekly-wildcat-headless")} description={__("Track everything the newsroom is working on.", "weekly-wildcat-headless")} actions={onNewStory ? <Button onClick={onNewStory}><Plus data-icon="inline-start" aria-hidden="true" />{__("New story", "weekly-wildcat-headless")}</Button> : undefined} />
    <Tabs value={view} onValueChange={(next) => changeView(next as StoriesView)} className="gap-3">
      <TabsList variant="line" aria-label={__("Stories views", "weekly-wildcat-headless")}>
        {STORIES_VIEW_IDS.map((id) => <TabsTrigger key={id} value={id}>{VIEW_LABELS[id]}</TabsTrigger>)}
      </TabsList>
      <StoryFilters filters={filters} onChange={changeFilters} showPublished={view === "list" ? { value: showPublished, onChange: setShowPublished } : undefined} statuses={statuses} writers={people.writers} editors={people.editors}
        savedViews={<SavedViews fetchers={fetchers} currentUserId={userId} filters={filters} sort={sort} selectedId={savedViewId} onApply={apply} initialViews={data?.savedViews} />} />
      {planning.isError && !data ? <InlineAlert onAction={() => void planning.refetch()}>{describePlanningError(planning.error, __("Stories are unavailable right now.", "weekly-wildcat-headless"))}</InlineAlert> : null}
      {planning.isError && data ? <InlineAlert onAction={() => void planning.refetch()}>{__("These stories may be out of date. Refreshing failed.", "weekly-wildcat-headless")}</InlineAlert> : null}
      {loading
        ? <div role="status" aria-label={__("Loading stories", "weekly-wildcat-headless")} className="grid gap-3 @3xl/planning:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex flex-col gap-2 rounded-xl border p-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>)}</div>
        : <>
          <TabsContent value="board"><StoryBoard stories={stories} statuses={statuses} canMoveStories={canMove} movingStoryId={movingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onMoveStory={move} onOpenStory={open} /></TabsContent>
          <TabsContent value="list"><StoryList stories={listStories} hiddenPublished={stories.length - listStories.length} statuses={statuses} sort={sort} canMoveStories={canMove} canAssignStories={canAssign} canUpdateStories={canUpdateStories} movingStoryId={movingStoryId} updatingStoryId={updatingStoryId} timezone={timezone} now={now} workspaceUrl={workspaceUrl} onSortChange={changeSort} onMoveStory={move} onUpdateStory={update} onOpenStory={open} /></TabsContent>
          <TabsContent value="calendar"><StoryCalendar stories={stories} timezone={timezone} getSchedule={fetchers.getSchedule} currentUserId={userId} workspaceUrl={workspaceUrl} onOpenStory={open} /></TabsContent>
        </>}
    </Tabs>
    <p role="status" aria-live="polite" className="sr-only">{loading ? "" : sprintf(/* translators: %d: story count. */ __("%d stories in this view.", "weekly-wildcat-headless"), stories.length)}</p>
  </>;
}
