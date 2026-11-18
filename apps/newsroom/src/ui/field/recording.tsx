"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@byline/newsroom-ui/ui/drawer";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useScreenWakeLock } from "@byline/newsroom-ui/lib/wake-lock";
import { AlertCircle, Mic, Square, Trash2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { newClientKey } from "../reporting/api";
import { clock, extension, pickType, RecordingUploadButton, type Recording } from "../reporting/Recorder";
import { discardCapture, newItem, QuotaError, type OutboxItem, type OutboxStore } from "./outbox";

/**
 * Field Mode's one recorder (docs/field-mode.md#recording). It belongs to
 * Field, not to the Record drawer or a Story screen, so the reporter can
 * close the drawer, write notes, take photos or open another Story while it
 * keeps recording; a bar at the top of every Field screen says so.
 *
 * Nothing is held only in memory: every few seconds the recorder hands over a
 * chunk, which is written to the outbox's IndexedDB beside a `recording`
 * outbox item. Stop turns that item into a queued recording. If the page is
 * lost while recording (a reload, a crash, the phone closing the tab), the
 * outbox recovers the item from its chunks the next time Field opens. A Web
 * Lock (or, without one, a recent chunk) marks a recording that some tab is
 * still making, so recovery never takes a recording out from under it.
 */

/** How often the recorder saves a chunk: at most this much audio is lost if the page dies. */
export const CHUNK_MS = 3000;
/** Without Web Locks, a recording that saved nothing for this long has no recorder. */
export const STALE_MS = 30_000;

const lockName = (key: string) => `byline-field-recording:${key}`;

type Locks = { request(name: string, callback: () => Promise<void>): Promise<unknown>; query?(): Promise<{ held?: Array<{ name?: string }> }> };
const locks = (): Locks | undefined => (typeof navigator === "undefined" ? undefined : (navigator as { locks?: Locks }).locks);

/** Holds a lock for as long as this page is making the recording; the browser drops it if the page dies. */
function holdLock(key: string): Promise<() => void> {
  const api = locks();
  if (!api?.request) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    let release: () => void = () => {};
    const held = new Promise<void>((done) => { release = done; });
    api.request(lockName(key), () => { resolve(release); return held; }).catch(() => resolve(() => {}));
  });
}

/** Whether some recorder (this page's, or another tab's) is still making this recording. */
export async function recordingIsRunning(item: OutboxItem, own: ReadonlySet<string>, now = Date.now()): Promise<boolean> {
  if (own.has(item.key)) return true;
  const api = locks();
  if (api?.query) {
    try {
      const { held = [] } = await api.query();
      return held.some((lock) => lock.name === lockName(item.key));
    } catch {
      // Fall through to the heartbeat.
    }
  }
  return now - (item.updatedAt ?? item.createdAt) < STALE_MS;
}

/** What the outbox gives the recorder. */
export type RecorderOutbox = {
  store: OutboxStore;
  memory: Map<string, OutboxItem>;
  /** Keys of the recordings this page is making right now (recovery leaves them alone). */
  live: Set<string>;
  /** Queues an item and sends it; false when it is kept only in memory. */
  add: (item: OutboxItem) => Promise<boolean>;
  refresh: () => Promise<void>;
};

/** Which Story (and appointment, source) a new recording is filed with. */
export type RecordingTarget = { storyId: number; story: string; context: OutboxItem["context"]; detail?: string };

type Status = "idle" | "requesting" | "recording" | "unsupported" | "denied";

type Session = {
  key: string;
  target: RecordingTarget;
  item: OutboxItem;
  recorder: MediaRecorder;
  stream: MediaStream;
  /** The same audio as the saved chunks, kept in case the phone refuses one. */
  chunks: Blob[];
  seq: number;
  writes: Promise<void>;
  /** A chunk the phone would not store. */
  lost: boolean;
  ending: "save" | "discard" | null;
  interrupted: boolean;
  release: () => void;
  finished: Promise<void>;
  resolve: () => void;
};

const supported = () => typeof window === "undefined" || (Boolean(navigator.mediaDevices?.getUserMedia) && pickType() !== undefined);

export function useFieldRecorder(outbox: RecorderOutbox) {
  const [status, setStatus] = useState<Status>(() => (supported() ? "idle" : "unsupported"));
  const [active, setActive] = useState<(RecordingTarget & { key: string; startedAt: number }) | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [unsafe, setUnsafe] = useState(false);
  const [notice, setNotice] = useState<{ title: string; text: string; tone: "default" | "destructive" } | null>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<RecordingTarget | null>(null);
  const session = useRef<Session | null>(null);
  const request = useRef(0);
  const box = useRef(outbox);
  box.current = outbox;
  // A locked phone suspends the page and the microphone: keep the screen on while recording.
  useScreenWakeLock(status === "recording");

  const finish = useCallback(async (s: Session) => {
    try {
      await s.writes;
    } finally {
      s.stream.getTracks().forEach((track) => track.stop());
    }
    const { store, memory, add } = box.current;
    const at = Date.now();
    if (s.ending === "discard") {
      await discardCapture(store, memory, s.item).catch(() => undefined);
    } else {
      const base: OutboxItem = { ...s.item, state: "queued", durationMs: at - s.item.createdAt, updatedAt: at };
      // The phone refused a chunk: hand the whole take over as one file (kept in memory, and said so, if that fails too).
      const final: OutboxItem = s.lost ? { ...base, chunked: false, blob: new Blob(s.chunks, { type: base.mimeType }) } : base;
      const safe = await add(final);
      if (s.lost && safe) await store.removeChunks?.(s.key).catch(() => undefined);
      if (!safe) setNotice({ tone: "destructive", title: "This recording is NOT safely stored", text: "This phone has no room to keep it. Keep Field open until it shows Saved, or free up space." });
      else if (s.interrupted) setNotice({ tone: "default", title: "Recording stopped", text: `The phone took the microphone. The ${clock(base.durationMs ?? 0)} recorded is saved and sending.` });
    }
    box.current.live.delete(s.key);
    s.release();
    if (session.current === s) session.current = null;
    setActive(null);
    setStatus("idle");
    setElapsed(0);
    setMuted(false);
    setUnsafe(false);
    s.resolve();
    await box.current.refresh();
  }, []);

  const start = useCallback(async (next: RecordingTarget) => {
    if (session.current) return;
    const type = pickType();
    if (!type || !navigator.mediaDevices?.getUserMedia) { setStatus("unsupported"); return; }
    const version = ++request.current;
    setStatus("requesting");
    setNotice(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      if (version === request.current) setStatus("denied");
      return;
    }
    if (version !== request.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: type });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setStatus("unsupported");
      return;
    }
    const key = newClientKey();
    const release = await holdLock(key);
    const startedAt = Date.now();
    const mime = recorder.mimeType || type;
    const item: OutboxItem = {
      ...newItem({ key, storyId: next.storyId, kind: "recording", chunked: true, mimeType: mime.split(";")[0], filename: `recording-${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}.${extension(mime)}`, context: next.context, createdAt: startedAt }),
      state: "recording",
      updatedAt: startedAt
    };
    let resolve: () => void = () => {};
    const finished = new Promise<void>((done) => { resolve = done; });
    const s: Session = { key, target: next, item, recorder, stream, chunks: [], seq: 0, writes: Promise.resolve(), lost: false, ending: null, interrupted: false, release, finished, resolve };
    session.current = s;
    const { store, live } = box.current;
    live.add(key);
    try {
      await store.put(item);
    } catch {
      s.lost = true;
    }
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      s.chunks.push(event.data);
      const seq = s.seq++;
      const now = Date.now();
      s.item = { ...s.item, durationMs: now - startedAt, updatedAt: now };
      const snapshot = s.item;
      const append = store.appendChunk?.bind(store) ?? (async () => { throw new QuotaError("No chunk store."); });
      s.writes = s.writes.then(() => append(snapshot, seq, event.data)).catch(() => { s.lost = true; setUnsafe(true); });
    };
    // Stop, an error, or the phone taking the microphone all end here; whatever was recorded is kept.
    recorder.onstop = () => { s.ending ??= "save"; void finish(s); };
    recorder.onerror = () => { s.interrupted = true; };
    const [track] = stream.getAudioTracks();
    if (track) {
      track.addEventListener("ended", () => { s.interrupted = true; if (recorder.state !== "inactive") recorder.stop(); });
      track.addEventListener("mute", () => setMuted(true));
      track.addEventListener("unmute", () => setMuted(false));
    }
    recorder.start(CHUNK_MS);
    setActive({ ...next, key, startedAt });
    setElapsed(0);
    setMuted(false);
    setUnsafe(s.lost);
    setStatus("recording");
    void box.current.refresh();
  }, [finish]);

  const end = useCallback((how: "save" | "discard") => {
    const s = session.current;
    if (!s) return Promise.resolve();
    s.ending ??= how;
    if (s.recorder.state !== "inactive") s.recorder.stop();
    return s.finished;
  }, []);
  const stop = useCallback(() => end("save"), [end]);
  const discard = useCallback(() => end("discard"), [end]);
  const cancelRequest = useCallback(() => { request.current += 1; setStatus((state) => (state === "requesting" ? "idle" : state)); }, []);

  useEffect(() => {
    if (status !== "recording" || !active) return undefined;
    const timer = window.setInterval(() => setElapsed(Date.now() - active.startedAt), 250);
    return () => window.clearInterval(timer);
  }, [active, status]);

  // Going to the background or away: save the latest audio now rather than at the next chunk.
  useEffect(() => {
    const flush = () => { const recorder = session.current?.recorder; if (recorder?.state === "recording") recorder.requestData(); };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    const leaving = (event: BeforeUnloadEvent) => { if (!session.current) return; flush(); event.preventDefault(); event.returnValue = ""; };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", leaving);
    return () => { document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", leaving); };
  }, []);

  // Field itself going away stops and saves; its chunks are already on the phone.
  useEffect(() => () => { request.current += 1; const s = session.current; if (s) { s.ending ??= "save"; if (s.recorder.state !== "inactive") s.recorder.stop(); } }, []);

  // The tab says so too.
  useEffect(() => {
    if (status !== "recording" || typeof document === "undefined") return undefined;
    const original = document.title;
    document.title = `● Recording · ${original}`;
    return () => { document.title = original; };
  }, [status]);

  /** Opens the recorder for a Story. While recording, it opens on the recording in progress, wherever it was started. */
  const openFor = useCallback((next: RecordingTarget) => { setTarget(next); setOpen(true); }, []);

  /** An upload ("Upload a recording") is the same private, outboxed file. */
  const upload = useCallback(async (recording: Recording) => {
    const into = target;
    if (!into) return;
    setOpen(false);
    const safe = await box.current.add(newItem({ key: newClientKey(), storyId: into.storyId, kind: "recording", blob: recording.blob, filename: recording.filename, ...(recording.durationMs ? { durationMs: recording.durationMs } : {}), context: into.context }));
    if (!safe) setNotice({ tone: "destructive", title: `${recording.filename} is NOT safely queued`, text: "This phone has no room to keep it. Keep Field open until it sends, or free up space." });
  }, [target]);

  /**
   * Leaving Field (a link to the Story or the newsroom) would stop the
   * recorder. While recording, such a link asks first; after Stop and save
   * the dialog offers the same link, so the take is fully written before the
   * page goes.
   */
  const [leaving, setLeaving] = useState<{ href: string; label: string; saved: boolean } | null>(null);
  const recordingNow = active !== null;
  const guardLeave = useCallback((href: string, label: string) => (event: MouseEvent) => {
    if (!recordingNow) return;
    event.preventDefault();
    setLeaving({ href, label, saved: false });
  }, [recordingNow]);
  const stopToLeave = useCallback(() => { void stop().then(() => setLeaving((current) => (current ? { ...current, saved: true } : current))); }, [stop]);

  return { status, active, elapsed, muted, unsafe, notice, dismissNotice: () => setNotice(null), open, setOpen, target, openFor, start, stop, discard, cancelRequest, upload, leaving, setLeaving, guardLeave, stopToLeave };
}

export type FieldRecorder = ReturnType<typeof useFieldRecorder>;

const RecorderContext = createContext<FieldRecorder | null>(null);

export function FieldRecorderProvider({ recorder, children }: { recorder: FieldRecorder; children: ReactNode }) {
  return <RecorderContext.Provider value={recorder}>{children}</RecorderContext.Provider>;
}

export function useFieldRecording(): FieldRecorder {
  const recorder = useContext(RecorderContext);
  if (!recorder) throw new Error("useFieldRecording needs FieldRecorderProvider.");
  return recorder;
}

const TAP = "min-h-11 px-4 text-base";

/** Shown on every Field screen while a recording runs (and the recorder is closed): time, Story, and Stop. */
export function RecordingBar() {
  const recorder = useFieldRecording();
  const { active, elapsed, muted, unsafe } = recorder;
  if (!active || recorder.open) return null;
  const state = unsafe ? "Phone storage full — keep Field open" : muted ? "Microphone paused by the phone" : active.story;
  return (
    <div role="region" aria-label="Recording in progress" className="sticky top-0 z-40 bg-foreground pt-(--byline-safe-top) pr-[max(1rem,var(--byline-safe-right))] pl-[max(1rem,var(--byline-safe-left))] text-background shadow-sm" data-field-recording-bar={muted ? "muted" : "recording"}>
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 py-1">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => recorder.setOpen(true)} aria-label={`Recording ${clock(elapsed)} for ${active.story}. Open the recorder`}>
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full bg-destructive ${muted ? "" : "animate-pulse motion-reduce:animate-none"}`} />
          <span className="shrink-0 text-base font-semibold tabular-nums">REC {clock(elapsed)}</span>
          <span className="min-w-0 truncate text-sm opacity-80">{state}</span>
        </button>
        <Button type="button" variant="secondary" className="min-h-11 shrink-0 px-4 text-base" onClick={() => void recorder.stop()}><Square data-icon="inline-start" />Stop</Button>
      </div>
    </div>
  );
}

/** What happened to the last recording when it was not the reporter's Stop (the phone took the microphone, or it isn't safely stored). */
export function RecordingNotice() {
  const recorder = useFieldRecording();
  const notice = recorder.notice;
  if (!notice) return null;
  return (
    <Alert variant={notice.tone} data-field-recording-notice="">
      <AlertCircle />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription><p>{notice.text}</p></AlertDescription>
      <AlertAction><Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label="Dismiss" onClick={recorder.dismissNotice}><X /></Button></AlertAction>
    </Alert>
  );
}

/** The one Record drawer: start, upload, or (while recording) the recording in progress. Closing it never stops a recording. */
export function RecorderDrawer() {
  const recorder = useFieldRecording();
  const { status, active, elapsed, muted, unsafe, target } = recorder;
  const [discarding, setDiscarding] = useState(false);
  const recording = status === "recording" && active;
  const elsewhere = recording && target && target.storyId !== active.storyId;
  return (
    <Drawer open={recorder.open} onOpenChange={(open) => { if (!open && status === "requesting") recorder.cancelRequest(); recorder.setOpen(open); }}>
      <DrawerContent data-field-recorder={status}>
        <DrawerHeader>
          <DrawerTitle>{recording ? "Recording" : "Record"}</DrawerTitle>
          <DrawerDescription>
            {recording
              ? `For ${active.story}${active.detail ? ` · ${active.detail}` : ""}. You can close this and keep working in Field: the recording keeps going and is saved on this phone every few seconds. Keep the phone unlocked.`
              : `${target?.detail ? `${target.detail}. ` : ""}Record now, or upload a recording from this phone. Saved privately to this story.`}
          </DrawerDescription>
        </DrawerHeader>
        <div className="grid gap-3 px-4 pb-2">
          {recording ? (
            <>
              <p role="timer" aria-label="Recording time" className="flex items-center gap-3 text-4xl font-semibold tabular-nums">
                <span aria-hidden="true" className={`size-3.5 rounded-full bg-destructive ${muted ? "" : "animate-pulse motion-reduce:animate-none"}`} />{clock(elapsed)}
              </p>
              {elsewhere ? <p className="text-sm text-muted-foreground">Stop this recording to record for {target.story}.</p> : null}
              {muted ? <Alert><AlertCircle /><AlertTitle>The phone paused the microphone</AlertTitle><AlertDescription>A call, another app or the lock screen took it. Recording picks up again when the microphone is back.</AlertDescription></Alert> : null}
              {unsafe ? <Alert variant="destructive"><AlertCircle /><AlertTitle>This phone is out of storage</AlertTitle><AlertDescription>The rest of this recording is only in memory. Keep Field open, and stop and save as soon as you can.</AlertDescription></Alert> : null}
            </>
          ) : status === "unsupported" ? (
            <Alert><AlertCircle /><AlertTitle>Recording isn’t available in this browser</AlertTitle><AlertDescription>You can still upload audio you recorded elsewhere.</AlertDescription></Alert>
          ) : status === "denied" ? (
            <Alert variant="destructive"><AlertCircle /><AlertTitle>Microphone access is blocked</AlertTitle><AlertDescription>Allow microphone access in the browser’s site settings, then try again, or upload a recording instead.</AlertDescription></Alert>
          ) : null}
        </div>
        <DrawerFooter>
          {recording ? (
            <>
              <Button type="button" className={TAP} onClick={() => { recorder.setOpen(false); void recorder.stop(); }}><Square data-icon="inline-start" />Stop and save</Button>
              <Button type="button" variant="outline" className={TAP} onClick={() => recorder.setOpen(false)}>Keep recording and close</Button>
              <Button type="button" variant="ghost" className={TAP} onClick={() => setDiscarding(true)}><Trash2 data-icon="inline-start" />Discard…</Button>
            </>
          ) : (
            <>
              {status !== "unsupported" ? (
                <Button type="button" className={TAP} disabled={status === "requesting" || !target} onClick={() => target && void recorder.start(target)}>{status === "requesting" ? <Spinner data-icon="inline-start" /> : <Mic data-icon="inline-start" />}{status === "requesting" ? "Waiting for microphone…" : "Start recording"}</Button>
              ) : null}
              {status !== "requesting" ? <RecordingUploadButton onPicked={(picked) => void recorder.upload(picked)} className={TAP} /> : null}
              <Button type="button" variant="ghost" className={TAP} onClick={() => { if (status === "requesting") recorder.cancelRequest(); recorder.setOpen(false); }}>Cancel</Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia><Trash2 /></AlertDialogMedia>
            <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
            <AlertDialogDescription>{clock(elapsed)} of audio is deleted from this phone and never reaches Byline. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" className={TAP}>Keep recording</AlertDialogCancel>
            <AlertDialogAction type="button" variant="destructive" className={TAP} onClick={() => { setDiscarding(false); recorder.setOpen(false); void recorder.discard(); }}>Delete recording</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Drawer>
  );
}

/** The leave question from `guardLeave`, mounted once by Field. */
export function LeaveGuardDialog() {
  const { leaving, setLeaving, stopToLeave } = useFieldRecording();
  return (
    <AlertDialog open={leaving !== null} onOpenChange={(open) => { if (!open) setLeaving(null); }}>
      <AlertDialogContent size="sm" data-field-leave={leaving?.saved ? "saved" : "recording"}>
        <AlertDialogHeader>
          <AlertDialogTitle>{leaving?.saved ? "Recording saved" : "You’re still recording"}</AlertDialogTitle>
          <AlertDialogDescription>{leaving?.saved ? "It’s on this phone and sends whenever Field is open and online." : "Leaving Field stops the recording. Stop and save it first, or stay and keep recording."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {leaving?.saved ? (
            <>
              <AlertDialogCancel type="button" className={TAP}>Stay in Field</AlertDialogCancel>
              <Button nativeButton={false} className={TAP} render={<a href={leaving.href} />}>{leaving.label}</Button>
            </>
          ) : (
            <>
              <AlertDialogCancel type="button" className={TAP}>Keep recording</AlertDialogCancel>
              <Button type="button" className={TAP} onClick={stopToLeave}>Stop and save</Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
