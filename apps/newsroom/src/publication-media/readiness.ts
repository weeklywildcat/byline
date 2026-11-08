import { publicationManifestBlobs, publicationMediaReadiness, type PublicationNotReadyReason } from "@byline/content";
import { mediaIdOf } from "@byline/editor/fields";
import { collectMediaIds } from "@byline/editor/normalize";
import { mediaKind, mediaMetadataGaps, GAP_LABELS } from "@byline/newsroom-screens/media/media-library-model";
import type { Payload, PayloadRequest } from "payload";
import type { Media } from "../payload-types";
import { publicationStore, type PublicationStore } from "./blob-store";

/**
 * Whether a set of Media is publishable now, and why not. The single server
 * authority for publication media readiness: Story publishing calls it
 * (server-side, in the `stories` hook), and the Story header asks it through
 * `/api/byline/media/publication-readiness` to explain problems early.
 *
 * Semantic article readiness stays in `@byline/article-body`; this layer
 * knows Payload Media, preparation and the prepared store.
 */
export type PublicationMediaRole = "image" | "file";

export type MediaReadinessIssueCode = "missing" | "wrong-type" | "metadata" | PublicationNotReadyReason | "objects-missing";

export type MediaReadinessItem = {
  mediaId: number;
  filename: string | null;
  /** ready: publishable; preparing: will be, soon; blocked: needs someone to act. */
  state: "ready" | "preparing" | "blocked";
  issues: Array<{ code: MediaReadinessIssueCode; message: string }>;
  /** Retry is the fix (preparation failed or is out of date). */
  retryable: boolean;
};

export type PublicationMediaReport = { ready: boolean; preparing: number; blocked: number; items: MediaReadinessItem[] };

export type MediaRequirement = { id: number; role: PublicationMediaRole };

const PREPARATION_MESSAGES: Record<PublicationNotReadyReason, { message: string; state: MediaReadinessItem["state"]; retryable: boolean }> = {
  preparing: { message: "Publication files are still being prepared", state: "preparing", retryable: false },
  "not-prepared": { message: "Publication files haven't been prepared", state: "blocked", retryable: true },
  failed: { message: "Publication file preparation failed", state: "blocked", retryable: true },
  "stale-revision": { message: "Publication files are for an older version of this file", state: "blocked", retryable: true },
  "stale-recipe": { message: "Publication files need preparing again", state: "blocked", retryable: true },
  "invalid-manifest": { message: "Publication files are damaged and need preparing again", state: "blocked", retryable: true }
};

/** The Media a Story publishes directly: its lead image and every Media its byline-v1 body blocks reference. */
export function storyMediaRequirements(story: { featuredMedia?: unknown; body?: unknown; contentFormat?: unknown }): MediaRequirement[] {
  const requirements = new Map<number, MediaRequirement>();
  const featured = mediaIdOf(story.featuredMedia);
  if (featured !== null) requirements.set(Number(featured), { id: Number(featured), role: "image" });
  // Imported legacy-html bodies are not reverse-engineered here (Phase 8 migrates their media).
  if (story.contentFormat !== "legacy-html") {
    for (const id of collectMediaIds(story.body)) {
      const key = Number(id);
      if (Number.isSafeInteger(key) && key > 0 && !requirements.has(key)) requirements.set(key, { id: key, role: "file" });
    }
  }
  return [...requirements.values()].sort((a, b) => a.id - b.id);
}

/**
 * Checks every required asset: it exists, is the right kind, has the
 * metadata publication needs, its prepared generation is current (revision,
 * recipe, manifest: `publicationMediaReadiness`) and every prepared object is
 * in the store. Reads as the system: the answer must not depend on who asks.
 */
export async function publicationMediaReport(payload: Payload, requirements: MediaRequirement[], options: { req?: Partial<PayloadRequest>; store?: PublicationStore } = {}): Promise<PublicationMediaReport> {
  if (!requirements.length) return { ready: true, preparing: 0, blocked: 0, items: [] };
  const found = await payload.find({ collection: "media", where: { id: { in: requirements.map((item) => item.id) } }, depth: 0, pagination: false, overrideAccess: true, ...(options.req ? { req: options.req } : {}) });
  const byId = new Map((found.docs as Media[]).map((media) => [media.id, media]));
  const store = options.store ?? publicationStore();
  const items: MediaReadinessItem[] = [];
  for (const requirement of requirements) {
    const media = byId.get(requirement.id);
    if (!media) {
      items.push({ mediaId: requirement.id, filename: null, state: "blocked", issues: [{ code: "missing", message: "This file is no longer in Media" }], retryable: false });
      continue;
    }
    const issues: MediaReadinessItem["issues"] = [];
    let state: MediaReadinessItem["state"] = "ready";
    let retryable = false;
    const kind = mediaKind(media.mimeType);
    if (requirement.role === "image" ? kind !== "image" : kind === "other") {
      issues.push({ code: "wrong-type", message: requirement.role === "image" ? "The lead image must be a photo or graphic" : "This kind of file can't be published" });
      state = "blocked";
    }
    for (const gap of mediaMetadataGaps({ alt: media.alt ?? "", credit: media.credit ?? "", creator: media.creator ?? "", copyright: media.copyright ?? "", license: media.license ?? "", sourceUrl: media.sourceUrl ?? "", mimeType: media.mimeType })) {
      issues.push({ code: "metadata", message: GAP_LABELS[gap] });
      state = "blocked";
    }
    const readiness = publicationMediaReadiness(media.publicationAssets, media.publicationRevision);
    if (!readiness.ready) {
      const detail = PREPARATION_MESSAGES[readiness.reason];
      issues.push({ code: readiness.reason, message: readiness.reason === "failed" && media.publicationAssets?.failureMessage ? `${detail.message}: ${media.publicationAssets.failureMessage}` : detail.message });
      if (detail.state === "blocked") state = "blocked";
      else if (state === "ready") state = "preparing";
      retryable = detail.retryable;
    } else {
      for (const blob of publicationManifestBlobs(readiness.manifest)) {
        if (!(await store.has(blob.sha256, blob.bytes))) {
          issues.push({ code: "objects-missing", message: "Prepared publication files are missing from storage" });
          state = "blocked";
          retryable = true;
          break;
        }
      }
    }
    items.push({ mediaId: media.id, filename: media.filename ?? null, state, issues, retryable });
  }
  const blocked = items.filter((item) => item.state === "blocked").length;
  const preparing = items.filter((item) => item.state === "preparing").length;
  return { ready: blocked === 0 && preparing === 0, preparing, blocked, items };
}

/** One line per problem, e.g. "marching-band.jpg · Publication file preparation failed". */
export function readinessMessages(report: PublicationMediaReport): string[] {
  return report.items.filter((item) => item.state !== "ready").flatMap((item) => item.issues.map((issue) => `${item.filename ?? `Media ${item.mediaId}`} · ${issue.message}`));
}
