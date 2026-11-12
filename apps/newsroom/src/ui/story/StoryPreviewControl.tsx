"use client";

import { parseYouTubeVideoId } from "@byline/core";
import { requestedPresentation } from "@byline/content/story";
// The metadata-only resolver: importing the full package here would load every story's React code
// (and @byline/ui) into the admin bundle, which keeps Payload's Lexical field from mounting.
import { resolveStoryPresentation, type StoryPresentationIdentity, type StoryPresentationResolution } from "@byline/story-presentations/resolve";
import { Button } from "@byline/newsroom-ui/ui/button";
import { useConfig, useDocumentInfo, useFormFields, useLivePreviewContext } from "@payloadcms/ui";
import { Eye, X } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { relationIdOf } from "./form";

export type StoryPreview = {
  /** False when Live Preview is not available for this document. */
  available: boolean;
  /** True while the preview window is open. */
  previewing: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

/**
 * Byline's entry to Payload's Live Preview. Payload owns the preview itself
 * (toolbar, transport, the page it renders and the live updates posted to it);
 * Byline only chooses where it shows: always a separate popup window, never
 * Payload's side-by-side pane, which squeezes the editor and breaks its layout.
 * `open` must run inside a click so the browser allows the window.
 *
 * Payload remembers an open pane per account and reopens it on load, and it
 * falls back to the pane when the popup is closed. Neither is wanted, so
 * whenever Live Preview is on without a popup window, it is switched off.
 */
export function useStoryPreview(): StoryPreview {
  const { isLivePreviewEnabled, isLivePreviewing, isPopupOpen, popupRef, setIsLivePreviewing, setPreviewWindowType, url } = useLivePreviewContext();
  const previewing = Boolean(isLivePreviewing && isPopupOpen);

  useEffect(() => {
    if (isLivePreviewing && !isPopupOpen) setIsLivePreviewing(false);
  }, [isLivePreviewing, isPopupOpen, setIsLivePreviewing]);

  const open = useCallback(() => {
    setIsLivePreviewing(true);
    setPreviewWindowType("popup");
  }, [setIsLivePreviewing, setPreviewWindowType]);
  const close = useCallback(() => {
    setIsLivePreviewing(false);
    popupRef?.current?.close();
  }, [popupRef, setIsLivePreviewing]);
  const toggle = useCallback(() => (previewing ? close() : open()), [previewing, open, close]);
  return { available: Boolean(isLivePreviewEnabled && url), previewing, open, close, toggle };
}

/**
 * The Story header's Preview action: always visible beside the main actions,
 * never in the overflow menu. One button that stays mounted while it changes
 * from "Preview" to "Close preview", so keyboard focus stays on it when the
 * preview window opens or closes. On a narrow header it is icon-only and keeps its name
 * in `aria-label`. The open state is the secondary (filled) button and a
 * different icon and name, never colour alone.
 */
export function StoryPreviewButton({ preview }: { preview: StoryPreview }) {
  if (!preview.available) return null;
  const label = preview.previewing ? "Close preview" : "Preview";
  return (
    <Button
      type="button"
      size="sm"
      variant={preview.previewing ? "secondary" : "outline"}
      onClick={preview.toggle}
      aria-label={label}
      data-story-preview=""
      data-previewing={preview.previewing ? "" : undefined}
      className="any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11"
    >
      {preview.previewing ? <X data-icon="inline-start" aria-hidden="true" /> : <Eye data-icon="inline-start" aria-hidden="true" />}
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}

/** The shared resolver's answer for the story as it is in the form right now. */
export function useStoryPresentationResolution(): StoryPresentationResolution {
  const { id } = useDocumentInfo();
  const { config } = useConfig();
  // Plain data from the server (payload.config.ts): the registry's identities, never its components.
  const registry = ((config.admin?.custom as { storyPresentations?: Record<number, StoryPresentationIdentity> } | undefined)?.storyPresentations ?? {}) as Record<number, StoryPresentationIdentity>;
  // Read-only selectors: this status must never register fields in the form (`useField` on a
  // path inside a conditional group, such as `video.url`, disturbs the document's field state
  // and kept the body editor from mounting).
  const presentation = useFormFields(([fields]) => fields.presentation?.value) as string | undefined;
  const featuredMedia = useFormFields(([fields]) => fields.featuredMedia?.value);
  const format = useFormFields(([fields]) => fields.format?.value) as string | undefined;
  const videoUrl = useFormFields(([fields]) => fields["video.url"]?.value) as string | undefined;
  const isVideo = format === "video" && parseYouTubeVideoId(videoUrl) !== null;
  return useMemo(
    () => resolveStoryPresentation(
      {
        id: id ?? 0,
        storyPresentation: requestedPresentation(presentation),
        image: relationIdOf(featuredMedia) !== null ? { src: "lead" } : null,
        video: isVideo ? true : null
      },
      registry
    ),
    [id, presentation, featuredMedia, isVideo, registry]
  );
}

const OPENING_LABELS: Record<string, string> = { standard: "Standard", feature: "Feature", immersive: "Immersive", split: "Split" };

const REASONS: Record<string, (opening: string) => string> = {
  "missing-lead-image": (opening) => `${opening} requires a lead image.`,
  "video-story": (opening) => `${opening} isn't used for video stories.`
};

/** What the story will open as, and why, from the shared resolver (never a second copy of the rule). */
export function PresentationStatus({ resolution }: { resolution: StoryPresentationResolution }) {
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
      <dt className="text-muted-foreground">Story opening</dt>
      <dd>{OPENING_LABELS[resolution.resolved] ?? "Standard"}</dd>
      {fellBack ? (
        <dd className="text-xs text-muted-foreground">
          Previewing as Standard. {REASONS[resolution.reason]?.(OPENING_LABELS[resolution.requested] ?? "This opening")}
        </dd>
      ) : null}
    </div>
  );
}
