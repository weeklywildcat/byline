"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { LiveCandidate, LiveDeskResponse, LivePostResult } from "../../newsroom/live-coverage";
import type { LiveMode } from "../../domain/live-coverage";
import { getJson, postJson } from "../story/api";

/**
 * The live desk's client calls, shared by Write and Field: one query for a Story's mode, coverage state,
 * permissions and timeline, and one place that changes coverage. Presentations differ; the domain and
 * the server's answers are the same (docs/live-coverage.md).
 */
export const liveKey = (storyId: number) => ["byline", "story-live", storyId] as const;
export const liveEndpoint = (storyId: number) => `/byline/stories/${storyId}/live`;

export function useLiveDesk(api: string, storyId: number, options: { enabled?: boolean; refetchMs?: number } = {}) {
  const enabled = Number.isSafeInteger(storyId) && storyId > 0 && options.enabled !== false;
  return useQuery({ queryKey: liveKey(storyId), queryFn: () => getJson<LiveDeskResponse>(api, liveEndpoint(storyId)), enabled, refetchInterval: options.refetchMs ?? 30_000 });
}

export function useLiveCandidates(api: string, storyId: number, enabled: boolean) {
  return useQuery({ queryKey: [...liveKey(storyId), "publishers"], queryFn: () => getJson<{ people: LiveCandidate[] }>(api, `${liveEndpoint(storyId)}/publishers`), enabled });
}

export type CoverageRequest =
  | { action: "setup"; publishers: number[]; start?: boolean }
  | { action: "start" }
  | { action: "end" }
  | { action: "mode"; mode: LiveMode }
  | { action: "publishers"; publishers: number[] };

/** Changes coverage on the server (editor-only there too) and refreshes every live view of this Story. */
export function useCoverageChange(api: string, storyId: number) {
  const queries = useQueryClient();
  const [busy, setBusy] = useState(false);
  const change = useCallback(async (request: CoverageRequest, success?: string): Promise<LiveDeskResponse | null> => {
    setBusy(true);
    try {
      const desk = await postJson<LiveDeskResponse>(api, `${liveEndpoint(storyId)}/coverage`, request);
      queries.setQueryData(liveKey(storyId), desk);
      void queries.invalidateQueries({ queryKey: ["byline", "field"] });
      void queries.invalidateQueries({ queryKey: ["story-versions", storyId] });
      if (success) toast.success(success);
      return desk;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Byline could not change live coverage.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [api, queries, storyId]);
  return { change, busy };
}

export type LiveDraft = { title: string; text: string; photo: LiveDeskResponse["updates"][number]["photo"]; pinned: boolean };
export const EMPTY_DRAFT: LiveDraft = { title: "", text: "", photo: null, pinned: false };

/** What Write says after a post, honestly: never "Published" for something readers cannot see. */
export function postedMessage(result: LivePostResult, intended: "publish" | "desk"): string {
  if (result.status === "posted") return "Published. Readers see it now.";
  if (intended === "publish") return `Sent to the live desk instead: ${reasonLine(result.reason)}.`;
  return "Sent to the live desk as a draft.";
}

export function reasonLine(reason: LivePostResult["reason"]): string {
  switch (reason) {
    case "coverage-ended": return "coverage has ended";
    case "coverage-not-started": return "coverage hasn't started";
    case "not-live-mode": return "the story isn't in Live mode";
    case "story-not-public": return "the story isn't published";
    case "permission-revoked": return "you can't publish live updates on this story";
    default: return "it needs an editor";
  }
}
