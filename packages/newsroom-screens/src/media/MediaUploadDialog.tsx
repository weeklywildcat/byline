import { cn } from "@byline/newsroom-ui/lib/utils";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FileUp, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import type { MediaLibraryFetchers } from "./media-library-api";
import { acceptsFile, folderPath, formatFilesize, type MediaLibraryAsset, type UploadStatus } from "./media-library-model";
import { invalidateMediaLibrary, useMediaNavigator } from "./media-query";

const UNFILED = "__unfiled";
/** Two at a time: steady progress for a photographer's batch without saturating a school connection. */
const CONCURRENCY = 2;

type QueueItem = { key: string; file: File; status: UploadStatus; progress: number; error?: string; retryable: boolean; folderId: number | null; asset?: MediaLibraryAsset };

export type MediaUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchers: Pick<MediaLibraryFetchers, "uploadMedia" | "getNavigator">;
  /** Where new files go unless the uploader picks another folder (null: Unfiled). */
  folderId: number | null;
  /** Uploads are running (the host keeps this mounted while they finish). */
  onBusyChange?: (busy: boolean) => void;
  /** Where to show uploaded files once they're in. */
  onShow?: (folderId: number | null) => void;
  showLabel?: string;
};

let sequence = 0;

/**
 * Byline's one upload flow (Create → Upload media, the Media screen's Upload
 * button). Several files at once; each is queued, uploaded through the
 * host's Media upload (the CMS's own upload operation and access rules),
 * and reported on its own, with retry for the ones that failed. Metadata is
 * never required first: gaps show in the Library afterwards. The
 * destination is the folder the reader was browsing, or Unfiled.
 */
export function MediaUploadDialog({ open, onOpenChange, fetchers, folderId, onBusyChange, onShow, showLabel = "Show in Media" }: MediaUploadDialogProps) {
  const client = useQueryClient();
  const navigator = useMediaNavigator(fetchers);
  const accepted = navigator.data?.capabilities.acceptedMimeTypes ?? [];
  const maxBytes = navigator.data?.capabilities.maxUploadBytes ?? 0;
  const folders = navigator.data?.folders ?? [];
  const [destination, setDestination] = useState<number | null>(folderId);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const running = useRef(new Set<string>());
  const openRef = useRef(open);
  openRef.current = open;

  // A new upload session starts from the folder it was opened from.
  useEffect(() => {
    if (open && !queue.some((item) => item.status === "queued" || item.status === "uploading")) {
      setDestination(folderId);
      setQueue((current) => (current.every((item) => item.status === "done" || item.status === "failed") ? [] : current));
    }
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const busy = queue.some((item) => item.status === "queued" || item.status === "uploading");
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const patch = useCallback((key: string, change: Partial<QueueItem>) => setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item))), []);

  // The queue runner: start queued files while fewer than CONCURRENCY are running.
  useEffect(() => {
    const waiting = queue.filter((item) => item.status === "queued" && !running.current.has(item.key));
    const free = CONCURRENCY - running.current.size;
    for (const item of waiting.slice(0, Math.max(0, free))) {
      running.current.add(item.key);
      patch(item.key, { status: "uploading", progress: 0 });
      fetchers
        .uploadMedia(item.file, { folderId: item.folderId, onProgress: (fraction) => patch(item.key, { progress: fraction }) })
        .then((asset) => patch(item.key, { status: "done", progress: 1, asset }))
        .catch((error: { message?: string; data?: { status?: number } }) => patch(item.key, { status: "failed", error: error?.message || "The upload didn't finish.", retryable: (error?.data?.status ?? 500) !== 400 }))
        .finally(() => {
          running.current.delete(item.key);
        });
    }
  }, [client, fetchers, patch, queue]);

  // When a batch finishes while the dialog is closed, say how it went.
  const wasBusy = useRef(false);
  useEffect(() => {
    // One refresh per batch, not one per file: the Library and its counts catch up once everything is in.
    if (wasBusy.current && !busy) void invalidateMediaLibrary(client);
    if (wasBusy.current && !busy && !openRef.current) {
      const done = queue.filter((item) => item.status === "done").length;
      const failed = queue.filter((item) => item.status === "failed").length;
      if (failed) toast.error(`${done} uploaded, ${failed} failed. Open Upload media to retry.`);
      else if (done) toast.success(`${done} ${done === 1 ? "file" : "files"} uploaded`);
    }
    wasBusy.current = busy;
  }, [busy, client, queue]);

  const add = (files: FileList | File[] | null) => {
    if (!files) return;
    const items: QueueItem[] = Array.from(files).map((file) => {
      const typeOk = accepted.length === 0 || acceptsFile(file, accepted);
      // Payload stops a multipart file once it reaches the limit, so a file of exactly the limit is refused too.
      const sizeOk = !maxBytes || file.size < maxBytes;
      const error = !typeOk
        ? `Media doesn't accept ${file.type || "this kind of file"}. Use JPEG, PNG, WebP, AVIF, GIF, PDF, MP3, M4A or WAV.`
        : !sizeOk ? `${formatFilesize(file.size)} is over the ${formatFilesize(maxBytes)} upload limit.` : undefined;
      return { key: `upload-${++sequence}`, file, status: error ? "failed" : "queued", progress: 0, error, retryable: false, folderId: destination };
    });
    setQueue((current) => [...current, ...items]);
  };

  const totals = useMemo(() => {
    const live = queue.filter((item) => item.retryable || item.status !== "failed");
    const bytes = live.reduce((sum, item) => sum + item.file.size, 0) || 1;
    const sent = live.reduce((sum, item) => sum + item.file.size * (item.status === "done" ? 1 : item.progress), 0);
    return { fraction: sent / bytes, done: queue.filter((item) => item.status === "done").length, failed: queue.filter((item) => item.status === "failed").length, total: queue.length };
  }, [queue]);

  const folderItems = useMemo(() => [{ value: UNFILED, label: "Unfiled" }, ...folders.map((folder) => ({ value: String(folder.id), label: folderPath(folders, folder.id).map((item) => item.name).join(" / ") })).sort((a, b) => a.label.localeCompare(b.label))], [folders]);
  const destinationLabel = folderItems.find((item) => item.value === (destination === null ? UNFILED : String(destination)))?.label ?? "Unfiled";

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-xl" data-media-upload="">
        <DialogHeader>
          <DialogTitle>Upload media</DialogTitle>
          <DialogDescription>Photos, graphics, PDFs and audio. Add alt text and credits afterwards; nothing has to be filled in first.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel>Upload to</FieldLabel>
            <Select items={folderItems} value={destination === null ? UNFILED : String(destination)} onValueChange={(value) => setDestination(!value || value === UNFILED ? null : Number(value))}>
              <SelectTrigger aria-label="Upload to folder" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{folderItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div
            className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors", dragging ? "border-primary bg-primary/5" : "bg-muted/30")}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
          >
            <FileUp aria-hidden="true" className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Drop files here, or</p>
            <Button type="button" variant="outline" onClick={() => input.current?.click()}>Choose files…</Button>
            <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden="true" accept={accepted.join(",")} onChange={(event) => { add(event.target.files); event.target.value = ""; }} data-media-upload-input="" />
            <p className="text-xs text-muted-foreground">New files go to <span className="font-medium text-foreground">{destinationLabel}</span>.{maxBytes ? ` Up to ${formatFilesize(maxBytes)} each.` : ""}</p>
          </div>
        </div>

        {queue.length ? (
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-sm" aria-live="polite">
              <span>{busy ? `Uploading ${totals.done} of ${totals.total}…` : `${totals.done} uploaded${totals.failed ? ` · ${totals.failed} failed` : ""}`}</span>
              {totals.failed && queue.some((item) => item.status === "failed" && item.retryable) ? <Button variant="ghost" size="sm" onClick={() => setQueue((current) => current.map((item) => (item.status === "failed" && item.retryable ? { ...item, status: "queued", error: undefined, progress: 0 } : item)))}><RotateCcw data-icon="inline-start" aria-hidden="true" />Retry failed</Button> : null}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Overall upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(totals.fraction * 100)}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(totals.fraction * 100)}%` }} />
            </div>
            <ItemGroup className="min-h-0 gap-1 overflow-y-auto" aria-label="Upload queue" data-media-upload-queue="">
              {queue.map((item) => (
                <Item key={item.key} size="sm" variant="outline" className="py-2" data-upload-status={item.status}>
                  <ItemMedia variant="icon">
                    {item.status === "done" ? <CircleCheck className="text-emerald-600" aria-label="Uploaded" /> : item.status === "failed" ? <CircleAlert className="text-destructive" aria-label="Failed" /> : item.status === "uploading" ? <LoaderCircle className="animate-spin" aria-label="Uploading" /> : <FileUp className="text-muted-foreground" aria-label="Waiting" />}
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate">{item.file.name}</ItemTitle>
                    <ItemDescription className={cn("truncate", item.status === "failed" && "text-destructive")}>
                      {item.status === "failed" ? item.error : item.status === "uploading" ? `${Math.round(item.progress * 100)}% of ${formatFilesize(item.file.size)}` : item.status === "done" ? `${formatFilesize(item.file.size)} · ${folderItems.find((option) => option.value === (item.folderId === null ? UNFILED : String(item.folderId)))?.label ?? "Unfiled"}` : `Waiting · ${formatFilesize(item.file.size)}`}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {item.status === "failed" && item.retryable ? <Button variant="ghost" size="icon-sm" aria-label={`Retry ${item.file.name}`} onClick={() => patch(item.key, { status: "queued", error: undefined, progress: 0 })}><RotateCcw aria-hidden="true" /></Button> : null}
                    {item.status === "queued" || item.status === "failed" ? <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.file.name}`} onClick={() => setQueue((current) => current.filter((entry) => entry.key !== item.key))}><X aria-hidden="true" /></Button> : null}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </div>
        ) : <div />}

        <DialogFooter>
          {onShow && totals.done ? <Button variant="outline" onClick={() => { onShow(destination); onOpenChange(false); }}>{showLabel}</Button> : null}
          <Button onClick={() => onOpenChange(false)}>{busy ? "Keep uploading in the background" : "Done"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
