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
  builtInViewsForScope,
  SAVED_VIEW_LIMIT,
  SAVED_VIEW_NAME_MAX_LENGTH,
  type ActiveStoryView,
  type AppliedView,
  type BuiltInStoryView
} from "./story-views";
import { scopedViewFilters, type StoryScope } from "./stories-scope";

export type { AppliedView } from "./story-views";

/* ----------------------------------------------------------- controller */

type ViewsDialog = null | { kind: "save" } | { kind: "rename"; view: SavedPlanningView } | { kind: "manage" };

export type StoryViewsOptions = {
  fetchers: PlanningFetchers;
  /** The screen's refinements. The scope is not among them; it is passed separately. */
  filters: PlanningFilters;
  /** Published is stored in a saved view as its publication state; Working and All are not stored. */
  scope: StoryScope;
  sort: PlanningSort;
  selectedId: string | null;
  onApply: (view: AppliedView) => void;
  /** Saved views that arrived with the stories response, so the menu is complete before its own request returns. */
  initialViews?: SavedPlanningView[];
};

/**
 * Which story set the reader is looking at: the built-in views, their own
 * saved views, and saving, renaming, updating and deleting (with Undo),
 * presented by the picker.
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

export function useStoryViews({ fetchers, filters: refinements, scope, sort, selectedId, onApply, initialViews }: StoryViewsOptions): StoryViewsController {
  const client = useQueryClient();
  const [dialog, setDialog] = useState<ViewsDialog>(null);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: savedViewsKey, queryFn: () => fetchers.getSavedViews!(), enabled: Boolean(fetchers.getSavedViews), initialData: initialViews, staleTime: 30_000, retry: false });
  const savedViews = useMemo(() => query.data || initialViews || [], [initialViews, query.data]);
  const active = activeStoryView(refinements, sort, savedViews, selectedId, scope);
  // What a saved view keeps and what an unsaved edit is compared with: the refinements plus Published, when that is the scope.
  const filters = useMemo(() => scopedViewFilters(refinements, scope), [refinements, scope]);
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
      if (view.id === selectedId) onApply({ filters, sort, savedViewId: null, scope });
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
    builtIns: builtInViewsForScope(scope),
    savedViews,
    canSave,
    canDelete,
    full: savedViews.length >= SAVED_VIEW_LIMIT,
    chooseBuiltIn: (view) => onApply(applyBuiltInView(view, scope)),
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
function SavedViewActions({ view, canSave, canDelete, onRename, onDelete, onUpdate }: {
  view: SavedPlanningView;
  canSave: boolean;
  canDelete: boolean;
  onRename: () => void;
  onDelete: () => void;
  onUpdate?: () => void;
}) {
  if (!canSave && !canDelete) return null;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for view ${view.name}`} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      {onUpdate && canSave ? <DropdownMenuItem onClick={onUpdate}><Check aria-hidden="true" />Update view</DropdownMenuItem> : null}
      {canSave ? <DropdownMenuItem onClick={onRename}><Pencil aria-hidden="true" />Rename</DropdownMenuItem> : null}
      {canDelete ? <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 aria-hidden="true" />Delete</DropdownMenuItem> : null}
    </DropdownMenuContent>
  </DropdownMenu>;
}

/* ------------------------------------------------------------ the picker */

const BUILT_IN_PREFIX = "built-in:";
const SAVED_PREFIX = "saved:";

/**
 * Which story set Stories shows: the built-in views, the reader's saved
 * views, and saving and managing them, in one menu above Board and List.
 * (A permanent views rail beside the page was removed: collection views did
 * not justify a second navigation column next to the app sidebar.)
 */
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
