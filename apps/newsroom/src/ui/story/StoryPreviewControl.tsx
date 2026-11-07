"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@byline/newsroom-ui/ui/tooltip";
import { parseYouTubeVideoId } from "@byline/core";
import { resolveStoryPresentation, storyPresentationRegistry, type StoryPresentationResolution } from "@byline/story-presentations";
import { useConfig, useDocumentInfo, useLivePreviewContext } from "@payloadcms/ui";
import { Eye } from "lucide-react";
import { useMemo } from "react";
import { relationIdOf, useStoryField } from "./form";

/**
 * Byline's entry to Payload's Live Preview. Payload owns the preview itself
 * (pane, iframe, toolbar, devices, zoom, pop-out, transport, and remembering
 * whether it was open); this button only flips Payload's own open state
 * through its public context, so there is exactly one preview state.
 * Rendered nothing when Live Preview is not available for this document.
 */
export function PreviewButton() {
  const { isLivePreviewEnabled, isLivePreviewing, setIsLivePreviewing, url } = useLivePreviewContext();
  if (!isLivePreviewEnabled || !url) return null;
  const label = isLivePreviewing ? "Previewing" : "Preview";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button type="button" variant={isLivePreviewing ? "secondary" : "outline"} size="sm" aria-pressed={isLivePreviewing} onClick={() => setIsLivePreviewing(!isLivePreviewing)} data-story-preview="">
            <Eye data-icon="inline-start" aria-hidden="true" />
            <span className="max-md:sr-only">{label}</span>
          </Button>
        }
      />
      <TooltipContent>{isLivePreviewing ? "Close the live preview" : "Preview the story as readers will see it"}</TooltipContent>
    </Tooltip>
  );
}

/** The shared resolver's answer for the story as it is in the form right now. */
export function useStoryPresentationResolution(): StoryPresentationResolution {
  const { id } = useDocumentInfo();
  const { config } = useConfig();
  const fixtures = Boolean((config.admin?.custom as { storyPresentationFixtures?: boolean } | undefined)?.storyPresentationFixtures);
  const registry = useMemo(() => storyPresentationRegistry({ fixtures }), [fixtures]);
  const { value: presentation } = useStoryField<string>("presentation");
  const { value: featuredMedia } = useStoryField<unknown>("featuredMedia");
  const { value: format } = useStoryField<string>("format");
  const { value: videoUrl } = useStoryField<string>("video.url");
  const isVideo = format === "video" && parseYouTubeVideoId(videoUrl) !== null;
  return useMemo(
    () => resolveStoryPresentation(
      {
        id: id ?? 0,
        storyPresentation: presentation === "immersive" ? "immersive" : "standard",
        image: relationIdOf(featuredMedia) !== null ? { src: "lead" } : null,
        video: isVideo ? true : null
      },
      registry
    ),
    [id, presentation, featuredMedia, isVideo, registry]
  );
}

const REASONS: Record<string, string> = {
  "missing-lead-image": "Immersive requires a lead image.",
  "video-story": "Immersive isn't used for video stories."
};

/** What the story will open as, and why, from the shared resolver (never a second copy of the rule). */
export function PresentationStatus() {
  const resolution = useStoryPresentationResolution();
  if (resolution.custom) {
    return (
      <div className="flex flex-wrap items-center gap-x-2" data-presentation-status={resolution.reason}>
        <dt className="text-muted-foreground">{resolution.custom.kind === "visual-story" ? "Visual story" : "Custom presentation"}</dt>
        <dd>{resolution.custom.title}</dd>
        <dd className="text-xs text-muted-foreground">Overrides the Story presentation setting.</dd>
      </div>
    );
  }
  const fellBack = resolution.requested !== resolution.resolved;
  return (
    <div className="flex flex-wrap items-center gap-x-2" data-presentation-status={resolution.reason}>
      <dt className="text-muted-foreground">Presentation</dt>
      <dd>{resolution.resolved === "immersive" ? "Immersive" : "Standard"}</dd>
      {fellBack ? (
        <dd className="text-xs text-muted-foreground">
          Previewing as Standard. {REASONS[resolution.reason]}
        </dd>
      ) : null}
    </div>
  );
}
