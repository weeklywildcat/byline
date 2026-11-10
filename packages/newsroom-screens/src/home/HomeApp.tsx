import { useCollectionLinks } from "../collections/collection-links";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Globe, KanbanSquare, ListTodo, Newspaper, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type EditorialTask } from "../editorial/editorial-model";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { ItemGroup } from "@byline/newsroom-ui/ui/item";
import { Kbd, KbdGroup } from "@byline/newsroom-ui/ui/kbd";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import type { HomeFetchers } from "./home-api";
import { createAdminQueryClient } from "../story/story-query";
import { homeKey, workspaceKey, replaceHomeTask, replaceWorkspaceTask } from "./home-query";
import { HOME_WORK_GROUPS, homeAgenda, homeScope, isoWeek, myWork, shortDateTime, siteDay, weekAgenda, type AgendaEvent, type HomeBootstrap, type HomeScope, type HomeWorkItem } from "./newsroom-model";
import { budgetStories, deskStages, normalizeHomePreferences, scopedStories, type BudgetTab, type HomePreferenceStorage } from "./desk-model";
import { HomeCommands, type HomeActionUrls } from "./HomeCommands";
import { HomeCreate } from "./HomeCreate";
import { StoryPeek } from "../story/StoryPeek";
import { StoryHoverProvider } from "../story/StoryHoverCard";
import type { StoryWorkspace } from "../workspace/workspace-types";
import { AttentionRow, MediaAssignmentRow, ReviewRow } from "./components/rows";
import { BudgetTable, cardLink, DeskStages, GroupHeading, HomeCard, Quiet, SiteRows, siteIcons, WeekStrip, type SiteRow } from "./components/sections";
import { RowSkeletons, TaskRow } from "../story/rows";
import { useUpdateTask } from "../story/use-update-task";
import { TaskEditDialog } from "../story/TaskEditDialog";
import { storiesHref } from "../planning/planning-api";
import type { PlanningFilters } from "../planning/planning-model";

/**
 * A host application shell that already owns creation, search, toasts and page
 * chrome (the Payload newsroom). With one, Home uses the shell's query cache,
 * opens the shell's Create dialogs and leaves ⌘K to the shell. Without one
 * (WordPress), Home brings its own.
 */
export type HomeShell = {
  queryClient: QueryClient;
  openCreate: (kind: "story" | "task", options?: { storyId?: number | null }) => void;
  /** While Home is mounted, stories picked in the shell's search open in Home's Story Peek. */
  setStoryOpener?: (open: ((storyId: number) => void) | null) => void;
};

const SCOPE_ITEM_CLASS = "aria-pressed:bg-primary aria-pressed:font-semibold aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground";

/** `preferences`: where the host remembers the reader's Mine | Newsroom choice (Payload Preferences, or this browser). */
export type HomeAppProps = { fetchers: HomeFetchers; currentUserId?: number | null; actionUrls?: HomeActionUrls; shell?: HomeShell; preferences?: HomePreferenceStorage };

const homeQueryClient = createAdminQueryClient();

export function HomeApp(props: HomeAppProps) {
  return <QueryClientProvider client={props.shell?.queryClient ?? homeQueryClient}><AdminRoot toaster={!props.shell}><HomeWorkspace {...props} /></AdminRoot></QueryClientProvider>;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
// ItemGroup's size variants otherwise reintroduce gaps between separated rows.
const homeGroupClassName = "gap-0 has-data-[size=sm]:gap-0 has-data-[size=xs]:gap-0";

const HOME_WORK_PREVIEW_LIMIT = 10;
const BUDGET_LIMIT = 8;
const BUDGET_TABS: Array<{ id: BudgetTab; label: string; empty: string }> = [
  { id: "week", label: "This week", empty: "Nothing is planned or scheduled to publish this week." },
  { id: "mine", label: "My stories", empty: "No active stories assigned to you." },
  { id: "unscheduled", label: "Unscheduled", empty: "Every active story has a planned publication." }
];

const shortDay = (day: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
/** "Nov 8 – 14", or "Nov 29 – Dec 5" across months. */
function weekRange(start: string, end: string): string {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${shortDay(start)} – ${sameMonth ? Number(end.slice(8)) : shortDay(end)}`;
}

function HomeWorkspace({ fetchers, actionUrls, shell, preferences }: HomeAppProps) {
  const collectionLinks = useCollectionLinks();
  const client = useQueryClient();
  const home = useQuery({ queryKey: homeKey, queryFn: () => fetchers.getHome!(), enabled: Boolean(fetchers.getHome) });
  const health = useQuery({ queryKey: ["byline", "home-health"], queryFn: () => fetchers.getHealth!(), enabled: Boolean(fetchers.getHealth) });
  const deployment = useQuery({ queryKey: ["byline", "home-deployment"], queryFn: () => fetchers.getDeployment!(), enabled: Boolean(fetchers.getDeployment) });
  const contentHealth = useQuery({ queryKey: ["byline", "home-content-health"], queryFn: () => fetchers.getContentHealth!(), enabled: Boolean(fetchers.getContentHealth && actionUrls?.contentHealth) });
  const data = home.data;
  const timezone = data?.timezone || "UTC";
  const [now, setNow] = useState(new Date());
  const [commandOpen, setCommandOpen] = useState(false);
  const [peekId, setPeekId] = useState<number | null>(null);
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [createKind, setCreateKind] = useState<"story" | "task" | null>(null);
  const [taskStoryId, setTaskStoryId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<EditorialTask | null>(null);
  const [allWorkOpen, setAllWorkOpen] = useState(false);
  const workRef = useRef<HTMLElement | null>(null);
  const [completionError, setCompletionError] = useState("");
  const [completedLabel, setCompletedLabel] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [budgetTab, setBudgetTab] = useState<BudgetTab>("week");
  const [budgetExpanded, setBudgetExpanded] = useState(false);
  const [storedScope, setStoredScope] = useState<HomeScope | null>(null);

  // The remembered Mine | Newsroom choice. A failed read leaves the default (Newsroom for editors).
  useEffect(() => {
    if (!preferences?.load) return undefined;
    let live = true;
    Promise.resolve().then(() => preferences.load!()).then((stored) => { if (live) setStoredScope((current) => current ?? normalizeHomePreferences(stored).scope); }).catch(() => undefined);
    return () => { live = false; };
  }, [preferences]);
  const changeScope = (next: HomeScope) => {
    setStoredScope(next);
    Promise.resolve().then(() => preferences?.save?.({ scope: next })).catch(() => undefined);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    if (shell) return () => clearInterval(timer);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        if (!createKind) setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", shortcut, true);
    return () => { clearInterval(timer); window.removeEventListener("keydown", shortcut, true); };
  }, [createKind, shell]);

  function openStory(id: number) {
    if (!peekId) setOrigin(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPeekId(id);
    setRecentIds((ids) => [id, ...ids.filter((item) => item !== id)].slice(0, 8));
  }
  // A new story opens its full Story Workspace; Peek stays the fast way to inspect existing rows.
  function openCreatedStory(created: StoryWorkspace) {
    const url = created.workspaceUrl || actionUrls?.workspace?.(created.story.id);
    if (url) window.location.assign(url); else openStory(created.story.id);
  }
  const storyOpener = useRef(openStory);
  useEffect(() => { storyOpener.current = openStory; });
  useEffect(() => {
    if (!shell?.setStoryOpener) return undefined;
    shell.setStoryOpener((id) => storyOpener.current(id));
    return () => shell.setStoryOpener?.(null);
  }, [shell]);
  const updateTask = useUpdateTask(fetchers);
  const complete = useMutation({
    mutationFn: (task: EditorialTask) => fetchers.editorial!.updateTask(task.id, { state: "completed" }),
    onMutate: async (task) => {
      setCompletionError("");
      await client.cancelQueries({ queryKey: homeKey });
      if (task.storyId) await client.cancelQueries({ queryKey: workspaceKey(task.storyId) });
      const focused = document.activeElement as HTMLElement | null;
      const container = focused?.closest("section");
      const rows = container ? Array.from(container.querySelectorAll<HTMLElement>("[data-slot=checkbox]")) : [];
      const index = focused ? rows.indexOf(focused) : -1;
      const next = rows[index + 1] || rows[index - 1];
      const updated = setTaskCompletionState(task, "completed");
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, updated));
      if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, updated));
      if (index >= 0) requestAnimationFrame(() => { if (next?.isConnected) next.focus(); else (container?.querySelector<HTMLElement>("[data-peek-add-task]") || container?.closest('[data-slot="card"]')?.querySelector<HTMLElement>("[data-home-card-footer] button") || workRef.current)?.focus(); });
    },
    onSuccess: (_updated, task) => {
      const message = `Completed ${task.title}.`;
      setCompletedLabel(message);
      toast.success(message, {
        action: {
          label: "Undo",
          onClick: () => {
            void fetchers.editorial!.updateTask(task.id, { state: task.state }).then((restored) => {
              client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, restored));
              if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, restored));
              setCompletedLabel(`Restored ${task.title}.`);
              void client.invalidateQueries({ queryKey: homeKey });
              if (task.storyId) void client.invalidateQueries({ queryKey: workspaceKey(task.storyId) });
            }).catch((error) => toast.error(describeEditorialError(error, "The task change couldn’t be undone.")));
          }
        }
      });
    },
    onError: (error, task) => {
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, task));
      if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, task));
      const message = describeEditorialError(error, "Task couldn't be completed. Try again.");
      setCompletionError(message);
      toast.error(message);
    },
    onSettled: (_data, _error, task) => { void client.invalidateQueries({ queryKey: homeKey }); if (task.storyId) void client.invalidateQueries({ queryKey: workspaceKey(task.storyId) }); }
  });
  const canReview = Boolean(data?.capabilities.review);
  const scope = homeScope(storedScope, canReview);
  const work = data ? myWork(data, now, collectionLinks.href) : [];
  const agenda = data ? homeAgenda(data, now, collectionLinks.href, scope) : [];
  const week = data ? weekAgenda(data, now, scope, { offset: weekOffset, collectionHref: collectionLinks.href }) : null;
  const desk = data ? deskStages(scopedStories(data, scope), timezone, now) : [];
  const budget = data ? budgetStories(data, scope, now) : null;
  const today = siteDay(now, timezone);
  const newTask = (storyId: number | null = null) => { if (shell) { shell.openCreate("task", { storyId }); return; } setTaskStoryId(storyId); setCreateKind("task"); };
  const newStory = () => { if (shell) shell.openCreate("story"); else setCreateKind("story"); };
  const storyTitle = (id?: number | null) => data?.stories.find((s) => s.id === id)?.title;
  /** Stories narrowed to `filters` (and the reader's own, in Mine). */
  const storiesLink = (filters: Partial<PlanningFilters> = {}, view?: "board" | "list") => {
    if (!actionUrls?.planning) return undefined;
    const href = storiesHref(actionUrls.planning, { ...(scope === "mine" ? { mine: true } : {}), ...filters });
    if (!view) return href;
    const url = new URL(href, window.location.href);
    url.searchParams.set("view", view);
    return `${url.pathname}${url.search}`;
  };
  const openEvent = (event: AgendaEvent) => event.href ? () => window.location.assign(event.href!) : event.storyId ? () => openStory(event.storyId!) : undefined;
  const renderTask = (task: EditorialTask) => <TaskRow key={task.id} dense task={task} storyTitle={storyTitle(task.storyId)} timezone={timezone} now={now} people={data?.people || []} canAssign={canReview} pending={complete.isPending || (updateTask.isPending && String(updateTask.variables?.task.id) === String(task.id))} onOpen={task.storyId ? () => openStory(task.storyId!) : undefined} onEdit={fetchers.editorial ? () => setEditingTask(task) : undefined} onComplete={() => complete.mutate(task)} onUpdate={fetchers.editorial ? (patch, optimistic) => updateTask.mutate({ task, patch, optimistic }) : undefined} />;
  const renderWorkItem = (item: HomeWorkItem) => {
    if (item.kind === "task") return renderTask(item.task);
    if (item.kind === "review") {
      const writers = item.story.authors.length ? item.story.authors : item.story.writer ? [item.story.writer] : [];
      return <ReviewRow key={item.id} storyId={item.story.id} title={item.story.title} people={writers} detail={`Review · ${writers.map((person) => person.name).join(", ") || "Unassigned writer"}`} onOpen={() => openStory(item.story.id)} />;
    }
    if (item.kind === "media") return <MediaAssignmentRow key={item.id} media={item.media} timezone={timezone} now={now} onOpen={() => openStory(item.media.story.id)} />;
    return <AttentionRow key={item.id} item={item.item} onOpen={() => item.item.href ? window.location.assign(item.item.href) : item.item.storyId ? openStory(item.item.storyId) : workRef.current?.focus()} />;
  };
  const renderWorkGroups = (items: HomeWorkItem[], counts: HomeWorkItem[] = items) => <div className="flex flex-col pb-1">{HOME_WORK_GROUPS.map((group) => {
    const grouped = items.filter((item) => item.group === group.id);
    if (!grouped.length) return null;
    return <div key={group.id} role="group" aria-label={group.label}><GroupHeading label={group.label} count={counts.filter((item) => item.group === group.id).length} /><ItemGroup role="group" className={homeGroupClassName}>{grouped.map(renderWorkItem)}</ItemGroup></div>;
  })}</div>;
  const section = (key: keyof HomeBootstrap["errors"], content: ReactNode, empty: string) => home.isPending ? <div className="pt-4"><RowSkeletons /></div> : home.isError ? <Quiet>Work is temporarily unavailable.</Quiet> : data?.errors[key] ? <InlineAlert className="mx-3 my-3 w-auto" onAction={() => void home.refetch()}>{data.errors[key]}</InlineAlert> : content || <Quiet>{empty}</Quiet>;
  const failedDeploy = deployment.data?.lifecycle === "failed";
  const criticalHealth = health.data?.checks?.find((check) => check.status === "critical");
  const workPartial = Boolean(data?.errors.tasks || data?.errors.visualWork || data?.errors.appointments);
  const agendaPartial = Boolean(data?.errors.stories || data?.errors.appointments);
  const boundedWork = Boolean(data && (data.tasks.length >= data.limits.tasks || data.visualWork.length >= data.limits.visualWork || data.appointments.length >= data.limits.appointments));
  const hasMoreWork = work.length > HOME_WORK_PREVIEW_LIMIT || boundedWork;

  // Site: the public website's state, the next real schedule and content health. Each row only when its data is there.
  // The site publishes the whole newsroom's work, so its next schedule ignores the Mine scope.
  const siteAgenda = scope === "mine" && canReview && data ? homeAgenda(data, now, collectionLinks.href) : agenda;
  const nextScheduled = siteAgenda.find((event) => event.id.startsWith("scheduled-") && new Date(event.date).getTime() >= now.getTime());
  const healthWarnings = contentHealth.data ? contentHealth.data.issues.filter((issue) => !issue.ignored && issue.severity !== "info").length : null;
  const lifecycle = deployment.data ? deployment.data.lifecycle || (deployment.data.pending ? "queued" : "") : null;
  const siteRows: SiteRow[] = [];
  if (lifecycle !== null) {
    const website = lifecycle === "live" ? { icon: siteIcons.live, iconClassName: "text-green-700 dark:text-green-300", value: "Up to date" }
      : lifecycle === "failed" ? { icon: siteIcons.failed, iconClassName: "text-warning", value: <span className="font-medium text-warning">Publication failed</span> }
        : lifecycle === "queued" || lifecycle === "building" ? { icon: siteIcons.pending, value: lifecycle === "building" ? "Building…" : "Queued" }
          : { icon: siteIcons.pending, value: <span className="text-muted-foreground">Not configured</span> };
    siteRows.push({ key: "website", label: "Website", href: actionUrls?.deployment, ...website });
  }
  if (siteRows.length || healthWarnings !== null) {
    siteRows.push(nextScheduled
      ? { key: "scheduled", icon: siteIcons.scheduled, label: "Next scheduled", value: shortDateTime(nextScheduled.date, timezone), title: nextScheduled.title, onOpen: nextScheduled.storyId ? () => openStory(nextScheduled.storyId!) : undefined }
      : { key: "scheduled", icon: siteIcons.scheduled, label: "Next scheduled", value: <span className="text-muted-foreground">Nothing in two weeks</span> });
  }
  if (healthWarnings !== null) siteRows.push({ key: "health", icon: siteIcons.health, label: "Content health", href: actionUrls?.contentHealth, value: healthWarnings ? <span className="font-medium text-warning">{healthWarnings} {healthWarnings === 1 ? "warning" : "warnings"}</span> : <span className="text-muted-foreground">No warnings</span> });
  const showDesk = Boolean(data && !data.errors.stories);
  const showSite = siteRows.length > 0;
  const weekTitle = weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : weekOffset === -1 ? "Last week" : week ? `Week of ${shortDay(week.start)}` : "Week";
  const budgetCounts: Record<BudgetTab, number> = { week: budget?.week.length ?? 0, mine: budget?.mine.length ?? 0, unscheduled: budget?.unscheduled.length ?? 0 };
  // A long tab expands in place: Stories has no filter for "this week's publications" or "undated", so it is no continuation.
  const budgetShown = budget ? (budgetExpanded ? budget[budgetTab] : budget[budgetTab].slice(0, BUDGET_LIMIT)) : [];

  // In a host shell, Home's muted canvas fills the content area; in wp-admin it lines up with the admin gutter.
  return <StoryHoverProvider fetchers={fetchers}><main className={cn("@container/home", shell && "min-h-full w-full bg-muted")}>
    <div className={cn("mx-auto flex max-w-[1320px] flex-col gap-5", shell ? "px-4 py-6 sm:px-7" : "mt-6 mb-8 pr-5 pl-1")}>
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: timezone }).format(now)}{data ? <span className="whitespace-nowrap"> · Week {isoWeek(today)}</span> : null}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-1">
        {/* Only an editor can look beyond their own stories. My Work is always personal. */}
        {canReview ? <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Show stories for" value={[scope]} onValueChange={(next: unknown[]) => { const value = next[0]; if (value === "mine" || value === "newsroom") changeScope(value); }} data-home-scope="">
          <ToggleGroupItem value="mine" aria-label="Mine: my stories" className={SCOPE_ITEM_CLASS}>Mine</ToggleGroupItem>
          <ToggleGroupItem value="newsroom" aria-label="Newsroom: every visible story" className={SCOPE_ITEM_CLASS}>Newsroom</ToggleGroupItem>
        </ToggleGroup> : null}
        {/* A host shell has its own Search and Create; Home does not repeat them. */}
        {shell ? null : <>
          <Button variant="outline" onClick={() => setCommandOpen(true)} aria-keyshortcuts="Control+K Meta+K" data-home-search=""><Search data-icon="inline-start" aria-hidden="true" /><span className="max-sm:hidden">Search</span><KbdGroup className="ml-2 max-sm:hidden"><Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd></KbdGroup></Button>
          {data?.capabilities.createStory ? <Button onClick={() => setCreateKind("story")}><Plus data-icon="inline-start" aria-hidden="true" />New story</Button> : null}
        </>}
      </div>
    </header>
    {!fetchers.getHome ? <InlineAlert>Story work is not available for this role.</InlineAlert> : home.isError ? <InlineAlert onAction={() => void home.refetch()}>{describeEditorialError(home.error, "Home couldn't be loaded. Try again.")}</InlineAlert> : null}
    {failedDeploy ? <InlineAlert title="Website publication failed" onAction={actionUrls?.deployment ? () => window.location.assign(actionUrls.deployment!) : undefined} actionLabel="Review deployment">The latest website publication needs attention.</InlineAlert> : null}
    {criticalHealth ? <InlineAlert title={criticalHealth.label} onAction={actionUrls?.doctor ? () => window.location.assign(actionUrls.doctor!) : undefined} actionLabel="Review content health">A critical publishing check needs attention.</InlineAlert> : null}

    <HomeCard icon={CalendarDays} title={weekTitle} description={week ? <>{weekRange(week.start, week.end)}<span className="max-sm:hidden">{scope === "mine" ? " · Your stories and appointments" : " · Newsroom publications, deadlines and your appointments"}</span></> : "Publications, deadlines and appointments"}
      action={<>
        <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => setWeekOffset((offset) => offset - 1)}><ChevronLeft aria-hidden="true" /></Button>
        {weekOffset !== 0 ? <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>Today</Button> : null}
        <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => setWeekOffset((offset) => offset + 1)}><ChevronRight aria-hidden="true" /></Button>
        {actionUrls?.calendar ? cardLink(actionUrls.calendar, "Calendar") : null}
      </>}>
      {section("stories", week ? <WeekStrip week={week} timezone={timezone} calendarHref={actionUrls?.calendar} onOpen={openEvent} onPlan={data?.capabilities.createStory ? newStory : undefined} /> : null, "Nothing is planned this week.")}
      {agendaPartial ? <p className="border-t px-4.5 py-2 text-xs text-muted-foreground">Some commitments could not be checked.</p> : null}
    </HomeCard>

    <div className={cn("grid grid-cols-1 gap-5", (showDesk || showSite) && "@min-[960px]/home:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] @min-[960px]/home:items-start")}>
      <HomeCard icon={ListTodo} title="My Work" description="Tasks, reviews, reporting and production in one queue"
        action={fetchers.editorial ? <Button variant="outline" size="sm" onClick={() => newTask()}><Plus data-icon="inline-start" aria-hidden="true" />Task</Button> : undefined}
        footer={hasMoreWork ? <><Button variant="link" size="sm" className="h-auto px-0" onClick={() => setAllWorkOpen(true)}>View all work<ChevronRight data-icon="inline-end" aria-hidden="true" /></Button><span className="text-xs text-muted-foreground tabular-nums">{work.length ? `${work.length} open` : ""}</span></> : undefined}>
        <section ref={workRef} tabIndex={-1} aria-label="My work" className="outline-none">
          {home.isPending ? <div className="pt-4"><RowSkeletons /></div> : work.length ? renderWorkGroups(work.slice(0, HOME_WORK_PREVIEW_LIMIT), work) : <Quiet>{workPartial ? "Some work is temporarily unavailable." : "Nothing needs your attention."}</Quiet>}
          {workPartial ? <p className="border-t border-border/50 px-4.5 py-2 text-xs text-muted-foreground">Some work could not be checked. <Button variant="link" size="xs" className="h-auto p-0 align-baseline" onClick={() => void home.refetch()}>Retry</Button></p> : null}
        </section>
        {completionError ? <InlineAlert className="mx-3 my-2 w-auto">{completionError}</InlineAlert> : null}
      </HomeCard>

      {showDesk || showSite ? <div className="flex min-w-0 flex-col gap-5">
        {showDesk ? <HomeCard icon={KanbanSquare} title="Desk" description={scope === "mine" ? "Your active stories by stage" : "Active newsroom stories by stage"} action={storiesLink({}, "board") ? cardLink(storiesLink({}, "board")!, "Board", "Open the Stories board") : undefined}>
          {desk.length ? <DeskStages stages={desk} stageHref={actionUrls?.planning ? (stage) => storiesLink({ workflow: stage.id }, "list")! : undefined} /> : <Quiet>{scope === "mine" ? "You have no active stories." : "No active stories."}</Quiet>}
        </HomeCard> : null}
        {showSite ? <HomeCard icon={Globe} title="Site" description="The public website and its content">
          <SiteRows rows={siteRows} />
        </HomeCard> : null}
      </div> : null}
    </div>

    <Tabs value={budgetTab} onValueChange={(value) => { setBudgetTab(value as BudgetTab); setBudgetExpanded(false); }}>
      <HomeCard icon={Newspaper} title="Budget" description={scope === "mine" ? "Your stories: what publishes when" : "What the newsroom publishes when"}
        action={storiesLink() ? cardLink(storiesLink()!, "Stories", "Open Stories") : undefined}
        below={<div className="overflow-x-auto border-b border-border/60 px-4.5 pt-1.5 pb-1 [scrollbar-width:none]"><TabsList variant="line" aria-label="Budget" className="h-8 w-max gap-3">
          {BUDGET_TABS.map((tab) => <TabsTrigger key={tab.id} value={tab.id} className="flex-none px-0">{tab.label}<Badge variant="secondary" className="h-4 min-w-4 px-1.5 text-[11px] tabular-nums">{budgetCounts[tab.id]}</Badge></TabsTrigger>)}
        </TabsList></div>}
        footer={budget && budgetCounts[budgetTab] > BUDGET_LIMIT ? <>
          <Button variant="link" size="sm" className="h-auto px-0" aria-expanded={budgetExpanded} onClick={() => setBudgetExpanded((open) => !open)}>{budgetExpanded ? "Show fewer" : `Show all ${budgetCounts[budgetTab]}`}</Button>
          {budgetTab === "mine" && storiesLink({ mine: true }) ? <a className={buttonVariants({ variant: "link", size: "sm" })} href={storiesLink({ mine: true }, "list")}>My stories in Stories<ChevronRight data-icon="inline-end" aria-hidden="true" /></a> : <span className="text-xs text-muted-foreground tabular-nums">{budgetExpanded ? budgetCounts[budgetTab] : BUDGET_LIMIT} of {budgetCounts[budgetTab]}</span>}
        </> : undefined}>
        {BUDGET_TABS.map((tab) => <TabsContent key={tab.id} value={tab.id}>
          {section("stories", budget && budget[tab.id].length ? <BudgetTable stories={tab.id === budgetTab ? budgetShown : budget[tab.id].slice(0, BUDGET_LIMIT)} label={`Budget: ${tab.label}`} timezone={timezone} now={now} onOpen={openStory} workspaceUrl={actionUrls?.workspace} /> : null, tab.empty)}
        </TabsContent>)}
      </HomeCard>
    </Tabs>

    <footer className="flex items-center justify-between text-xs text-muted-foreground"><span>{data ? `Dates shown in ${timezone.replace(/_/g, " ")}` : ""}</span><Button variant="link" size="xs" disabled={home.isFetching} onClick={() => void home.refetch()}>{home.isFetching ? "Refreshing…" : "Refresh"}</Button></footer>
    {health.isError || deployment.isError ? <p className="text-xs text-muted-foreground">Some system checks are unavailable. Your work is shown above.</p> : null}
    </div>
    <span role="status" className="sr-only" aria-live="polite">{completedLabel}</span>
    <StoryPeek storyId={peekId} fetchers={fetchers} timezone={timezone} onClose={() => setPeekId(null)} origin={origin} now={now} workspaceUrl={actionUrls?.workspace} />
    {shell ? null : <>
      <HomeCommands open={commandOpen} onOpenChange={setCommandOpen} fetchers={fetchers} data={data} recentIds={recentIds} onStory={openStory} onNewStory={() => setCreateKind("story")} onNewTask={newTask} urls={actionUrls} />
      <HomeCreate kind={createKind} onClose={() => setCreateKind(null)} onStoryCreated={openCreatedStory} fetchers={fetchers} data={data} storyId={taskStoryId} />
    </>}
    <TaskEditDialog open={editingTask !== null} onClose={() => setEditingTask(null)} fetchers={fetchers} task={editingTask} people={data?.people || []} canAssign={canReview} timezone={timezone} />
    <Sheet open={allWorkOpen} onOpenChange={setAllWorkOpen}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader><SheetTitle>All my work</SheetTitle><SheetDescription>Everything that currently needs your action</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">{work.length ? renderWorkGroups(work) : <Quiet>Nothing needs your attention.</Quiet>}{boundedWork ? <p className="px-4.5 pt-3 text-xs text-muted-foreground">Today is showing the bounded work available from the newsroom feed.</p> : null}</div>
      </SheetContent>
    </Sheet>
  </main></StoryHoverProvider>;
}
