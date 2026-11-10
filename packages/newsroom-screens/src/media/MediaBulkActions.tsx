import { cn } from "@byline/newsroom-ui/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DialogRoot as Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/adaptive-dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Kbd } from "@byline/newsroom-ui/ui/kbd";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@byline/newsroom-ui/ui/tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { mediaAssetKey, type MediaLibraryFetchers } from "./media-library-api";
import { MEDIA_BULK_FIELDS, MEDIA_FIELD_LIMITS, type MediaBulkField, type MediaBulkPatch, type MediaBulkResult, type MediaLibraryAsset } from "./media-library-model";
import { invalidateMediaLibrary } from "./media-query";

const files = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

/**
 * The floating bar while files are checked: how many, Select all, the
 * screen's actions, and Clear (Escape). It sits over the results so it is in
 * reach wherever the reader has scrolled.
 */
export function MediaSelectionBar({ count, loaded, onSelectAll, onClear, children, className }: { count: number; loaded: number; onSelectAll: () => void; onClear: () => void; children: ReactNode; className?: string }) {
  return (
    <div role="toolbar" aria-label="Selected files" className={cn("pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5", className)} data-media-selection-bar="">
      <span className="px-2 text-sm font-medium tabular-nums" aria-live="polite" data-media-selection-count="">{count} selected</span>
      {count < loaded ? <Button variant="ghost" size="sm" onClick={onSelectAll}>Select all {loaded}</Button> : null}
      <Separator orientation="vertical" className="mx-0.5 h-5 self-center!" />
      {children}
      <Separator orientation="vertical" className="mx-0.5 h-5 self-center!" />
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear} />}><X aria-hidden="true" /></TooltipTrigger>
        <TooltipContent>Clear selection <Kbd>Esc</Kbd></TooltipContent>
      </Tooltip>
    </div>
  );
}

const BULK_LABELS: Record<MediaBulkField, { label: string; placeholder: string; type?: string }> = {
  creator: { label: "Creator", placeholder: "Photographer or artist" },
  credit: { label: "Credit", placeholder: "Jane Doe / The Weekly Wildcat" },
  copyright: { label: "Copyright", placeholder: "© 2026 The Weekly Wildcat" },
  license: { label: "License", placeholder: "e.g. CC BY 4.0" },
  sourceUrl: { label: "Source URL", placeholder: "https://", type: "url" }
};
const EMPTY_BULK: Record<MediaBulkField, string> = { creator: "", credit: "", copyright: "", license: "", sourceUrl: "" };

/** Says how a bulk action went, naming what was refused (each file is checked on its own). */
function report(result: MediaBulkResult, verb: string, assets: MediaLibraryAsset[]) {
  if (!result.failed.length) return toast.success(`${verb} ${files(result.done.length)}`);
  const first = result.failed[0];
  const name = assets.find((asset) => asset.id === first.id)?.filename ?? "A file";
  const rest = result.failed.length > 1 ? ` (and ${result.failed.length - 1} more)` : "";
  const message = `${name}: ${first.message}${rest}`;
  return result.done.length ? toast.warning(`${verb} ${files(result.done.length)}; ${files(result.failed.length)} unchanged`, { description: message }) : toast.error(`Nothing ${verb.toLowerCase()}`, { description: message });
}

/**
 * Creator, credit and rights for several files at once. Only filled-in fields
 * are applied; an empty field keeps each file's own value. Alt text describes
 * one picture, so it is never applied in bulk.
 */
export function MediaBulkEditDialog({ assets, open, onOpenChange, fetchers, onDone }: { assets: MediaLibraryAsset[]; open: boolean; onOpenChange: (open: boolean) => void; fetchers: Pick<MediaLibraryFetchers, "updateMediaMany">; onDone?: (result: MediaBulkResult) => void }) {
  const client = useQueryClient();
  const [values, setValues] = useState(EMPTY_BULK);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setValues(EMPTY_BULK); setError(null); } }, [open]);
  const editable = assets.filter((asset) => asset.canUpdate);
  const patch: MediaBulkPatch = Object.fromEntries(MEDIA_BULK_FIELDS.filter((field) => values[field].trim()).map((field) => [field, values[field].trim()]));
  const save = useMutation({
    mutationFn: () => fetchers.updateMediaMany!(editable.map((asset) => asset.id), patch),
    onSuccess: async (result) => {
      for (const id of result.done) void client.invalidateQueries({ queryKey: mediaAssetKey(id) });
      await invalidateMediaLibrary(client);
      report(result, "Updated", assets);
      onDone?.(result);
      onOpenChange(false);
    },
    onError: (failure: { message?: string }) => setError(failure?.message || "The files couldn't be updated.")
  });
  const skipped = assets.length - editable.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-media-bulk-edit="">
        <form className="contents" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); if (Object.keys(patch).length && editable.length) save.mutate(); }}>
          <DialogHeader>
            <DialogTitle>Edit {files(editable.length)}</DialogTitle>
            <DialogDescription>Fill in only what should be the same on every file. Empty fields keep each file's own value.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-5">
            <FieldSet>
              <FieldLegend variant="label">Credit</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-2">{(["creator", "credit"] as const).map((field) => <BulkField key={field} field={field} value={values[field]} onChange={(value) => setValues((current) => ({ ...current, [field]: value }))} />)}</div>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">Rights</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-2">{(["copyright", "license"] as const).map((field) => <BulkField key={field} field={field} value={values[field]} onChange={(value) => setValues((current) => ({ ...current, [field]: value }))} />)}</div>
              <BulkField field="sourceUrl" value={values.sourceUrl} onChange={(value) => setValues((current) => ({ ...current, sourceUrl: value }))} />
            </FieldSet>
            {skipped ? <FieldDescription>{files(skipped)} you can't change {skipped === 1 ? "is" : "are"} left out: staff change only the files they uploaded.</FieldDescription> : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!Object.keys(patch).length || !editable.length || save.isPending}>{save.isPending ? "Applying…" : `Apply to ${files(editable.length)}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkField({ field, value, onChange }: { field: MediaBulkField; value: string; onChange: (value: string) => void }) {
  const { label, placeholder, type } = BULK_LABELS[field];
  return (
    <Field>
      <FieldLabel htmlFor={`media-bulk-${field}`}>{label}</FieldLabel>
      <Input id={`media-bulk-${field}`} type={type ?? "text"} {...(type === "url" ? { inputMode: "url" as const, autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : null)} value={value} maxLength={MEDIA_FIELD_LIMITS[field]} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

/** Deletes several files after asking. Files still linked anywhere are refused by the server and stay. */
export function MediaBulkDeleteDialog({ assets, open, onOpenChange, fetchers, onDone }: { assets: MediaLibraryAsset[]; open: boolean; onOpenChange: (open: boolean) => void; fetchers: Pick<MediaLibraryFetchers, "deleteMediaMany">; onDone?: (result: MediaBulkResult) => void }) {
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => fetchers.deleteMediaMany!(assets.map((asset) => asset.id)),
    onSuccess: async (result) => {
      for (const id of result.done) client.removeQueries({ queryKey: mediaAssetKey(id) });
      await invalidateMediaLibrary(client);
      report(result, "Deleted", assets);
      onDone?.(result);
      onOpenChange(false);
    },
    onError: (failure: { message?: string }) => toast.error(failure?.message || "The files couldn't be deleted.")
  });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-media-bulk-delete="">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {files(assets.length)}?</AlertDialogTitle>
          <AlertDialogDescription>The originals and their previews are removed from the newsroom. This can't be undone. Files still linked from a story, assignment, Collection or profile are kept.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep files</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={(event) => { event.preventDefault(); remove.mutate(); }}>{remove.isPending ? "Deleting…" : `Delete ${files(assets.length)}`}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
