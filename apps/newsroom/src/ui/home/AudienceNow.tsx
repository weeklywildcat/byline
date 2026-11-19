"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { HomeAudienceDto } from "../../analytics/model";
import { analyticsKeys } from "../analytics/api";
import { formatCount } from "../analytics/format";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";
import { getJson } from "../story/api";

/**
 * Home's one Analytics module, for editors: who is reading right now and what. It shares the
 * Realtime report's server cache. If Analytics isn't connected or healthy it renders nothing: setup
 * problems belong in Site → Analytics, not on Home.
 */
export function AudienceNow() {
  const { api, admin, story } = useNewsroomRoutes();
  const { data } = useQuery({
    queryKey: analyticsKeys.report("home", ""),
    queryFn: () => getJson<{ data: HomeAudienceDto | null }>(api, "/byline/analytics/home"),
    retry: false, staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false
  });
  const audience = data?.data;
  if (!audience) return null;
  return (
    <AdminRoot toaster={false}>
      <section aria-label="Audience right now" className="mx-auto w-full max-w-[1440px] px-4 pt-4 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-medium">Audience right now</h2>
            <p><span className="text-xl font-semibold tabular-nums">{formatCount(audience.activeUsers)}</span> <span className="text-muted-foreground">{audience.activeUsers === 1 ? "reader" : "readers"} · last {audience.windowMinutes} minutes</span></p>
            {audience.top ? <p className="min-w-0 text-muted-foreground">Top: {audience.top.story ? <ShellLink href={`${story(audience.top.story.id)}?view=performance`} className="font-medium text-foreground hover:underline">{audience.top.title}</ShellLink> : <span className="text-foreground">{audience.top.title}</span>}</p> : null}
          </div>
          <ShellLink href={`${admin}/analytics?tab=realtime`} className="touch-hit inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">Open Analytics<ArrowRight className="size-4" aria-hidden="true" /></ShellLink>
        </div>
      </section>
    </AdminRoot>
  );
}
