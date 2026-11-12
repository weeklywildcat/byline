"use client";

import { PresentationNote, PresetField, SettingsSurface } from "@byline/editor/client";
import { Button } from "@byline/newsroom-ui/ui/button";
import { LayoutTemplate } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  FEATURE_IMAGE_WIDTH_OPTIONS,
  IMMERSIVE_ALIGNMENT_OPTIONS,
  SPLIT_IMAGE_SIDE_OPTIONS,
  STORY_PRESENTATION_OPTIONS,
  STORY_PRESENTATION_SUMMARIES,
  STORY_SITE_NAVIGATION_OPTIONS,
  type FeatureImageWidth,
  type ImmersiveAlignment,
  type SplitImageSide,
  type StoryPresentationChoice,
  type StorySiteNavigation
} from "../../domain/vocabulary";
import { useStoryField } from "./form";

/**
 * "How should this story begin?": the Story opening control. It chooses the
 * opening (Standard, Feature, Immersive, Split) and, separately, the Site
 * navigation around it, then shows only the settings that belong to the chosen
 * opening. A Popover with a mouse and a bottom Sheet on touch or a narrow
 * screen (`SettingsSurface`, the same surface block Presentation uses).
 *
 * The two choices are orthogonal: changing the opening never changes the
 * navigation, and the helper copy only recommends.
 */

const withDescriptions = <T extends string>(options: ReadonlyArray<{ value: T; label: string }>, descriptions: Record<T, string>) =>
  options.map((option) => ({ ...option, description: descriptions[option.value] }));

const OPENING_OPTIONS = withDescriptions(STORY_PRESENTATION_OPTIONS, STORY_PRESENTATION_SUMMARIES);

const NAVIGATION_OPTIONS = withDescriptions<StorySiteNavigation>(STORY_SITE_NAVIGATION_OPTIONS, {
  standard: "The publication header: masthead, section links and search.",
  minimal: "Minimal keeps only menu, logo and search over the story opening."
});

const ALIGNMENT_OPTIONS = withDescriptions<ImmersiveAlignment>(IMMERSIVE_ALIGNMENT_OPTIONS, {
  "bottom-left": "The headline sits low and to the left, over a soft shade.",
  center: "The headline is centered on the photograph."
});

const WIDTH_OPTIONS = withDescriptions<FeatureImageWidth>(FEATURE_IMAGE_WIDTH_OPTIONS, {
  wide: "The photograph is wider than the text, with a margin either side.",
  full: "The photograph runs edge to edge."
});

const SIDE_OPTIONS = withDescriptions<SplitImageSide>(SPLIT_IMAGE_SIDE_OPTIONS, {
  left: "Photograph on the left, headline on the right.",
  right: "Headline on the left, photograph on the right."
});

/* Schematic previews: monochrome, never the only cue (each option also has its name and a sentence). */
const Frame = ({ children }: { children: ReactNode }) => (
  <svg width="44" height="30" style={{ width: 44, height: 30 }} viewBox="0 0 44 30" fill="currentColor" focusable="false">
    {children}
  </svg>
);
const photo = (x: number, y: number, w: number, h: number, opacity = 0.55) => <rect x={x} y={y} width={w} height={h} rx="1.5" opacity={opacity} />;
const line = (x: number, y: number, w: number, h = 1.6) => <rect x={x} y={y} width={w} height={h} rx=".8" opacity=".85" />;

const OPENING_PREVIEWS: Record<StoryPresentationChoice, ReactNode> = {
  standard: <Frame>{line(10, 3, 24, 2.4)}{line(10, 8, 18)}{photo(10, 13, 24, 13)}</Frame>,
  feature: <Frame>{line(10, 3, 24, 2.4)}{line(10, 8, 18)}{photo(2, 13, 40, 15)}</Frame>,
  immersive: <Frame>{photo(0, 0, 44, 30, 0.6)}<rect x="4" y="18" width="20" height="2.4" rx="1" fill="var(--background, #fff)" />{<rect x="4" y="23" width="14" height="1.6" rx=".8" fill="var(--background, #fff)" opacity=".85" />}</Frame>,
  split: <Frame>{line(3, 17, 15, 2.4)}{line(3, 22, 12)}{photo(22, 0, 22, 30)}</Frame>
};

const NAVIGATION_PREVIEWS: Record<StorySiteNavigation, ReactNode> = {
  standard: <Frame>{line(8, 3, 28, 2.4)}{line(4, 8, 36, 1)}{photo(4, 12, 36, 14)}</Frame>,
  minimal: <Frame>{photo(0, 0, 44, 30, 0.35)}<circle cx="6" cy="5" r="2.4" fill="var(--background, #fff)" />{<rect x="15" y="4" width="14" height="2" rx="1" fill="var(--background, #fff)" />}<circle cx="38" cy="5" r="2.4" fill="var(--background, #fff)" /></Frame>
};

const ALIGNMENT_PREVIEWS: Record<ImmersiveAlignment, ReactNode> = {
  "bottom-left": <Frame>{photo(0, 0, 44, 30)}{<rect x="4" y="20" width="18" height="2.4" rx="1" fill="var(--background, #fff)" />}</Frame>,
  center: <Frame>{photo(0, 0, 44, 30)}{<rect x="13" y="13" width="18" height="2.4" rx="1" fill="var(--background, #fff)" />}</Frame>
};

const WIDTH_PREVIEWS: Record<FeatureImageWidth, ReactNode> = {
  wide: <Frame>{line(10, 3, 24, 2.4)}{photo(4, 10, 36, 16)}</Frame>,
  full: <Frame>{line(10, 3, 24, 2.4)}{photo(0, 10, 44, 16)}</Frame>
};

const SIDE_PREVIEWS: Record<SplitImageSide, ReactNode> = {
  left: <Frame>{photo(0, 0, 22, 30)}{line(26, 17, 15, 2.4)}{line(26, 22, 12)}</Frame>,
  right: <Frame>{line(3, 17, 15, 2.4)}{line(3, 22, 12)}{photo(22, 0, 22, 30)}</Frame>
};

const labelOf = <T extends string>(options: ReadonlyArray<{ value: T; label: string }>, value: T) => options.find((option) => option.value === value)?.label ?? value;

export function StoryOpeningSettings({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const presentation = useStoryField<string>("presentation");
  const alignment = useStoryField<string>("immersiveAlignment");
  const featureWidth = useStoryField<string>("featureWidth");
  const splitSide = useStoryField<string>("splitImageSide");
  const navigation = useStoryField<string>("siteNavigation");

  const opening = (STORY_PRESENTATION_OPTIONS.some((option) => option.value === presentation.value) ? presentation.value : "standard") as StoryPresentationChoice;
  const siteNavigation = (navigation.value === "minimal" ? "minimal" : "standard") as StorySiteNavigation;
  const summary = `${labelOf(STORY_PRESENTATION_OPTIONS, opening)} · ${labelOf(STORY_SITE_NAVIGATION_OPTIONS, siteNavigation)} navigation`;

  return (
    <SettingsSurface
      open={open}
      onOpenChange={setOpen}
      title="Story opening"
      description="How this story begins, and how much of the site's header surrounds it. Check it on a phone in Preview."
      contentClassName="w-[24rem]"
      align="start"
      trigger={
        <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 w-full justify-start gap-2 py-1.5 text-left font-normal any-pointer-coarse:min-h-11" aria-label={`Story opening: ${summary}`} data-story-opening-trigger="" disabled={disabled}>
          <LayoutTemplate aria-hidden="true" />
          <span className="min-w-0 truncate">{summary}</span>
        </Button>
      }
    >
      <div className="flex flex-col gap-4" data-story-opening-surface="">
        <PresetField<StoryPresentationChoice> name="story-opening" label="Opening" value={opening} options={OPENING_OPTIONS} onChange={(next) => presentation.setValue(next)} preview={(value) => OPENING_PREVIEWS[value]} />

        {opening === "immersive" ? (
          <PresetField<ImmersiveAlignment> name="immersive-alignment" label="Text position" value={(alignment.value === "center" ? "center" : "bottom-left") as ImmersiveAlignment} options={ALIGNMENT_OPTIONS} onChange={(next) => alignment.setValue(next)} preview={(value) => ALIGNMENT_PREVIEWS[value]} />
        ) : null}
        {opening === "feature" ? (
          <PresetField<FeatureImageWidth> name="feature-width" label="Image width" value={(featureWidth.value === "full" ? "full" : "wide") as FeatureImageWidth} options={WIDTH_OPTIONS} onChange={(next) => featureWidth.setValue(next)} preview={(value) => WIDTH_PREVIEWS[value]} />
        ) : null}
        {opening === "split" ? (
          <PresetField<SplitImageSide> name="split-image-side" label="Image side" value={(splitSide.value === "left" ? "left" : "right") as SplitImageSide} options={SIDE_OPTIONS} onChange={(next) => splitSide.setValue(next)} preview={(value) => SIDE_PREVIEWS[value]} />
        ) : null}

        <PresetField<StorySiteNavigation> name="site-navigation" label="Site navigation" value={siteNavigation} options={NAVIGATION_OPTIONS} onChange={(next) => navigation.setValue(next)} preview={(value) => NAVIGATION_PREVIEWS[value]} />

        <PresentationNote>
          {opening === "standard"
            ? "Standard fits most daily stories."
            : opening === "immersive"
              ? "Immersive reads best with Minimal navigation."
              : "Feature and Split work with either navigation."}{" "}
          On a phone, Feature and Split stack the headline above an edge-to-edge photograph; Immersive fills the screen.
        </PresentationNote>
      </div>
    </SettingsSurface>
  );
}
