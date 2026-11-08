"use client";

import { DEFAULT_MEDIA_ROUTE } from "@byline/newsroom-screens/media/media-library-model";
import { Button } from "@byline/newsroom-ui/ui/button";
import { useFormFields } from "@payloadcms/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RotateCw } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { createBylineRequest } from "../home/payload-fetchers";
import { useMediaWorkspace } from "../media/MediaWorkspaceShell";
import { useNewsroomRoutes } from "../shell/account";
import { blockingLines, preparingLabel, storyMediaReadinessQuery, type StoryMediaReadiness } from "./publication-readiness-model";

/** Re-read while anything is preparing; stops once every asset is ready or blocked. */
const PREPARING_REFRESH_MS = 5000;

const readinessKey = (query: string) => ["byline", "story-media-readiness", query] as const;

/**
 * The publication readiness of the Media this Story's form references, from
 * the same server rule Publish enforces. Queried only when the set of Media
 * changes, or when a story-specific alt override crosses empty/non-empty.
 * Ordinary text typing leaves the query stable. It is polled modestly while
 * something prepares, and re-checked right before Publish.
 */
export function useStoryMediaReadiness(enabled: boolean) {
  const { api } = useNewsroomRoutes();
  const query = useFormFields(([fields]) => storyMediaReadinessQuery({ featuredMedia: fields.featuredMedia?.value, body: fields.body?.value, contentFormat: fields.contentFormat?.value }));
  const client = useQueryClient();
  const request = useCallback(() => createBylineRequest(api)<StoryMediaReadiness>(`/media/publication-readiness?${query}`), [api, query]);
  const result = useQuery({
    queryKey: readinessKey(query),
    queryFn: request,
    enabled: enabled && query !== "",
    staleTime: 15_000,
    refetchInterval: (state) => (state.state.data?.preparing ? PREPARING_REFRESH_MS : false)
  });
  /** A fresh answer straight from the server (before Publish, after a refused Publish). */
  const check = useCallback(async () => {
    if (query === "") return { ready: true, preparing: 0, blocked: 0, items: [] } satisfies StoryMediaReadiness;
    const fresh = await request();
    client.setQueryData(readinessKey(query), fresh);
    return fresh;
  }, [client, query, request]);
  return { report: query === "" ? undefined : result.data, check, refresh: () => void result.refetch() };
}

/** The Publish area's Media line: preparing progress or what blocks publication, with a way to fix it. */
export function StoryMediaReadinessNotice({ report, onChanged }: { report: StoryMediaReadiness | undefined; onChanged: () => void }) {
  const { href, fetchers } = useMediaWorkspace();
  const [retrying, setRetrying] = useState<number | null>(null);
  const preparing = preparingLabel(report);
  const blocked = blockingLines(report);
  if (!preparing && !blocked.length) return null;
  const retry = async (id: number) => {
    if (!fetchers.retryPublication) return;
    setRetrying(id);
    try {
      await fetchers.retryPublication(id);
      toast.success("Preparing the file again");
      onChanged();
    } catch (error) {
      toast.error((error as { message?: string })?.message || "Byline couldn't retry that file.");
    } finally {
      setRetrying(null);
    }
  };
  return (
    <div className="flex flex-col gap-1 text-sm" role="status" aria-live="polite" data-story-media-readiness="">
      {preparing ? <p className="flex items-center gap-1.5 text-muted-foreground" data-story-media-preparing=""><RotateCw className="size-3.5 animate-spin" aria-hidden="true" />{preparing}</p> : null}
      {blocked.map(({ item, text }) => (
        <p key={item.mediaId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-destructive" data-story-media-blocked={item.mediaId}>
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
          <a className="text-xs underline underline-offset-2" href={href({ ...DEFAULT_MEDIA_ROUTE, assetId: item.mediaId })} target="_blank" rel="noreferrer">Open in Media</a>
          {item.retryable && fetchers.retryPublication ? (
            <Button type="button" variant="outline" size="xs" disabled={retrying === item.mediaId} onClick={() => void retry(item.mediaId)}>Retry</Button>
          ) : null}
        </p>
      ))}
    </div>
  );
}
