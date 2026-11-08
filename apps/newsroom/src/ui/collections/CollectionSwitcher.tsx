"use client";

import { collectionKey } from "@byline/newsroom-screens/collections/collection-api";
import { collectionStatuses, collectionViews, type Collection, type CollectionDetail, type CollectionView } from "@byline/newsroom-screens/collections/collection-model";
import { useCollectionList } from "@byline/newsroom-screens/collections/collection-query";
import { describeEditorialError } from "@byline/newsroom-screens/editorial/editorial-model";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useDebouncedValue } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar
} from "@byline/newsroom-ui/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { BylineIconRail } from "../shell/BylineIconRail";
import { useShellLayout } from "../shell/layout";
import type { ShellSidebarProps } from "../shell/nav-items";
import { useCollectionsWorkspace } from "./CollectionsWorkspaceShell";

/** How many Collections the switcher lists: a project switcher, not the full list (that's Collections). */
export const COLLECTION_SWITCHER_LIMIT = 50;

/** The open Collection, above the results when the view or search leaves it out, so it never disappears. */
export function pinnedCurrentCollection(rows: readonly Collection[], current: Collection | null | undefined): Collection | null {
  if (!current || rows.some((row) => row.id === current.id)) return null;
  return current;
}

/**
 * The Collection switcher: shadcn sidebar-09's list pane, for moving between
 * reporting projects. A title with the way back to the full list, a search,
 * the view (Active, Mine, All, Archived), then compact rows. No filters,
 * descriptions or task previews: its one job is switching project. Rendered
 * by the Collection workspace's sidebar and by the narrow-screen sheet.
 */
export function CollectionSwitcherContent({ variant = "sidebar", title, description, onNavigate }: { variant?: "sidebar" | "sheet"; title?: ReactNode; description?: ReactNode; onNavigate?: () => void }) {
  const { view, setView, search, setSearch, scrollTops, href, navigate } = useCollectionsWorkspace();
  const scroller = useRef<HTMLDivElement>(null);
  const label = view ? collectionViews[view] : "Active";
  return (
    <div className="flex h-full min-h-0 w-full flex-col" data-byline-collection-switcher={variant}>
      <SidebarHeader className={cn("gap-3 border-b border-sidebar-border p-4", variant === "sheet" && "pr-12")}>
        <div className="flex w-full items-center justify-between gap-2">
          {title ?? <div className="text-base font-medium text-foreground">Collections</div>}
          <a
            href={href({ collectionId: null, tab: "overview", interviewId: null })}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-mr-2 text-muted-foreground")}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              onNavigate?.();
              navigate({ collectionId: null, tab: "overview", interviewId: null });
            }}
          >
            All collections
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </a>
        </div>
        {description}
        <SidebarInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search collections..." aria-label="Search collections" autoComplete="off" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="w-full justify-between bg-background font-normal" aria-label={`Collection view: ${label}`} disabled={view === null} />}>
            <span className="truncate">{label}</span>
            <ChevronDown data-icon="inline-end" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-48">
            <DropdownMenuRadioGroup value={view ?? ""} onValueChange={(next) => setView(next as CollectionView)}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>View</DropdownMenuLabel>
                {Object.entries(collectionViews).map(([id, name]) => <DropdownMenuRadioItem key={id} value={id}>{name}</DropdownMenuRadioItem>)}
              </DropdownMenuGroup>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>
      <SidebarContent ref={scroller} onScroll={(event) => { scrollTops.current[variant] = event.currentTarget.scrollTop; }}>
        {view === null ? <SwitcherSkeleton /> : <SwitcherResults view={view} label={label} onNavigate={onNavigate} scroller={scroller} variant={variant} />}
      </SidebarContent>
    </div>
  );
}

function SwitcherResults({ view, label, onNavigate, scroller, variant }: { view: CollectionView; label: string; onNavigate?: () => void; scroller: RefObject<HTMLDivElement | null>; variant: "sidebar" | "sheet" }) {
  const { api, search, scrollTops } = useCollectionsWorkspace();
  const { collectionId } = useShellLayout();
  const query = useDebouncedValue(search, 200).trim();
  const list = useCollectionList(api, { view, search: query, sort: view === "archived" ? "updated" : "name", limit: COLLECTION_SWITCHER_LIMIT });
  const rows = useMemo(() => list.data?.collections ?? [], [list.data]);
  const listed = rows.some((row) => row.id === collectionId);
  // The open Collection, from the workspace the screen already loaded (the same cache, so no new request).
  const detail = useQuery<CollectionDetail>({ queryKey: collectionKey(collectionId ?? 0), queryFn: () => api.detail(collectionId!), enabled: collectionId !== null && Boolean(list.data) && !listed, retry: false });
  const current = collectionId !== null && detail.data?.collection.id === collectionId ? detail.data.collection : null;
  const pinned = list.data ? pinnedCurrentCollection(rows, current) : null;

  const loaded = Boolean(list.data);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !loaded) return;
    element.scrollTop = scrollTops.current[variant] ?? 0;
    element.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [loaded, collectionId, scroller, scrollTops, variant]);

  if (list.isPending && !list.data) return <SwitcherSkeleton />;
  if (list.isError && !list.data) return <div className="p-4"><InlineAlert onAction={() => void list.refetch()}>{describeEditorialError(list.error, "Collections are unavailable right now.")}</InlineAlert></div>;
  const empty = query ? `No ${label.toLowerCase()} collections match “${query}”.` : `No ${label.toLowerCase()} collections.`;
  return (
    <>
      {pinned ? (
        <SidebarGroup className="px-2 py-2">
          <SidebarGroupLabel>Current collection</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SwitcherRow collection={pinned} current onNavigate={onNavigate} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      <SidebarGroup className={cn("px-2 py-2", pinned && "border-t border-sidebar-border")}>
        <SidebarGroupLabel>{`${label} collections`}</SidebarGroupLabel>
        <SidebarGroupContent>
          {rows.length ? (
            <SidebarMenu aria-label={`${label} collections`}>
              {rows.map((row) => <SwitcherRow key={row.id} collection={row} current={row.id === collectionId} onNavigate={onNavigate} />)}
            </SidebarMenu>
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">{empty}</p>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
      {list.data && list.data.total > rows.length ? <p className="px-4 pb-3 text-xs text-muted-foreground">Showing {rows.length} of {list.data.total}. Search, or open All collections.</p> : null}
      <p role="status" aria-live="polite" className="sr-only">{`${rows.length} ${rows.length === 1 ? "collection" : "collections"} in ${label}.`}</p>
    </>
  );
}

/** One Collection: its name, then its status and story count. Choosing it opens its workspace. */
function SwitcherRow({ collection, current, onNavigate }: { collection: Collection; current: boolean; onNavigate?: () => void }) {
  const { href, navigate } = useCollectionsWorkspace();
  const route = { collectionId: collection.id, tab: "overview" as const, interviewId: null };
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        isActive={current}
        className="h-auto items-start py-2 pr-10"
        render={
          <a
            href={href(route)}
            aria-current={current ? "page" : undefined}
            data-collection-id={collection.id}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              onNavigate?.();
              if (!current) navigate(route);
            }}
          />
        }
      >
        {/* A div, not a span: the menu button truncates its last span to one line. */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 font-medium whitespace-normal [overflow-wrap:anywhere]">{collection.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {collectionStatuses[collection.status]}
            {collection.lead ? ` · ${collection.lead.name}` : ""}
          </span>
        </div>
      </SidebarMenuButton>
      <SidebarMenuBadge aria-label={`${collection.storyCount} ${collection.storyCount === 1 ? "story" : "stories"}`} className="top-2.5">
        {collection.storyCount}
      </SidebarMenuBadge>
    </SidebarMenuItem>
  );
}

function SwitcherSkeleton() {
  return (
    <div role="status" aria-label="Loading collections" className="flex flex-col gap-1 p-2">
      {Array.from({ length: 6 }, (_, index) => <SidebarMenuSkeleton key={index} className="h-12" />)}
    </div>
  );
}

/**
 * The Collection workspace's sidebar contents: shadcn sidebar-09's nested
 * composition (the global icon rail, then the Collection switcher). Inside
 * BylineSidebar's one `<Sidebar collapsible="icon">`, so ⌘\\ leaves only the
 * rail and the pane is inert, not just clipped. The pane is the same
 * `CollectionSwitcherContent` as the narrow-screen sheet.
 */
export function CollectionWorkspaceSidebar(props: ShellSidebarProps & { active: string | null }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <>
      <BylineIconRail {...props} />
      <Sidebar collapsible="none" className="hidden min-w-0 flex-1 md:flex" inert={collapsed} aria-hidden={collapsed || undefined} data-byline-collection-pane="">
        <CollectionSwitcherContent />
      </Sidebar>
    </>
  );
}
