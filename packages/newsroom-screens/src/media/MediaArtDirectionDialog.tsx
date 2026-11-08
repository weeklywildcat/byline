import { IMAGE_CROP_SHAPES, IMAGE_CROP_SHAPE_DETAILS, autoCropForRatio, shapeAspectRatio, type CropRect, type ImageCropShape } from "@byline/core";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Alert, AlertDescription } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Cropper from "react-easy-crop";
import { toast } from "sonner";
import {
  areaFromRect,
  cropPixelWidth,
  draftFromArtDirection,
  draftSave,
  draftsEqual,
  effectiveCrop,
  frameImageStyle,
  isLowResolution,
  rectFromArea,
  resetShapeCrop,
  setFocalPoint,
  setShapeCrop,
  type ArtDirectionEditResult,
  type CropDraft,
  type MediaArtDirection
} from "./art-direction-model";
import { mediaArtDirectionKey, mediaAssetKey, type MediaLibraryFetchers } from "./media-library-api";

type Tab = "focal" | ImageCropShape;

export type MediaArtDirectionDialogProps = {
  open: boolean;
  mediaId: number | null;
  fetchers: Pick<MediaLibraryFetchers, "getArtDirection" | "saveArtDirection">;
  /** Called once when the editor closes: what it saved, or null. */
  onClose: (result: ArtDirectionEditResult | null) => void;
  /** Optional story context for the placement previews. */
  context?: { headline?: string; excerpt?: string; host?: string };
};

/**
 * The photo's art direction: one focal point plus optional custom crops for
 * Wide, Card, Standard, Square, Portrait and Social, previewed in every place
 * readers see the photo. Shared by the Media inspector and the Story lead
 * image (through the host's Media shell). Full-screen so the cropper has room
 * on any screen; one explicit Save; closing with unsaved changes asks first.
 *
 * Automatic crops follow the focal point (CSS `object-position` on the
 * public site). Only a crop that differs from the automatic one is stored as
 * Custom and gets physically cropped publication files.
 */
export function MediaArtDirectionDialog({ open, mediaId, fetchers, onClose, context }: MediaArtDirectionDialogProps) {
  const query = useQuery({
    queryKey: mediaArtDirectionKey(mediaId ?? 0),
    queryFn: () => fetchers.getArtDirection!(mediaId!),
    enabled: open && mediaId !== null && Boolean(fetchers.getArtDirection),
    staleTime: 0,
    gcTime: 0
  });
  const image = query.data;
  const [draft, setDraft] = useState<CropDraft | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      setDraft(null);
      loadedFor.current = null;
      return;
    }
    if (image && loadedFor.current !== `${image.mediaId}:${image.updatedAt}`) {
      loadedFor.current = `${image.mediaId}:${image.updatedAt}`;
      setDraft(draftFromArtDirection(image));
    }
  }, [image, open]);

  const saved = useMemo(() => (image ? draftFromArtDirection(image) : null), [image]);
  const dirty = Boolean(draft && saved && !draftsEqual(draft, saved));

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none md:h-[calc(100dvh-2rem)] md:w-[calc(100vw-2rem)] md:rounded-xl"
          data-media-art-direction-dialog=""
        >
          {!image || !draft ? (
            <LoadingState error={query.isError ? ((query.error as { message?: string })?.message || "This photo couldn't be loaded.") : null} onClose={() => onClose(null)} onRetry={() => void query.refetch()} />
          ) : (
            <Editor key={image.mediaId} image={image} draft={draft} setDraft={setDraft} dirty={dirty} fetchers={fetchers} context={context} onCancel={requestClose} onSaved={onClose} />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your crop changes?</AlertDialogTitle>
            <AlertDialogDescription>The focal point and crops you changed haven't been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { setConfirmDiscard(false); onClose(null); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LoadingState({ error, onClose, onRetry }: { error: string | null; onClose: () => void; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <DialogTitle>Crops and focal point</DialogTitle>
      {error ? (
        <>
          <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onRetry}>Try again</Button><Button type="button" variant="ghost" onClick={onClose}>Close</Button></div>
        </>
      ) : (
        <div className="grid flex-1 gap-4 md:grid-cols-[1fr_20rem]" aria-busy="true"><Skeleton className="h-full min-h-64" /><Skeleton className="h-full min-h-64" /></div>
      )}
    </div>
  );
}

type EditorProps = {
  image: MediaArtDirection;
  draft: CropDraft;
  setDraft: (update: (current: CropDraft | null) => CropDraft | null) => void;
  dirty: boolean;
  fetchers: MediaArtDirectionDialogProps["fetchers"];
  context?: MediaArtDirectionDialogProps["context"];
  onCancel: () => void;
  onSaved: (result: ArtDirectionEditResult) => void;
};

function Editor({ image, draft, setDraft, dirty, fetchers, context, onCancel, onSaved }: EditorProps) {
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("focal");
  const [cropperKey, setCropperKey] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const editable = image.canUpdate;
  const { width, height } = image;

  const selectTab = (next: Tab) => {
    setTab(next);
    setPosition({ x: 0, y: 0 });
    setZoom(1);
    setCropperKey((key) => key + 1);
  };

  const save = async () => {
    if (!fetchers.saveArtDirection || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const next = await fetchers.saveArtDirection(image.mediaId, draftSave(draft, image.updatedAt));
      client.setQueryData(mediaArtDirectionKey(image.mediaId), next);
      void client.invalidateQueries({ queryKey: mediaAssetKey(image.mediaId) });
      toast.success("Crops saved. Byline is preparing the publication files.");
      onSaved({ loadedUpdatedAt: image.updatedAt, savedUpdatedAt: next.updatedAt });
    } catch (caught) {
      const failure = caught as { message?: string; data?: { status?: number } };
      setError({ message: failure?.message || "The crops couldn't be saved.", conflict: failure?.data?.status === 409 });
    } finally {
      setSaving(false);
    }
  };

  const shape = tab === "focal" ? null : tab;
  const shapeCrop = shape ? effectiveCrop(draft, shape, width, height) : null;
  const shapeLocked = image.animated && shape !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={(event) => { if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") event.preventDefault(); }}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate">Crops and focal point</DialogTitle>
          <DialogDescription className="truncate">{image.filename} · {width}×{height}. Saved on the photo, so every story that uses it gets them.</DialogDescription>
        </div>
        {dirty ? <Badge variant="secondary">Unsaved changes</Badge> : null}
      </header>

      {/* Narrow: one scrolling column, the cropper a fixed share of the screen. Wide: workspace beside the placements, each scrolling. */}
      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
        <section className="flex flex-col gap-3 p-3 md:p-4 lg:min-h-0" aria-label="Photo workspace">
          <Tabs value={tab} onValueChange={(value) => selectTab(value as Tab)}>
            <TabsList className="h-auto max-w-full flex-wrap justify-start" aria-label="Focal point and crop shapes">
              <TabsTrigger value="focal" data-art-tab="focal">Focal point</TabsTrigger>
              {IMAGE_CROP_SHAPES.map((item) => (
                <TabsTrigger key={item} value={item} data-art-tab={item} disabled={image.animated}>
                  {IMAGE_CROP_SHAPE_DETAILS[item].label}
                  {draft.crops[item] ? <span className="ml-1 size-1.5 rounded-full bg-primary" aria-label="custom crop" /> : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <p className="text-sm text-muted-foreground" data-art-hint="">
            {shape === null
              ? image.animated
                ? "This is an animation: it keeps its whole frame. The focal point decides what stays in view when it's shown cropped."
                : "Click or drag to the most important part of the photo, such as a face. Every shape without a custom crop keeps it in view. Arrow keys move it (Shift for bigger steps)."
              : `${IMAGE_CROP_SHAPE_DETAILS[shape].usedFor}. `}
            {shapeCrop ? (shapeCrop.custom ? "Custom crop: Byline makes cropped publication files for it." : "Auto: follows the focal point. Drag or zoom to draw your own.") : null}
          </p>

          <div className="relative h-[55dvh] min-h-[16rem] shrink-0 overflow-hidden rounded-lg bg-neutral-950 lg:h-auto lg:flex-1 lg:shrink" data-art-workspace={tab}>
            {shape === null ? (
              <FocalPicker image={image} focal={draft.focalPoint} editable={editable} onChange={(point) => setDraft((current) => current && setFocalPoint(current, point))} />
            ) : shapeCrop && !shapeLocked ? (
              <Cropper
                key={`${shape}-${cropperKey}`}
                image={image.imageUrl}
                aspect={shapeAspectRatio(shape)}
                crop={position}
                zoom={zoom}
                maxZoom={5}
                showGrid
                objectFit="contain"
                initialCroppedAreaPercentages={areaFromRect(shapeCrop.rect)}
                onCropChange={editable ? setPosition : () => undefined}
                onZoomChange={editable ? setZoom : () => undefined}
                onCropComplete={(area) => { if (editable) setDraft((current) => current && setShapeCrop(current, shape, rectFromArea(area), width, height)); }}
                cropperProps={{ "aria-label": `${IMAGE_CROP_SHAPE_DETAILS[shape].label} crop area` } as never}
              />
            ) : null}
          </div>

          {shape !== null && shapeCrop && !shapeLocked ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={shapeCrop.custom ? "default" : "secondary"} data-art-status={shapeCrop.custom ? "custom" : "auto"}>{shapeCrop.custom ? "Custom" : "Auto"}</Badge>
              <label className="flex min-w-48 flex-1 items-center gap-2 text-sm">
                <span className="text-muted-foreground">Zoom</span>
                <input type="range" min={1} max={5} step={0.05} value={zoom} disabled={!editable} onChange={(event) => setZoom(Number(event.target.value))} className="flex-1 accent-primary" aria-label="Zoom" />
              </label>
              <Button type="button" variant="outline" size="sm" disabled={!editable || !shapeCrop.custom} onClick={() => { setDraft((current) => current && resetShapeCrop(current, shape)); selectTab(shape); }} data-art-reset="">
                <RotateCcw data-icon="inline-start" aria-hidden="true" />Reset to focal point
              </Button>
              {isLowResolution(shape, shapeCrop.rect, width) ? (
                <p className="w-full text-xs text-amber-800" data-art-low-resolution={shape}>Low resolution: this crop is {cropPixelWidth(shapeCrop.rect, width)}px wide; the site uses up to {IMAGE_CROP_SHAPE_DETAILS[shape].widths.at(-1)}px for {IMAGE_CROP_SHAPE_DETAILS[shape].label}. It won't be enlarged.</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="border-t bg-muted/30 p-3 md:p-4 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l" aria-label="Where this photo appears">
          <Placements image={image} draft={draft} selected={tab} onSelect={(next) => { if (!image.animated || next === "focal") selectTab(next); }} context={context} />
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        {error ? (
          <Alert variant="destructive" className="w-full">
            <CircleAlert aria-hidden="true" />
            <AlertDescription className="flex flex-wrap items-center gap-2">{error.message}{error.conflict ? <Button type="button" size="sm" variant="outline" onClick={() => void client.invalidateQueries({ queryKey: mediaArtDirectionKey(image.mediaId) })}>Load their version</Button> : null}</AlertDescription>
          </Alert>
        ) : null}
        {!editable ? <p className="text-xs text-muted-foreground">Only the person who uploaded this photo, or an editor, can change its crops.</p> : null}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>{editable ? "Cancel" : "Close"}</Button>
          {editable ? <Button type="button" onClick={() => void save()} disabled={!dirty || saving} data-art-save="">{saving ? <Spinner /> : null}{saving ? "Saving…" : "Save crops"}</Button> : null}
        </div>
      </footer>
    </div>
  );
}

/** Direct focal-point editing: click, drag or arrow keys over the whole photo. */
function FocalPicker({ image, focal, editable, onChange }: { image: MediaArtDirection; focal: { x: number; y: number }; editable: boolean; onChange: (point: { x: number; y: number }) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const place = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    onChange({ x: Math.round(((event.clientX - box.left) / box.width) * 1000) / 10, y: Math.round(((event.clientY - box.top) / box.height) * 1000) / 10 });
  };
  const keys = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move || !editable) return;
    event.preventDefault();
    onChange({ x: Math.min(100, Math.max(0, focal.x + move[0])), y: Math.min(100, Math.max(0, focal.y + move[1])) });
  };
  return (
    <div className="absolute inset-0 flex items-center justify-center p-2">
      <div
        ref={frame}
        className={cn("relative max-h-full max-w-full touch-none select-none", editable && "cursor-crosshair")}
        style={{ aspectRatio: `${image.width} / ${image.height}`, height: image.height >= image.width ? "100%" : undefined, width: image.width > image.height ? "100%" : undefined }}
        onPointerDown={(event) => { if (!editable) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); place(event); }}
        onPointerMove={(event) => { if (dragging.current) place(event); }}
        onPointerUp={() => { dragging.current = false; }}
        data-art-focal-frame=""
      >
        <img src={image.imageUrl} alt={image.alt} className="block size-full object-contain" draggable={false} />
        <button
          type="button"
          role="slider"
          aria-label="Focal point"
          aria-valuetext={`${Math.round(focal.x)}% from the left, ${Math.round(focal.y)}% from the top`}
          aria-valuenow={Math.round(focal.x)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-readonly={!editable}
          onKeyDown={keys}
          className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/40 shadow-[0_0_0_2px_rgb(0_0_0/0.5)] outline-none focus-visible:ring-4 focus-visible:ring-ring"
          style={{ left: `${focal.x}%`, top: `${focal.y}%` }}
          data-art-focal={`${focal.x},${focal.y}`}
        />
      </div>
    </div>
  );
}

function ratio(shape: ImageCropShape) {
  const [w, h] = IMAGE_CROP_SHAPE_DETAILS[shape].ratio;
  return `${w} / ${h}`;
}

/** A frame of the given ratio showing exactly `rect` of the photo. */
function CropFrame({ src, rect, aspect, className, children }: { src: string; rect: CropRect; aspect: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative w-full overflow-hidden rounded-md bg-muted", className)} style={{ aspectRatio: aspect }}>
      <img src={src} alt="" style={frameImageStyle(rect)} draggable={false} />
      {children}
    </div>
  );
}

/** Every place readers see this photo, redrawn as the focal point or a crop moves (the public site's ratios and crop rule). */
function Placements({ image, draft, selected, onSelect, context }: { image: MediaArtDirection; draft: CropDraft; selected: Tab; onSelect: (tab: Tab) => void; context?: MediaArtDirectionDialogProps["context"] }) {
  const src = image.previewUrl ?? image.imageUrl;
  const { width, height } = image;
  const crop = (shape: ImageCropShape) => effectiveCrop(draft, shape, width, height);
  const hero = (value: number) => autoCropForRatio(value, draft.focalPoint, width, height);
  const headline = context?.headline?.trim() || "Your headline";
  const social = crop("social");
  return (
    <div className="flex flex-col gap-5 text-sm">
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Immersive opening</h3>
        <p className="text-xs text-muted-foreground">Fills the screen and follows the focal point.</p>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <CropFrame src={src} rect={hero(16 / 10)} aspect="16 / 10"><span className="absolute inset-x-2 bottom-2 line-clamp-2 text-xs font-semibold text-white drop-shadow">{headline}</span></CropFrame>
          <CropFrame src={src} rect={hero(9 / 19.5)} aspect="9 / 19.5" className="w-14" />
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Cards and lists</h3>
        <div className="grid grid-cols-2 gap-2">
          {IMAGE_CROP_SHAPES.filter((shape) => shape !== "social").map((shape) => {
            const { rect, custom } = crop(shape);
            return (
              <button key={shape} type="button" onClick={() => onSelect(shape)} aria-pressed={selected === shape} className={cn("flex flex-col gap-1 rounded-md border p-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50", selected === shape ? "border-primary bg-background" : "border-transparent hover:bg-background")} data-art-placement={shape}>
                <CropFrame src={src} rect={rect} aspect={ratio(shape)} />
                <span className="flex items-center justify-between gap-1"><strong className="text-xs">{IMAGE_CROP_SHAPE_DETAILS[shape].label}</strong><Badge variant={custom ? "default" : "outline"} className="h-4 px-1 text-[10px]">{custom ? "Custom" : "Auto"}</Badge></span>
                <span className="text-[11px] leading-tight text-muted-foreground">{IMAGE_CROP_SHAPE_DETAILS[shape].usedFor}</span>
                {isLowResolution(shape, rect, width) ? <span className="text-[11px] text-amber-800">Low resolution</span> : null}
              </button>
            );
          })}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Shared and search</h3>
        <button type="button" onClick={() => onSelect("social")} aria-pressed={selected === "social"} className={cn("flex flex-col overflow-hidden rounded-md border bg-background text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50", selected === "social" && "border-primary")} data-art-placement="social">
          <CropFrame src={src} rect={social.rect} aspect={ratio("social")} className="rounded-none" />
          <span className="flex flex-col gap-0.5 p-2">
            {context?.host ? <span className="text-[11px] text-muted-foreground uppercase">{context.host}</span> : null}
            <strong className="text-xs">{headline}</strong>
            {context?.excerpt ? <span className="line-clamp-2 text-[11px] text-muted-foreground">{context.excerpt}</span> : null}
          </span>
        </button>
        {cropPixelWidth(social.rect, width) < 1200 ? <p className="text-xs text-amber-800" data-art-low-resolution="social">This photo gives a {cropPixelWidth(social.rect, width)}px social image (1200px is best); shared links may look soft. Byline won't enlarge it.</p> : null}
        <div className="flex items-center gap-2 rounded-md border bg-background p-2">
          <span className="flex min-w-0 flex-1 flex-col"><strong className="truncate text-xs">{headline}</strong><span className="text-[11px] text-muted-foreground">Search result</span></span>
          <CropFrame src={src} rect={crop("square").rect} aspect="1 / 1" className="w-12" />
        </div>
        {height > width * 1.1 ? <p className="text-xs text-muted-foreground">Tall photos are shown 4:3 above Standard stories.</p> : null}
      </section>
    </div>
  );
}
