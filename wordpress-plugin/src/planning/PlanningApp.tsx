import { Button, SearchControl, SelectControl, TextControl, ToggleControl } from "@wordpress/components";
import { useCallback, useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import { PlanningCalendar } from "./Calendar";
import { ContentHealth } from "./ContentHealth";
import { Coverage } from "./Coverage";
import { Feedback } from "./Feedback";
import { MediaDesk } from "./MediaDesk";
import { Performance } from "./Performance";
import { StoryBoard } from "./StoryBoard";
import { StoryList } from "./StoryList";
import { preferredStoriesView, writeStoriesViewPreference } from "../home/navigation-model";
import type { PlanningFetchers } from "./planning-api";
import {
  applyPlanningMove,
  DEFAULT_PLANNING_SORT,
  DEFAULT_WORKFLOW_STATUSES,
  deserializeSavedPlanningView,
  EMPTY_PLANNING_FILTERS,
  filterPlanningStories,
  filterSavedViewsForUser,
  normalizePlanningFilters,
  optionalApiFallback,
  sortPlanningStories,
  type ContentHealthResponse,
  type CoverageResponse,
  type FeedbackResponse,
  type MediaDeskResponse,
  type OptionalResource,
  type PerformanceResponse,
  type PlanningFilters,
  type PlanningResponse,
  type PlanningSort,
  type PlanningSortKey,
  type PlanningStory,
  type PlanningView,
  type PlanningWorkflowStatus,
  type SavedPlanningView
} from "./planning-model";
import { PlanningEmpty, PlanningLoading, PlanningNotice, ViewHeader } from "./planning-ui";

export type PlanningAppProps = {
  /** An apiFetch-backed client created with createPlanningFetchers. */
  fetchers: PlanningFetchers;
  initialView?: PlanningView;
  /** Restore the last Stories view only when the Stories route did not name one explicitly. */
  rememberStoriesView?: boolean;
  initialFilters?: Partial<PlanningFilters>;
  initialSort?: PlanningSort;
  /** Optional server-provided response to avoid a duplicate first request. */
  initialData?: PlanningResponse;
  /** Pass the authenticated user's ID so saved-view ownership can be checked client-side. */
  currentUserId?: number | null;
  onOpenStory?: (story: PlanningStory) => void;
};

const VIEW_LABELS: Record<PlanningView, string> = {
  board: "Board",
  list: "List",
  calendar: "Calendar",
  media: "Media Desk",
  coverage: "Coverage",
  feedback: "Feedback",
  performance: "Performance",
  "content-health": "Content Health"
};

const WORDPRESS_STATE_OPTIONS = [
  { label: "All WordPress states", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Scheduled", value: "future" },
  { label: "Published", value: "publish" }
] as Array<{ label: string; value: string }>;

const VISUAL_STATUS_OPTIONS = [
  { label: "All visual statuses", value: "" },
  { label: "Needed", value: "needed" },
  { label: "Assigned", value: "assigned" },
  { label: "In progress", value: "in-progress" },
  { label: "Uploaded", value: "uploaded" },
  { label: "Selected", value: "selected" },
  { label: "Done", value: "done" }
] as Array<{ label: string; value: string }>;

function blankResource<T>(): OptionalResource<T> {
  return { data: null, error: null, available: false };
}

/**
 * Optional Planning tabs share the same failure policy: unavailable data is a
 * visible empty state, never a reason for the stories collection to fail.
 */
function useOptionalResource<T>(fetcher: (() => Promise<T>) | undefined, label: string) {
  const [resource, setResource] = useState<OptionalResource<T>>(() => ({
    ...blankResource<T>(),
    available: Boolean(fetcher)
  }));
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!fetcher) {
      setResource({ data: null, error: `${label} is not available in this install.`, available: false });
      return;
    }

    setIsLoading(true);
    setResource((current) => ({ ...current, error: null, available: true }));
    try {
      const data = await fetcher();
      setResource({ data, error: null, available: true });
    } catch (error: unknown) {
      setResource(optionalApiFallback<T>(error, null, label));
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, label]);

  return { resource, isLoading, load };
}

function statusOptions(statuses: PlanningWorkflowStatus[]): Array<{ label: string; value: string }> {
  return [
    { label: "All workflow stages", value: "" },
    ...statuses.filter((status) => status.group !== "derived").map((status) => ({ label: status.label, value: status.id }))
  ];
}

function uniquePeople(stories: PlanningStory[], field: "writer" | "editor") {
  const people = new Map<number, { id: number; name: string }>();
  stories.forEach((story) => {
    const person = story[field];
    if (person) people.set(person.id, person);
  });
  return Array.from(people.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function viewIsStories(view: PlanningView): boolean {
  return view === "board" || view === "list" || view === "calendar";
}

function sameFilters(left: PlanningFilters, right: PlanningFilters): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function PlanningApp({
  fetchers,
  initialView = "board",
  rememberStoriesView = false,
  initialFilters,
  initialSort = DEFAULT_PLANNING_SORT,
  initialData,
  currentUserId,
  onOpenStory
}: PlanningAppProps) {
  const [view, setView] = useState<PlanningView>(() => {
    if (!rememberStoriesView || (initialView !== "board" && initialView !== "list" && initialView !== "calendar")) return initialView;
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    return preferredStoriesView(initialView, storage);
  });
  const [filters, setFilters] = useState<PlanningFilters>(() => normalizePlanningFilters(initialFilters));
  const [sort, setSort] = useState<PlanningSort>(initialSort);
  const [planning, setPlanning] = useState<PlanningResponse | null>(initialData || null);
  const [stories, setStories] = useState<PlanningStory[]>(initialData?.stories || []);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [movingStoryId, setMovingStoryId] = useState<number | null>(null);
  const [savedViews, setSavedViews] = useState<SavedPlanningView[]>(initialData?.savedViews || []);
  const [selectedSavedViewId, setSelectedSavedViewId] = useState("");
  const [savedViewName, setSavedViewName] = useState("");
  const [isSavingView, setIsSavingView] = useState(false);
  const loadGeneration = useRef(0);

  const media = useOptionalResource<MediaDeskResponse>(fetchers.getMediaDesk, "Media Desk");
  const coverage = useOptionalResource<CoverageResponse>(fetchers.getCoverage, "Coverage");
  const feedback = useOptionalResource<FeedbackResponse>(fetchers.getFeedback, "Feedback");
  const performance = useOptionalResource<PerformanceResponse>(fetchers.getPerformance, "Performance");
  const contentHealth = useOptionalResource<ContentHealthResponse>(fetchers.getContentHealth, "Content Health");

  const loadPlanning = useCallback(async (nextFilters: PlanningFilters) => {
    const generation = ++loadGeneration.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const next = await fetchers.getPlanning(nextFilters);
      if (generation !== loadGeneration.current) return;
      setPlanning(next);
      setStories(next.stories);
      if (next.savedViews) setSavedViews(next.savedViews);
    } catch (error: unknown) {
      if (generation === loadGeneration.current) setLoadError(error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : __("Planning data is unavailable right now.", "weekly-wildcat-headless"));
    } finally {
      if (generation === loadGeneration.current) setIsLoading(false);
    }
  }, [fetchers]);

  useEffect(() => {
    const timer = setTimeout(() => void loadPlanning(filters), 120);
    return () => clearTimeout(timer);
  }, [filters, loadPlanning]);

  useEffect(() => {
    if (!fetchers.getSavedViews) return undefined;
    let cancelled = false;
    fetchers.getSavedViews()
      .then((next) => {
        if (!cancelled) setSavedViews(next);
      })
      .catch(() => {
        // Saved views are optional. The story collection remains usable.
      });
    return () => {
      cancelled = true;
    };
  }, [fetchers]);

  useEffect(() => {
    if (view === "media") void media.load();
    if (view === "coverage") void coverage.load();
    if (view === "feedback") void feedback.load();
    if (view === "performance") void performance.load();
    if (view === "content-health") void contentHealth.load();
  }, [contentHealth.load, coverage.load, feedback.load, media.load, performance.load, view]);

  const statuses = planning?.workflowStatuses?.length ? planning.workflowStatuses : DEFAULT_WORKFLOW_STATUSES;
  const resolvedUserId = currentUserId ?? planning?.currentUser?.id ?? null;
  const visibleSavedViews = resolvedUserId === null ? [] : filterSavedViewsForUser(savedViews, resolvedUserId);
  const visibleStories = useMemo(
    () => sortPlanningStories(filterPlanningStories(stories, filters, resolvedUserId ?? undefined), sort),
    [filters, resolvedUserId, sort, stories]
  );
  const writers = useMemo(() => uniquePeople(stories, "writer"), [stories]);
  const editors = useMemo(() => uniquePeople(stories, "editor"), [stories]);

  const openStoryById = useCallback((storyId: number) => {
    const story = stories.find((candidate) => candidate.id === storyId);
    if (story) onOpenStory?.(story);
  }, [onOpenStory, stories]);

  const changeView = useCallback((nextView: PlanningView) => {
    setView(nextView);
    if (nextView === "board" || nextView === "list" || nextView === "calendar") {
      const storage = typeof window !== "undefined" ? window.localStorage : null;
      writeStoriesViewPreference(nextView, storage);
    }
  }, []);

  const updateFilter = useCallback(<K extends keyof PlanningFilters>(key: K, value: PlanningFilters[K]) => {
    setFilters((current) => normalizePlanningFilters({ ...current, [key]: value }));
    setNotice(null);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ ...EMPTY_PLANNING_FILTERS });
    setSelectedSavedViewId("");
    setSavedViewName("");
  }, []);

  const handleSortChange = useCallback((key: PlanningSortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }, []);

  const handleMoveStory = useCallback(async (story: PlanningStory, targetStatus: string) => {
    const result = applyPlanningMove(story, targetStatus, statuses);
    if (!result.moved) {
      setActionError(result.error || __("That story cannot be moved.", "weekly-wildcat-headless"));
      return;
    }
    if (!fetchers.moveStory) {
      setActionError(__("Workflow moves are not available in this install.", "weekly-wildcat-headless"));
      return;
    }

    const previous = stories;
    setMovingStoryId(story.id);
    setActionError(null);
    setNotice(null);
    setStories((current) => current.map((candidate) => candidate.id === story.id ? result.story : candidate));
    setPlanning((current) => current ? { ...current, stories: current.stories.map((candidate) => candidate.id === story.id ? result.story : candidate) } : current);
    try {
      await fetchers.moveStory(story.id, targetStatus);
      setNotice(__("Workflow stage updated.", "weekly-wildcat-headless"));
    } catch (error: unknown) {
      setStories(previous);
      setPlanning((current) => current ? { ...current, stories: previous } : current);
      setActionError(error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : __("The workflow move could not be saved. The previous stage was restored.", "weekly-wildcat-headless"));
    } finally {
      setMovingStoryId(null);
    }
  }, [fetchers, statuses, stories]);

  const selectSavedView = (id: string) => {
    setSelectedSavedViewId(id);
    const selected = visibleSavedViews.find((savedView) => savedView.id === id);
    if (!selected) return;
    setSavedViewName(selected.name);
    setFilters(normalizePlanningFilters(selected.filters));
    setSort(selected.sort);
    setNotice(__("Saved view loaded.", "weekly-wildcat-headless"));
  };

  const saveView = async () => {
    if (!fetchers.saveSavedView) {
      setActionError(__("Saved views are not available in this install.", "weekly-wildcat-headless"));
      return;
    }
    const name = savedViewName.trim();
    if (!name) {
      setActionError(__("Give this saved view a name first.", "weekly-wildcat-headless"));
      return;
    }
    setIsSavingView(true);
    setActionError(null);
    try {
      const saved = await fetchers.saveSavedView({
        id: selectedSavedViewId || undefined,
        name,
        filters,
        sort
      });
      setSavedViews((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedSavedViewId(saved.id);
      setSavedViewName(saved.name);
      setNotice(__("Saved view updated.", "weekly-wildcat-headless"));
    } catch (error: unknown) {
      setActionError(error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : __("The saved view could not be saved.", "weekly-wildcat-headless"));
    } finally {
      setIsSavingView(false);
    }
  };

  const deleteView = async () => {
    const selected = visibleSavedViews.find((savedView) => savedView.id === selectedSavedViewId);
    if (!selected || !fetchers.deleteSavedView) return;
    if (typeof window !== "undefined" && !window.confirm(__("Delete this saved view?", "weekly-wildcat-headless"))) return;
    setIsSavingView(true);
    try {
      await fetchers.deleteSavedView(selected.id);
      setSavedViews((current) => current.filter((item) => item.id !== selected.id));
      setSelectedSavedViewId("");
      setSavedViewName("");
      setNotice(__("Saved view deleted.", "weekly-wildcat-headless"));
    } catch (error: unknown) {
      setActionError(error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : __("The saved view could not be deleted.", "weekly-wildcat-headless"));
    } finally {
      setIsSavingView(false);
    }
  };

  const renderFilters = () => {
    if (!viewIsStories(view)) return null;
    return (
      <section className="byline-planning-filters" aria-labelledby="byline-planning-filters-heading">
        <h2 id="byline-planning-filters-heading" className="byline-planning-sr-only">{__("Filter stories", "weekly-wildcat-headless")}</h2>
        <div className="byline-planning-filter-grid">
          <SearchControl
            label={__("Search stories", "weekly-wildcat-headless")}
            value={filters.query}
            onChange={(value: string) => updateFilter("query", value)}
            placeholder={__("Search headline, writer, editor, or coverage", "weekly-wildcat-headless")}
          />
          <SelectControl __nextHasNoMarginBottom label={__("Workflow", "weekly-wildcat-headless")} value={filters.workflow} options={statusOptions(statuses)} onChange={(value: string) => updateFilter("workflow", value)} />
          <SelectControl __nextHasNoMarginBottom label={__("Writer", "weekly-wildcat-headless")} value={filters.writerId === null ? "" : String(filters.writerId)} options={[{ label: __("All writers", "weekly-wildcat-headless"), value: "" }, ...writers.map((person) => ({ label: person.name, value: String(person.id) }))]} onChange={(value: string) => updateFilter("writerId", value ? Number(value) : null)} />
          <SelectControl __nextHasNoMarginBottom label={__("Editor", "weekly-wildcat-headless")} value={filters.editorId === null ? "" : String(filters.editorId)} options={[{ label: __("All editors", "weekly-wildcat-headless"), value: "" }, ...editors.map((person) => ({ label: person.name, value: String(person.id) }))]} onChange={(value: string) => updateFilter("editorId", value ? Number(value) : null)} />
          <SelectControl __nextHasNoMarginBottom label={__("WordPress state", "weekly-wildcat-headless")} value={filters.wordpressState} options={WORDPRESS_STATE_OPTIONS} onChange={(value: string) => updateFilter("wordpressState", value)} />
          <SelectControl __nextHasNoMarginBottom label={__("Visual status", "weekly-wildcat-headless")} value={filters.visualStatus} options={VISUAL_STATUS_OPTIONS} onChange={(value: string) => updateFilter("visualStatus", value)} />
        </div>
        <div className="byline-planning-date-filter-grid">
          <TextControl __nextHasNoMarginBottom label={__("Deadline from", "weekly-wildcat-headless")} type="date" value={filters.deadlineFrom} onChange={(value: string) => updateFilter("deadlineFrom", value)} />
          <TextControl __nextHasNoMarginBottom label={__("Deadline to", "weekly-wildcat-headless")} type="date" value={filters.deadlineTo} onChange={(value: string) => updateFilter("deadlineTo", value)} />
          <TextControl __nextHasNoMarginBottom label={__("Planned publication from", "weekly-wildcat-headless")} type="date" value={filters.plannedFrom} onChange={(value: string) => updateFilter("plannedFrom", value)} />
          <TextControl __nextHasNoMarginBottom label={__("Planned publication to", "weekly-wildcat-headless")} type="date" value={filters.plannedTo} onChange={(value: string) => updateFilter("plannedTo", value)} />
        </div>
        <div className="byline-planning-toggle-row">
          <ToggleControl __nextHasNoMarginBottom label={__("Mine", "weekly-wildcat-headless")} checked={filters.mine} onChange={(value: boolean) => updateFilter("mine", value)} />
          <ToggleControl __nextHasNoMarginBottom label={__("Unassigned", "weekly-wildcat-headless")} checked={filters.unassigned} onChange={(value: boolean) => updateFilter("unassigned", value)} />
          <ToggleControl __nextHasNoMarginBottom label={__("Overdue", "weekly-wildcat-headless")} checked={filters.overdue} onChange={(value: boolean) => updateFilter("overdue", value)} />
          <ToggleControl __nextHasNoMarginBottom label={__("Needs review", "weekly-wildcat-headless")} checked={filters.needsReview} onChange={(value: boolean) => updateFilter("needsReview", value)} />
          <Button variant="tertiary" onClick={clearFilters} disabled={sameFilters(filters, EMPTY_PLANNING_FILTERS)}>{__("Clear filters", "weekly-wildcat-headless")}</Button>
        </div>
      </section>
    );
  };

  const renderStories = () => {
    if (isLoading && !planning) return <PlanningLoading label={__("Loading Planning stories…", "weekly-wildcat-headless")} />;
    if (loadError && !planning) return <PlanningEmpty label={__("Planning stories", "weekly-wildcat-headless")} instructions={loadError} />;
    if (view === "board") return <StoryBoard stories={visibleStories} statuses={statuses} canMoveStories={planning?.capabilities.canMoveStories ?? false} movingStoryId={movingStoryId} error={actionError} onMoveStory={(story, status) => void handleMoveStory(story, status)} onOpenStory={onOpenStory} />;
    if (view === "list") return <StoryList stories={visibleStories} statuses={statuses} sort={sort} canMoveStories={planning?.capabilities.canMoveStories ?? false} movingStoryId={movingStoryId} onSortChange={handleSortChange} onMoveStory={(story, status) => void handleMoveStory(story, status)} onOpenStory={onOpenStory} />;
    return <PlanningCalendar stories={visibleStories} onOpenStory={onOpenStory} />;
  };

  return (
    <div className="byline-planning-app">
      <header className="byline-planning-app-header">
        <div>
          <p className="byline-planning-eyebrow">{__("Newsroom workspace", "weekly-wildcat-headless")}</p>
          <h1>{__("Planning", "weekly-wildcat-headless")}</h1>
          <p>{__("Move from assignment to publication with one protected view of newsroom work.", "weekly-wildcat-headless")}</p>
        </div>
        <Button variant="secondary" onClick={() => void loadPlanning(filters)} disabled={isLoading}>{__("Refresh", "weekly-wildcat-headless")}</Button>
      </header>

      <nav className="byline-planning-view-tabs" aria-label={__("Planning views", "weekly-wildcat-headless")}>
        {(Object.keys(VIEW_LABELS) as PlanningView[]).map((item) => (
          <Button key={item} variant={view === item ? "primary" : "secondary"} aria-current={view === item ? "page" : undefined} onClick={() => changeView(item)}>
            {VIEW_LABELS[item]}
          </Button>
        ))}
      </nav>

      {viewIsStories(view) ? (
        <section className="byline-planning-saved-view-bar" aria-labelledby="byline-planning-saved-view-heading">
          <h2 id="byline-planning-saved-view-heading" className="byline-planning-sr-only">{__("Saved views", "weekly-wildcat-headless")}</h2>
          <SelectControl __nextHasNoMarginBottom label={__("Saved view", "weekly-wildcat-headless")} value={selectedSavedViewId} options={[{ label: __("Choose a saved view…", "weekly-wildcat-headless"), value: "" }, ...visibleSavedViews.map((savedView) => ({ label: savedView.name, value: savedView.id }))]} onChange={selectSavedView} />
          <TextControl __nextHasNoMarginBottom label={__("Saved view name", "weekly-wildcat-headless")} value={savedViewName} onChange={setSavedViewName} placeholder={__("e.g. Publishing this week", "weekly-wildcat-headless")} />
          <Button variant="secondary" onClick={() => void saveView()} disabled={isSavingView || !fetchers.saveSavedView}>{selectedSavedViewId ? __("Update view", "weekly-wildcat-headless") : __("Save view", "weekly-wildcat-headless")}</Button>
          {selectedSavedViewId && fetchers.deleteSavedView ? <Button variant="tertiary" isDestructive onClick={() => void deleteView()} disabled={isSavingView}>{__("Delete view", "weekly-wildcat-headless")}</Button> : null}
          {resolvedUserId === null ? <span className="byline-planning-help">{__("Pass the authenticated user ID to show personal saved views.", "weekly-wildcat-headless")}</span> : null}
        </section>
      ) : null}

      {actionError ? <PlanningNotice onRemove={() => setActionError(null)}>{actionError}</PlanningNotice> : null}
      {loadError && planning ? <PlanningNotice status="warning" onRemove={() => setLoadError(null)}>{loadError}</PlanningNotice> : null}
      {notice ? <PlanningNotice status="success" onRemove={() => setNotice(null)}>{notice}</PlanningNotice> : null}

      {renderFilters()}

      <main className="byline-planning-app-content">
        {viewIsStories(view) ? renderStories() : null}
        {view === "media" ? (media.isLoading && !media.resource.data ? <PlanningLoading label={__("Loading Media Desk…", "weekly-wildcat-headless")} /> : <MediaDesk resource={media.resource} onRetry={media.load} updateRequest={fetchers.updateMediaRequest ? async (id, changes) => { await fetchers.updateMediaRequest!(id, changes); await media.load(); } : undefined} onOpenStory={openStoryById} />) : null}
        {view === "coverage" ? (coverage.isLoading && !coverage.resource.data ? <PlanningLoading label={__("Loading Coverage…", "weekly-wildcat-headless")} /> : <Coverage resource={coverage.resource} stories={stories} onRetry={coverage.load} onOpenStory={onOpenStory} onCreateCoverage={fetchers.createCoverage ? async (input) => { const result = await fetchers.createCoverage!(input); await coverage.load(); return result; } : undefined} onAddStory={fetchers.addStoryToCoverage ? async (coverageId, storyId) => { const result = await fetchers.addStoryToCoverage!(coverageId, storyId); await coverage.load(); return result; } : undefined} onRemoveStory={fetchers.removeStoryFromCoverage ? async (coverageId, storyId) => { const result = await fetchers.removeStoryFromCoverage!(coverageId, storyId); await coverage.load(); return result; } : undefined} onCreateStory={fetchers.createCoverageStory ? async (coverageId, title) => { const result = await fetchers.createCoverageStory!(coverageId, title); await coverage.load(); return result; } : undefined} />) : null}
        {view === "feedback" ? (feedback.isLoading && !feedback.resource.data ? <PlanningLoading label={__("Loading Feedback…", "weekly-wildcat-headless")} /> : <Feedback resource={feedback.resource} onRetry={feedback.load} onUpdateStatus={fetchers.updateFeedback ? async (id, status) => { const result = await fetchers.updateFeedback!(id, status); await feedback.load(); return result; } : undefined} onCreateCorrection={fetchers.createCorrectionFromFeedback ? async (id, input) => { const result = await fetchers.createCorrectionFromFeedback!(id, input); await feedback.load(); return result; } : undefined} onOpenStory={openStoryById} />) : null}
        {view === "performance" ? (performance.isLoading && !performance.resource.data ? <PlanningLoading label={__("Loading Performance…", "weekly-wildcat-headless")} /> : <Performance resource={performance.resource} onRetry={performance.load} />) : null}
        {view === "content-health" ? (contentHealth.isLoading && !contentHealth.resource.data ? <PlanningLoading label={__("Loading Content Health…", "weekly-wildcat-headless")} /> : <ContentHealth resource={contentHealth.resource} onRetry={contentHealth.load} onRecheck={fetchers.recheckContentHealth ? async (issueId) => { const result = await fetchers.recheckContentHealth!(issueId); await contentHealth.load(); return result; } : undefined} />) : null}
      </main>

      <p className="byline-planning-app-status" role="status" aria-live="polite">
        {isLoading ? __("Refreshing protected planning data…", "weekly-wildcat-headless") : `${visibleStories.length} ${visibleStories.length === 1 ? __("story", "weekly-wildcat-headless") : __("stories", "weekly-wildcat-headless")} in this view.`}
      </p>
    </div>
  );
}

/** Parse a saved view payload for hosts that store a personal view in a URL/local state. */
export function parsePlanningSavedView(value: string, ownerId?: number): SavedPlanningView | null {
  return deserializeSavedPlanningView(value, ownerId);
}
