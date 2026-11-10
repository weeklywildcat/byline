import { cn } from "@byline/newsroom-ui/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@byline/newsroom-ui/ui/tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, CircleCheck, CircleDashed, Crop, Download, ExternalLink, Eye, FileText, Link2, Maximize2, MoreHorizontal, Pencil, RotateCw, Trash2, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from "react";
import { toast } from "sonner";
import { DatePicker } from "../editorial/pickers";
import { siteDay } from "../home/newsroom-model";
import { mediaAssetKey, type MediaLibraryFetchers } from "./media-library-api";
import { AssetThumbnail, shortDay } from "./MediaLibraryBrowser";
import { assetFacts, cleanMediaName, folderPath, formatFilesize, GAP_LABELS, KIND_LABELS, MEDIA_FIELD_LIMITS, mediaMetadataGaps, PUBLICATION_ASSET_LABELS, splitFilename, type MediaAssetDetail, type MediaMetadataGap, type MediaMetadataPatch, type MediaNavigatorData } from "./media-library-model";
import { invalidateMediaLibrary, replaceCachedAsset, useMediaAsset } from "./media-query";
import { MediaNameInput, useRenameMedia } from "./MediaRename";
import { rebasedUpdatedAt, type ArtDirectionEditResult } from "./art-direction-model";

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
  fetchers: Pick<MediaLibraryFetchers, "getAsset" | "updateMedia" | "deleteMedia" | "retryPublication" | "renameMedia">;
  assetId: number;
  navigator?: MediaNavigatorData;
  timezone: string;
  guardRef?: Ref<MediaInspectorGuard | null>;
  onClose?: () => void;
  onDeleted?: (id: number) => void;
  onOpenStory?: (storyId: number) => void;
  /** A link to this asset on the Media screen, for "Copy link". */
  assetHref?: (id: number) => string;
  /** Whether the panel shows its own header (name, rename, actions, close). */
  showHeading?: boolean;
  /**
   * Opens the host's art-direction editor (focal point and crops) for an
   * image. Resolves when it closes, with what that editor saved (null: nothing).
   */
  onEditArtDirection?: (id: number) => Promise<ArtDirectionEditResult | null>;
};

/**
 * One asset in full, laid out like a DAM's details pane:
 *
 * - a header with the file's name (renamed in place), its facts and a menu
 *   of file actions (open, download, copy link, delete);
 * - a large private preview with the few actions that belong to the picture
 *   (crops and focal point, larger preview, open, download);
 * - its publication files' state (with Retry);
 * - tabs: **Details** (the editable metadata, grouped, each publishing gap
 *   marked on its own field, explicit Save/Cancel, never autosave), **Uses**
 *   (linked records) and **Info** (read-only facts).
 *
 * The same component is the wide screen's resizable panel and the narrower
 * screens' sheet. Accounts that may not change the file see the same fields
 * read-only. Hashes, storage and raw manifests are never shown.
 */
export function MediaInspectorContent({ fetchers, assetId, navigator, timezone, guardRef, onClose, onDeleted, onOpenStory, assetHref, showHeading = true, onEditArtDirection }: MediaInspectorContentProps) {
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
  return <InspectorBody key={asset.id} asset={asset} fetchers={fetchers} navigator={navigator} timezone={timezone} guardRef={guardRef} onClose={onClose} onDeleted={onDeleted} onOpenStory={onOpenStory} assetHref={assetHref} showHeading={showHeading} onEditArtDirection={onEditArtDirection} />;
}

function InspectorBody({ asset, fetchers, navigator, timezone, guardRef, onClose, onDeleted, onOpenStory, assetHref, showHeading, onEditArtDirection }: Omit<MediaInspectorContentProps, "assetId"> & { asset: MediaAssetDetail }) {
  const client = useQueryClient();
  // The version the reader started editing from: a newer copy from elsewhere never silently becomes "their" edit.
  const [base, setBase] = useState(asset);
  const initial = useMemo(() => draftOf(base, timezone), [base, timezone]);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [zoom, setZoom] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
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
  // Gaps follow what the reader has typed, so a marker goes away as soon as the field is filled.
  const gaps = useMemo(() => new Set<MediaMetadataGap>(mediaMetadataGaps({ ...draft, mimeType: asset.mimeType })), [asset.mimeType, draft]);

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
  const retry = useMutation({
    mutationFn: () => fetchers.retryPublication!(asset.id),
    onSuccess: async (saved) => {
      replaceCachedAsset(client, saved);
      await invalidateMediaLibrary(client);
      toast.success("Preparing publication files again");
    },
    onError: (failure: { message?: string }) => toast.error(failure?.message || "Byline couldn't retry this file.")
  });
  // The rename is compared against this reader's version and is their own write: unsaved details keep going, rebased onto it.
  const rename = useRenameMedia(fetchers, (saved) => {
    setRenaming(false);
    setBase((current) => ({ ...current, filename: saved.filename, url: saved.url, previewUrl: saved.previewUrl, updatedAt: saved.updatedAt }));
  });
  const submitRename = (name: string) => {
    const { stem, extension } = splitFilename(asset.filename);
    const cleaned = cleanMediaName(name, extension);
    if (!cleaned) return void toast.error("Give the file a name.");
    if (cleaned === stem) return setRenaming(false);
    rename.mutate({ asset, name, expectedUpdatedAt: base.updatedAt }, { onError: (failure: { message?: string }) => toast.error(failure?.message || "The file couldn't be renamed.") });
  };

  const [editingArt, setEditingArt] = useState(false);
  const editArtDirection = async () => {
    if (!onEditArtDirection) return;
    setEditingArt(true);
    try {
      const result = await onEditArtDirection(asset.id);
      if (!result) return;
      // The crop save is this reader's own write: unsaved details keep going, compared against it, not refused by it.
      setBase((current) => ({ ...current, updatedAt: rebasedUpdatedAt(current.updatedAt, result) }));
      await client.invalidateQueries({ queryKey: mediaAssetKey(asset.id) });
      await invalidateMediaLibrary(client);
    } finally {
      setEditingArt(false);
    }
  };

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
  const field = (key: "alt" | "creator" | "credit" | "copyright" | "license" | "sourceUrl", label: string, options: { multiline?: boolean; placeholder?: string; type?: string; needed?: boolean } = {}) => {
    const id = `media-${key}-${asset.id}`;
    const common = { id, value: draft[key], readOnly: !editable, maxLength: MEDIA_FIELD_LIMITS[key], placeholder: editable ? options.placeholder : undefined, onChange: (event: { target: { value: string } }) => set(key, event.target.value) };
    return (
      <Field data-readonly={!editable || undefined}>
        <FieldLabel htmlFor={id}>{label}{options.needed ? <NeededBadge /> : null}</FieldLabel>
        {options.multiline ? <Textarea {...common} rows={3} className="min-h-20" /> : <Input {...common} type={options.type ?? "text"} {...(options.type === "url" ? { inputMode: "url" as const, autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : null)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />}
      </Field>
    );
  };
  const usageCount = asset.usages.length + asset.hiddenUsageCount;
  const image = asset.kind === "image";
  const canRename = editable && Boolean(fetchers.renameMedia);
  const copyAssetLink = assetHref ? () => void copyLink(new URL(assetHref(asset.id), window.location.href).toString()) : undefined;

  return (
    <div className="@container/inspector flex h-full min-h-0 flex-col" data-media-inspector="" data-asset-id={asset.id}>
      {showHeading ? (
        <div className="flex items-start gap-1 border-b px-4 py-3" data-media-inspector-header="">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <RenameForm filename={asset.filename} pending={rename.isPending} onSubmit={submitRename} onCancel={() => setRenaming(false)} />
            ) : (
              <div className="group/name flex min-w-0 items-center gap-1">
                <h2 className="truncate text-base font-medium" title={asset.filename} data-media-filename="">{asset.filename}</h2>
                {canRename ? (
                  <Tooltip>
                    <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground" aria-label={`Rename ${asset.filename}`} onClick={() => setRenaming(true)} data-media-rename-button="" />}><Pencil aria-hidden="true" /></TooltipTrigger>
                    <TooltipContent>Rename</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            )}
            <p className="truncate text-xs text-muted-foreground">{[KIND_LABELS[asset.kind], assetFacts(asset)].filter(Boolean).join(" · ")}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="File actions" data-media-file-actions="" />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                {canRename ? <DropdownMenuItem onClick={() => setRenaming(true)}><Pencil aria-hidden="true" />Rename</DropdownMenuItem> : null}
                {asset.url ? <DropdownMenuItem render={<a href={asset.url} target="_blank" rel="noreferrer" />}><ExternalLink aria-hidden="true" />Open original</DropdownMenuItem> : null}
                {asset.url ? <DropdownMenuItem render={<a href={asset.url} download={asset.filename} />}><Download aria-hidden="true" />Download</DropdownMenuItem> : null}
                {copyAssetLink ? <DropdownMenuItem onClick={copyAssetLink}><Link2 aria-hidden="true" />Copy link</DropdownMenuItem> : null}
              </DropdownMenuGroup>
              {asset.canDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={remove.isPending} onClick={() => setConfirmDelete(true)} data-media-delete=""><Trash2 aria-hidden="true" />Delete file…</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {onClose ? <Button type="button" variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose}><X aria-hidden="true" /></Button> : null}
        </div>
      ) : null}

      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (dirty && editable) save.mutate();
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-3 p-4 pb-3">
            <Preview asset={asset} onZoom={() => setZoom(true)} />
            <div className="flex flex-wrap items-center gap-2">
              {image && onEditArtDirection ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void editArtDirection()} disabled={editingArt} data-media-art-direction="">
                  <Crop data-icon="inline-start" aria-hidden="true" />{asset.canUpdate ? "Crops & focal point" : "View crops"}
                </Button>
              ) : null}
              <ButtonGroup className="ml-auto" aria-label="Preview and file">
                {image && asset.previewUrl ? <IconAction label="Larger preview" icon={Maximize2} onClick={() => setZoom(true)} /> : null}
                {asset.url ? <IconAction label="Open original" icon={ExternalLink} href={asset.url} newTab /> : null}
                {asset.url ? <IconAction label="Download" icon={Download} href={asset.url} download={asset.filename} /> : null}
              </ButtonGroup>
            </div>
            <PublicationSection asset={asset} timezone={timezone} retrying={retry.isPending} onRetry={fetchers.retryPublication ? () => retry.mutate() : undefined} />
          </div>

          <Tabs defaultValue="details" className="gap-0">
            <TabsList variant="line" className="h-9 w-full justify-start gap-4 border-b px-4" aria-label="File details">
              <TabsTrigger value="details" className="flex-none px-0" data-media-tab="details">
                Details{gaps.size ? <span className="size-1.5 rounded-full bg-amber-500" role="img" aria-label={`Before publishing: ${[...gaps].map((gap) => GAP_LABELS[gap].replace("Missing ", "")).join(", ")}`} data-media-gaps="" /> : null}
              </TabsTrigger>
              <TabsTrigger value="uses" className="flex-none px-0" data-media-tab="uses">Uses{usageCount ? <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{usageCount}</Badge> : null}</TabsTrigger>
              <TabsTrigger value="info" className="flex-none px-0" data-media-tab="info">Info</TabsTrigger>
            </TabsList>

            <TabsContent value="details" keepMounted className="p-4" data-media-details="">
              <FieldGroup className="gap-6">
                {field("alt", "Alt text", { multiline: true, placeholder: image ? "What someone who can't see the image needs to know" : "Only needed for images", needed: gaps.has("alt") })}
                <FieldSet className="gap-3">
                  <FieldLegend variant="label" className="mb-0 flex items-center gap-2 text-xs! tracking-wide text-muted-foreground uppercase">Credit{gaps.has("credit") ? <NeededBadge /> : null}</FieldLegend>
                  {gaps.has("credit") ? <FieldDescription className="-mt-1.5 text-xs leading-snug">An image needs a creator or a credit line.</FieldDescription> : null}
                  <div className="grid gap-3 @min-[22rem]/inspector:grid-cols-2">
                    {field("creator", "Creator", { placeholder: "Photographer or artist" })}
                    {field("credit", "Credit line", { placeholder: "Jane Doe / The Weekly Wildcat" })}
                  </div>
                </FieldSet>
                <FieldSet className="gap-3">
                  <FieldLegend variant="label" className="mb-0 flex items-center gap-2 text-xs! tracking-wide text-muted-foreground uppercase">Rights &amp; source{gaps.has("rights") ? <NeededBadge /> : null}</FieldLegend>
                  {gaps.has("rights") ? <FieldDescription className="-mt-1.5 text-xs leading-snug">Add a copyright, a license or a source URL.</FieldDescription> : null}
                  <div className="grid gap-3 @min-[22rem]/inspector:grid-cols-2">
                    {field("copyright", "Copyright", { placeholder: "© 2026 The Weekly Wildcat" })}
                    {field("license", "License", { placeholder: "e.g. CC BY 4.0" })}
                  </div>
                  {field("sourceUrl", "Source URL", { type: "url", placeholder: "https://" })}
                </FieldSet>
                <FieldSet className="gap-3">
                  <FieldLegend variant="label" className="mb-0 text-xs! tracking-wide text-muted-foreground uppercase">Filing</FieldLegend>
                  <div className="grid gap-3 @min-[22rem]/inspector:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={`media-captured-${asset.id}`}>Captured</FieldLabel>
                      <DatePicker id={`media-captured-${asset.id}`} label="Captured date" value={draft.capturedAt || null} timezone={timezone} dateOnly disabled={!editable} placeholder="Not set" onChange={(value) => set("capturedAt", value ?? "")} />
                    </Field>
                    <Field>
                      <FieldLabel>Folder</FieldLabel>
                      {editable ? (
                        <Select items={folderItems} value={draft.folderId === null ? UNFILED : String(draft.folderId)} onValueChange={(value) => set("folderId", !value || value === UNFILED ? null : Number(value))}>
                          <SelectTrigger aria-label="Folder" className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>{folderItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <p className="py-1.5 text-sm">{asset.folderPath.length ? asset.folderPath.map((item) => item.name).join(" / ") : "Unfiled"}</p>
                      )}
                    </Field>
                  </div>
                </FieldSet>
                {!editable ? <FieldDescription className="text-xs">Only the person who uploaded this file or an editor can change its details.</FieldDescription> : null}
                {error ? (
                  <Alert variant="destructive">
                    <CircleAlert aria-hidden="true" />
                    <AlertDescription>{error.message}</AlertDescription>
                  </Alert>
                ) : null}
              </FieldGroup>
            </TabsContent>

            <TabsContent value="uses" className="flex flex-col gap-2 p-4" data-media-uses="">
              {asset.usages.length ? (
                <ItemGroup className="gap-1.5">
                  {asset.usages.map((use) => (
                    <Item key={`${use.kind}:${use.recordId}`} size="sm" variant="outline" className="py-2">
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full truncate">{use.title}</ItemTitle>
                        <ItemDescription className="truncate">{use.role}</ItemDescription>
                      </ItemContent>
                      {use.storyId !== null && onOpenStory ? (
                        <ItemActions><Button type="button" variant="ghost" size="icon-sm" aria-label={`Quick view ${use.title}`} onClick={() => onOpenStory(use.storyId!)}><Eye aria-hidden="true" /></Button></ItemActions>
                      ) : null}
                    </Item>
                  ))}
                </ItemGroup>
              ) : asset.hiddenUsageCount ? null : (
                <p className="text-sm text-muted-foreground">Not linked from any story, assignment, Collection or profile.</p>
              )}
              {asset.hiddenUsageCount ? <p className="text-xs text-muted-foreground">{asset.hiddenUsageCount} more {asset.hiddenUsageCount === 1 ? "record you can't open links" : "records you can't open link"} to this file.</p> : null}
              <p className="text-xs text-muted-foreground">Includes Byline article blocks. Imported HTML and older Story versions are not listed.</p>
            </TabsContent>

            <TabsContent value="info" className="p-4" data-media-info="">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                <InfoRow label="Name"><span className="[overflow-wrap:anywhere]">{asset.filename}</span></InfoRow>
                <InfoRow label="Type">{[KIND_LABELS[asset.kind], asset.mimeType].filter(Boolean).join(" · ")}</InfoRow>
                {asset.width && asset.height ? <InfoRow label="Dimensions">{asset.width} × {asset.height} px</InfoRow> : null}
                {asset.filesize ? <InfoRow label="Size">{formatFilesize(asset.filesize)}</InfoRow> : null}
                <InfoRow label="Folder">{asset.folderPath.length ? asset.folderPath.map((item) => item.name).join(" / ") : "Unfiled"}</InfoRow>
                <InfoRow label="Captured">{asset.capturedAt ? shortDay(asset.capturedAt, timezone) : "Not set"}</InfoRow>
                <InfoRow label="Uploaded">{[asset.uploadedBy?.name ?? "Unknown", shortDay(asset.createdAt, timezone)].join(" · ")}</InfoRow>
                <InfoRow label="Last changed">{shortDay(asset.updatedAt, timezone)}</InfoRow>
              </dl>
            </TabsContent>
          </Tabs>
        </div>

        {editable ? (
          <div className={cn("flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3", !dirty && "hidden")} data-media-save-bar="">
            <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => { setDraft(initial); setError(null); }}>Cancel</Button>
            {error?.conflict ? <Button type="button" variant="ghost" onClick={() => { setBase(asset); setDraft(draftOf(asset, timezone)); setError(null); void client.invalidateQueries({ queryKey: mediaAssetKey(asset.id) }); }}>Discard and reload</Button> : null}
            <span className="ml-auto text-xs text-muted-foreground">Unsaved changes</span>
          </div>
        ) : null}
      </form>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="sm:max-w-[min(90vw,900px)]">
          <DialogHeader><DialogTitle className="truncate">{asset.filename}</DialogTitle><DialogDescription>{assetFacts(asset)}</DialogDescription></DialogHeader>
          {asset.previewUrl ? <img src={asset.previewUrl} alt={asset.alt} className="max-h-[70vh] w-full rounded-md bg-muted object-contain" /> : null}
          {asset.url ? <Button variant="outline" className="justify-self-start" nativeButton={false} render={<a href={asset.url} target="_blank" rel="noreferrer" />}><ExternalLink data-icon="inline-start" aria-hidden="true" />Open the full-size original</Button> : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{usageCount ? "This file is still in use" : `Delete ${asset.filename}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {usageCount ? "Unlink it from every story, assignment, Collection and profile listed under Uses before deleting it." : "The original and its preview are removed from the newsroom. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{usageCount ? "Close" : "Keep file"}</AlertDialogCancel>
            {usageCount ? null : <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>Delete file</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The header's rename in place: Enter saves, Escape cancels. Its own form, outside the details form. */
function RenameForm({ filename, pending, onSubmit, onCancel }: { filename: string; pending: boolean; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(() => splitFilename(filename).stem);
  return (
    <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); onSubmit(value); }} data-media-rename="">
      <div className="min-w-0 flex-1">
        <MediaNameInput id="media-inspector-name" filename={filename} value={value} onChange={setValue} autoFocus onEscape={onCancel} />
      </div>
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Save name" disabled={pending || !value.trim()}><Check aria-hidden="true" /></Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel rename" onClick={onCancel}><X aria-hidden="true" /></Button>
    </form>
  );
}

function NeededBadge() {
  return <Badge variant="outline" className="h-4 border-amber-300 px-1.5 text-[10px] font-medium tracking-normal normal-case text-amber-800 dark:border-amber-500/40 dark:text-amber-200">Needed to publish</Badge>;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** An icon button named by its tooltip; a link when it opens or downloads the file. */
function IconAction({ label, icon: Icon, onClick, href, download, newTab }: { label: string; icon: LucideIcon; onClick?: () => void; href?: string; download?: string; newTab?: boolean }) {
  const trigger = href
    ? <Button variant="outline" size="icon-sm" aria-label={label} nativeButton={false} render={<a href={href} download={download} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer" : undefined} />} />
    : <Button type="button" variant="outline" size="icon-sm" aria-label={label} onClick={onClick} />;
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}><Icon aria-hidden="true" /></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const PUBLICATION_NOTES: Record<MediaAssetDetail["publication"]["reason"], string> = {
  ready: "",
  "not-prepared": "Byline hasn't prepared web files for this version yet.",
  preparing: "Byline is preparing web files in the background. You can keep working; only publishing waits for this.",
  failed: "",
  "stale-revision": "The prepared files are for an earlier version of this file or its crops.",
  "stale-recipe": "Byline now prepares files differently; this file needs preparing again.",
  "invalid-manifest": "The prepared files' record is damaged; prepare them again."
};

const PUBLICATION_ICONS: Record<MediaAssetDetail["publication"]["state"], { icon: LucideIcon; className: string }> = {
  ready: { icon: CircleCheck, className: "text-emerald-600" },
  preparing: { icon: RotateCw, className: "animate-spin text-muted-foreground" },
  "not-prepared": { icon: CircleDashed, className: "text-muted-foreground" },
  failed: { icon: CircleAlert, className: "text-destructive" }
};

/** The asset's publication files as one status row: state, which version, problems and Retry. Never storage or hashes. */
function PublicationSection({ asset, timezone, retrying, onRetry }: { asset: MediaAssetDetail; timezone: string; retrying: boolean; onRetry?: () => void }) {
  const publication = asset.publication;
  const state = publication.state;
  const { icon: Icon, className } = PUBLICATION_ICONS[state];
  const note = state === "ready"
    ? `Prepared${publication.preparedAt ? ` ${shortDay(publication.preparedAt, timezone)}` : ""} for version ${publication.currentRevision}. Web files exist for the next static build; that doesn't mean it's live yet.`
    : `${state === "failed" ? publication.failureMessage ?? "" : PUBLICATION_NOTES[publication.reason]}${publication.preparedRevision !== null && publication.preparedRevision !== publication.currentRevision ? ` (Version ${publication.currentRevision}; last prepared: version ${publication.preparedRevision}.)` : ""}`;
  return (
    <Item variant="outline" size="sm" className={cn("items-start py-2.5", state === "failed" && "border-destructive/40")} role="group" aria-labelledby={`media-publication-${asset.id}`} data-media-publication={state}>
      <ItemMedia className="mt-0.5"><Icon aria-hidden="true" className={cn("size-4", className)} /></ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle id={`media-publication-${asset.id}`} className="text-sm">Publication files: {PUBLICATION_ASSET_LABELS[state]}</ItemTitle>
        <ItemDescription className="line-clamp-none text-xs" role="status" aria-live="polite">{note}</ItemDescription>
        {publication.warnings.length ? (
          <details className="group/warnings mt-1 text-xs text-amber-900 dark:text-amber-200" data-media-publication-warnings="">
            <summary className="w-fit cursor-pointer select-none rounded-sm outline-none marker:content-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              {publication.warnings.length === 1 ? "1 image size note" : `${publication.warnings.length} image size notes`}
              <span className="text-muted-foreground group-open/warnings:hidden"> · Show</span>
            </summary>
            <ul className="mt-1 list-disc pl-4">{publication.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </details>
        ) : null}
      </ItemContent>
      {publication.canRetry && onRetry && state !== "preparing" ? (
        <ItemActions>
          <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying} data-media-retry="">
            <RotateCw data-icon="inline-start" aria-hidden="true" />{retrying ? "Queuing…" : state === "failed" ? "Retry" : "Prepare now"}
          </Button>
        </ItemActions>
      ) : null}
    </Item>
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
        <img src={asset.previewUrl} alt={asset.alt} className="max-h-72 w-full object-contain" decoding="async" />
        <span className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-md bg-background/90 opacity-0 shadow-xs transition-opacity group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100" aria-hidden="true"><Maximize2 className="size-3.5" /></span>
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
