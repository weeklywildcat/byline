import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { toast } from "sonner";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button } from "../admin-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../admin-ui/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../admin-ui/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { Spinner } from "../admin-ui/ui/spinner";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import { describeEditorialError } from "../editorial/editorial-model";
import { savedViewsKey } from "../story/story-query";
import type { PlanningFetchers } from "./planning-api";
import { DEFAULT_PLANNING_SORT, EMPTY_PLANNING_FILTERS, filterSavedViewsForUser, normalizePlanningFilters, type PlanningFilters, type PlanningSort, type SavedPlanningView } from "./planning-model";

const MINE_FILTERS: PlanningFilters = { ...EMPTY_PLANNING_FILTERS, mine: true };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export type AppliedView = { filters: PlanningFilters; sort: PlanningSort; savedViewId: string | null };

export type SavedViewsProps = {
  fetchers: PlanningFetchers;
  currentUserId: number | null;
  filters: PlanningFilters;
  sort: PlanningSort;
  selectedId: string | null;
  onApply: (view: AppliedView) => void;
  /** Saved views that arrived with the stories response, so the menu is complete before its own request returns. */
  initialViews?: SavedPlanningView[];
};

/**
 * "All stories", "My stories" and the reader's saved views in one compact menu.
 * Saving and renaming happen in a Dialog; deleting is reversible, so it happens
 * at once with an Undo toast rather than stopping the reader with a confirmation.
 */
export function SavedViews({ fetchers, currentUserId, filters, sort, selectedId, onApply, initialViews }: SavedViewsProps) {
  const client = useQueryClient();
  const [dialog, setDialog] = useState<null | { kind: "save" } | { kind: "rename"; view: SavedPlanningView } | { kind: "manage" }>(null);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: savedViewsKey, queryFn: () => fetchers.getSavedViews!(), enabled: Boolean(fetchers.getSavedViews), initialData: initialViews, staleTime: 30_000, retry: false });
  const views = currentUserId === null ? [] : filterSavedViewsForUser(query.data || initialViews || [], currentUserId);
  const selected = views.find((view) => view.id === selectedId) || null;
  const dirty = Boolean(selected && (!same(normalizePlanningFilters(selected.filters), normalizePlanningFilters(filters)) || !same(selected.sort, sort)));

  const putView = (view: SavedPlanningView) => client.setQueryData<SavedPlanningView[]>(savedViewsKey, (old) => [view, ...(old || []).filter((item) => item.id !== view.id)]);
  const save = useMutation({
    mutationFn: (input: { id?: string; name: string; filters: PlanningFilters; sort: PlanningSort }) => fetchers.saveSavedView!(input),
    onSuccess: (view, input) => { putView(view); setDialog(null); setError(""); if (!input.id || input.id === selectedId) onApply({ filters: view.filters, sort: view.sort, savedViewId: view.id }); toast.success(input.id ? __("View updated.", "weekly-wildcat-headless") : __("View saved.", "weekly-wildcat-headless")); },
    onError: (failure) => setError(describeEditorialError(failure, __("The view could not be saved.", "weekly-wildcat-headless")))
  });
  const restore = useMutation({
    mutationFn: (view: SavedPlanningView) => fetchers.saveSavedView!({ id: view.id, name: view.name, filters: view.filters, sort: view.sort }),
    onSuccess: (view) => { putView(view); toast.success(__("View restored.", "weekly-wildcat-headless")); },
    onError: (failure) => toast.error(describeEditorialError(failure, __("The view could not be restored.", "weekly-wildcat-headless")))
  });
  const remove = useMutation({
    mutationFn: (view: SavedPlanningView) => fetchers.deleteSavedView!(view.id),
    onSuccess: (_result, view) => {
      client.setQueryData<SavedPlanningView[]>(savedViewsKey, (old) => (old || []).filter((item) => item.id !== view.id));
      if (view.id === selectedId) onApply({ filters, sort, savedViewId: null });
      toast(__("View deleted.", "weekly-wildcat-headless"), { duration: 10_000, action: fetchers.saveSavedView ? { label: __("Undo", "weekly-wildcat-headless"), onClick: () => restore.mutate(view) } : undefined });
    },
    onError: (failure) => toast.error(describeEditorialError(failure, __("The view could not be deleted.", "weekly-wildcat-headless")))
  });

  const activeKey = selected ? selected.id : same(normalizePlanningFilters(filters), EMPTY_PLANNING_FILTERS) ? "all" : same(normalizePlanningFilters(filters), MINE_FILTERS) ? "mine" : "";
  const label = selected ? `${selected.name}${dirty ? ` ${__("(modified)", "weekly-wildcat-headless")}` : ""}` : activeKey === "all" ? __("All stories", "weekly-wildcat-headless") : activeKey === "mine" ? __("My stories", "weekly-wildcat-headless") : __("Custom view", "weekly-wildcat-headless");
  const choose = (key: string) => {
    if (key === "all") onApply({ filters: { ...EMPTY_PLANNING_FILTERS }, sort: DEFAULT_PLANNING_SORT, savedViewId: null });
    else if (key === "mine") onApply({ filters: { ...MINE_FILTERS }, sort: DEFAULT_PLANNING_SORT, savedViewId: null });
    else { const view = views.find((item) => item.id === key); if (view) onApply({ filters: normalizePlanningFilters(view.filters), sort: view.sort, savedViewId: view.id }); }
  };
  const canSave = Boolean(fetchers.saveSavedView) && currentUserId !== null;
  const close = () => { if (!save.isPending) { setDialog(null); setError(""); } };

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" aria-label={`${__("Saved view", "weekly-wildcat-headless")}: ${label}`} />}><Bookmark data-icon="inline-start" aria-hidden="true" /><span className="max-w-44 truncate">{label}</span><ChevronDown data-icon="inline-end" aria-hidden="true" /></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuRadioGroup value={activeKey} onValueChange={(key) => choose(String(key))}>
          <DropdownMenuRadioItem value="all">{__("All stories", "weekly-wildcat-headless")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="mine">{__("My stories", "weekly-wildcat-headless")}</DropdownMenuRadioItem>
          {views.length ? <DropdownMenuSeparator /> : null}
          {views.map((view) => <DropdownMenuRadioItem key={view.id} value={view.id}>{view.name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {canSave || views.length ? <DropdownMenuSeparator /> : null}
        {canSave && selected && dirty ? <DropdownMenuItem onClick={() => save.mutate({ id: selected.id, name: selected.name, filters, sort })}>{__("Update", "weekly-wildcat-headless")} “{selected.name}”</DropdownMenuItem> : null}
        {canSave ? <DropdownMenuItem onClick={() => { setError(""); setDialog({ kind: "save" }); }}>{__("Save current view…", "weekly-wildcat-headless")}</DropdownMenuItem> : null}
        {views.length ? <DropdownMenuItem onClick={() => setDialog({ kind: "manage" })}>{__("Manage views…", "weekly-wildcat-headless")}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={dialog?.kind === "save" || dialog?.kind === "rename"} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{dialog?.kind === "rename" ? __("Rename view", "weekly-wildcat-headless") : __("Save view", "weekly-wildcat-headless")}</DialogTitle><DialogDescription>{dialog?.kind === "rename" ? __("Choose a new name for this view.", "weekly-wildcat-headless") : __("Keep the current filters and sort as a view only you can see.", "weekly-wildcat-headless")}</DialogDescription></DialogHeader>
        <form onSubmit={(event) => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get("name") || "").trim();
          if (!name) return;
          setError("");
          if (dialog?.kind === "rename") save.mutate({ id: dialog.view.id, name, filters: dialog.view.filters, sort: dialog.view.sort });
          else save.mutate({ name, filters, sort });
        }}>
          <FieldGroup className="gap-4">
            <Field><FieldLabel htmlFor="saved-view-name">{__("View name", "weekly-wildcat-headless")}</FieldLabel><Input id="saved-view-name" name="name" required maxLength={80} autoFocus defaultValue={dialog?.kind === "rename" ? dialog.view.name : ""} placeholder={__("e.g. Publishing this week", "weekly-wildcat-headless")} disabled={save.isPending} /></Field>
            {error ? <InlineAlert>{error}</InlineAlert> : null}
          </FieldGroup>
          <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={close} disabled={save.isPending}>{__("Cancel", "weekly-wildcat-headless")}</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? <><Spinner data-icon="inline-start" />{__("Saving…", "weekly-wildcat-headless")}</> : dialog?.kind === "rename" ? __("Rename", "weekly-wildcat-headless") : __("Save view", "weekly-wildcat-headless")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={dialog?.kind === "manage"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{__("Manage views", "weekly-wildcat-headless")}</DialogTitle><DialogDescription>{__("Rename or delete your saved views.", "weekly-wildcat-headless")}</DialogDescription></DialogHeader>
        {views.length
          ? <ItemGroup className="gap-0">{views.map((view) => <Item key={view.id} size="sm">
            <ItemContent><ItemTitle>{view.name}</ItemTitle></ItemContent>
            <ItemActions>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${__("Actions for view", "weekly-wildcat-headless")} ${view.name}`} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {canSave ? <DropdownMenuItem onClick={() => setDialog({ kind: "rename", view })}><Pencil aria-hidden="true" />{__("Rename", "weekly-wildcat-headless")}</DropdownMenuItem> : null}
                  {fetchers.deleteSavedView ? <DropdownMenuItem variant="destructive" onClick={() => remove.mutate(view)}><Trash2 aria-hidden="true" />{__("Delete", "weekly-wildcat-headless")}</DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </ItemActions>
          </Item>)}</ItemGroup>
          : <p className="text-sm text-muted-foreground">{__("You have no saved views.", "weekly-wildcat-headless")}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
