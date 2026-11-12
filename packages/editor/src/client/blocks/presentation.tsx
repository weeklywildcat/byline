"use client";

import type { MediaId, PresetOption } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { Crop, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { SettingsSurface } from "../chrome";
import { useAnnounce, useBylineEditorHost } from "../host";

/**
 * Presentation: the one secondary surface for how strongly a block
 * interrupts or expands the story (docs/story-presentation.md). A Popover
 * beside its trigger with a mouse, a bottom Sheet on touch or a narrow screen
 * (SettingsSurface). It holds a few newsroom presets, never a CSS knob, and
 * shows only the choices that apply to what is chosen now.
 *
 * Immediate actions (Replace, Crops) stay in the block toolbar; this is
 * where the less frequent visual choices live.
 */
export function PresentationSurface({ blockLabel, children }: { blockLabel: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SettingsSurface
      open={open}
      onOpenChange={setOpen}
      title="Presentation"
      description={`How this ${blockLabel.toLowerCase()} sits in the story. Check it on a phone in Preview.`}
      contentClassName="w-[22rem]"
      align="end"
      trigger={
        <Button type="button" variant="ghost" size="sm" aria-label={`${blockLabel} presentation`} data-presentation-trigger="">
          <SlidersHorizontal />
          Presentation
        </Button>
      }
    >
      <div className="flex flex-col gap-4" data-presentation-surface="">
        {children}
      </div>
    </SettingsSurface>
  );
}

/**
 * One preset choice: a labelled group of pressed/unpressed buttons (arrow
 * keys move between them), each with an optional mini preview, and the chosen
 * option's description in words below, so nothing depends on hover or colour.
 */
export function PresetField<T extends string>({ label, value, options, onChange, preview, name }: {
  label: string;
  value: T;
  options: ReadonlyArray<PresetOption<T>>;
  onChange: (value: T) => void;
  /** A small schematic of the result, when it makes the choice clearer than its name. */
  preview?: (value: T) => ReactNode;
  /** A stable hook for tests and the announcer (`data-preset`). */
  name: string;
}) {
  const id = useId();
  const announce = useAnnounce();
  const chosen = options.find((option) => option.value === value);
  return (
    <div className="flex flex-col gap-1.5" data-preset={name}>
      <p id={`${id}-label`} className="text-xs font-medium text-muted-foreground">{label}</p>
      <ToggleGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        variant="outline"
        size="sm"
        spacing={0}
        className="w-full"
        value={[value]}
        onValueChange={(next) => {
          const picked = next[0] as T | undefined;
          if (!picked || picked === value) return;
          onChange(picked);
          const option = options.find((entry) => entry.value === picked);
          if (option) announce(`${label}: ${option.label}.`);
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            data-value={option.value}
            className={preview ? "h-auto min-w-0 flex-1 flex-col gap-1 px-1.5 py-1.5 text-xs any-pointer-coarse:min-h-11" : "min-w-0 flex-1 any-pointer-coarse:min-h-11"}
          >
            {preview ? <span className="byline-preset-preview" aria-hidden="true">{preview(option.value)}</span> : null}
            <span className="truncate">{option.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p id={`${id}-description`} className="text-xs text-muted-foreground" data-preset-description="">{chosen?.description}</p>
    </div>
  );
}

/** The obvious route to Media's art direction from a presentation that crops a photograph. */
export function CropsRoute({ media, hint }: { media: MediaId | null; hint: string }) {
  const { editArtDirection } = useBylineEditorHost();
  if (!editArtDirection || media === null) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t pt-3" data-presentation-crops="">
      <Button type="button" variant="outline" size="sm" className="self-start any-pointer-coarse:min-h-11" onClick={() => void editArtDirection(media)}>
        <Crop />
        Crops and focal point
      </Button>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** A short line under the choices: what a reader on a phone will get. */
export function PresentationNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground" data-presentation-note="">{children}</p>;
}

// ---------------------------------------------------------------------------
// Mini previews: schematic, monochrome, never the only cue (the label and the
// description say the same thing in words).
// ---------------------------------------------------------------------------

/** Inline, so the toolbar's 16px icon rule never shrinks a preview. */
const PREVIEW_SIZE = { width: 44, height: 30 } as const;
const Frame = ({ children }: { children: ReactNode }) => (
  <svg width="44" height="30" style={PREVIEW_SIZE} viewBox="0 0 44 30" fill="currentColor" focusable="false">
    {children}
  </svg>
);
const photo = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx="1.5" opacity=".55" />;
const lines = (x: number, y: number, w: number, count: number, gap = 3.5) => Array.from({ length: count }, (_, index) => <rect key={index} x={x} y={y + index * gap} width={index === count - 1 ? w * .65 : w} height="1.6" rx=".8" opacity=".85" />);

export const WIDTH_PREVIEWS: Record<string, ReactNode> = {
  column: <Frame>{lines(12, 3, 20, 2)}{photo(12, 10, 20, 11)}{lines(12, 24, 20, 2)}</Frame>,
  wide: <Frame>{lines(12, 3, 20, 2)}{photo(5, 10, 34, 11)}{lines(12, 24, 20, 2)}</Frame>,
  full: <Frame>{lines(12, 3, 20, 2)}{photo(0, 10, 44, 11)}{lines(12, 24, 20, 2)}</Frame>
};

/** A phone outline: the photo inside its margins, or reaching both edges. */
const Phone = ({ children }: { children: ReactNode }) => (
  <svg width="44" height="30" style={PREVIEW_SIZE} viewBox="0 0 44 30" fill="currentColor" focusable="false">
    <rect x="13" y=".75" width="18" height="28.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".7" />
    {children}
  </svg>
);
export const PHONE_PREVIEWS: Record<string, ReactNode> = {
  auto: <Phone>{lines(16, 5, 12, 1)}<rect x="16" y="9" width="12" height="9" rx="1" opacity=".3" /><rect x="13.6" y="9" width="16.8" height="9" opacity=".25" />{lines(16, 21, 12, 2)}</Phone>,
  inset: <Phone>{lines(16, 5, 12, 1)}<rect x="16" y="9" width="12" height="9" rx="1" opacity=".55" />{lines(16, 21, 12, 2)}</Phone>,
  bleed: <Phone>{lines(16, 5, 12, 1)}<rect x="13.6" y="9" width="16.8" height="9" opacity=".55" />{lines(16, 21, 12, 2)}</Phone>
};

export const FEATURE_MEDIA_PREVIEWS: Record<string, ReactNode> = {
  split: <Frame>{photo(4, 5, 15, 20)}{lines(23, 7, 17, 4)}</Frame>,
  breakout: <Frame>{photo(2, 3, 28, 24)}{lines(33, 17, 9, 3)}</Frame>,
  spotlight: <Frame>{photo(0, 2, 44, 26)}<rect x="0" y="16" width="44" height="12" opacity=".35" />{lines(4, 19, 16, 2)}</Frame>,
  sticky: <Frame>{photo(4, 3, 15, 14)}<path d="M11.5 19.5v6m-2.5-2.5 2.5 2.5 2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.1" opacity=".6" />{lines(23, 3, 17, 7)}</Frame>
};

export const PULL_QUOTE_PREVIEWS: Record<string, ReactNode> = {
  standard: <Frame><rect x="12" y="6" width="20" height="1.2" opacity=".9" />{lines(12, 10, 20, 3, 4)}<rect x="12" y="24" width="20" height=".6" opacity=".6" /></Frame>,
  breakout: <Frame><rect x="7" y="4" width="30" height="1.6" opacity=".9" /><rect x="7" y="9" width="30" height="3" rx="1" opacity=".85" /><rect x="7" y="15" width="22" height="3" rx="1" opacity=".85" /><rect x="7" y="25" width="30" height=".6" opacity=".6" /></Frame>,
  full: <Frame><rect x="2" y="3" width="40" height=".8" opacity=".9" /><rect x="2" y="5" width="40" height=".8" opacity=".9" /><rect x="6" y="10" width="32" height="4" rx="1.2" opacity=".85" /><rect x="11" y="17" width="22" height="4" rx="1.2" opacity=".85" /><rect x="2" y="26" width="40" height=".6" opacity=".6" /></Frame>
};

export const CHAPTER_KIND_PREVIEWS: Record<string, ReactNode> = {
  media: <Frame>{photo(0, 2, 44, 26)}<rect x="4" y="16" width="20" height="3" rx="1" fill="var(--background, #fff)" opacity=".95" /><rect x="4" y="21" width="14" height="1.6" rx=".8" fill="var(--background, #fff)" opacity=".9" /></Frame>,
  text: <Frame><rect x="2" y="4" width="40" height=".8" /><rect x="2" y="6" width="40" height=".8" /><rect x="8" y="10" width="10" height="1.4" opacity=".6" /><rect x="8" y="14" width="26" height="4" rx="1.2" opacity=".9" />{lines(8, 21, 22, 1)}</Frame>,
  split: <Frame>{photo(0, 3, 21, 24)}<rect x="25" y="11" width="16" height="3.4" rx="1" opacity=".9" />{lines(25, 17, 14, 2)}</Frame>
};

/** A phone outline filled to the chapter's height. */
export const CHAPTER_HEIGHT_PREVIEWS: Record<string, ReactNode> = {
  short: <Phone>{lines(16, 4, 12, 1)}<rect x="13.6" y="8" width="16.8" height="6" opacity=".55" />{lines(16, 17, 12, 3)}</Phone>,
  half: <Phone>{lines(16, 4, 12, 1)}<rect x="13.6" y="8" width="16.8" height="12" opacity=".55" />{lines(16, 23, 12, 1)}</Phone>,
  full: <Phone><rect x="13.6" y="1.6" width="16.8" height="26.8" rx="2.4" opacity=".55" /></Phone>
};
