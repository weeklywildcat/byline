import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Search } from "lucide-react";
import { Toaster, toast } from "sonner";
import { describeEditorialError, setTaskCompletionState, type EditorialTask } from "../editorial/editorial-model";
import type { HomeFetchers } from "./home-api";
import { homeQueryClient, homeKey, peekKey, replaceHomeTask, replacePeekTask } from "./home-query";
import { HomePortalContext } from "./lib/portal";
import { dateLabel, homeAgenda, myActiveStories, myOpenTasks, reviewStories, waitingForMe, type HomeBootstrap, type HomePeek } from "./newsroom-model";
import { HomeCommands, type HomeActionUrls } from "./HomeCommands";
import { HomeCreate } from "./HomeCreate";
import { StoryPeek } from "./StoryPeek";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { TooltipProvider } from "./ui/tooltip";
import { ActivityRow, AgendaItem, AttentionRow, Empty, MediaAssignmentRow, RowSkeletons, StoryRow, Surface, TaskRow } from "./components/rows";

export type HomeAppProps = { fetchers: HomeFetchers; currentUserId?: number | null; actionUrls?: HomeActionUrls };

export function HomeApp(props: HomeAppProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return <QueryClientProvider client={homeQueryClient}><div className="byline-home-root" ref={setRoot}><HomePortalContext value={root}><TooltipProvider>{root ? <HomeWorkspace {...props} /> : null}<Toaster position="bottom-right" closeButton toastOptions={{ className: "home-toast" }} /></TooltipProvider></HomePortalContext></div></QueryClientProvider>;
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
  const complete = useMutation({
    mutationFn: (task: EditorialTask) => fetchers.editorial!.updateTask(task.id, { state: "completed" }),
    onMutate: async (task) => {
      setCompletionError("");
      await client.cancelQueries({ queryKey: homeKey });
      if (task.storyId) await client.cancelQueries({ queryKey: peekKey(task.storyId) });
      const focused = document.activeElement as HTMLElement | null;
      const container = focused?.closest(".home-surface, .home-peek-section, .home-all-work");
      const rows = container ? Array.from(container.querySelectorAll<HTMLElement>("[data-slot=checkbox]")) : [];
      const index = focused ? rows.indexOf(focused) : -1;
      const next = rows[index + 1] || rows[index - 1];
      const updated = setTaskCompletionState(task, "completed");
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, updated));
      if (task.storyId) client.setQueryData<HomePeek>(peekKey(task.storyId), (old) => replacePeekTask(old, updated));
      if (index >= 0) requestAnimationFrame(() => { if (next?.isConnected) next.focus(); else (container?.querySelector<HTMLElement>(".home-work-footer button, .home-peek-section header button") || workRef.current)?.focus(); });
    },
    onSuccess: (_updated, task) => setCompletedLabel(`Completed ${task.title}.`),
    onError: (error, task) => {
      client.setQueryData<HomeBootstrap>(homeKey, (old) => replaceHomeTask(old, task));
      if (task.storyId) client.setQueryData<HomePeek>(peekKey(task.storyId), (old) => replacePeekTask(old, task));
      const message = describeEditorialError(error, "Task couldn't be completed. Try again.");
      setCompletionError(message);
      toast.error(message);
    },
    onSettled: (_data, _error, task) => { void client.invalidateQueries({ queryKey: homeKey }); if (task.storyId) void client.invalidateQueries({ queryKey: peekKey(task.storyId) }); }
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
  const section = (key: keyof HomeBootstrap["errors"], content: ReactNode, empty: string) => home.isPending ? <RowSkeletons /> : home.isError ? <Empty>Work is temporarily unavailable.</Empty> : data?.errors[key] ? <p className="home-inline-error" role="alert">{data.errors[key]} <Button variant="link" onClick={() => void home.refetch()}>Try again</Button></p> : content || <Empty>{empty}</Empty>;
  const failedDeploy = deployment.data?.lifecycle === "failed";
  const criticalHealth = health.data?.checks?.find((check) => check.status === "critical");

  return <main className="home-workspace">
    <header className="home-page-heading"><div><h1>Today<span className="home-greeting">{data?.currentUser.name ? ` / ${data.currentUser.name.split(" ")[0]}` : ""}</span></h1><p>{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: timezone }).format(now)}</p></div><div className="home-header-actions"><Button variant="outline" className="home-search-trigger" onClick={() => setCommandOpen(true)}><Search size={15} /><span>Search</span><kbd>⌘K / Ctrl K</kbd></Button>{data?.capabilities.createStory ? <Button onClick={() => setCreateKind("story")}><Plus size={15} />New story</Button> : null}</div></header>
    {!fetchers.getHome ? <p className="home-inline-error">Story work is not available for this role.</p> : home.isError ? <div role="alert" className="home-inline-error home-load-error">{describeEditorialError(home.error, "Home couldn't be loaded. Try again.")} <Button variant="outline" onClick={() => void home.refetch()}>Try again</Button></div> : null}
    <div className="home-grid">
      <Surface title="Up Next" subtitle="Your assigned work, in order of urgency" className="home-up-next" action={fetchers.editorial ? <Button variant="ghost" size="sm" onClick={() => newTask()}><Plus size={13} />Task</Button> : undefined}>
        <section ref={workRef} tabIndex={-1} aria-label="Assigned tasks">{section("tasks", tasks.length ? <ul className="home-rows">{tasks.slice(0, 7).map(renderTask)}</ul> : null, "No open assignments.")}<footer className="home-work-footer"><Button variant="link" onClick={() => setAllWorkOpen(true)}>View all work<ArrowRight size={13} /></Button><span>{tasks.length ? `${tasks.length} open` : ""}</span></footer></section>
        {completionError ? <p role="alert" className="home-inline-error">{completionError}</p> : null}
      </Surface>
      <Surface title="Waiting for Me" className="home-waiting">{home.isPending ? <RowSkeletons count={2} /> : attention.length || failedDeploy || criticalHealth ? <ul className="home-rows">{attention.map((item) => <AttentionRow key={item.id} item={item} onOpen={() => item.storyId ? openStory(item.storyId) : workRef.current?.focus()} />)}{failedDeploy && actionUrls?.deployment ? <li><a className="home-service-attention" href={actionUrls.deployment}>Website publication failed<ArrowRight size={13} /></a></li> : null}{criticalHealth && actionUrls?.doctor ? <li><a className="home-service-attention" href={actionUrls.doctor}>{criticalHealth.label}<ArrowRight size={13} /></a></li> : null}</ul> : <Empty>{home.isError || data?.errors.tasks || data?.errors.stories || data?.errors.visualWork ? "Attention items couldn't be checked." : "You're caught up."}</Empty>}</Surface>
      <Surface title="Coming Up" className="home-coming-up" action={actionUrls?.calendar ? <a className="home-surface-link" href={actionUrls.calendar}>Calendar<ArrowRight size={12} /></a> : undefined}>{section("stories", agenda.length ? <div className="home-agenda">{Array.from(new Set(agenda.map((e) => e.day))).map((day) => <section key={day}><h3>{dateLabel(day, timezone, now)}</h3><ul className="home-rows">{agenda.filter((e) => e.day === day).map((event) => <AgendaItem key={event.id} event={event} timezone={timezone} onOpen={event.storyId ? () => openStory(event.storyId!) : undefined} />)}</ul></section>)}</div> : null, "Nothing scheduled in the next two weeks.")}{data?.errors.tasks || data?.errors.visualWork ? <p className="home-partial-note">Some assignments could not be checked.</p> : null}</Surface>
      <Surface title="My Stories" className="home-my-stories" action={actionUrls?.planning ? <a className="home-surface-link" href={`${actionUrls.planning}&mine=1`}>All my stories<ArrowRight size={12} /></a> : undefined}>{section("stories", stories.length ? <ul className="home-rows">{stories.slice(0, 6).map((story) => <StoryRow key={story.id} story={story} timezone={timezone} now={now} onOpen={() => openStory(story.id)} />)}</ul> : null, "No active stories assigned to you.")}</Surface>
      {data?.capabilities.review ? <Surface title="Ready for Review" className="home-review" action={<span className="home-section-count">{review.length}</span>}>{review.length ? <ul className="home-rows">{review.slice(0, 5).map((story) => <li key={story.id}><button type="button" className="home-story-row" onClick={() => openStory(story.id)}><span className="home-row-copy"><span className="home-row-title">{story.title}</span><span className="home-meta">{story.authors.map((a) => a.name).join(", ") || story.writer?.name || "Unassigned writer"} · Ready for review</span></span><ArrowRight size={14} className="home-row-arrow" /></button></li>)}</ul> : <Empty>{data.errors.stories ? "The review queue couldn't be checked." : "No stories waiting for review."}</Empty>}</Surface> : null}
      {data?.capabilities.review || visuals.length || data?.errors.visualWork ? <Surface title="Photo & Visual Work" className={`home-visuals ${!data?.capabilities.review ? "home-visuals-wide" : ""}`}>{section("visualWork", visuals.length ? <ul className="home-rows">{visuals.slice(0, 5).map((media) => <MediaAssignmentRow key={media.id} media={media} timezone={timezone} now={now} onOpen={() => openStory(media.story.id)} />)}</ul> : null, "No photo assignments.")}</Surface> : null}
      <Surface title="Recent Activity" className="home-activity">{section("activity", data?.activity.length ? <ul className="home-rows">{data.activity.slice(0, 10).map((item) => <ActivityRow key={item.id} item={item} timezone={timezone} onOpen={item.storyId ? () => openStory(item.storyId!) : undefined} />)}</ul> : null, "No recent newsroom activity.")}</Surface>
    </div>
    <footer className="home-page-footer"><span>{data ? `Dates shown in ${timezone.replace(/_/g, " ")}` : ""}</span><Button variant="link" disabled={home.isFetching} onClick={() => void home.refetch()}>{home.isFetching ? "Refreshing…" : "Refresh"}</Button></footer>
    {health.isError || deployment.isError ? <p className="home-partial-note">Some system checks are unavailable. Your work is shown above.</p> : null}
    <span role="status" className="sr-only" aria-live="polite">{completedLabel}</span>
    <StoryPeek storyId={peekId} fetchers={fetchers} timezone={timezone} onClose={() => setPeekId(null)} origin={origin} onComplete={(task) => complete.mutate(task)} completing={complete.isPending} onNewTask={newTask} now={now} />
    <HomeCommands open={commandOpen} onOpenChange={setCommandOpen} fetchers={fetchers} data={data} recentIds={recentIds} onStory={openStory} onNewStory={() => setCreateKind("story")} onNewTask={newTask} urls={actionUrls} />
    <HomeCreate kind={createKind} onClose={() => setCreateKind(null)} onStoryCreated={openStory} fetchers={fetchers} data={data} storyId={taskStoryId} />
    <Sheet open={allWorkOpen} onOpenChange={setAllWorkOpen}><SheetContent className="home-story-peek home-all-work"><SheetHeader><SheetTitle>All my work</SheetTitle><SheetDescription>Your visible open assignments</SheetDescription></SheetHeader><div className="home-peek-scroll">{tasks.length ? <ul className="home-rows">{tasks.map(renderTask)}</ul> : <Empty>No open assignments.</Empty>}{data && tasks.length >= data.limits.tasks ? <p className="home-partial-note">Showing the first {data.limits.tasks} assignments.</p> : null}</div></SheetContent></Sheet>
  </main>;
}
