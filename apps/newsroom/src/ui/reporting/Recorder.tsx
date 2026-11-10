"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Mic, Square, Upload } from "lucide-react";
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
  const [state, setState] = useState<"idle" | "recording" | "unsupported" | "denied">(() => (typeof window !== "undefined" && (!navigator.mediaDevices?.getUserMedia || pickType() === undefined) ? "unsupported" : "idle"));
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

  return { state, elapsed, start, stop };
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
      <Button type="button" variant="outline" className={className} disabled={busy || reading} onClick={() => input.current?.click()}><Upload data-icon="inline-start" />Upload a recording</Button>
      <input ref={input} type="file" accept={RECORDING_ACCEPT} hidden aria-label="Upload a recording" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void choose(file); }} />
      {problem ? <p role="alert" className="basis-full text-sm text-destructive">{problem}</p> : null}
    </>
  );
}

/**
 * A visible, text-labelled record control: Record, then Stop and save. With
 * `onUploaded`, an existing recording can be uploaded instead (hidden while
 * recording, and the only option where the browser can't record).
 */
export function RecorderPanel({ label, onRecorded, onUploaded, busy, large }: { label?: string; onRecorded: (recording: Recording) => void; onUploaded?: (recording: Recording) => void; busy?: boolean; large?: boolean }) {
  const { state, elapsed, start, stop } = useRecorder();
  const size = large ? "h-11 px-4 text-base" : undefined;
  const upload = onUploaded ? <RecordingUploadButton onPicked={onUploaded} busy={busy} className={size} /> : null;
  if (state === "unsupported") {
    return (
      <div className="flex flex-wrap items-center gap-3" data-recorder={state}>
        <p className="text-sm text-muted-foreground">{upload ? "This browser can't record audio." : "This browser can't record audio. Upload a recording instead."}</p>
        {upload}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-recorder={state}>
      {state === "recording" ? (
        <>
          <Button type="button" variant="destructive" className={size} onClick={() => void stop().then(onRecorded)}><Square data-icon="inline-start" />Stop and save</Button>
          <span role="timer" aria-label="Recording time" className="text-sm tabular-nums"><span aria-hidden="true" className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" />Recording {clock(elapsed)}</span>
        </>
      ) : (
        <>
          <Button type="button" variant="outline" className={size} disabled={busy} onClick={() => void start()}><Mic data-icon="inline-start" />{label ?? "Record"}</Button>
          {upload}
        </>
      )}
      {state === "denied" ? <p role="alert" className="basis-full text-sm text-destructive">Microphone access was blocked. Allow it in the browser's site settings, then try again{upload ? ", or upload a recording" : ""}.</p> : null}
    </div>
  );
}
