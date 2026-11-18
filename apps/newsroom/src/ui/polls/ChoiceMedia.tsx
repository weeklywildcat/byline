"use client";

import { mediaAssetKey } from "@byline/newsroom-screens/media/media-library-api";
import { Button } from "@byline/newsroom-ui/ui/button";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { imageCardLists, isChoiceImageFilename, MAX_POLL_IMAGES } from "../../polls/engine/presentation";
import type { ChoiceImage, ChoiceImages, SurveyDefinition } from "../../polls/engine/types";
import { useMediaWorkspace } from "../media/MediaWorkspaceShell";
import { pollKeys } from "./api";

/** Private Library previews for Build and draft Preview. Published previews take their frozen renditions. */
export function useDraftChoiceImages(definition?: SurveyDefinition | null): ChoiceImages {
  const { fetchers } = useMediaWorkspace();
  const lists = definition ? [...imageCardLists(definition)] : [];
  const ids = [...new Set(lists.flatMap(([, { choices }]) => choices.flatMap(({ image }) => image?.mediaId ? [image.mediaId] : [])))].slice(0, MAX_POLL_IMAGES);
  const assets = useQueries({ queries: ids.map((id) => ({ queryKey: mediaAssetKey(id), queryFn: () => fetchers.getAsset(id), staleTime: 30_000 })) });
  const byId = new Map(assets.flatMap(({ data }) => data ? [[data.id, data] as const] : []));
  const images: ChoiceImages = Object.create(null);
  for (const [list, { choices }] of lists) {
    for (const choice of choices) {
      if (!choice.image?.mediaId) continue;
      const asset = byId.get(choice.image.mediaId);
      if (!asset?.previewUrl) continue;
      images[list] ??= Object.create(null);
      images[list][choice.name] = { src: asset.previewUrl, alt: asset.alt, width: asset.width ?? 640, height: asset.height ?? 480 };
    }
  }
  return images;
}

export function ChoiceMedia({ image, label, onChange }: { image?: ChoiceImage; label: string; onChange: (image?: ChoiceImage) => void }) {
  const { pick, fetchers, editDetails } = useMediaWorkspace();
  const client = useQueryClient();
  const mediaId = image?.mediaId;
  const asset = useQuery({
    queryKey: mediaId ? mediaAssetKey(mediaId) : ["byline", "media", "unchosen"],
    queryFn: () => fetchers.getAsset(mediaId!),
    enabled: !!mediaId, staleTime: 30_000
  }).data;
  async function choose() {
    const [selected] = await pick({ kind: "image", restrictedKind: "image", multiple: false, title: "Choose an answer image", confirmLabel: "Use image" });
    if (!selected) return;
    const sourceName = (!mediaId ? image?.sourceName : undefined) ?? selected.filename;
    onChange({ mediaId: selected.id, ...(isChoiceImageFilename(sourceName) ? { sourceName } : {}) });
  }
  return <div className="ml-8 flex min-w-0 flex-wrap items-center gap-2 pb-2">
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-hidden="true">
      {asset?.previewUrl ? <img src={asset.previewUrl} alt="" className="size-full object-contain" /> : <ImageIcon className="size-4 text-muted-foreground" />}
    </span>
    <div className="flex min-w-0 flex-1 flex-col items-start">
      {asset?.filename || image?.sourceName ? <span className="max-w-full text-xs wrap-anywhere text-muted-foreground">{asset?.filename ?? image?.sourceName}</span> : null}
      <div className="flex flex-wrap items-center">
        <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2" aria-label={mediaId ? `Replace image for ${label}` : `Choose image for ${label}`}
          onClick={() => void choose()}>{mediaId ? "Replace" : "Choose image"}</Button>
        {image ? <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2" aria-label={`Remove image for ${label}`} onClick={() => onChange(undefined)}>Remove</Button> : null}
        {mediaId ? <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2" onClick={async () => {
          await editDetails(mediaId);
          void client.invalidateQueries({ queryKey: pollKeys.all });
        }}>Media details</Button> : null}
      </div>
    </div>
  </div>;
}
