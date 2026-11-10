/**
 * Repair queued/processing transcript rows before the dedicated reporting
 * worker starts consuming jobs.
 */
import { getPayload } from "payload";
import config from "../src/payload.config";
import { recoverQueuedTranscriptions } from "../src/reporting/transcription/queue";

const payload = await getPayload({ config });
try {
  const result = await recoverQueuedTranscriptions(payload);
  payload.logger.info({
    msg: result.released || result.requeued || result.legacyReset
      ? "Recovered reporting transcription queue state."
      : "Reporting transcription queue is healthy.",
    ...result
  });
} finally {
  await payload.destroy();
}
