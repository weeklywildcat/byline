import { useMemo, useState } from "react";
import { AlarmClock, Bookmark, BookmarkCheck, CalendarClock, ChevronDown, ImageOff, LayoutList, Plus, Settings2, UserRound, UserX, type LucideIcon } from "lucide-react";
import { hasPicture, PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import { useNow } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton
} from "@byline/newsroom-ui/ui/sidebar";
import { activeStory } from "../home/newsroom-model";
import { WorkflowBadge } from "../story/story-parts";
import { boardWorkflowStatuses, filterPlanningStories, mergePeople, type PlanningFilters, type PlanningPerson, type PlanningStory, type PlanningWorkflowStatus } from "./planning-model";
import { activeStoryView, applyBuiltInView, applySavedView, builtInStoryView, storyViewCount, type ActiveStoryView, type BuiltInStoryViewId } from "./story-views";
import type { StoriesWorkspace, StoriesWorkspaceState } from "./stories-workspace";
import { useStoriesWorkspaceState } from "./stories-workspace-context";

/** The pane's views, in order. Published and On hold stay in the Workflow filter and the Stages group. */
export const STORIES_NAVIGATOR_VIEWS: readonly BuiltInStoryViewId[] = ["all", "mine", "overdue", "due-week", "unassigned", "review", "art-needed"];

/** Views listed even when they hold nothing: where the reader starts, and their own work. */
const ALWAYS_SHOWN = new Set<BuiltInStoryViewId>(["all", "mine"]);

const VIEW_ICONS: Record<string, LucideIcon> = { all: LayoutList, mine: UserRound, overdue: AlarmClock, "due-week": CalendarClock, unassigned: UserX, review: BookmarkCheck, "art-needed": ImageOff };

/** Writers listed before "Show all". */
export const STORIES_NAVIGATOR_WRITER_LIMIT = 8;

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Active stories (unpublished, not dropped) matching some filters: what every count in the pane means. */
function activeCount(stories: readonly PlanningStory[], filters: Partial<PlanningFilters>, userId: number | undefined, now: Date): number {
  return filterPlanningStories([...stories], filters, userId, now).filter(activeStory).length;
}

/** Stages in board order: the main pipeline, then the sidelined ones. Published is derived, never a stage here. */
export function navigatorStages(statuses: PlanningWorkflowStatus[]): PlanningWorkflowStatus[] {
  return [...boardWorkflowStatuses(statuses), ...statuses.filter((status) => status.group === "sidelined")];
}

/** The writers with active stories, most stories first, each with its count. */
export function navigatorWriters(stories: readonly PlanningStory[]): Array<{ person: PlanningPerson; count: number }> {
  const active = stories.filter(activeStory);
  return mergePeople([], active, (story) => [story.writer])
    .map((person) => ({ person, count: active.filter((story) => story.writer?.id === person.id).length }))
    .sort((left, right) => right.count - left.count || left.person.name.localeCompare(right.person.name));
}

/** How many stories the current view holds, for the pane's header. */
export function StoriesNavigatorCount({ workspace, className }: { workspace: StoriesWorkspace; className?: string }) {
  const state = useStoriesWorkspaceState(workspace);
  const now = useNow();
  if (!state.data) return null;
  const count = activeCount(state.data.stories, state.filters, state.data.currentUserId ?? undefined, now);
  return <span className={cn("text-xs font-medium text-muted-foreground tabular-nums", className)} aria-label={`${plural(count, "story", "stories")} in this view`}>{plural(count, "story", "stories")}</span>;
}

/**
 * Stories' navigator: which stories the reader is looking at, as one-click
 * filters with live counts over the stories the screen loaded. One component
 * for the Payload shell's Stories workspace pane and the narrow screens'
 * sheet, reading and writing the same Stories workspace as the screen.
 *
 * - **Views**: the built-in views worth a destination, then the reader's
 *   saved views, and Save / Manage (the screen's own dialogs).
 * - **Stages**: every stage in board order, one at a time as the Workflow filter.
 * - **Writers**: the writers with active stories, then Unassigned.
 *
 * `onChosen` lets a sheet close after a choice.
 */
export function StoriesNavigator({ workspace, onChosen }: { workspace: StoriesWorkspace; onChosen?: () => void }) {
  const state = useStoriesWorkspaceState(workspace);
  const now = useNow();
  const choose = (action: () => void) => () => { action(); onChosen?.(); };
  if (!state.data) return <StoriesNavigatorSkeleton />;
  return <nav aria-label="Stories views" className="flex flex-col">
    <ViewsGroup workspace={workspace} state={state} now={now} choose={choose} />
    <StagesGroup workspace={workspace} state={state} choose={choose} />
    <WritersGroup workspace={workspace} state={state} now={now} choose={choose} />
  </nav>;
}

type GroupProps = { workspace: StoriesWorkspace; state: StoriesWorkspaceState; choose: (action: () => void) => () => void };

function ViewsGroup({ workspace, state, now, choose }: GroupProps & { now: Date }) {
  const data = state.data!;
  const userId = data.currentUserId ?? undefined;
  const context = { now, timezone: data.timezone };
  const active: ActiveStoryView = activeStoryView(state.filters, state.sort, data.savedViews, state.savedViewId, context);
  const builtIns = STORIES_NAVIGATOR_VIEWS.map((id) => builtInStoryView(id)!).map((view) => ({ view, count: storyViewCount(data.stories, view, userId, now, data.timezone) }));
  return <SidebarGroup>
    <SidebarGroupLabel>Views</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu aria-label="Views">
        {builtIns.map(({ view, count }) => {
          const current = active.kind === "built-in" && active.view.id === view.id;
          // Nothing reads "0" just to fill space.
          if (!count && !current && !ALWAYS_SHOWN.has(view.id)) return null;
          const Icon = VIEW_ICONS[view.id] ?? Bookmark;
          return <SidebarMenuItem key={view.id}>
            <SidebarMenuButton type="button" isActive={current} aria-current={current ? "true" : undefined} onClick={choose(() => workspace.applyView(applyBuiltInView(view, context)))} data-stories-view={view.id}>
              <Icon aria-hidden="true" /><span>{view.label}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge className={cn("tabular-nums", view.id === "overdue" && count > 0 ? "text-warning" : "text-muted-foreground")} aria-label={`${plural(count, `${view.id === "overdue" ? "overdue " : ""}story`, `${view.id === "overdue" ? "overdue " : ""}stories`)}`} data-count={count}>{count}</SidebarMenuBadge>
          </SidebarMenuItem>;
        })}
        {data.savedViews.map((view) => {
          const current = active.kind === "saved" && active.view.id === view.id;
          const modified = current && active.kind === "saved" && active.modified;
          const count = activeCount(data.stories, view.filters, userId, now);
          return <SidebarMenuItem key={view.id}>
            <SidebarMenuButton type="button" isActive={current} aria-current={current ? "true" : undefined} onClick={choose(() => workspace.applyView(applySavedView(view)))} data-stories-saved-view={view.id}>
              <Bookmark aria-hidden="true" /><span>{view.name}{modified ? <span className="text-muted-foreground"> (modified)</span> : null}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge className="text-muted-foreground tabular-nums" aria-label={plural(count, "story", "stories")} data-count={count}>{count}</SidebarMenuBadge>
          </SidebarMenuItem>;
        })}
        {data.canSaveViews ? <SidebarMenuItem>
          <SidebarMenuButton type="button" size="sm" className="text-muted-foreground" disabled={data.savedViewsFull} onClick={choose(() => workspace.openSaveView())}><Plus aria-hidden="true" /><span>Save current view…</span></SidebarMenuButton>
        </SidebarMenuItem> : null}
        {data.savedViews.length ? <SidebarMenuItem>
          <SidebarMenuButton type="button" size="sm" className="text-muted-foreground" onClick={choose(() => workspace.openManageViews())}><Settings2 aria-hidden="true" /><span>Manage views…</span></SidebarMenuButton>
        </SidebarMenuItem> : null}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>;
}

function StagesGroup({ workspace, state, choose }: GroupProps) {
  const data = state.data!;
  const stages = useMemo(() => navigatorStages(data.workflowStatuses).map((status) => ({ status, count: data.stories.filter((story) => story.workflow.id === status.id).length })), [data.stories, data.workflowStatuses]);
  return <SidebarGroup>
    <SidebarGroupLabel>Stages</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu aria-label="Stages">
        {/* Empty stages stay listed: the pipeline's order means something. */}
        {stages.map(({ status, count }) => {
          const current = state.filters.workflow === status.id;
          return <SidebarMenuItem key={status.id}>
            <SidebarMenuButton type="button" isActive={current} aria-current={current ? "true" : undefined} onClick={choose(() => workspace.toggleWorkflow(status.id))} data-stories-stage={status.id}>
              <WorkflowBadge workflow={status} />
            </SidebarMenuButton>
            <SidebarMenuBadge className={cn("tabular-nums", count ? "text-muted-foreground" : "text-muted-foreground/60")} aria-label={`${plural(count, "story", "stories")} in ${status.label}`} data-count={count}>{count}</SidebarMenuBadge>
          </SidebarMenuItem>;
        })}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>;
}

function WritersGroup({ workspace, state, now, choose }: GroupProps & { now: Date }) {
  const data = state.data!;
  const [showAll, setShowAll] = useState(false);
  const writers = useMemo(() => navigatorWriters(data.stories), [data.stories]);
  const unassigned = storyViewCount(data.stories, builtInStoryView("unassigned")!, data.currentUserId ?? undefined, now, data.timezone);
  const limited = !showAll && writers.length > STORIES_NAVIGATOR_WRITER_LIMIT;
  // The chosen writer stays in view even past the limit.
  const shown = limited ? writers.filter((writer, index) => index < STORIES_NAVIGATOR_WRITER_LIMIT || writer.person.id === state.filters.writerId) : writers;
  return <SidebarGroup>
    <SidebarGroupLabel>Writers</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu aria-label="Writers">
        {shown.map(({ person, count }) => {
          const current = state.filters.writerId === person.id;
          return <SidebarMenuItem key={person.id}>
            <SidebarMenuButton type="button" isActive={current} aria-current={current ? "true" : undefined} onClick={choose(() => workspace.toggleWriter(person.id))} data-stories-writer={person.id}>
              {/* Only a real picture earns an avatar; nobody is shown as initials. */}
              {hasPicture(person) ? <PeopleAvatars people={[person]} size="sm" tooltips={false} className="size-5" /> : <UserRound aria-hidden="true" />}
              <span>{person.name}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge className="text-muted-foreground tabular-nums" aria-label={`${plural(count, "story", "stories")} by ${person.name}`} data-count={count}>{count}</SidebarMenuBadge>
          </SidebarMenuItem>;
        })}
        {writers.length > STORIES_NAVIGATOR_WRITER_LIMIT ? <SidebarMenuItem>
          <SidebarMenuButton type="button" size="sm" className="text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll((open) => !open)}>
            <ChevronDown aria-hidden="true" className={cn("transition-transform", showAll && "rotate-180")} /><span>{showAll ? "Show fewer" : `Show all ${writers.length}`}</span>
          </SidebarMenuButton>
        </SidebarMenuItem> : null}
        <SidebarMenuItem>
          <SidebarMenuButton type="button" isActive={state.filters.unassigned} aria-current={state.filters.unassigned ? "true" : undefined} onClick={choose(() => workspace.toggleWriter("unassigned"))} data-stories-writer="unassigned">
            <UserX aria-hidden="true" /><span>Unassigned</span>
          </SidebarMenuButton>
          <SidebarMenuBadge className="text-muted-foreground tabular-nums" aria-label={`${plural(unassigned, "unassigned story", "unassigned stories")}`} data-count={unassigned}>{unassigned}</SidebarMenuBadge>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>;
}

function StoriesNavigatorSkeleton() {
  return <div role="status" aria-label="Loading story views" className="flex flex-col">
    {["Views", "Stages", "Writers"].map((label) => <SidebarGroup key={label}>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>{Array.from({ length: 4 }, (_, index) => <SidebarMenuItem key={index}><SidebarMenuSkeleton showIcon /></SidebarMenuItem>)}</SidebarMenu>
    </SidebarGroup>)}
  </div>;
}
