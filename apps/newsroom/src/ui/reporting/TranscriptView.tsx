"use client";

import { InlineForm } from "@byline/newsroom-ui/components/inline-form";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Progress } from "@byline/newsroom-ui/ui/progress";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@byline/newsroom-ui/ui/resizable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, PanelRight, Pencil, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { groundRuleLabel, quoteUse } from "../../domain/reporting";
import { activeSegmentAt, formatPosition, searchTranscript, type TranscriptSegment } from "../../domain/transcript";
import {
  editSelection,
  editTranscript,
  loadTranscript,
  overrideOffRecord,
  removeSelection,
  reportingKey,
  saveSelection,
  startTranscription,
  transcriptKey,
  verifySelection,
  type SelectionView,
  type TranscriptDetail
} from "./api";
import type { StoryScreenContext } from "../story/StoryScreen";

/** Width of the transcript's own container above which the context panel sits beside it. Measured: a readable measure needs ~520px, the panel ~300px. */
const SIDE_BY_SIDE = 880;

type Draft = { ids: string[]; text: string };

function readSelection(root: HTMLElement | null): Draft | null {
  const selection = window.getSelection();
  if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  if (!root.contains(selection.getRangeAt(0).commonAncestorContainer)) return null;
  const ids: string[] = [];
  root.querySelectorAll<HTMLElement>("[data-segment-text]").forEach((element) => {
    if (selection.containsNode(element, true)) ids.push(element.dataset.segmentText!);
  });
  // Timestamps and speaker names are select-none, so the selection's text is the words only.
  const text = selection.toString().replace(/\s+/g, " ").trim();
  return ids.length && text ? { ids, text } : null;
}

/** Splits a segment's words around search matches so they can be marked. */
function marked(text: string, ranges: Array<[number, number]>, current: [number, number] | null): ReactNode {
  if (!ranges.length) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], index) => {
    if (start < at) return;
    if (start > at) parts.push(text.slice(at, start));
    const isCurrent = current !== null && current[0] === start && current[1] === end;
    parts.push(<mark key={index} data-current={isCurrent ? "" : undefined} className={isCurrent ? "rounded-sm bg-primary text-primary-foreground" : "rounded-sm bg-primary/15 text-foreground"}>{text.slice(start, end)}</mark>);
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/**
 * The transcript of one recording (docs/reporting.md#transcript-screen): the
 * audio stays visible while reviewing, timestamps seek, the active passage
 * follows playback, words and speakers edit in place without moving timing,
 * and a selection becomes a highlight or a quote snapshot. The Source and its
 * ground rules travel beside it (a panel on wide screens, a Sheet on narrow).
 */
/** `hideBack` when the host already shows the way back (the Story's focused Transcript view). */
export function TranscriptView(props: { context: StoryScreenContext; transcriptId: number; onBack: () => void; hideBack?: boolean }) {
  // The measured element exists from the first render (useElementWidth measures on mount), loading or not.
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  return <div ref={frameRef} className="min-w-0" data-transcript-frame=""><TranscriptBody {...props} width={width} /></div>;
}

function TranscriptBody({ context, transcriptId, onBack, width, hideBack = false }: { context: StoryScreenContext; transcriptId: number; onBack: () => void; width: number; hideBack?: boolean }) {
  const cache = useQueryClient();
  const storyId = Number(context.storyId);
  const detailQuery = useQuery({
    queryKey: transcriptKey(transcriptId),
    queryFn: () => loadTranscript(context.api, transcriptId),
    // Only a transcript still being made is polled.
    refetchInterval: (query) => (query.state.data && (query.state.data.state === "queued" || query.state.data.state === "processing") ? 5000 : false)
  });
  const detail = detailQuery.data;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(0);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const refresh = useCallback(() => Promise.all([cache.invalidateQueries({ queryKey: transcriptKey(transcriptId) }), cache.invalidateQueries({ queryKey: reportingKey(storyId) }), cache.invalidateQueries({ queryKey: ["byline", "story-quotes", storyId] })]), [cache, transcriptId, storyId]);
  const canEdit = detail?.canEdit === true && !context.readOnly;
  const wide = width >= SIDE_BY_SIDE;

  const segments = detail?.segments ?? [];
  const matches = useMemo(() => searchTranscript(segments, query), [segments, query]);
  const current = matches.length ? matches[Math.min(matchIndex, matches.length - 1)] : null;
  const active = detail?.state === "ready" ? activeSegmentAt(segments, position) : null;

  const seek = useCallback((ms: number | null) => {
    const audio = audioRef.current;
    if (!audio || ms === null) return;
    audio.currentTime = ms / 1000;
    void audio.play().catch(() => undefined);
  }, []);

  // A new search starts at its first result; stepping scrolls and seeks to it.
  useEffect(() => setMatchIndex(0), [query]);
  const step = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    const hit = matches[next];
    const segment = segments.find((entry) => entry.id === hit.segmentId);
    streamRef.current?.querySelector(`[data-segment="${hit.segmentId}"]`)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (segment) seek(segment.startMs);
  };

  const save = useMutation({
    mutationFn: (kind: "highlight" | "quote") => saveSelection(context.api, transcriptId, { segmentIds: draft?.ids, text: draft?.text, kind }),
    onSuccess: async (_saved, kind) => {
      toast.success(kind === "quote" ? "Quote saved. Verify it against the audio before using it." : "Highlight saved.");
      window.getSelection()?.removeAllRanges();
      setDraft(null);
      await refresh();
      if (!wide) setContextOpen(true);
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const retry = useMutation({
    mutationFn: () => startTranscription(context.api, detail!.file.id),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message)
  });

  if (detailQuery.isError) return <div className="grid gap-3">{hideBack ? null : <BackButton onBack={onBack} />}<InlineAlert title="This transcript isn't available" onAction={() => void detailQuery.refetch()}>{(detailQuery.error as Error).message}</InlineAlert></div>;
  if (!detail) return <div className="grid gap-3">{hideBack ? null : <BackButton onBack={onBack} />}<p role="status" className="text-sm text-muted-foreground">Loading transcript…</p></div>;

  const contextPanel = <TranscriptContext context={context} detail={detail} seek={seek} refresh={refresh} />;
  const stream = (
    <div className="flex min-h-0 flex-1 flex-col">
      <TranscriptState detail={detail} onRetry={() => retry.mutate()} retrying={retry.isPending} canRetry={detail.transcription.available && detail.file.kind === "audio" && canEdit} />
      {detail.state === "ready" ? (
        <div
          ref={streamRef}
          className="flex-1 px-1 pb-24"
          onMouseUp={() => setDraft(readSelection(streamRef.current))}
          onKeyUp={() => setDraft(readSelection(streamRef.current))}
        >
          {segments.map((segment) => (
            <Segment
              key={segment.id}
              segment={segment}
              speakers={detail.speakers}
              sourceName={detail.source?.label ?? null}
              isActive={active === segment.id}
              ranges={matches.filter((match) => match.segmentId === segment.id && match.start >= 0).map((match) => [match.start, match.end] as [number, number])}
              currentRange={current && current.segmentId === segment.id && current.start >= 0 ? [current.start, current.end] : null}
              editing={editing === segment.id}
              canEdit={canEdit}
              onSeek={() => seek(segment.startMs)}
              onEdit={() => setEditing(segment.id)}
              onDone={() => setEditing(null)}
              transcriptId={transcriptId}
              api={context.api}
              updatedAt={detail.updatedAt}
              refresh={refresh}
            />
          ))}
        </div>
      ) : null}
      {draft ? (
        // A bar in the layout, docked under the transcript: it never covers the words being selected.
        <div role="toolbar" aria-label="Selected words" className="sticky bottom-[var(--byline-bottom-navigation-height,0px)] z-10 mt-2 flex flex-wrap items-center gap-2 border-t bg-background py-2">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">“{draft.text}”</p>
          <div className="flex shrink-0 flex-wrap gap-2">
            {/* Buttons must not take focus from the selection before it is read. */}
            <Button type="button" size="sm" variant="outline" disabled={!canEdit || save.isPending} onMouseDown={(event) => event.preventDefault()} onClick={() => save.mutate("highlight")}>Save highlight</Button>
            <Button type="button" size="sm" disabled={!canEdit || save.isPending} onMouseDown={(event) => event.preventDefault()} onClick={() => save.mutate("quote")}>Save quote</Button>
            <Button type="button" size="sm" variant="outline" onMouseDown={(event) => event.preventDefault()} onClick={() => void navigator.clipboard.writeText(draft.text).then(() => toast.success("Copied."), () => toast.error("Byline could not copy to the clipboard."))}>Copy</Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3" data-transcript-view="">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {hideBack ? null : <BackButton onBack={onBack} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">{detail.file.filename}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-medium tracking-wide uppercase" data-provenance={detail.origin}>{detail.origin === "manual" ? "Manual transcript" : "Machine transcript"}</span>
            {detail.origin === "machine" && detail.model ? <span>{detail.model}</span> : null}
            {detail.language ? <span>{detail.language.toUpperCase()}</span> : null}
            {detail.durationMs ? <span>{formatPosition(detail.durationMs)}</span> : null}
            {detail.editedAt ? <span>Edited</span> : null}
          </p>
        </div>
        {!wide ? <Button type="button" size="sm" variant="outline" onClick={() => setContextOpen(true)}><PanelRight data-icon="inline-start" />Source & quotes{detail.selections.length ? ` (${detail.selections.length})` : ""}</Button> : null}
      </div>
      <GroundRulesBanner detail={detail} />
      {wide ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-[28rem] rounded-lg border">
          <ResizablePanel id="transcript" minSize={420} className="flex flex-col overflow-y-auto">
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-2">
              <Player detail={detail} audioRef={audioRef} onTime={setPosition} />
              <SearchBar query={query} onQuery={setQuery} count={matches.length} index={current ? Math.min(matchIndex, matches.length - 1) : -1} onStep={step} />
              {stream}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize source and quotes" />
          <ResizablePanel id="context" defaultSize="32" minSize={280} maxSize="46" className="overflow-y-auto bg-muted/30">{contextPanel}</ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex min-h-0 flex-col">
          <Player detail={detail} audioRef={audioRef} onTime={setPosition} />
          <SearchBar query={query} onQuery={setQuery} count={matches.length} index={current ? Math.min(matchIndex, matches.length - 1) : -1} onStep={step} />
          {stream}
        </div>
      )}
      <Sheet open={contextOpen && !wide} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader><SheetTitle>Source & quotes</SheetTitle><SheetDescription>Who is speaking, the ground rules, and the quotes saved from this recording.</SheetDescription></SheetHeader>
          <div className="px-4 pb-6">{contextPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft data-icon="inline-start" />Reporting</Button>;
}

/** Audio stays pinned above the transcript while reviewing. */
function Player({ detail, audioRef, onTime }: { detail: TranscriptDetail; audioRef: React.RefObject<HTMLAudioElement | null>; onTime: (ms: number) => void }) {
  if (!detail.file.url) return <p className="py-2 text-sm text-muted-foreground">No recording is attached to this transcript, so there is nothing to play. Timestamps still show where each passage was said.</p>;
  return (
    <div className="sticky top-0 z-10 -mx-1 bg-background px-1 py-2">
      <audio ref={audioRef} controls preload="metadata" src={detail.file.url} aria-label={`Recording: ${detail.file.filename}`} className="h-10 w-full" onTimeUpdate={(event) => onTime(event.currentTarget.currentTime * 1000)} />
    </div>
  );
}

function SearchBar({ query, onQuery, count, index, onStep }: { query: string; onQuery: (value: string) => void; count: number; index: number; onStep: (direction: 1 | -1) => void }) {
  return (
    <div className="py-1" role="search" aria-label="Search this transcript">
      <InputGroup>
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput
          type="search"
          value={query}
          placeholder="Search words or speakers"
          aria-label="Search this transcript"
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); onStep(event.shiftKey ? -1 : 1); }
            if (event.key === "Escape") onQuery("");
          }}
        />
        {query.trim().length >= 2 ? (
          <InputGroupAddon align="inline-end">
            <span role="status" className="text-xs tabular-nums text-muted-foreground">{count ? `${index + 1} of ${count}` : "No results"}</span>
            <InputGroupButton type="button" size="icon-xs" aria-label="Previous result" disabled={!count} onClick={() => onStep(-1)}><ChevronUp /></InputGroupButton>
            <InputGroupButton type="button" size="icon-xs" aria-label="Next result" disabled={!count} onClick={() => onStep(1)}><ChevronDown /></InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </div>
  );
}

function TranscriptState({ detail, onRetry, retrying, canRetry }: { detail: TranscriptDetail; onRetry: () => void; retrying: boolean; canRetry: boolean }) {
  if (detail.state === "queued" || detail.state === "processing") {
    const percent = detail.progressPercent === null ? null : Math.round(detail.progressPercent);
    const label = detail.progressMessage ?? (detail.state === "queued" ? "Waiting to transcribe" : "Transcribing audio");
    return (
      <div className="grid gap-2 py-4" role="status" aria-live="polite">
        <Progress value={percent} aria-label={percent === null ? label : `${label}, ${percent}% complete`}>
          <span className="text-sm">{label}{percent === null ? "…" : ` · ${percent}%`}</span>
        </Progress>
        <p className="text-xs text-muted-foreground">
          A long interview can take a while. You can leave this page; Byline keeps the job running and will tell you when it is ready.
          {detail.failure ? ` Last attempt: ${detail.failure} Byline will retry automatically.` : ""}
        </p>
      </div>
    );
  }
  if (detail.state === "failed") {
    return <div className="py-3"><InlineAlert title="This recording could not be transcribed" onAction={canRetry ? onRetry : undefined} actionLabel={retrying ? "Retrying…" : "Try again"}>{detail.failure ?? "Transcription failed."} You can import a .txt, .srt or .vtt transcript instead.</InlineAlert></div>;
  }
  return null;
}

/** Ground rules are conspicuous before any public-use action; anything but "on the record" is flagged. */
function GroundRulesBanner({ detail }: { detail: TranscriptDetail }) {
  const rule = detail.groundRules.rule;
  if (rule === "on-record") return null;
  const use = quoteUse(rule);
  return (
    <Alert variant={rule === "off-record" ? "destructive" : "default"} data-ground-rules={rule}>
      <AlertTitle className="uppercase tracking-wide">{groundRuleLabel(rule)}</AlertTitle>
      <AlertDescription>{use.message}{detail.groundRules.note ? ` “${detail.groundRules.note}”` : ""}</AlertDescription>
    </Alert>
  );
}

type SegmentProps = {
  segment: TranscriptSegment; speakers: string[]; sourceName: string | null; isActive: boolean; ranges: Array<[number, number]>; currentRange: [number, number] | null;
  editing: boolean; canEdit: boolean; onSeek: () => void; onEdit: () => void; onDone: () => void; transcriptId: number; api: string; updatedAt: string; refresh: () => Promise<unknown>;
};

function Segment({ segment, speakers, sourceName, isActive, ranges, currentRange, editing, canEdit, onSeek, onEdit, onDone, transcriptId, api, updatedAt, refresh }: SegmentProps) {
  const [text, setText] = useState(segment.text);
  useEffect(() => setText(segment.text), [segment.text, editing]);
  const save = useMutation({
    mutationFn: () => editTranscript(api, transcriptId, { segmentId: segment.id, text, expectedUpdatedAt: updatedAt }),
    onSuccess: async () => { onDone(); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  return (
    <div data-segment={segment.id} data-active={isActive ? "" : undefined} className={`group grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 rounded-md px-2 py-2 ${isActive ? "bg-accent/60" : ""}`}>
      <button type="button" onClick={onSeek} disabled={segment.startMs === null} aria-label={segment.startMs === null ? "No timestamp" : `Play from ${formatPosition(segment.startMs)}`} className="h-fit min-h-8 select-none text-left text-xs tabular-nums text-muted-foreground underline-offset-2 hover:underline focus-visible:underline disabled:no-underline">
        {formatPosition(segment.startMs)}
      </button>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {segment.speaker || canEdit ? <SpeakerEditor segment={segment} speakers={speakers} sourceName={sourceName} canEdit={canEdit} transcriptId={transcriptId} api={api} updatedAt={updatedAt} refresh={refresh} /> : null}
          {canEdit && !editing ? <Button type="button" variant="ghost" size="xs" onClick={onEdit} aria-label="Edit this passage" className="select-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"><Pencil data-icon="inline-start" />Edit</Button> : null}
        </div>
        {editing ? (
          <div className="grid gap-2">
            <Textarea value={text} rows={3} aria-label="Passage text" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onDone(); if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save.mutate(); } }} autoFocus />
            <div className="flex gap-2"><Button type="button" size="sm" disabled={save.isPending || !text.trim()} onClick={() => save.mutate()}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
          </div>
        ) : (
          <p data-segment-text={segment.id} className="text-[0.95rem] leading-relaxed [overflow-wrap:anywhere]">{marked(segment.text, ranges, currentRange)}</p>
        )}
      </div>
    </div>
  );
}

/** A speaker is edited where it is shown: this passage, or everywhere. */
function SpeakerEditor({ segment, speakers, sourceName, canEdit, transcriptId, api, updatedAt, refresh }: { segment: TranscriptSegment; speakers: string[]; sourceName: string | null; canEdit: boolean; transcriptId: number; api: string; updatedAt: string; refresh: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(segment.speaker ?? "");
  useEffect(() => { if (open) setName(segment.speaker ?? ""); }, [open, segment.speaker]);
  const suggestions = [...new Set([...speakers, ...(sourceName ? [sourceName] : [])])].filter((entry) => entry !== name && entry !== segment.speaker);
  const apply = useMutation({
    mutationFn: (everywhere: boolean) => everywhere && segment.speaker
      ? editTranscript(api, transcriptId, { renameSpeaker: { from: segment.speaker, to: name }, expectedUpdatedAt: updatedAt })
      : editTranscript(api, transcriptId, { segmentId: segment.id, speaker: name, expectedUpdatedAt: updatedAt }),
    onSuccess: async () => { setOpen(false); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  const label = segment.speaker || "Add speaker";
  if (!canEdit) return <span className="select-none text-sm font-medium">{label}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" className={`select-none rounded-sm text-sm font-medium underline-offset-2 hover:underline focus-visible:underline ${segment.speaker ? "" : "text-muted-foreground"}`} aria-label={segment.speaker ? `Speaker: ${segment.speaker}. Change` : "Add speaker"} />}>{label}</PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); apply.mutate(false); }}>
          <label className="text-sm font-medium" htmlFor={`speaker-${segment.id}`}>Who is speaking?</label>
          <Input id={`speaker-${segment.id}`} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} onFocus={(event) => event.currentTarget.select()} autoFocus />
          {suggestions.length ? <div className="flex flex-wrap gap-1.5">{suggestions.slice(0, 6).map((entry) => <Button key={entry} type="button" size="xs" variant="outline" onClick={() => setName(entry)}>{entry}</Button>)}</div> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={apply.isPending}>This passage</Button>
            {segment.speaker ? <Button type="button" size="sm" variant="outline" disabled={apply.isPending || !name.trim()} onClick={() => apply.mutate(true)}>Everywhere</Button> : null}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** The Source, the ground rules in force when this was recorded, and the quotes saved from it. */
function TranscriptContext({ context, detail, seek, refresh }: { context: StoryScreenContext; detail: TranscriptDetail; seek: (ms: number | null) => void; refresh: () => Promise<unknown> }) {
  const rules = detail.groundRules;
  return (
    <div className="grid gap-5 p-4 text-sm" data-transcript-context="">
      <section aria-label="Source" className="grid gap-1.5">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Source</h3>
        {detail.source ? <p className="font-medium">{detail.source.label}{detail.source.role ? <span className="font-normal text-muted-foreground">, {detail.source.role}</span> : null}</p> : <p className="text-muted-foreground">No source on this recording.</p>}
        {detail.appointment ? <p className="text-muted-foreground">{detail.appointment.title}</p> : null}
        <p className="flex flex-wrap items-center gap-2"><Badge variant={rules.rule === "off-record" ? "destructive" : "outline"}>{groundRuleLabel(rules.rule)}</Badge>{rules.recordingPermission ? <span className="text-xs text-muted-foreground">Recording permission confirmed</span> : null}</p>
        {rules.note ? <p className="text-xs text-muted-foreground">{rules.note}</p> : null}
        {detail.source && detail.source.currentGroundRules && detail.source.currentGroundRules !== groundRuleLabel(rules.rule) ? <p className="text-xs text-muted-foreground">The source's ground rules are now “{detail.source.currentGroundRules}”. This recording keeps what was agreed when it was made.</p> : null}
        <p className="text-xs text-muted-foreground">{detail.origin === "manual" ? "Manual transcript" : `Machine transcript${detail.model ? ` · ${detail.model}` : ""}. Not verified.`}</p>
      </section>
      <section aria-label="Saved quotes" className="grid gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Saved from this recording</h3>
        {detail.selections.length === 0 ? <p className="text-muted-foreground">Select words in the transcript to save a highlight or a quote.</p> : (
          <ul className="grid gap-3">{detail.selections.map((selection) => <li key={selection.id}><SelectionCard context={context} selection={selection} detail={detail} seek={seek} refresh={refresh} /></li>)}</ul>
        )}
      </section>
    </div>
  );
}

function SelectionCard({ context, selection, detail, seek, refresh }: { context: StoryScreenContext; selection: SelectionView; detail: TranscriptDetail; seek: (ms: number | null) => void; refresh: () => Promise<unknown> }) {
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: async (action: "verify" | "unverify" | "remove" | "promote" | "override") => {
      if (action === "verify") return verifySelection(context.api, selection.id, true);
      if (action === "unverify") return verifySelection(context.api, selection.id, false);
      if (action === "promote") return editSelection(context.api, selection.id, { kind: "quote" });
      if (action === "override") return overrideOffRecord(context.api, selection.id, reason);
      return removeSelection(context.api, selection.id);
    },
    onSuccess: async (_result, action) => {
      if (action === "override") { setOverriding(false); setReason(""); toast.success("Public use approved. It is recorded in the story's activity."); }
      if (action === "remove") toast.success("Removed.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const blocked = selection.use.action === "blocked";
  return (
    <div className="grid gap-1.5 border-l-2 border-border pl-3" data-selection={selection.id} data-state={selection.state}>
      <p className="[overflow-wrap:anywhere]">“{selection.text}”</p>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <button type="button" className="underline-offset-2 hover:underline focus-visible:underline" onClick={() => seek(selection.startMs)} aria-label={`Play from ${formatPosition(selection.startMs)}`}>{formatPosition(selection.startMs)}</button>
        {selection.speaker ? <span>{selection.speaker}</span> : null}
        <StatusBadge tone={selection.state === "verified" ? "done" : "neutral"}>{selection.kind === "highlight" ? "Highlight" : selection.state === "verified" ? "Verified" : "Not verified"}</StatusBadge>
      </p>
      {selection.state === "verified" && selection.verifiedBy ? <p className="text-xs text-muted-foreground">Verified by {selection.verifiedBy.name}{selection.verifiedAt ? ` · ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: context.timeZone }).format(new Date(selection.verifiedAt))}` : ""}</p> : null}
      {selection.use.action !== "insert" && selection.kind === "quote" ? <p className="text-xs font-medium" data-quote-use={selection.use.action}>{selection.use.message}</p> : null}
      {selection.usedIn.length ? <p className="text-xs text-muted-foreground">Used in {selection.usedIn.map((story) => story.headline).join(", ")}</p> : null}
      {selection.canEdit && !context.readOnly ? (
        <div className="flex flex-wrap gap-1.5">
          {selection.kind === "highlight" ? <Button type="button" size="xs" variant="outline" disabled={run.isPending} onClick={() => run.mutate("promote")}>Make it a quote</Button> : selection.state === "saved" ? <Button type="button" size="xs" disabled={run.isPending} onClick={() => run.mutate("verify")}>I listened — verify</Button> : <Button type="button" size="xs" variant="outline" disabled={run.isPending} onClick={() => run.mutate("unverify")}>Unverify</Button>}
          <Button type="button" size="xs" variant="ghost" disabled={run.isPending} onClick={() => run.mutate("remove")}>Remove</Button>
          {blocked && detail.canOverrideOffRecord && selection.kind === "quote" && !overriding ? <Button type="button" size="xs" variant="outline" onClick={() => setOverriding(true)}>Editor override…</Button> : null}
        </div>
      ) : null}
      {overriding ? (
        <InlineForm label="Editor override" className="grid gap-1.5" onSubmit={() => { if (!run.isPending && reason.trim().length >= 8) run.mutate("override"); }} onCancel={() => setOverriding(false)}>
          <p className="text-xs text-destructive">This was said off the record. Approving public use is recorded with your name and reason.</p>
          <Input value={reason} aria-label="Why may this be used?" placeholder="Why may this be used?" onChange={(event) => setReason(event.target.value)} />
          <div className="flex gap-2"><Button type="button" size="xs" variant="destructive" disabled={run.isPending || reason.trim().length < 8} onClick={() => run.mutate("override")}>Approve public use</Button><Button type="button" size="xs" variant="ghost" onClick={() => setOverriding(false)}>Cancel</Button></div>
        </InlineForm>
      ) : null}
    </div>
  );
}
