"use client";

import type { CollectionApi } from "@byline/newsroom-screens/collections/collection-api";
import type { CollectionGuard } from "@byline/newsroom-screens/collections/collection-guard";
import { CollectionLinksProvider, type CollectionLinks } from "@byline/newsroom-screens/collections/collection-links";
import { collectionViews, type CollectionRoute, type CollectionView } from "@byline/newsroom-screens/collections/collection-model";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { usePreferences } from "@payloadcms/ui";
import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { isCollectionsPath } from "../../domain/navigation";
import { useNewsroomAccount, useNewsroomRoutes } from "../shell/account";
import { ShellLayer } from "../shell/layer";
import { useShellLayout } from "../shell/layout";
import { useShellNavigation } from "../shell/navigation";
import { COLLECTION_SWITCHER_VIEW_PREFERENCE } from "../shell/shell-config";
import { CollectionSwitcherContent } from "./CollectionSwitcher";
import { collectionSearch, collectionsHistory } from "./collection-route";
import { createPayloadCollectionApi } from "./payload-collection-api";

type CollectionsWorkspace = {
  api: CollectionApi;
  /** The Collections screen's address for a route. */
  href: (route: CollectionRoute) => string;
  /**
   * Moves within Collections (the switcher, a row, a section): through the
   * open workspace's unsaved-changes guard, then the browser's history, so
   * Back, Forward and refresh keep the reader's place.
   */
  navigate: (route: CollectionRoute, options?: { replace?: boolean }) => void;
  /** The same move once the workspace's own guard has already agreed (its screen). */
  move: (route: CollectionRoute, options?: { replace?: boolean }) => void;
  /** The open Collection workspace's guard (set by the screen while it is mounted). */
  guardRef: RefObject<CollectionGuard | null>;
  /** The switcher's own state, kept while the reader moves between Collections. */
  view: CollectionView | null;
  setView: (view: CollectionView) => void;
  search: string;
  setSearch: (search: string) => void;
  scrollTops: RefObject<Partial<Record<"sidebar" | "sheet", number>>>;
  /** The narrow screens' Collection switcher sheet. */
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
};

const CollectionsWorkspaceContext = createContext<CollectionsWorkspace | null>(null);

export function useCollectionsWorkspace(): CollectionsWorkspace {
  const value = use(CollectionsWorkspaceContext);
  if (!value) throw new Error("useCollectionsWorkspace needs CollectionsWorkspaceShell (BylineShell).");
  return value;
}

/**
 * Collections' shell state, beside the Story switcher and the Calendar and
 * Media workspaces: the Collection API, guarded moves within Collections,
 * and the one Collection switcher controller (its view remembered in
 * Payload Preferences; its search and scroll kept while moving between
 * Collections). The open Collection, section and interview are the address,
 * never state here. It also tells every shared screen how to reach a
 * Collection (CollectionLinks), so Story Peek, Home and ⌘K link into it.
 */
export function CollectionsWorkspaceShell({ children }: { children: ReactNode }) {
  const routes = useNewsroomRoutes();
  const account = useNewsroomAccount();
  const pathname = usePathname() ?? "";
  const { composition, collectionId } = useShellLayout();
  const { navigate: shellNavigate } = useShellNavigation();
  const { getPreference, setPreference } = usePreferences();
  const api = useMemo(() => createPayloadCollectionApi(routes.api), [routes.api]);
  const guardRef = useRef<CollectionGuard | null>(null);
  const [view, setViewState] = useState<CollectionView | null>(null);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollTops = useRef<Partial<Record<"sidebar" | "sheet", number>>>({});
  const onCollections = isCollectionsPath(pathname, routes.admin);

  const href = useCallback((route: CollectionRoute) => `${routes.admin}/collections${collectionSearch(route)}`, [routes.admin]);
  const move = useCallback((route: CollectionRoute, options: { replace?: boolean } = {}) => {
    const next = href(route);
    // From another screen, the shell's navigation; within Collections, only the address's query moves.
    if (!isCollectionsPath(window.location.pathname, routes.admin)) return shellNavigate(next);
    if (`${window.location.pathname}${window.location.search}` === next) return;
    if (options.replace) collectionsHistory.replace(next);
    else collectionsHistory.push(next);
  }, [href, routes.admin, shellNavigate]);
  const navigate = useCallback((route: CollectionRoute, options: { replace?: boolean } = {}) => {
    if (guardRef.current) guardRef.current.guard(() => move(route, options));
    else move(route, options);
  }, [move]);

  // The remembered switcher view, read the first time a Collection is open; Active when there is none.
  const needed = Boolean(account) && collectionId !== null && view === null;
  useEffect(() => {
    if (!needed) return undefined;
    let live = true;
    getPreference<unknown>(COLLECTION_SWITCHER_VIEW_PREFERENCE)
      .then((stored) => { if (live) setViewState(typeof stored === "string" && stored in collectionViews ? (stored as CollectionView) : "active"); })
      .catch(() => { if (live) setViewState("active"); });
    return () => { live = false; };
  }, [needed, getPreference]);
  const setView = useCallback((next: CollectionView) => {
    setViewState(next);
    void setPreference(COLLECTION_SWITCHER_VIEW_PREFERENCE, next).catch(() => undefined);
  }, [setPreference]);

  // Leaving Collections, or the persistent pane becoming available, closes the temporary sheet.
  useEffect(() => { if (collectionId === null || composition === "collection-workspace") setSheetOpen(false); }, [collectionId, composition]);

  const value = useMemo<CollectionsWorkspace>(() => ({ api, href, navigate, move, guardRef, view, setView, search, setSearch, scrollTops, sheetOpen, setSheetOpen }), [api, href, navigate, move, view, setView, search, sheetOpen]);
  const links = useMemo<CollectionLinks>(() => ({
    href: (id, options) => href({ collectionId: id, tab: options?.tab ?? "overview", interviewId: options?.interviewId ?? null }),
    open: (id, options) => navigate({ collectionId: id, tab: options?.tab ?? "overview", interviewId: options?.interviewId ?? null })
  }), [href, navigate]);

  return (
    <CollectionsWorkspaceContext value={value}>
      <CollectionLinksProvider value={links}>{children}</CollectionLinksProvider>
      {account && onCollections ? (
        <ShellLayer active={sheetOpen}>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right" className="w-[22rem] max-w-[calc(100vw-2.5rem)] gap-0 bg-sidebar p-0 text-sidebar-foreground data-[side=right]:sm:max-w-[22rem]" data-byline-collection-sheet="">
              <CollectionsWorkspaceContext value={value}>
                <CollectionSwitcherContent
                  variant="sheet"
                  title={<SheetTitle className="text-base font-medium text-foreground">Collections</SheetTitle>}
                  description={<SheetDescription className="sr-only">Switch to another Collection.</SheetDescription>}
                  onNavigate={() => setSheetOpen(false)}
                />
              </CollectionsWorkspaceContext>
            </SheetContent>
          </Sheet>
        </ShellLayer>
      ) : null}
    </CollectionsWorkspaceContext>
  );
}
