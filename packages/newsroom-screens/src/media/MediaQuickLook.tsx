import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Kbd } from "@byline/newsroom-ui/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@byline/newsroom-ui/ui/tooltip";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, PanelRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AssetThumbnail, shortDay } from "./MediaLibraryBrowser";
import { assetFacts, KIND_LABELS, type MediaLibraryAsset } from "./media-library-model";

/** Originals up to this size are loaded in Quick Look once the preview is showing; larger ones open on request. */
const QUICK_LOOK_ORIGINAL_MAX = 12 * 1024 * 1024;

/**
 * Quick Look: the file under the reader's focus, large, without leaving the
 * grid. ← and → step through the loaded files, Space or Escape closes, Enter
 * opens the details. Images show the private preview at once and swap in the
 * original when it is small enough to load; audio plays; a PDF opens.
 */
export function MediaQuickLook({ assets, index, onIndexChange, onClose, onOpenDetails, timezone }: { assets: readonly MediaLibraryAsset[]; index: number | null; onIndexChange: (index: number) => void; onClose: () => void; onOpenDetails?: (asset: MediaLibraryAsset) => void; timezone: string }) {
  const asset = index !== null ? assets[index] ?? null : null;
  const count = assets.length;
  const step = (delta: number) => { if (index !== null && count) onIndexChange((index + delta + count) % count); };
  return (
    <Dialog open={asset !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92dvh,960px)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,1400px)]"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
          if (event.key === " " && !(event.target as HTMLElement).closest("audio, a")) { event.preventDefault(); onClose(); }
          if (event.key === "Enter" && asset && onOpenDetails && !(event.target as HTMLElement).closest("button, a")) { event.preventDefault(); onOpenDetails(asset); }
        }}
        data-media-quick-look=""
      >
        {asset ? (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-base" data-media-quick-look-name="">{asset.filename}</DialogTitle>
                <DialogDescription className="truncate text-xs">
                  {[KIND_LABELS[asset.kind], assetFacts(asset), asset.credit || asset.creator, asset.capturedAt ? shortDay(asset.capturedAt, timezone) : null].filter(Boolean).join(" · ")}
                </DialogDescription>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">{(index ?? 0) + 1} of {count}</span>
              {onOpenDetails ? <Button variant="outline" size="sm" onClick={() => onOpenDetails(asset)}><PanelRight data-icon="inline-start" aria-hidden="true" />Details</Button> : null}
              {asset.url ? <Button variant="ghost" size="icon-sm" aria-label="Open original" nativeButton={false} render={<a href={asset.url} target="_blank" rel="noreferrer" />}><ExternalLink aria-hidden="true" /></Button> : null}
              <Button variant="ghost" size="icon-sm" aria-label="Close Quick Look" onClick={onClose}><X aria-hidden="true" /></Button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40 p-4">
              <QuickLookBody key={asset.id} asset={asset} />
              {count > 1 ? (
                <>
                  <NavButton side="left" label="Previous file" onClick={() => step(-1)} />
                  <NavButton side="right" label="Next file" onClick={() => step(1)} />
                </>
              ) : null}
            </div>
            <p className="hidden items-center justify-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
              <span><Kbd>←</Kbd> <Kbd>→</Kbd> files</span><span><Kbd>Enter</Kbd> details</span><span><Kbd>Space</Kbd> close</span>
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NavButton({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="secondary" size="icon" className={side === "left" ? "absolute top-1/2 left-3 -translate-y-1/2 rounded-full shadow" : "absolute top-1/2 right-3 -translate-y-1/2 rounded-full shadow"} aria-label={label} onClick={onClick} />}><Icon aria-hidden="true" /></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function QuickLookBody({ asset }: { asset: MediaLibraryAsset }) {
  // The preview shows at once; a small enough original replaces it once loaded.
  const [original, setOriginal] = useState(false);
  const loadOriginal = asset.kind === "image" && Boolean(asset.url) && (asset.filesize ?? Infinity) <= QUICK_LOOK_ORIGINAL_MAX;
  useEffect(() => {
    if (!loadOriginal || !asset.url) return undefined;
    const image = new Image();
    image.onload = () => setOriginal(true);
    image.src = asset.url;
    return () => { image.onload = null; };
  }, [asset.url, loadOriginal]);
  if (asset.kind === "image" && (asset.previewUrl || asset.url)) {
    return <img src={original && asset.url ? asset.url : asset.previewUrl ?? asset.url!} alt={asset.alt} className="size-full object-contain" data-media-quick-look-image="" />;
  }
  if (asset.kind === "audio" && asset.url) {
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <AssetThumbnail asset={asset} className="h-40 w-full rounded-lg" />
        <audio controls autoPlay={false} preload="metadata" src={asset.url} className="w-full" aria-label={`Play ${asset.filename}`} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <FileText aria-hidden="true" className="size-16 text-muted-foreground" />
      <p className="text-sm font-medium">{asset.filename}</p>
      {asset.url ? <Button variant="outline" nativeButton={false} render={<a href={asset.url} target="_blank" rel="noreferrer" />}><ExternalLink data-icon="inline-start" aria-hidden="true" />Open {KIND_LABELS[asset.kind]}</Button> : null}
    </div>
  );
}
