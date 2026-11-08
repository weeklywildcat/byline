import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { HomeCommands, type HomeActionUrls, type CommandAction } from "@byline/newsroom-screens/home/HomeCommands";
import type { HomeFetchers } from "@byline/newsroom-screens/home/home-api";
import { homeKey } from "@byline/newsroom-screens/home/home-query";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Kbd, KbdGroup } from "@byline/newsroom-ui/ui/kbd";

export type PlanningUrls = { stories?: string; calendar?: string; media?: string; contentHealth?: string; feedback?: string };

export function newsroomSearchUrls(planning: PlanningUrls | undefined): HomeActionUrls {
  return { planning: planning?.stories, calendar: planning?.calendar, media: planning?.media, contentHealth: planning?.contentHealth, feedback: planning?.feedback };
}

export function WordPressNewsroomSearch({ fetchers, urls, onStory, onNewStory, actions }: {
  fetchers: HomeFetchers;
  urls: HomeActionUrls;
  onStory: (storyId: number) => void;
  onNewStory?: () => void;
  actions?: CommandAction[];
}) {
  const [open, setOpen] = useState(false);
  const home = useQuery({ queryKey: homeKey, queryFn: () => fetchers.getHome!(), enabled: open && Boolean(fetchers.getHome) });

  useEffect(() => {
    if (!fetchers.searchStories) return;
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [fetchers.searchStories]);

  if (!fetchers.searchStories) return null;
  const modifier = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
  return <>
    <Button variant="outline" aria-label="Search newsroom" aria-keyshortcuts="Control+K Meta+K" onClick={() => setOpen(true)}>
      <Search data-icon="inline-start" aria-hidden="true" />Search
      <KbdGroup aria-hidden="true" className="ml-1.5 max-md:hidden"><Kbd>{modifier}</Kbd><Kbd>K</Kbd></KbdGroup>
    </Button>
    <HomeCommands open={open} onOpenChange={setOpen} fetchers={fetchers} data={home.data} recentIds={[]} onStory={onStory} onNewStory={onNewStory} urls={{ ...urls, upload: home.data?.capabilities.uploadMedia ? "media-new.php" : undefined }} actions={actions} />
  </>;
}
