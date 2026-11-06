import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ListFilter, MoreHorizontal, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@byline/newsroom-ui/ui/sidebar";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { describeEditorialError } from "../editorial/editorial-model";
import { savedViewsKey } from "../story/story-query";
import type { PlanningFetchers } from "./planning-api";
import type { PlanningFilters, PlanningSort, SavedPlanningView } from "./planning-model";
import {
  activeStoryView,
  activeStoryViewLabel,
  applyBuiltInView,
  applySavedView,
  BUILT_IN_STORY_VIEWS,
  SAVED_VIEW_LIMIT,
  SAVED_VIEW_NAME_MAX_LENGTH,
  type ActiveStoryView,
  type AppliedView,
  type BuiltInStoryView
} from "./story-views";

export type { AppliedView } from "./story-views";

/* ----------------------------------------------------------- controller */

type ViewsDialog = null | { kind: "save" } | { kind: "rename"; view: SavedPlanningView } | { kind: "manage" };

export type StoryViewsOptions = {
  fetchers: PlanningFetchers;
  filters: PlanningFilters;
  sort: PlanningSort;
  selectedId: string | null;
  onApply: (view: AppliedView) => void;
  /** Saved views that arrived with the stories response, so the menu is complete before its own request returns. */
  initialViews?: SavedPlanningView[];
};

/**
 * Which story set the reader is looking at: the built-in views, their own
 * saved views, and saving, renaming, updating and deleting (with Undo). One
 * controller drives both presentations, the wide rail and the compact
 * picker, so the two can never behave differently.
 */
export type StoryViewsController = {
  active: ActiveStoryView;
  label: string;
  builtIns: readonly BuiltInStoryView[];
  savedViews: SavedPlanningView[];
  canSave: boolean;
  canDelete: boolean;
  /** No more views can be saved until one is deleted. */
  full: boolean;
  chooseBuiltIn: (view: BuiltInStoryView) => void;
  chooseSaved: (view: SavedPlanningView) => void;
  /** Overwrite the selected saved view with the current filters and sort (only while it is modified). */
  updateSelected: () => void;
  openSave: () => void;
  openRename: (view: SavedPlanningView) => void;
  openManage: () => void;
  remove: (view: SavedPlanningView) => void;
  /** The Save, Rename and Manage dialogs. Render exactly once, beside whichever presentations are mounted. */
  dialogs: ReactNode;
};

export function useStoryViews({ fetchers, filters, sort, selectedId, onApply, initialViews }: StoryViewsOptions): StoryViewsController {
  const client = useQueryClient();
  const [dialog, setDialog] = useState<ViewsDialog>(null);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: savedViewsKey, queryFn: () => fetchers.getSavedViews!(), enabled: Boolean(fetchers.getSavedViews), initialData: initialViews, staleTime: 30_000, retry: false });
  const savedViews = useMemo(() => query.data || initialViews || [], [initialViews, query.data]);
  const active = activeStoryView(filters, sort, savedViews, selectedId);
  const canSave = Boolean(fetchers.saveSavedView);
  const canDelete = Boolean(fetchers.deleteSavedView);

  const putView = useCallback((view: SavedPlanningView) => client.setQueryData<SavedPlanningView[]>(savedViewsKey, (old) => {
    const current = old || [];
    return current.some((item) => item.id === view.id) ? current.map((item) => item.id === view.id ? view : item) : [view, ...current];
  }), [client]);
  const save = useMutation({
    mutationFn: (input: { id?: string; name: string; filters: PlanningFilters; sort: PlanningSort }) => fetchers.saveSavedView!(input),
    onSuccess: (view, input) => {
      putView(view);
      setDialog(null);
      setError("");
      if (!input.id || input.id === selectedId) onApply(applySavedView(view));
      toast.success(input.id ? "View updated." : "View saved.");
    },
    onError: (failure) => {
      const message = describeEditorialError(failure, "The view could not be saved.");
      setError(message);
      // Updating in place has no dialog to show the reason in.
      if (!dialog) toast.error(message);
    }
  });
  const restore = useMutation({
    mutationFn: (view: SavedPlanningView) => fetchers.saveSavedView!({ id: view.id, name: view.name, filters: view.filters, sort: view.sort }),
    onSuccess: (view) => { putView(view); toast.success("View restored."); },
    onError: (failure) => toast.error(describeEditorialError(failure, "The view could not be restored."))
  });
  const remove = useMutation({
    mutationFn: (view: SavedPlanningView) => fetchers.deleteSavedView!(view.id),
    onSuccess: (_result, view) => {
      client.setQueryData<SavedPlanningView[]>(savedViewsKey, (old) => (old || []).filter((item) => item.id !== view.id));
      // The stories stay as they are; they are simply no longer a saved view.
      if (view.id === selectedId) onApply({ filters, sort, savedViewId: null });
      toast("View deleted.", { duration: 10_000, action: canSave ? { label: "Undo", onClick: () => restore.mutate(view) } : undefined });
    },
    onError: (failure) => toast.error(describeEditorialError(failure, "The view could not be deleted."))
  });

  const close = () => { if (!save.isPending) { setDialog(null); setError(""); } };
  const editing = dialog?.kind === "rename" ? dialog.view : null;

  const dialogs = <>
    <Dialog open={dialog?.kind === "save" || dialog?.kind === "rename"} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Rename view" : "Save view"}</DialogTitle><DialogDescription>{editing ? "Choose a new name for this view." : "Keep the current filters and sort as a view only you can see."}</DialogDescription></DialogHeader>
        <form onSubmit={(event) => {
          event.preventDefault();
          // A host may render this inside its own form (Payload's document form); never let the submit reach it.
          event.stopPropagation();
          const name = String(new FormData(event.currentTarget).get("name") || "").trim();
          if (!name) return;
          setError("");
          if (editing) save.mutate({ id: editing.id, name, filters: editing.filters, sort: editing.sort });
          else save.mutate({ name, filters, sort });
        }}>
          <FieldGroup className="gap-4">
            <Field><FieldLabel htmlFor="saved-view-name">View name</FieldLabel><Input id="saved-view-name" name="name" required maxLength={SAVED_VIEW_NAME_MAX_LENGTH} autoFocus defaultValue={editing?.name ?? ""} placeholder={"e.g. Publishing this week"} disabled={save.isPending} /></Field>
            {error ? <InlineAlert>{error}</InlineAlert> : null}
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={close} disabled={save.isPending}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? <><Spinner data-icon="inline-start" />Saving…</> : editing ? "Rename" : "Save view"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={dialog?.kind === "manage"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Manage views</DialogTitle><DialogDescription>Rename or delete your saved views.</DialogDescription></DialogHeader>
        {savedViews.length
          ? <ItemGroup className="gap-0">{savedViews.map((view) => <Item key={view.id} size="sm">
            <ItemContent><ItemTitle>{view.name}</ItemTitle></ItemContent>
            <ItemActions><SavedViewActions view={view} canSave={canSave} canDelete={canDelete} onRename={() => setDialog({ kind: "rename", view })} onDelete={() => remove.mutate(view)} /></ItemActions>
          </Item>)}</ItemGroup>
          : <p className="text-sm text-muted-foreground">You have no saved views.</p>}
      </DialogContent>
    </Dialog>
  </>;

  return {
    active,
    label: activeStoryViewLabel(active),
    builtIns: BUILT_IN_STORY_VIEWS,
    savedViews,
    canSave,
    canDelete,
    full: savedViews.length >= SAVED_VIEW_LIMIT,
    chooseBuiltIn: (view) => onApply(applyBuiltInView(view)),
    chooseSaved: (view) => onApply(applySavedView(view)),
    updateSelected: () => { if (active.kind === "saved" && active.modified) save.mutate({ id: active.view.id, name: active.view.name, filters, sort }); },
    openSave: () => { setError(""); setDialog({ kind: "save" }); },
    openRename: (view) => { setError(""); setDialog({ kind: "rename", view }); },
    openManage: () => setDialog({ kind: "manage" }),
    remove: (view) => remove.mutate(view),
    dialogs
  };
}

/** Rename and Delete for one saved view (and Update, for the selected one while it is modified). */
function SavedViewActions({ view, canSave, canDelete, onRename, onDelete, onUpdate, trigger }: {
  view: SavedPlanningView;
  canSave: boolean;
  canDelete: boolean;
  onRename: () => void;
  onDelete: () => void;
  onUpdate?: () => void;
  trigger?: ReactNode;
}) {
  if (!canSave && !canDelete) return null;
  return <DropdownMenu>
    {trigger ?? <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for view ${view.name}`} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>}
    <DropdownMenuContent align="end" className="w-44">
      {onUpdate && canSave ? <DropdownMenuItem onClick={onUpdate}><Check aria-hidden="true" />Update view</DropdownMenuItem> : null}
      {canSave ? <DropdownMenuItem onClick={onRename}><Pencil aria-hidden="true" />Rename</DropdownMenuItem> : null}
      {canDelete ? <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 aria-hidden="true" />Delete</DropdownMenuItem> : null}
    </DropdownMenuContent>
  </DropdownMenu>;
}

const isBuiltIn = (active: ActiveStoryView, view: BuiltInStoryView) => active.kind === "built-in" && active.view.id === view.id;
const isSaved = (active: ActiveStoryView, view: SavedPlanningView) => active.kind === "saved" && active.view.id === view.id;

/* -------------------------------------------------------- wide: the rail */

/**
 * The Stories rail (the sidebar-09 module pane): built-in views, then the
 * reader's saved views, beside Board and List when the Stories container is
 * wide enough. A contextual `<aside>`, not a second app Sidebar.
 */
export function StoryViewsRail({ views, className }: { views: StoryViewsController; className?: string }) {
  const { active } = views;
  return <aside aria-label={"Story views"} className={cn("flex flex-col gap-4 text-sidebar-foreground", className)}>
    <SidebarGroup className="p-0">
      <SidebarGroupLabel render={<h2 />}>Stories</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {views.builtIns.map((view) => <SidebarMenuItem key={view.id}>
            <SidebarMenuButton type="button" isActive={isBuiltIn(active, view)} aria-current={isBuiltIn(active, view) ? "true" : undefined} onClick={() => views.chooseBuiltIn(view)}><span>{view.label}</span></SidebarMenuButton>
          </SidebarMenuItem>)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
    <SidebarGroup className="p-0">
      <SidebarGroupLabel render={<h2 />}>Saved views</SidebarGroupLabel>
      {views.canSave ? <SidebarGroupAction type="button" className="top-1.5 right-1" title={views.full ? `You can keep up to ${SAVED_VIEW_LIMIT} views` : "Save current view"} aria-label={"Save current view"} disabled={views.full} onClick={views.openSave}><Plus aria-hidden="true" /></SidebarGroupAction> : null}
      <SidebarGroupContent>
        {views.savedViews.length
          ? <SidebarMenu>
            {views.savedViews.map((view) => {
              const selected = isSaved(active, view);
              const modified = selected && active.kind === "saved" && active.modified;
              return <SidebarMenuItem key={view.id}>
                <SidebarMenuButton type="button" isActive={selected} aria-current={selected ? "true" : undefined} onClick={() => views.chooseSaved(view)} className={cn(modified && "pr-16")}>
                  <span>{view.name}{modified ? <span className="sr-only"> (modified)</span> : null}</span>
                </SidebarMenuButton>
                {modified ? <SidebarMenuBadge aria-hidden="true" className="right-7 font-normal text-muted-foreground">Edited</SidebarMenuBadge> : null}
                <SavedViewActions view={view} canSave={views.canSave} canDelete={views.canDelete} onRename={() => views.openRename(view)} onDelete={() => views.remove(view)} onUpdate={modified ? views.updateSelected : undefined}
                  trigger={<DropdownMenuTrigger render={<SidebarMenuAction type="button" showOnHover aria-label={`Actions for view ${view.name}`} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>} />
              </SidebarMenuItem>;
            })}
          </SidebarMenu>
          : <p className="px-2 py-1 text-xs text-muted-foreground">{views.canSave ? "Save the filters you use often." : "No saved views."}</p>}
      </SidebarGroupContent>
    </SidebarGroup>
  </aside>;
}

/* ---------------------------------------------------- compact: the picker */

const BUILT_IN_PREFIX = "built-in:";
const SAVED_PREFIX = "saved:";

/** The same views as the rail, in one menu, when the Stories container is too narrow for it. */
export function StoryViewsPicker({ views, className }: { views: StoryViewsController; className?: string }) {
  const { active } = views;
  const value = active.kind === "built-in" ? `${BUILT_IN_PREFIX}${active.view.id}` : active.kind === "saved" ? `${SAVED_PREFIX}${active.view.id}` : "";
  const choose = (key: string) => {
    const builtIn = views.builtIns.find((view) => `${BUILT_IN_PREFIX}${view.id}` === key);
    if (builtIn) return views.chooseBuiltIn(builtIn);
    const saved = views.savedViews.find((view) => `${SAVED_PREFIX}${view.id}` === key);
    if (saved) views.chooseSaved(saved);
  };
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="outline" className={cn("max-w-64", className)} aria-label={`Story view: ${views.label}`} />}>
      <ListFilter data-icon="inline-start" aria-hidden="true" /><span className="truncate">{views.label}</span><ChevronDown data-icon="inline-end" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64">
      <DropdownMenuRadioGroup value={value} onValueChange={(key) => choose(String(key))}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Stories</DropdownMenuLabel>
          {views.builtIns.map((view) => <DropdownMenuRadioItem key={view.id} value={`${BUILT_IN_PREFIX}${view.id}`}>{view.label}</DropdownMenuRadioItem>)}
        </DropdownMenuGroup>
        {views.savedViews.length ? <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Saved views</DropdownMenuLabel>
            {views.savedViews.map((view) => <DropdownMenuRadioItem key={view.id} value={`${SAVED_PREFIX}${view.id}`}>{view.name}</DropdownMenuRadioItem>)}
          </DropdownMenuGroup>
        </> : null}
      </DropdownMenuRadioGroup>
      {views.canSave || views.savedViews.length ? <DropdownMenuSeparator /> : null}
      <DropdownMenuGroup>
        {views.canSave && active.kind === "saved" && active.modified ? <DropdownMenuItem onClick={views.updateSelected}><Check aria-hidden="true" />Update “{active.view.name}”</DropdownMenuItem> : null}
        {views.canSave ? <DropdownMenuItem disabled={views.full} onClick={views.openSave}><Plus aria-hidden="true" />Save current view…</DropdownMenuItem> : null}
        {views.savedViews.length ? <DropdownMenuItem onClick={views.openManage}><Settings2 aria-hidden="true" />Manage views…</DropdownMenuItem> : null}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
