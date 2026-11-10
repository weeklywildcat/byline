"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@byline/newsroom-ui/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { formatPosition } from "../../domain/transcript";
import type { StoryScreenContext } from "../story/StoryScreen";
import { loadQuotes, type SelectionView } from "./api";

/**
 * The article editor's Reporting action: the Story's saved transcript quotes,
 * in a Sheet (never a permanent inspector). A verified quote can be played at
 * its source, copied, and inserted as the existing Reported Quote block with
 * its words and attribution filled in; an unverified one must be verified
 * against the audio first. Nothing but those words reaches the article: not
 * the transcript, the recording or the reporter's notes.
 */
export function ReportingSheet({ context, insert }: { context: StoryScreenContext; insert: (selection: SelectionView) => boolean }) {
  const storyId = Number(context.storyId);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["byline", "story-quotes", storyId], queryFn: () => loadQuotes(context.api, storyId), enabled: open && Number.isSafeInteger(storyId) && storyId > 0 });
  const quotes = query.data?.quotes ?? [];

  const play = (quote: SelectionView) => {
    if (!quote.audioUrl) return;
    const element = audio.current ?? (audio.current = new Audio());
    if (!element.src.endsWith(quote.audioUrl)) element.src = quote.audioUrl;
    element.currentTime = (quote.startMs ?? 0) / 1000;
    setPlaying(String(quote.id));
    element.onended = () => setPlaying(null);
    void element.play().catch(() => toast.error("Byline could not play that recording."));
  };
  const stop = () => { audio.current?.pause(); setPlaying(null); };

  return (
    <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) stop(); }}>
      <SheetTrigger render={<Button ref={trigger} type="button" variant="ghost" size="sm" className="text-muted-foreground" />}><BookOpenText data-icon="inline-start" />Quotes</SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md" finalFocus={trigger}>
        <SheetHeader>
          <SheetTitle>Reporting quotes</SheetTitle>
          <SheetDescription>Quotes saved from this story's interviews. Only the quote and who said it go into the article.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6" aria-live="polite">
          {query.isError ? <InlineAlert title="Quotes aren't available" onAction={() => void query.refetch()}>{(query.error as Error).message}</InlineAlert> : null}
          {query.isPending && open ? <p role="status" className="text-sm text-muted-foreground">Loading quotes…</p> : null}
          {query.data && quotes.length === 0 ? (
            <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>No saved quotes yet</EmptyTitle><EmptyDescription>Open a transcript in Reporting, select the words, and save a quote. Verify it against the audio, then insert it here.</EmptyDescription></EmptyHeader>
              {context.openReporting ? <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(false); context.openReporting?.(); }}>Open Reporting</Button> : null}
            </Empty>
          ) : null}
          <ul className="grid gap-4">
            {quotes.map((quote) => <li key={quote.id}><QuoteItem context={context} quote={quote} playing={playing === String(quote.id)} onPlay={() => play(quote)} onStop={stop} onInsert={() => { if (insert(quote)) { toast.success("Quote inserted."); setOpen(false); } else toast.error("The article can't take a quote right now. Is someone else editing it?"); }} onClose={() => setOpen(false)} /></li>)}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuoteItem({ context, quote, playing, onPlay, onStop, onInsert, onClose }: { context: StoryScreenContext; quote: SelectionView; playing: boolean; onPlay: () => void; onStop: () => void; onInsert: () => void; onClose: () => void }) {
  const verified = quote.state === "verified";
  const blocked = quote.use.action === "blocked";
  const copy = () => void navigator.clipboard.writeText(quote.attribution ? `“${quote.text}” — ${quote.attribution}` : `“${quote.text}”`).then(() => toast.success("Copied."), () => toast.error("Byline could not copy to the clipboard."));
  return (
    <div className="grid gap-1.5 border-l-2 border-border pl-3" data-saved-quote={quote.id} data-state={quote.state}>
      <p className="[overflow-wrap:anywhere]">“{quote.text}”</p>
      <p className="text-xs text-muted-foreground">{quote.attribution || "No attribution recorded"}{quote.startMs !== null ? ` · ${formatPosition(quote.startMs)}` : ""}</p>
      <p className="flex flex-wrap items-center gap-2"><StatusBadge tone={verified ? "done" : "neutral"}>{verified ? "Verified" : "Not verified"}</StatusBadge>
        {quote.use.action !== "insert" ? <span className="text-xs font-medium" data-quote-use={quote.use.action}>{quote.use.message}</span> : null}</p>
      <div className="flex flex-wrap gap-1.5">
        {quote.audioUrl ? <Button type="button" size="sm" variant="outline" onClick={playing ? onStop : onPlay}>{playing ? "Stop" : "Play source"}</Button> : null}
        <Button type="button" size="sm" variant="outline" onClick={copy}>Copy</Button>
        {blocked ? <Button type="button" size="sm" disabled>Off the record</Button>
          : verified ? <Button type="button" size="sm" disabled={context.readOnly} onClick={onInsert}>Insert quote</Button>
          : <Button type="button" size="sm" variant="secondary" disabled={!context.openReporting} onClick={() => { onClose(); context.openReporting?.(quote.transcriptId); }}>Verify before inserting</Button>}
      </div>
    </div>
  );
}
