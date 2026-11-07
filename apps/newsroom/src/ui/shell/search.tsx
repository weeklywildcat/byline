"use client";

import { HomeCommands } from "@byline/newsroom-screens/home/HomeCommands";
import { homeKey } from "@byline/newsroom-screens/home/home-query";
import { CalendarDays, FileText, HeartPulse, ImagePlus, Library, Settings, UserRound } from "lucide-react";
import type { commandSearch } from "../../newsroom/command-search";
import { createBylineRequest } from "../home/payload-fetchers";
import { useQuery } from "@tanstack/react-query";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { useBylineCreate } from "./create";
import { ShellLayer } from "./layer";
import { useShellNavigation } from "./navigation";

type StoryOpener = (storyId: number) => void;

type BylineSearch = {
  openSearch: () => void;
  /** A screen that can show a story in place (Home's Story Peek) registers here while mounted. */
  setStoryOpener: (open: StoryOpener | null) => void;
};

const SearchContext = createContext<BylineSearch>({ openSearch: () => {}, setStoryOpener: () => {} });

export const useBylineSearch = () => use(SearchContext);

/**
 * The newsroom's command palette, everywhere: ⌘K / Ctrl-K or the header's
 * Search. It is the shared `HomeCommands` (story search, recent stories and
 * newsroom actions); its Create actions go through the Create controller. A
 * chosen story opens in the current screen's Story Peek when it has one
 * (Home), otherwise on its Story screen, through the shell's guarded
 * navigation.
 */
export function BylineSearchProvider({ children }: { children: ReactNode }) {
  const account = useNewsroomAccount();
  const routes = useNewsroomRoutes();
  const { actions, openCreate, creating } = useBylineCreate();
  const { navigate } = useShellNavigation();
  const fetchers = useMemo(() => createPayloadHomeFetchers(routes.api), [routes.api]);
  const [open, setOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const opener = useRef<StoryOpener | null>(null);
  const home = useQuery({ queryKey: homeKey, queryFn: () => fetchers.getHome!(), enabled: open && Boolean(account) });

  useEffect(() => {
    if (!account) return undefined;
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        if (!creating) setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [account, creating]);

  const setStoryOpener = useCallback((next: StoryOpener | null) => { opener.current = next; }, []);
  const value = useMemo<BylineSearch>(() => ({ openSearch: () => setOpen(true), setStoryOpener }), [setStoryOpener]);
  const openStory = (id: number) => {
    setRecentIds((ids) => [id, ...ids.filter((item) => item !== id)].slice(0, 8));
    if (opener.current) opener.current(id);
    else navigate(routes.story(id));
  };

  const commandActions = [
    ...(actions.some((action) => action.kind === "media") ? [{ id: "upload-media", label: "Upload media", icon: ImagePlus, run: () => openCreate("media") }] : []),
    ...(actions.some((action) => action.kind === "collection") ? [{ id: "new-collection", label: "New collection", icon: Library, run: () => openCreate("collection") }] : []),
    { id: "open-stories", label: "Open Stories", icon: FileText, run: () => navigate(`${routes.admin}/stories`) },
    { id: "open-calendar", label: "Open Calendar", icon: CalendarDays, run: () => navigate(`${routes.admin}/calendar`) },
    { id: "open-media", label: "Open Media", icon: ImagePlus, run: () => navigate(`${routes.admin}/media`) },
    ...(account?.role !== "staff" ? [{ id: "open-people", label: "Open People", icon: UserRound, run: () => navigate(`${routes.admin}/people`) }, { id: "open-health", label: "Open Content Health", icon: HeartPulse, run: () => navigate(`${routes.admin}/content-health`) }] : []),
    ...(account?.role === "administrator" ? [{ id: "open-site", label: "Open Site", icon: Settings, run: () => navigate(`${routes.admin}/site`) }, { id: "open-access", label: "Open newsroom access", icon: UserRound, run: () => navigate(`${routes.admin}/people?tab=access`) }, { id: "open-system", label: "System administration", icon: Settings, run: () => navigate(`${routes.admin}/system`) }] : [])
  ];
  return (
    <SearchContext value={value}>
      {children}
      {account ? (
        <ShellLayer active={open}>
          <HomeCommands open={open} onOpenChange={setOpen} fetchers={fetchers} data={home.data} recentIds={recentIds} onStory={openStory} onNewStory={() => openCreate("story")} onNewTask={() => openCreate("task")} extension={{
            search: (query) => createBylineRequest(routes.api)<Awaited<ReturnType<typeof commandSearch>>>(`/command-search?query=${encodeURIComponent(query)}`),
            onPerson: (id) => navigate(`${routes.admin}/people?person=${id}`),
            onMedia: (id) => navigate(`${routes.admin}/media?asset=${id}`),
            actions: commandActions
          }} />
        </ShellLayer>
      ) : null}
    </SearchContext>
  );
}
