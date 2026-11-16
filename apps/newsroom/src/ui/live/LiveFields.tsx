"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Label } from "@byline/newsroom-ui/ui/label";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ImagePlus, X } from "lucide-react";
import { LIVE_TEXT_MAX } from "../../newsroom/live-text";
import { useBylineMediaPicker } from "../media/MediaWorkspaceShell";
import type { LiveDraft } from "./api";

/**
 * The optional headline, update text, optional photo and (for people who may publish) the key-update pin.
 * Not a <form>: the Story screen renders inside Payload's document form and forms cannot nest.
 */
export function LiveFields({ value, onChange, name, canPin, placeholder }: { value: LiveDraft; onChange: (next: LiveDraft) => void; name: string; canPin: boolean; placeholder?: string }) {
  const picker = useBylineMediaPicker();
  async function pickPhoto() {
    const [chosen] = await picker.pick("photo", { title: "Choose a photo for this update", buttonLabel: "Use photo", multiple: false });
    if (chosen) onChange({ ...value, photo: { id: Number(chosen.id), alt: chosen.title ?? "", previewUrl: chosen.previewUrl ?? null } });
  }
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${name}-title`}>Headline <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id={`${name}-title`} maxLength={200} value={value.title} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onChange={(event) => onChange({ ...value, title: event.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${name}-text`}>Live update</Label>
        <Textarea id={`${name}-text`} rows={4} required maxLength={LIVE_TEXT_MAX} value={value.text} placeholder={placeholder ?? "What's happening? Blank line for a new paragraph, “- ” for a list; links become links."} onChange={(event) => onChange({ ...value, text: event.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {value.photo ? (
          <div className="flex items-center gap-2 rounded-md border p-1 pr-2 text-sm">
            {value.photo.previewUrl ? <img src={value.photo.previewUrl} alt="" className="size-10 rounded object-cover" /> : null}
            <span className="max-w-40 truncate">{value.photo.alt || "Photo"}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove photo" onClick={() => onChange({ ...value, photo: null })}><X aria-hidden="true" /></Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => void pickPhoto()}><ImagePlus data-icon="inline-start" aria-hidden="true" />Add photo</Button>
        )}
        {canPin ? (
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={value.pinned} onCheckedChange={(checked) => onChange({ ...value, pinned: checked === true })} />
            Pin as the key update
          </Label>
        ) : null}
      </div>
    </div>
  );
}
