import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, HeartPulse, ImagePlus, MessageSquareText, Search, UsersRound } from "lucide-react";
import { describeEditorialError } from "../editorial/editorial-model";
import { decodeEntities } from "../admin-ui/lib/text";
import { Button } from "../admin-ui/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../admin-ui/ui/command";
import { Kbd, KbdGroup } from "../admin-ui/ui/kbd";
import { Spinner } from "../admin-ui/ui/spinner";
import { InlineAlert } from "../admin-ui/components/inline-alert";

export type StorySearchResult = { id: number; title: string };

export type NewsroomCommandUrls = {
  stories?: string;
  calendar?: string;
  media?: string;
  coverage?: string;
  performance?: string;
  feedback?: string;
  contentHealth?: string;
  upload?: string;
};

export type NewsroomCommandAction = {
  id: string;
  label: string;
  keywords?: string;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export function NewsroomSearchButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return <Button variant="outline" size={compact ? "sm" : "default"} onClick={onClick} aria-keyshortcuts="Control+K Meta+K">
    <Search data-icon="inline-start" aria-hidden="true" />
    <span className={compact ? "max-sm:hidden" : undefined}>Search</span>
    <KbdGroup className="ml-1.5 max-md:hidden"><Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd></KbdGroup>
  </Button>;
}

function matches(query: string, text: string) {
  const needle = query.trim().toLowerCase();
  return !needle || text.toLowerCase().includes(needle);
}

function destinationActions(urls: NewsroomCommandUrls): NewsroomCommandAction[] {
  return [
    urls.stories ? { id: "stories", label: "Open Stories", keywords: "planning board list stories", icon: <FileText />, href: urls.stories } : null,
    urls.calendar ? { id: "calendar", label: "Open Calendar", keywords: "schedule dates deadlines calendar", icon: <CalendarDays />, href: urls.calendar } : null,
    urls.media ? { id: "media", label: "Open Media Desk", keywords: "photos visuals production media", icon: <ImagePlus />, href: urls.media } : null,
    urls.coverage ? { id: "coverage", label: "Open Coverage", keywords: "events assignments coverage", icon: <UsersRound />, href: urls.coverage } : null,
    urls.feedback ? { id: "feedback", label: "Open Feedback", keywords: "reader corrections feedback", icon: <MessageSquareText />, href: urls.feedback } : null,
    urls.contentHealth ? { id: "content-health", label: "Open Content Health", keywords: "health errors warnings content", icon: <HeartPulse />, href: urls.contentHealth } : null,
    urls.performance ? { id: "performance", label: "Open Performance", keywords: "analytics performance metrics", icon: <HeartPulse />, href: urls.performance } : null,
    urls.upload ? { id: "upload", label: "Upload media", keywords: "upload image photo media", icon: <ImagePlus />, href: urls.upload } : null
  ].filter((action): action is NewsroomCommandAction => Boolean(action));
}

export function NewsroomCommands({
  open,
  onOpenChange,
  searchStories,
  onStory,
  urls = {},
  actions = []
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchStories?: (query: string) => Promise<{ stories: StorySearchResult[] }>;
  onStory: (storyId: number) => void;
  urls?: NewsroomCommandUrls;
  actions?: NewsroomCommandAction[];
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
    }
  }, [open]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [open, onOpenChange]);

  const search = useQuery({
    queryKey: ["byline", "newsroom-command-search", debounced],
    queryFn: () => searchStories!(debounced),
    enabled: open && debounced.length >= 2 && Boolean(searchStories),
    staleTime: 30_000
  });

  const allActions = useMemo(() => [...actions, ...destinationActions(urls)], [actions, urls]);
  const visibleActions = allActions.filter((action) => matches(query, `${action.label} ${action.keywords || ""}`));
  const searching = query.trim().length >= 2;

  const choose = (action: () => void) => {
    onOpenChange(false);
    requestAnimationFrame(action);
  };

  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Byline" description="Find a story or go anywhere in the newsroom.">
    <Command shouldFilter={false}>
      <CommandInput aria-label="Search stories and actions" placeholder="Find a story or action…" value={query} onValueChange={setQuery} />
      <CommandList>
        {searching ? <CommandGroup heading="Stories">
          {search.isFetching || debounced !== query.trim()
            ? <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground" role="status"><Spinner />Searching stories…</p>
            : search.isError
              ? <InlineAlert className="m-1 w-auto">{describeEditorialError(search.error, "Story search couldn't be loaded. Try again.")}</InlineAlert>
              : search.data?.stories.length
                ? search.data.stories.map((story) => <CommandItem key={story.id} value={`story-${story.id}`} onSelect={() => choose(() => onStory(story.id))}><FileText />{decodeEntities(story.title)}</CommandItem>)
                : <CommandEmpty>No matching stories.</CommandEmpty>}
        </CommandGroup> : null}
        {visibleActions.length ? <>
          {searching ? <CommandSeparator /> : null}
          <CommandGroup heading="Actions">
            {visibleActions.map((action) => <CommandItem key={action.id} value={action.id} onSelect={() => choose(() => {
              if (action.onSelect) action.onSelect();
              else if (action.href) window.location.assign(action.href);
            })}>{action.icon}{action.label}</CommandItem>)}
          </CommandGroup>
        </> : null}
        {!searching && !visibleActions.length ? <CommandEmpty>Type to find a story or action.</CommandEmpty> : null}
      </CommandList>
      <footer className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd></KbdGroup>navigate<Kbd>↵</Kbd>open</span>
        <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd>close</span>
      </footer>
    </Command>
  </CommandDialog>;
}
