"use client";

import {
  altFor,
  ARTICLE_BLOCK_LIMITS as LIMITS,
  visualizationPieceName,
  visualizationPreviewNote,
  visualizationProviders,
  visualizationUrl,
  type ArticleMediaAsset,
  type ChartMapHeight
} from "@byline/article-body";
import { parseYouTubeVideoId } from "@byline/core";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { ArticleImage, AudioFigure, ChartMapFigure, RepositoryInteractiveFigure, VideoFigure, youTubeWatch } from "@byline/ui/article-body";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useRef } from "react";
import { BlockShell } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce, useBylineEditorHost, useMediaAsset } from "../host";
import { MediaPlaceholder, MediaStatus } from "./media";
import { AltTextSetting } from "./media";
import { ChoiceToggle, ImageActions, ImageSlot, ParagraphFields, usePrivilegedNode, useReplaceImage } from "./parts";
import { useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

export function VideoEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("video", node);
  const issues = useReadiness("video", id, node.fields);
  const url = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, url);
  const readOnly = !node.editable;
  const videoId = parseYouTubeVideoId(fields.url);
  return (
    <BlockShell type="video" node={node} issues={issues}>
      <VideoFigure
        videoId={videoId ?? "00000000000"}
        title={<InlineText inputRef={title} label="Video title" placeholder="Title of the video" value={fields.title} maxLength={LIMITS.videoTitle} readOnly={readOnly} onEnter={() => undefined} onChange={(value) => set({ title: value })} />}
        // The canvas never loads the YouTube player: it shows where it will be, and the published page plays it.
        player={
          <div className="byline-video-placeholder" data-byline-chrome="">
            <span>{videoId ? "The video plays here on the published story." : "Paste a YouTube address below."}</span>
            <InlineText inputRef={url} label="YouTube address" placeholder="https://www.youtube.com/watch?v=…" value={fields.url} maxLength={2048} readOnly={readOnly} onEnter={() => title.current?.focus()} onChange={(value) => set({ url: value.trim() })} />
            {fields.url && !videoId ? <span role="alert">That is not a YouTube address.</span> : null}
          </div>
        }
        caption={<InlineText className="byline-caption" label="Caption (optional)" placeholder="Caption (optional)" value={fields.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(value) => set({ caption: value })} />}
      />
      <label className="byline-confirm" data-byline-chrome="" contentEditable={false}>
        <Checkbox checked={fields.captionsConfirmed} disabled={readOnly} onCheckedChange={(checked) => set({ captionsConfirmed: checked === true })} aria-label="This video has captions" />
        <span>This video has captions. Required to publish.</span>
      </label>
    </BlockShell>
  );
}

export function AudioEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("audio", node);
  const issues = useReadiness("audio", id, node.fields);
  const media = useMediaAsset(fields.media);
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, fields.media === null ? chooseRef : title);
  const readOnly = !node.editable;
  const asset = media.asset;
  if (fields.media === null) {
    return (
      <BlockShell type="audio" node={node} issues={issues}>
        <MediaPlaceholder kind="audio" title="Add a recording" description="Choose an audio file from Media or upload one. A transcript is required to publish it." readOnly={readOnly} onChosen={(assets) => {
          if (assets[0]) {
            set({ media: assets[0].id });
            announce("Recording chosen.");
          }
        }} chooseRef={chooseRef} />
      </BlockShell>
    );
  }
  return (
    <BlockShell type="audio" node={node} issues={issues}>
      <AudioFigure
        editing
        title={<InlineText inputRef={title} label="Recording title" placeholder="Who is speaking, and about what" value={fields.title} maxLength={LIMITS.audioTitle} readOnly={readOnly} onEnter={() => transcript.current?.focus()} onChange={(value) => set({ title: value })} />}
        caption={<InlineText className="byline-caption" label="Context (optional)" placeholder="When and where it was recorded (optional)" value={fields.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(value) => set({ caption: value })} />}
        player={asset ? <audio controls preload="metadata" src={asset.src} /> : <MediaStatus status={media.status === "loading" ? "loading" : "missing"} kind="audio" />}
        transcript={<ParagraphFields scope=".byline-audio-transcript-text" inputRef={transcript} label="Transcript" placeholder="The words spoken in the recording. Required to publish." value={fields.transcript} readOnly={readOnly} onChange={(value) => set({ transcript: value.slice(0, LIMITS.audioTranscript) })} />}
      />
    </BlockShell>
  );
}

const HEIGHTS: ReadonlyArray<{ value: ChartMapHeight; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "tall", label: "Tall" },
  { value: "map", label: "Map" }
];

export function ChartMapEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("chartMap", node);
  const issues = useReadiness("chartMap", id, node.fields);
  const media = useMediaAsset(fields.image);
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const summary = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, titleRef);
  const readOnly = !node.editable;
  const asset = media.asset;
  const embed = fields.mode === "interactive" ? visualizationUrl(fields.url) : null;
  const replace = useReplaceImage(fields.mode === "static" ? "Choose the graphic" : "Choose a fallback graphic", (chosen) => set({ image: chosen.id }));
  const use = (assets: ArticleMediaAsset[]) => {
    if (assets[0]) {
      set({ image: assets[0].id });
      announce("Graphic chosen.");
    }
  };

  const graphic = fields.mode === "static"
    ? <ImageSlot media={fields.image} alt={fields.altOverride} readOnly={readOnly} onChosen={use} empty={{ title: "Add the graphic", description: "Choose the chart or map image from Media, or upload it." }}>{(_asset, image) => <div className="byline-visualization-fallback-image">{image}</div>}</ImageSlot>
    : (
      <>
        {asset ? <div className="byline-visualization-fallback-image"><ArticleImage asset={asset} alt={altFor(asset, fields.altOverride)} /></div> : null}
        <p className="byline-visualization-badge" data-byline-chrome="">
          <strong>Preview:</strong> {visualizationPreviewNote(embed?.provider ?? "")}
        </p>
        {asset ? null : <div className="byline-visualization-placeholder" data-byline-chrome="">{embed ? visualizationPieceName(embed.provider) : "Interactive chart or map"}</div>}
      </>
    );

  return (
    <BlockShell
      type="chartMap"
      node={node}
      issues={issues}
      actions={
        <>
          <ChoiceToggle label="Mode" value={fields.mode} options={[{ value: "interactive", label: "Interactive" }, { value: "static", label: "Static graphic" }]} onChange={(mode) => set({ mode })} />
          <ImageActions media={fields.image} label="Replace graphic" onReplace={() => void replace()} />
          {fields.image === null && fields.mode === "interactive" ? <Button type="button" variant="ghost" size="sm" onClick={() => void replace()}>Add fallback graphic</Button> : null}
          {fields.mode === "interactive" ? <ChoiceToggle label="Height" value={fields.height} options={HEIGHTS} onChange={(height) => set({ height })} /> : null}
          {fields.image !== null ? <AltTextSetting asset={asset} value={fields.altOverride} readOnly={readOnly} onChange={(altOverride) => set({ altOverride })} /> : null}
        </>
      }
    >
      <ChartMapFigure
        mode={fields.mode}
        provider={embed?.provider}
        src={embed?.src}
        height={fields.height}
        title={<InlineText inputRef={titleRef} label="Title" placeholder="What the chart or map shows" value={fields.title} maxLength={LIMITS.chartTitle} readOnly={readOnly} onEnter={() => summary.current?.focus()} onChange={(value) => set({ title: value })} />}
        dek={<InlineText label="Description (optional)" placeholder="What is measured, where and when (optional)" value={fields.dek} maxLength={LIMITS.chartDek} readOnly={readOnly} multiline onChange={(value) => set({ dek: value })} />}
        media={graphic}
        link={fields.mode === "interactive" ? (
          <div className="byline-visualization-link" data-byline-chrome="" contentEditable={false}>
            <InlineText label="Chart or map address" placeholder="Paste a Datawrapper, Flourish, Google Maps or OpenStreetMap address" value={fields.url} maxLength={2048} readOnly={readOnly} onChange={(value) => set({ url: value.trim() })} />
            {fields.url && !embed ? <p role="alert">That address is not from an allowed provider. {Object.values(visualizationProviders).map((provider) => provider.label).join(", ")}.</p> : embed ? <p><ExternalLink aria-hidden="true" /> {visualizationPieceName(embed.provider)}</p> : null}
          </div>
        ) : undefined}
        summary={<InlineText inputRef={summary} label="What it shows, in words" placeholder="The important finding, in a sentence or two. Readers who cannot see the graphic rely on this." value={fields.summary} maxLength={LIMITS.chartSummary} readOnly={readOnly} multiline onChange={(value) => set({ summary: value })} />}
        source={<InlineText label="Source" placeholder="Source" value={fields.source} maxLength={LIMITS.chartSource} readOnly={readOnly} onChange={(value) => set({ source: value })} />}
        notes={<InlineText label="Notes (optional)" placeholder="Notes (optional)" value={fields.notes} maxLength={LIMITS.chartNotes} readOnly={readOnly} multiline onChange={(value) => set({ notes: value })} />}
        credit={<InlineText label="Credit (optional)" placeholder="Credit (optional)" value={fields.credit} maxLength={LIMITS.chartCredit} readOnly={readOnly} onChange={(value) => set({ credit: value })} />}
      />
    </BlockShell>
  );
}

/** Editors and administrators only: pick one of the repository's registered interactives. The code is never edited here. */
export function RepositoryInteractiveEditor({ node: rawNode, id, nodeKey }: BlockEditorProps) {
  const node = usePrivilegedNode(rawNode);
  const [fields, set] = useTypedFields("repositoryInteractive", node);
  const issues = useReadiness("repositoryInteractive", id, node.fields);
  const { interactives = [] } = useBylineEditorHost();
  const title = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, title);
  const readOnly = !node.editable;
  const registered = interactives.find((entry) => entry.key === fields.key);
  return (
    <BlockShell
      type="repositoryInteractive"
      node={node}
      issues={issues}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" aria-label="Choose an interactive" />}>
            {registered?.name ?? (fields.key ? `Missing: ${fields.key}` : "Choose an interactive")}
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-64">
            {interactives.length ? interactives.map((entry) => (
              <DropdownMenuItem key={entry.key} onClick={() => set({ key: entry.key, title: fields.title || entry.name, description: fields.description || entry.description })}>
                <span className="flex flex-col">
                  <span>{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{entry.description}</span>
                </span>
              </DropdownMenuItem>
            )) : <DropdownMenuItem disabled>No interactives are registered in the site's code.</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <RepositoryInteractiveFigure
        interactiveKey={fields.key || "none"}
        title={<InlineText inputRef={title} label="Title" placeholder="Title" value={fields.title} maxLength={LIMITS.interactiveTitle} readOnly={readOnly} onChange={(value) => set({ title: value })} />}
        description={<InlineText label="Text alternative" placeholder="Describe what it shows in words, for readers who cannot use it." value={fields.description} maxLength={LIMITS.interactiveDescription} readOnly={readOnly} multiline onChange={(value) => set({ description: value })} />}
      >
        <p className="byline-block-note" data-effect="info" data-byline-chrome="" contentEditable={false}>
          <span>{registered ? `${registered.name} loads here on the published story.` : "Choose a registered interactive above."}</span>
        </p>
      </RepositoryInteractiveFigure>
    </BlockShell>
  );
}

export { youTubeWatch };
