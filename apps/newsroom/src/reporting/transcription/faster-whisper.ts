import { openAsBlob } from "node:fs";
import { normalizeTranscript, segmentId, type NormalizedTranscript } from "../../domain/transcript";
import {
  PermanentTranscriptionError,
  TemporaryTranscriptionError,
  type TranscriptionInput,
  type TranscriptionProgress,
  type TranscriptionProvider
} from "./provider";

type WhisperJobState = "queued" | "loading-diarization" | "diarizing" | "loading-model" | "transcribing" | "ready" | "failed" | "cancelled";
type WhisperJob = {
  job?: unknown;
  state?: unknown;
  progress?: unknown;
  processed?: unknown;
  duration?: unknown;
  segments?: unknown;
  message?: unknown;
  detail?: unknown;
  retryable?: unknown;
  result?: unknown;
};

const JOB_STATES = new Set<WhisperJobState>(["queued", "loading-diarization", "diarizing", "loading-model", "transcribing", "ready", "failed", "cancelled"]);
const defaultPollMs = 5_000;

function jobBody(value: unknown): WhisperJob & { state: WhisperJobState } {
  if (!value || typeof value !== "object") throw new TemporaryTranscriptionError("The transcription service returned an unreadable job status.");
  const row = value as WhisperJob;
  if (typeof row.state !== "string" || !JOB_STATES.has(row.state as WhisperJobState)) throw new TemporaryTranscriptionError("The transcription service returned an unreadable job status.");
  return row as WhisperJob & { state: WhisperJobState };
}

function progressOf(job: WhisperJob & { state: WhisperJobState }): TranscriptionProgress | null {
  if (job.state === "ready") return null;
  const draft = Array.isArray(job.segments) && job.segments.length ? normalizeWhisperTranscript({ ...job, segments: job.segments }) : null;
  const fraction = typeof job.progress === "number" && Number.isFinite(job.progress) ? Math.max(0, Math.min(1, job.progress)) : null;
  const percent = fraction === null ? null : Math.round(fraction * 100);
  if (job.state === "failed" || job.state === "cancelled") {
    // Save any last passages yielded between the previous poll and failure.
    return draft?.segments.length
      ? { state: "transcribing", percent, message: "Transcribing audio", segments: draft.segments, durationMs: draft.durationMs }
      : null;
  }
  const message = typeof job.message === "string" && job.message.trim()
    ? job.message.trim().slice(0, 160)
    : job.state === "queued"
      ? "Waiting for transcription worker"
      : job.state === "loading-diarization"
        ? "Loading speaker model"
        : job.state === "diarizing"
          ? "Identifying speakers"
          : job.state === "loading-model"
            ? "Loading Whisper model"
            : "Transcribing audio";
  return {
    state: job.state,
    percent,
    message,
    // A restarted service can report an empty job before any new speech is
    // available. Keep the saved draft until the new job has a prefix to show.
    ...(draft?.segments.length ? { segments: draft.segments, durationMs: draft.durationMs } : {})
  };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * The self-hosted faster-whisper provider. Long work is an idempotent service
 * job instead of one HTTP request:
 *
 *   POST /jobs/{jobKey}   multipart file + options → queued/current status
 *   GET  /jobs/{jobKey}   → progress or completed result
 *   DELETE /jobs/{jobKey} → best-effort cancellation
 *
 * The stable job key survives Payload retries. If a connection drops while
 * Whisper is still working, the retry reattaches instead of starting another
 * CPU-heavy transcription.
 */
export function fasterWhisperProvider(config: {
  url: string;
  model: string | null;
  language: string | null;
  timeoutMs: number;
  private: boolean;
  token?: string | null;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
}): TranscriptionProvider {
  const doFetch = config.fetchImpl ?? fetch;
  const pollMs = Math.max(10, config.pollIntervalMs ?? defaultPollMs);
  const auth: Record<string, string> = config.token ? { Authorization: `Bearer ${config.token}` } : {};

  return {
    id: "faster-whisper",
    model: config.model,
    private: config.private,
    async transcribe(input: TranscriptionInput, signal: AbortSignal, onProgress): Promise<NormalizedTranscript> {
      const form = new FormData();
      const blob = await openAsBlob(input.path, { type: input.mimeType });
      form.set("file", blob, input.filename);
      if (config.model) form.set("model", config.model);
      const language = input.language ?? config.language;
      if (language) form.set("language", language);
      form.set("vad", "true");
      // Segment-only unless the service diarizes: it turns word timing on
      // itself when it needs it to place a speaker change inside a segment.
      form.set("word_timestamps", "false");
      // Optional, never required: automatic speaker detection is the normal path.
      const hints = speakerHints(input.speakers);
      for (const [name, value] of Object.entries(hints)) form.set(name, String(value));

      const timeout = AbortSignal.timeout(config.timeoutMs);
      const combined = AbortSignal.any([signal, timeout]);
      const jobUrl = `${config.url}/jobs/${encodeURIComponent(input.jobKey)}`;

      const request = async (method: "POST" | "GET"): Promise<Response> => {
        try {
          return await doFetch(jobUrl, {
            method,
            ...(method === "POST" ? { body: form } : {}),
            headers: { Accept: "application/json", ...auth },
            signal: combined
          });
        } catch (error) {
          if (timeout.aborted) throw new TemporaryTranscriptionError("The transcription exceeded the configured processing limit.");
          if (signal.aborted) throw new TemporaryTranscriptionError("The transcription was interrupted.");
          throw new TemporaryTranscriptionError(`The connection to the transcription service dropped (${(error as Error).name}).`);
        }
      };

      const read = async (response: Response, { allowMissing = false }: { allowMissing?: boolean } = {}) => {
        if (allowMissing && response.status === 404) return null;
        const body = await response.json().catch(() => null);
        if (response.status === 429 || response.status >= 500) throw new TemporaryTranscriptionError(`The transcription service is unavailable (HTTP ${response.status}).`);
        if (!response.ok) {
          const detail = body && typeof body === "object" && typeof (body as Record<string, unknown>).detail === "string"
            ? String((body as Record<string, unknown>).detail).slice(0, 200)
            : `HTTP ${response.status}`;
          throw new PermanentTranscriptionError(`The transcription service could not accept this recording: ${detail}`);
        }
        return jobBody(body);
      };

      const start = async () => read(await request("POST"));
      const lookup = async () => read(await request("GET"), { allowMissing: true });
      // On a Payload retry, ask for the existing job before re-uploading the
      // recording. A retry only sends the audio again if the service forgot
      // the job (restart/TTL) or a retryable terminal run must be restarted.
      let job = await lookup();
      if (!job || job.state === "cancelled" || (job.state === "failed" && job.retryable === true)) job = await start();

      try {
        while (job) {
          const progress = progressOf(job);
          if (progress) await onProgress?.(progress);

          if (job.state === "ready") return fromFasterWhisper(job.result);
          if (job.state === "failed") {
            const detail = typeof job.detail === "string" ? job.detail.slice(0, 240) : "Transcription failed.";
            if (job.retryable === true) throw new TemporaryTranscriptionError(detail);
            throw new PermanentTranscriptionError(`The transcription service could not read this recording: ${detail}`);
          }
          if (job.state === "cancelled") throw new TemporaryTranscriptionError("The transcription service cancelled this run.");

          await wait(pollMs, combined);
          const next = await lookup();
          // The service was restarted and forgot its in-memory job. Re-submit
          // the same stable key and recording; this is recovery, not duplication.
          job = next ?? await start();
        }
      } catch (error) {
        if (timeout.aborted || signal.aborted) {
          // Do not cancel on ordinary network failures: a Payload retry should
          // reattach to the still-running service job.
          void doFetch(jobUrl, {
            method: "DELETE",
            headers: { Accept: "application/json", ...auth },
            signal: AbortSignal.timeout(2_000)
          }).catch(() => undefined);
        }
        throw error;
      }
      throw new TemporaryTranscriptionError("The transcription service lost the job.");
    }
  };
}

/**
 * Per-job speaker-count hints for the service's diarizer (`Auto` sends none).
 * An exact count wins over a range; contradictory or out-of-range values are
 * dropped so a bad hint can never fail a job.
 */
export function speakerHints(speakers: TranscriptionInput["speakers"]): Record<string, number> {
  const valid = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20 ? value : null);
  const exact = valid(speakers?.exact);
  if (exact) return { num_speakers: exact };
  const min = valid(speakers?.min);
  const max = valid(speakers?.max);
  if (min && max && min > max) return {};
  return { ...(min ? { min_speakers: min } : {}), ...(max ? { max_speakers: max } : {}) };
}

/** faster-whisper's seconds-based response → Byline's normalized transcript. Exported for tests. */
export function fromFasterWhisper(body: unknown): NormalizedTranscript {
  if (!body || typeof body !== "object" || !Array.isArray((body as { segments?: unknown }).segments)) throw new PermanentTranscriptionError("The transcription service returned something Byline could not read.");
  const normalized = normalizeWhisperTranscript(body as { segments: unknown[] });
  if (!normalized.segments.length) throw new PermanentTranscriptionError("No speech was found in this recording.");
  return normalized;
}

function normalizeWhisperTranscript(record: { language?: unknown; duration?: unknown; segments: unknown[] }): NormalizedTranscript {
  const seconds = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : null);
  return normalizeTranscript({
    language: typeof record.language === "string" ? record.language.toLowerCase() : null,
    durationMs: seconds(record.duration),
    segments: record.segments.map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const segment = raw as Record<string, unknown>;
      return { id: segmentId(index), startMs: seconds(segment.start), endMs: seconds(segment.end), speaker: segment.speaker, text: segment.text };
    })
  });
}
