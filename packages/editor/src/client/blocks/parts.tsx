"use client";

import { altFor, type ArticleMediaAsset, type MediaId } from "@byline/article-body";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { ArticleImage } from "@byline/ui/article-body";
import { Crop, ImagePlus } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useBylineEditorHost, useMediaAsset, usePickMedia } from "../host";
import { MediaPlaceholder, MediaStatus } from "./media";

/**
 * Pieces several block editors share. Each is small and does one thing; none
 * is a universal block editor.
 */

/**
 * Paragraphs typed in their own slots, so they keep the article's paragraph
 * spacing. Enter starts a new paragraph; Backspace at the start of one joins
 * it to the one before. Stored as plain text with blank lines between
 * paragraphs. `scope` is the CSS selector of the element whose direct
 * paragraphs these are.
 */
export function ParagraphFields({ value, readOnly, onChange, label, placeholder, inputRef, scope = "aside" }: { value: string; readOnly: boolean; onChange: (value: string) => void; label: string; placeholder: string; inputRef?: Ref<HTMLTextAreaElement>; scope?: string }) {
  const paragraphs = value.split(/\n\s*\n/);
  const write = (next: string[]) => onChange(next.join("\n\n"));
  const focusAt = (from: HTMLElement, index: number, caret: number) => window.requestAnimationFrame(() => {
    const element = from.closest(scope)?.querySelectorAll<HTMLTextAreaElement>(":scope > p > .byline-field, :scope > .byline-paragraphs > p > .byline-field")[index];
    element?.focus();
    element?.setSelectionRange(caret, caret);
  });
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          <InlineText
            inputRef={index === 0 ? inputRef : undefined}
            label={paragraphs.length > 1 ? `${label}, paragraph ${index + 1}` : label}
            placeholder={index === 0 ? placeholder : ""}
            value={paragraph}
            readOnly={readOnly}
            onChange={(text) => write(paragraphs.map((current, i) => (i === index ? text : current)))}
            onKeyDown={(event) => {
              const field = event.currentTarget;
              if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault();
                const before = field.value.slice(0, field.selectionStart).trimEnd();
                const after = field.value.slice(field.selectionEnd).trimStart();
                write([...paragraphs.slice(0, index), before, after, ...paragraphs.slice(index + 1)]);
                focusAt(field, index + 1, 0);
              } else if (event.key === "Backspace" && index > 0 && field.selectionStart === 0 && field.selectionEnd === 0) {
                event.preventDefault();
                const previous = paragraphs[index - 1] ?? "";
                write([...paragraphs.slice(0, index - 1), previous + paragraph, ...paragraphs.slice(index + 1)]);
                focusAt(field, index - 1, previous.length);
              }
            }}
          />
        </p>
      ))}
    </>
  );
}

/** An exclusive choice among a few named options (placement, side, fit): a ToggleGroup that announces nothing it does not need to. */
export function ChoiceToggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <ToggleGroup aria-label={label} variant="outline" size="sm" spacing={0} value={[value]} onValueChange={(next) => {
      const chosen = next[0] as T | undefined;
      if (chosen && chosen !== value) onChange(chosen);
    }}>
      {options.map((option) => <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

/**
 * One image in a block: the placeholder when empty, the real image (with its
 * focal point) when chosen, a calm status when Media no longer has it.
 * `children` receives the loaded asset so a caller can draw a different
 * treatment (a chapter's overlay, a marker layer) around it.
 */
export function ImageSlot({ media, alt, readOnly, empty, onChosen, chooseRef, sizes, children }: {
  media: MediaId | null;
  alt: string;
  readOnly: boolean;
  empty: { title: string; description: string };
  onChosen: (assets: ArticleMediaAsset[]) => void;
  chooseRef?: Ref<HTMLButtonElement>;
  sizes?: string;
  children?: (asset: ArticleMediaAsset, image: ReactNode) => ReactNode;
}) {
  const entry = useMediaAsset(media);
  if (media === null) return <MediaPlaceholder kind="image" title={empty.title} description={empty.description} readOnly={readOnly} onChosen={onChosen} chooseRef={chooseRef} />;
  if (!entry.asset) return <MediaStatus status={entry.status === "loading" ? "loading" : "missing"} kind="image" />;
  const image = <ArticleImage asset={entry.asset} alt={altFor(entry.asset, alt)} sizes={sizes} />;
  return <>{children ? children(entry.asset, image) : image}</>;
}

/** Replace and Crops, the two actions every single-image block shares. */
export function ImageActions({ media, onReplace, label = "Replace" }: { media: MediaId | null; onReplace: () => void; label?: string }) {
  const { editArtDirection } = useBylineEditorHost();
  if (media === null) return null;
  return (
    <ButtonGroup>
      <ToolTextButton label={label} icon={<ImagePlus />} onClick={onReplace} />
      {editArtDirection ? <ToolTextButton label="Crops" icon={<Crop />} onClick={() => void editArtDirection(media)} /> : null}
    </ButtonGroup>
  );
}

/** Choose another image through the Media picker. */
export function useReplaceImage(title: string, onChosen: (asset: ArticleMediaAsset) => void) {
  const pick = usePickMedia();
  return async () => {
    const [asset] = await pick({ kind: "image", multiple: false, title, confirmLabel: "Use this photograph" });
    if (asset) onChosen(asset);
  };
}

/** How far an image's shape is from a portrait: a profile photo wider than this ratio gets a gentle warning. */
export const WIDE_IMAGE_RATIO = 1.6;

/** A privileged block shown to a writer who may not change it: the same node, never editable, with no toolbar. */
export function usePrivilegedNode<T extends { editable: boolean }>(node: T): T {
  const { canUsePrivilegedBlocks } = useBylineEditorHost();
  return canUsePrivilegedBlocks ? node : { ...node, editable: false };
}
