"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useInlineBlockComponentContext } from "@payloadcms/richtext-lexical/client";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SettingsSurface } from "./chrome";
import { consumeCreated } from "./focus";
import { useAnnounce } from "./host";
import { useFootnote } from "./lexical";

/**
 * A footnote reference in running text, drawn as a superscript number. The
 * number is derived from document order (never typed or stored); clicking the
 * reference, or inserting a new one, opens a compact Popover (a bottom Sheet on
 * touch) for the note. Removing the reference removes the note. Payload's
 * inline block provides the reference's node key through its context.
 */
export function BylineFootnote() {
  // Payload renders this server-side-registered component inside the node's own provider, which knows the node.
  const { nodeKey } = useInlineBlockComponentContext() as unknown as { nodeKey: string };
  const { text, number, editable, write, remove } = useFootnote(nodeKey);
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  // A new reference opens its note straight away: the writer is mid-sentence.
  useEffect(() => {
    if (consumeCreated(nodeKey)) setOpen(true);
  }, [nodeKey]);
  useEffect(() => {
    if (open) window.requestAnimationFrame(() => field.current?.focus());
  }, [open]);

  const close = (next: boolean) => {
    setOpen(next);
    // A reference with no note says nothing: closing it empty removes it (Undo brings it back).
    if (!next && editable && !text.trim()) remove();
  };

  return (
    <SettingsSurface
      open={open}
      onOpenChange={close}
      title={`Footnote ${number}`}
      description="Shown at the end of the story. The number follows the order in the text."
      trigger={
        <button type="button" className="byline-footnote-ref byline-footnote-edit" data-empty={!text.trim() || undefined} data-byline-chrome="" aria-label={`Footnote ${number}${text ? `: ${text}` : ""}. Edit the note.`}>
          <sup>{number || "·"}</sup>
        </button>
      }
    >
      <Textarea ref={field} aria-label="Footnote text" rows={4} maxLength={LIMITS.footnote} value={text} readOnly={!editable} placeholder="The note readers see at the end of the story." onChange={(event) => write(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Escape") return;
        event.stopPropagation();
      }} />
      <div className="flex justify-between gap-2">
        <Button type="button" size="sm" onClick={() => close(false)}>Done</Button>
        {editable ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => {
            remove();
            setOpen(false);
            announce("Footnote removed.");
          }}>
            <Trash2 />
            Remove footnote
          </Button>
        ) : null}
      </div>
    </SettingsSurface>
  );
}
