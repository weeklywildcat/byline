"use client";

import { InlineForm } from "@byline/newsroom-ui/components/inline-form";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { useAnyCoarsePointer, useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@byline/newsroom-ui/ui/drawer";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@byline/newsroom-ui/ui/resizable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ChevronDown, ChevronUp, FileText, MoreHorizontal, PanelRight, Pencil, Play, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { groundRuleLabel, quoteUse } from "../../domain/reporting";
import { activeSegmentAt, formatPosition, machineSpeakerLabel, searchTranscript, speakerLabel, speakerProfiles, speakerTurns, type SpeakerProfile, type TranscriptSegment } from "../../domain/transcript";
import {
  editSelection,
  editTranscript,
  loadTranscript,
  overrideOffRecord,
  removeSelection,
  reportingKey,
  saveSelection,
  transcriptKey,
  verifySelection,
  type SelectionView,
  type TranscriptDetail
} from "./api";
import { ApiError } from "../story/api";
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
  return <div ref={frameRef} className="min-w-0" data-transcript-frame=""><TranscriptBody key={props.transcriptId} {...props} width={width} /></div>;
}

function TranscriptBody({ context, transcriptId, onBack, width, hideBack = false }: { context: StoryScreenContext; transcriptId: number; onBack: () => void; width: number; hideBack?: boolean }) {
  const cache = useQueryClient();
  const storyId = Number(context.storyId);
  const detailQuery = useQuery({
    queryKey: transcriptKey(transcriptId),
    queryFn: () => loadTranscript(context.api, transcriptId)
  });
  const detail = detailQuery.data;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  // A speaker sample plays a short passage, then stops by itself.
  const stopAt = useRef<number | null>(null);
  const [position, setPosition] = useState(0);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const contextTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const refresh = useCallback(() => Promise.all([cache.invalidateQueries({ queryKey: transcriptKey(transcriptId) }), cache.invalidateQueries({ queryKey: reportingKey(storyId) }), cache.invalidateQueries({ queryKey: ["byline", "story-quotes", storyId] })]), [cache, transcriptId, storyId]);
  const canEdit = detail?.canEdit === true && !context.readOnly;
  const wide = width >= SIDE_BY_SIDE;

  const ready = detail?.state === "ready";
  const segments = detail?.segments ?? [];
  const segmentCount = segments.length;
  const turns = useMemo(() => speakerTurns(segments), [segments]);
  const profiles = useMemo(() => speakerProfiles(segments), [segments]);
  // Once any passage has a voice, a passage without one is shown as unknown, never as someone.
  const diarized = profiles.length > 0;
  const active = ready ? activeSegmentAt(segments, position) : null;

  const matches = useMemo(() => searchTranscript(segments, query), [segments, query]);
  const current = matches.length ? matches[Math.min(matchIndex, matches.length - 1)] : null;

  const positionAt = useCallback((ms: number | null) => {
    const audio = audioRef.current;
    if (!audio || ms === null) return;
    stopAt.current = null;
    audio.currentTime = ms / 1000;
    setPosition(ms);
  }, []);
  const seek = useCallback((ms: number | null) => {
    positionAt(ms);
    if (ms !== null) void audioRef.current?.play().catch(() => undefined);
  }, [positionAt]);
  const playSample = useCallback((startMs: number, endMs: number | null) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = startMs / 1000;
    stopAt.current = endMs !== null && endMs > startMs ? endMs : startMs + 8000;
    void audio.play().catch(() => undefined);
  }, []);
  const onTime = useCallback((ms: number) => {
    setPosition(ms);
    if (stopAt.current !== null && ms >= stopAt.current) {
      stopAt.current = null;
      audioRef.current?.pause();
    }
  }, []);

  // A new search starts at its first result; stepping scrolls and positions playback without starting audio.
  const changeQuery = (value: string) => {
    setQuery(value);
    setMatchIndex(0);
  };
  const step = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (Math.min(matchIndex, matches.length - 1) + direction + matches.length) % matches.length;
    setMatchIndex(next);
    const hit = matches[next];
    const segment = segments.find((entry) => entry.id === hit.segmentId);
    const stream = streamRef.current;
    const passage = stream?.querySelector(`[data-segment="${hit.segmentId}"]`);
    if (stream && passage) {
      stream.scrollTo({
        top: stream.scrollTop + passage.getBoundingClientRect().top - stream.getBoundingClientRect().top - stream.clientHeight / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
      });
    }
    if (segment) positionAt(segment.startMs);
  };

  useEffect(() => {
    if (!ready) {
      setDraft(null);
      return undefined;
    }
    const syncSelection = () => setDraft(readSelection(streamRef.current));
    document.addEventListener("selectionchange", syncSelection);
    return () => document.removeEventListener("selectionchange", syncSelection);
  }, [ready]);

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
  const detailError = detailQuery.error;
  const accessLost = detailError instanceof ApiError && detailError.status >= 400 && detailError.status < 500;
  if (detailQuery.isError && (!detail || accessLost)) return <div className="grid gap-3">{hideBack ? null : <BackButton onBack={onBack} />}<InlineAlert title="This transcript isn't available" onAction={accessLost ? onBack : () => void detailQuery.refetch()} actionLabel={accessLost ? "Back to Reporting" : "Try again"}>{(detailQuery.error as Error).message}</InlineAlert></div>;
  if (!detail) return <TranscriptSkeleton hideBack={hideBack} onBack={onBack} />;

  const contextPanel = <TranscriptContext context={context} detail={detail} profiles={profiles} canEdit={canEdit} seek={seek} playSample={playSample} refresh={refresh} />;
  const searchBar = (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1"><SearchBar query={query} onQuery={changeQuery} count={matches.length} index={current ? Math.min(matchIndex, matches.length - 1) : -1} onStep={step} /></div>
    </div>
  );
  const stream = (
    <div className="flex min-h-0 flex-1 flex-col">
      <TranscriptState detail={detail} onBack={onBack} />
      {segmentCount > 0 ? (
        <div
          ref={streamRef}
          className="max-h-[45dvh] flex-1 overflow-y-auto px-1"
          role="region"
          aria-label="Transcript passages"
          tabIndex={0}
        >
          {turns.map((turn) => (
            <div key={turn.id} data-turn={turn.identity ?? ""} className="border-t pt-1 first:border-t-0 first:pt-0">
              {turn.segments.map((segment, index) => (
                <Segment
                  key={segment.id}
                  segment={segment}
                  heading={index === 0}
                  diarized={diarized}
                  profiles={profiles}
                  sourceName={detail.source?.label ?? null}
                  isActive={active === segment.id}
                  ranges={matches.filter((match) => match.segmentId === segment.id && match.start >= 0).map((match) => [match.start, match.end] as [number, number])}
                  currentRange={current && current.segmentId === segment.id && current.start >= 0 ? [current.start, current.end] : null}
                  editing={ready && editing === segment.id}
                  canEdit={ready && canEdit}
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
          ))}
        </div>
      ) : ready ? (
        <Empty className="my-4 border py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No transcript text</EmptyTitle>
            <EmptyDescription>This transcript does not contain any readable passages. Replace it from the recording in Reporting.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button type="button" variant="outline" onClick={onBack}>Go to recording</Button></EmptyContent>
        </Empty>
      ) : null}
      {ready && draft ? (
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
            <span className="font-medium tracking-wide uppercase" data-provenance={detail.origin}>{detail.origin === "manual" ? "Uploaded transcript" : "Legacy machine transcript"}</span>
            {!ready && segmentCount > 0 ? <Badge variant="secondary">{detail.state === "failed" ? "Incomplete draft" : "Draft transcript"}</Badge> : null}
            {detail.origin === "machine" && detail.model ? <span>{detail.model}</span> : null}
            {detail.language ? <span>{detail.language.toUpperCase()}</span> : null}
            {detail.durationMs ? <span>{formatPosition(detail.durationMs)}</span> : null}
            {detail.editedAt ? <span>Edited</span> : null}
          </p>
        </div>
        {!wide ? <Button ref={contextTriggerRef} type="button" size="sm" variant="outline" onClick={() => setContextOpen(true)}><PanelRight data-icon="inline-start" />Details{detail.selections.length ? <Badge variant="secondary" className="ml-1">{detail.selections.length}</Badge> : null}</Button> : null}
      </div>
      <GroundRulesBanner detail={detail} />
      {wide ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-[28rem] rounded-lg border">
          <ResizablePanel id="transcript" minSize={420} className="flex flex-col overflow-y-auto">
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-2">
              <Player detail={detail} audioRef={audioRef} onTime={onTime} />
              {searchBar}
              {stream}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize source and quotes" />
          <ResizablePanel id="context" defaultSize="32" minSize={280} maxSize="46" className="overflow-y-auto bg-muted/30">{contextPanel}</ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex min-h-0 flex-col">
          <Player detail={detail} audioRef={audioRef} onTime={onTime} />
          {searchBar}
          {stream}
        </div>
      )}
      <Sheet open={contextOpen && !wide} onOpenChange={setContextOpen}>
        <SheetContent side="right" finalFocus={contextTriggerRef} className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{detail.file.kind === "audio" ? "Interview details" : "Transcript details"}</SheetTitle>
            <SheetDescription>Source, speakers, ground rules, and saved material for this transcript.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{contextPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TranscriptSkeleton({ hideBack, onBack }: { hideBack: boolean; onBack: () => void }) {
  return (
    <div className="grid gap-3" role="status" aria-label="Loading transcript">
      {hideBack ? null : <BackButton onBack={onBack} />}
      <div className="flex items-center gap-3"><div className="grid flex-1 gap-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-3 w-72 max-w-full" /></div><Skeleton className="h-8 w-32" /></div>
      <div className="rounded-lg border p-4"><Skeleton className="h-10 w-full" /><Skeleton className="mt-3 h-8 w-full" /><div className="mt-4 grid gap-4">{[0, 1, 2, 3].map((item) => <div key={item} className="grid grid-cols-[3rem_1fr] gap-3"><Skeleton className="h-4 w-10" /><div className="grid gap-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div></div>)}</div></div>
      <span className="sr-only">Loading transcript…</span>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft data-icon="inline-start" />Reporting</Button>;
}

/** Audio stays pinned above the transcript while reviewing. */
function Player({ detail, audioRef, onTime }: { detail: TranscriptDetail; audioRef: React.RefObject<HTMLAudioElement | null>; onTime: (ms: number) => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [detail.file.url]);
  if (!detail.file.url) return <div className="py-2"><Alert><AlertCircle /><AlertTitle>No recording attached</AlertTitle><AlertDescription>Playback is unavailable, but timestamped passages still keep their original positions.</AlertDescription></Alert></div>;
  return (
    <div className="sticky top-0 z-10 -mx-1 grid gap-2 bg-background px-1 py-2">
      <audio ref={audioRef} controls preload="metadata" src={detail.file.url} aria-label={`Recording: ${detail.file.filename}`} className="h-10 w-full" onCanPlay={() => setFailed(false)} onError={() => setFailed(true)} onTimeUpdate={(event) => onTime(event.currentTarget.currentTime * 1000)} />
      {failed ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Recording could not be loaded</AlertTitle><AlertDescription>The transcript is still available. Return to Reporting if the recording needs to be replaced.</AlertDescription></Alert> : null}
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
        {query ? (
          <InputGroupAddon align="inline-end">
            {query.trim().length >= 2 ? <span role="status" className="text-xs tabular-nums text-muted-foreground">{count ? `${index + 1} of ${count}` : "No results"}</span> : null}
            {query.trim().length >= 2 ? <InputGroupButton type="button" size="icon-xs" aria-label="Previous result" disabled={!count} onClick={() => onStep(-1)}><ChevronUp /></InputGroupButton> : null}
            {query.trim().length >= 2 ? <InputGroupButton type="button" size="icon-xs" aria-label="Next result" disabled={!count} onClick={() => onStep(1)}><ChevronDown /></InputGroupButton> : null}
            <InputGroupButton type="button" size="icon-xs" aria-label="Clear transcript search" onClick={() => onQuery("")}><X /></InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </div>
  );
}

function TranscriptState({ detail, onBack }: { detail: TranscriptDetail; onBack: () => void }) {
  if (detail.state === "ready") return null;
  return (
    <div className="py-3">
      <Alert>
        <AlertCircle />
        <AlertTitle>This legacy transcript is incomplete</AlertTitle>
        <AlertDescription>Automatic transcription has been retired. Upload a .txt, .srt or .vtt replacement from the recording in Reporting.</AlertDescription>
        <AlertAction><Button type="button" size="xs" variant="outline" onClick={onBack}>Go to recording</Button></AlertAction>
      </Alert>
    </div>
  );
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
  segment: TranscriptSegment; heading: boolean; diarized: boolean; profiles: SpeakerProfile[]; sourceName: string | null; isActive: boolean; ranges: Array<[number, number]>; currentRange: [number, number] | null;
  editing: boolean; canEdit: boolean; onSeek: () => void; onEdit: () => void; onDone: () => void; transcriptId: number; api: string; updatedAt: string; refresh: () => Promise<unknown>;
};

function Segment({ segment, heading, diarized, profiles, sourceName, isActive, ranges, currentRange, editing, canEdit, onSeek, onEdit, onDone, transcriptId, api, updatedAt, refresh }: SegmentProps) {
  const [text, setText] = useState(segment.text);
  useEffect(() => setText(segment.text), [segment.text, editing]);
  const save = useMutation({
    mutationFn: () => editTranscript(api, transcriptId, { segmentId: segment.id, text, expectedUpdatedAt: updatedAt }),
    onSuccess: async () => { onDone(); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  return (
    <div data-segment={segment.id} data-active={isActive ? "" : undefined} className={`group grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 rounded-md px-2 ${heading ? "py-2" : "py-1"} ${isActive ? "bg-accent/60" : ""}`}>
      <button type="button" onClick={onSeek} disabled={segment.startMs === null} aria-label={segment.startMs === null ? "No timestamp" : `Play from ${formatPosition(segment.startMs)}`} className="touch-hit h-fit min-h-8 select-none text-left text-xs tabular-nums text-muted-foreground underline-offset-2 hover:underline focus-visible:underline disabled:no-underline">
        {formatPosition(segment.startMs)}
      </button>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {heading && (speakerLabel(segment) || canEdit || diarized) ? <SpeakerEditor segment={segment} diarized={diarized} profiles={profiles} sourceName={sourceName} canEdit={canEdit} transcriptId={transcriptId} api={api} updatedAt={updatedAt} refresh={refresh} /> : null}
          {canEdit && !editing ? <Button type="button" variant="ghost" size="xs" onClick={onEdit} aria-label="Edit this passage" className="select-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"><Pencil data-icon="inline-start" />Edit</Button> : null}
        </div>
        {editing ? (
          <div className="grid gap-2">
            <Textarea value={text} rows={3} aria-label="Passage text" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onDone(); if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save.mutate(); } }} autoFocus />
            <div className="flex gap-2"><Button type="button" size="sm" disabled={save.isPending || !text.trim()} onClick={() => save.mutate()}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}Save</Button><Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={onDone}>Cancel</Button></div>
          </div>
        ) : (
          <p data-segment-text={segment.id} className="text-[0.95rem] leading-relaxed [overflow-wrap:anywhere]">{marked(segment.text, ranges, currentRange)}</p>
        )}
      </div>
    </div>
  );
}

/** What a reporter typed for a voice, or nothing while it still has a machine label. */
const givenName = (segment: Pick<TranscriptSegment, "speaker">) => (segment.speaker && !machineSpeakerLabel(segment.speaker) ? segment.speaker : "");
const machineKeyOf = (key: string | undefined) => (key && /^SPEAKER_\d{2,3}$/.test(key) ? key : null);

/** A speaker is edited where it is shown: this passage, or everywhere. */
function SpeakerEditor({ segment, diarized, profiles, sourceName, canEdit, transcriptId, api, updatedAt, refresh }: { segment: TranscriptSegment; diarized: boolean; profiles: SpeakerProfile[]; sourceName: string | null; canEdit: boolean; transcriptId: number; api: string; updatedAt: string; refresh: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const touch = useAnyCoarsePointer();
  const [name, setName] = useState(givenName(segment));
  useEffect(() => { if (open) setName(givenName(segment)); }, [open, segment]);
  const shown = speakerLabel(segment);
  const suggestions = [...new Set([...profiles.filter((profile) => profile.named).map((profile) => profile.label), ...(sourceName ? [sourceName] : [])])].filter((entry) => entry !== name && entry !== shown);
  const apply = useMutation({
    mutationFn: (everywhere: boolean) => everywhere && segment.speaker
      ? editTranscript(api, transcriptId, { renameSpeaker: { from: segment.speaker, to: name, key: machineKeyOf(segment.speakerKey) }, expectedUpdatedAt: updatedAt })
      : editTranscript(api, transcriptId, { segmentId: segment.id, speaker: name, expectedUpdatedAt: updatedAt }),
    onSuccess: async () => { setOpen(false); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  const clear = useMutation({
    mutationFn: () => editTranscript(api, transcriptId, { segmentId: segment.id, speaker: "", expectedUpdatedAt: updatedAt }),
    onSuccess: async () => { setName(""); setOpen(false); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  // A diarized transcript never presents an unattributed passage as someone's words.
  const label = shown ?? (diarized ? "Unknown speaker" : "Add speaker");
  const plain = shown ? "" : "text-muted-foreground";
  if (!canEdit) return <span data-speaker-label="" className={`select-none text-sm font-medium ${plain}`}>{label}</span>;
  const trigger = <button type="button" className={`touch-hit select-none rounded-sm text-sm font-medium underline-offset-2 hover:underline focus-visible:underline ${plain}`} aria-label={shown ? `Speaker: ${shown}. Change` : "Add speaker"} />;
  const form = (
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); apply.mutate(false); }}>
      <label className="text-sm font-medium" htmlFor={`speaker-${segment.id}`}>Who is speaking?</label>
      <Input id={`speaker-${segment.id}`} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} onFocus={(event) => event.currentTarget.select()} autoFocus />
      {suggestions.length ? <div className="flex flex-wrap gap-1.5">{suggestions.slice(0, 6).map((entry) => <Button key={entry} type="button" size="xs" variant="outline" onClick={() => setName(entry)}>{entry}</Button>)}</div> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={apply.isPending || clear.isPending || !name.trim()}>{apply.isPending ? <Spinner data-icon="inline-start" /> : null}This passage</Button>
        {segment.speaker && name.trim() ? <Button type="button" size="sm" variant="outline" disabled={apply.isPending || clear.isPending} onClick={() => apply.mutate(true)}>Everywhere</Button> : null}
        {segment.speaker ? <Button type="button" size="sm" variant="ghost" disabled={apply.isPending || clear.isPending} onClick={() => clear.mutate()}>{clear.isPending ? <Spinner data-icon="inline-start" /> : null}Clear speaker</Button> : null}
      </div>
    </form>
  );
  return touch ? (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger render={trigger}>{label}</DrawerTrigger>
      <DrawerContent keyboardAware>
        <DrawerHeader><DrawerTitle>Name speaker</DrawerTitle><DrawerDescription>{shown ? `Currently ${shown}` : "Choose who is speaking in this passage."}</DrawerDescription></DrawerHeader>
        <div className="px-4 pb-4">{form}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger}>{label}</PopoverTrigger>
      <PopoverContent align="start" className="w-72">{form}</PopoverContent>
    </Popover>
  );
}

/**
 * The detected voices (docs/reporting.md#speaker-diarization): hear a
 * representative passage, then name each voice once. Byline tells voices
 * apart; it never says whose they are. A reporter supplies the name, and the
 * Source is only ever offered as a suggestion to pick.
 */
function SpeakersPanel({ api, detail, profiles, canEdit, playSample, refresh }: { api: string; detail: TranscriptDetail; profiles: SpeakerProfile[]; canEdit: boolean; playSample: (startMs: number, endMs: number | null) => void; refresh: () => Promise<unknown> }) {
  const ready = detail.state === "ready";
  const [naming, setNaming] = useState<string | null>(null);
  const playable = Boolean(detail.file.url);
  return (
    <section aria-label="Speakers" className="grid gap-2" data-speakers="">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Speakers</h3>
      {!ready ? <p className="text-xs text-muted-foreground">Voices are listed as they are found. You can name them when the transcript is ready.</p> : null}
      <ul className="grid gap-3">
        {profiles.map((profile) => (
          <li key={profile.key} data-speaker={profile.key} className="grid gap-1.5 border-l-2 border-border pl-3">
            <p className="text-sm font-medium">{profile.label}{profile.named ? null : <span className="ml-2 text-xs font-normal text-muted-foreground">Not named yet</span>}</p>
            {profile.sample ? <p className="line-clamp-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">“{profile.sample.text}”</p> : null}
            {naming === profile.key && ready && canEdit ? (
              <NameSpeaker api={api} detail={detail} profile={profile} profiles={profiles} onDone={async () => { setNaming(null); await refresh(); }} onCancel={() => setNaming(null)} />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {playable && profile.sample ? <Button type="button" size="xs" variant="outline" onClick={() => playSample(profile.sample!.startMs, profile.sample!.endMs)}><Play data-icon="inline-start" />Play sample</Button> : null}
                {ready && canEdit ? <Button type="button" size="xs" variant="ghost" onClick={() => setNaming(profile.key)}>{profile.named ? "Rename speaker" : "Name speaker"}</Button> : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NameSpeaker({ api, detail, profile, profiles, onDone, onCancel }: { api: string; detail: TranscriptDetail; profile: SpeakerProfile; profiles: SpeakerProfile[]; onDone: () => Promise<unknown>; onCancel: () => void }) {
  const [name, setName] = useState(profile.named ? profile.label : "");
  const suggestions = [...new Set([...profiles.filter((entry) => entry.named && entry.key !== profile.key).map((entry) => entry.label), ...(detail.source ? [detail.source.label] : [])])].filter((entry) => entry !== name);
  const rename = useMutation({
    mutationFn: () => editTranscript(api, detail.id, { renameSpeaker: { from: profile.stored, to: name, key: machineKeyOf(profile.key) }, expectedUpdatedAt: detail.updatedAt }),
    onSuccess: onDone,
    onError: (error: Error) => toast.error(error.message)
  });
  return (
    <InlineForm label={`Name ${profile.label}`} className="grid gap-1.5" onSubmit={() => { if (!rename.isPending) rename.mutate(); }} onCancel={onCancel}>
      <Input value={name} maxLength={120} aria-label={`Name for ${profile.label}`} placeholder="Name this speaker" autoFocus onChange={(event) => setName(event.target.value)} />
      {suggestions.length ? <div className="flex flex-wrap gap-1.5">{suggestions.slice(0, 5).map((entry) => <Button key={entry} type="button" size="xs" variant="outline" onClick={() => setName(entry)}>{entry}</Button>)}</div> : null}
      <div className="flex gap-2">
        <Button type="button" size="xs" disabled={rename.isPending || (!name.trim() && !profile.named)} onClick={() => rename.mutate()}>{rename.isPending ? <Spinner data-icon="inline-start" /> : null}{name.trim() || !profile.named ? "Save name" : "Clear name"}</Button>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </InlineForm>
  );
}

/** The Source, the ground rules in force when this was recorded, and the quotes saved from it. */
function TranscriptContext({ context, detail, profiles, canEdit, seek, playSample, refresh }: { context: StoryScreenContext; detail: TranscriptDetail; profiles: SpeakerProfile[]; canEdit: boolean; seek: (ms: number | null) => void; playSample: (startMs: number, endMs: number | null) => void; refresh: () => Promise<unknown> }) {
  const rules = detail.groundRules;
  return (
    <div className="grid gap-5 p-4 text-sm" data-transcript-context="">
      <section aria-label="Source" className="grid gap-1.5">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Source</h3>
        {detail.source ? <p className="font-medium">{detail.source.label}{detail.source.role ? <span className="font-normal text-muted-foreground">, {detail.source.role}</span> : null}</p> : <p className="text-muted-foreground">No source attached.</p>}
        {detail.appointment ? <p className="text-muted-foreground">{detail.appointment.title}</p> : null}
        <p className="flex flex-wrap items-center gap-2"><Badge variant={rules.rule === "off-record" ? "destructive" : "outline"}>{groundRuleLabel(rules.rule)}</Badge>{rules.recordingPermission ? <span className="text-xs text-muted-foreground">Recording permission confirmed</span> : null}</p>
        {rules.note ? <p className="text-xs text-muted-foreground">{rules.note}</p> : null}
        {detail.source && detail.source.currentGroundRules && detail.source.currentGroundRules !== groundRuleLabel(rules.rule) ? <p className="text-xs text-muted-foreground">The source's ground rules are now “{detail.source.currentGroundRules}”. This recording keeps what was agreed when it was made.</p> : null}
        <p className="text-xs text-muted-foreground">{detail.origin === "manual" ? "Uploaded transcript" : `Legacy machine transcript${detail.model ? ` · ${detail.model}` : ""}. Not verified.`}</p>
      </section>
      {profiles.length ? <SpeakersPanel api={context.api} detail={detail} profiles={profiles} canEdit={canEdit} playSample={playSample} refresh={refresh} /> : null}
      {detail.state === "ready" ? <section aria-label="Saved transcript material" className="grid gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Saved from this transcript</h3>
        {detail.selections.length === 0 ? <p className="text-muted-foreground">Select words in the transcript to save a highlight or a quote.</p> : (
          <ul className="grid gap-3">{detail.selections.map((selection) => <li key={selection.id}><SelectionCard context={context} selection={selection} detail={detail} seek={seek} refresh={refresh} /></li>)}</ul>
        )}
      </section> : null}
    </div>
  );
}

function SelectionCard({ context, selection, detail, seek, refresh }: { context: StoryScreenContext; selection: SelectionView; detail: TranscriptDetail; seek: (ms: number | null) => void; refresh: () => Promise<unknown> }) {
  const [overriding, setOverriding] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
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
      if (action === "remove") { setRemoveOpen(false); toast.success("Removed."); }
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const blocked = selection.use.action === "blocked";
  return (
    <div className="grid gap-1.5 border-l-2 border-border pl-3" data-selection={selection.id} data-state={selection.state}>
      <p className="[overflow-wrap:anywhere]">“{selection.text}”</p>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <button type="button" className="touch-hit underline-offset-2 hover:underline focus-visible:underline" onClick={() => seek(selection.startMs)} aria-label={`Play from ${formatPosition(selection.startMs)}`}>{formatPosition(selection.startMs)}</button>
        {selection.speaker ? <span>{machineSpeakerLabel(selection.speaker) ?? selection.speaker}</span> : null}
        <StatusBadge tone={selection.state === "verified" ? "done" : "neutral"}>{selection.kind === "highlight" ? "Highlight" : selection.state === "verified" ? "Verified" : "Not verified"}</StatusBadge>
      </p>
      {selection.state === "verified" && selection.verifiedBy ? <p className="text-xs text-muted-foreground">Verified by {selection.verifiedBy.name}{selection.verifiedAt ? ` · ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: context.timeZone }).format(new Date(selection.verifiedAt))}` : ""}</p> : null}
      {selection.use.action !== "insert" && selection.kind === "quote" ? <p className="text-xs font-medium" data-quote-use={selection.use.action}>{selection.use.message}</p> : null}
      {selection.usedIn.length ? <p className="text-xs text-muted-foreground">Used in {selection.usedIn.map((story) => story.headline).join(", ")}</p> : null}
      {selection.canEdit && !context.readOnly ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {selection.kind === "highlight"
            ? <Button type="button" size="xs" variant="outline" disabled={run.isPending} onClick={() => run.mutate("promote")}>Make it a quote</Button>
            : selection.state === "saved"
              ? detail.file.url
                ? <Button type="button" size="xs" disabled={run.isPending} onClick={() => run.mutate("verify")}>I listened — verify</Button>
                : <Badge variant="outline">No recording to verify</Badge>
              : null}
          {selection.state === "verified" || !selection.usedIn.length || (blocked && detail.canOverrideOffRecord && selection.kind === "quote" && !overriding) ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button ref={moreTriggerRef} type="button" size="icon-xs" variant="ghost" aria-label="More saved quote actions" disabled={run.isPending} />}><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {selection.state === "verified" ? <DropdownMenuItem disabled={run.isPending} onClick={() => run.mutate("unverify")}>Unverify</DropdownMenuItem> : null}
                {blocked && detail.canOverrideOffRecord && selection.kind === "quote" && !overriding ? <DropdownMenuItem onClick={() => setOverriding(true)}>Editor override…</DropdownMenuItem> : null}
                {!selection.usedIn.length && (selection.state === "verified" || (blocked && detail.canOverrideOffRecord && selection.kind === "quote" && !overriding)) ? <DropdownMenuSeparator /> : null}
                {!selection.usedIn.length ? <DropdownMenuItem variant="destructive" onClick={() => setRemoveOpen(true)}><Trash2 />Remove…</DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
            <AlertDialogContent size="sm" finalFocus={moreTriggerRef}>
              <AlertDialogHeader>
                <AlertDialogMedia><Trash2 /></AlertDialogMedia>
                <AlertDialogTitle>Remove this saved {selection.kind === "highlight" ? "highlight" : "quote"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved {selection.kind === "highlight" ? "highlight" : selection.state === "verified" ? "verified quote" : "quote"} from Reporting. The transcript itself is unchanged. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={run.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={run.isPending} onClick={() => run.mutate("remove")}>{run.isPending ? "Removing…" : "Remove"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
