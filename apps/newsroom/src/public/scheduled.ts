import { commitTransaction, createLocalReq, initTransaction, killTransaction, type CollectionAfterChangeHook, type Payload, type PayloadRequest, type TaskConfig } from "payload";
import { PUBLICATION_QUEUE } from "./queue";
import { publicRevisionSuppressed, recordPublicMutation } from "./revision";

/**
 * Public facts that become visible at a future moment without any write at
 * that moment. Today: a correction "shown publicly from" a future time (Live
 * Preview and the snapshot both hide it until then). When that time comes,
 * this delayed job records a public mutation so the next snapshot includes
 * it; nothing else changes. (Story scheduled publish is Payload's own
 * `schedulePublish`, which writes the story and is tracked like any publish.)
 */
export const ADVANCE_PUBLIC_REVISION_TASK = "advance-public-revision";

export async function queuePublicRevisionAt(payload: Payload, at: Date, reason: string, req?: PayloadRequest) {
  const jobs = payload.jobs as unknown as { queue: (args: Record<string, unknown>) => Promise<unknown> };
  return jobs.queue({ task: ADVANCE_PUBLIC_REVISION_TASK, queue: PUBLICATION_QUEUE, input: { reason: reason.slice(0, 120) }, waitUntil: at, overrideAccess: true, ...(req ? { req } : {}) });
}

export const advancePublicRevisionTask: TaskConfig = {
  slug: ADVANCE_PUBLIC_REVISION_TASK,
  label: "Advance public revision",
  inputSchema: [{ name: "reason", type: "text" }],
  retries: { attempts: 3 },
  handler: async ({ input, req: jobReq }) => {
    // Its own transaction: the revision and its snapshot job commit together.
    const req = await createLocalReq({}, jobReq.payload);
    const owns = await initTransaction(req);
    try {
      await recordPublicMutation(req, String((input as { reason?: string }).reason ?? "scheduled public change"), { force: true });
      if (owns) await commitTransaction(req);
    } catch (error) {
      await killTransaction(req);
      throw error;
    }
    return { output: {} };
  }
};

/** The moment a correction becomes public: "Shown publicly from", else its date (the same rule Live Preview uses). */
export function correctionPublicFrom(correction: { publishedAt?: unknown; date?: unknown }): number | null {
  const from = Date.parse(String(correction.publishedAt ?? correction.date ?? ""));
  return Number.isFinite(from) ? from : null;
}

/** Corrections hook: schedule the revision change for a correction dated in the future. */
export const scheduleFutureCorrection: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (publicRevisionSuppressed(req)) return doc;
  const from = correctionPublicFrom(doc);
  const before = previousDoc ? correctionPublicFrom(previousDoc) : null;
  if (from !== null && from > Date.now() && from !== before) await queuePublicRevisionAt(req.payload, new Date(from), `correction ${doc.id} becomes public`, req);
  return doc;
};

/** Poll status can change at either window boundary without a document write. */
export const schedulePollWindow: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (publicRevisionSuppressed(req) || doc.status !== "open") return doc;
  for (const field of ["opensAt", "closesAt"] as const) {
    const at = Date.parse(doc[field] ?? "");
    if (at > Date.now() && (previousDoc?.status !== "open" || previousDoc[field] !== doc[field])) {
      await queuePublicRevisionAt(req.payload, new Date(at), `poll ${doc.id} reaches ${field}`, req);
    }
  }
  return doc;
};
