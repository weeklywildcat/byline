"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@byline/newsroom-ui/ui/drawer";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@byline/newsroom-ui/ui/input-group";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, ChevronRight, Mic, Paperclip, Radio, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FieldFeed, FieldItem, FieldSession } from "../../field/server";
import { ApiError, getJson, postJson } from "../story/api";
import { newClientKey, uploadFile } from "../reporting/api";
import { RecorderPanel, type Recording } from "../reporting/Recorder";
import { enqueue, indexedDbOutbox, memoryOutbox, newItem, outboxLabel, processOutbox, pruneOutbox, retry, SendError, type OutboxItem, type OutboxStore, type Sender } from "./outbox";

/**
 * Field Mode (docs/field-mode.md): "What am I covering right now?", then one
 * capture composer for that coverage. The reporter never chooses where a
 * capture is stored; Byline routes it (notes are private, a live post goes to
 * readers or the live desk, a photo goes to Media, a recording or file stays a
 * private reporting file) and carries the Story, appointment, source and
 * assignment forward.
 *
 * Deliberately small: no desktop shell, no article editor, Front Page or
 * Distribution in this bundle. Primary controls are at least 44px and labelled.
 */
type Route = { story: number | null; appointment: number | null };

function readRoute(): Route {
  if (typeof window === "undefined") return { story: null, appointment: null };
  const params = new URLSearchParams(window.location.search);
  const id = (key: string) => { const value = Number(params.get(key)); return Number.isSafeInteger(value) && value > 0 ? value : null; };
  return { story: id("story"), appointment: id("appointment") };
}

const TAP = "min-h-11 px-4 text-base";

export function FieldApp({ api, admin, account, signedIn }: { api: string; admin: string; account: string; signedIn: boolean }) {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const pop = () => setRoute(readRoute());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const go = useCallback((next: Route) => {
    const params = new URLSearchParams();
    if (next.story) params.set("story", String(next.story));
    if (next.appointment) params.set("appointment", String(next.appointment));
    window.history.pushState(null, "", `${admin}/field${params.size ? `?${params}` : ""}`);
    setRoute(next);
    window.scrollTo(0, 0);
  }, [admin]);
  const outbox = useOutbox(api, account || "anonymous");
  if (!signedIn) return null;
  return (
    <AdminRoot className="byline-field" toaster={false}>
      <div className="min-h-dvh bg-background pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] text-foreground" data-field-shell="">
        <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-5 pt-3 [&>*]:min-w-0">
          {route.story ? <FieldSessionView api={api} route={route} onBack={() => go({ story: null, appointment: null })} outbox={outbox} /> : <FieldLanding api={api} admin={admin} onOpen={go} outbox={outbox} />}
        </div>
      </div>
    </AdminRoot>
  );
}

/* ------------------------------------------------------------------ outbox */

type Outbox = ReturnType<typeof useOutbox>;

function useOutbox(api: string, account: string) {
  const store = useMemo<OutboxStore>(() => (typeof indexedDB === "undefined" ? memoryOutbox() : indexedDbOutbox(account)), [account]);
  const memory = useRef(new Map<string, OutboxItem>());
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const running = useRef(false);
  const queries = useQueryClient();
  const refresh = useCallback(async () => setItems([...(await store.all()), ...memory.current.values()].sort((a, b) => b.createdAt - a.createdAt)), [store]);

  const send = useCallback<Sender>(async (item, { photoId, onProgress }) => {
    try {
      const context = { ...(item.context.appointmentId ? { appointmentId: item.context.appointmentId } : {}), ...(item.context.sourceId ? { sourceId: item.context.sourceId } : {}) };
      if (item.kind === "note") {
        const result = await postJson<{ id: number }>(api, `/byline/stories/${item.storyId}/reporting/notes`, { text: item.text, confidential: item.confidential === true, clientKey: item.key, ...context });
        return { id: result.id, status: "saved" };
      }
      if (item.kind === "live") {
        const result = await postJson<{ id: number; status: "posted" | "sent-to-desk" }>(api, `/byline/field/stories/${item.storyId}/live`, { text: item.text, clientKey: item.key, photoId, queued: item.attempts > 0 });
        return { id: result.id, status: result.status };
      }
      if (!item.blob) throw new SendError("The file is no longer on this device.", 410);
      const route = item.kind === "photo" ? "photos" : "files";
      const extra = item.kind === "photo"
        ? { ...(item.context.assignmentId ? { assignmentId: item.context.assignmentId } : {}), ...(item.capturedAt ? { capturedAt: item.capturedAt } : {}) }
        : { ...context, ...(item.durationMs ? { durationMs: item.durationMs } : {}) };
      const result = await uploadFile<{ id: number }>(api, `/byline/stories/${item.storyId}/reporting/${route}`, item.blob, item.filename ?? "capture", { clientKey: item.key, ...extra }, onProgress);
      return { id: result.id, status: "saved" };
    } catch (error) {
      if (error instanceof SendError) throw error;
      const status = error instanceof ApiError ? error.status : typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 0;
      throw new SendError((error as Error).message, status);
    }
  }, [api]);

  const again = useRef(false);
  const run = useCallback(async (): Promise<void> => {
    // A capture made while a round is sending (a live update queued behind its photo) gets its own round right after.
    if (running.current) { again.current = true; return; }
    running.current = true;
    try {
      const changed = await processOutbox(store, memory.current, send, { online: navigator.onLine, onChange: (item) => setItems((list) => list.map((entry) => (entry.key === item.key ? item : entry))) });
      if (changed.some((item) => item.state === "done")) await queries.invalidateQueries({ queryKey: ["byline", "field"] });
    } finally {
      running.current = false;
      await refresh();
    }
    if (again.current) { again.current = false; await run(); }
  }, [queries, refresh, send, store]);

  useEffect(() => {
    void pruneOutbox(store).then(refresh).then(run);
    const up = () => { setOnline(true); void run(); };
    const down = () => setOnline(false);
    const visible = () => { if (document.visibilityState === "visible") void run(); };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", visible);
    // While Field Mode is open, keep trying (no Background Sync dependency).
    const timer = window.setInterval(() => void run(), 10_000);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); document.removeEventListener("visibilitychange", visible); window.clearInterval(timer); };
  }, [refresh, run, store]);

  const add = useCallback(async (item: OutboxItem) => {
    const { safe } = await enqueue(store, memory.current, item);
    await refresh();
    void run();
    return safe;
  }, [refresh, run, store]);
  const resend = useCallback(async (item: OutboxItem) => {
    const next = retry(item);
    if (next.memoryOnly) memory.current.set(next.key, next);
    else await store.put(next);
    await refresh();
    void run();
  }, [refresh, run, store]);
  const dismiss = useCallback(async (item: OutboxItem) => {
    memory.current.delete(item.key);
    await store.remove(item.key);
    await refresh();
  }, [refresh, store]);
  return { items, online, add, again: resend, dismiss };
}

/* ----------------------------------------------------------------- landing */

const timeOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dayOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));

function FieldLanding({ api, admin, onOpen, outbox }: { api: string; admin: string; onOpen: (route: Route) => void; outbox: Outbox }) {
  const feed = useQuery({ queryKey: ["byline", "field", "feed"], queryFn: () => getJson<FieldFeed>(api, "/byline/field"), refetchInterval: 60_000 });
  const [searching, setSearching] = useState(false);
  const pending = outbox.items.filter((item) => item.state !== "done").length;
  const data = feed.data;
  const empty = data && !data.now.length && !data.today.length && !data.upcoming.length;
  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Field</p>
          <h1 className="text-xl font-semibold">What are you covering?</h1>
        </div>
        <a href={admin || "/admin"} className="text-sm text-muted-foreground underline underline-offset-4">Newsroom</a>
      </header>
      {pending ? <p role="status" className="text-sm">{pending} capture{pending === 1 ? "" : "s"} still sending{outbox.online ? "" : " (offline)"}.</p> : null}
      {feed.isError ? <p role="alert" className="text-sm text-destructive">{(feed.error as Error).message}</p> : null}
      {!data && !feed.isError ? <p role="status" className="text-sm text-muted-foreground">Loading your assignments…</p> : null}
      {data ? (["now", "today", "upcoming"] as const).map((bucket) => data[bucket].length ? (
        <section key={bucket} aria-label={bucket === "now" ? "Now" : bucket === "today" ? "Today" : "Upcoming"} className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{bucket === "now" ? "Now" : bucket === "today" ? "Today" : "Upcoming"}</h2>
          <ul className="divide-y border-y">{data[bucket].map((item) => <li key={item.key}><FieldRow item={item} timeZone={data.timeZone} onOpen={() => onOpen({ story: item.storyId, appointment: item.appointmentId })} /></li>)}</ul>
        </section>
      ) : null) : null}
      {empty ? <p className="text-sm text-muted-foreground">Nothing assigned to you right now. When you're given an interview, an event, a photo assignment or live coverage, it shows up here.</p> : null}
      <Button type="button" variant="outline" className={TAP} onClick={() => setSearching(true)}><Search data-icon="inline-start" />Find another story</Button>
      <StoryPicker api={api} open={searching} onOpenChange={setSearching} onPick={(story) => { setSearching(false); onOpen({ story, appointment: null }); }} />
    </>
  );
}

function FieldRow({ item, timeZone, onOpen }: { item: FieldItem; timeZone: string; onOpen: () => void }) {
  const when = item.startAt ? (item.kind === "production" ? `Due ${dayOf(item.startAt, timeZone)} ${timeOf(item.startAt, timeZone)}` : `${dayOf(item.startAt, timeZone)} · ${timeOf(item.startAt, timeZone)}`) : item.day ? `Around ${item.day}` : "";
  const work = item.kind === "appointment" ? item.title : item.kind === "production" ? `${item.title} · ${item.status.replace(/-/g, " ")}` : "Live coverage";
  return (
    <button type="button" onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2" data-field-item={item.kind}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2"><span className="truncate text-base font-medium">{item.story}</span>{item.live ? <Badge variant="destructive" className="shrink-0">Live</Badge> : null}</span>
        <span className="block text-sm text-muted-foreground">{[work, when, item.location].filter(Boolean).join(" · ")}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** The escape hatch: remote search over the stories this person works on (Command, async). */
function StoryPicker({ api, open, onOpenChange, onPick }: { api: string; open: boolean; onOpenChange: (open: boolean) => void; onPick: (story: number) => void }) {
  const [query, setQuery] = useState("");
  const results = useQuery({ queryKey: ["byline", "field", "search", query], queryFn: () => getJson<{ stories: Array<{ id: number; headline: string; live: boolean }> }>(api, `/byline/field/search?query=${encodeURIComponent(query)}`), enabled: open && query.trim().length >= 2 });
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Find a story</DrawerTitle><DrawerDescription>Stories you're working on.</DrawerDescription></DrawerHeader>
        <Command shouldFilter={false} className="px-2">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search by headline" className="h-11 text-base" />
          <CommandList className="max-h-[50dvh]">
            {query.trim().length >= 2 && results.data && !results.data.stories.length ? <CommandEmpty>No stories match.</CommandEmpty> : null}
            {(results.data?.stories ?? []).map((story) => <CommandItem key={story.id} value={String(story.id)} onSelect={() => onPick(story.id)} className="min-h-11 text-base">{story.headline}{story.live ? <Badge variant="destructive" className="ml-auto">Live</Badge> : null}</CommandItem>)}
          </CommandList>
        </Command>
      </DrawerContent>
    </Drawer>
  );
}

/* ----------------------------------------------------------------- session */

function FieldSessionView({ api, route, onBack, outbox }: { api: string; route: Route; onBack: () => void; outbox: Outbox }) {
  const storyId = route.story!;
  const session = useQuery({ queryKey: ["byline", "field", "session", storyId, route.appointment], queryFn: () => getJson<FieldSession>(api, `/byline/field/stories/${storyId}${route.appointment ? `?appointment=${route.appointment}` : ""}`), refetchInterval: 30_000 });
  const data = session.data;
  if (session.isError) return <><BackBar onBack={onBack} /><p role="alert" className="text-sm text-destructive">{(session.error as Error).message}</p></>;
  if (!data) return <><BackBar onBack={onBack} /><p role="status" className="text-sm text-muted-foreground">Loading…</p></>;
  const tz = data.timeZone;
  const context = [data.appointment?.startAt ? timeOf(data.appointment.startAt, tz) : null, data.appointment?.location || null].filter(Boolean).join(" · ");
  const work = [data.appointment?.title, ...data.assignments.map((assignment) => `${assignment.title}${assignment.deadline ? `, due ${timeOf(assignment.deadline, tz)}` : ""}`)].filter(Boolean).join(" · ");
  return (
    <>
      <header className="grid grid-cols-[minmax(0,1fr)] gap-1">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon-lg" className="-ml-2 size-11" aria-label="Back to your assignments" onClick={onBack}><ArrowLeft /></Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{data.story.headline}</h1>
          {data.story.live ? <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-destructive"><span aria-hidden="true" className="size-2 rounded-full bg-destructive" />LIVE</span> : null}
        </div>
        {context ? <p className="text-sm text-muted-foreground">{context}</p> : null}
        {work ? <p className="text-sm">{work}</p> : null}
      </header>
      <Composer api={api} session={data} appointmentId={route.appointment} outbox={outbox} />
      <Recent session={data} outbox={outbox} />
    </>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return <Button type="button" variant="ghost" className={`${TAP} -ml-3 w-fit`} onClick={onBack}><ArrowLeft data-icon="inline-start" />Assignments</Button>;
}

function Composer({ api, session, appointmentId, outbox }: { api: string; session: FieldSession; appointmentId: number | null; outbox: Outbox }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [choosing, setChoosing] = useState<File | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const storyId = session.story.id;
  const live = session.story.live;
  const context = { ...(appointmentId ? { appointmentId } : {}), ...(session.appointment?.sourceId ? { sourceId: session.appointment.sourceId } : {}) };
  void api;

  const queue = async (item: OutboxItem) => {
    const safe = await outbox.add(item);
    if (!safe) setWarning(`${item.filename ?? "This capture"} is NOT safely queued: this phone has no room to keep it. Keep Field open until it sends, or free up space.`);
  };
  const sendPhoto = async (file: File, assignmentId: number | null) => {
    await queue(newItem({ key: newClientKey(), storyId, kind: "photo", blob: file, filename: file.name || "photo.jpg", capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined, context: { ...(assignmentId ? { assignmentId } : {}) } }));
  };
  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    // Chosen while writing a live update: it goes with the update. Otherwise it is a photo for the story.
    if (live && text.trim()) { setPhoto(file); return; }
    if (session.assignments.length > 1) { setChoosing(file); return; }
    void sendPhoto(file, session.assignments[0]?.id ?? null);
  };
  const saveNote = async () => {
    if (!text.trim()) return;
    await queue(newItem({ key: newClientKey(), storyId, kind: "note", text: text.trim(), context }));
    if (photo) await sendPhoto(photo, session.assignments.length === 1 ? session.assignments[0].id : null);
    setText("");
    setPhoto(null);
  };
  const postLive = async () => {
    if (!text.trim()) return;
    let photoKey: string | undefined;
    if (photo) {
      photoKey = newClientKey();
      await queue(newItem({ key: photoKey, storyId, kind: "photo", blob: photo, filename: photo.name || "photo.jpg", capturedAt: photo.lastModified ? new Date(photo.lastModified).toISOString() : undefined, context: {} }));
    }
    await queue(newItem({ key: newClientKey(), storyId, kind: "live", text: text.trim(), photoKey, context }));
    setText("");
    setPhoto(null);
  };

  return (
    <section aria-label="Capture" className="grid grid-cols-[minmax(0,1fr)] gap-2" data-field-composer="">
      <InputGroup className="h-auto flex-col items-stretch">
        <InputGroupTextarea value={text} rows={4} placeholder={live ? "What's happening?" : "What did you see or hear?"} aria-label="What's happening?" className="min-h-28! px-3 text-base" onChange={(event) => setText(event.target.value)} />
        {photo ? (
          <div className="mx-3 flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm" data-attached-photo="">
            <Camera aria-hidden="true" className="size-4" /><span className="min-w-0 flex-1 truncate">{photo.name || "Photo"} — goes with this live update</span>
            <Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label="Remove photo" onClick={() => setPhoto(null)}><X /></Button>
          </div>
        ) : null}
        <InputGroupAddon align="block-end" className="flex flex-wrap gap-2 border-t px-2 py-2">
          <Button type="button" variant="ghost" className={TAP} onClick={() => photoInput.current?.click()}><Camera data-icon="inline-start" />Photo</Button>
          <Button type="button" variant="ghost" className={TAP} onClick={() => setRecording(true)}><Mic data-icon="inline-start" />Record</Button>
          <Button type="button" variant="ghost" className={TAP} onClick={() => fileInput.current?.click()}><Paperclip data-icon="inline-start" />Attach</Button>
        </InputGroupAddon>
      </InputGroup>
      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden aria-label="Take or choose a photo" onChange={(event) => { onPhoto(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={fileInput} type="file" hidden aria-label="Attach a file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void queue(newItem({ key: newClientKey(), storyId, kind: "file", blob: file, filename: file.name, context })); event.target.value = ""; }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" className={TAP} disabled={!text.trim()} onClick={() => void saveNote()}>Save note</Button>
        {live ? <Button type="button" className={TAP} disabled={!text.trim()} onClick={() => void postLive()}><Radio data-icon="inline-start" />{session.canPostLive ? "Post live" : "Send to live desk"}</Button> : null}
      </div>
      <p className="text-xs text-muted-foreground" data-privacy-line="">
        Save note keeps it private to the story team.{live ? session.canPostLive ? " Post live publishes to readers right away." : " Send to live desk gives it to an editor to publish." : ""}
        {photo ? "" : " Photos go to Media for this story; recordings and attachments stay private."}
      </p>
      {warning ? <p role="alert" className="text-sm font-medium text-destructive">{warning}</p> : null}

      <Drawer open={recording} onOpenChange={setRecording}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Record</DrawerTitle>
            <DrawerDescription>{session.appointment?.source ? `Filed with ${session.appointment.title} (${session.appointment.source}). ` : ""}Saved privately to this story. Keep this screen open while recording.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2"><RecorderPanel large label="Start recording" onRecorded={(result: Recording) => { setRecording(false); void queue(newItem({ key: newClientKey(), storyId, kind: "recording", blob: result.blob, filename: result.filename, durationMs: result.durationMs, context })); }} /></div>
        </DrawerContent>
      </Drawer>

      <Drawer open={choosing !== null} onOpenChange={(open) => { if (!open) setChoosing(null); }}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>Which assignment is this photo for?</DrawerTitle><DrawerDescription>You have more than one photo assignment on this story.</DrawerDescription></DrawerHeader>
          <DrawerFooter>
            {session.assignments.map((assignment) => <Button key={assignment.id} type="button" variant="outline" className={TAP} onClick={() => { const file = choosing!; setChoosing(null); void sendPhoto(file, assignment.id); }}>{assignment.title}</Button>)}
            <Button type="button" variant="ghost" className={TAP} onClick={() => { const file = choosing!; setChoosing(null); void sendPhoto(file, null); }}>Not for an assignment</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </section>
  );
}

const KIND_LABEL: Record<string, string> = { note: "Note", live: "Live", photo: "Photo", media: "Photo", recording: "Recording", file: "File" };

function Recent({ session, outbox }: { session: FieldSession; outbox: Outbox }) {
  const tz = session.timeZone;
  // What this phone is still sending for this story, then what the server already has.
  const pending = outbox.items.filter((item) => item.storyId === session.story.id && (item.state !== "done" || !session.recent.some((row) => row.key === serverKey(item))));
  return (
    <section aria-label="Recent" className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent</h2>
      {!pending.length && !session.recent.length ? <p className="text-sm text-muted-foreground">Nothing captured yet.</p> : null}
      <ul className="divide-y border-y">
        {pending.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5" data-outbox={item.state}>
            <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{timeOf(new Date(item.createdAt).toISOString(), tz)}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{KIND_LABEL[item.kind]} · {item.text ?? item.filename}</span>
            <span role="status" className={`text-sm font-medium ${item.state === "failed" || item.memoryOnly ? "text-destructive" : ""}`}>{outboxLabel(item, outbox.online)}</span>
            {item.state === "failed" ? <div className="flex w-full gap-2"><Button type="button" className={TAP} onClick={() => void outbox.again(item)}>Retry</Button><Button type="button" variant="ghost" className={TAP} onClick={() => void outbox.dismiss(item)}>Discard</Button></div> : null}
            {item.error && item.state === "failed" ? <p className="w-full text-xs text-destructive">{item.error}</p> : null}
          </li>
        ))}
        {session.recent.map((row) => (
          <li key={row.key} className="flex items-center gap-3 py-2.5">
            <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{timeOf(row.at, tz)}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{KIND_LABEL[row.kind]} · {row.text}</span>
            {row.kind === "live" ? <span className="text-sm text-muted-foreground">{row.state === "published" ? "Posted" : "At the live desk"}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function serverKey(item: OutboxItem): string {
  const id = item.result?.id;
  return item.kind === "photo" ? `media:${id}` : item.kind === "recording" || item.kind === "file" ? `file:${id}` : `${item.kind}:${id}`;
}
