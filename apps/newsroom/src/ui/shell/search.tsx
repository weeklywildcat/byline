"use client";

import { HomeCommands } from "@byline/newsroom-screens/home/HomeCommands";
import { homeKey } from "@byline/newsroom-screens/home/home-query";
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
  const { openCreate, creating } = useBylineCreate();
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

  return (
    <SearchContext value={value}>
      {children}
      {account ? (
        <ShellLayer active={open}>
          <HomeCommands open={open} onOpenChange={setOpen} fetchers={fetchers} data={home.data} recentIds={recentIds} onStory={openStory} onNewStory={() => openCreate("story")} onNewTask={() => openCreate("task")} />
        </ShellLayer>
      ) : null}
    </SearchContext>
  );
}
