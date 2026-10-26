import { collectionsKey } from "../collections/collection-api";
import { collectionUrl } from "../collections/collection-model";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, HeartPulse, ImagePlus, ListTodo, MessageSquareText, Plus } from "lucide-react";
import type { HomeFetchers } from "./home-api";
import type { HomeBootstrap } from "./newsroom-model";
import { activeStory } from "./newsroom-model";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { decodeEntities } from "../admin-ui/lib/text";
import { Kbd, KbdGroup } from "../admin-ui/ui/kbd";
import { Spinner } from "../admin-ui/ui/spinner";
import { CommandDialog, Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "../admin-ui/ui/command";
import { describeEditorialError } from "../editorial/editorial-model";

export type HomeActionUrls = { planning?: string; calendar?: string; media?: string; upload?: string; dashboard?: string; contentHealth?: string; feedback?: string; deployment?: string; doctor?: string; workspace?: (storyId: number) => string };

export function HomeCommands({ open, onOpenChange, fetchers, data, recentIds, onStory, onNewStory, onNewTask, urls }: { open: boolean; onOpenChange: (open: boolean) => void; fetchers: HomeFetchers; data?: HomeBootstrap; recentIds: number[]; onStory: (id: number) => void; onNewStory: () => void; onNewTask: () => void; urls?: HomeActionUrls }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 200); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => { if (!open) { setQuery(""); setDebounced(""); } }, [open]);
  const collections = useQuery({ queryKey: collectionsKey, queryFn: () => fetchers.collections!.list(), enabled: open && Boolean(fetchers.collections) });
  const matchingCollections = collections.data?.collections.filter((c) => !c.archived && (!query || c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).slice(0,6) || [];
  const search = useQuery({ queryKey: ["byline", "home-search", debounced], queryFn: () => fetchers.searchStories!(debounced), enabled: open && debounced.length >= 2 && Boolean(fetchers.searchStories) });
  const recent = [...(data?.stories || [])].filter(activeStory).sort((a, b) => {
    const ai = recentIds.indexOf(a.id), bi = recentIds.indexOf(b.id);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || (b.modifiedAt || "").localeCompare(a.modifiedAt || "");
  }).slice(0, 5);
  const choose = (action: () => void) => { onOpenChange(false); requestAnimationFrame(action); };
  const searching = query.trim().length >= 2;
  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Byline" description="Find a story or run a newsroom action."><Command shouldFilter={false}><CommandInput aria-label="Search stories and actions" placeholder="Find a story or action…" value={query} onValueChange={setQuery} /><CommandList>
    {searching ? <CommandGroup heading="Stories">{search.isFetching || debounced !== query.trim() ? <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground" role="status"><Spinner />Searching stories…</p> : search.isError ? <InlineAlert className="m-1 w-auto">{describeEditorialError(search.error, "Story search couldn't be loaded. Try again.")}</InlineAlert> : search.data?.stories.length ? search.data.stories.map((story) => <CommandItem key={story.id} value={`story-${story.id}`} onSelect={() => choose(() => onStory(story.id))}><FileText />{decodeEntities(story.title)}</CommandItem>) : <CommandEmpty>No matching stories.</CommandEmpty>}</CommandGroup> : <CommandGroup heading="Recent stories">{recent.map((story) => <CommandItem key={story.id} value={`recent-${story.id}`} onSelect={() => choose(() => onStory(story.id))}><FileText />{decodeEntities(story.title)}</CommandItem>)}{!recent.length ? <p className="px-2 py-3 text-sm text-muted-foreground">Type at least two characters to find a story.</p> : null}</CommandGroup>}
    {matchingCollections.length ? <CommandGroup heading="Collections">{matchingCollections.map((c) => <CommandItem key={c.id} value={`collection-${c.id}`} onSelect={() => choose(() => window.location.assign(collectionUrl(c.id)))}><FileText />{c.name}</CommandItem>)}</CommandGroup> : null}
    <CommandSeparator /><CommandGroup heading="Actions">
      {data?.capabilities.createStory && (!query || "new story".includes(query.toLowerCase())) ? <CommandItem value="new-story" onSelect={() => choose(onNewStory)}><Plus />New story</CommandItem> : null}
      {fetchers.editorial && (!query || "new task".includes(query.toLowerCase())) ? <CommandItem value="new-task" onSelect={() => choose(onNewTask)}><ListTodo />New task</CommandItem> : null}
      {data?.capabilities.uploadMedia && urls?.upload && (!query || "upload media".includes(query.toLowerCase())) ? <CommandItem value="upload-media" onSelect={() => { window.location.assign(urls.upload!); }}><ImagePlus />Upload media</CommandItem> : null}
      {urls?.planning && (!query || "open stories".includes(query.toLowerCase())) ? <CommandItem value="open-stories" onSelect={() => window.location.assign(urls.planning!)}><FileText />Open Stories</CommandItem> : null}
      {urls?.calendar && (!query || "open calendar".includes(query.toLowerCase())) ? <CommandItem value="open-calendar" onSelect={() => window.location.assign(urls.calendar!)}><CalendarDays />Open Calendar</CommandItem> : null}
      {urls?.media && (!query || "open media desk".includes(query.toLowerCase())) ? <CommandItem value="open-media" onSelect={() => window.location.assign(urls.media!)}><ImagePlus />Open Media Desk</CommandItem> : null}
      {urls?.feedback && (!query || "open feedback".includes(query.toLowerCase())) ? <CommandItem value="open-feedback" onSelect={() => window.location.assign(urls.feedback!)}><MessageSquareText />Open Feedback</CommandItem> : null}
      {urls?.contentHealth && (!query || "open content health".includes(query.toLowerCase())) ? <CommandItem value="open-content-health" onSelect={() => window.location.assign(urls.contentHealth!)}><HeartPulse />Open Content Health</CommandItem> : null}
    </CommandGroup>
  </CommandList><footer className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd></KbdGroup>navigate<Kbd>↵</Kbd>open</span><span className="flex items-center gap-1.5"><Kbd>Esc</Kbd>close</span></footer></Command></CommandDialog>;
}
