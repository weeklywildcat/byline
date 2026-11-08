import { cn } from "@byline/newsroom-ui/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub
} from "@byline/newsroom-ui/ui/sidebar";
import {
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Clock,
  Folder,
  FolderOpen,
  FolderPlus,
  Images,
  Inbox,
  ListChecks,
  PaperclipIcon,
  UserCheck,
  UserRound,
  UserX,
  type LucideIcon
} from "lucide-react";
import { useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { MEDIA_WORK_SCOPES, type MediaWorkScope } from "./media-desk-model";
import { buildFolderTree, draggedMediaIds, MEDIA_DRAG_TYPE, MEDIA_LIBRARY_SOURCES, type MediaFolderNode, type MediaLibrarySource, type MediaNavigatorData, type MediaRoute } from "./media-library-model";

const SOURCE_ICONS: Record<MediaLibrarySource, LucideIcon> = { all: Images, recent: Clock, mine: UserRound, "needs-metadata": CircleAlert, unfiled: Inbox };
const WORK_ICONS: Record<MediaWorkScope, LucideIcon> = { mine: UserCheck, all: ListChecks, due: CalendarClock, "needs-files": PaperclipIcon, unassigned: UserX };

/** Library scopes that earn a count: the ones that ask for attention or tidying, not every total. */
const COUNTED_SOURCES = new Set<MediaLibrarySource>(["needs-metadata", "unfiled"]);
const COUNTED_SCOPES = new Set<MediaWorkScope>(["mine", "due", "needs-files", "unassigned"]);

export type MediaNavigatorContentProps = {
  data: MediaNavigatorData | undefined;
  loading?: boolean;
  route: MediaRoute;
  /** Where a route lives (a real link: middle-click and copy work). Absent in a picker, which has no address. */
  hrefFor?: (route: MediaRoute) => string;
  onNavigate: (route: MediaRoute) => void;
  /** Counts for the Work views, from the same rows the Work screen shows. */
  workCounts?: Partial<Record<MediaWorkScope, number>>;
  /** Unassigned is an editor's view. */
  showUnassigned?: boolean;
  /** The picker shows the Library and folders only. */
  showWork?: boolean;
  expanded: ReadonlySet<number>;
  onExpandedChange: (folderId: number, open: boolean) => void;
  /** Editors: create a top-level folder. */
  onNewFolder?: () => void;
  /** A slot for a future group (e.g. Collections) between Work and Folders. */
  extraGroups?: ReactNode;
  /** Library files dropped on a folder (or on Unfiled: null) are moved there. */
  onDropAssets?: (folderId: number | null, ids: number[]) => void;
};

/** Drop handlers for a navigator row that takes dragged Library files, and whether a drag is over it. */
function useAssetDrop(target: number | null, onDropAssets?: (folderId: number | null, ids: number[]) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  if (!onDropAssets) return { over: false, props: {} };
  const carries = (event: DragEvent) => [...event.dataTransfer.types].includes(MEDIA_DRAG_TYPE);
  return {
    over,
    props: {
      onDragEnter: (event: DragEvent) => { if (!carries(event)) return; event.preventDefault(); depth.current += 1; setOver(true); },
      onDragOver: (event: DragEvent) => { if (!carries(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; },
      onDragLeave: (event: DragEvent) => { if (!carries(event)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
      onDrop: (event: DragEvent) => {
        if (!carries(event)) return;
        event.preventDefault();
        event.stopPropagation();
        depth.current = 0;
        setOver(false);
        const ids = draggedMediaIds(event.dataTransfer);
        if (ids.length) onDropAssets(target, ids);
      }
    }
  };
}

const DROP_OVER = "ring-2 ring-primary ring-inset bg-sidebar-accent";

/**
 * The Media navigator: where in Media the reader is. One component for the
 * wide workspace's contextual pane, the narrow screens' sheet and the picker.
 *
 * - **Library**: useful scopes over the files (All media, Recent, Uploaded by
 *   me, Needs metadata, Unfiled). Plain menu items: they are filters, not
 *   folders, and never look like folders.
 * - **Work**: production-work views (My assignments, All, Due soon, Needs
 *   files, Unassigned for editors).
 * - **Folders**: shadcn sidebar-11's collapsible tree over Payload's real
 *   folders, and only folders: files appear in the content browser, never as
 *   leaves here. A folder is a destination, so its row selects it (and opens
 *   it) while the chevron alone expands or collapses it.
 */
export function MediaNavigatorContent({ data, loading = false, route, hrefFor, onNavigate, workCounts, showUnassigned = false, showWork = true, expanded, onExpandedChange, onNewFolder, extraGroups, onDropAssets }: MediaNavigatorContentProps) {
  const unfiledDrop = useAssetDrop(null, onDropAssets);
  const tree = useMemo(() => buildFolderTree(data?.folders ?? []), [data?.folders]);
  const go = (next: MediaRoute) => (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(next);
  };
  const link = (next: MediaRoute, current: boolean) => (hrefFor ? <a href={hrefFor(next)} onClick={go(next)} aria-current={current ? "page" : undefined} /> : <button type="button" onClick={() => onNavigate(next)} aria-current={current ? "page" : undefined} />);
  const library = (source: MediaLibrarySource): MediaRoute => ({ view: "library", source, folderId: null, scope: route.scope, assetId: null });
  const work = (scope: MediaWorkScope): MediaRoute => ({ view: "work", source: "all", folderId: null, scope, assetId: null });

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Library</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {MEDIA_LIBRARY_SOURCES.map((source) => {
              const Icon = SOURCE_ICONS[source.value];
              const current = route.view === "library" && route.folderId === null && route.source === source.value;
              const count = data?.counts[source.value];
              const drop = source.value === "unfiled" ? unfiledDrop : null;
              return (
                <SidebarMenuItem key={source.value} {...(drop?.props ?? {})}>
                  <SidebarMenuButton isActive={current} className={cn(drop?.over && DROP_OVER)} render={link(library(source.value), current)} data-media-source={source.value}>
                    <Icon aria-hidden="true" />
                    <span>{source.label}</span>
                  </SidebarMenuButton>
                  {COUNTED_SOURCES.has(source.value) && count ? <SidebarMenuBadge aria-label={`${count} ${count === 1 ? "file" : "files"}`}>{count}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {showWork ? (
        <SidebarGroup>
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MEDIA_WORK_SCOPES.filter((scope) => !scope.editorsOnly || showUnassigned).map((scope) => {
                const Icon = WORK_ICONS[scope.value];
                const current = route.view === "work" && route.scope === scope.value;
                const count = workCounts?.[scope.value];
                return (
                  <SidebarMenuItem key={scope.value}>
                    <SidebarMenuButton isActive={current} render={link(work(scope.value), current)} data-media-work={scope.value}>
                      <Icon aria-hidden="true" />
                      <span>{scope.label}</span>
                    </SidebarMenuButton>
                    {COUNTED_SCOPES.has(scope.value) && count ? <SidebarMenuBadge aria-label={`${count} ${count === 1 ? "assignment" : "assignments"}`}>{count}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {extraGroups}

      <SidebarGroup>
        <SidebarGroupLabel>Folders</SidebarGroupLabel>
        {onNewFolder ? (
          <SidebarGroupAction type="button" onClick={onNewFolder} aria-label="New folder" title="New folder">
            <FolderPlus aria-hidden="true" />
          </SidebarGroupAction>
        ) : null}
        <SidebarGroupContent>
          <SidebarMenu aria-label="Folders" data-media-folder-tree="">
            {loading && !data ? (
              Array.from({ length: 3 }, (_, index) => <SidebarMenuItem key={index}><SidebarMenuSkeleton showIcon /></SidebarMenuItem>)
            ) : tree.length ? (
              tree.map((node) => <FolderTreeItem key={node.id} node={node} route={route} expanded={expanded} onExpandedChange={onExpandedChange} link={link} onNavigate={onNavigate} onDropAssets={onDropAssets} />)
            ) : (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">{onNewFolder ? "No folders yet. Files can live in folders as well as in the Library views above." : "No folders yet."}</li>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

type FolderItemProps = {
  node: MediaFolderNode;
  route: MediaRoute;
  expanded: ReadonlySet<number>;
  onExpandedChange: (folderId: number, open: boolean) => void;
  link: (route: MediaRoute, current: boolean) => ReactElement;
  onNavigate: (route: MediaRoute) => void;
  onDropAssets?: (folderId: number | null, ids: number[]) => void;
};

function FolderTreeItem({ node, route, expanded, onExpandedChange, link, onNavigate, onDropAssets }: FolderItemProps) {
  const drop = useAssetDrop(node.id, onDropAssets);
  const open = expanded.has(node.id);
  const current = route.view === "library" && route.folderId === node.id;
  const target: MediaRoute = { view: "library", source: "all", folderId: node.id, scope: route.scope, assetId: null };
  const children = node.children.length > 0;
  const Icon = open && children ? FolderOpen : Folder;
  // The row is a destination; choosing it also opens it so its subfolders are in reach.
  const select = () => { if (children && !open) onExpandedChange(node.id, true); };
  return (
    <SidebarMenuItem data-media-folder={node.id}>
      <Collapsible open={open && children} onOpenChange={(next) => onExpandedChange(node.id, next)}>
        <SidebarMenuButton
          {...drop.props}
          isActive={current}
          className={cn("pl-7", current && "font-medium", drop.over && DROP_OVER)}
          render={link(target, current)}
          onClick={select}
          title={node.name}
        >
          <Icon aria-hidden="true" />
          <span>{node.name}</span>
        </SidebarMenuButton>
        {children ? (
          <CollapsibleTrigger
            render={<SidebarMenuAction type="button" className="right-auto left-1 text-muted-foreground" aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} />}
          >
            <ChevronRight aria-hidden="true" className={cn("transition-transform", open && "rotate-90")} />
          </CollapsibleTrigger>
        ) : null}
        {children ? (
          <CollapsibleContent>
            <SidebarMenuSub className="mr-0 pr-0">
              {node.children.map((child) => <FolderTreeItem key={child.id} node={child} route={route} expanded={expanded} onExpandedChange={onExpandedChange} link={link} onNavigate={onNavigate} onDropAssets={onDropAssets} />)}
            </SidebarMenuSub>
          </CollapsibleContent>
        ) : null}
      </Collapsible>
    </SidebarMenuItem>
  );
}
