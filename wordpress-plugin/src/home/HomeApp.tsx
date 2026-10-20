import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type EditorialTask } from "../editorial/editorial-model";
import { AdminRoot } from "../admin-ui/components/admin-root";
import { EmptyState } from "../admin-ui/components/empty-state";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { ItemList } from "../admin-ui/components/item-list";
import { Panel } from "../admin-ui/components/panel";
import { Badge } from "../admin-ui/ui/badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "../admin-ui/ui/item";
import { Kbd, KbdGroup } from "../admin-ui/ui/kbd";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../admin-ui/ui/sheet";
import type { HomeFetchers } from "./home-api";
import { homeQueryClient, homeKey, workspaceKey, replaceHomeTask, replaceWorkspaceTask } from "./home-query";
import { dateLabel, homeAgenda, myActiveStories, myOpenTasks, reviewStories, waitingForMe, type HomeBootstrap } from "./newsroom-model";
import { HomeCommands, type HomeActionUrls } from "./HomeCommands";
import { HomeCreate } from "./HomeCreate";
import { StoryPeek } from "./StoryPeek";
import type { StoryWorkspace } from "../workspace/workspace-types";
import { ActivityRow, AgendaItem, AttentionRow, MediaAssignmentRow, ReviewRow, RowSkeletons, StoryRow, TaskRow } from "./components/rows";

export type HomeAppProps = { fetchers: HomeFetchers; currentUserId?: number | null; actionUrls?: HomeActionUrls };

export function HomeApp(props: HomeAppProps) {
  return <QueryClientProvider client={homeQueryClient}><AdminRoot><HomeWorkspace {...props} /></AdminRoot></QueryClientProvider>;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** A titled Card whose rows are flush with its edges. */
function Surface({ title, subtitle, action, className, children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <Panel title={title} description={subtitle} action={action} className={className} contentClassName="px-0">{children}</Panel>;
}

const surfaceLink = (href: string, label: string) => <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={href}>{label}<ArrowRight data-icon="inline-end" aria-hidden="true" /></a>;

function Quiet({ children }: { children: ReactNode }) {
  return <EmptyState title={children} className="border-0 py-4" />;
}

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
    onSuccess: (_updated, task) => setCompletedLabel(`Completed ${task.title}.`),
    onError: (error, task) => {
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, task));
      if (task.storyId) client.setQueryData<StoryWorkspace>(workspaceKey(task.storyId), (old) => replaceWorkspaceTask(old, task));
      const message = describeEditorialError(error, "Task couldn't be completed. Try again.");
      setCompletionError(message);
      toast.error(message);
    },
    onSettled: (_data, _error, task) => { void client.invalidateQueries({ queryKey: homeKey }); if (task.storyId) void client.invalidateQueries({ queryKey: workspaceKey(task.storyId) }); }
  });
  const tasks = data ? myOpenTasks(data.tasks, data.currentUser.id, timezone, now) : [];
  const stories = data ? myActiveStories(data.stories, data.currentUser.id, timezone, now) : [];
  const agenda = data ? homeAgenda(data, now).slice(0, 6) : [];
  const attention = data ? waitingForMe(data, now) : [];
  const review = data ? reviewStories(data) : [];
  const visuals = data?.visualWork.filter((v) => v.status !== "done" && (data.capabilities.review || v.assignee?.id === data.currentUser.id)) || [];
  const newTask = (storyId: number | null = null) => { setTaskStoryId(storyId); setCreateKind("task"); };
  const storyTitle = (id?: number | null) => data?.stories.find((s) => s.id === id)?.title;
  const renderTask = (task: EditorialTask) => <TaskRow key={task.id} task={task} storyTitle={storyTitle(task.storyId)} timezone={timezone} now={now} pending={complete.isPending} onOpen={task.storyId ? () => openStory(task.storyId!) : undefined} onComplete={() => complete.mutate(task)} />;
  const section = (key: keyof HomeBootstrap["errors"], content: ReactNode, empty: string) => home.isPending ? <RowSkeletons /> : home.isError ? <Quiet>Work is temporarily unavailable.</Quiet> : data?.errors[key] ? <InlineAlert className="mx-1.5 w-auto" onAction={() => void home.refetch()}>{data.errors[key]}</InlineAlert> : content || <Quiet>{empty}</Quiet>;
  const failedDeploy = deployment.data?.lifecycle === "failed";
  const criticalHealth = health.data?.checks?.find((check) => check.status === "critical");
  const attentionLink = (href: string, label: string) => <Item size="sm" render={<a href={href} />}><ItemContent><ItemTitle>{label}</ItemTitle></ItemContent><ItemActions><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions></Item>;
  const partial = data?.errors.tasks || data?.errors.visualWork || data?.errors.appointments;

  return <main className="@container/home mx-auto mt-6 mb-8 flex max-w-[1320px] flex-col gap-5 pr-5 pl-1">
    <header className="flex items-center justify-between gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Today<span className="font-normal text-muted-foreground max-sm:hidden">{data?.currentUser.name ? ` / ${data.currentUser.name.split(" ")[0]}` : ""}</span></h1>
        <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: timezone }).format(now)}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setCommandOpen(true)} aria-keyshortcuts="Control+K Meta+K" data-home-search=""><Search data-icon="inline-start" aria-hidden="true" /><span className="max-sm:hidden">Search</span><KbdGroup className="ml-2 max-sm:hidden"><Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd></KbdGroup></Button>
        {data?.capabilities.createStory ? <Button onClick={() => setCreateKind("story")}><Plus data-icon="inline-start" aria-hidden="true" />New story</Button> : null}
      </div>
    </header>
    {!fetchers.getHome ? <InlineAlert>Story work is not available for this role.</InlineAlert> : home.isError ? <InlineAlert onAction={() => void home.refetch()}>{describeEditorialError(home.error, "Home couldn't be loaded. Try again.")}</InlineAlert> : null}
    <div className="flex flex-col gap-5 @3xl/home:grid @3xl/home:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl/home:items-start">
      <Surface title="Up Next" subtitle="Your assigned work, in order of urgency" className="@3xl/home:col-start-1 @3xl/home:row-start-1" action={fetchers.editorial ? <Button variant="ghost" size="sm" onClick={() => newTask()}><Plus data-icon="inline-start" aria-hidden="true" />Task</Button> : undefined}>
        <section ref={workRef} tabIndex={-1} aria-label="Assigned tasks" className="outline-none">
          {section("tasks", tasks.length ? <ItemList>{tasks.slice(0, 7).map(renderTask)}</ItemList> : null, "No open assignments.")}
          <div data-home-work-footer className="mt-1 flex items-center justify-between border-t px-1.5 pt-2"><Button variant="link" size="sm" onClick={() => setAllWorkOpen(true)}>View all work<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button><span className="text-xs text-muted-foreground">{tasks.length ? `${tasks.length} open` : ""}</span></div>
        </section>
        {completionError ? <InlineAlert className="mx-1.5 mt-2 w-auto">{completionError}</InlineAlert> : null}
      </Surface>
      <Surface title="Waiting for Me" className="@3xl/home:col-start-2 @3xl/home:row-start-2">{home.isPending ? <RowSkeletons count={2} /> : attention.length || failedDeploy || criticalHealth ? <ItemList>{[
        ...attention.map((item) => <AttentionRow key={item.id} item={item} onOpen={() => item.storyId ? openStory(item.storyId) : workRef.current?.focus()} />),
        ...(failedDeploy && actionUrls?.deployment ? [attentionLink(actionUrls.deployment, "Website publication failed")] : []),
        ...(criticalHealth && actionUrls?.doctor ? [attentionLink(actionUrls.doctor, criticalHealth.label)] : [])
      ]}</ItemList> : <Quiet>{home.isError || data?.errors.tasks || data?.errors.stories || data?.errors.visualWork || data?.errors.appointments ? "Attention items couldn't be checked." : "You're caught up."}</Quiet>}</Surface>
      <Surface title="Coming Up" className="@3xl/home:col-start-2 @3xl/home:row-start-1" action={actionUrls?.calendar ? surfaceLink(actionUrls.calendar, "Calendar") : undefined}>
        {section("stories", agenda.length ? <div className="flex flex-col gap-2">{Array.from(new Set(agenda.map((e) => e.day))).map((day) => <div key={day}><h3 className="px-3 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">{dateLabel(day, timezone, now)}</h3><ItemList>{agenda.filter((e) => e.day === day).map((event) => <AgendaItem key={event.id} event={event} timezone={timezone} onOpen={event.storyId ? () => openStory(event.storyId!) : undefined} />)}</ItemList></div>)}</div> : null, "Nothing scheduled in the next two weeks.")}
        {partial ? <p className="px-3 pt-2 text-xs text-muted-foreground">Some assignments could not be checked.</p> : null}
      </Surface>
      <Surface title="My Stories" className="@3xl/home:col-start-1 @3xl/home:row-start-2" action={actionUrls?.planning ? surfaceLink(`${actionUrls.planning}&mine=1`, "All my stories") : undefined}>{section("stories", stories.length ? <ItemList>{stories.slice(0, 6).map((story) => <StoryRow key={story.id} story={story} timezone={timezone} now={now} onOpen={() => openStory(story.id)} />)}</ItemList> : null, "No active stories assigned to you.")}</Surface>
      {data?.capabilities.review ? <Surface title="Ready for Review" className="@3xl/home:col-start-1" action={<Badge variant="secondary">{review.length}</Badge>}>{review.length ? <ItemList>{review.slice(0, 5).map((story) => <ReviewRow key={story.id} title={story.title} detail={`${story.authors.map((a) => a.name).join(", ") || story.writer?.name || "Unassigned writer"} · Ready for review`} onOpen={() => openStory(story.id)} />)}</ItemList> : <Quiet>{data.errors.stories ? "The review queue couldn't be checked." : "No stories waiting for review."}</Quiet>}</Surface> : null}
      {data?.capabilities.review || visuals.length || data?.errors.visualWork ? <Surface title="Photo & Visual Work" className={data?.capabilities.review ? "@3xl/home:col-start-2" : "@3xl/home:col-span-2"}>{section("visualWork", visuals.length ? <ItemList>{visuals.slice(0, 5).map((media) => <MediaAssignmentRow key={`${media.story.id}-${media.id}`} media={media} timezone={timezone} now={now} onOpen={() => openStory(media.story.id)} />)}</ItemList> : null, "No photo assignments.")}</Surface> : null}
      <Surface title="Recent Activity" className="@3xl/home:col-span-2">{section("activity", data?.activity.length ? <ItemList>{data.activity.slice(0, 10).map((item) => <ActivityRow key={item.id} item={item} timezone={timezone} now={now} onOpen={item.storyId ? () => openStory(item.storyId!) : undefined} />)}</ItemList> : null, "No recent newsroom activity.")}</Surface>
    </div>
    <footer className="flex items-center justify-between text-xs text-muted-foreground"><span>{data ? `Dates shown in ${timezone.replace(/_/g, " ")}` : ""}</span><Button variant="link" size="xs" disabled={home.isFetching} onClick={() => void home.refetch()}>{home.isFetching ? "Refreshing…" : "Refresh"}</Button></footer>
    {health.isError || deployment.isError ? <p className="text-xs text-muted-foreground">Some system checks are unavailable. Your work is shown above.</p> : null}
    <span role="status" className="sr-only" aria-live="polite">{completedLabel}</span>
    <StoryPeek storyId={peekId} fetchers={fetchers} timezone={timezone} onClose={() => setPeekId(null)} origin={origin} onComplete={(task) => complete.mutate(task)} completing={complete.isPending} onNewTask={newTask} now={now} workspaceUrl={actionUrls?.workspace} />
    <HomeCommands open={commandOpen} onOpenChange={setCommandOpen} fetchers={fetchers} data={data} recentIds={recentIds} onStory={openStory} onNewStory={() => setCreateKind("story")} onNewTask={newTask} urls={actionUrls} />
    <HomeCreate kind={createKind} onClose={() => setCreateKind(null)} onStoryCreated={openCreatedStory} fetchers={fetchers} data={data} storyId={taskStoryId} />
    <Sheet open={allWorkOpen} onOpenChange={setAllWorkOpen}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader><SheetTitle>All my work</SheetTitle><SheetDescription>Your visible open assignments</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-4">{tasks.length ? <ItemList>{tasks.map(renderTask)}</ItemList> : <Quiet>No open assignments.</Quiet>}{data && tasks.length >= data.limits.tasks ? <p className="px-3 pt-3 text-xs text-muted-foreground">Showing the first {data.limits.tasks} assignments.</p> : null}</div>
      </SheetContent>
    </Sheet>
  </main>;
}
