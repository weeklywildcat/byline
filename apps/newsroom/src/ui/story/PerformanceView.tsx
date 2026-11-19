"use client";

import { buttonVariants } from "@byline/newsroom-ui/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { TooltipProvider } from "@byline/newsroom-ui/ui/tooltip";
import { ArrowRight, ChartColumn } from "lucide-react";
import { useState } from "react";
import type { StoryPerformanceDto } from "../../analytics/model";
import { useReport, type Envelope } from "../analytics/api";
import { formatCount, formatDuration, formatPercent } from "../analytics/format";
import { BarList, Body, Panel, ProblemAlert, SeriesChart, Skeletons, StatCard, UpdatedBar } from "../analytics/parts";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";

type Response = Envelope<StoryPerformanceDto> & { published?: boolean };
const RANGES = [["since", "Since publication"], ["7d", "7 days"], ["28d", "28 days"], ["90d", "90 days"]] as const;

/**
 * A published Story's audience, joined to the Story by Byline (never by guesswork): Google's views and
 * readers for this Story's Byline ID, its address and any older address that redirects to it. Access
 * follows the Story: whoever can open it can see this; the publication-wide desk is separate.
 */
export function PerformanceView({ storyId }: { storyId: number }) {
  const { admin } = useNewsroomRoutes();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("since");
  const report = useReport<StoryPerformanceDto>(`story-${storyId}`, `preset=${range}`, { path: `/byline/stories/${storyId}/analytics` });
  const response = report.data as Response | undefined;
  const data = response?.data ?? null;
  const loading = report.isPending;
  const retry = () => void report.refresh();
  if (loading) return <Skeletons rows={6} />;
  if (response?.published === false) return <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground" role="status">Performance starts after this Story is published.</p>;
  if (response?.problem) return <ProblemAlert problem={response.problem} onRetry={retry} />;
  if (!data) return <ProblemAlert problem={{ code: "unavailable", title: "Google Analytics is temporarily unavailable", detail: "Try again in a moment.", retryable: true }} onRetry={retry} />;
  const totals = data.totals.ok ? data.totals.data : null;
  const analyticsHref = `${admin}/analytics?tab=content&story=${storyId}`;
  return (
    <TooltipProvider>
      <div className="grid gap-4" aria-busy={report.isFetching}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Date range" className="flex-wrap" value={[range]} onValueChange={(next: unknown[]) => { const value = next[0]; if (RANGES.some(([key]) => key === value)) setRange(value as typeof range); }}>
            {RANGES.map(([key, label]) => <ToggleGroupItem key={key} value={key}>{label}</ToggleGroupItem>)}
          </ToggleGroup>
          <ShellLink href={analyticsHref} className={buttonVariants({ variant: "outline", size: "sm" })}>View in Analytics<ArrowRight data-icon="inline-end" aria-hidden="true" /></ShellLink>
        </div>
        <UpdatedBar meta={data.meta} onRefresh={retry} refreshing={report.refreshing} />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Panel title="Reading now" description="Last 30 minutes" className="sm:col-span-3 lg:col-span-1">
            <Body section={data.readingNow} loading={false} onRetry={retry}>{({ readers }) => <p className="text-4xl font-semibold tabular-nums" role="status" aria-live="off">{formatCount(readers)}<span className="ml-2 text-base font-normal text-muted-foreground">{readers === 1 ? "reader" : "readers"}</span></p>}</Body>
          </Panel>
          <div className="grid grid-cols-2 gap-3 sm:col-span-3 lg:grid-cols-4">
            <StatCard label="Views" value={totals ? formatCount(totals.views) : "—"} />
            <StatCard label="Active users" value={totals ? formatCount(totals.activeUsers) : "—"} />
            <StatCard label="Avg engagement" value={totals ? formatDuration(totals.engagement) : "—"} hint="Time per active user" />
            {totals?.scrolled ? <StatCard label="Reached 90%" value={formatCount(totals.scrolled)} /> : null}
          </div>
        </div>
        {!data.totals.ok ? <ProblemAlert problem={data.totals.problem} onRetry={retry} compact /> : null}
        {data.empty ? (
          <div className="grid justify-items-center gap-2 rounded-lg border bg-card p-8 text-center" role="status">
            <ChartColumn className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">This Story has no Analytics data yet</p>
            <p className="max-w-md text-sm text-muted-foreground">Google reports a day's readers a few hours after it ends. Check back soon, or look at Reading now above.</p>
          </div>
        ) : (
          <>
            <Panel title={range === "since" ? "Since publication" : "Over time"} description="Views and active users each day.">
              <Body section={data.series} loading={false} onRetry={retry}>{(points) => <SeriesChart points={points} />}</Body>
            </Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="How readers found this Story"><Body section={data.channels} loading={false} onRetry={retry} empty={(items) => (items.length ? null : "No arrivals reported yet.")}>{(items) => <BarList items={items} format={(value) => `${formatCount(value)} views`} />}</Body></Panel>
              <Panel title="Referrers" description="Other sites that sent readers.">
                <Body section={data.referrers} loading={false} onRetry={retry} empty={(items) => (items.length ? null : "No outside sites yet.")}>
                  {(items) => <ul className="grid gap-1.5 text-sm">{items.map((item) => <li key={item.referrer} className="flex justify-between gap-3"><span className="min-w-0 truncate">{item.referrer}</span><span className="tabular-nums text-muted-foreground">{formatCount(item.views)}</span></li>)}</ul>}
                </Body>
              </Panel>
              <Panel title="Devices"><Body section={data.devices} loading={false} onRetry={retry}>{(items) => <BarList items={items} />}</Body></Panel>
              {data.reading.ok && data.reading.data ? (
                <Panel title="Reading" description="Readers who got this far.">
                  <ol className="grid gap-2" aria-label="Reading progress">
                    {(() => {
                      const steps = data.reading.data;
                      const base = Math.max(1, steps[0]?.users ?? 1, ...steps.map((step) => step.users));
                      return steps.map((step) => (
                        <li key={step.percent} className="grid gap-1">
                          <div className="flex justify-between text-sm"><span>Read {step.percent === 100 ? "to the end" : `${step.percent}%`}</span><span className="tabular-nums text-muted-foreground">{formatCount(step.users)} · {formatPercent(step.users / base)}</span></div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (step.users / base) * 100)}%` }} /></div>
                        </li>
                      ));
                    })()}
                  </ol>
                </Panel>
              ) : null}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
