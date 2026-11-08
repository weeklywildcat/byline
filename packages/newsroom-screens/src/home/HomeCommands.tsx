import { collectionListKey } from "../collections/collection-api";
import { useCollectionLinks } from "../collections/collection-links";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, HeartPulse, ImagePlus, Image, UserRound, Library, ListTodo, MessageSquareText, Plus } from "lucide-react";
import { collectionStatuses, collectionTypes } from "../collections/collection-model";
import type { HomeFetchers } from "./home-api";
import type { HomeBootstrap } from "./newsroom-model";
import { activeStory } from "./newsroom-model";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { decodeEntities } from "@byline/newsroom-ui/lib/text";
import { Kbd, KbdGroup } from "@byline/newsroom-ui/ui/kbd";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { CommandDialog, Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@byline/newsroom-ui/ui/command";
import { describeEditorialError } from "../editorial/editorial-model";

export type HomeActionUrls = { planning?: string; calendar?: string; media?: string; upload?: string; dashboard?: string; contentHealth?: string; feedback?: string; deployment?: string; doctor?: string; workspace?: (storyId: number) => string };

type SearchEntry = { id: number; title: string; detail?: string };
type ExtraSearch = { people: SearchEntry[]; media: SearchEntry[] };
export type CommandAction = { id: string; label: string; icon: typeof FileText; run: () => void };
type CommandsExtension = { search: (query: string) => Promise<ExtraSearch>; onPerson: (id: number) => void; onMedia: (id: number) => void; actions: CommandAction[] };

export function HomeCommands({ open, onOpenChange, fetchers, data, recentIds, onStory, onNewStory, onNewTask, urls, actions = [], extension }: { open: boolean; onOpenChange: (open: boolean) => void; fetchers: HomeFetchers; data?: HomeBootstrap; recentIds: number[]; onStory: (id: number) => void; onNewStory?: () => void; onNewTask?: () => void; urls?: HomeActionUrls; actions?: CommandAction[]; extension?: CommandsExtension }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 200); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => { if (!open) { setQuery(""); setDebounced(""); } }, [open]);
  // Collections by name only (never a brief, a contact or a resource address), from the host's own list.
  const links = useCollectionLinks();
  const collectionQuery = { view: "active" as const, search: debounced, limit: 6 };
  const collections = useQuery({ queryKey: collectionListKey(collectionQuery), queryFn: () => fetchers.collections!.list(collectionQuery), enabled: open && Boolean(fetchers.collections) && Boolean(links.open || links.href) && (!extension || debounced.length >= 2) });
  const matchingCollections = (!extension || (debounced.length >= 2 && debounced === query.trim()) ? collections.data?.collections.slice(0, 6) : []) || [];
  const openCollection = (id: number) => (links.open ? links.open(id) : links.href ? window.location.assign(links.href(id)) : undefined);
  const search = useQuery({ queryKey: ["byline", "home-search", debounced], queryFn: () => fetchers.searchStories!(debounced), enabled: open && debounced.length >= 2 && Boolean(fetchers.searchStories) });
  const extras = useQuery({ queryKey: ["byline", "command-search", debounced], queryFn: () => extension!.search(debounced), enabled: open && debounced.length >= 2 && Boolean(extension) });
  const recent = [...(data?.stories || [])].filter(activeStory).sort((a, b) => {
    const ai = recentIds.indexOf(a.id), bi = recentIds.indexOf(b.id);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || (b.modifiedAt || "").localeCompare(a.modifiedAt || "");
  }).slice(0, 5);
  const choose = (action: () => void) => { onOpenChange(false); requestAnimationFrame(action); };
  const searching = query.trim().length >= 2;
  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Byline" description={extension ? "Find newsroom work, people and files, or run an action." : "Find a story or run a newsroom action."}><Command shouldFilter={false}><CommandInput aria-label={extension ? "Search the newsroom" : "Search stories and actions"} placeholder={extension ? "Search the newsroom…" : "Find a story or action…"} value={query} onValueChange={setQuery} /><CommandList>
    {searching ? <CommandGroup heading="Stories">{search.isFetching || debounced !== query.trim() ? <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground" role="status"><Spinner />Searching stories…</p> : search.isError ? <InlineAlert className="m-1 w-auto">{describeEditorialError(search.error, "Story search couldn't be loaded. Try again.")}</InlineAlert> : search.data?.stories.length ? search.data.stories.map((story) => <CommandItem key={story.id} value={`story-${story.id}`} onSelect={() => choose(() => onStory(story.id))}><FileText /><SearchLabel entry={story} /></CommandItem>) : extension ? <p className="px-2 py-1 text-xs text-muted-foreground">No matching stories.</p> : <CommandEmpty>No matching stories.</CommandEmpty>}</CommandGroup> : <CommandGroup heading="Recent stories">{recent.map((story) => <CommandItem key={story.id} value={`recent-${story.id}`} onSelect={() => choose(() => onStory(story.id))}><FileText />{decodeEntities(story.title)}</CommandItem>)}{!recent.length ? <p className="px-2 py-3 text-sm text-muted-foreground">Type at least two characters to find a story.</p> : null}</CommandGroup>}
    {matchingCollections.length ? <CommandGroup heading="Collections">{matchingCollections.map((c) => <CommandItem key={c.id} value={`collection-${c.id}`} onSelect={() => choose(() => openCollection(c.id))}><Library /><span className="flex min-w-0 flex-col"><span className="truncate">{c.name}</span><span className="text-xs text-muted-foreground">{collectionTypes[c.type]} · {collectionStatuses[c.status]}</span></span></CommandItem>)}</CommandGroup> : null}
    {extension && searching && query.trim() === debounced ? <>
      {extras.isError ? <InlineAlert className="m-1 w-auto">People and Media search could not be loaded.</InlineAlert> : null}
      {extras.data?.people.length ? <CommandGroup heading="People">{extras.data.people.map((person) => <CommandItem key={person.id} value={`person-${person.id}`} onSelect={() => choose(() => extension.onPerson(person.id))}><UserRound /><SearchLabel entry={person} /></CommandItem>)}</CommandGroup> : null}
      {extras.data?.media.length ? <CommandGroup heading="Media">{extras.data.media.map((media) => <CommandItem key={media.id} value={`media-${media.id}`} onSelect={() => choose(() => extension.onMedia(media.id))}><Image /><SearchLabel entry={media} /></CommandItem>)}</CommandGroup> : null}
    </> : null}
    <CommandSeparator /><CommandGroup heading="Actions">
      {[...actions, ...(extension?.actions ?? [])].filter((action) => !query || action.label.toLowerCase().includes(query.trim().toLowerCase())).map(({ id, label, icon: Icon, run }) => <CommandItem key={id} value={id} onSelect={() => choose(run)}><Icon />{label}</CommandItem>)}
      {onNewStory && data?.capabilities.createStory && (!query || "new story".includes(query.toLowerCase())) ? <CommandItem value="new-story" onSelect={() => choose(onNewStory)}><Plus />New story</CommandItem> : null}
      {onNewTask && fetchers.editorial && (!query || "new task".includes(query.toLowerCase())) ? <CommandItem value="new-task" onSelect={() => choose(onNewTask)}><ListTodo />New task</CommandItem> : null}
      {data?.capabilities.uploadMedia && urls?.upload && (!query || "upload media".includes(query.toLowerCase())) ? <CommandItem value="upload-media" onSelect={() => { window.location.assign(urls.upload!); }}><ImagePlus />Upload media</CommandItem> : null}
      {urls?.planning && (!query || "open stories".includes(query.toLowerCase())) ? <CommandItem value="open-stories" onSelect={() => window.location.assign(urls.planning!)}><FileText />Open Stories</CommandItem> : null}
      {urls?.calendar && (!query || "open calendar".includes(query.toLowerCase())) ? <CommandItem value="open-calendar" onSelect={() => window.location.assign(urls.calendar!)}><CalendarDays />Open Calendar</CommandItem> : null}
      {urls?.media && (!query || "open media desk".includes(query.toLowerCase())) ? <CommandItem value="open-media" onSelect={() => window.location.assign(urls.media!)}><ImagePlus />Open Media Desk</CommandItem> : null}
      {urls?.feedback && (!query || "open feedback".includes(query.toLowerCase())) ? <CommandItem value="open-feedback" onSelect={() => window.location.assign(urls.feedback!)}><MessageSquareText />Open Feedback</CommandItem> : null}
      {urls?.contentHealth && (!query || "open content health".includes(query.toLowerCase())) ? <CommandItem value="open-content-health" onSelect={() => window.location.assign(urls.contentHealth!)}><HeartPulse />Open Content Health</CommandItem> : null}
    </CommandGroup>
  </CommandList><footer className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd></KbdGroup>navigate<Kbd>↵</Kbd>open</span><span className="flex items-center gap-1.5"><Kbd>Esc</Kbd>close</span></footer></Command></CommandDialog>;
}

function SearchLabel({ entry }: { entry: SearchEntry }) {
  return <span className="flex min-w-0 flex-col">
    <span className="truncate">{decodeEntities(entry.title)}</span>
    {entry.detail ? <span className="truncate text-xs text-muted-foreground">{entry.detail}</span> : null}
  </span>;
}
