import { APIError, commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";
import { stableDigest } from "@byline/content";
import { PUBLICATION_GLOBAL, ANALYTICS_GROUP } from "../globals/Publication";
import { publicationGlobalSlice } from "../public/slices";
import { recordPublicMutation } from "../public/revision";
import { readPublishedPublication } from "../public/publication-config";
import type { IntegrationState } from "./connection";

/** The public form of a measurement choice: what the Publication Global stores and the snapshot carries. */
export type PublicAnalyticsChoice = { installTag: boolean; measurementId: string; consentMode: "always" | "ask" };

/** Only "Install with Byline" has a public form. Anything else publishes no tag at all. */
export function desiredPublicAnalytics(state: Pick<IntegrationState, "trackingMode" | "consentMode" | "measurementId" | "status">): PublicAnalyticsChoice {
  const install = state.trackingMode === "byline" && state.status === "connected" && Boolean(state.measurementId);
  return { installTag: install, measurementId: install ? state.measurementId! : "", consentMode: state.consentMode === "always" ? "always" : "ask" };
}

export const choiceOf = (row: Record<string, unknown> | null | undefined): PublicAnalyticsChoice => {
  const group = (row?.[ANALYTICS_GROUP] ?? {}) as Record<string, unknown>;
  return {
    installTag: group.installTag === true,
    measurementId: group.installTag === true && typeof group.measurementId === "string" ? group.measurementId : "",
    consentMode: group.consentMode === "always" ? "always" : "ask"
  };
};

export const sameChoice = (a: PublicAnalyticsChoice, b: PublicAnalyticsChoice) => a.installTag === b.installTag && a.measurementId === b.measurementId && (!a.installTag || a.consentMode === b.consentMode);

export async function publishedChoice(payload: Payload, req?: PayloadRequest): Promise<PublicAnalyticsChoice | null> {
  const row = await readPublishedPublication(payload, req);
  return row && row._status === "published" ? choiceOf(row) : null;
}

/**
 * Publishes a measurement choice through the public-revision path: the PUBLISHED Publication row
 * is changed, the public revision advances and the snapshot is queued, all in one transaction.
 * It never publishes other pending Publication edits (a draft) and a stale draft can never
 * re-enable a tag, because ordinary publishes keep the published analytics (see the Publication
 * Global's beforeChange hook). Returns whether anything public changed.
 */
export async function publishAnalyticsChoice(req: PayloadRequest, choice: PublicAnalyticsChoice): Promise<{ changed: boolean; revision: number | null }> {
  const { payload } = req;
  const started = await initTransaction(req);
  try {
    const row = (await payload.db.findGlobal({ slug: PUBLICATION_GLOBAL, req })) as Record<string, unknown> | null;
    if (!row || row._status !== "published") {
      // The Publication has never been published, so its first publish is this one (defaults + analytics).
      // A pending draft would be published with it; refuse rather than do that silently.
      const draft = await payload.findGlobal({ slug: PUBLICATION_GLOBAL, draft: true, depth: 0, overrideAccess: true, req });
      if (draft._status === "draft" && draft.updatedAt) throw new APIError("The Publication has unpublished changes. Publish or discard them in Site → Publication first.", 409);
      req.context ??= {};
      req.context.bylineAnalyticsPublish = true;
      await payload.updateGlobal({ slug: PUBLICATION_GLOBAL, draft: false, data: { [ANALYTICS_GROUP]: choice, _status: "published" } as never, overrideAccess: true, req });
      if (started) await commitTransaction(req);
      return { changed: true, revision: null };
    }
    const before = stableDigest(publicationGlobalSlice(row, req));
    await payload.db.updateGlobal({ slug: PUBLICATION_GLOBAL, data: { [ANALYTICS_GROUP]: choice } as never, req });
    const after = (await payload.db.findGlobal({ slug: PUBLICATION_GLOBAL, req })) as Record<string, unknown>;
    const changed = before !== stableDigest(publicationGlobalSlice(after, req));
    const revision = changed ? await recordPublicMutation(req, "global publication analytics") : null;
    if (started) await commitTransaction(req);
    return { changed, revision };
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}
