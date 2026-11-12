"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { useDebouncedValue } from "@byline/newsroom-ui/lib/hooks";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { groundRuleLabel, sortMaterial, type ReportingFileMaterial, type ReportingNoteMaterial } from "../../domain/reporting";
import { formatPosition } from "../../domain/transcript";
import { formatDay } from "../story/parts";
import type { StoryScreenContext } from "../story/StoryScreen";
import { loadQuotes, loadReporting, reportingKey, type SelectionView } from "./api";

/**
 * Reporting reference (docs/story-screen.md#reference): the Story's reporting
 * read beside the article while writing. Saved quotes, notes, transcripts and
 * sources, searchable, never shown unless the writer asks for them.
 *
 * Nothing reaches the article on its own. A verified quote can be inserted as
 * the existing Reported Quote block (its words, its attribution and its link
 * to the transcript selection); an unverified one must be verified against
 * the recording first. Notes can be copied. A transcript opens in full, in
 * its own focused view, never pasted.
 *
 * Two presentations of one content: a nonmodal pane beside the article when
 * the Story has room for both, a Sheet with a clear way back otherwise.
 */
export type QuoteInserter = (quote: SelectionView) => boolean;

type Props = { context: StoryScreenContext; insert: RefObject<QuoteInserter | null> };

export function ReportingReferencePane({ context, insert, onClose }: Props & { onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  // Opening the pane moves focus to it, so a keyboard reader lands where it appeared.
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <aside aria-labelledby="reporting-reference-title" className="flex max-h-[calc(100dvh-7rem)] min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain border-l border-border pl-6" data-reporting-reference="pane">
      <div className="flex items-center justify-between gap-2">
        <h2 ref={heading} tabIndex={-1} id="reporting-reference-title" className="text-sm font-medium outline-none">Reporting reference</h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close reporting reference" onClick={onClose}><X aria-hidden="true" /></Button>
      </div>
      <ReferenceContent context={context} insert={insert} onLeave={onClose} />
    </aside>
  );
}

export function ReportingReferenceSheet({ context, insert, open, onOpenChange, finalFocus }: Props & { open: boolean; onOpenChange: (open: boolean) => void; finalFocus: RefObject<HTMLElement | null> }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" finalFocus={finalFocus} className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md" data-reporting-reference="sheet">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>Reporting reference</SheetTitle>
          <SheetDescription>This story's quotes, notes, transcripts and sources. Your article is kept as it is.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 p-4">
          <ReferenceContent context={context} insert={insert} onLeave={() => onOpenChange(false)} />
        </div>
        <SheetFooter className="border-t border-border">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back to article</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Group({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}{count ? <span className="ml-1.5 font-normal tabular-nums">{count}</span> : null}</h3>
      {children}
    </section>
  );
}

const matches = (needle: string, ...values: Array<string | null | undefined>) => !needle || values.some((value) => value?.toLowerCase().includes(needle));

function ReferenceContent({ context, insert, onLeave }: Props & { onLeave: () => void }) {
  const storyId = Number(context.storyId);
  const [search, setSearch] = useState("");
  const needle = useDebouncedValue(search, 150).trim().toLowerCase();
  const quotesQuery = useQuery({ queryKey: ["byline", "story-quotes", storyId], queryFn: () => loadQuotes(context.api, storyId), enabled: Number.isSafeInteger(storyId) && storyId > 0 });
  // The same cache entry as Plan's Reporting, so both show the same notebook.
  const reporting = useQuery({ queryKey: reportingKey(storyId), queryFn: () => loadReporting(context.api, storyId), enabled: Number.isSafeInteger(storyId) && storyId > 0 });
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  const quotes = (quotesQuery.data?.quotes ?? []).filter((quote) => matches(needle, quote.text, quote.attribution, quote.speaker));
  // Verified quotes first: they are the ones that can go into the article.
  quotes.sort((a, b) => Number(b.state === "verified") - Number(a.state === "verified"));
  const materials = sortMaterial(reporting.data?.materials ?? []);
  const notes = materials.filter((item): item is ReportingNoteMaterial => item.kind === "note").filter((note) => matches(needle, note.text, note.source?.label, note.appointment?.title, note.author?.name));
  const recordings = materials.filter((item): item is ReportingFileMaterial => item.kind === "file" && (item.fileKind === "audio" || item.transcript !== null)).filter((file) => matches(needle, file.filename, file.source?.label, file.appointment?.title));
  const sources = (reporting.data?.sources ?? []).filter((source) => matches(needle, source.label, source.role, source.organization));

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
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast.success("Copied."), () => toast.error("Byline could not copy to the clipboard."));
  const openTranscript = (id: number) => { stop(); onLeave(); context.openReporting?.(id); };
  const loading = quotesQuery.isPending || reporting.isPending;
  const nothing = !loading && !quotes.length && !notes.length && !recordings.length && !sources.length;

  return (
    <div className="flex flex-col gap-5" aria-live="polite" data-reporting-reference-content="">
      <InputGroup>
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput type="search" value={search} placeholder="Search reporting…" aria-label="Search this story's reporting" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
      </InputGroup>
      {quotesQuery.isError ? <InlineAlert title="Quotes aren't available" onAction={() => void quotesQuery.refetch()}>{(quotesQuery.error as Error).message}</InlineAlert> : null}
      {reporting.isError ? <InlineAlert title="Reporting isn't available" onAction={() => void reporting.refetch()}>{(reporting.error as Error).message}</InlineAlert> : null}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading reporting…</p> : null}
      {nothing ? (
        <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
          <p>{needle ? "Nothing in this story's reporting matches." : "No reporting yet. Notes, recordings and quotes saved in Plan appear here."}</p>
          {!needle && context.openReporting ? <Button type="button" size="sm" variant="outline" onClick={() => { onLeave(); context.openReporting?.(); }}>Open Reporting in Plan</Button> : null}
        </div>
      ) : null}

      {quotes.length ? (
        <Group id="reference-quotes" title="Saved quotes" count={quotes.length}>
          <ul className="grid gap-4">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <QuoteItem context={context} quote={quote} playing={playing === String(quote.id)} onPlay={() => play(quote)} onStop={stop} onCopy={() => copy(quote.attribution ? `“${quote.text}” — ${quote.attribution}` : `“${quote.text}”`)}
                  onInsert={() => {
                    if (insert.current?.(quote)) toast.success("Quote inserted.");
                    else toast.error("The article can't take a quote right now. Is someone else editing it?");
                  }}
                  onVerify={() => openTranscript(quote.transcriptId)} />
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {notes.length ? (
        <Group id="reference-notes" title="Notes" count={notes.length}>
          <ul className="grid gap-3">
            {notes.map((note) => (
              <li key={note.key} className="grid gap-1 border-l-2 border-border pl-3" data-reference-note={note.id}>
                <p className="text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{note.text}</p>
                <p className="text-xs text-muted-foreground">{[note.source?.label, note.appointment?.title, note.author?.name, formatDay(note.occurredAt, context.timeZone)].filter(Boolean).join(" · ")}{note.confidential ? " · Confidential" : ""}</p>
                <Button type="button" size="xs" variant="ghost" className="-ml-2 w-fit text-muted-foreground" onClick={() => copy(note.text)}>Copy note</Button>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {recordings.length ? (
        <Group id="reference-transcripts" title="Recordings and transcripts" count={recordings.length}>
          <ul className="grid gap-2">
            {recordings.map((file) => (
              <li key={file.key} className="flex flex-wrap items-center justify-between gap-2" data-reference-recording={file.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm">{file.source?.label || file.appointment?.title || file.filename}</p>
                  <p className="text-xs text-muted-foreground">{transcriptLine(file)}</p>
                </div>
                {file.transcript?.state === "ready" ? <Button type="button" size="sm" variant="outline" onClick={() => openTranscript(file.transcript!.id)}>Open transcript</Button> : null}
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {sources.length ? (
        <Group id="reference-sources" title="Sources" count={sources.length}>
          <ul className="grid gap-1.5">
            {sources.map((source) => (
              <li key={source.id} className="text-sm">
                <span className="font-medium">{source.label}</span>
                <span className="text-muted-foreground">{[source.role, source.organization].filter(Boolean).length ? `, ${[source.role, source.organization].filter(Boolean).join(", ")}` : ""}</span>
                <span className={source.groundRules === "off-record" ? "block text-xs font-medium text-destructive" : "block text-xs text-muted-foreground"}>{groundRuleLabel(source.groundRules)}</span>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}
    </div>
  );
}

function transcriptLine(file: ReportingFileMaterial): string {
  const transcript = file.transcript;
  if (!transcript) return "Recording · no transcript";
  if (transcript.state !== "ready") return "Recording · incomplete legacy transcript";
  const quotes = transcript.quoteCount ? ` · ${transcript.quoteCount} ${transcript.quoteCount === 1 ? "quote" : "quotes"} (${transcript.verifiedCount} verified)` : "";
  const label = transcript.origin === "manual" ? "Uploaded transcript" : "Legacy machine transcript";
  return `${label}${transcript.durationMs ? ` · ${formatPosition(transcript.durationMs)}` : ""}${quotes}`;
}

function QuoteItem({ context, quote, playing, onPlay, onStop, onCopy, onInsert, onVerify }: { context: StoryScreenContext; quote: SelectionView; playing: boolean; onPlay: () => void; onStop: () => void; onCopy: () => void; onInsert: () => void; onVerify: () => void }) {
  const verified = quote.state === "verified";
  const blocked = quote.use.action === "blocked";
  return (
    <div className="grid gap-1.5 border-l-2 border-border pl-3" data-saved-quote={quote.id} data-state={quote.state}>
      <p className="[overflow-wrap:anywhere]">“{quote.text}”</p>
      <p className="text-xs text-muted-foreground">{quote.attribution || "No attribution recorded"}{quote.startMs !== null ? ` · ${formatPosition(quote.startMs)}` : ""}</p>
      <p className="flex flex-wrap items-center gap-2"><StatusBadge tone={verified ? "done" : "neutral"}>{verified ? "Verified" : "Not verified"}</StatusBadge>
        {quote.use.action !== "insert" ? <span className="text-xs font-medium" data-quote-use={quote.use.action}>{quote.use.message}</span> : null}</p>
      <div className="flex flex-wrap gap-1.5">
        {quote.audioUrl ? <Button type="button" size="sm" variant="outline" onClick={playing ? onStop : onPlay}>{playing ? "Stop" : "Play source"}</Button> : null}
        <Button type="button" size="sm" variant="outline" onClick={onCopy}>Copy</Button>
        {blocked ? <Button type="button" size="sm" disabled>Off the record</Button>
          : verified ? <Button type="button" size="sm" disabled={context.readOnly} onClick={onInsert}>Insert quote</Button>
          : <Button type="button" size="sm" variant="secondary" disabled={!context.openReporting} onClick={onVerify}>Verify before inserting</Button>}
      </div>
    </div>
  );
}

/**
 * Plan's saved quotes: every quote taken from this Story's transcripts, with
 * whether it has been checked against the recording. Opening one opens its
 * transcript; quotes are inserted from Write's Reporting reference, never
 * from here.
 */
export function SavedQuotes({ context }: { context: StoryScreenContext }) {
  const storyId = Number(context.storyId);
  const query = useQuery({ queryKey: ["byline", "story-quotes", storyId], queryFn: () => loadQuotes(context.api, storyId), enabled: Number.isSafeInteger(storyId) && storyId > 0 });
  const quotes = query.data?.quotes ?? [];
  if (!quotes.length) return null;
  const verified = quotes.filter((quote) => quote.state === "verified").length;
  return (
    <section aria-labelledby="plan-quotes" className="flex flex-col gap-2" data-plan-quotes="">
      <h3 id="plan-quotes" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Saved quotes <span className="ml-1 font-normal normal-case tabular-nums">{verified} of {quotes.length} verified</span></h3>
      <ul className="grid gap-3 @min-[600px]/plan-card:grid-cols-2 @min-[600px]/plan-card:gap-x-8">
        {quotes.map((quote) => (
          <li key={quote.id} className="grid gap-1 border-l-2 border-border pl-3" data-saved-quote={quote.id} data-state={quote.state}>
            <p className="text-sm [overflow-wrap:anywhere]">“{quote.text}”</p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{quote.attribution || "No attribution recorded"}</span>
              <StatusBadge tone={quote.state === "verified" ? "done" : "neutral"}>{quote.state === "verified" ? "Verified" : "Not verified"}</StatusBadge>
              {quote.use.action === "blocked" ? <span className="font-medium text-destructive">Off the record</span> : null}
            </p>
            <Button type="button" size="xs" variant="ghost" className="-ml-2 w-fit text-muted-foreground" onClick={() => context.openReporting?.(quote.transcriptId)}>Open transcript</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
