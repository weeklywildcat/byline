"use client";

import { altFor, ARTICLE_BLOCK_LIMITS as LIMITS, GALLERY_LAYOUTS, PHONE_PRESENTATION_OPTIONS, PLACEMENT_OPTIONS, photoPhone, type ArticleMediaAsset, type GalleryLayoutKind, type MediaId, type Placement, type PresetOption } from "@byline/article-body";
import { isHeifFile, isRawPhotoFile, PHOTO_FILE_ACCEPT, PRORAW_UNSUPPORTED_MESSAGE } from "@byline/core";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { DropdownMenuItem } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { ArticleImage, GalleryLayout, StoryFigure } from "@byline/ui/article-body";
import { ArrowLeft, ArrowRight, Crop, ImagePlus, Images, ImageUp, Pencil, Star, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { moveDirection, moveItem, removeItem } from "../../items";
import { newRowId } from "../../fields";
import { BlockShell, SecondarySetting, ToolButton, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce, useBylineEditorHost, useEditMediaDetails, useMediaAsset, usePickMedia, useUploadMedia } from "../host";
import { BlockIcon } from "../icons";
import { CropsRoute, PHONE_PREVIEWS, PresentationNote, PresentationSurface, PresetField, WIDTH_PREVIEWS } from "./presentation";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

const ACCEPT = { image: PHOTO_FILE_ACCEPT, document: "application/pdf", audio: "audio/*" } as const;

/**
 * An unfinished media slot, drawn where the media will be: choose from Byline
 * Media, upload, or drop a file. One sentence says what is needed.
 */
export function MediaPlaceholder({ kind, title, description, multiple = false, readOnly, onChosen, chooseRef }: {
  kind: "image" | "document" | "audio";
  title: string;
  description: string;
  multiple?: boolean;
  readOnly: boolean;
  onChosen: (assets: ArticleMediaAsset[]) => void;
  chooseRef?: React.Ref<HTMLButtonElement>;
}) {
  const pick = usePickMedia();
  const upload = useUploadMedia();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const choose = async () => {
    const assets = await pick({ kind, multiple, title: kind === "image" ? (multiple ? "Choose photographs" : "Choose a photograph") : kind === "audio" ? "Choose an audio file" : "Choose a PDF", confirmLabel: multiple ? "Add to gallery" : "Use this file" });
    if (assets.length) onChosen(assets);
  };
  const send = async (files: File[]) => {
    if (!upload || readOnly) return;
    const accepted = files.filter((file) => (kind === "image" ? (file.type.startsWith("image/") && !isRawPhotoFile(file)) || isHeifFile(file) : kind === "audio" ? file.type.startsWith("audio/") : file.type === "application/pdf"));
    if (!accepted.length) {
      toast.error(kind === "image" ? files.some(isRawPhotoFile) ? PRORAW_UNSUPPORTED_MESSAGE : "That file is not an image." : kind === "audio" ? "That file is not audio." : "That file is not a PDF.");
      return;
    }
    const uploaded: ArticleMediaAsset[] = [];
    try {
      for (const file of multiple ? accepted : accepted.slice(0, 1)) {
        setProgress(0);
        uploaded.push(await upload(file, setProgress));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The upload did not finish.");
    } finally {
      setProgress(null);
    }
    if (uploaded.length) onChosen(uploaded);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void send([...event.dataTransfer.files]);
  };

  return (
    <Empty
      className="byline-media-empty"
      data-kind={kind}
      data-dragging={dragging || undefined}
      onDragOver={upload && !readOnly ? (event) => { event.preventDefault(); setDragging(true); } : undefined}
      onDragLeave={() => setDragging(false)}
      onDrop={upload && !readOnly ? onDrop : undefined}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">{progress !== null ? <Spinner /> : <BlockIcon icon={kind === "image" ? (multiple ? "gallery" : "photo") : kind === "audio" ? "audio" : "document"} />}</EmptyMedia>
        <EmptyTitle>{progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {readOnly ? null : (
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">
          <Button ref={chooseRef} type="button" size="sm" onClick={() => void choose()} disabled={progress !== null}>
            <Images />
            Choose from Media
          </Button>
          {upload ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} disabled={progress !== null}>
                <ImageUp />
                Upload
              </Button>
              <input ref={input} type="file" hidden className="hidden" accept={ACCEPT[kind]} multiple={multiple} onChange={(event) => { void send([...(event.target.files ?? [])]); event.target.value = ""; }} />
            </>
          ) : null}
        </EmptyContent>
      )}
    </Empty>
  );
}

/** An asset that is loading, or that Media no longer has. */
export function MediaStatus({ status, kind }: { status: "loading" | "missing"; kind: "image" | "document" | "audio" }) {
  return (
    <div className="byline-media-status" data-status={status} role={status === "missing" ? "alert" : undefined}>
      {status === "loading" ? <Spinner /> : null}
      <span>{status === "loading" ? "Loading…" : kind === "image" ? "This photograph is no longer in Media. Replace it." : "This file is no longer in Media. Replace it."}</span>
    </div>
  );
}

export function AltTextSetting({ asset, value, onChange, readOnly }: { asset: ArticleMediaAsset | null; value: string; onChange: (value: string) => void; readOnly: boolean }) {
  return (
    <SecondarySetting label="Alt text" title="Alt text for this story" description={asset?.alt ? `Media's alt text: "${asset.alt}". Write here only if this story needs different words.` : "Media has no alt text for this photograph. Describe what a reader who cannot see it needs to know."} icon={null}>
      <Textarea aria-label="Alt text for this story" rows={3} maxLength={LIMITS.altText} value={value} readOnly={readOnly} placeholder={asset?.alt || "Describe the photograph"} onChange={(event) => onChange(event.target.value)} />
    </SecondarySetting>
  );
}

const PLACEMENT_LABELS: Record<Placement, string> = { column: "Column", wide: "Wide", full: "Full" };

const GALLERY_LAYOUT_OPTIONS: ReadonlyArray<PresetOption<GalleryLayoutKind>> = GALLERY_LAYOUTS.map((value) => ({
  value,
  label: value === "grid" ? "Grid" : value === "essay" ? "Photo Essay" : "Featured",
  description: value === "grid" ? "Photographs side by side, a grid on wide screens." : value === "essay" ? "One large whole photograph after another, each with its caption." : "The first photograph leads; the rest follow in a grid."
}));
const GALLERY_FIT_OPTIONS: ReadonlyArray<PresetOption<"natural" | "crop">> = [
  { value: "natural", label: "Whole", description: "Every photograph keeps its own shape." },
  { value: "crop", label: "Even grid", description: "Photographs are cropped to the same shape, at their focal points." }
];
/** What the reader gets on a phone, in words: the CSS owns it (story-presentation.css). */
const GALLERY_PHONE_NOTES: Record<GalleryLayoutKind, string> = {
  grid: "On a phone: whole photographs one per row; an even grid keeps two per row.",
  essay: "On a phone: each photograph reaches both edges of the screen; captions stay inset.",
  featured: "On a phone: the first photograph reaches both edges of the screen; the rest follow inside the margins."
};

export function PhotoEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("photo", node);
  const issues = useReadiness("photo", id, node.fields);
  const media = useMediaAsset(fields.media);
  const pick = usePickMedia();
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, fields.media === null ? chooseRef : captionRef);
  const readOnly = !node.editable;
  const asset = media.asset;
  const { editArtDirection } = useBylineEditorHost();
  const editMediaDetails = useEditMediaDetails();

  const use = (assets: ArticleMediaAsset[]) => {
    const chosen = assets[0];
    if (!chosen) return;
    set({ media: chosen.id });
    announce("Photograph chosen.");
  };
  const replace = async () => {
    const assets = await pick({ kind: "image", multiple: false, title: "Replace the photograph", confirmLabel: "Use this photograph" });
    use(assets);
  };

  const mediaSlot: ReactNode = fields.media === null
    ? <MediaPlaceholder kind="image" title="Add a photograph" description="Choose one from Media, upload it, or drop an image here. Its credit comes from Media." readOnly={readOnly} onChosen={use} chooseRef={chooseRef} />
    : asset
      ? <ArticleImage asset={{ ...asset, src: asset.src }} alt={altFor(asset, fields.altOverride)} />
      : <MediaStatus status={media.status === "loading" ? "loading" : "missing"} kind="image" />;

  return (
    <BlockShell
      type="photo"
      node={node}
      issues={issues}
      menuItems={editMediaDetails && fields.media !== null ? (
        <DropdownMenuItem onClick={() => void editMediaDetails(fields.media!)}>
          <Pencil />
          Edit media details…
        </DropdownMenuItem>
      ) : null}
      actions={fields.media !== null ? (
        <>
          <ButtonGroup>
            <ToolTextButton label="Replace" icon={<ImagePlus />} onClick={() => void replace()} />
            {editArtDirection && fields.media !== null ? <ToolTextButton label="Crops" icon={<Crop />} onClick={() => void editArtDirection(fields.media!)} /> : null}
          </ButtonGroup>
          <ToggleGroup aria-label="Placement" variant="outline" size="sm" spacing={0} value={[fields.placement]} onValueChange={(next) => {
            const placement = next[0] as Placement | undefined;
            if (placement && placement !== fields.placement) {
              set({ placement });
              announce(`Photo placement: ${PLACEMENT_LABELS[placement]}.`);
            }
          }}>
            {(Object.keys(PLACEMENT_LABELS) as Placement[]).map((placement) => <ToggleGroupItem key={placement} value={placement}>{PLACEMENT_LABELS[placement]}</ToggleGroupItem>)}
          </ToggleGroup>
          <PresentationSurface blockLabel="Photo">
            <PresetField name="width" label="Width" value={fields.placement} options={PLACEMENT_OPTIONS} preview={(value) => WIDTH_PREVIEWS[value]} onChange={(placement) => set({ placement })} />
            <PresetField name="phone" label="On phones" value={fields.phone} options={PHONE_PRESENTATION_OPTIONS} preview={(value) => PHONE_PREVIEWS[value]} onChange={(phone) => set({ phone })} />
            <PresentationNote>{photoPhone(fields) === "bleed" ? "On a phone this photo reaches both edges of the screen; its caption stays inset." : "On a phone this photo keeps the story's margins."}</PresentationNote>
            <CropsRoute media={fields.media} hint="The focal point keeps what matters in view wherever the photo is cropped." />
          </PresentationSurface>
          <AltTextSetting asset={asset} value={fields.altOverride} readOnly={readOnly} onChange={(altOverride) => set({ altOverride })} />
        </>
      ) : null}
    >
      <StoryFigure
        className="byline-photo"
        media={mediaSlot}
        caption={<InlineText inputRef={captionRef} className="byline-caption" label="Caption" placeholder="Write a caption: who and what is shown, where and when." value={fields.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(caption) => set({ caption })} />}
        credit={asset?.credit}
      >
        {asset && !asset.credit ? <MissingCredit id={asset.id} /> : null}
      </StoryFigure>
    </BlockShell>
  );
}

/** Credit is Media's: when it is missing, say so and point at the one place to fix it. */
function MissingCredit({ id }: { id: MediaId }) {
  const { mediaHref } = useBylineEditorHost();
  return (
    <p className="byline-credit-missing" data-byline-chrome="">
      No credit in Media for this photograph.{" "}
      {mediaHref ? <a href={mediaHref(id)} target="_blank" rel="noreferrer">Add it in Media</a> : null}
    </p>
  );
}

function GalleryItemEditor({ item, index, count, readOnly, featured, onFeature, onCaption, onAlt, onMove, onReplace, onRemove }: {
  item: { id: string; media: MediaId | null; caption: string; altOverride: string };
  index: number;
  count: number;
  readOnly: boolean;
  /** Featured layout: the first photograph is the featured one; any other can be made featured. */
  featured: boolean;
  onFeature: () => void;
  onCaption: (value: string) => void;
  onAlt: (value: string) => void;
  onMove: (direction: -1 | 1) => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const media = useMediaAsset(item.media);
  const asset = media.asset;
  const name = `photograph ${index + 1} of ${count}`;
  return (
    <StoryFigure
      className="byline-gallery-item"
      media={
        <div className="byline-gallery-item-media" data-gallery-index={index}>
          {asset ? <ArticleImage asset={asset} alt={altFor(asset, item.altOverride)} /> : <MediaStatus status={item.media === null || media.status === "missing" ? "missing" : "loading"} kind="image" />}
          {readOnly ? null : (
            <ButtonGroup className="byline-item-actions" aria-label={`Actions for ${name}`} data-byline-chrome="">
              {featured && index > 0 ? <ToolButton label="Make featured" onClick={onFeature}><Star /></ToolButton> : null}
              <ToolButton label="Move earlier" disabled={index === 0} onClick={() => onMove(-1)}><ArrowLeft /></ToolButton>
              <ToolButton label="Move later" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowRight /></ToolButton>
              <ToolButton label="Replace" onClick={onReplace}><ImagePlus /></ToolButton>
              <AltTextSetting asset={asset} value={item.altOverride} readOnly={readOnly} onChange={onAlt} />
              <ToolButton label={`Remove ${name}`} onClick={onRemove}><Trash2 /></ToolButton>
            </ButtonGroup>
          )}
        </div>
      }
      caption={
        <InlineText
          className="byline-caption"
          label={`Caption for ${featured && index === 0 ? "the featured photograph" : name}`}
          placeholder="Caption"
          value={item.caption}
          maxLength={LIMITS.caption}
          readOnly={readOnly}
          multiline
          onChange={onCaption}
          onKeyDown={(event) => {
            const direction = moveDirection(event);
            if (direction) {
              event.preventDefault();
              onMove(direction);
            }
          }}
        />
      }
      credit={asset?.credit}
    />
  );
}

export function GalleryEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("gallery", node);
  const issues = useReadiness("gallery", id, node.fields);
  const pick = usePickMedia();
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLButtonElement>(null);
  useFocusWhenCreated(nodeKey, chooseRef);
  const readOnly = !node.editable;
  const items = fields.items;
  const full = items.length >= LIMITS.galleryMax;
  const root = () => node.editor.getElementByKey(nodeKey);

  const add = (assets: ArticleMediaAsset[]) => {
    const room = LIMITS.galleryMax - items.length;
    const added = assets.slice(0, room).map((asset) => ({ id: newRowId(), media: asset.id, caption: "", altOverride: "" }));
    if (!added.length) return;
    set({ items: [...items, ...added] });
    announce(`${added.length === 1 ? "Photograph" : `${added.length} photographs`} added. ${items.length + added.length} in the gallery.`);
    if (assets.length > room) toast(`A gallery holds ${LIMITS.galleryMax} photographs; ${assets.length - room} were not added.`);
  };
  const addMore = async () => add(await pick({ kind: "image", multiple: true, title: "Add photographs", confirmLabel: "Add to gallery" }));
  const move = (index: number, direction: -1 | 1) => {
    const change = moveItem(items, index, direction);
    if (change.focus === index) return;
    set({ items: change.items });
    announce(`Photograph moved to position ${change.focus + 1} of ${items.length}.`);
    focusIn(root(), `.byline-gallery > :nth-child(${change.focus + 1}) figcaption .byline-field`);
  };
  const remove = (index: number) => {
    const change = removeItem(items, index);
    set({ items: change.items });
    announce(`Photograph removed. ${change.items.length} in the gallery.`);
    focusIn(root(), `.byline-gallery > :nth-child(${change.focus + 1}) figcaption .byline-field`);
  };
  const replace = async (index: number) => {
    const [asset] = await pick({ kind: "image", multiple: false, title: "Replace the photograph", confirmLabel: "Use this photograph" });
    if (!asset) return;
    set({ items: items.map((item, i) => (i === index ? { ...item, media: asset.id } : item)) });
    announce("Photograph replaced.");
  };
  // Featured is the first photograph: making one featured moves it to the front. No separate state is stored.
  const feature = (index: number) => {
    const item = items[index];
    if (!item || index === 0) return;
    set({ items: [item, ...items.filter((_, i) => i !== index)] });
    announce(`Photograph ${index + 1} is now the featured photograph.`);
    focusIn(root(), `.byline-gallery > :nth-child(1) figcaption .byline-field`);
  };
  const setLayout = (layout: GalleryLayoutKind) => {
    if (layout === fields.layout) return;
    set({ layout });
    announce(layout === "essay" ? "Photo Essay: one photograph after another." : layout === "featured" ? "Featured: the first photograph leads." : "Grid.");
  };

  return (
    <BlockShell
      type="gallery"
      node={node}
      issues={issues}
      actions={items.length ? (
        <>
          <ButtonGroup>
            <ToolTextButton label="Add photos" icon={<ImagePlus />} disabled={full} onClick={() => void addMore()} />
          </ButtonGroup>
          <ToggleGroup aria-label="Layout" variant="outline" size="sm" spacing={0} value={[fields.layout]} onValueChange={(next) => {
            const layout = next[0] as GalleryLayoutKind | undefined;
            if (layout) setLayout(layout);
          }}>
            <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
            <ToggleGroupItem value="essay">Photo Essay</ToggleGroupItem>
            <ToggleGroupItem value="featured">Featured</ToggleGroupItem>
          </ToggleGroup>
          <PresentationSurface blockLabel="Photo Gallery">
            <PresetField name="layout" label="Layout" value={fields.layout} options={GALLERY_LAYOUT_OPTIONS} onChange={setLayout} />
            {/* A Photo Essay always shows whole photographs: fit only matters for a grid. */}
            {fields.layout !== "essay" ? <PresetField name="fit" label="Photographs" value={fields.fit} options={GALLERY_FIT_OPTIONS} onChange={(fit) => set({ fit })} /> : null}
            <PresentationNote>{GALLERY_PHONE_NOTES[fields.layout]}</PresentationNote>
          </PresentationSurface>
        </>
      ) : null}
    >
      {items.length ? (
        <GalleryLayout count={items.length} fit={fields.fit} layout={fields.layout}>
          {items.map((item, index) => (
            <GalleryItemEditor
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              readOnly={readOnly}
              featured={fields.layout === "featured"}
              onFeature={() => feature(index)}
              onCaption={(caption) => set({ items: items.map((row) => (row.id === item.id ? { ...row, caption } : row)) })}
              onAlt={(altOverride) => set({ items: items.map((row) => (row.id === item.id ? { ...row, altOverride } : row)) })}
              onMove={(direction) => move(index, direction)}
              onReplace={() => void replace(index)}
              onRemove={() => remove(index)}
            />
          ))}
        </GalleryLayout>
      ) : (
        <MediaPlaceholder kind="image" multiple title="Add photographs" description={`Choose ${LIMITS.galleryMin} or more from Media, upload them, or drop images here. Two photographs sit side by side.`} readOnly={readOnly} onChosen={add} chooseRef={chooseRef} />
      )}
    </BlockShell>
  );
}

