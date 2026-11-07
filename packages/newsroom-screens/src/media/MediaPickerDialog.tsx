import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import type { MediaLibraryFetchers } from "./media-library-api";
import { MediaLibraryBrowser, type MediaLayout } from "./MediaLibraryBrowser";
import { DEFAULT_MEDIA_ROUTE, EMPTY_MEDIA_FILTERS, folderPath, MEDIA_LIBRARY_SOURCES, type MediaKind, type MediaLibraryAsset, type MediaLibraryFilters, type MediaLibrarySort, type MediaRoute } from "./media-library-model";
import { MediaNavigatorContent } from "./MediaNavigatorContent";
import { useMediaNavigator } from "./media-query";

export type MediaPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchers: Pick<MediaLibraryFetchers, "getNavigator" | "getLibrary">;
  timezone: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  multiple?: boolean;
  /** Start filtered to one kind of file (a photo assignment starts on images); the reader can clear it. */
  kind?: MediaKind | "";
  /** A relationship that accepts only this file kind (for example a portrait). */
  restrictedKind?: MediaKind;
  onConfirm: (assets: MediaLibraryAsset[]) => void;
};

/**
 * Choosing existing files from the Byline Media Library: the same browser,
 * search, filters and folders as the Media screen, in selection mode, with
 * several files at once and a running count. Used to link files to
 * production assignments (and, later, any other asset selector). Its
 * browsing state is its own: it never changes the Media screen's address.
 */
export function MediaPickerDialog({ open, onOpenChange, fetchers, timezone, title = "Choose files", description = "Browse folders or search the Library, then choose one or more files.", confirmLabel = "Link files", multiple = true, kind = "", restrictedKind, onConfirm }: MediaPickerDialogProps) {
  const navigator = useMediaNavigator(fetchers);
  const [route, setRoute] = useState<MediaRoute>(DEFAULT_MEDIA_ROUTE);
  const [filters, setFilters] = useState<MediaLibraryFilters>({ ...EMPTY_MEDIA_FILTERS, type: kind });
  const [sort, setSort] = useState<MediaLibrarySort>("newest");
  const [layout, setLayout] = useState<MediaLayout>("grid");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<Map<number, MediaLibraryAsset>>(() => new Map());

  // Every opening is a fresh choice.
  useEffect(() => {
    if (!open) return;
    setRoute(DEFAULT_MEDIA_ROUTE);
    setFilters({ ...EMPTY_MEDIA_FILTERS, type: restrictedKind ?? kind });
    setSelected(new Map());
  }, [kind, restrictedKind, open]);

  const folders = navigator.data?.folders ?? [];
  const folderName = route.folderId !== null ? folders.find((folder) => folder.id === route.folderId)?.name : undefined;
  const ids = useMemo(() => new Set(selected.keys()), [selected]);
  const toggle = useCallback((asset: MediaLibraryAsset, _event: MouseEvent | null) => {
    if (restrictedKind && asset.kind !== restrictedKind) return;
    setSelected((current) => {
      const next = new Map(multiple ? current : []);
      if (current.has(asset.id)) next.delete(asset.id);
      else next.set(asset.id, asset);
      return next;
    });
  }, [multiple, restrictedKind]);
  const places = useMemo(() => [
    ...MEDIA_LIBRARY_SOURCES.map((source) => ({ value: `source:${source.value}`, label: source.label })),
    ...folders.map((folder) => ({ value: `folder:${folder.id}`, label: folderPath(folders, folder.id).map((item) => item.name).join(" / ") })).sort((a, b) => a.label.localeCompare(b.label))
  ], [folders]);
  const place = route.folderId !== null ? `folder:${route.folderId}` : `source:${route.source}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88dvh,820px)] flex-col gap-0 p-0 sm:max-w-[min(96vw,1100px)]" data-media-picker="">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Media Library" className="hidden w-60 shrink-0 overflow-y-auto border-r bg-sidebar text-sidebar-foreground md:block">
            <MediaNavigatorContent data={navigator.data} loading={navigator.isPending} route={route} onNavigate={setRoute} showWork={false} expanded={expanded} onExpandedChange={(id, isOpen) => setExpanded((current) => { const next = new Set(current); if (isOpen) next.add(id); else next.delete(id); return next; })} />
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <Select items={places} value={place} onValueChange={(value) => {
              const [type, id] = String(value ?? "source:all").split(":");
              setRoute(type === "folder" ? { ...DEFAULT_MEDIA_ROUTE, folderId: Number(id) } : { ...DEFAULT_MEDIA_ROUTE, source: id as MediaRoute["source"] });
            }}>
              <SelectTrigger aria-label="Browse" className="w-full md:hidden"><SelectValue /></SelectTrigger>
              <SelectContent>{places.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            <MediaLibraryBrowser
              fetchers={fetchers}
              source={route.source}
              folderId={route.folderId}
              folderName={folderName}
              navigator={navigator.data}
              filters={filters}
              onFiltersChange={(next) => setFilters(restrictedKind ? { ...next, type: restrictedKind } : next)}
              fixedKind={restrictedKind}
              sort={sort}
              onSortChange={setSort}
              layout={layout}
              onLayoutChange={setLayout}
              timezone={timezone}
              selectedIds={ids}
              onActivate={toggle}
              onSearchEverywhere={() => setRoute(DEFAULT_MEDIA_ROUTE)}
              label="Files to choose from"
              compact
            />
          </div>
        </div>
        <DialogFooter className="m-0 items-center border-t p-4 sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite" data-media-picker-count="">{selected.size ? `${selected.size} selected` : multiple ? "Choose one or more files" : "Choose a file"}</p>
          <div className="flex gap-2">
            {selected.size ? <Button variant="ghost" onClick={() => setSelected(new Map())}>Clear</Button> : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!selected.size} onClick={() => { onConfirm([...selected.values()]); onOpenChange(false); }}>{selected.size > 1 ? `${confirmLabel} (${selected.size})` : confirmLabel}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
