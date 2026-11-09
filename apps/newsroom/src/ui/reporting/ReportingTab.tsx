"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { useDebouncedValue, useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Progress } from "@byline/newsroom-ui/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileText, Image as ImageIcon, Link2, Lock, Mic, PanelRight, Plus, Radio, Search, StickyNote, Upload, X } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { GROUND_RULE_OPTIONS, groundRuleLabel, materialDayGroups, materialMatchesFilter, materialMatchesSearch, MATERIAL_FILTERS, sortMaterial, type MaterialFilter, type ReportingFileMaterial, type StoryMaterialItem } from "../../domain/reporting";
import { transcriptFormat } from "../../domain/transcript";
import type { ReportingAppointment, ReportingSource } from "../../reporting/material";
import { postJson } from "../story/api";
import { formatDay } from "../story/parts";
import type { StoryScreenContext } from "../story/StoryScreen";
import { clock, RecorderPanel, type Recording } from "./Recorder";
import { editNote, editFile, loadReporting, newClientKey, positionLabel, removeFile, removeNote, reportingKey, saveGroundRules, saveNote, startTranscription, uploadFile } from "./api";
import { TranscriptView } from "./TranscriptView";

/** Width of the Reporting area above which Sources and Appointments sit beside the feed (measured: feed rows need ~520px, the rail ~280px). */
const RAIL_AT = 880;
type ReportingData = Awaited<ReturnType<typeof loadReporting>>;

type CaptureActions = { note: () => void; record: () => void; file: () => void; photo: () => void; link: () => void; transcript: () => void };
type Bound = { sourceId?: number; appointmentId?: number; label?: string };
type Upload = { id: string; name: string; kind: "file" | "photo" | "transcript"; progress: number; error: string | null; blob: Blob; extra: Record<string, unknown> };

const when = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * A Story's Reporting (docs/reporting.md): one chronological notebook of
 * everything captured for the story, never a set of file-type tabs. The
 * reporter captures; Byline routes each capture to its canonical home and
 * carries the Story, Source, Appointment and ground rules forward.
 */
export function ReportingTab({ context }: { context: StoryScreenContext }) {
  // Measured from the first render (useElementWidth measures on mount), whatever the body shows.
  const [frameRef, width] = useElementWidth<HTMLDivElement>();
  return <div ref={frameRef} className="min-w-0" data-reporting-frame=""><ReportingBody context={context} width={width} /></div>;
}

function ReportingBody({ context, width }: { context: StoryScreenContext; width: number }) {
  const storyId = Number(context.storyId);
  const cache = useQueryClient();
  const query = useQuery({ queryKey: reportingKey(storyId), queryFn: () => loadReporting(context.api, storyId), refetchInterval: 20_000 });
  const [filter, setFilter] = useState<MaterialFilter>("all");
  const [search, setSearch] = useState("");
  const needle = useDebouncedValue(search, 150);
  const [panel, setPanel] = useState<null | "note" | "link" | "record">(null);
  const [bound, setBound] = useState<Bound | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [openTranscript, setOpenTranscript] = useState<number | null>(() => {
    const id = typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("transcript"));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const photoInput = useRef<HTMLInputElement | null>(null);
  const transcriptInput = useRef<HTMLInputElement | null>(null);
  const pendingBound = useRef<Bound | null>(null);
  const data = query.data;
  const wide = width >= RAIL_AT;
  const refresh = useCallback(() => cache.invalidateQueries({ queryKey: reportingKey(storyId) }), [cache, storyId]);
  const canCapture = !context.readOnly && data?.capabilities.capture === true;

  const send = useCallback(async (entry: Upload) => {
    const route = entry.kind === "photo" ? "photos" : entry.kind === "transcript" ? "transcripts" : "files";
    setUploads((list) => list.map((item) => (item.id === entry.id ? { ...item, error: null, progress: 0 } : item)));
    try {
      await uploadFile(context.api, `/byline/stories/${storyId}/reporting/${route}`, entry.blob, entry.name, { clientKey: entry.id, ...entry.extra }, (fraction) => setUploads((list) => list.map((item) => (item.id === entry.id ? { ...item, progress: fraction } : item))));
      setUploads((list) => list.filter((item) => item.id !== entry.id));
      toast.success(entry.kind === "photo" ? "Photo added to Media." : entry.kind === "transcript" ? "Transcript imported." : "Saved privately.");
      await refresh();
    } catch (error) {
      setUploads((list) => list.map((item) => (item.id === entry.id ? { ...item, error: (error as Error).message } : item)));
    }
  }, [context.api, refresh, storyId]);

  const enqueue = useCallback((kind: Upload["kind"], blob: Blob, name: string, extra: Record<string, unknown> = {}) => {
    const context = pendingBound.current ?? bound;
    const entry: Upload = { id: newClientKey(), name, kind, progress: 0, error: null, blob, extra: { ...(context?.sourceId ? { sourceId: context.sourceId } : {}), ...(context?.appointmentId ? { appointmentId: context.appointmentId } : {}), ...extra } };
    setUploads((list) => [entry, ...list]);
    void send(entry);
  }, [bound, send]);

  const pick = (input: React.RefObject<HTMLInputElement | null>, from?: Bound) => {
    pendingBound.current = from ?? bound;
    input.current?.click();
  };
  const onFiles = (kind: "file" | "photo", files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (kind === "file" && transcriptFormat(file.name, file.type) && /\.(srt|vtt)$/i.test(file.name)) enqueue("transcript", file, file.name);
      else enqueue(kind, file, file.name);
    }
    pendingBound.current = null;
  };

  const capture = (from?: Bound) => ({
    note: () => { setBound(from ?? null); setPanel("note"); },
    record: () => { setBound(from ?? null); setPanel("record"); },
    file: () => pick(fileInput, from),
    photo: () => pick(photoInput, from),
    transcript: () => pick(transcriptInput, from),
    link: () => { setBound(from ?? null); setPanel("link"); }
  });

  if (openTranscript !== null) {
    return <TranscriptView context={context} transcriptId={openTranscript} onBack={() => { setOpenTranscript(null); void refresh(); }} />;
  }
  if (query.isError) return <InlineAlert title="Reporting isn't available" onAction={() => void query.refetch()}>{(query.error as Error).message}</InlineAlert>;
  if (!data) return <p role="status" className="text-sm text-muted-foreground">Loading reporting…</p>;

  const visible = sortMaterial(data.materials).filter((item) => materialMatchesFilter(item, filter) && materialMatchesSearch(item, needle));
  const groups = materialDayGroups(visible, data.timeZone);
  const planning = <PlanningContext context={context} data={data} capture={capture} canCapture={canCapture} refresh={refresh} />;
  const transcription = data.capabilities.transcription;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-reporting="">
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => { onFiles("file", event.target.files); event.target.value = ""; }} aria-label="Upload a file" />
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(event) => { onFiles("photo", event.target.files); event.target.value = ""; }} aria-label="Upload a photo" />
      <input ref={transcriptInput} type="file" accept=".txt,.srt,.vtt,text/plain,text/vtt" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) enqueue("transcript", file, file.name); pendingBound.current = null; event.target.value = ""; }} aria-label="Import a transcript" />
      <div className="grid gap-4" style={wide ? { gridTemplateColumns: "minmax(0, 1fr) 17.5rem" } : undefined}>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="min-w-48 flex-1">
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput type="search" value={search} placeholder="Search this story…" aria-label="Search this story's reporting" onChange={(event) => setSearch(event.target.value)} />
            </InputGroup>
            {canCapture ? <CaptureMenu capture={capture()} /> : null}
            {!wide ? <Button type="button" variant="outline" onClick={() => setRailOpen(true)}><PanelRight data-icon="inline-start" />Sources & appointments</Button> : null}
          </div>

          {bound?.label && panel ? <p className="text-sm text-muted-foreground" data-capture-context="">For <span className="font-medium text-foreground">{bound.label}</span> <button type="button" className="underline underline-offset-2" onClick={() => setBound(null)}>Clear</button></p> : null}
          {panel === "note" ? <NoteComposer context={context} bound={bound} onDone={() => { setPanel(null); setBound(null); void refresh(); }} onCancel={() => { setPanel(null); setBound(null); }} /> : null}
          {panel === "link" ? <LinkComposer context={context} onDone={() => { setPanel(null); void refresh(); }} onCancel={() => setPanel(null)} /> : null}
          {panel === "record" ? (
            <div className="grid gap-2 rounded-lg border p-3" data-record-panel="">
              <p className="text-sm font-medium">Record an interview</p>
              <p className="text-xs text-muted-foreground">Saved as a private recording on this story{bound?.label ? `, for ${bound.label}` : ""}. {transcription.available ? transcription.message : "Transcription is not configured; you can import a transcript later."}</p>
              <div className="flex flex-wrap items-center gap-3">
                <RecorderPanel onRecorded={(recording: Recording) => { enqueue("file", recording.blob, recording.filename, { durationMs: recording.durationMs }); setPanel(null); setBound(null); }} />
                <Button type="button" variant="ghost" size="sm" onClick={() => { setPanel(null); setBound(null); }}>Cancel</Button>
              </div>
            </div>
          ) : null}

          {data.upNext.length ? (
            <section aria-label="Up next" className="grid gap-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Up next</h3>
              <ul className="divide-y border-y">
                {data.upNext.map((appointment) => <li key={appointment.id}><AppointmentRow appointment={appointment} data={data} timeZone={context.timeZone} capture={capture} canCapture={canCapture} /></li>)}
              </ul>
            </section>
          ) : null}

          <section aria-label="Material" className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Material</h3>
              <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Show" value={[filter]} onValueChange={(next: unknown[]) => { const value = next[0]; if (MATERIAL_FILTERS.some((entry) => entry.value === value)) setFilter(value as MaterialFilter); }}>
                {MATERIAL_FILTERS.map((entry) => <ToggleGroupItem key={entry.value} value={entry.value}>{entry.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
            {uploads.length ? <ul className="grid gap-2" aria-label="Uploads">{uploads.map((upload) => <li key={upload.id}><UploadRow upload={upload} onRetry={() => void send(upload)} onDismiss={() => setUploads((list) => list.filter((item) => item.id !== upload.id))} /></li>)}</ul> : null}
            {groups.length === 0 && !uploads.length ? (
              <Empty className="border border-dashed py-10">
                <EmptyHeader>
                  <EmptyTitle>{data.materials.length ? "Nothing matches" : "Nothing captured yet"}</EmptyTitle>
                  <EmptyDescription>{data.materials.length ? "Try another filter or search." : canCapture ? "Capture a note, record an interview, add a photo, a document or a link. It all lands here, on this story." : "Material captured for this story will appear here."}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : groups.map((group) => (
              <div key={group.label} className="grid gap-1">
                <h4 className="pt-2 text-sm font-medium">{group.label}</h4>
                <ul className="divide-y border-y">
                  {group.items.map((item) => <li key={item.key}><MaterialRow context={context} item={item} data={data} onOpenTranscript={setOpenTranscript} refresh={refresh} onImport={() => capture({ sourceId: item.source?.id, appointmentId: item.appointment?.id }).transcript()} /></li>)}
                </ul>
              </div>
            ))}
          </section>
        </div>
        {wide ? <aside aria-label="Sources and appointments" className="min-w-0 border-l pl-4">{planning}</aside> : null}
      </div>
      <Sheet open={railOpen && !wide} onOpenChange={setRailOpen}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-sm">
          <SheetHeader><SheetTitle>Sources & appointments</SheetTitle><SheetDescription>Who the story is reporting on, and when. Capture from one and it is filed with it.</SheetDescription></SheetHeader>
          <div className="px-4 pb-6">{planning}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CaptureMenu({ capture }: { capture: CaptureActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" />}><Plus data-icon="inline-start" />Capture</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onClick={capture.note}><StickyNote />Note</DropdownMenuItem>
        <DropdownMenuItem onClick={capture.record}><Mic />Record interview or audio</DropdownMenuItem>
        <DropdownMenuItem onClick={capture.file}><Upload />Upload file</DropdownMenuItem>
        <DropdownMenuItem onClick={capture.photo}><ImageIcon />Upload photo</DropdownMenuItem>
        <DropdownMenuItem onClick={capture.link}><Link2 />Add link</DropdownMenuItem>
        <DropdownMenuItem onClick={capture.transcript}><FileText />Import transcript</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NoteComposer({ context, bound, onDone, onCancel }: { context: StoryScreenContext; bound: Bound | null; onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [confidential, setConfidential] = useState(false);
  const key = useRef(newClientKey());
  const save = useMutation({
    mutationFn: () => saveNote(context.api, Number(context.storyId), { text, confidential, clientKey: key.current, ...(bound?.sourceId ? { sourceId: bound.sourceId } : {}), ...(bound?.appointmentId ? { appointmentId: bound.appointmentId } : {}) }),
    onSuccess: () => { toast.success("Note saved. It is private."); onDone(); },
    onError: (error: Error) => toast.error(error.message)
  });
  return (
    <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); if (text.trim()) save.mutate(); }} data-note-composer="">
      <InputGroup>
        <InputGroupTextareaAutoFocus value={text} onChange={setText} />
        <InputGroupAddon align="block-end" className="justify-between">
          <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground"><Checkbox checked={confidential} onCheckedChange={(next) => setConfidential(next === true)} />Confidential</label>
          <div className="flex gap-2"><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" disabled={!text.trim() || save.isPending}>Save note</Button></div>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-xs text-muted-foreground">A private reporting note. {confidential ? "Only you, the story's editor and administrators can see it." : "Visible to the people on this story."}</p>
    </form>
  );
}

function InputGroupTextareaAutoFocus({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Textarea autoFocus value={value} rows={3} maxLength={8000} placeholder="What do you want to remember?" aria-label="Note" className="min-h-20 resize-y border-0 shadow-none focus-visible:ring-0" onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit(); }} />;
}

function LinkComposer({ context, onDone, onCancel }: { context: StoryScreenContext; onDone: () => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      let label = url;
      try { label = new URL(url).hostname.replace(/^www\./, ""); } catch { /* the server explains it */ }
      return postJson(context.api, `/byline/stories/${Number(context.storyId)}/resources`, { label, url, purpose: "research" });
    },
    onSuccess: () => { toast.success("Link added to this story."); onDone(); },
    onError: (failure: Error) => setError(failure.message)
  });
  return (
    <form className="grid gap-1.5" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); setError(null); save.mutate(); }}>
      <InputGroup>
        <InputGroupAddon><Link2 aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput autoFocus type="url" value={url} placeholder="Paste a link" aria-label="Link address" aria-invalid={error ? true : undefined} onChange={(event) => setUrl(event.target.value)} />
        <InputGroupAddon align="inline-end"><Button type="submit" size="xs" disabled={!url.trim() || save.isPending}>Add link</Button><Button type="button" size="xs" variant="ghost" onClick={onCancel}>Cancel</Button></InputGroupAddon>
      </InputGroup>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

function UploadRow({ upload, onRetry, onDismiss }: { upload: Upload; onRetry: () => void; onDismiss: () => void }) {
  return (
    <div className="grid gap-1.5 rounded-lg border p-3" data-upload={upload.error ? "failed" : "sending"}>
      <div className="flex items-center justify-between gap-2"><p className="truncate text-sm">{upload.name}</p>{upload.error ? <div className="flex gap-2"><Button type="button" size="xs" onClick={onRetry}>Retry</Button><Button type="button" size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={onDismiss}><X /></Button></div> : null}</div>
      {upload.error ? <p role="alert" className="text-xs text-destructive">{upload.error}</p> : <Progress value={Math.round(upload.progress * 100)} aria-label={`Uploading ${upload.name}`}><span className="text-xs text-muted-foreground">Uploading</span></Progress>}
    </div>
  );
}

function iconFor(item: StoryMaterialItem): ReactNode {
  if (item.kind === "note") return <StickyNote aria-hidden="true" />;
  if (item.kind === "live") return <Radio aria-hidden="true" />;
  if (item.kind === "media") return <ImageIcon aria-hidden="true" />;
  if (item.kind === "resource") return <Link2 aria-hidden="true" />;
  return item.fileKind === "audio" ? <Mic aria-hidden="true" /> : item.fileKind === "image" ? <ImageIcon aria-hidden="true" /> : <FileText aria-hidden="true" />;
}

function MaterialRow({ context, item, data, onOpenTranscript, refresh, onImport }: { context: StoryScreenContext; item: StoryMaterialItem; data: ReportingData; onOpenTranscript: (id: number) => void; refresh: () => Promise<unknown>; onImport: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.kind === "note" ? item.text : "");
  const remove = useMutation({
    mutationFn: () => (item.kind === "note" ? removeNote(context.api, item.id) : removeFile(context.api, item.id)),
    onSuccess: async () => { toast.success("Removed."); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  const toggle = useMutation({
    mutationFn: () => (item.kind === "note" ? editNote(context.api, item.id, { confidential: !item.confidential }) : editFile(context.api, item.id, { confidential: !item.confidential })),
    onSuccess: async () => { toast.success(item.confidential ? "Now visible to the story team." : "Now confidential."); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  const saveNoteText = useMutation({
    mutationFn: () => editNote(context.api, item.id, { text }),
    onSuccess: async () => { setEditing(false); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  const startMachine = useMutation({
    mutationFn: () => startTranscription(context.api, item.id),
    onSuccess: async (result) => { await refresh(); onOpenTranscript(result.transcriptId); },
    onError: (error: Error) => toast.error(error.message)
  });
  const editable = item.canEdit && !context.readOnly && (item.kind === "note" || item.kind === "file");
  const title = rowTitle(item);
  const sub = rowSub(item, context.timeZone);
  const file = item.kind === "file" ? item : null;
  const transcript = file?.transcript ?? null;

  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 py-2.5" data-material={item.kind} data-key={item.key}>
      <span className="pt-0.5 text-muted-foreground [&_svg]:size-4">{iconFor(item)}</span>
      <div className="min-w-0">
        {editing && item.kind === "note" ? (
          <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); if (text.trim()) saveNoteText.mutate(); }}>
            <Textarea value={text} rows={3} aria-label="Note" autoFocus onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }} />
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={saveNoteText.isPending || !text.trim()}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setText(item.kind === "note" ? item.text : ""); }}>Cancel</Button></div>
          </form>
        ) : (
          <>
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium [overflow-wrap:anywhere]">
              {item.kind === "resource" || (file && file.fileKind !== "audio" && file.url) ? <a href={item.kind === "resource" ? item.url : file!.url} target="_blank" rel="noreferrer noopener" className="underline-offset-2 hover:underline">{title}</a> : <span className={item.kind === "note" || item.kind === "live" ? "font-normal whitespace-pre-line" : ""}>{title}</span>}
              {item.confidential ? <Lock aria-label="Confidential" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              {item.kind === "live" ? <StatusBadge tone={item.state === "published" ? "done" : "neutral"}>{item.state === "published" ? "Posted live" : "Draft for the desk"}</StatusBadge> : null}
            </p>
            {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
            {file ? <FileFacts file={file} /> : null}
          </>
        )}
      </div>
      {/* Actions sit under the words, never beside them, so text keeps the full measure at any width. */}
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 empty:hidden">
        {file && transcript ? <Button type="button" size="xs" variant={transcript.state === "ready" ? "default" : "outline"} onClick={() => onOpenTranscript(transcript.id)}>{transcript.state === "ready" ? "Open transcript" : transcript.state === "failed" ? "Transcript failed" : "Transcribing…"}</Button> : null}
        {file && !transcript && file.fileKind === "audio" && editable ? <>
          {data.capabilities.transcription.available ? <Button type="button" size="xs" variant="outline" disabled={startMachine.isPending} onClick={() => startMachine.mutate()}>Transcribe</Button> : null}
          <Button type="button" size="xs" variant="outline" onClick={onImport}>Import transcript</Button>
        </> : null}
        {item.kind === "note" && editable && !editing ? <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(true)}>Edit</Button> : null}
        {editable ? <Button type="button" size="xs" variant="ghost" disabled={toggle.isPending} aria-pressed={item.confidential} onClick={() => toggle.mutate()}><Lock data-icon="inline-start" />{item.confidential ? "Confidential" : "Make confidential"}</Button> : null}
        {editable && !(file && transcript) ? <Button type="button" size="xs" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>Remove</Button> : null}
      </div>
    </div>
  );
}

function rowTitle(item: StoryMaterialItem): string {
  switch (item.kind) {
    case "note": return item.text;
    case "live": return item.text;
    case "file": return item.filename;
    case "media": return item.filename;
    case "resource": return item.label;
  }
}

function rowSub(item: StoryMaterialItem, timeZone: string): string {
  const parts: string[] = [];
  if (item.kind === "media") parts.push(item.via === "capture" ? "Photo" : "Photo for this story");
  if (item.kind === "file") parts.push(item.fileKind === "audio" ? "Recording" : item.fileKind === "image" ? "Private image" : "Document");
  if (item.kind === "resource") parts.push("Link");
  if (item.source) parts.push(item.source.label);
  else if (item.appointment) parts.push(item.appointment.title);
  if (item.author) parts.push(item.author.name);
  parts.push(when(item.occurredAt, timeZone));
  return parts.join(" · ");
}

/** Duration, size and how far the recording has got: the facts a reporter scans for. */
function FileFacts({ file }: { file: ReportingFileMaterial }) {
  const transcript = file.transcript;
  const bits: string[] = [];
  if (file.durationMs) bits.push(clock(file.durationMs));
  bits.push(size(file.filesize));
  if (file.groundRules.rule !== "unspecified") bits.push(groundRuleLabel(file.groundRules.rule));
  return (
    <p className="text-xs text-muted-foreground">
      {bits.join(" · ")}
      {transcript?.state === "ready" ? ` · ${transcript.origin === "manual" ? "Manual transcript" : "Transcript ready"}${transcript.quoteCount ? ` · ${transcript.verifiedCount} of ${transcript.quoteCount} quote${transcript.quoteCount === 1 ? "" : "s"} verified` : ""}` : ""}
      {transcript && transcript.state !== "ready" ? ` · ${transcript.state === "failed" ? `Transcript failed: ${transcript.failure ?? "unknown error"}` : "Transcribing"}` : ""}
    </p>
  );
}

function AppointmentRow({ appointment, data, timeZone, capture, canCapture, stacked }: { appointment: ReportingAppointment; data: ReportingData; timeZone: string; capture: (from?: Bound) => { note: () => void; record: () => void }; canCapture: boolean; stacked?: boolean }) {
  const source = data.sources.find((entry) => entry.id === appointment.sourceId);
  const from: Bound = { appointmentId: appointment.id, ...(source ? { sourceId: source.id } : {}), label: appointment.title };
  const time = appointment.startAt ? new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(appointment.startAt)) : formatDay(appointment.windowStart, timeZone) || "No time yet";
  const actions = canCapture && appointment.kind !== "photo" ? <div className="flex gap-1.5"><Button type="button" size="xs" variant="outline" onClick={() => capture(from).record()}><Mic data-icon="inline-start" />Record</Button><Button type="button" size="xs" variant="ghost" onClick={() => capture(from).note()}>Note</Button></div> : null;
  // In the narrow rail the title gets its own line; buttons never squeeze it.
  if (stacked) return <div className="grid gap-1 py-2"><p className="text-sm font-medium">{appointment.title}</p><p className="text-xs text-muted-foreground">{time}{appointment.status === "cancelled" ? " · Cancelled" : ""}</p>{actions}</div>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm"><span className="font-medium">{appointment.title}</span> <span className="text-muted-foreground">· {time}</span></p>
      {actions}
    </div>
  );
}

/** Sources and Appointments stay visible because they matter to reporting; compact lists, never cards in the feed. */
function PlanningContext({ context, data, capture, canCapture, refresh }: { context: StoryScreenContext; data: ReportingData; capture: (from?: Bound) => { note: () => void; record: () => void }; canCapture: boolean; refresh: () => Promise<unknown> }) {
  return (
    <div className="grid gap-5 text-sm">
      <section aria-label="Sources" className="grid gap-1">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Sources</h3>
        {data.sources.length === 0 ? <p className="text-muted-foreground">No sources yet. Add them in Plan.</p> : (
          <ul className="divide-y border-y">{data.sources.map((source) => <li key={source.id}><SourceRow context={context} source={source} canEdit={data.capabilities.manage && !context.readOnly} canCapture={canCapture} capture={capture} refresh={refresh} /></li>)}</ul>
        )}
      </section>
      <section aria-label="Appointments" className="grid gap-1">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Appointments</h3>
        {data.appointments.length === 0 ? <p className="text-muted-foreground">No appointments yet.</p> : (
          <ul className="divide-y border-y">{data.appointments.map((appointment) => <li key={appointment.id}><AppointmentRow appointment={appointment} data={data} timeZone={data.timeZone} capture={capture} canCapture={canCapture && appointment.status !== "cancelled"} stacked /></li>)}</ul>
        )}
      </section>
    </div>
  );
}

function SourceRow({ context, source, canEdit, canCapture, capture, refresh }: { context: StoryScreenContext; source: ReportingSource; canEdit: boolean; canCapture: boolean; capture: (from?: Bound) => { note: () => void; record: () => void }; refresh: () => Promise<unknown> }) {
  const from: Bound = { sourceId: source.id, label: source.label };
  return (
    <div className="grid gap-1 py-2">
      <p className="font-medium">{source.label}{source.role ? <span className="font-normal text-muted-foreground">, {source.role}</span> : null}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <GroundRulesEditor context={context} source={source} canEdit={canEdit} refresh={refresh} />
        {canCapture ? <><Button type="button" size="xs" variant="ghost" onClick={() => capture(from).note()}>Note</Button><Button type="button" size="xs" variant="ghost" onClick={() => capture(from).record()}><Mic data-icon="inline-start" />Record</Button></> : null}
      </div>
    </div>
  );
}

/** Ground rules are recorded by a person, never inferred: a visible badge that is also the editor. */
function GroundRulesEditor({ context, source, canEdit, refresh }: { context: StoryScreenContext; source: ReportingSource; canEdit: boolean; refresh: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState(source.groundRules);
  const [permission, setPermission] = useState(source.recordingPermission);
  const [note, setNote] = useState(source.groundRulesNote);
  const save = useMutation({
    mutationFn: () => saveGroundRules(context.api, source.id, { groundRules: rule, recordingPermission: permission, note }),
    onSuccess: async () => { setOpen(false); toast.success("Ground rules saved. Recordings already made keep what was agreed then."); await refresh(); },
    onError: (error: Error) => toast.error(error.message)
  });
  const badge = <Badge variant={source.groundRules === "off-record" ? "destructive" : "outline"}>{groundRuleLabel(source.groundRules)}</Badge>;
  if (!canEdit) return badge;
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setRule(source.groundRules); setPermission(source.recordingPermission); setNote(source.groundRulesNote); } }}>
      <PopoverTrigger render={<button type="button" aria-label={`Ground rules for ${source.label}: ${groundRuleLabel(source.groundRules)}. Change`} className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/50" />}>{badge}</PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); save.mutate(); }}>
          <p className="text-sm font-medium">What did {source.label} agree to?</p>
          <Select items={GROUND_RULE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} value={rule} onValueChange={(next) => { if (next) setRule(next as typeof rule); }}>
            <SelectTrigger aria-label="Ground rules" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>{GROUND_RULE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={permission} onCheckedChange={(next) => setPermission(next === true)} />Recording permission confirmed</label>
          <Input value={note} maxLength={600} placeholder="Note (optional)" aria-label="Ground rules note" onChange={(event) => setNote(event.target.value)} />
          <p className="text-xs text-muted-foreground">Byline only carries this forward; it doesn't decide what it means. Off the record material can't be inserted as a quote.</p>
          <Button type="submit" size="sm" disabled={save.isPending}>Save</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
