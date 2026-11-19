"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@byline/newsroom-ui/ui/chart";
import type { RealtimeDto } from "../../analytics/model";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";
import { useReport } from "./api";
import { formatCount } from "./format";
import { BarList, Panel, ProblemAlert, Skeletons, UpdatedBar } from "./parts";

const config = { activeUsers: { label: "Active users", color: "var(--chart-3)" } } satisfies ChartConfig;

/**
 * Readers right now: Google's Realtime window (the last 30 minutes). Realtime has no sources and
 * no page paths, so this screen shows none; a current page is named by its title, and only becomes
 * a Story when exactly one published Story has that title.
 */
export function RealtimeScreen() {
  const { story } = useNewsroomRoutes();
  const report = useReport<RealtimeDto>("realtime", "", { poll: 30_000 });
  const data = report.data?.data ?? null;
  if (report.data?.problem) return <ProblemAlert problem={report.data.problem} onRetry={() => void report.refresh()} />;
  if (!data) return <Skeletons rows={6} />;
  const points = [...data.activity].reverse().map((point) => ({ label: point.minutesAgo === 0 ? "now" : `${point.minutesAgo}m`, minutesAgo: point.minutesAgo, activeUsers: point.activeUsers }));
  return (
    <div className="grid gap-4" aria-busy={report.isFetching && !report.isPending}>
      <UpdatedBar meta={data.meta} onRefresh={() => void report.refresh()} refreshing={report.refreshing} realtime />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Readers right now" description={`Last ${data.windowMinutes} minutes`} className="lg:col-span-1">
          <p className="text-5xl font-semibold tabular-nums" role="status" aria-live="off">{formatCount(data.activeUsers)}</p>
          <p className="mt-1 text-sm text-muted-foreground">active {data.activeUsers === 1 ? "reader" : "readers"} · Last {data.windowMinutes} minutes</p>
        </Panel>
        <Panel title="Activity" description="Active readers, minute by minute." className="lg:col-span-2">
          <figure className="grid gap-2">
            <ChartContainer config={config} className="aspect-auto h-36 w-full" role="img" aria-label={`Active readers per minute over the last ${data.windowMinutes} minutes. Now: ${formatCount(data.activity[0]?.activeUsers ?? 0)}.`}>
              <BarChart accessibilityLayer data={points} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Bar dataKey="activeUsers" fill="var(--color-activeUsers)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
            <figcaption className="text-xs text-muted-foreground">Left is {data.windowMinutes} minutes ago; right is now.</figcaption>
          </figure>
        </Panel>
      </div>
      <Panel title="Current pages" description="By page title. Google's Realtime report has no page paths.">
        {data.pages.length ? (
          <ul className="grid gap-2">
            {data.pages.slice(0, 10).map((page) => (
              <li key={page.title} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">{page.story ? <ShellLink href={`${story(page.story.id)}?view=performance`} className="font-medium hover:underline">{page.story.title}</ShellLink> : <span>{page.title}</span>}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatCount(page.activeUsers)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="py-4 text-center text-sm text-muted-foreground">No pages are being read right now.</p>}
      </Panel>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Countries"><BarList items={data.countries} /></Panel>
        <Panel title="Devices"><BarList items={data.devices} /></Panel>
        <Panel title="Recent events" description="Counts in the last 30 minutes.">
          {data.events.length ? <ul className="grid gap-1.5 text-sm">{data.events.map((event) => <li key={event.name} className="flex justify-between gap-3"><span className="truncate">{event.label}</span><span className="tabular-nums text-muted-foreground">{formatCount(event.count)}</span></li>)}</ul> : <p className="py-4 text-center text-sm text-muted-foreground">No events yet.</p>}
        </Panel>
      </div>
    </div>
  );
}
