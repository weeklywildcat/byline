import { useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@byline/newsroom-ui/ui/context-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { Check, CircleAlert, FileAudio, FileImage, FileText, LayoutGrid, List, ListFilter, Search, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { siteDay } from "../home/newsroom-model";
import type { MediaLibraryFetchers } from "./media-library-api";
import {
  activeFilterCount,
  PUBLICATION_ASSET_LABELS,
  EMPTY_MEDIA_FILTERS,
  GAP_LABELS,
  KIND_LABELS,
  MEDIA_LIBRARY_SOURCES,
  MEDIA_PAGE_SIZE,
  MEDIA_SORTS,
  type MediaPublicationAssetState,
  type MediaKind,
  type MediaLibraryAsset,
  type MediaLibraryFilters,
  type MediaLibrarySort,
  type MediaLibrarySource,
  type MediaNavigatorData
} from "./media-library-model";
import { useMediaLibrary } from "./media-query";

export type MediaLayout = "grid" | "list";

const KIND_ICONS: Record<MediaKind, LucideIcon> = { image: FileImage, audio: FileAudio, document: FileText, other: FileText };
const ANY = "__any";

export type MediaLibraryBrowserProps = {
  fetchers: Pick<MediaLibraryFetchers, "getLibrary">;
  /** Where the reader is browsing: a Library scope, or a folder (then `source` is ignored). */
  source: MediaLibrarySource;
  folderId: number | null;
  /** The open folder's name, so a search's scope can say so. */
  folderName?: string;
  navigator?: MediaNavigatorData;
  filters: MediaLibraryFilters;
  onFiltersChange: (filters: MediaLibraryFilters) => void;
  sort: MediaLibrarySort;
  onSortChange: (sort: MediaLibrarySort) => void;
  layout: MediaLayout;
  onLayoutChange: (layout: MediaLayout) => void;
  timezone: string;
  /** Browse: the asset the inspector shows. */
  selectedId?: number | null;
  /** Pick: the assets chosen so far. */
  selectedIds?: ReadonlySet<number>;
  onActivate: (asset: MediaLibraryAsset, event: MouseEvent | null) => void;
  /**
   * Browse: the files checked for a bulk action. With these, every file gets
   * a checkbox; Shift selects a range, ⌘/Ctrl-click toggles, and once anything
   * is checked a plain click toggles too (the details open from the menu).
   * ⌘A checks every loaded file, Escape clears.
   */
  checkedIds?: ReadonlySet<number>;
  onCheckedChange?: (ids: Set<number>) => void;
  /** Shown floating over the results while files are checked (the screen's bulk actions). */
  selectionBar?: ReactNode;
  /** The browse screen's context-menu items for one asset (desktop shortcut; every action is also visible elsewhere). */
  assetMenu?: (asset: MediaLibraryAsset) => ReactNode;
  /** Controls at the toolbar's end (Upload). */
  toolbarEnd?: ReactNode;
  /** "Search all media" from a Library scope. */
  onSearchEverywhere?: () => void;
  /** Called with the loaded assets (the screen keeps a deep-linked selection in view). */
  onAssetsChange?: (assets: MediaLibraryAsset[]) => void;
  label?: string;
  compact?: boolean;
  fixedKind?: MediaKind;
};

/**
 * The Media Library's content browser: a prominent search over the files'
 * metadata, a few useful filters, Grid (default) or List, and pages loaded
 * as the reader scrolls. Folder and Library scope are navigation and live in
 * the navigator, not in a dropdown here. Grid thumbnails are the server's
 * private previews, loaded lazily; an original is never a thumbnail.
 */
export function MediaLibraryBrowser(props: MediaLibraryBrowserProps) {
  const { fetchers, source, folderId, folderName, navigator, filters, onFiltersChange, sort, onSortChange, layout, onLayoutChange, timezone, selectedId = null, selectedIds, onActivate, checkedIds, onCheckedChange, selectionBar, assetMenu, toolbarEnd, onSearchEverywhere, onAssetsChange, label = "Media files", compact = false } = props;
  const [text, setText] = useState(filters.search);
  // Typing settles for a moment before the Library is asked again.
  useEffect(() => { setText(filters.search); }, [filters.search]);
  useEffect(() => {
    if (text === filters.search) return undefined;
    const timer = window.setTimeout(() => onFiltersChange({ ...filters, search: text }), 250);
    return () => window.clearTimeout(timer);
  }, [filters, onFiltersChange, text]);

  const query = useMemo(() => ({ ...filters, source, folderId, sort, limit: MEDIA_PAGE_SIZE }), [filters, folderId, sort, source]);
  const library = useMediaLibrary(fetchers, query);
  const assets = useMemo(() => library.data?.pages.flatMap((page) => page.assets) ?? [], [library.data]);
  const total = library.data?.pages[0]?.totalDocs ?? 0;
  useEffect(() => { onAssetsChange?.(assets); }, [assets, onAssetsChange]);

  const searching = filters.search.trim() !== "";
  const everywhere = searching && folderId !== null && filters.searchScope === "all";
  const scopeName = folderId !== null ? (everywhere ? "All media" : folderName || "this folder") : MEDIA_LIBRARY_SOURCES.find((item) => item.value === source)?.label ?? "All media";

  // The next page loads as the end of the list comes into view (with a button as the fallback).
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !library.hasNextPage || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting) && !library.isFetchingNextPage) void library.fetchNextPage(); }, { rootMargin: "600px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [library, library.hasNextPage, library.isFetchingNextPage]);

  const [listRef, width] = useElementWidth<HTMLDivElement>();
  const table = width === 0 || width >= 760;
  const set = (patch: Partial<MediaLibraryFilters>) => onFiltersChange({ ...filters, ...patch });

  /* ------------------------------------------------------- multi-select */

  const checking = Boolean(checkedIds && onCheckedChange);
  const checkedCount = checkedIds?.size ?? 0;
  const anchor = useRef<number | null>(null);
  const check = useCallback((asset: MediaLibraryAsset, event: { shiftKey?: boolean } | null, value?: boolean) => {
    if (!checkedIds || !onCheckedChange) return;
    const next = new Set(checkedIds);
    const from = event?.shiftKey && anchor.current !== null ? assets.findIndex((item) => item.id === anchor.current) : -1;
    const to = assets.findIndex((item) => item.id === asset.id);
    if (from >= 0 && to >= 0) {
      for (const item of assets.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(item.id);
    } else if (value ?? !next.has(asset.id)) next.add(asset.id);
    else next.delete(asset.id);
    anchor.current = asset.id;
    onCheckedChange(next);
  }, [assets, checkedIds, onCheckedChange]);
  const activate = useCallback((asset: MediaLibraryAsset, event: MouseEvent) => {
    if (checking && (event.metaKey || event.ctrlKey || event.shiftKey || checkedCount > 0)) {
      event.preventDefault();
      check(asset, event);
      return;
    }
    onActivate(asset, event);
  }, [check, checkedCount, checking, onActivate]);
  const allChecked = checking && assets.length > 0 && assets.every((asset) => checkedIds!.has(asset.id));
  const checkAll = (on: boolean) => onCheckedChange?.(on ? new Set([...(checkedIds ?? []), ...assets.map((asset) => asset.id)]) : new Set());
  const onKeyDown = (event: KeyboardEvent) => {
    if (!checking) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true], [role=combobox], [role=menu], [role=dialog]")) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && assets.length) {
      event.preventDefault();
      checkAll(true);
    } else if (event.key === "Escape" && checkedCount) {
      event.preventDefault();
      onCheckedChange?.(new Set());
    }
  };
  // Shift-click picks a range; it should never also select the page's text.
  const noTextSelection = (event: MouseEvent) => { if (event.shiftKey && checking && !(event.target as HTMLElement).closest("input, textarea")) event.preventDefault(); };

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-3" data-media-browser="" data-media-checking={checkedCount ? "" : undefined} onKeyDown={onKeyDown} onMouseDown={noTextSelection}>
      <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Search media">
        <InputGroup className={cn("min-w-0 flex-1", compact ? "basis-full" : "basis-64")}>
          <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search media by name, alt text, creator, credit or rights"
            placeholder="Search filename, alt text, creator, credit…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onFiltersChange({ ...filters, search: text });
              }
              if (event.key === "Escape" && text) {
                event.preventDefault();
                setText("");
                onFiltersChange({ ...filters, search: "" });
              }
            }}
            data-media-search=""
          />
          {text ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => { setText(""); onFiltersChange({ ...filters, search: "" }); }}><X aria-hidden="true" /></InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <MediaFilters filters={filters} onChange={onFiltersChange} navigator={navigator} fixedKind={props.fixedKind} />
        <Select items={MEDIA_SORTS} value={sort} onValueChange={(value) => { if (value) onSortChange(value as MediaLibrarySort); }}>
          <SelectTrigger aria-label="Sort" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MEDIA_SORTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <ToggleGroup aria-label="Layout" variant="outline" spacing={0} value={[layout]} onValueChange={(value) => { const next = value[0] as MediaLayout | undefined; if (next) onLayoutChange(next); }}>
          <ToggleGroupItem value="grid" aria-label="Grid"><LayoutGrid aria-hidden="true" /><span className={cn(compact && "sr-only")}>Grid</span></ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List"><List aria-hidden="true" /><span className={cn(compact && "sr-only")}>List</span></ToggleGroupItem>
        </ToggleGroup>
        {toolbarEnd}
      </div>

      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" aria-live="polite">
        <span data-media-result-count="">
          {library.isPending ? "Loading…" : searching ? `${total} ${total === 1 ? "result" : "results"} for “${filters.search.trim()}” in ${scopeName}` : `${total} ${total === 1 ? "file" : "files"}`}
        </span>
        {searching && folderId !== null ? (
          <ToggleGroup aria-label="Search in" size="sm" variant="outline" spacing={0} value={[filters.searchScope]} onValueChange={(value) => { const next = value[0] as MediaLibraryFilters["searchScope"] | undefined; if (next) set({ searchScope: next }); }}>
            <ToggleGroupItem value="all">All media</ToggleGroupItem>
            <ToggleGroupItem value="folder">{folderName ? `Only ${folderName}` : "This folder"}</ToggleGroupItem>
          </ToggleGroup>
        ) : null}
        {searching && folderId === null && source !== "all" && onSearchEverywhere ? <Button variant="link" size="sm" className="h-auto p-0" onClick={onSearchEverywhere}>Search all media</Button> : null}
        {activeFilterCount(props.fixedKind ? { ...filters, type: "" } : filters) ? <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onFiltersChange({ ...EMPTY_MEDIA_FILTERS, search: filters.search, searchScope: filters.searchScope })}>Clear filters</Button> : null}
      </div>

      {library.isError && !library.data ? (
        <Empty className="border"><EmptyHeader><EmptyTitle>Media couldn't be loaded</EmptyTitle><EmptyDescription>{(library.error as { message?: string })?.message || "Try again."}</EmptyDescription></EmptyHeader><Button variant="outline" onClick={() => void library.refetch()}>Try again</Button></Empty>
      ) : library.isPending ? (
        layout === "grid" ? <TileSkeletons /> : <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
      ) : !assets.length ? (
        <Empty className="border" data-media-empty="">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileImage aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>{searching || activeFilterCount(filters) ? "Nothing matches" : folderId !== null ? "This folder is empty" : "No files here yet"}</EmptyTitle>
            <EmptyDescription>{searching || activeFilterCount(filters) ? "Try other words, search all media, or clear a filter." : folderId !== null ? "Upload into this folder, or move files here from another view." : "Uploaded photos, graphics, PDFs and audio appear here."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div ref={listRef} className={cn("transition-opacity", library.isPlaceholderData && "opacity-60")} aria-busy={library.isFetching || undefined}>
          {layout === "grid" ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 max-sm:grid-cols-2 max-sm:gap-2" aria-label={label} data-media-grid="">
              {assets.map((asset) => {
                const checked = checkedIds?.has(asset.id) ?? false;
                return (
                  <li key={asset.id} className="group/item relative min-w-0">
                    <WithMenu asset={asset} menu={assetMenu}>
                      <AssetTile asset={asset} timezone={timezone} selected={selectedIds ? selectedIds.has(asset.id) : selectedId === asset.id} picking={Boolean(selectedIds)} checked={checked} onActivate={checking ? activate : onActivate} />
                    </WithMenu>
                    {checking ? (
                      <span className={cn("absolute top-2 left-2 flex size-6 items-center justify-center rounded-md bg-background/90 shadow-xs transition-opacity", checked || checkedCount ? "opacity-100" : "opacity-0 group-hover/item:opacity-100 has-focus-visible:opacity-100")}>
                        <Checkbox checked={checked} aria-label={`Select ${asset.filename}`} onCheckedChange={(value, details) => check(asset, details.event as { shiftKey?: boolean }, value)} data-media-check={asset.id} />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : table ? (
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table aria-label={label} data-media-table="">
                <TableHeader className="bg-muted/20"><TableRow className="hover:bg-transparent">{checking ? <TableHead className="w-10"><Checkbox checked={allChecked} indeterminate={!allChecked && checkedCount > 0} aria-label={allChecked ? "Clear selection" : "Select all loaded files"} onCheckedChange={(value) => checkAll(value)} data-media-check-all="" /></TableHead> : null}<TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Captured</TableHead><TableHead>Uploader</TableHead><TableHead>Credit</TableHead><TableHead>Metadata</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
                <TableBody>
                  {assets.map((asset) => {
                    const selected = selectedIds ? selectedIds.has(asset.id) : selectedId === asset.id;
                    const checked = checkedIds?.has(asset.id) ?? false;
                    const open = checking ? activate : onActivate;
                    return (
                      <WithMenu key={asset.id} asset={asset} menu={assetMenu}>
                        <TableRow data-state={selected || checked ? "selected" : undefined} className="cursor-pointer" onClick={(event) => { if (!(event.target as HTMLElement).closest("button, [role=checkbox]")) open(asset, event); }}>
                          {checking ? (
                            <TableCell className="w-10 py-2"><Checkbox checked={checked} aria-label={`Select ${asset.filename}`} onCheckedChange={(value, details) => check(asset, details.event as { shiftKey?: boolean }, value)} data-media-check={asset.id} /></TableCell>
                          ) : null}
                          <TableCell className="max-w-72 py-2">
                            <button type="button" className="flex min-w-0 items-center gap-2.5 text-left font-medium outline-none focus-visible:underline" aria-pressed={selected} onClick={(event) => open(asset, event)} data-media-asset={asset.id}>
                              <AssetThumbnail asset={asset} className="size-9 shrink-0 rounded" />
                              <span className="truncate">{asset.filename}</span>
                              {selected && !checking ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
                            </button>
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">{KIND_LABELS[asset.kind]}</TableCell>
                          <TableCell className="py-2 text-muted-foreground">{asset.capturedAt ? shortDay(asset.capturedAt, timezone) : "—"}</TableCell>
                          <TableCell className="py-2 text-muted-foreground">{asset.uploadedBy?.name ?? "—"}</TableCell>
                          <TableCell className="max-w-48 truncate py-2 text-muted-foreground">{asset.credit || asset.creator || "—"}</TableCell>
                          <TableCell className="py-2"><GapSummary asset={asset} /></TableCell>
                          <TableCell className="py-2 text-muted-foreground">{shortDay(asset.updatedAt, timezone)}</TableCell>
                        </TableRow>
                      </WithMenu>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <ItemGroup className="gap-0 overflow-hidden rounded-lg border bg-card" aria-label={label} data-media-items="">
              {assets.map((asset) => {
                const selected = selectedIds ? selectedIds.has(asset.id) : selectedId === asset.id;
                const checked = checkedIds?.has(asset.id) ?? false;
                return (
                  <div key={asset.id} className="flex items-center border-b last:border-b-0">
                  {checking ? <span className="flex shrink-0 items-center pl-3"><Checkbox checked={checked} aria-label={`Select ${asset.filename}`} onCheckedChange={(value, details) => check(asset, details.event as { shiftKey?: boolean }, value)} data-media-check={asset.id} /></span> : null}
                  <WithMenu asset={asset} menu={assetMenu}>
                    <Item size="sm" className={cn("min-w-0 flex-1 rounded-none", (selected || checked) && "bg-muted")} render={<button type="button" aria-pressed={selected} onClick={(event) => (checking ? activate : onActivate)(asset, event)} data-media-asset={asset.id} />}>
                      <ItemMedia variant="image"><AssetThumbnail asset={asset} className="size-full" /></ItemMedia>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full truncate">{asset.filename}</ItemTitle>
                        <ItemDescription className="truncate">{[KIND_LABELS[asset.kind], asset.capturedAt ? shortDay(asset.capturedAt, timezone) : shortDay(asset.createdAt, timezone), asset.uploadedBy?.name].filter(Boolean).join(" · ")}</ItemDescription>
                      </ItemContent>
                      {selected && !checking ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : asset.gaps.length ? <CircleAlert aria-label={asset.gaps.map((gap) => GAP_LABELS[gap]).join(", ")} className="size-4 shrink-0 text-amber-600" /> : null}
                    </Item>
                  </WithMenu>
                  </div>
                );
              })}
            </ItemGroup>
          )}
          <div ref={sentinel} className="flex justify-center py-4">
            {library.hasNextPage ? <Button variant="outline" onClick={() => void library.fetchNextPage()} disabled={library.isFetchingNextPage}>{library.isFetchingNextPage ? "Loading…" : "Load more"}</Button> : assets.length > MEDIA_PAGE_SIZE ? <span className="text-xs text-muted-foreground">All {total} files shown</span> : null}
          </div>
        </div>
      )}
      {selectionBar && checkedCount ? <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex justify-center px-2" data-media-selection-dock="">{selectionBar}</div> : null}
    </div>
  );
}

function WithMenu({ asset, menu, children }: { asset: MediaLibraryAsset; menu?: (asset: MediaLibraryAsset) => ReactNode; children: ReactElement }) {
  if (!menu) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">{menu(asset)}</ContextMenuContent>
    </ContextMenu>
  );
}

/** A file's day in the newsroom, short ("Nov 4"; with the year when it isn't this year). */
export function shortDay(value: string, timezone: string): string {
  const day = siteDay(value, timezone);
  if (!day) return "";
  const date = new Date(`${day}T12:00:00Z`);
  const thisYear = siteDay(new Date(), timezone).slice(0, 4) === day.slice(0, 4);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(date);
}

/** The private preview when there is one; otherwise the file type, never the original. */
export function AssetThumbnail({ asset, className, eager = false }: { asset: MediaLibraryAsset; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const Icon = KIND_ICONS[asset.kind];
  if (asset.previewUrl && !failed) {
    return <img src={asset.previewUrl} alt="" loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} onError={() => setFailed(true)} className={cn("bg-muted object-cover", className)} />;
  }
  return (
    <span className={cn("flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground", className)} aria-hidden="true">
      <Icon className="size-6" />
    </span>
  );
}

/**
 * One grid tile. Extra props (the context menu trigger's handlers and ref) go
 * to the tile's button, so a right-click opens the file's menu.
 */
function AssetTile({ asset, timezone, selected, picking, checked, onActivate, className, ...rest }: { asset: MediaLibraryAsset; timezone: string; selected: boolean; picking: boolean; checked: boolean; onActivate: (asset: MediaLibraryAsset, event: MouseEvent) => void } & Omit<ComponentProps<"button">, "onClick">) {
  const when = shortDay(asset.capturedAt ?? asset.createdAt, timezone);
  const gaps = asset.gaps.map((gap) => GAP_LABELS[gap]).join(", ");
  return (
    <button
      {...rest}
      type="button"
      className={cn(
        "group/tile flex w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-left shadow-xs outline-none transition-[box-shadow,border-color] hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
        checked && "border-primary bg-primary/5 ring-2 ring-primary",
        selected && !checked && (picking ? "border-primary ring-2 ring-primary" : "border-foreground/40 ring-2 ring-foreground/15")
      )}
      aria-pressed={selected}
      aria-label={[asset.filename, KIND_LABELS[asset.kind], when, asset.uploadedBy?.name, gaps].filter(Boolean).join(", ")}
      onClick={(event) => onActivate(asset, event)}
      data-media-asset={asset.id}
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
        <AssetThumbnail asset={asset} className="absolute inset-0 size-full" />
        {!asset.previewUrl ? <span className="absolute bottom-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground">{KIND_LABELS[asset.kind]}</span> : null}
        {selected && picking ? <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow" aria-hidden="true"><Check className="size-4" /></span> : null}
        {asset.gaps.length && !(selected && picking) ? <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-background/90 text-amber-600 shadow-xs" title={gaps} aria-hidden="true"><CircleAlert className="size-4" /></span> : null}
      </span>
      <span className="flex min-w-0 flex-col px-2.5 py-2">
        <span className="truncate text-sm font-medium">{asset.filename}</span>
        <span className="truncate text-xs text-muted-foreground">{[when, asset.uploadedBy?.name?.split(" ")[0]].filter(Boolean).join(" · ")}</span>
      </span>
    </button>
  );
}

function GapSummary({ asset }: { asset: MediaLibraryAsset }) {
  if (!asset.gaps.length) return <span className="text-muted-foreground">Complete</span>;
  return <span className="flex flex-wrap gap-1">{asset.gaps.map((gap) => <Badge key={gap} variant="outline" className="border-amber-300 text-amber-800">{GAP_LABELS[gap].replace("Missing ", "No ")}</Badge>)}</span>;
}

function TileSkeletons() {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 max-sm:grid-cols-2 max-sm:gap-2" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <li key={index} className="flex flex-col overflow-hidden rounded-lg border">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="flex flex-col gap-1.5 p-2.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
        </li>
      ))}
    </ul>
  );
}

const TYPE_ITEMS = [{ value: ANY, label: "Any type" }, { value: "image", label: "Images" }, { value: "document", label: "PDFs" }, { value: "audio", label: "Audio" }];
const PUBLICATION_ITEMS = [{ value: ANY, label: "Any state" }, ...(Object.entries(PUBLICATION_ASSET_LABELS) as Array<[MediaPublicationAssetState, string]>).map(([value, label]) => ({ value, label }))];

function MediaFilters({ filters, onChange, navigator, fixedKind }: { filters: MediaLibraryFilters; onChange: (filters: MediaLibraryFilters) => void; navigator?: MediaNavigatorData; fixedKind?: MediaKind }) {
  const count = activeFilterCount(fixedKind ? { ...filters, type: "" } : filters);
  const uploaders = [{ value: ANY, label: "Anyone" }, ...(navigator?.uploaders ?? []).map((person) => ({ value: String(person.id), label: person.name }))];
  const set = (patch: Partial<MediaLibraryFilters>) => onChange({ ...filters, ...patch });
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <ListFilter data-icon="inline-start" aria-hidden="true" />Filters{count ? <Badge variant="secondary" className="ml-0.5">{count}</Badge> : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select items={TYPE_ITEMS} disabled={Boolean(fixedKind)} value={filters.type || ANY} onValueChange={(value) => set({ type: !value || value === ANY ? "" : (value as MediaKind) })}>
              <SelectTrigger aria-label="Type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPE_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Uploader</FieldLabel>
            <Select items={uploaders} value={filters.uploaderId === null ? ANY : String(filters.uploaderId)} onValueChange={(value) => set({ uploaderId: !value || value === ANY ? null : Number(value) })}>
              <SelectTrigger aria-label="Uploader" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{uploaders.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field><FieldLabel htmlFor="media-captured-from">Captured from</FieldLabel><Input id="media-captured-from" type="date" value={filters.capturedFrom} onChange={(event) => set({ capturedFrom: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="media-captured-to">Captured to</FieldLabel><Input id="media-captured-to" type="date" value={filters.capturedTo} onChange={(event) => set({ capturedTo: event.target.value })} /></Field>
          </div>
          <Field>
            <FieldLabel>Publication assets</FieldLabel>
            <Select items={PUBLICATION_ITEMS} value={filters.publication || ANY} onValueChange={(value) => set({ publication: !value || value === ANY ? "" : (value as MediaPublicationAssetState) })}>
              <SelectTrigger aria-label="Publication assets" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{PUBLICATION_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="media-needs-metadata" checked={filters.needsMetadata} onCheckedChange={(checked) => set({ needsMetadata: Boolean(checked) })} />
            <FieldLabel htmlFor="media-needs-metadata" className="font-normal">Only files missing alt text, credit or rights</FieldLabel>
          </Field>
          {count ? <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange({ ...EMPTY_MEDIA_FILTERS, search: filters.search, searchScope: filters.searchScope })}>Clear filters</Button> : null}
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
