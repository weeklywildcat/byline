import { cn } from "@byline/newsroom-ui/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Download, ExternalLink, Eye, FileText, Maximize2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useState, type Ref } from "react";
import { toast } from "sonner";
import { siteDay } from "../home/newsroom-model";
import { mediaAssetKey, type MediaLibraryFetchers } from "./media-library-api";
import { AssetThumbnail, shortDay } from "./MediaLibraryBrowser";
import { assetFacts, DELIVERY_LABELS, folderPath, GAP_LABELS, MEDIA_FIELD_LIMITS, type MediaAssetDetail, type MediaMetadataPatch, type MediaNavigatorData } from "./media-library-model";
import { invalidateMediaLibrary, replaceCachedAsset, useMediaAsset } from "./media-query";

/** What the screen asks the inspector before it shows another asset. */
export type MediaInspectorGuard = { dirty: () => boolean; save: () => Promise<boolean>; discard: () => void };

type Draft = { alt: string; creator: string; credit: string; copyright: string; license: string; sourceUrl: string; capturedAt: string; folderId: number | null };

const UNFILED = "__unfiled";

function draftOf(asset: MediaAssetDetail, timezone: string): Draft {
  return {
    alt: asset.alt,
    creator: asset.creator,
    credit: asset.credit,
    copyright: asset.copyright,
    license: asset.license,
    sourceUrl: asset.sourceUrl,
    capturedAt: asset.capturedAt ? siteDay(asset.capturedAt, timezone) : "",
    folderId: asset.folder?.id ?? null
  };
}

function changes(before: Draft, after: Draft): MediaMetadataPatch {
  const patch: MediaMetadataPatch = {};
  for (const key of ["alt", "creator", "credit", "copyright", "license", "sourceUrl"] as const) if (before[key] !== after[key]) patch[key] = after[key];
  if (before.capturedAt !== after.capturedAt) patch.capturedAt = after.capturedAt || null;
  if (before.folderId !== after.folderId) patch.folderId = after.folderId;
  return patch;
}

export type MediaInspectorContentProps = {
  fetchers: Pick<MediaLibraryFetchers, "getAsset" | "updateMedia" | "deleteMedia">;
  assetId: number;
  navigator?: MediaNavigatorData;
  timezone: string;
  guardRef?: Ref<MediaInspectorGuard | null>;
  onClose?: () => void;
  onDeleted?: (id: number) => void;
  onOpenStory?: (storyId: number) => void;
  /** A link to this asset on the Media screen, for "Copy link". */
  assetHref?: (id: number) => string;
  /** Where the panel's own heading sits (the Sheet has its own title). */
  showHeading?: boolean;
};

/**
 * One asset in full: a large private preview, the file's facts, its
 * editable metadata (explicit Save and Cancel, never autosave), its folder
 * and uploader, its publication delivery state and its linked uses. The same
 * component is the wide screen's resizable panel and the narrower screens'
 * sheet. Accounts that may not change the file see the same fields read-only.
 * Hashes, renditions and art direction are never shown as fields.
 */
export function MediaInspectorContent({ fetchers, assetId, navigator, timezone, guardRef, onClose, onDeleted, onOpenStory, assetHref, showHeading = true }: MediaInspectorContentProps) {
  const query = useMediaAsset(fetchers, assetId);
  const asset = query.data;
  if (query.isError && !asset) {
    return (
      <div className="flex flex-col gap-3 p-4" data-media-inspector="">
        <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>This file couldn't be opened</AlertTitle><AlertDescription>{(query.error as { message?: string })?.message || "Try again."}</AlertDescription></Alert>
        <div className="flex gap-2"><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>{onClose ? <Button variant="ghost" onClick={onClose}>Close</Button> : null}</div>
      </div>
    );
  }
  if (!asset) return <InspectorSkeleton />;
  return <InspectorBody key={asset.id} asset={asset} fetchers={fetchers} navigator={navigator} timezone={timezone} guardRef={guardRef} onClose={onClose} onDeleted={onDeleted} onOpenStory={onOpenStory} assetHref={assetHref} showHeading={showHeading} />;
}

function InspectorBody({ asset, fetchers, navigator, timezone, guardRef, onClose, onDeleted, onOpenStory, assetHref, showHeading }: Omit<MediaInspectorContentProps, "assetId"> & { asset: MediaAssetDetail }) {
  const client = useQueryClient();
  // The version the reader started editing from: a newer copy from elsewhere never silently becomes "their" edit.
  const [base, setBase] = useState(asset);
  const initial = useMemo(() => draftOf(base, timezone), [base, timezone]);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [zoom, setZoom] = useState(false);
  const patch = useMemo(() => changes(initial, draft), [draft, initial]);
  const dirty = Object.keys(patch).length > 0;
  // A clean form follows the newest copy; a form with edits keeps its base, so a stale save is refused (409).
  useEffect(() => {
    if (asset.updatedAt === base.updatedAt || dirty) return;
    setBase(asset);
    setDraft(draftOf(asset, timezone));
  }, [asset, base.updatedAt, dirty, timezone]);
  const editable = asset.canUpdate;
  const folders = navigator?.folders ?? [];
  const folderItems = useMemo(() => [{ value: UNFILED, label: "Unfiled" }, ...[...folders].map((folder) => ({ value: String(folder.id), label: folderPath(folders, folder.id).map((item) => item.name).join(" / ") })).sort((a, b) => a.label.localeCompare(b.label))], [folders]);

  const save = useMutation({
    mutationFn: () => fetchers.updateMedia(asset.id, { ...patch, expectedUpdatedAt: base.updatedAt }),
    onSuccess: async (saved) => {
      setError(null);
      setBase(saved);
      setDraft(draftOf(saved, timezone));
      replaceCachedAsset(client, saved);
      // Folder or gaps changed: the file may now belong in other views, and the counts moved.
      if ("folderId" in patch || saved.gaps.join() !== asset.gaps.join()) await invalidateMediaLibrary(client);
      toast.success("Details saved");
    },
    onError: (failure: { message?: string; data?: { status?: number } }) => setError({ message: failure?.message || "The details couldn't be saved.", conflict: failure?.data?.status === 409 })
  });
  const remove = useMutation({
    mutationFn: () => fetchers.deleteMedia(asset.id),
    onSuccess: async () => {
      client.removeQueries({ queryKey: mediaAssetKey(asset.id) });
      await invalidateMediaLibrary(client);
      toast.success(`${asset.filename} deleted`);
      onDeleted?.(asset.id);
    },
    onError: (failure: { message?: string }) => toast.error(failure?.message || "The file couldn't be deleted.")
  });

  const saveNow = useCallback(async () => {
    if (!dirty) return true;
    try {
      await save.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }, [dirty, save]);
  useImperativeHandle(guardRef, () => ({ dirty: () => dirty, save: saveNow, discard: () => setDraft(initial) }), [dirty, initial, saveNow]);

  // Reload, closing the tab or typing another address with unsaved details gets the browser's own generic prompt (only while there are unsaved details). Moves inside the app ask through the screen's Save / Discard / Stay.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // older browsers only show their prompt when this is set
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const field = (key: "alt" | "creator" | "credit" | "copyright" | "license" | "sourceUrl", label: string, options: { multiline?: boolean; placeholder?: string; description?: string; type?: string } = {}) => {
    const id = `media-${key}-${asset.id}`;
    const common = { id, value: draft[key], readOnly: !editable, maxLength: MEDIA_FIELD_LIMITS[key], placeholder: editable ? options.placeholder : undefined, onChange: (event: { target: { value: string } }) => set(key, event.target.value) };
    return (
      <Field data-readonly={!editable || undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {options.multiline ? <Textarea {...common} rows={3} className="min-h-20" /> : <Input {...common} type={options.type ?? "text"} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />}
        {options.description ? <FieldDescription>{options.description}</FieldDescription> : null}
      </Field>
    );
  };
  const usagesLabel = asset.usages.length || asset.hiddenUsageCount ? `${asset.usages.length + asset.hiddenUsageCount}` : "";

  return (
    <div className="@container/inspector flex min-h-0 flex-col" data-media-inspector="" data-asset-id={asset.id}>
      {showHeading ? (
        <div className="flex items-start gap-2 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium" title={asset.filename}>{asset.filename}</h2>
            <p className="text-xs text-muted-foreground">{assetFacts(asset)}</p>
          </div>
          {onClose ? <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose}><X aria-hidden="true" /></Button> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <Preview asset={asset} onZoom={() => setZoom(true)} />
        {!showHeading ? <p className="-mt-2 text-xs text-muted-foreground">{assetFacts(asset)}</p> : null}
        <div className="flex flex-wrap gap-2">
          {asset.kind === "image" && asset.previewUrl ? <Button variant="outline" size="sm" onClick={() => setZoom(true)}><Maximize2 data-icon="inline-start" aria-hidden="true" />Larger preview</Button> : null}
          {asset.url ? <a className={buttonVariants({ variant: "outline", size: "sm" })} href={asset.url} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" aria-hidden="true" />Open original</a> : null}
          {asset.url ? <a className={buttonVariants({ variant: "outline", size: "sm" })} href={asset.url} download={asset.filename}><Download data-icon="inline-start" aria-hidden="true" />Download</a> : null}
        </div>

        {asset.gaps.length ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950" data-media-gaps="">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Before this can be published</AlertTitle>
            <AlertDescription><ul className="list-disc pl-4">{asset.gaps.map((gap) => <li key={gap}>{GAP_LABELS[gap]}</li>)}</ul></AlertDescription>
          </Alert>
        ) : null}

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (dirty && editable) save.mutate();
          }}
        >
          <FieldGroup className="gap-3">
            {field("alt", "Alt text", { multiline: true, placeholder: "What someone who can't see the image needs to know", description: asset.kind === "image" ? undefined : "Only needed for images." })}
            <div className="grid gap-3 @min-[22rem]/inspector:grid-cols-2">
              {field("creator", "Creator", { placeholder: "Photographer or artist" })}
              {field("credit", "Credit", { placeholder: "Jane Doe / The Weekly Wildcat" })}
              {field("copyright", "Copyright", { placeholder: "© 2026 The Weekly Wildcat" })}
              {field("license", "License", { placeholder: "e.g. CC BY 4.0" })}
            </div>
            {field("sourceUrl", "Source URL", { type: "url", placeholder: "https://" })}
            <Field>
              <FieldLabel htmlFor={`media-captured-${asset.id}`}>Captured</FieldLabel>
              <Input id={`media-captured-${asset.id}`} type="date" value={draft.capturedAt} readOnly={!editable} onChange={(event) => set("capturedAt", event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Folder</FieldLabel>
              {editable ? (
                <Select items={folderItems} value={draft.folderId === null ? UNFILED : String(draft.folderId)} onValueChange={(value) => set("folderId", !value || value === UNFILED ? null : Number(value))}>
                  <SelectTrigger aria-label="Folder" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{folderItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <p className="text-sm">{asset.folderPath.length ? asset.folderPath.map((item) => item.name).join(" / ") : "Unfiled"}</p>
              )}
            </Field>
          </FieldGroup>

          {!editable ? <p className="text-xs text-muted-foreground">Only the person who uploaded this file or an editor can change its details.</p> : null}
          {error ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}
          {editable ? (
            <div className={cn("sticky bottom-0 -mx-4 flex gap-2 border-t bg-background px-4 py-3", !dirty && "hidden")} data-media-save-bar="">
              <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="outline" disabled={save.isPending} onClick={() => { setDraft(initial); setError(null); }}>Cancel</Button>
              {error?.conflict ? <Button type="button" variant="ghost" onClick={() => { setBase(asset); setDraft(draftOf(asset, timezone)); setError(null); void client.invalidateQueries({ queryKey: mediaAssetKey(asset.id) }); }}>Discard and reload</Button> : null}
            </div>
          ) : null}
        </form>

        <Separator />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Uploaded by</dt>
          <dd>{asset.uploadedBy?.name ?? "Unknown"} · {shortDay(asset.createdAt, timezone)}</dd>
          <dt className="text-muted-foreground">Publication</dt>
          <dd><Badge variant={asset.publicDelivery === "failed" ? "destructive" : asset.publicDelivery === "public" ? "default" : "secondary"}>{DELIVERY_LABELS[asset.publicDelivery]}</Badge></dd>
        </dl>
        <p className="-mt-2 text-xs text-muted-foreground">Files stay private in the newsroom. Publishing a story is what makes its images public.</p>

        <Separator />
        <section aria-labelledby={`media-uses-${asset.id}`} className="flex flex-col gap-2">
          <h3 id={`media-uses-${asset.id}`} className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Linked uses {usagesLabel ? <Badge variant="secondary">{usagesLabel}</Badge> : null}</h3>
          {asset.usages.length ? (
            <ItemGroup className="gap-1">
              {asset.usages.map((use) => (
                <Item key={`${use.kind}:${use.recordId}`} size="sm" variant="outline" className="py-2">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate">{use.title}</ItemTitle>
                    <ItemDescription className="truncate">{use.role}</ItemDescription>
                  </ItemContent>
                  {use.storyId !== null && onOpenStory ? (
                    <ItemActions><Button variant="ghost" size="icon-sm" aria-label={`Quick view ${use.title}`} onClick={() => onOpenStory(use.storyId!)}><Eye aria-hidden="true" /></Button></ItemActions>
                  ) : null}
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <p className="text-sm text-muted-foreground">{asset.hiddenUsageCount ? "" : "Not linked from any story, assignment, Collection or profile."}</p>
          )}
          {asset.hiddenUsageCount ? <p className="text-xs text-muted-foreground">{asset.hiddenUsageCount} more {asset.hiddenUsageCount === 1 ? "record you can't open links" : "records you can't open link"} to this file.</p> : null}
          <p className="text-xs text-muted-foreground">Featured images, assignments, Collection artwork and resources, live-update photos and portraits. Images placed inside article text aren't listed yet.</p>
        </section>

        {asset.canDelete || assetHref ? <Separator /> : null}
        <div className="flex flex-wrap gap-2">
          {assetHref ? (
            <Button variant="ghost" size="sm" onClick={() => { void copyLink(new URL(assetHref(asset.id), window.location.href).toString()); }}>Copy link</Button>
          ) : null}
          {asset.canDelete ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={remove.isPending} />}><Trash2 data-icon="inline-start" aria-hidden="true" />Delete file</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{asset.usages.length || asset.hiddenUsageCount ? "This file is still in use" : `Delete ${asset.filename}?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {asset.usages.length || asset.hiddenUsageCount ? "Unlink it from every story, assignment, coverage and profile listed under Linked uses before deleting it." : "The original and its preview are removed from the newsroom. This can't be undone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{asset.usages.length || asset.hiddenUsageCount ? "Close" : "Keep file"}</AlertDialogCancel>
                  {asset.usages.length || asset.hiddenUsageCount ? null : <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>Delete file</AlertDialogAction>}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="sm:max-w-[min(90vw,900px)]">
          <DialogHeader><DialogTitle className="truncate">{asset.filename}</DialogTitle><DialogDescription>{assetFacts(asset)}</DialogDescription></DialogHeader>
          {asset.previewUrl ? <img src={asset.previewUrl} alt={asset.alt} className="max-h-[70vh] w-full rounded-md bg-muted object-contain" /> : null}
          {asset.url ? <a className={cn(buttonVariants({ variant: "outline" }), "justify-self-start")} href={asset.url} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" aria-hidden="true" />Open the full-size original</a> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("The link couldn't be copied.");
  }
}

function Preview({ asset, onZoom }: { asset: MediaAssetDetail; onZoom: () => void }) {
  if (asset.kind === "image" && asset.previewUrl) {
    return (
      <button type="button" className="group/preview relative block overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50" onClick={onZoom} aria-label={`Larger preview of ${asset.filename}`}>
        <img src={asset.previewUrl} alt={asset.alt} className="max-h-80 w-full object-contain" decoding="async" />
      </button>
    );
  }
  if (asset.kind === "audio" && asset.url) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
        <AssetThumbnail asset={asset} className="h-24 w-full rounded-md" />
        {/* The protected original, streamed by the newsroom's file route (which honours range requests). */}
        <audio controls preload="none" src={asset.url} className="w-full" aria-label={`Play ${asset.filename}`} />
      </div>
    );
  }
  if (asset.kind === "document") {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
        <FileText aria-hidden="true" className="size-10 text-muted-foreground" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{asset.filename}</p><p className="text-xs text-muted-foreground">PDF document</p></div>
        {asset.url ? <a className={buttonVariants({ variant: "outline", size: "sm" })} href={asset.url} target="_blank" rel="noreferrer">Open</a> : null}
      </div>
    );
  }
  return <AssetThumbnail asset={asset} className="h-40 w-full rounded-lg border" />;
}

function InspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4" data-media-inspector="" aria-busy="true">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="aspect-[4/3] w-full" />
      {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex flex-col gap-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-full" /></div>)}
    </div>
  );
}
