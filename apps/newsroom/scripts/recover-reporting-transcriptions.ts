/**
 * Repair queued/processing transcript rows that no longer have a live Payload
 * job. This runs once when the dedicated reporting worker starts.
 */
import { getPayload } from "payload";
import config from "../src/payload.config";
import { recoverQueuedTranscriptions } from "../src/reporting/transcription/queue";

const payload = await getPayload({ config });
try {
  const result = await recoverQueuedTranscriptions(payload);
  payload.logger.info({
    msg: result.recovered
      ? `Recovered ${result.recovered} orphaned transcription job${result.recovered === 1 ? "" : "s"}.`
      : "No orphaned transcription jobs to recover.",
    ...result
  });
} finally {
  await payload.destroy();
}
