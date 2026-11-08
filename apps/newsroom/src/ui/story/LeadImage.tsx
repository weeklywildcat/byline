"use client";

import { MediaPlaceholder, useMediaAsset, useOptionalEditorHost, usePickMedia } from "@byline/editor/client";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { Crop, ImagePlus, X } from "lucide-react";
import { relationIdOf, useStoryField } from "./form";

/**
 * The lead image, chosen through Byline Media (never Payload's upload
 * control). It writes the story's real `featuredMedia` relationship, so
 * autosave, versions and publishing see it; the caption is this story's,
 * the credit is the asset's.
 */
export function LeadImage({ readOnly }: { readOnly: boolean }) {
  const media = useStoryField<unknown>("featuredMedia");
  const caption = useStoryField<string>("featuredCaption");
  const id = relationIdOf(media.value);
  const entry = useMediaAsset(id === null ? null : id);
  const pick = usePickMedia();
  const editArtDirection = useOptionalEditorHost()?.editArtDirection;
  const asset = entry.asset;

  const choose = async () => {
    const [chosen] = await pick({ kind: "image", multiple: false, title: "Choose the lead image", confirmLabel: "Use this photograph" });
    if (chosen) media.setValue(chosen.id);
  };

  if (id === null) {
    return (
      <MediaPlaceholder
        kind="image"
        title="Lead image"
        description="The photograph at the top of the story. Choose it from Media or upload it; its credit comes from Media."
        readOnly={readOnly}
        onChosen={(assets) => { if (assets[0]) media.setValue(assets[0].id); }}
      />
    );
  }

  return (
    <figure className="m-0 flex flex-col gap-2" aria-label="Lead image">
      {asset ? (
        <img src={asset.src} alt={asset.alt} width={asset.width ?? undefined} height={asset.height ?? undefined} className="block h-auto max-h-[70vh] w-full bg-muted object-contain" />
      ) : (
        <div className="flex aspect-[3/2] items-center justify-center bg-muted text-sm text-muted-foreground">{entry.status === "loading" ? "Loading…" : "This photograph is no longer in Media. Replace it."}</div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{asset?.credit ? `Photo: ${asset.credit}` : asset ? "No credit in Media for this photograph." : ""}</span>
        {readOnly ? null : (
          <ButtonGroup>
            <Button type="button" variant="outline" size="sm" onClick={() => void choose()}><ImagePlus />Replace</Button>
            {editArtDirection && asset?.kind === "image" ? <Button type="button" variant="outline" size="sm" onClick={() => void editArtDirection(id)} data-lead-art-direction=""><Crop />Crops & focal point</Button> : null}
            <Button type="button" variant="outline" size="sm" onClick={() => media.setValue(null)}><X />Remove</Button>
          </ButtonGroup>
        )}
      </div>
      <Textarea aria-label="Lead image caption" placeholder="Caption for this story (the credit comes from the photo)" rows={2} value={caption.value ?? ""} onChange={(event) => caption.setValue(event.target.value)} disabled={readOnly} className="min-h-0 resize-none text-sm" />
    </figure>
  );
}
