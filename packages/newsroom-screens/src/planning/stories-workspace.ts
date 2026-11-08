/**
 * Stories' one state owner: which stories the reader is looking at (the
 * filters, the sort and the selected saved view), and the latest stories the
 * screen loaded, so other presentations can count without fetching again.
 *
 * Every presentation reads and writes this one store: the Stories screen's
 * toolbar, Board and List, a host's contextual sidebar pane and a
 * narrow-screen sheet. None keeps its own copy. A host that has no pane
 * (WordPress) lets StoriesPage create one for itself, so there is one code
 * path either way.
 *
 * The saved-view dialogs stay with the screen (StoryViews' controller); the
 * pane asks for them through `openSaveView` and `openManageViews`.
 */
import { normalizePlanningFilters, DEFAULT_PLANNING_SORT, EMPTY_PLANNING_FILTERS, type PlanningFilters, type PlanningSort, type PlanningStory, type PlanningWorkflowStatus, type SavedPlanningView } from "./planning-model";
import type { AppliedView } from "./story-views";

/** What the screen loaded, for counting: every story the views count over (never just the filtered ones). */
export type StoriesWorkspaceData = {
  stories: PlanningStory[];
  workflowStatuses: PlanningWorkflowStatus[];
  /** The newsroom timezone, for relative views (Due this week). */
  timezone: string;
  currentUserId: number | null;
  savedViews: SavedPlanningView[];
  canSaveViews: boolean;
  /** No more views can be saved until one is deleted. */
  savedViewsFull: boolean;
};

export type StoriesWorkspaceState = {
  filters: PlanningFilters;
  sort: PlanningSort;
  savedViewId: string | null;
  /** Null until the screen has loaded stories once. */
  data: StoriesWorkspaceData | null;
};

/** The screen's saved-view dialogs, which the pane opens but never re-implements. */
export type StoriesViewCommands = { openSave: () => void; openManage: () => void };

/** A writer, or the stories nobody is assigned to. */
export type StoriesWriterChoice = number | "unassigned";

/** Whether an address named any filter at all (`/stories?view=list` names none). */
export function hasPlanningFilters(filters: Partial<PlanningFilters> | undefined): boolean {
  if (!filters) return false;
  const applied = normalizePlanningFilters(filters);
  return (Object.keys(EMPTY_PLANNING_FILTERS) as Array<keyof PlanningFilters>).some((key) => applied[key] !== EMPTY_PLANNING_FILTERS[key]) || Boolean(applied.collectionId);
}

const sameData = (left: StoriesWorkspaceData | null, right: StoriesWorkspaceData) => Boolean(left) && (Object.keys(right) as Array<keyof StoriesWorkspaceData>).every((key) => left![key] === right[key]);

export function createStoriesWorkspace(initial: { filters?: Partial<PlanningFilters>; sort?: PlanningSort } = {}) {
  let state: StoriesWorkspaceState = {
    filters: normalizePlanningFilters(initial.filters),
    sort: initial.sort ?? { ...DEFAULT_PLANNING_SORT },
    savedViewId: null,
    data: null
  };
  let commands: StoriesViewCommands | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<StoriesWorkspaceState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const setFilters = (filters: Partial<PlanningFilters>) => set({ filters: normalizePlanningFilters(filters) });

  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getState: () => state,

    /** A built-in or saved view (or the current filters kept after its saved view was deleted). */
    applyView: (applied: AppliedView) => set({ filters: normalizePlanningFilters(applied.filters), sort: applied.sort, savedViewId: applied.savedViewId }),
    setFilters,
    setSort: (sort: PlanningSort) => set({ sort }),
    /** One stage as the Workflow filter; choosing the current stage clears it (one stage at a time). */
    toggleWorkflow: (statusId: string) => setFilters({ ...state.filters, workflow: state.filters.workflow === statusId ? "" : statusId }),
    /** One writer as the Writer filter, or Unassigned on and off; choosing the current one clears it. */
    toggleWriter: (writer: StoriesWriterChoice) => setFilters(writer === "unassigned"
      ? { ...state.filters, unassigned: !state.filters.unassigned }
      : { ...state.filters, writerId: state.filters.writerId === writer ? null : writer }),
    /**
     * The filters an address names (a sidebar shortcut, a shared link), as a
     * fresh view. An address that names none keeps what the reader had.
     * Returns whether anything was applied.
     */
    applyInitialFilters: (filters: Partial<PlanningFilters> | undefined) => {
      if (!hasPlanningFilters(filters)) return false;
      set({ filters: normalizePlanningFilters(filters), sort: { ...DEFAULT_PLANNING_SORT }, savedViewId: null });
      return true;
    },
    /** What the screen loaded. Subscribers hear only of a real change, so publishing after every render is safe. */
    publishData: (data: StoriesWorkspaceData) => { if (!sameData(state.data, data)) set({ data }); },

    /** The screen registers its dialogs while it is mounted (null when it leaves). Never a state change. */
    setViewCommands: (next: StoriesViewCommands | null) => { commands = next; },
    openSaveView: () => commands?.openSave(),
    openManageViews: () => commands?.openManage()
  };
}

export type StoriesWorkspace = ReturnType<typeof createStoriesWorkspace>;
