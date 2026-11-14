"use client";

import { MEDIA_WORK_SCOPES } from "@byline/newsroom-screens/media/media-desk-model";
import { MediaBulkDeleteDialog, MediaBulkEditDialog, MediaSelectionBar } from "@byline/newsroom-screens/media/MediaBulkActions";
import { MediaFolderDialogs } from "@byline/newsroom-screens/media/MediaFolderDialogs";
import { MediaRenameDialog } from "@byline/newsroom-screens/media/MediaRename";
import { MediaInspectorContent } from "@byline/newsroom-screens/media/MediaInspectorContent";
import { MediaLibraryBrowser } from "@byline/newsroom-screens/media/MediaLibraryBrowser";
import { childFolderCount, EMPTY_MEDIA_FILTERS, folderPath, MEDIA_LIBRARY_SOURCES, mediaRouteSearch, type MediaLibraryAsset, type MediaLibraryFilters, type MediaRoute } from "@byline/newsroom-screens/media/media-library-model";
import { mediaAssetKey } from "@byline/newsroom-screens/media/media-library-api";
import { invalidateMediaLibrary, useMediaNavigator } from "@byline/newsroom-screens/media/media-query";
import { useQueryClient } from "@tanstack/react-query";
import { MediaWork } from "@byline/newsroom-screens/media/MediaWork";
import { StoryPeekHost, useStoryPeek } from "@byline/newsroom-screens/story/StoryPeekHost";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@byline/newsroom-ui/ui/breadcrumb";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from "@byline/newsroom-ui/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@byline/newsroom-ui/ui/resizable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { useConfig, usePreferences } from "@payloadcms/ui";
import { Download, FolderInput, FolderPen, FolderPlus, FolderTree, Info, Link2, MoreHorizontal, PanelLeft, Pencil, PenLine, SquareCheck, Trash2, Upload } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { atLeast } from "../../access/user";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { useNewsroomAccount } from "../shell/account";
import { useBylineCreate } from "../shell/create";
import { useShellLayout } from "../shell/layout";
import { useLeaveGuard, useShellNavigation } from "../shell/navigation";
import { useBylineSearch } from "../shell/search";
import { MEDIA_INSPECTOR_QUERY } from "../shell/shell-config";
import { useNewsroomTimeZone } from "../shell/timezone";
import { useStoryPreload } from "../story/preload";
import { createPayloadPlanningFetchers } from "../stories/payload-planning-fetchers";
import { MediaNavigator } from "./MediaNavigator";
import { useMediaNavigate, useMediaRoute } from "./media-route";
import { useMediaUnsaved } from "./media-unsaved";
import { useBylineMediaPicker, useMediaPreferences, useMediaWorkspace } from "./MediaWorkspaceShell";
import { createPayloadMediaWorkFetchers } from "./payload-media-fetchers";

/**
 * Byline Media (`/admin/media`): one destination for the newsroom's files
 * and its production work, kept apart.
 *
 * - **Library**: Payload Media, browsed by Library scope or by real Payload
 *   folder in the navigator; a grid (or list) of private previews in the
 *   middle; the selected file's inspector on the right (a resizable panel on
 *   wide screens, a sheet otherwise).
 * - **Work**: the shared production desk (WordPress's Media Desk), filtered
 *   by the navigator's Work view.
 *
 * The address is the state (view, source or folder, selected asset), so
 * Back/Forward and refresh work and any view can be bookmarked; a bare
 * `/media` is Library → All media.
 */
export function NewsroomMediaScreen({ currentUserId }: { currentUserId: number }) {
  const { config } = useConfig();
  const { getPreference, setPreference } = usePreferences();
  const api = config.routes.api;
  const admin = config.routes.admin;
  const fetchers = useMemo(() => ({ ...createPayloadHomeFetchers(api), ...createPayloadPlanningFetchers(api, { getPreference, setPreference }), ...createPayloadMediaWorkFetchers(api) }), [api, getPreference, setPreference]);
  const storyUrl = useMemo(() => (storyId: number) => `${admin}/collections/stories/${storyId}`, [admin]);
  const preloadStory = useStoryPreload(fetchers, storyUrl);
  return (
    <AdminRoot className="byline-media" toaster={false}>
      <StoryPeekHost fetchers={fetchers} workspaceUrl={storyUrl} preloadStory={preloadStory}>
        <MediaBody fetchers={fetchers} currentUserId={currentUserId} storyUrl={storyUrl} />
      </StoryPeekHost>
    </AdminRoot>
  );
}

type Fetchers = ReturnType<typeof createPayloadHomeFetchers> & ReturnType<typeof createPayloadPlanningFetchers> & ReturnType<typeof createPayloadMediaWorkFetchers>;

function MediaBody({ fetchers, currentUserId, storyUrl }: { fetchers: Fetchers; currentUserId: number; storyUrl: (id: number) => string }) {
  const workspace = useMediaWorkspace();
  const account = useNewsroomAccount();
  const editor = atLeast(account, "editor");
  const route = useMediaRoute();
  const navigate = useMediaNavigate(workspace.href);
  const { navigate: shellNavigate } = useShellNavigation();
  const { openStory } = useStoryPeek();
  const { setStoryOpener } = useBylineSearch();
  const { openCreate } = useBylineCreate();
  const { composition } = useShellLayout();
  const { state, isMobile } = useSidebar();
  const timezone = useNewsroomTimeZone();
  const picker = useBylineMediaPicker();
  const [preferences, setPreferences] = useMediaPreferences();
  const navigatorQuery = useMediaNavigator(workspace.fetchers);
  const navigator = navigatorQuery.data;
  const folders = navigator?.folders ?? [];
  const [filters, setFilters] = useState<MediaLibraryFilters>(EMPTY_MEDIA_FILTERS);
  const [confirmDelete, setConfirmDelete] = useState<MediaLibraryAsset | null>(null);
  const [renaming, setRenaming] = useState<MediaLibraryAsset | null>(null);
  const client = useQueryClient();

  /* ------------------------------------------------------ multi-select */

  // The loaded files, so a selection can be acted on (and pruned when files leave the view).
  const [loaded, setLoaded] = useState<MediaLibraryAsset[]>([]);
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [bulk, setBulk] = useState<"edit" | "delete" | null>(null);
  const checkedAssets = useMemo(() => loaded.filter((asset) => checked.has(asset.id)), [checked, loaded]);
  useEffect(() => {
    setChecked((current) => {
      if (!current.size) return current;
      const present = new Set(loaded.map((asset) => asset.id));
      const next = new Set([...current].filter((id) => present.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [loaded]);
  // A new place or a new search is a new selection.
  const place = `${route.view}:${route.source}:${route.folderId}:${JSON.stringify(filters)}`;
  useEffect(() => { setChecked((current) => (current.size ? new Set() : current)); }, [place]);

  // ⌘K opens a story in this screen's Peek rather than leaving Media.
  useEffect(() => {
    setStoryOpener(openStory);
    return () => setStoryOpener(null);
  }, [openStory, setStoryOpener]);

  const paneShowing = composition === "media-workspace" && state === "expanded" && !isMobile;
  const persistentInspector = useMediaQuery(MEDIA_INSPECTOR_QUERY) && !isMobile;
  const folder = route.folderId !== null ? folders.find((item) => item.id === route.folderId) ?? null : null;
  const path = route.folderId !== null ? folderPath(folders, route.folderId) : [];

  /* ---------------------------------------------- unsaved inspector edits */

  const { guard, guarded, dialog: unsavedDialog } = useMediaUnsaved(mediaRouteSearch(route));
  useEffect(() => {
    workspace.setNavigationGuard(guarded);
    return () => workspace.setNavigationGuard(null);
  }, [guarded, workspace]);
  // Leaving Media through the shell (the sidebar, Search, Create) waits or asks too.
  useLeaveGuard(() => ({ modified: guard.current?.dirty() ?? false, saving: false }));

  const go = useCallback((next: MediaRoute) => guarded(() => navigate(next)), [guarded, navigate]);
  const select = useCallback((asset: MediaLibraryAsset | null) => {
    if ((asset?.id ?? null) === route.assetId) return;
    go({ ...route, assetId: asset?.id ?? null });
  }, [go, route]);

  /* -------------------------------------------------------------- header */

  const title = route.view === "work"
    ? MEDIA_WORK_SCOPES.find((scope) => scope.value === route.scope)?.label ?? "Work"
    : folder?.name ?? (route.folderId !== null ? "Folder" : MEDIA_LIBRARY_SOURCES.find((source) => source.value === route.source)?.label ?? "All media");
  const description = route.view === "work"
    ? "Photo, gallery, graphic, video and audio assignments. Files you link come from the Library."
    : route.folderId !== null ? undefined : route.source === "needs-metadata" ? "Files missing alt text, a credit, or rights and source information." : route.source === "unfiled" ? "Files that aren't in a folder yet." : route.source === "recent" ? "Uploaded in the last two weeks." : route.source === "mine" ? "Files you uploaded." : "Every photo, graphic, PDF and audio file in the newsroom.";
  const libraryRoute = (patch: Partial<MediaRoute>): MediaRoute => ({ view: "library", source: "all", folderId: null, scope: route.scope, assetId: null, ...patch });
  const link = (next: MediaRoute) => ({ href: workspace.href(next), onClick: (event: MouseEvent) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey) { event.preventDefault(); go(next); } } });
  const upload = () => openCreate("media", { folderId: route.view === "library" ? route.folderId : null });

  // A folder that disappeared (deleted elsewhere) falls back to All media rather than an empty page.
  useEffect(() => {
    if (route.folderId !== null && navigator && !folder) navigate(libraryRoute({}), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigator, folder, route.folderId]);

  /* ---------------------------------------------------- asset shortcuts */

  const assetMenu = (asset: MediaLibraryAsset) => (checked.has(asset.id) && checked.size > 1 ? selectionMenu() : (
    <>
      <ContextMenuGroup>
        <ContextMenuLabel className="max-w-52 truncate">{asset.filename}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => select(asset)}><Info aria-hidden="true" />Details</ContextMenuItem>
        <ContextMenuItem onClick={() => setChecked((current) => new Set([...current, asset.id]))}><SquareCheck aria-hidden="true" />Select</ContextMenuItem>
        {asset.canUpdate ? <ContextMenuItem onClick={() => setRenaming(asset)}><Pencil aria-hidden="true" />Rename…</ContextMenuItem> : null}
        {asset.canUpdate ? <ContextMenuItem onClick={() => workspace.requestFolderAction({ kind: "move-assets", assets: [asset] })}><FolderInput aria-hidden="true" />Move to folder…</ContextMenuItem> : null}
        {asset.url ? <ContextMenuItem render={<a href={asset.url} download={asset.filename} />}><Download aria-hidden="true" />Download</ContextMenuItem> : null}
        <ContextMenuItem onClick={() => void copy(new URL(workspace.href(libraryRoute({ ...(route.folderId !== null ? { folderId: route.folderId } : { source: route.source }), assetId: asset.id })), window.location.href).toString())}><Link2 aria-hidden="true" />Copy link</ContextMenuItem>
      </ContextMenuGroup>
      {asset.canDelete ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => setConfirmDelete(asset)}><Trash2 aria-hidden="true" />Delete…</ContextMenuItem>
        </>
      ) : null}
    </>
  ));

  /* --------------------------------------------------- bulk actions */

  const movable = checkedAssets.filter((asset) => asset.canUpdate);
  const deletable = checkedAssets.filter((asset) => asset.canDelete);
  const downloadable = checkedAssets.filter((asset) => asset.url);
  const moveChecked = () => workspace.requestFolderAction({ kind: "move-assets", assets: movable });
  // One download per file; browsers may ask once before allowing several.
  const downloadChecked = () => downloadable.forEach((asset, index) => window.setTimeout(() => download(asset), index * 250));
  const selectionMenu = () => (
    <>
      <ContextMenuGroup>
        <ContextMenuLabel>{checked.size} selected</ContextMenuLabel>
        <ContextMenuSeparator />
        {movable.length ? <ContextMenuItem onClick={() => setBulk("edit")}><PenLine aria-hidden="true" />Edit details…</ContextMenuItem> : null}
        {movable.length ? <ContextMenuItem onClick={moveChecked}><FolderInput aria-hidden="true" />Move to folder…</ContextMenuItem> : null}
        {downloadable.length ? <ContextMenuItem onClick={downloadChecked}><Download aria-hidden="true" />Download {downloadable.length}</ContextMenuItem> : null}
      </ContextMenuGroup>
      {deletable.length ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => setBulk("delete")}><Trash2 aria-hidden="true" />Delete {deletable.length}…</ContextMenuItem>
        </>
      ) : null}
    </>
  );
  const selectionBar = (
    <MediaSelectionBar count={checked.size} loaded={loaded.length} onSelectAll={() => setChecked(new Set(loaded.map((asset) => asset.id)))} onClear={() => setChecked(new Set())}>
      <Button variant="ghost" size="sm" disabled={!movable.length} onClick={() => setBulk("edit")} data-media-bulk-action="edit"><PenLine data-icon="inline-start" aria-hidden="true" />Edit details</Button>
      <Button variant="ghost" size="sm" disabled={!movable.length} onClick={moveChecked} data-media-bulk-action="move"><FolderInput data-icon="inline-start" aria-hidden="true" />Move</Button>
      <Button variant="ghost" size="sm" disabled={!downloadable.length} onClick={downloadChecked} data-media-bulk-action="download"><Download data-icon="inline-start" aria-hidden="true" />Download</Button>
      {editor ? <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={!deletable.length} onClick={() => setBulk("delete")} data-media-bulk-action="delete"><Trash2 data-icon="inline-start" aria-hidden="true" />Delete</Button> : null}
    </MediaSelectionBar>
  );

  const showSheet = route.view === "library" && route.assetId !== null && !persistentInspector;
  // Closing the details returns focus to the file they were opened from (the address no longer names it by then).
  const lastAsset = useRef<number | null>(null);
  if (route.assetId !== null) lastAsset.current = route.assetId;
  const assetHref = useCallback((id: number) => workspace.href({ ...route, view: "library", assetId: id }), [route, workspace]);
  const inspector = route.assetId !== null ? (
    <MediaInspectorContent
      key={route.assetId}
      fetchers={workspace.fetchers}
      assetId={route.assetId}
      navigator={navigator}
      timezone={timezone}
      guardRef={guard}
      onClose={() => select(null)}
      onDeleted={() => navigate({ ...route, assetId: null }, { replace: true })}
      onOpenStory={openStory}
      assetHref={assetHref}
      showHeading
      onEditArtDirection={(id) => workspace.editArtDirection(id)}
    />
  ) : null;

  const browser = (
    <MediaLibraryBrowser
      fetchers={workspace.fetchers}
      source={route.source}
      folderId={route.folderId}
      folderName={folder?.name}
      navigator={navigator}
      filters={filters}
      onFiltersChange={setFilters}
      sort={preferences.sort}
      onSortChange={(sort) => setPreferences({ sort })}
      layout={preferences.layout}
      onLayoutChange={(layout) => setPreferences({ layout })}
      timezone={timezone}
      selectedId={route.assetId}
      onActivate={(asset) => select(route.assetId === asset.id && !persistentInspector ? null : asset)}
      checkedIds={checked}
      onCheckedChange={setChecked}
      selectionBar={selectionBar}
      onAssetsChange={setLoaded}
      assetMenu={assetMenu}
      onSearchEverywhere={() => go(libraryRoute({}))}
      toolbarEnd={<Button onClick={upload} data-media-upload-button=""><Upload data-icon="inline-start" aria-hidden="true" />Upload</Button>}
      label={folder ? `Files in ${folder.name}` : `${title} files`}
    />
  );

  return (
    <main className={cn("mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 py-4 sm:py-6 lg:px-6")} data-byline-media-screen="" data-media-view={route.view}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {!paneShowing ? (
          <Button variant="outline" size="sm" className="order-2 mt-0.5 sm:order-none" onClick={() => workspace.setSheetOpen(true)} aria-label="Media navigation" data-media-browse="">
            <PanelLeft data-icon="inline-start" aria-hidden="true" />Browse
          </Button>
        ) : null}
        <div className="order-first min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
          {route.view === "library" && path.length ? (
            <Breadcrumb className="mb-1">
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink render={<a {...link(libraryRoute({}))} />}>All media</BreadcrumbLink></BreadcrumbItem>
                {path.slice(0, -1).map((item) => (
                  <Fragment key={item.id}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem><BreadcrumbLink render={<a {...link(libraryRoute({ folderId: item.id }))} />}>{item.name}</BreadcrumbLink></BreadcrumbItem>
                  </Fragment>
                ))}
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>{path.at(-1)?.name}</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : null}
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {route.view === "library" && folder && navigator?.capabilities.canManageFolders ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label={`Folder actions for ${folder.name}`} />}><FolderTree data-icon="inline-start" aria-hidden="true" />Folder<MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => workspace.requestFolderAction({ kind: "create", parentId: folder.id })}><FolderPlus aria-hidden="true" />New subfolder</DropdownMenuItem>
                <DropdownMenuItem onClick={() => workspace.requestFolderAction({ kind: "rename", folder })}><FolderPen aria-hidden="true" />Rename</DropdownMenuItem>
                <DropdownMenuItem onClick={() => workspace.requestFolderAction({ kind: "move-folder", folder })}><FolderInput aria-hidden="true" />Move</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => workspace.requestFolderAction({ kind: "delete", folder })}>
                <Trash2 aria-hidden="true" />{folder.assetCount || childFolderCount(folders, folder.id) ? "Delete (folder isn't empty)" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {route.view === "work" ? <Button variant="outline" className="order-2 sm:order-none" onClick={upload}><Upload data-icon="inline-start" aria-hidden="true" />Upload</Button> : null}
      </div>

      {route.view === "work" ? (
        <MediaWork fetchers={fetchers} workspaceUrl={storyUrl} onOpenStory={openStory} media={picker} scope={route.scope} currentUserId={currentUserId} navigate={shellNavigate} />
      ) : persistentInspector ? (
        <WorkspacePanels open={route.assetId !== null} size={preferences.inspectorSize} onResized={(inspectorSize) => setPreferences({ inspectorSize })} browser={browser} inspector={inspector} />
      ) : (
        browser
      )}

      <MediaNavigatorSheet />

      <Sheet open={showSheet} onOpenChange={(open) => { if (!open) select(null); }}>
        <SheetContent side="right" showCloseButton={false} className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-3/4 data-[side=right]:sm:max-w-md" finalFocus={() => (document.querySelector(`[data-media-asset="${lastAsset.current}"]`) as HTMLElement | null) ?? true} data-media-inspector-sheet="">
          <SheetHeader className="sr-only">
            <SheetTitle>File details</SheetTitle>
            <SheetDescription>Preview, metadata, folder and linked uses of the selected file.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">{showSheet ? inspector : null}</div>
        </SheetContent>
      </Sheet>

      <MediaFolderDialogs
        request={workspace.folderRequest}
        onClose={() => workspace.requestFolderAction(null)}
        fetchers={workspace.fetchers}
        folders={folders}
        onCreated={(created) => { if (created.parentId !== null) workspace.setExpanded(created.parentId, true); go(libraryRoute({ folderId: created.id })); }}
        onDeleted={(deleted) => { if (route.folderId === deleted.id) navigate(deleted.parentId !== null ? libraryRoute({ folderId: deleted.parentId }) : libraryRoute({}), { replace: true }); }}
      />

      {unsavedDialog}

      <MediaRenameDialog asset={renaming} onClose={() => setRenaming(null)} fetchers={workspace.fetchers} />
      <MediaBulkEditDialog assets={checkedAssets} open={bulk === "edit"} onOpenChange={(open) => { if (!open) setBulk(null); }} fetchers={workspace.fetchers} />
      <MediaBulkDeleteDialog
        assets={deletable}
        open={bulk === "delete"}
        onOpenChange={(open) => { if (!open) setBulk(null); }}
        fetchers={workspace.fetchers}
        onDone={(result) => {
          setChecked(new Set(result.failed.map((failure) => failure.id)));
          if (route.assetId !== null && result.done.includes(route.assetId)) navigate({ ...route, assetId: null }, { replace: true });
        }}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.filename}?</AlertDialogTitle>
            <AlertDialogDescription>The original and its preview are removed from the newsroom. A file that is still linked from a story, assignment, coverage or profile can't be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep file</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => {
              const asset = confirmDelete;
              setConfirmDelete(null);
              if (!asset) return;
              try {
                await workspace.fetchers.deleteMedia(asset.id);
                toast.success(`${asset.filename} deleted`);
                client.removeQueries({ queryKey: mediaAssetKey(asset.id) });
                await invalidateMediaLibrary(client);
                if (route.assetId === asset.id) navigate({ ...route, assetId: null }, { replace: true });
              } catch (error) {
                toast.error((error as { message?: string })?.message || "The file couldn't be deleted.");
              }
            }}>Delete file</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function download(asset: MediaLibraryAsset) {
  if (!asset.url) return;
  const link = document.createElement("a");
  link.href = asset.url;
  link.download = asset.filename;
  link.rel = "noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
}

async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("The link couldn't be copied.");
  }
}

/** The narrow screens' Media navigator: the same MediaNavigator, in a sheet that closes once a place is chosen. */
function MediaNavigatorSheet() {
  const { sheetOpen, setSheetOpen } = useMediaWorkspace();
  const { composition } = useShellLayout();
  const { state, isMobile } = useSidebar();
  const paneShowing = composition === "media-workspace" && state === "expanded" && !isMobile;
  // The pane took over (the window grew): never two navigators at once.
  useEffect(() => { if (paneShowing && sheetOpen) setSheetOpen(false); }, [paneShowing, sheetOpen, setSheetOpen]);
  return (
    <Sheet open={sheetOpen && !paneShowing} onOpenChange={setSheetOpen}>
      <SheetContent side="left" className="w-[20rem] max-w-[calc(100vw-2.5rem)] gap-0 overflow-y-auto bg-sidebar p-0 text-sidebar-foreground data-[side=left]:sm:max-w-[20rem]" data-media-navigator-sheet="">
        <SheetHeader className="border-b border-sidebar-border p-4 pr-12">
          <SheetTitle className="text-base font-medium text-foreground">Media</SheetTitle>
          <SheetDescription className="sr-only">Library views, production work and folders.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Media navigation" className="flex flex-col">
          <MediaNavigator onNavigated={() => setSheetOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The wide Library: the grid and the selected file's inspector side by side
 * in one resizable group (page-level inspection, not a second sidebar). Both
 * scroll on their own within the viewport, like a DAM workspace; the
 * inspector's width is the reader's preference.
 */
function WorkspacePanels({ open, size, onResized, browser, inspector }: { open: boolean; size: number; onResized: (size: number) => void; browser: ReactNode; inspector: ReactNode }) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const element = frame.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(420, window.innerHeight - top - 16));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <div ref={frame} style={height ? { height: `${height}px` } : undefined} className="min-h-0" data-media-panels="">
      <ResizablePanelGroup
        orientation="horizontal"
        className="rounded-lg"
        onLayoutChanged={(layout) => { const next = layout.inspector; if (open && typeof next === "number") onResized(next); }}
      >
        <ResizablePanel id="browser" minSize={560} className="overflow-y-auto pr-4" data-media-browser-panel="">
          {browser}
        </ResizablePanel>
        {open ? (
          <>
            <ResizableHandle withHandle aria-label="Resize file details" />
            <ResizablePanel id="inspector" defaultSize={`${size}`} minSize={340} maxSize="50" className="overflow-y-auto border-l bg-background" data-media-inspector-panel="">
              {inspector}
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}
