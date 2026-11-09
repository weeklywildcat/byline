import type { PayloadRequest } from "payload";
import { notify } from "../newsroom/notifications";

/**
 * Reporting's notifications. Transcription finishes asynchronously, so the
 * person who uploaded (or requested) the recording is told, even though it was
 * their own action: the outcome arrives later and needs confirmation. The
 * notification names only the recording's filename (a short reference), never
 * transcript text.
 */
export async function notifyTranscriptReady(req: PayloadRequest, input: { storyId: number; transcriptId: number; recipient: number | string | null }) {
  if (input.recipient === null) return;
  const transcript = await req.payload.findByID({ collection: "reporting-transcripts", id: input.transcriptId, depth: 1, overrideAccess: true, req, disableErrors: true });
  const file = transcript?.file && typeof transcript.file === "object" ? transcript.file : null;
  await notify(req, {
    kind: "transcriptReady",
    recipients: [input.recipient],
    story: input.storyId,
    detail: (file?.originalFilename ?? file?.filename ?? "recording").slice(0, 120),
    data: { transcriptId: input.transcriptId, tab: "reporting" },
    dedupe: `transcript-ready:${input.transcriptId}:${transcript?.completedAt ?? ""}`,
    // The system finished it: nobody is excluded as the actor.
    actor: null
  });
}
