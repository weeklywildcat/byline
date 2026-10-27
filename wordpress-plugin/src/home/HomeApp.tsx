import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type EditorialTask } from "../editorial/editorial-model";
import { cn } from "../admin-ui/lib/utils";
import { AdminRoot } from "../admin-ui/components/admin-root";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Empty, EmptyDescription } from "../admin-ui/ui/empty";
import { ItemGroup } from "../admin-ui/ui/item";
import { Kbd, KbdGroup } from "../admin-ui/ui/kbd";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../admin-ui/ui/sheet";
import type { HomeFetchers } from "./home-api";
import { createAdminQueryClient } from "../story/story-query";
import { homeKey, workspaceKey, replaceHomeTask, replaceWorkspaceTask } from "./home-query";
import { dateLabel, HOME_WORK_GROUPS, homeAgenda, myActiveStories, myWork, type HomeBootstrap, type HomeWorkItem } from "./newsroom-model";
import { HomeCommands, type HomeActionUrls } from "./HomeCommands";
import { HomeCreate } from "./HomeCreate";
import { StoryPeek } from "../story/StoryPeek";
import { StoryHoverProvider } from "../story/StoryHoverCard";
import type { StoryWorkspace } from "../workspace/workspace-types";
import { AgendaItem, AttentionRow, MediaAssignmentRow, ReviewRow, StoryRow } from "./components/rows";
import { RowSkeletons, TaskRow } from "../story/rows";
import { useUpdateTask } from "../story/use-update-task";
import { TaskEditDialog } from "../story/TaskEditDialog";

export type HomeAppProps = { fetchers: HomeFetchers; currentUserId?: number | null; actionUrls?: HomeActionUrls };

const homeQueryClient = createAdminQueryClient();

export function HomeApp(props: HomeAppProps) {
  return <QueryClientProvider client={homeQueryClient}><AdminRoot><HomeWorkspace {...props} /></AdminRoot></QueryClientProvider>;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
// ItemGroup's size variants otherwise reintroduce gaps between separated rows.
const homeGroupClassName = "gap-0 has-data-[size=sm]:gap-0 has-data-[size=xs]:gap-0";

/** A titled Card whose rows are flush with its edges. */
function Surface({ title, subtitle, action, className, children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId();
  return <Card size="sm" role="region" aria-labelledby={id} className={cn("gap-0 py-0", className)}>
    <CardHeader className="items-center border-b border-border/70 bg-muted/40 px-3 py-1.5 [.border-b]:pb-1.5">
      <CardTitle id={id} role="heading" aria-level={2}>{title}</CardTitle>
      {subtitle ? <CardDescription className="text-xs">{subtitle}</CardDescription> : null}
      {action ? <CardAction className="self-center">{action}</CardAction> : null}
    </CardHeader>
    <CardContent className="px-0">{children}</CardContent>
  </Card>;
}

const surfaceLink = (href: string, label: string) => <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={href}>{label}<ArrowRight data-icon="inline-end" aria-hidden="true" /></a>;

function Quiet({ children }: { children: ReactNode }) {
  return <Empty className="min-h-0 items-start px-3 py-2 text-left"><EmptyDescription>{children}</EmptyDescription></Empty>;
}

const HOME_WORK_PREVIEW_LIMIT = 10;

function HomeWorkspace({ fetchers, actionUrls }: HomeAppProps) {
  const client = useQueryClient();
  const home = useQuery({ queryKey: homeKey, queryFn: () => fetchers.getHome!(), enabled: Boolean(fetchers.getHome) });
  const health = useQuery({ queryKey: ["byline", "home-health"], queryFn: () => fetchers.getHealth!(), enabled: Boolean(fetchers.getHealth) });
  const deployment = useQuery({ queryKey: ["byline", "home-deployment"], queryFn: () => fetchers.getDeployment!(), enabled: Boolean(fetchers.getDeployment) });
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        if (!createKind) setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", shortcut, true);
    return () => { clearInterval(timer); window.removeEventListener("keydown", shortcut, true); };
  }, [createKind]);

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
      if (index >= 0) requestAnimationFrame(() => { if (next?.isConnected) next.focus(); else (container?.querySelector<HTMLElement>("[data-home-work-footer] button, [data-peek-add-task]") || workRef.current)?.focus(); });
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
  const work = data ? myWork(data, now) : [];
  const stories = data ? myActiveStories(data.stories, data.currentUser.id, timezone, now) : [];
  const agenda = data ? homeAgenda(data, now).slice(0, 6) : [];
  const newTask = (storyId: number | null = null) => { setTaskStoryId(storyId); setCreateKind("task"); };
  const storyTitle = (id?: number | null) => data?.stories.find((s) => s.id === id)?.title;
  const renderTask = (task: EditorialTask) => <TaskRow key={task.id} dense task={task} storyTitle={storyTitle(task.storyId)} timezone={timezone} now={now} people={data?.people || []} canAssign={Boolean(data?.capabilities.review)} pending={complete.isPending || (updateTask.isPending && String(updateTask.variables?.task.id) === String(task.id))} onOpen={task.storyId ? () => openStory(task.storyId!) : undefined} onEdit={fetchers.editorial ? () => setEditingTask(task) : undefined} onComplete={() => complete.mutate(task)} onUpdate={fetchers.editorial ? (patch, optimistic) => updateTask.mutate({ task, patch, optimistic }) : undefined} />;
  const renderWorkItem = (item: HomeWorkItem) => {
    if (item.kind === "task") return renderTask(item.task);
    if (item.kind === "review") {
      const writers = item.story.authors.length ? item.story.authors : item.story.writer ? [item.story.writer] : [];
      return <ReviewRow key={item.id} storyId={item.story.id} title={item.story.title} people={writers} detail={`Review · ${writers.map((person) => person.name).join(", ") || "Unassigned writer"}`} onOpen={() => openStory(item.story.id)} />;
    }
    if (item.kind === "media") return <MediaAssignmentRow key={item.id} media={item.media} timezone={timezone} now={now} onOpen={() => openStory(item.media.story.id)} />;
    return <AttentionRow key={item.id} item={item.item} onOpen={() => item.item.href ? window.location.assign(item.item.href) : item.item.storyId ? openStory(item.item.storyId) : workRef.current?.focus()} />;
  };
  const renderWorkGroups = (items: HomeWorkItem[]) => <div className="flex flex-col">{HOME_WORK_GROUPS.map((group) => {
    const grouped = items.filter((item) => item.group === group.id);
    if (!grouped.length) return null;
    return <section key={group.id} aria-label={group.label}><h3 className="border-y border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground first:border-t-0">{group.label}</h3><ItemGroup role="group" className={homeGroupClassName}>{grouped.map(renderWorkItem)}</ItemGroup></section>;
  })}</div>;
  const section = (key: keyof HomeBootstrap["errors"], content: ReactNode, empty: string) => home.isPending ? <RowSkeletons /> : home.isError ? <Quiet>Work is temporarily unavailable.</Quiet> : data?.errors[key] ? <InlineAlert className="mx-1.5 w-auto" onAction={() => void home.refetch()}>{data.errors[key]}</InlineAlert> : content || <Quiet>{empty}</Quiet>;
  const failedDeploy = deployment.data?.lifecycle === "failed";
  const criticalHealth = health.data?.checks?.find((check) => check.status === "critical");
  const workPartial = Boolean(data?.errors.tasks || data?.errors.visualWork || data?.errors.appointments);
  const agendaPartial = Boolean(data?.errors.stories || data?.errors.appointments);
  const boundedWork = Boolean(data && (data.tasks.length >= data.limits.tasks || data.visualWork.length >= data.limits.visualWork || data.appointments.length >= data.limits.appointments));
  const hasMoreWork = work.length > HOME_WORK_PREVIEW_LIMIT || boundedWork;

  return <StoryHoverProvider fetchers={fetchers}><main className="@container/home mx-auto mt-6 mb-8 flex max-w-[1320px] flex-col gap-4 pr-5 pl-1">
    <header className="flex items-center justify-between gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: timezone }).format(now)}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setCommandOpen(true)} aria-keyshortcuts="Control+K Meta+K" data-home-search=""><Search data-icon="inline-start" aria-hidden="true" /><span className="max-sm:hidden">Search</span><KbdGroup className="ml-2 max-sm:hidden"><Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd></KbdGroup></Button>
        {data?.capabilities.createStory ? <Button onClick={() => setCreateKind("story")}><Plus data-icon="inline-start" aria-hidden="true" />New story</Button> : null}
      </div>
    </header>
    {!fetchers.getHome ? <InlineAlert>Story work is not available for this role.</InlineAlert> : home.isError ? <InlineAlert onAction={() => void home.refetch()}>{describeEditorialError(home.error, "Home couldn't be loaded. Try again.")}</InlineAlert> : null}
    {failedDeploy ? <InlineAlert title="Website publication failed" onAction={actionUrls?.deployment ? () => window.location.assign(actionUrls.deployment!) : undefined} actionLabel="Review deployment">The latest website publication needs attention.</InlineAlert> : null}
    {criticalHealth ? <InlineAlert title={criticalHealth.label} onAction={actionUrls?.doctor ? () => window.location.assign(actionUrls.doctor!) : undefined} actionLabel="Review content health">A critical publishing check needs attention.</InlineAlert> : null}
    <div className="grid grid-cols-1 gap-4 @3xl/home:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl/home:items-start">
      <Surface title="My Work" subtitle="Tasks, reviews, reporting and production in one queue" action={fetchers.editorial ? <Button variant="ghost" size="sm" onClick={() => newTask()}><Plus data-icon="inline-start" aria-hidden="true" />Task</Button> : undefined}>
        <section ref={workRef} tabIndex={-1} aria-label="My work" className="outline-none">
          {home.isPending ? <RowSkeletons /> : work.length ? renderWorkGroups(work.slice(0, HOME_WORK_PREVIEW_LIMIT)) : <Quiet>{workPartial ? "Some work is temporarily unavailable." : "Nothing needs your attention."}</Quiet>}
          {workPartial ? <p className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">Some work could not be checked. <Button variant="link" size="xs" className="h-auto p-0 align-baseline" onClick={() => void home.refetch()}>Retry</Button></p> : null}
          {hasMoreWork ? <div data-home-work-footer className="flex items-center justify-between border-t border-border/70 px-3 py-2"><Button variant="link" size="sm" onClick={() => setAllWorkOpen(true)}>View all work<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button><span className="text-xs text-muted-foreground">{work.length ? `${work.length} open` : ""}</span></div> : null}
        </section>
        {completionError ? <InlineAlert className="mx-1.5 my-2 w-auto">{completionError}</InlineAlert> : null}
      </Surface>

      <Surface title="Coming Up" subtitle="Interviews, story deadlines and publication commitments" action={actionUrls?.calendar ? surfaceLink(actionUrls.calendar, "Calendar") : undefined}>
        {section("stories", agenda.length ? <div className="flex flex-col">{Array.from(new Set(agenda.map((e) => e.day))).map((day) => <div key={day}><h3 className="border-y border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground first:border-t-0">{dateLabel(day, timezone, now)}</h3><ItemGroup role="group" className={homeGroupClassName}>{agenda.filter((e) => e.day === day).map((event) => <AgendaItem key={event.id} event={event} timezone={timezone} onOpen={event.href ? () => window.location.assign(event.href!) : event.storyId ? () => openStory(event.storyId!) : undefined} />)}</ItemGroup></div>)}</div> : null, "Nothing scheduled in the next two weeks.")}
        {agendaPartial ? <p className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">Some commitments could not be checked.</p> : null}
      </Surface>
    </div>

    <Surface title="My Stories" subtitle="The active stories you're responsible for" action={actionUrls?.planning ? surfaceLink(`${actionUrls.planning}&mine=1`, "All my stories") : undefined}>
      {section("stories", stories.length ? <ItemGroup role="group" className={homeGroupClassName}>{stories.slice(0, 6).map((story) => <StoryRow key={story.id} story={story} timezone={timezone} now={now} onOpen={() => openStory(story.id)} />)}</ItemGroup> : null, "No active stories assigned to you.")}
    </Surface>
    <footer className="flex items-center justify-between text-xs text-muted-foreground"><span>{data ? `Dates shown in ${timezone.replace(/_/g, " ")}` : ""}</span><Button variant="link" size="xs" disabled={home.isFetching} onClick={() => void home.refetch()}>{home.isFetching ? "Refreshing…" : "Refresh"}</Button></footer>
    {health.isError || deployment.isError ? <p className="text-xs text-muted-foreground">Some system checks are unavailable. Your work is shown above.</p> : null}
    <span role="status" className="sr-only" aria-live="polite">{completedLabel}</span>
    <StoryPeek storyId={peekId} fetchers={fetchers} timezone={timezone} onClose={() => setPeekId(null)} origin={origin} onComplete={(task) => complete.mutate(task)} completing={complete.isPending} onNewTask={newTask} now={now} workspaceUrl={actionUrls?.workspace} />
    <HomeCommands open={commandOpen} onOpenChange={setCommandOpen} fetchers={fetchers} data={data} recentIds={recentIds} onStory={openStory} onNewStory={() => setCreateKind("story")} onNewTask={newTask} urls={actionUrls} />
    <HomeCreate kind={createKind} onClose={() => setCreateKind(null)} onStoryCreated={openCreatedStory} fetchers={fetchers} data={data} storyId={taskStoryId} />
    <TaskEditDialog open={editingTask !== null} onClose={() => setEditingTask(null)} fetchers={fetchers} task={editingTask} people={data?.people || []} canAssign={Boolean(data?.capabilities.review)} timezone={timezone} />
    <Sheet open={allWorkOpen} onOpenChange={setAllWorkOpen}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader><SheetTitle>All my work</SheetTitle><SheetDescription>Everything that currently needs your action</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-4">{work.length ? renderWorkGroups(work) : <Quiet>Nothing needs your attention.</Quiet>}{boundedWork ? <p className="px-3 pt-3 text-xs text-muted-foreground">Today is showing the bounded work available from the newsroom feed.</p> : null}</div>
      </SheetContent>
    </Sheet>
  </main></StoryHoverProvider>;
}
