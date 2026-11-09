"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Radio, Send } from "lucide-react";

/**
 * The reporter's explicit intent, in words that describe the consequence. A direct publisher chooses
 * `[ Publish now ] [ Send to desk ]`; everyone else has only `[ Send to live desk ]`: never a disabled Publish
 * button. Used by Write's composer and Field's composer, so the choice reads the same everywhere. It never
 * confirms a single update with a modal.
 */
export function LiveDeliveryButtons({ canPublishNow, disabled, tap, onDeliver, helperId }: {
  canPublishNow: boolean;
  disabled: boolean;
  /** Field: at least 44px high, larger text. */
  tap?: boolean;
  onDeliver: (delivery: "publish" | "desk") => void;
  helperId?: string;
}) {
  const size = tap ? "min-h-11 px-4 text-base" : "";
  return (
    <div className="grid gap-1.5">
      {canPublishNow ? (
        <ButtonGroup className="w-full" aria-label="Deliver this live update">
          <Button type="button" className={`${size} flex-1`} disabled={disabled} aria-describedby={helperId} onClick={() => onDeliver("publish")}><Radio data-icon="inline-start" aria-hidden="true" />Publish now</Button>
          <Button type="button" variant="outline" className={`${size} flex-1`} disabled={disabled} aria-describedby={helperId} onClick={() => onDeliver("desk")}>Send to desk</Button>
        </ButtonGroup>
      ) : (
        <Button type="button" variant="outline" className={`${size} w-full`} disabled={disabled} aria-describedby={helperId} onClick={() => onDeliver("desk")}><Send data-icon="inline-start" aria-hidden="true" />Send to live desk</Button>
      )}
      <p id={helperId} className="text-xs text-muted-foreground" data-live-helper="">
        {canPublishNow
          ? "Publish now appears immediately to readers. Send to desk creates a draft for an editor."
          : "An editor will review this before readers see it."}
      </p>
    </div>
  );
}
