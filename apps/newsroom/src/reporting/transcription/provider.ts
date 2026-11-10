import type { NormalizedTranscript, TranscriptSegment } from "../../domain/transcript";

/**
 * The transcription provider boundary (docs/reporting.md#transcription).
 *
 * Byline owns transcript records. A provider turns one private recording into
 * a `NormalizedTranscript` (language, duration, segments with stable ids);
 * nothing provider-specific leaks into storage or the screens.
 *
 * Failures are classified so the job knows whether to retry:
 * - `TemporaryTranscriptionError`: the service is down, slow or overloaded.
 *   Retried by the job with backoff.
 * - `PermanentTranscriptionError`: the audio is malformed or unsupported, or
 *   the service refused it. Recorded on the transcript; never retried.
 */
export type TranscriptionInput = {
  /** Absolute path of the private file on the newsroom volume. */
  path: string;
  filename: string;
  mimeType: string;
  language?: string | null;
  /** Stable for one logical run, including automatic Payload retries. */
  jobKey: string;
};

export type TranscriptionProgress = {
  state: "queued" | "loading-model" | "transcribing";
  /** 0-100 when Whisper can measure it, otherwise null. */
  percent: number | null;
  message: string;
  /** The complete provisional prefix, when available. */
  segments?: TranscriptSegment[];
  durationMs?: number | null;
};

export interface TranscriptionProvider {
  /** Stable id stored on each transcript (`faster-whisper`). */
  id: string;
  /** The configured model, for provenance (`large-v3`, `small.en`). */
  model: string | null;
  /**
   * Whether audio stays on infrastructure the newsroom controls. Only a
   * private provider may be queued automatically after upload; a provider that
   * sends confidential audio to a third party requires explicit newsroom
   * policy and is never used silently.
   */
  private: boolean;
  transcribe(
    input: TranscriptionInput,
    signal: AbortSignal,
    onProgress?: (progress: TranscriptionProgress) => void | Promise<void>
  ): Promise<NormalizedTranscript>;
}

export class TemporaryTranscriptionError extends Error {}
export class PermanentTranscriptionError extends Error {}

export type TranscriptionConfig =
  | { enabled: false; reason: string }
  | { enabled: true; provider: "faster-whisper"; url: string; model: string | null; language: string | null; timeoutMs: number; private: boolean; autoQueue: boolean };

/**
 * `BYLINE_TRANSCRIPTION_PROVIDER=faster-whisper` with
 * `BYLINE_TRANSCRIPTION_URL` (the self-hosted service), optional
 * `BYLINE_TRANSCRIPTION_MODEL`, `BYLINE_TRANSCRIPTION_LANGUAGE`,
 * `BYLINE_TRANSCRIPTION_TIMEOUT_MS` (default 2 hours) and
 * `BYLINE_TRANSCRIPTION_PRIVATE` (default `1`: the service is the
 * newsroom's own; set `0` for anything that leaves the newsroom, which turns
 * automatic queueing off). Anything else: not configured.
 */
export function transcriptionConfig(env: Record<string, string | undefined> = process.env): TranscriptionConfig {
  const provider = env.BYLINE_TRANSCRIPTION_PROVIDER?.trim();
  if (!provider) return { enabled: false, reason: "Transcription is not configured." };
  if (provider !== "faster-whisper") return { enabled: false, reason: `Unknown transcription provider "${provider}".` };
  const raw = env.BYLINE_TRANSCRIPTION_URL?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { enabled: false, reason: "Set BYLINE_TRANSCRIPTION_URL to the transcription service's address." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { enabled: false, reason: "The transcription service must use http(s)." };
  if (url.username || url.password) return { enabled: false, reason: "Put transcription credentials in BYLINE_TRANSCRIPTION_TOKEN, not the URL." };
  const timeout = Number(env.BYLINE_TRANSCRIPTION_TIMEOUT_MS ?? "");
  const isPrivate = (env.BYLINE_TRANSCRIPTION_PRIVATE ?? "1").trim() !== "0";
  const language = env.BYLINE_TRANSCRIPTION_LANGUAGE?.trim() || null;
  return {
    enabled: true,
    provider: "faster-whisper",
    url: url.toString().replace(/\/+$/, ""),
    model: env.BYLINE_TRANSCRIPTION_MODEL?.trim() || null,
    language: language && /^[a-z]{2,3}$/.test(language) ? language : null,
    timeoutMs: Number.isFinite(timeout) && timeout >= 10_000 ? Math.min(timeout, 4 * 60 * 60 * 1000) : 2 * 60 * 60 * 1000,
    private: isPrivate,
    // Automatic queueing after upload only for a private provider (docs/reporting.md#privacy-policy).
    autoQueue: isPrivate
  };
}

/** What the screens may know: whether it works, and why not. Never the URL or token. */
export function transcriptionStatus(env: Record<string, string | undefined> = process.env): { available: boolean; automatic: boolean; message: string } {
  const config = transcriptionConfig(env);
  if (!config.enabled) return { available: false, automatic: false, message: "Transcription is not configured." };
  return {
    available: true,
    automatic: config.autoQueue,
    message: config.autoQueue ? "Recordings are transcribed automatically on the newsroom's own server." : "Transcription sends audio outside the newsroom; start it per recording."
  };
}
