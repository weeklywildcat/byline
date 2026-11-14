"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useDebouncedValue } from "@byline/newsroom-ui/lib/hooks";
import { decodeEntities } from "@byline/newsroom-ui/lib/text";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarMenuSkeleton } from "@byline/newsroom-ui/ui/sidebar";
import type { PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import { describePlanningError, type PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import { usePlanningStories } from "@byline/newsroom-screens/planning/planning-query";
import type { BuiltInStoryView } from "@byline/newsroom-screens/planning/story-views";
import { workspaceKey } from "@byline/newsroom-screens/workspace/workspace-query";
import { usePreferences } from "@payloadcms/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown } from "lucide-react";
import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { createPayloadPlanningFetchers } from "../stories/payload-planning-fetchers";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { ShellLayer } from "./layer";
import { useShellLayout } from "./layout";
import { ShellLink } from "./navigation";
import { useStoryPreload } from "../story/preload";
import { STORY_SWITCHER_QUEUE_PREFERENCE } from "./shell-config";
import { pinnedCurrentStory, STORY_SWITCHER_DEFAULT_QUEUE, storySwitcherFilters, storySwitcherMeta, storySwitcherQueue, storySwitcherQueues, storySwitcherRows, type StorySwitcherQueueId } from "./story-switcher-model";

type StorySwitcher = {
  /** The chosen queue; null until the remembered one has been read. */
  queue: StorySwitcherQueueId | null;
  queues: BuiltInStoryView[];
  chooseQueue: (queue: StorySwitcherQueueId) => void;
  search: string;
  setSearch: (search: string) => void;
  fetchers: Pick<PlanningFetchers, "getPlanning">;
  homeFetchers: ReturnType<typeof createPayloadHomeFetchers>;
  preloadStory: (storyId: number) => void;
  /** Each presentation's list scroll position, kept while Payload remounts the sidebar on every navigation. */
  scrollTops: RefObject<Partial<Record<"sidebar" | "sheet", number>>>;
  /** The temporary presentation for screens too narrow for the Story workspace. */
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
};

const SwitcherContext = createContext<StorySwitcher | null>(null);

export function useStorySwitcher(): StorySwitcher {
  const value = use(SwitcherContext);
  if (!value) throw new Error("useStorySwitcher must be used inside the Byline shell.");
  return value;
}

/**
 * The Story switcher's one controller: the queue (remembered in Payload
 * Preferences), the search text, and the narrow-screen sheet. It lives in
 * the shell, so it survives moving from story to story; the Story
 * workspace's list and the sheet both render `StorySwitcherContent` from it.
 */
export function StorySwitcherProvider({ children }: { children: ReactNode }) {
  const account = useNewsroomAccount();
  const routes = useNewsroomRoutes();
  const { storyId } = useShellLayout();
  const { getPreference, setPreference } = usePreferences();
  const queues = useMemo(() => (account ? storySwitcherQueues(account.role) : []), [account?.role]);
  const [queue, setQueue] = useState<StorySwitcherQueueId | null>(null);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollTops = useRef<Partial<Record<"sidebar" | "sheet", number>>>({});
  const fetchers = useMemo(() => createPayloadPlanningFetchers(routes.api, { getPreference, setPreference }), [routes.api, getPreference, setPreference]);
  const storyUrl = useCallback((id: number) => `${routes.admin}/collections/stories/${id}`, [routes.admin]);
  const preloadStory = useStoryPreload(homeFetchers, storyUrl);

  // Read the remembered queue the first time a story is open; My stories if there is none.
  const needed = Boolean(account) && storyId !== null && queue === null;
  useEffect(() => {
    if (!needed) return undefined;
    let live = true;
    getPreference<unknown>(STORY_SWITCHER_QUEUE_PREFERENCE)
      .then((stored) => { if (live) setQueue(storySwitcherQueue(stored, queues)); })
      .catch(() => { if (live) setQueue(STORY_SWITCHER_DEFAULT_QUEUE); });
    return () => { live = false; };
  }, [needed, getPreference, queues]);

  // Leaving the Story screen closes its sheet.
  useEffect(() => { if (storyId === null) setSheetOpen(false); }, [storyId]);

  const chooseQueue = useCallback((next: StorySwitcherQueueId) => {
    setQueue(next);
    void setPreference(STORY_SWITCHER_QUEUE_PREFERENCE, next).catch(() => undefined);
  }, [setPreference]);

  const value = useMemo<StorySwitcher>(() => ({
    queue,
    queues,
    chooseQueue,
    search,
    setSearch,
    fetchers,
    homeFetchers,
    preloadStory,
    scrollTops,
    sheetOpen,
    openSheet: () => setSheetOpen(true),
    closeSheet: () => setSheetOpen(false)
  }), [queue, queues, chooseQueue, search, fetchers, homeFetchers, preloadStory, sheetOpen]);

  return (
    <SwitcherContext value={value}>
      {children}
      {account ? (
        <ShellLayer active={sheetOpen}>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right" className="w-[22rem] max-w-[calc(100vw-2.5rem)] gap-0 bg-sidebar p-0 text-sidebar-foreground data-[side=right]:sm:max-w-[22rem]" data-byline-story-sheet="">
              <StorySwitcherContent
                variant="sheet"
                title={<SheetTitle className="text-base font-medium text-foreground">Stories</SheetTitle>}
                description={<SheetDescription className="sr-only">Switch to another story.</SheetDescription>}
                onNavigate={() => setSheetOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </ShellLayer>
      ) : null}
    </SwitcherContext>
  );
}

/**
 * The Story switcher: shadcn sidebar-09's mail-list pane, adapted to stories.
 * A title with the way back to the full Stories screen, the queue, a search
 * box (Planning's own `query` filter, scoped to the queue; ⌘K stays the
 * global search), then compact rows that open each story's Story screen.
 * Rendered by the Story workspace's sidebar and by the narrow-screen sheet.
 */
export function StorySwitcherContent({ variant = "sidebar", title, description, onNavigate }: { variant?: "sidebar" | "sheet"; title?: ReactNode; description?: ReactNode; onNavigate?: () => void }) {
  const { queue, queues, chooseQueue, search, setSearch, scrollTops } = useStorySwitcher();
  const routes = useNewsroomRoutes();
  const scroller = useRef<HTMLDivElement>(null);
  const label = queues.find((item) => item.id === queue)?.label ?? "My stories";

  return (
    <div className="flex h-full min-h-0 w-full flex-col" data-byline-story-switcher={variant}>
      <SidebarHeader className={cn("gap-3 border-b border-sidebar-border p-4", variant === "sheet" && "pr-12")}>
        <div className="flex w-full items-center justify-between gap-2">
          {title ?? <div className="text-base font-medium text-foreground">Stories</div>}
          <ShellLink href={`${routes.admin}/stories`} onClick={onNavigate} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-mr-2 text-muted-foreground")}>
            All stories
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </ShellLink>
        </div>
        {description}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="w-full justify-between bg-background font-normal" aria-label={`Story queue: ${label}`} disabled={queue === null} />}>
            <span className="truncate">{label}</span>
            <ChevronDown data-icon="inline-end" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-48">
            <DropdownMenuRadioGroup value={queue ?? ""} onValueChange={(next) => chooseQueue(next as StorySwitcherQueueId)}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Show</DropdownMenuLabel>
                {queues.map((item) => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.label}</DropdownMenuRadioItem>)}
              </DropdownMenuGroup>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <SidebarInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stories..." aria-label="Search stories" autoComplete="off" />
      </SidebarHeader>
      <SidebarContent ref={scroller} onScroll={(event) => { scrollTops.current[variant] = event.currentTarget.scrollTop; }}>
        {queue === null ? <SwitcherSkeleton /> : <StorySwitcherResults queue={queue} queueLabel={label} onNavigate={onNavigate} scroller={scroller} variant={variant} />}
      </SidebarContent>
    </div>
  );
}

function StorySwitcherResults({ queue, queueLabel, onNavigate, scroller, variant }: { queue: StorySwitcherQueueId; queueLabel: string; onNavigate?: () => void; scroller: RefObject<HTMLDivElement | null>; variant: "sidebar" | "sheet" }) {
  const { search, fetchers, homeFetchers, preloadStory, scrollTops } = useStorySwitcher();
  const account = useNewsroomAccount();
  const routes = useNewsroomRoutes();
  const { storyId } = useShellLayout();
  // The same debounce as the Stories screen's search.
  const query = useDebouncedValue(search, 200);
  const applied = useMemo(() => storySwitcherFilters(queue, query), [queue, query]);
  const planning = usePlanningStories(fetchers as PlanningFetchers, applied);
  const data = planning.data;
  const timezone = data?.timezone || "UTC";
  const userId = account ? Number(account.id) : (data?.currentUser?.id ?? null);
  const rows = useMemo(() => storySwitcherRows(data?.stories ?? [], applied, userId), [data, applied, userId]);
  const listed = rows.some((story) => story.id === storyId);

  // The open story stays in view even when the queue leaves it out, from the
  // workspace the Story screen already loaded (the same cache, so no new request).
  const homeFetchers = useMemo(() => createPayloadHomeFetchers(routes.api), [routes.api]);
  const workspace = useQuery({
    queryKey: workspaceKey(storyId ?? 0),
    queryFn: () => homeFetchers.workspace!.getWorkspace(storyId!),
    enabled: storyId !== null && Boolean(data) && !listed,
    retry: false
  });
  const current = storyId !== null && workspace.data?.story.id === storyId ? { ...workspace.data.story, title: decodeEntities(workspace.data.story.title) } : null;
  const pinned = data ? pinnedCurrentStory(rows, current) : null;

  // Back where the reader left the list, with the open story in view.
  const loaded = Boolean(data);
  useLayoutEffect(() => {
    const list = scroller.current;
    if (!list || !loaded) return;
    list.scrollTop = scrollTops.current[variant] ?? 0;
    list.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [loaded, storyId, scroller, scrollTops, variant]);

  if (planning.isPending && !data) return <SwitcherSkeleton />;
  if (planning.isError && !data) return <div className="p-4"><InlineAlert onAction={() => void planning.refetch()}>{describePlanningError(planning.error, "Stories are unavailable right now.")}</InlineAlert></div>;

  const empty = query.trim() ? `No stories in ${queueLabel} match “${query.trim()}”.` : `No stories in ${queueLabel}.`;
  return (
    <>
      {pinned ? (
        <SidebarGroup className="px-0 py-0">
          <SidebarGroupLabel className="h-auto px-4 pt-3 pb-1">Current story</SidebarGroupLabel>
          <SidebarGroupContent>
            <StorySwitcherRow story={pinned} current timezone={timezone} href={routes.story(pinned.id)} onNavigate={onNavigate} onPrefetch={() => preloadStory(pinned.id)} />
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      <SidebarGroup className="px-0 py-0">
        {pinned ? <SidebarGroupLabel className="h-auto border-t border-sidebar-border px-4 pt-3 pb-1">{queueLabel}</SidebarGroupLabel> : null}
        <SidebarGroupContent>
          {rows.length ? (
            <ul className="flex flex-col" aria-label={queueLabel}>
              {rows.map((story) => <li key={story.id}><StorySwitcherRow story={story} current={story.id === storyId} timezone={timezone} href={routes.story(story.id)} onNavigate={onNavigate} onPrefetch={() => preloadStory(story.id)} /></li>)}
            </ul>
          ) : <p className="p-4 text-sm text-muted-foreground">{empty}</p>}
        </SidebarGroupContent>
      </SidebarGroup>
      <p role="status" aria-live="polite" className="sr-only">{`${rows.length} ${rows.length === 1 ? "story" : "stories"} in ${queueLabel}.`}</p>
    </>
  );
}

/** One story: its headline and one line of context. Choosing it opens its Story screen. */
export function StorySwitcherRow({ story, current, timezone, href, onNavigate, onPrefetch }: { story: PlanningStory; current: boolean; timezone: string; href: string; onNavigate?: () => void; onPrefetch?: () => void }) {
  const meta = storySwitcherMeta(story, timezone);
  return (
    <ShellLink
      href={href}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
      onPrefetchIntent={onPrefetch}
      data-story-id={story.id}
      className="flex flex-col items-start gap-1 border-b border-sidebar-border px-4 py-3 text-sm leading-tight text-sidebar-foreground outline-hidden ring-sidebar-ring ring-inset hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:shadow-[inset_2px_0_0_var(--sidebar-primary)]"
    >
      <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{story.title.trim() || "Untitled story"}</span>
      {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
    </ShellLink>
  );
}

function SwitcherSkeleton() {
  return (
    <div role="status" aria-label="Loading stories" className="flex flex-col gap-1 p-2">
      {Array.from({ length: 6 }, (_, index) => <SidebarMenuSkeleton key={index} className="h-12" />)}
    </div>
  );
}
