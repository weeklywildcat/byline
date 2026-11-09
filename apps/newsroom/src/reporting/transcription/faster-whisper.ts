import { openAsBlob } from "node:fs";
import { normalizeTranscript, segmentId, type NormalizedTranscript } from "../../domain/transcript";
import { PermanentTranscriptionError, TemporaryTranscriptionError, type TranscriptionInput, type TranscriptionProvider } from "./provider";

/**
 * The self-hosted faster-whisper provider. It talks to the small HTTP service
 * in `apps/newsroom/services/faster-whisper` (or anything with the same
 * contract):
 *
 *   POST {url}/transcribe   multipart: file, model?, language?, vad=true, word_timestamps=true
 *   200 { language, duration, segments: [{ start, end, text, speaker? }] }   (seconds)
 *   4xx { detail }   the audio was refused: permanent
 *   5xx / timeout    temporary
 *
 * The model is configuration, never hard-coded, and nothing here assumes a GPU.
 * `BYLINE_TRANSCRIPTION_TOKEN`, if set, is sent as a bearer token.
 */
export function fasterWhisperProvider(config: { url: string; model: string | null; language: string | null; timeoutMs: number; private: boolean; token?: string | null; fetchImpl?: typeof fetch }): TranscriptionProvider {
  const doFetch = config.fetchImpl ?? fetch;
  return {
    id: "faster-whisper",
    model: config.model,
    private: config.private,
    async transcribe(input: TranscriptionInput, signal: AbortSignal): Promise<NormalizedTranscript> {
      const form = new FormData();
      const blob = await openAsBlob(input.path, { type: input.mimeType });
      form.set("file", blob, input.filename);
      if (config.model) form.set("model", config.model);
      const language = input.language ?? config.language;
      if (language) form.set("language", language);
      form.set("vad", "true");
      form.set("word_timestamps", "true");
      const timeout = AbortSignal.timeout(config.timeoutMs);
      let response: Response;
      try {
        response = await doFetch(`${config.url}/transcribe`, {
          method: "POST",
          body: form,
          headers: { Accept: "application/json", ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
          signal: AbortSignal.any([signal, timeout])
        });
      } catch (error) {
        throw new TemporaryTranscriptionError(timeout.aborted ? "The transcription service took too long." : `The transcription service is unreachable (${(error as Error).name}).`);
      }
      if (response.status === 429 || response.status >= 500) throw new TemporaryTranscriptionError(`The transcription service is unavailable (HTTP ${response.status}).`);
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        const detail = typeof body?.detail === "string" ? body.detail.slice(0, 200) : `HTTP ${response.status}`;
        throw new PermanentTranscriptionError(`The transcription service could not read this recording: ${detail}`);
      }
      return fromFasterWhisper(body);
    }
  };
}

/** faster-whisper's seconds-based response → Byline's normalized transcript. Exported for tests. */
export function fromFasterWhisper(body: unknown): NormalizedTranscript {
  if (!body || typeof body !== "object" || !Array.isArray((body as { segments?: unknown }).segments)) throw new PermanentTranscriptionError("The transcription service returned something Byline could not read.");
  const record = body as { language?: unknown; duration?: unknown; segments: Array<Record<string, unknown>> };
  const seconds = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : null);
  const normalized = normalizeTranscript({
    language: typeof record.language === "string" ? record.language.toLowerCase() : null,
    durationMs: seconds(record.duration),
    segments: record.segments.map((segment, index) => ({ id: segmentId(index), startMs: seconds(segment.start), endMs: seconds(segment.end), speaker: segment.speaker, text: segment.text }))
  });
  if (!normalized.segments.length) throw new PermanentTranscriptionError("No speech was found in this recording.");
  return normalized;
}
