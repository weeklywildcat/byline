"use client";

import { Input } from "@byline/newsroom-ui/ui/input";
import { Label } from "@byline/newsroom-ui/ui/label";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { LIVE_TEXT_MAX } from "../../newsroom/live-text";
import type { LiveDraft } from "./api";

/**
 * The optional headline and the update text: everything a live update says. Write adds a photo and the pin
 * (LiveFields); Field edits with just these, so its bundle never loads the Media picker.
 */
export function LiveTextFields({ value, onChange, name, placeholder, tap }: { value: LiveDraft; onChange: (next: LiveDraft) => void; name: string; placeholder?: string; tap?: boolean }) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={`${name}-title`}>Headline <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id={`${name}-title`} maxLength={200} value={value.title} className={tap ? "h-11 text-base" : undefined} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onChange={(event) => onChange({ ...value, title: event.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${name}-text`}>Live update</Label>
        <Textarea id={`${name}-text`} rows={4} required maxLength={LIVE_TEXT_MAX} value={value.text} className={tap ? "text-base" : undefined} placeholder={placeholder ?? "What's happening? Blank line for a new paragraph, “- ” for a list; links become links."} onChange={(event) => onChange({ ...value, text: event.target.value })} />
      </div>
    </>
  );
}
