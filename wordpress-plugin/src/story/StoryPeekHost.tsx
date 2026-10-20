import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ContributorEntry } from "../editorial/editorial-model";
import { StoryPeek } from "./StoryPeek";
import { TaskCreateDialog } from "./TaskCreateDialog";
import type { StoryFetchers } from "./story-fetchers";
import { workspaceKey } from "./story-query";
import { useCompleteTask } from "./use-complete-task";
import { StoryHoverProvider } from "./StoryHoverCard";

type StoryPeekApi = { openStory: (storyId: number) => void };
const StoryPeekContext = createContext<StoryPeekApi | null>(null);

/** Open Story Peek for a story from anywhere under a StoryPeekHost. */
export function useStoryPeek(): StoryPeekApi {
  const api = useContext(StoryPeekContext);
  if (!api) throw new Error("useStoryPeek needs a StoryPeekHost.");
  return api;
}

/**
 * Owns Story Peek for a collection screen: which story is open, where focus
 * returns, and the Add task dialog the Peek can raise. Every row, card and
 * calendar event only calls `openStory(id)`; there is one Peek.
 */
export function StoryPeekHost({ fetchers, workspaceUrl, children }: { fetchers: StoryFetchers; workspaceUrl?: (storyId: number) => string; children: ReactNode }) {
  const [peekId, setPeekId] = useState<number | null>(null);
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [taskStoryId, setTaskStoryId] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  const complete = useCompleteTask(fetchers);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  // `openStory` keeps one identity so libraries that capture it once (the calendar) never go stale.
  const open = useRef(false);
  open.current = peekId !== null;
  const openStory = useCallback((storyId: number) => {
    setOrigin((current) => (open.current ? current : document.activeElement instanceof HTMLElement ? document.activeElement : null));
    setPeekId(storyId);
  }, []);
  const api = useMemo(() => ({ openStory }), [openStory]);

  // The Peek already loaded this story's workspace; the task dialog reads the same cache entry.
  const taskStory = useQuery({ queryKey: workspaceKey(taskStoryId || 0), queryFn: () => fetchers.getWorkspace!(taskStoryId!), enabled: Boolean(taskStoryId && fetchers.getWorkspace) });
  const workspace = taskStory.data;
  const people: ContributorEntry[] = workspace?.people || [];

  return <StoryPeekContext value={api}>
    <StoryHoverProvider fetchers={fetchers} onOpenStory={openStory} workspaceUrl={workspaceUrl}>{children}</StoryHoverProvider>
    <StoryPeek storyId={peekId} fetchers={fetchers} onClose={() => setPeekId(null)} origin={origin} onComplete={(task) => complete.mutate(task)} completing={complete.isPending} onNewTask={setTaskStoryId} now={now} workspaceUrl={workspaceUrl} />
    <TaskCreateDialog open={taskStoryId !== null} onClose={() => setTaskStoryId(null)} fetchers={fetchers} stories={workspace ? [{ id: workspace.story.id, title: workspace.story.title }] : []} storyId={taskStoryId} people={people} currentUser={workspace?.currentUser} canAssign={Boolean(workspace?.capabilities.review)} timezone={workspace?.timezone || "UTC"} />
  </StoryPeekContext>;
}
