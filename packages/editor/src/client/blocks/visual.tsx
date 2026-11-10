"use client";

import { altFor, ARTICLE_BLOCK_LIMITS as LIMITS, type ArticleMediaAsset } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Input } from "@byline/newsroom-ui/ui/input";
import { AnnotatedImageFigure, annotationAnchor, ArticleImage, BeforeAfterFigure, PortraitTextFigure, VisualChapterView } from "@byline/ui/article-body";
import { enhanceBeforeAfter } from "@byline/ui/before-after";
import { ArrowDown, ArrowLeftRight, ArrowUp, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { newRowId } from "../../fields";
import { moveItem, removeItem } from "../../items";
import { BlockShell, SecondarySetting, ToolButton, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce, useMediaAsset } from "../host";
import { MediaPlaceholder, MediaStatus } from "./media";
import { AltTextSetting } from "./media";
import { ChoiceToggle, ImageActions, ImageSlot, ParagraphFields, WIDE_IMAGE_RATIO, useReplaceImage } from "./parts";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

const WIDE_OR_FULL = [{ value: "wide", label: "Wide" }, { value: "full", label: "Full" }] as const;

function Warning({ children }: { children: string }) {
  return (
    <p className="byline-block-note" data-effect="warning" data-byline-chrome="" contentEditable={false}>
      <span>{children}</span>
    </p>
  );
}

export function PortraitTextEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("portraitText", node);
  const issues = useReadiness("portraitText", id, node.fields);
  const media = useMediaAsset(fields.media);
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, fields.media === null ? chooseRef : heading);
  const readOnly = !node.editable;
  const asset = media.asset;
  const use = (assets: ArticleMediaAsset[]) => {
    if (assets[0]) {
      set({ media: assets[0].id });
      announce("Photograph chosen.");
    }
  };
  const replace = useReplaceImage("Replace the portrait", (chosen) => use([chosen]));
  const tooWide = Boolean(asset?.width && asset.height && asset.width / asset.height > WIDE_IMAGE_RATIO);

  return (
    <BlockShell
      type="portraitText"
      node={node}
      issues={issues}
      actions={fields.media !== null ? (
        <>
          <ImageActions media={fields.media} label="Replace photo" onReplace={() => void replace()} />
          <ButtonGroup>
            <ToolTextButton label="Flip sides" icon={<ArrowLeftRight />} onClick={() => {
              const side = fields.side === "left" ? "right" : "left";
              set({ side });
              announce(`Photo on the ${side}.`);
            }} />
          </ButtonGroup>
          <AltTextSetting asset={asset} value={fields.altOverride} readOnly={readOnly} onChange={(altOverride) => set({ altOverride })} />
        </>
      ) : null}
    >
      <PortraitTextFigure
        side={fields.side}
        media={<ImageSlot media={fields.media} alt={fields.altOverride} readOnly={readOnly} onChosen={use} chooseRef={chooseRef} empty={{ title: "Add the portrait", description: "Choose a photograph from Media or upload one. Its credit comes from Media." }} />}
        caption={<InlineText className="byline-caption" label="Caption (optional)" placeholder="Caption (optional)" value={fields.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(caption) => set({ caption })} />}
        credit={asset?.credit}
        heading={<h3><InlineText inputRef={heading} label="Heading (optional)" placeholder="Heading (optional)" value={fields.heading} maxLength={LIMITS.portraitHeading} readOnly={readOnly} onEnter={() => body.current?.focus()} onChange={(value) => set({ heading: value })} /></h3>}
      >
        <ParagraphFields scope=".byline-portrait-text-body" inputRef={body} label="Passage" placeholder="A short passage about the person or idea in the photograph." value={fields.body} readOnly={readOnly} onChange={(value) => set({ body: value.slice(0, LIMITS.portraitBody) })} />
      </PortraitTextFigure>
      {tooWide ? <Warning>This photograph is very wide. A portrait fits this layout better. It will still publish.</Warning> : null}
    </BlockShell>
  );
}

export function VisualChapterEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("visualChapter", node);
  const issues = useReadiness("visualChapter", id, node.fields);
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLTextAreaElement>(null);
  const eyebrow = useRef<HTMLTextAreaElement>(null);
  const dek = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, fields.media === null ? chooseRef : heading);
  const readOnly = !node.editable;
  const media = useMediaAsset(fields.media);
  const use = (assets: ArticleMediaAsset[]) => {
    if (assets[0]) {
      set({ media: assets[0].id });
      announce("Photograph chosen.");
    }
  };
  const replace = useReplaceImage("Replace the chapter photograph", (chosen) => use([chosen]));

  return (
    <BlockShell
      type="visualChapter"
      node={node}
      issues={issues}
      actions={fields.media !== null ? (
        <>
          <ImageActions media={fields.media} onReplace={() => void replace()} />
          <ChoiceToggle label="Placement" value={fields.placement} options={WIDE_OR_FULL} onChange={(placement) => set({ placement })} />
          <ChoiceToggle label="Heading position" value={fields.align} options={[{ value: "bottom-left", label: "Bottom left" }, { value: "center", label: "Centered" }]} onChange={(align) => set({ align })} />
          <AltTextSetting asset={media.asset} value={fields.altOverride} readOnly={readOnly} onChange={(altOverride) => set({ altOverride })} />
        </>
      ) : null}
    >
      {fields.media === null ? (
        <MediaPlaceholder kind="image" title="Add the chapter photograph" description="A photograph that opens a new part of the story. Its heading is a section of the story." readOnly={readOnly} onChosen={use} chooseRef={chooseRef} />
      ) : (
        <VisualChapterView
          align={fields.align}
          headingId={`${id}-heading`}
          media={<ImageSlot media={fields.media} alt={fields.altOverride} readOnly={readOnly} onChosen={use} empty={{ title: "", description: "" }} />}
          eyebrow={<InlineText inputRef={eyebrow} className="byline-kicker byline-visual-chapter-eyebrow" label="Eyebrow (optional)" placeholder="Eyebrow (optional)" value={fields.eyebrow} maxLength={LIMITS.chapterEyebrow} readOnly={readOnly} onEnter={() => heading.current?.focus()} onChange={(value) => set({ eyebrow: value })} />}
          heading={<InlineText inputRef={heading} label="Chapter heading" placeholder="The chapter's heading" value={fields.heading} maxLength={LIMITS.chapterHeading} readOnly={readOnly} onEnter={() => dek.current?.focus()} onChange={(value) => set({ heading: value })} />}
          dek={<InlineText inputRef={dek} className="byline-visual-chapter-dek" label="Dek (optional)" placeholder="A line that sets up the chapter (optional)" value={fields.dek} maxLength={LIMITS.chapterDek} readOnly={readOnly} multiline onChange={(value) => set({ dek: value })} />}
          credit={media.asset?.credit}
        />
      )}
    </BlockShell>
  );
}

/** Whether two photographs' shapes differ enough that fitting one to the other crops it. */
const shapesDiffer = (a: ArticleMediaAsset | null, b: ArticleMediaAsset | null): boolean => {
  if (!a?.width || !a.height || !b?.width || !b.height) return false;
  return Math.abs(a.width / a.height - b.width / b.height) > 0.02;
};

export function BeforeAfterEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("beforeAfter", node);
  const issues = useReadiness("beforeAfter", id, node.fields);
  const announce = useAnnounce();
  const before = useMediaAsset(fields.before);
  const after = useMediaAsset(fields.after);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const caption = useRef<HTMLTextAreaElement>(null);
  const figure = useRef<HTMLElement>(null);
  useFocusWhenCreated(nodeKey, fields.before === null ? chooseRef : caption);
  const readOnly = !node.editable;
  const both = Boolean(before.asset && after.asset);
  const differ = shapesDiffer(before.asset, after.asset);
  const replaceBefore = useReplaceImage("Choose the Before photograph", (asset) => set({ before: asset.id }));
  const replaceAfter = useReplaceImage("Choose the After photograph", (asset) => set({ after: asset.id }));

  // The real comparison: the public enhancer adds the native range input, so the reporter judges framing by dragging the divider.
  useEffect(() => {
    const element = figure.current;
    if (!element || !both) return;
    const controller = new AbortController();
    const undo = enhanceBeforeAfter(element, controller.signal);
    return () => {
      controller.abort();
      undo?.();
    };
  }, [both, fields.before, fields.after, fields.fit, fields.beforeLabel, fields.afterLabel]);

  const slot = (side: "before" | "after") => (
    <ImageSlot
      media={fields[side]}
      alt=""
      readOnly={readOnly}
      onChosen={(assets) => assets[0] && set({ [side]: assets[0].id })}
      chooseRef={side === "before" ? chooseRef : undefined}
      empty={{ title: side === "before" ? "Choose the Before photograph" : "Choose the After photograph", description: "From Media, or upload one. Before is always on the left." }}
    />
  );

  return (
    <BlockShell
      type="beforeAfter"
      node={node}
      issues={issues}
      actions={
        <>
          <ButtonGroup>
            <ToolTextButton label="Replace Before" icon={<ImagePlus />} onClick={() => void replaceBefore()} />
            <ToolTextButton label="Replace After" icon={<ImagePlus />} onClick={() => void replaceAfter()} />
            <ToolTextButton label="Swap" icon={<ArrowLeftRight />} disabled={fields.before === null && fields.after === null} onClick={() => {
              set({ before: fields.after, after: fields.before });
              announce("Before and After swapped.");
            }} />
          </ButtonGroup>
          {both ? <ChoiceToggle label="Fit" value={fields.fit} options={[{ value: "cover", label: "Fill frame" }, { value: "contain", label: "Show both complete" }]} onChange={(fit) => set({ fit })} /> : null}
          <ChoiceToggle label="Placement" value={fields.placement} options={WIDE_OR_FULL} onChange={(placement) => set({ placement })} />
          <SecondarySetting label="Labels" title="Photo labels" description="Before is always on the left, After on the right. Change only the words." icon={null}>
            <div className="flex flex-col gap-2">
              <Input aria-label="Before label" value={fields.beforeLabel} maxLength={LIMITS.comparisonPhotoLabel} readOnly={readOnly} onChange={(event) => set({ beforeLabel: event.target.value })} />
              <Input aria-label="After label" value={fields.afterLabel} maxLength={LIMITS.comparisonPhotoLabel} readOnly={readOnly} onChange={(event) => set({ afterLabel: event.target.value })} />
            </div>
          </SecondarySetting>
        </>
      }
    >
      <BeforeAfterFigure
        figureRef={figure}
        fit={fields.fit}
        aspect={before.asset?.width && before.asset.height ? Math.round((before.asset.width / before.asset.height) * 1000) / 1000 : undefined}
        before={before.asset ? <ArticleImage asset={before.asset} alt={altFor(before.asset)} /> : fields.before === null ? slot("before") : <MediaStatus status={before.status === "loading" ? "loading" : "missing"} kind="image" />}
        after={after.asset ? <ArticleImage asset={after.asset} alt={altFor(after.asset)} /> : fields.after === null ? slot("after") : <MediaStatus status={after.status === "loading" ? "loading" : "missing"} kind="image" />}
        beforeLabel={fields.beforeLabel || "Before"}
        afterLabel={fields.afterLabel || "After"}
        caption={<InlineText inputRef={caption} className="byline-caption" label="Caption" placeholder="Say what changed, where and when." value={fields.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(value) => set({ caption: value })} />}
        credit={[...new Set([before.asset?.credit, after.asset?.credit].filter(Boolean))].join(", ") || undefined}
      />
      {both && differ && fields.fit === "cover" ? (
        <p className="byline-block-note" data-effect="warning" data-byline-chrome="" contentEditable={false}>
          <span>The photographs are different shapes, so After is cropped to match Before.</span>
          <Button type="button" variant="link" size="sm" onClick={() => set({ fit: "contain" })}>Show both complete</Button>
        </p>
      ) : null}
    </BlockShell>
  );
}

const clamp = (value: number) => Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;

export function AnnotatedImageEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("annotatedImage", node);
  const issues = useReadiness("annotatedImage", id, node.fields);
  const media = useMediaAsset(fields.media);
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const caption = useRef<HTMLTextAreaElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  useFocusWhenCreated(nodeKey, fields.media === null ? chooseRef : caption);
  const readOnly = !node.editable;
  const markers = fields.markers;
  const full = markers.length >= LIMITS.annotationsMax;
  const root = () => node.editor.getElementByKey(nodeKey);
  const replace = useReplaceImage("Replace the photograph", (asset) => set({ media: asset.id }));
  const focusNote = (index: number) => focusIn(root(), `.byline-annotations > :nth-child(${index + 1}) [data-part="title"] .byline-field`);
  const edit = (markerId: string, patch: Partial<(typeof markers)[number]>) => set({ markers: markers.map((marker) => (marker.id === markerId ? { ...marker, ...patch } : marker)) });

  const addAt = (x: number, y: number) => {
    if (full || readOnly) return;
    const marker = { id: newRowId(), x: clamp(x), y: clamp(y), title: "", body: "" };
    set({ markers: [...markers, marker] });
    setSelected(marker.id);
    announce(`Marker ${markers.length + 1} added. ${markers.length + 1} of ${LIMITS.annotationsMax}.`);
    focusNote(markers.length);
  };
  const removeMarker = (index: number) => {
    const change = removeItem(markers, index);
    set({ markers: change.items });
    setSelected(change.items[change.focus]?.id ?? null);
    announce(`Marker removed. ${change.items.length} left.`);
  };
  const reorder = (index: number, direction: -1 | 1) => {
    const change = moveItem(markers, index, direction);
    if (change.focus === index) return;
    set({ markers: change.items });
    announce(`Marker moved to number ${change.focus + 1}.`);
  };

  // A click on the photograph adds a marker only once the block is already active, so selecting the block never drops one.
  const wasActive = useRef(false);
  const onCanvasPointerDown = () => {
    wasActive.current = Boolean(root()?.contains(document.activeElement) && document.activeElement !== root());
  };
  const onCanvasClick = (event: React.MouseEvent) => {
    if (!(event.target instanceof HTMLImageElement) || !wasActive.current) return;
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    addAt(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
  };

  const percentOf = (event: ReactPointerEvent) => {
    const rect = canvas.current?.getBoundingClientRect();
    return rect?.width && rect.height ? { x: clamp(((event.clientX - rect.left) / rect.width) * 100), y: clamp(((event.clientY - rect.top) / rect.height) * 100) } : null;
  };

  const markerKeys = (event: React.KeyboardEvent, index: number) => {
    const marker = markers[index];
    if (!marker || readOnly) return;
    const step = event.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      edit(marker.id, { x: clamp(marker.x + move[0]), y: clamp(marker.y + move[1]) });
      announce(`Marker ${index + 1} at ${clamp(marker.x + move[0])} percent across, ${clamp(marker.y + move[1])} percent down.`);
    } else if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      reorder(index, event.key === "[" ? -1 : 1);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeMarker(index);
    } else if (event.key === "Enter") {
      event.preventDefault();
      focusNote(index);
    }
  };

  const asset = media.asset;
  return (
    <BlockShell
      type="annotatedImage"
      node={node}
      issues={issues}
      actions={fields.media !== null ? (
        <>
          <ImageActions media={fields.media} onReplace={() => void replace()} />
          <ButtonGroup>
            <ToolTextButton label="Add marker" icon={<Plus />} disabled={full || !asset} onClick={() => addAt(50, 50)} />
          </ButtonGroup>
          <ChoiceToggle label="Placement" value={fields.placement} options={WIDE_OR_FULL} onChange={(placement) => set({ placement })} />
          <AltTextSetting asset={asset} value={fields.altOverride} readOnly={readOnly} onChange={(altOverride) => set({ altOverride })} />
        </>
      ) : null}
    >
      {fields.media === null ? (
        <MediaPlaceholder kind="image" title="Add the photograph" description="Choose a photograph, then click it to place numbered notes on the parts that matter." readOnly={readOnly} onChosen={(assets) => assets[0] && set({ media: assets[0].id })} chooseRef={chooseRef} />
      ) : (
        <AnnotatedImageFigure
          canvasRef={canvas}
          onPointerDown={onCanvasPointerDown}
          onClick={onCanvasClick}
          image={asset ? <ArticleImage asset={asset} alt={altFor(asset, fields.altOverride)} /> : <MediaStatus status={media.status === "loading" ? "loading" : "missing"} kind="image" />}
          markers={markers.map((marker, index) => {
            const at = drag?.id === marker.id ? drag : marker;
            return (
              <button
                key={marker.id}
                type="button"
                className={`byline-annotation-marker${selected === marker.id ? " is-active" : ""}`}
                style={{ left: `${at.x}%`, top: `${at.y}%`, touchAction: "none", cursor: readOnly ? "default" : "grab" }}
                aria-label={`Marker ${index + 1}${marker.title ? `: ${marker.title}` : ""}. Arrow keys move it, Shift for more, [ and ] reorder, Delete removes.`}
                data-byline-chrome=""
                onFocus={() => setSelected(marker.id)}
                onKeyDown={(event) => markerKeys(event, index)}
                onPointerDown={(event) => {
                  if (readOnly) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setSelected(marker.id);
                  setDrag({ id: marker.id, x: marker.x, y: marker.y });
                }}
                onPointerMove={(event) => {
                  if (drag?.id !== marker.id) return;
                  const next = percentOf(event);
                  if (next) setDrag({ id: marker.id, ...next });
                }}
                onPointerUp={(event) => {
                  if (drag?.id !== marker.id) return;
                  const next = percentOf(event) ?? drag;
                  setDrag(null);
                  if (Math.abs(next.x - marker.x) > 0.2 || Math.abs(next.y - marker.y) > 0.2) edit(marker.id, { x: next.x, y: next.y });
                  else focusNote(index);
                }}
                // An interrupted touch or Pencil gesture never delivers pointerup; abandon the drag instead of sticking.
                onPointerCancel={() => { if (drag?.id === marker.id) setDrag(null); }}
                onLostPointerCapture={() => { if (drag?.id === marker.id) setDrag(null); }}
              >
                {index + 1}
              </button>
            );
          })}
          notes={
            <ol className="byline-annotations">
              {markers.map((marker, index) => (
                <li key={marker.id} id={annotationAnchor(id, marker.id)} className={selected === marker.id ? "is-active" : undefined} onFocusCapture={() => setSelected(marker.id)}>
                  <h3 data-part="title">
                    <InlineText label={`Note ${index + 1} title`} placeholder="What the reader should look at" value={marker.title} maxLength={LIMITS.annotationTitle} readOnly={readOnly} onChange={(title) => edit(marker.id, { title })} />
                  </h3>
                  <p>
                    <InlineText label={`Note ${index + 1} explanation`} placeholder="Why it matters" value={marker.body} maxLength={LIMITS.annotationBody} readOnly={readOnly} multiline onChange={(body) => edit(marker.id, { body })} />
                  </p>
                  {readOnly ? null : (
                    <ButtonGroup className="byline-row-actions" aria-label={`Note ${index + 1} actions`} data-byline-chrome="">
                      <ToolButton label="Move earlier" disabled={index === 0} onClick={() => reorder(index, -1)}><ArrowUp /></ToolButton>
                      <ToolButton label="Move later" disabled={index === markers.length - 1} onClick={() => reorder(index, 1)}><ArrowDown /></ToolButton>
                      <ToolButton label="Remove marker" onClick={() => removeMarker(index)}><Trash2 /></ToolButton>
                    </ButtonGroup>
                  )}
                </li>
              ))}
              {!markers.length && !readOnly ? (
                <li className="byline-annotation-empty" data-byline-chrome="" contentEditable={false}>Click the photograph to place the first marker, or use Add marker.</li>
              ) : null}
            </ol>
          }
          caption={<InlineText inputRef={caption} className="byline-caption" label="Caption" placeholder="Write a caption: who and what is shown, where and when." value={fields.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(value) => set({ caption: value })} />}
          credit={asset?.credit}
        />
      )}
    </BlockShell>
  );
}
