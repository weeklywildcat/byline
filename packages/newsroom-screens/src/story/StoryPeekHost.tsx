import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StoryPeek } from "@byline/newsroom-screens/story/StoryPeek";
import type { StoryFetchers } from "@byline/newsroom-screens/story/story-fetchers";
import { StoryHoverProvider } from "@byline/newsroom-screens/story/StoryHoverCard";

type StoryPeekApi = { openStory: (storyId: number) => void };
const StoryPeekContext = createContext<StoryPeekApi | null>(null);

/** Open Story Peek for a story from anywhere under a StoryPeekHost. */
export function useStoryPeek(): StoryPeekApi {
  const api = useContext(StoryPeekContext);
  if (!api) throw new Error("useStoryPeek needs a StoryPeekHost.");
  return api;
}

/**
 * Owns Story Peek for a collection screen: which story is open and where
 * focus returns. Every row, card and calendar event only calls
 * `openStory(id)`; there is one Peek.
 */
export function StoryPeekHost({ fetchers, workspaceUrl, children }: { fetchers: StoryFetchers; workspaceUrl?: (storyId: number) => string; children: ReactNode }) {
  const [peekId, setPeekId] = useState<number | null>(null);
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  // `openStory` keeps one identity so libraries that capture it once (the calendar) never go stale.
  const open = useRef(false);
  open.current = peekId !== null;
  const openStory = useCallback((storyId: number) => {
    setOrigin((current) => (open.current ? current : document.activeElement instanceof HTMLElement ? document.activeElement : null));
    setPeekId(storyId);
  }, []);
  const api = useMemo(() => ({ openStory }), [openStory]);

  return <StoryPeekContext value={api}>
    <StoryHoverProvider fetchers={fetchers}>{children}</StoryHoverProvider>
    <StoryPeek storyId={peekId} fetchers={fetchers} onClose={() => setPeekId(null)} origin={origin} now={now} workspaceUrl={workspaceUrl} />
  </StoryPeekContext>;
}
