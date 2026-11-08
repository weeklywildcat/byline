import { Alert, AlertDescription } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, FileUp } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { mediaArtDirectionKey, mediaAssetKey, type MediaLibraryFetchers } from "./media-library-api";
import { formatFilesize, KIND_LABELS, mediaKind, type MediaAssetDetail } from "./media-library-model";
import { invalidateMediaLibrary, replaceCachedAsset } from "./media-query";

export type MediaReplaceState = {
  /** Opens the file chooser. */
  choose: () => void;
  /** The hidden file input (render it once). */
  input: ReactNode;
  /** Spread on an element that takes a dropped file as the new version. */
  dropTarget: { onDragEnter: (event: DragEvent) => void; onDragOver: (event: DragEvent) => void; onDragLeave: (event: DragEvent) => void; onDrop: (event: DragEvent) => void };
  dragging: boolean;
  /** The file waiting for confirmation (or uploading). */
  file: File | null;
  progress: number | null;
  error: string | null;
  confirm: () => void;
  cancel: () => void;
};

const dragsFiles = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");

/**
 * Replace a file with a new version: choose or drop the file, confirm, and
 * it uploads with progress. Only the same kind of file is offered (an image
 * for an image), and the host's accepted types and size limit are checked
 * before sending. On success the record keeps its ID, metadata and links.
 */
export function useMediaReplace({ fetchers, asset, accepted = [], maxBytes = 0, expectedUpdatedAt, onReplaced }: { fetchers: Pick<MediaLibraryFetchers, "replaceMedia">; asset: MediaAssetDetail; accepted?: readonly string[]; maxBytes?: number; expectedUpdatedAt: string; onReplaced?: (saved: MediaAssetDetail) => void }): MediaReplaceState {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const kind = mediaKind(asset.mimeType);
  const sameKind = accepted.filter((type) => mediaKind(type) === kind);

  const offer = (candidate: File | undefined | null) => {
    if (!candidate) return;
    setError(null);
    setProgress(null);
    if (mediaKind(candidate.type) !== kind || (sameKind.length && !sameKind.includes(candidate.type))) {
      toast.error(`Choose ${kind === "image" ? "an image" : kind === "audio" ? "an audio file" : "a PDF"} to replace ${asset.filename}.`);
      return;
    }
    if (maxBytes && candidate.size >= maxBytes) {
      toast.error(`${formatFilesize(candidate.size)} is over the ${formatFilesize(maxBytes)} upload limit.`);
      return;
    }
    setFile(candidate);
  };

  const confirm = () => {
    if (!file || !fetchers.replaceMedia || progress !== null) return;
    setProgress(0);
    fetchers.replaceMedia(asset.id, file, { expectedUpdatedAt, onProgress: setProgress })
      .then(async (saved) => {
        replaceCachedAsset(client, saved);
        void client.invalidateQueries({ queryKey: mediaArtDirectionKey(asset.id) });
        await invalidateMediaLibrary(client);
        onReplaced?.(saved);
        toast.success(`${saved.filename} replaced`, { description: "Its details and links are kept. Web files are being prepared again." });
        setFile(null);
      })
      .catch((failure: { message?: string; data?: { status?: number } }) => {
        setError(failure?.message || "The new version couldn't be uploaded.");
        if (failure?.data?.status === 409) void client.invalidateQueries({ queryKey: mediaAssetKey(asset.id) });
      })
      .finally(() => setProgress(null));
  };

  return {
    choose: () => input.current?.click(),
    input: (
      <input
        ref={input}
        type="file"
        className="hidden"
        accept={(sameKind.length ? sameKind : [kind === "document" ? "application/pdf" : `${kind}/*`]).join(",")}
        onChange={(event) => { offer(event.target.files?.[0]); event.target.value = ""; }}
        data-media-replace-input=""
      />
    ),
    dropTarget: {
      onDragEnter: (event) => { if (!dragsFiles(event)) return; event.preventDefault(); depth.current += 1; setDragging(true); },
      onDragOver: (event) => { if (!dragsFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; },
      onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
      onDrop: (event) => { if (!dragsFiles(event)) return; event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); offer(event.dataTransfer.files[0]); }
    },
    dragging,
    file,
    progress,
    error,
    confirm,
    cancel: () => { if (progress === null) { setFile(null); setError(null); } }
  };
}

/** Confirms a new version before it replaces the file, then shows the upload. */
export function MediaReplaceDialog({ asset, state }: { asset: MediaAssetDetail; state: MediaReplaceState }) {
  const uploading = state.progress !== null;
  const uses = asset.usages.length + asset.hiddenUsageCount;
  return (
    <AlertDialog open={state.file !== null} onOpenChange={(open) => { if (!open) state.cancel(); }}>
      <AlertDialogContent data-media-replace-dialog="">
        <AlertDialogHeader>
          <AlertDialogTitle>Replace {asset.filename}?</AlertDialogTitle>
          <AlertDialogDescription>
            {state.file ? `The new version, ${state.file.name} (${formatFilesize(state.file.size)}), takes its place. ` : ""}
            Alt text, credit, tags, folder and {uses ? `its ${uses} linked ${uses === 1 ? "use" : "uses"}` : "links"} stay. Published pages show it after their next publish. Crops that no longer fit the new {KIND_LABELS[mediaKind(asset.mimeType)].toLowerCase()} fall back to automatic ones.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {uploading ? (
          <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((state.progress ?? 0) * 100)}%` }} /></div>
            <p className="text-xs text-muted-foreground">Uploading… {Math.round((state.progress ?? 0) * 100)}%</p>
          </div>
        ) : null}
        {state.error ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={uploading}>Keep current file</AlertDialogCancel>
          <AlertDialogAction disabled={uploading} onClick={(event) => { event.preventDefault(); state.confirm(); }} data-media-replace-confirm=""><FileUp data-icon="inline-start" aria-hidden="true" />{uploading ? "Replacing…" : "Replace file"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
