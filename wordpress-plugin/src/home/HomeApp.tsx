import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type EditorialTask } from "../editorial/editorial-model";
import { AdminRoot } from "../admin-ui/components/admin-root";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Badge } from "../admin-ui/ui/badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Empty, EmptyDescription } from "../admin-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import { Kbd, KbdGroup } from "../admin-ui/ui/kbd";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../admin-ui/ui/sheet";
import type { HomeFetchers } from "./home-api";
import { createAdminQueryClient } from "../story/story-query";
import { homeKey, workspaceKey, replaceHomeTask, replaceWorkspaceTask } from "./home-query";
import { dateLabel, homeAgenda, myActiveStories, myOpenTasks, reviewStories, waitingForMe, type HomeBootstrap } from "./newsroom-model";
import { HomeCommands, type HomeActionUrls } from "./HomeCommands";
import { HomeCreate } from "./HomeCreate";
import { StoryPeek } from "../story/StoryPeek";
import { StoryHoverProvider } from "../story/StoryHoverCard";
import type { StoryWorkspace } from "../workspace/workspace-types";
import { AgendaItem, AttentionRow, MediaAssignmentRow, ReviewRow, StoryRow } from "./components/rows";
import { ActivityRow, RowSkeletons, TaskRow } from "../story/rows";

export type HomeAppProps = { fetchers: HomeFetchers; currentUserId?: number | null; actionUrls?: HomeActionUrls };

const homeQueryClient = createAdminQueryClient();

export function HomeApp(props: HomeAppProps) {
  return <QueryClientProvider client={homeQueryClient}><AdminRoot><HomeWorkspace {...props} /></AdminRoot></QueryClientProvider>;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** A titled Card whose rows are flush with its edges. */
function Surface({ title, subtitle, action, className, children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId();
  return <Card size="sm" role="region" aria-labelledby={id} className={className}>
    <CardHeader>
      <CardTitle id={id} role="heading" aria-level={2}>{title}</CardTitle>
      {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
    <CardContent className="px-0">{children}</CardContent>
  </Card>;
}

const surfaceLink = (href: string, label: string) => <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={href}>{label}<ArrowRight data-icon="inline-end" aria-hidden="true" /></a>;

function Quiet({ children }: { children: ReactNode }) {
  return <Empty className="min-h-0 items-start px-3 py-2 text-left"><EmptyDescription>{children}</EmptyDescription></Empty>;
}

const HOME_TASK_PREVIEW_LIMIT = 7;

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
  const showWaiting = home.isPending || Boolean(attention.length || failedDeploy || criticalHealth);
  const showReview = Boolean(data?.capabilities.review && review.length);
  const showVisuals = Boolean(visuals.length || data?.errors.visualWork);
  const showActivity = home.isPending || Boolean(data?.activity.length || data?.errors.activity);
  const hasMoreWork = tasks.length > HOME_TASK_PREVIEW_LIMIT || Boolean(data && tasks.length > 0 && tasks.length >= data.limits.tasks);

  return <StoryHoverProvider fetchers={fetchers}><main className="@container/home mx-auto mt-6 mb-8 flex max-w-[1320px] flex-col gap-5 pr-5 pl-1">
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
    <div className="grid grid-cols-1 gap-5 @3xl/home:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl/home:items-start">
      <div className="flex min-w-0 flex-col gap-5" data-home-column="primary">
        <Surface title="Up Next" subtitle="Your assigned work, in order of urgency" action={fetchers.editorial ? <Button variant="ghost" size="sm" onClick={() => newTask()}><Plus data-icon="inline-start" aria-hidden="true" />Task</Button> : undefined}>
          <section ref={workRef} tabIndex={-1} aria-label="Assigned tasks" className="outline-none">
            {section("tasks", tasks.length ? <ItemGroup role="group" className="gap-0">{tasks.slice(0, HOME_TASK_PREVIEW_LIMIT).map(renderTask)}</ItemGroup> : null, "No open assignments.")}
            {hasMoreWork ? <div data-home-work-footer className="mt-1 flex items-center justify-between border-t px-1.5 pt-2"><Button variant="link" size="sm" onClick={() => setAllWorkOpen(true)}>View all work<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button><span className="text-xs text-muted-foreground">{tasks.length ? `${tasks.length} open` : ""}</span></div> : null}
          </section>
          {completionError ? <InlineAlert className="mx-1.5 mt-2 w-auto">{completionError}</InlineAlert> : null}
        </Surface>

        <Surface title="My Stories" action={actionUrls?.planning ? surfaceLink(`${actionUrls.planning}&mine=1`, "All my stories") : undefined}>
          {section("stories", stories.length ? <ItemGroup role="group" className="gap-0">{stories.slice(0, 6).map((story) => <StoryRow key={story.id} story={story} timezone={timezone} now={now} onOpen={() => openStory(story.id)} />)}</ItemGroup> : null, "No active stories assigned to you.")}
        </Surface>

        {showReview ? <Surface title="Ready for Review" action={<Badge variant="secondary">{review.length}</Badge>}>
          <ItemGroup role="group" className="gap-0">{review.slice(0, 5).map((story) => <ReviewRow key={story.id} storyId={story.id} title={story.title} detail={`${story.authors.map((a) => a.name).join(", ") || story.writer?.name || "Unassigned writer"} · Ready for review`} onOpen={() => openStory(story.id)} />)}</ItemGroup>
        </Surface> : null}
      </div>

      <div className="flex min-w-0 flex-col gap-5" data-home-column="secondary">
        <Surface title="Coming Up" action={actionUrls?.calendar ? surfaceLink(actionUrls.calendar, "Calendar") : undefined}>
          {section("stories", agenda.length ? <div className="flex flex-col gap-2">{Array.from(new Set(agenda.map((e) => e.day))).map((day) => <div key={day}><h3 className="px-3 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">{dateLabel(day, timezone, now)}</h3><ItemGroup role="group" className="gap-0">{agenda.filter((e) => e.day === day).map((event) => <AgendaItem key={event.id} event={event} timezone={timezone} onOpen={event.storyId ? () => openStory(event.storyId!) : undefined} />)}</ItemGroup></div>)}</div> : null, "Nothing scheduled in the next two weeks.")}
          {partial ? <p className="px-3 pt-2 text-xs text-muted-foreground">Some assignments could not be checked.</p> : null}
        </Surface>

        {showWaiting ? <Surface title="Waiting for Me">{home.isPending ? <RowSkeletons count={2} /> : <ItemGroup role="group" className="gap-0">{[
          ...attention.map((item) => <AttentionRow key={item.id} item={item} onOpen={() => item.storyId ? openStory(item.storyId) : workRef.current?.focus()} />),
          ...(failedDeploy && actionUrls?.deployment ? [attentionLink(actionUrls.deployment, "Website publication failed")] : []),
          ...(criticalHealth && actionUrls?.doctor ? [attentionLink(actionUrls.doctor, criticalHealth.label)] : [])
        ]}</ItemGroup>}</Surface> : null}

        {showVisuals ? <Surface title="Photo & Visual Work" action={actionUrls?.media ? surfaceLink(actionUrls.media, "Media Desk") : undefined}>
          {section("visualWork", visuals.length ? <ItemGroup role="group" className="gap-0">{visuals.slice(0, 5).map((media) => <MediaAssignmentRow key={`${media.story.id}-${media.id}`} media={media} timezone={timezone} now={now} onOpen={() => openStory(media.story.id)} />)}</ItemGroup> : null, "No visual assignments.")}
        </Surface> : null}
      </div>
    </div>
    {showActivity ? <Surface title="Recent Activity">{section("activity", data?.activity.length ? <ItemGroup role="group" className="gap-0">{data.activity.slice(0, 8).map((item) => <ActivityRow key={item.id} item={item} timezone={timezone} now={now} onOpen={item.storyId ? () => openStory(item.storyId!) : undefined} />)}</ItemGroup> : null, "No recent newsroom activity.")}</Surface> : null}
    <footer className="flex items-center justify-between text-xs text-muted-foreground"><span>{data ? `Dates shown in ${timezone.replace(/_/g, " ")}` : ""}</span><Button variant="link" size="xs" disabled={home.isFetching} onClick={() => void home.refetch()}>{home.isFetching ? "Refreshing…" : "Refresh"}</Button></footer>
    {health.isError || deployment.isError ? <p className="text-xs text-muted-foreground">Some system checks are unavailable. Your work is shown above.</p> : null}
    <span role="status" className="sr-only" aria-live="polite">{completedLabel}</span>
    <StoryPeek storyId={peekId} fetchers={fetchers} timezone={timezone} onClose={() => setPeekId(null)} origin={origin} onComplete={(task) => complete.mutate(task)} completing={complete.isPending} onNewTask={newTask} now={now} workspaceUrl={actionUrls?.workspace} />
    <HomeCommands open={commandOpen} onOpenChange={setCommandOpen} fetchers={fetchers} data={data} recentIds={recentIds} onStory={openStory} onNewStory={() => setCreateKind("story")} onNewTask={newTask} urls={actionUrls} />
    <HomeCreate kind={createKind} onClose={() => setCreateKind(null)} onStoryCreated={openCreatedStory} fetchers={fetchers} data={data} storyId={taskStoryId} />
    <Sheet open={allWorkOpen} onOpenChange={setAllWorkOpen}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader><SheetTitle>All my work</SheetTitle><SheetDescription>Your visible open assignments</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-4">{tasks.length ? <ItemGroup role="group" className="gap-0">{tasks.map(renderTask)}</ItemGroup> : <Quiet>No open assignments.</Quiet>}{data && tasks.length >= data.limits.tasks ? <p className="px-3 pt-3 text-xs text-muted-foreground">Showing the first {data.limits.tasks} assignments.</p> : null}</div>
      </SheetContent>
    </Sheet>
  </main></StoryHoverProvider>;
}
