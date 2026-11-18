"use client";

import { DateButton } from "@byline/newsroom-ui/components/date-fields";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@byline/newsroom-ui/ui/chart";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@byline/newsroom-ui/ui/tooltip";
import { ArrowDownRight, ArrowUpRight, CircleAlert, Info, Minus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { AnalyticsProblem, Change, Meta, NamedCount, Section, SeriesPoint } from "../../analytics/model";
import { useNewsroomRoutes } from "../shell/account";
import { chartDay, describeChange, formatCount, rangeLabel, seriesSummary, updatedLabel } from "./format";

export const RANGE_OPTIONS = [
  { value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "28d", label: "28 days" }, { value: "90d", label: "90 days" }, { value: "custom", label: "Custom" }
] as const;

/** The shared date control: presets plus a custom range. */
export function RangeControl({ preset, start, end, today, onChange }: { preset: string; start: string; end: string; today: string; onChange: (next: { preset: string; start: string; end: string }) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Date range">
      <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Preset ranges" value={[preset]} onValueChange={(next: unknown[]) => { const value = next[0]; if (typeof value === "string") onChange({ preset: value, start: value === "custom" ? start || today : "", end: value === "custom" ? end || today : "" }); }} className="flex-wrap">
        {RANGE_OPTIONS.map((option) => <ToggleGroupItem key={option.value} value={option.value} aria-label={option.label}>{option.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <DateButton id="analytics-from" aria-label="From" value={start} clearable={false} onChange={(value) => onChange({ preset, start: value, end: end < value ? value : end })} className="w-36 justify-start font-normal" />
          <span aria-hidden="true" className="text-muted-foreground">–</span>
          <DateButton id="analytics-to" aria-label="To" value={end} clearable={false} onChange={(value) => onChange({ preset, start: start > value ? value : start, end: value })} className="w-36 justify-start font-normal" />
        </div>
      ) : null}
    </div>
  );
}

/** "May 3 – May 9, 2026 · Updated 2 min ago · Refresh". A range that includes today says it is still processing. */
export function UpdatedBar({ meta, onRefresh, refreshing, realtime = false }: { meta: Meta | null | undefined; onRefresh: () => void; refreshing: boolean; realtime?: boolean }) {
  const range = meta?.range;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {realtime ? <span>Realtime · last 30 minutes</span> : range ? <span>{rangeLabel(range)}</span> : null}
      {range?.includesToday ? (
        <Tooltip>
          <TooltipTrigger render={<button type="button" className="touch-hit inline-flex items-center gap-1 underline decoration-dotted underline-offset-2" />}>Today · processing<Info className="size-3.5" aria-hidden="true" /></TooltipTrigger>
          <TooltipContent>Today's numbers can keep changing while Google processes them.</TooltipContent>
        </Tooltip>
      ) : null}
      {meta ? <span aria-live="off">{updatedLabel(meta.fetchedAt)}</span> : null}
      <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} aria-label="Refresh Analytics"><RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden="true" />Refresh</Button>
    </div>
  );
}

export function ChangeBadge({ change, className }: { change: Change | null | undefined; className?: string }) {
  const view = describeChange(change);
  if (view.tone === "none") return null;
  const Icon = view.tone === "up" ? ArrowUpRight : view.tone === "down" ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", view.tone === "up" ? "text-emerald-700 dark:text-emerald-400" : view.tone === "down" ? "text-red-700 dark:text-red-400" : "text-muted-foreground", className)} aria-label={view.label}>
      <Icon className="size-3.5" aria-hidden="true" />{view.text}
    </span>
  );
}

export function StatCard({ label, value, change, hint }: { label: string; value: ReactNode; change?: Change | null; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader>
      <CardContent className="min-h-5 text-xs text-muted-foreground">{change ? <span className="inline-flex flex-wrap items-center gap-1"><ChangeBadge change={change} />{describeChange(change).tone !== "none" ? <span>vs previous period</span> : null}</span> : hint}</CardContent>
    </Card>
  );
}

/** A provider failure as words the newsroom can act on, never "Failed to load analytics." */
export function ProblemAlert({ problem, onRetry, compact = false }: { problem: AnalyticsProblem; onRetry?: () => void; compact?: boolean }) {
  const { admin } = useNewsroomRoutes();
  const setup = problem.code === "not-connected" || problem.code === "needs-reconnect" || problem.code === "property-unavailable" || problem.code === "not-configured" || problem.code === "api-disabled";
  return (
    <Alert variant={problem.retryable ? "default" : "destructive"} className={cn(compact && "text-sm")}>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{problem.title}</AlertTitle>
      <AlertDescription>{problem.detail}</AlertDescription>
      {setup ? <AlertAction><a href={`${admin}/site?tab=analytics`} className={buttonVariants({ variant: "outline", size: "xs" })}>Open Site → Analytics</a></AlertAction> : onRetry && problem.retryable ? <AlertAction><Button type="button" variant="outline" size="xs" onClick={onRetry}>Try again</Button></AlertAction> : null}
    </Alert>
  );
}

/** One card's body: a skeleton while the first answer loads, an inline problem if this report failed, else the content. */
export function Body<T>({ section, loading, onRetry, empty, children, rows = 4 }: { section: Section<T> | undefined; loading: boolean; onRetry?: () => void; empty?: (data: T) => string | null; children: (data: T) => ReactNode; rows?: number }) {
  if (!section) return loading ? <Skeletons rows={rows} /> : null;
  if (!section.ok) return <ProblemAlert problem={section.problem} onRetry={onRetry} compact />;
  const message = empty?.(section.data);
  return message ? <p className="py-6 text-center text-sm text-muted-foreground">{message}</p> : <>{children(section.data)}</>;
}

export function Skeletons({ rows = 4 }: { rows?: number }) {
  return <div className="grid gap-2" aria-busy="true" aria-label="Loading"><span className="sr-only">Loading</span>{Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-6 w-full" />)}</div>;
}

export function Panel({ title, description, children, className, action }: { title: string; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader><CardTitle>{title}</CardTitle>{description ? <CardDescription>{description}</CardDescription> : null}{action ? <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">{action}</div> : null}</CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Dark enough to read on a white card in both themes (the lightest chart tokens are for fills, not lines).
const seriesConfig = { views: { label: "Views", color: "var(--chart-5)" }, activeUsers: { label: "Active users", color: "var(--chart-2)" } } satisfies ChartConfig;

/** Views and active users by day. The two lines differ in dash pattern as well as color, and a text summary sits beside the chart. */
export function SeriesChart({ points, className }: { points: SeriesPoint[]; className?: string }) {
  const empty = points.every((point) => point.views === 0 && point.activeUsers === 0);
  if (!points.length || empty) return <p className="py-10 text-center text-sm text-muted-foreground">Google hasn't reported any readers for these days yet.</p>;
  return (
    <figure className="grid gap-2">
      <ChartContainer config={seriesConfig} className={cn("aspect-auto h-56 w-full", className)} role="img" aria-label={`Views and active users by day. ${seriesSummary(points)}`}>
        <LineChart accessibilityLayer data={points} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={chartDay} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tickFormatter={(value: number) => formatCount(value)} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(value) => chartDay(String(value))} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="views" type="monotone" stroke="var(--color-views)" strokeWidth={2} dot={points.length < 15} isAnimationActive={false} />
          <Line dataKey="activeUsers" type="monotone" stroke="var(--color-activeUsers)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">{seriesSummary(points)}</figcaption>
    </figure>
  );
}

/** Ranked values with the number always visible: nothing is only on hover. */
export function BarList({ items, format = formatCount, empty = "Nothing reported yet." }: { items: NamedCount[]; format?: (value: number) => string; empty?: string }) {
  if (!items.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item.name} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate">{item.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{format(item.value)} · {Math.round(item.share * 100)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
