"use client";

import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { AlertCircle, Mic, Square, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useScreenWakeLock } from "@byline/newsroom-ui/lib/wake-lock";
import { RECORDING_ACCEPT, recordingMimeType, recordingUploadProblem } from "../../domain/reporting";

export type Recording = { blob: Blob; filename: string; durationMs: number };

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

const extension = (mime: string) => (mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm");

/**
 * Records audio in the browser (the phone's microphone). A recording is held
 * in memory until stopped; the caller decides where it goes (a private
 * Reporting File, or the Field outbox). Never uploads by itself.
 */
export function useRecorder() {
  const [state, setState] = useState<"idle" | "requesting" | "recording" | "unsupported" | "denied">(() => (typeof window !== "undefined" && (!navigator.mediaDevices?.getUserMedia || pickType() === undefined) ? "unsupported" : "idle"));
  const [elapsed, setElapsed] = useState(0);
  // A locked phone suspends the page and cuts the recording short: keep the screen on only while recording.
  useScreenWakeLock(state === "recording");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const finish = useRef<((recording: Recording) => void) | null>(null);

  useEffect(() => {
    if (state !== "recording") return undefined;
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => () => { stream.current?.getTracks().forEach((track) => track.stop()); }, []);

  const start = useCallback(async () => {
    const type = pickType();
    if (!type || !navigator.mediaDevices?.getUserMedia) { setState("unsupported"); return; }
    setState("requesting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState("denied");
      return;
    }
    chunks.current = [];
    const next = new MediaRecorder(stream.current, { mimeType: type });
    next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
    next.onstop = () => {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      const mime = next.mimeType || type;
      const durationMs = Date.now() - startedAt.current;
      const blob = new Blob(chunks.current, { type: mime.split(";")[0] });
      setState("idle");
      setElapsed(0);
      finish.current?.({ blob, filename: `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension(mime)}`, durationMs });
    };
    recorder.current = next;
    startedAt.current = Date.now();
    // A timeslice keeps long interviews from living in one giant buffer inside the recorder.
    next.start(10_000);
    setElapsed(0);
    setState("recording");
  }, []);

  /** Stops and resolves with the recording. */
  const stop = useCallback(() => new Promise<Recording>((resolve) => {
    finish.current = resolve;
    recorder.current?.stop();
  }), []);

  /** Stops the active recorder without handing the take to the caller. */
  const discard = useCallback(() => {
    finish.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  return { state, elapsed, start, stop, discard };
}

export const clock = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Reads an audio file's length in the browser so an uploaded recording
 * shows its duration like a recorded one. 0 when the browser can't tell
 * (the server then simply stores no duration).
 */
export function audioDuration(file: Blob): Promise<number> {
  if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") return Promise.resolve(0);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (ms: number) => { window.clearTimeout(timer); audio.removeAttribute("src"); URL.revokeObjectURL(url); resolve(ms); };
    const timer = window.setTimeout(() => done(0), 5000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

/** "Upload a recording": an existing audio file (a phone voice memo, a recorder's MP3) handed on exactly like a browser recording. */
export function RecordingUploadButton({ onPicked, busy, className }: { onPicked: (recording: Recording) => void; busy?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const choose = async (file: File | undefined) => {
    if (!file) return;
    const issue = recordingUploadProblem(file.name, file.type, file.size);
    setProblem(issue);
    if (issue) return;
    // Send it with the type it is kept as: a file the browser reports without one would otherwise arrive as octet-stream and be refused.
    const mime = recordingMimeType(file.name, file.type)!;
    const blob = file.type === mime ? file : new File([file], file.name, { type: mime });
    setReading(true);
    const durationMs = await audioDuration(blob);
    setReading(false);
    onPicked({ blob, filename: file.name, durationMs });
  };
  return (
    <>
      <Button type="button" variant="outline" className={className} disabled={busy || reading} onClick={() => input.current?.click()}>{reading ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}{reading ? "Reading recording…" : "Upload a recording"}</Button>
      <input ref={input} type="file" accept={RECORDING_ACCEPT} hidden aria-label="Upload a recording" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void choose(file); }} />
      {problem ? <Alert variant="destructive" className="basis-full"><AlertCircle /><AlertTitle>Can’t use this recording</AlertTitle><AlertDescription>{problem}</AlertDescription></Alert> : null}
    </>
  );
}

/**
 * A visible, text-labelled record control: Record, then Stop and save. With
 * `onUploaded`, an existing recording can be uploaded instead (hidden while
 * recording, and the only option where the browser can't record).
 */
export function RecorderPanel({ label, onRecorded, onUploaded, onCancel, busy, large }: { label?: string; onRecorded: (recording: Recording) => void; onUploaded?: (recording: Recording) => void; onCancel?: () => void; busy?: boolean; large?: boolean }) {
  const { state, elapsed, start, stop, discard } = useRecorder();
  const size = large ? "h-11 px-4 text-base" : undefined;
  const upload = onUploaded ? <RecordingUploadButton onPicked={onUploaded} busy={busy} className={size} /> : null;
  if (state === "unsupported") {
    return (
      <div className="grid gap-2" data-recorder={state}>
        <Alert>
          <AlertCircle />
          <AlertTitle>Recording isn’t available in this browser</AlertTitle>
          <AlertDescription>{upload ? "You can still upload audio you recorded elsewhere." : "Use a browser that supports microphone recording, or upload audio elsewhere."}</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">{upload}{onCancel ? <Button type="button" variant="ghost" className={size} onClick={onCancel}>Cancel</Button> : null}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-recorder={state}>
      {state === "recording" ? (
        <>
          <Button type="button" className={size} onClick={() => void stop().then(onRecorded)}><Square data-icon="inline-start" />Stop and save</Button>
          <span role="timer" aria-label="Recording time" className="text-sm tabular-nums"><span aria-hidden="true" className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" />Recording {clock(elapsed)}</span>
          {onCancel ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="ghost" className={size} />}>Discard…</AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogMedia><Trash2 /></AlertDialogMedia>
                  <AlertDialogTitle>Discard this recording?</AlertDialogTitle>
                  <AlertDialogDescription>The current take has not been saved. Discarding it cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep recording</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => { discard(); onCancel(); }}>Discard recording</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </>
      ) : (
        <>
          <Button type="button" variant="outline" className={size} disabled={busy || state === "requesting"} onClick={() => void start()}>{state === "requesting" ? <Spinner data-icon="inline-start" /> : <Mic data-icon="inline-start" />}{state === "requesting" ? "Waiting for microphone…" : label ?? "Record"}</Button>
          {state === "requesting" ? null : upload}
          {onCancel ? <Button type="button" variant="ghost" className={size} disabled={state === "requesting"} onClick={onCancel}>Cancel</Button> : null}
        </>
      )}
      {state === "denied" ? <Alert variant="destructive" className="basis-full"><AlertCircle /><AlertTitle>Microphone access is blocked</AlertTitle><AlertDescription>Allow microphone access in the browser’s site settings, then try again{upload ? ", or upload a recording instead" : ""}.</AlertDescription></Alert> : null}
    </div>
  );
}
