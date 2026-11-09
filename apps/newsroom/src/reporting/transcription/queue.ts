import path from "node:path";
import { APIError, type CollectionAfterChangeHook, type Payload, type PayloadRequest, type TaskConfig } from "payload";
import { relationId } from "../../access/user";
import { recordStoryActivity } from "../../newsroom/story-activity";
import { notifyTranscriptReady } from "../notifications";
import { privateReportingDir } from "../paths";
import { fasterWhisperProvider } from "./faster-whisper";
import { PermanentTranscriptionError, TemporaryTranscriptionError, transcriptionConfig, type TranscriptionProvider } from "./provider";

/**
 * Transcription jobs (docs/reporting.md#jobs). Long-running work lives on its
 * own `reporting` queue (worker: `npm run jobs:reporting`), so a 45-minute
 * interview never delays publication, snapshots or maintenance.
 *
 * Temporary infrastructure failures are retried with backoff; malformed or
 * unsupported audio fails once and says why. Upload and manual import never
 * depend on transcription being configured.
 */
export const REPORTING_QUEUE = "reporting";
export const TRANSCRIBE_TASK = "transcribe-reporting-file";
const MAX_ATTEMPTS = 5;

export function configuredProvider(env: Record<string, string | undefined> = process.env): TranscriptionProvider | null {
  const config = transcriptionConfig(env);
  if (!config.enabled) return null;
  return fasterWhisperProvider({ ...config, token: env.BYLINE_TRANSCRIPTION_TOKEN?.trim() || null });
}

/** Overridable in tests: the provider the job uses. */
let providerOverride: TranscriptionProvider | null | undefined;
export function setTranscriptionProviderForTests(provider: TranscriptionProvider | null | undefined) {
  providerOverride = provider;
}
const activeProvider = () => (providerOverride !== undefined ? providerOverride : configuredProvider());

type Jobs = { queue: (args: Record<string, unknown>) => Promise<unknown> };

/**
 * Creates (or re-queues) the transcript for a recording. The transcript
 * inherits the recording's story, source, appointment, confidentiality and
 * ground-rules snapshot; nobody is asked for them again.
 */
export async function queueTranscription(req: PayloadRequest, fileId: number, { requestedBy }: { requestedBy?: number | string | null } = {}): Promise<number> {
  const provider = activeProvider();
  if (!provider) throw new APIError("Transcription is not configured. Import a transcript instead.", 409);
  const file = await req.payload.findByID({ collection: "reporting-files", id: fileId, depth: 0, overrideAccess: true, req });
  if (file.kind !== "audio") throw new APIError("Only recordings can be transcribed.", 400);
  const existing = await req.payload.find({ collection: "reporting-transcripts", where: { file: { equals: fileId } }, depth: 0, limit: 1, overrideAccess: true, req });
  const context = { ...req.context, bylineSystem: true };
  let transcriptId: number;
  if (existing.docs[0]) {
    const row = existing.docs[0];
    if (row.state === "ready" && row.origin === "manual") throw new APIError("This recording already has a manual transcript.", 409);
    if (row.state === "queued" || row.state === "processing") return row.id;
    await req.payload.update({ collection: "reporting-transcripts", id: row.id, data: { state: "queued", failure: null, attempts: 0, origin: "machine", provider: provider.id, model: provider.model }, overrideAccess: true, depth: 0, context, req });
    transcriptId = row.id;
  } else {
    const created = await req.payload.create({
      collection: "reporting-transcripts",
      data: {
        story: relationId(file.story) as number, file: fileId, source: relationId(file.source) as number | null, appointment: relationId(file.appointment) as number | null,
        confidential: file.confidential === true, groundRules: file.groundRules ?? null, state: "queued", origin: "machine", provider: provider.id, model: provider.model,
        createdBy: (requestedBy ?? relationId(file.createdBy)) as number | null, capturedAt: file.capturedAt ?? new Date().toISOString(), attempts: 0
      },
      overrideAccess: true, depth: 0, context, req
    });
    transcriptId = created.id;
  }
  await (req.payload.jobs as unknown as Jobs).queue({ task: TRANSCRIBE_TASK, queue: REPORTING_QUEUE, input: { transcriptId }, overrideAccess: true, req });
  return transcriptId;
}

/** After a recording is uploaded: queue it only when the provider is the newsroom's own (private). */
export const queueTranscriptionAfterUpload: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== "create" || doc.kind !== "audio" || req.context?.bylineImport === true) return doc;
  const config = transcriptionConfig();
  const provider = activeProvider();
  if (!provider || !provider.private || (providerOverride === undefined && config.enabled && !config.autoQueue)) return doc;
  await queueTranscription(req, doc.id as number);
  return doc;
};

async function markFailed(payload: Payload, req: PayloadRequest, id: number, failure: string) {
  await payload.update({ collection: "reporting-transcripts", id, data: { state: "failed", failure: failure.slice(0, 400) }, overrideAccess: true, depth: 0, context: { bylineSystem: true }, req });
}

export const transcribeReportingFileTask: TaskConfig = {
  slug: TRANSCRIBE_TASK,
  label: "Transcribe a reporting recording",
  inputSchema: [{ name: "transcriptId", type: "number", required: true }],
  retries: { attempts: MAX_ATTEMPTS - 1, backoff: { type: "exponential", delay: 60_000 } },
  concurrency: ({ input }) => `transcribe:${(input as { transcriptId?: number }).transcriptId}`,
  handler: async ({ input, req }) => {
    const { payload } = req;
    const id = Number((input as { transcriptId?: unknown }).transcriptId);
    const found = await payload.find({ collection: "reporting-transcripts", where: { id: { equals: id } }, depth: 0, limit: 1, overrideAccess: true, req });
    const transcript = found.docs[0];
    // Removed, or already finished by someone else (a manual import): nothing to do.
    if (!transcript || transcript.state === "ready") return { output: { skipped: true } };
    const provider = activeProvider();
    if (!provider) {
      await markFailed(payload, req, id, "Transcription is not configured.");
      return { output: { failed: true } };
    }
    const fileId = relationId(transcript.file);
    const file = fileId === null ? null : await payload.findByID({ collection: "reporting-files", id: fileId, depth: 0, overrideAccess: true, req, disableErrors: true });
    if (!file?.filename) {
      await markFailed(payload, req, id, "The recording is gone.");
      return { output: { failed: true } };
    }
    const attempts = (typeof transcript.attempts === "number" ? transcript.attempts : 0) + 1;
    await payload.update({ collection: "reporting-transcripts", id, data: { state: "processing", attempts, failure: null }, overrideAccess: true, depth: 0, context: { bylineSystem: true }, req });
    try {
      const result = await provider.transcribe(
        { path: path.join(privateReportingDir(), path.basename(file.filename)), filename: file.filename, mimeType: file.mimeType ?? "application/octet-stream", language: transcript.language ?? null },
        AbortSignal.timeout(4 * 60 * 60 * 1000)
      );
      await payload.update({
        collection: "reporting-transcripts", id,
        data: { state: "ready", origin: "machine", provider: provider.id, model: provider.model, language: result.language, durationMs: result.durationMs, segments: result.segments, completedAt: new Date().toISOString(), failure: null },
        overrideAccess: true, depth: 0, context: { bylineSystem: true }, req
      });
      if (!file.durationMs && result.durationMs) await payload.update({ collection: "reporting-files", id: file.id, data: { durationMs: result.durationMs }, overrideAccess: true, depth: 0, context: { bylineSystem: true }, req });
      await recordStoryActivity(req, transcript.story, "transcript-completed", id);
      await notifyTranscriptReady(req, { storyId: Number(relationId(transcript.story)), transcriptId: id, recipient: relationId(transcript.createdBy) });
      return { output: { segments: result.segments.length } };
    } catch (error) {
      if (error instanceof PermanentTranscriptionError) {
        await markFailed(payload, req, id, error.message);
        return { output: { failed: true } };
      }
      const message = error instanceof TemporaryTranscriptionError ? error.message : "Transcription failed unexpectedly.";
      if (attempts >= MAX_ATTEMPTS) {
        await markFailed(payload, req, id, `${message} Byline stopped retrying; try again later.`);
        return { output: { failed: true } };
      }
      // Back in the queue; Payload retries with backoff.
      await payload.update({ collection: "reporting-transcripts", id, data: { state: "queued", failure: message.slice(0, 400) }, overrideAccess: true, depth: 0, context: { bylineSystem: true }, req });
      throw error;
    }
  }
};
