"use client";

import type { ChannelRow, OverviewDto } from "../../analytics/model";
import { useReport } from "./api";
import { formatCount, formatDuration } from "./format";
import { BarList, Body, Panel, ProblemAlert, SeriesChart, Skeletons, StatCard, UpdatedBar } from "./parts";
import { StoryTable } from "./StoryTable";

export function ChannelList({ rows }: { rows: ChannelRow[] }) {
  return <BarList items={rows.map((row, _, all) => ({ name: row.label, value: row.sessions, share: row.sessions / Math.max(1, all.reduce((sum, item) => sum + item.sessions, 0)) }))} format={(value) => `${formatCount(value)} sessions`} />;
}

export function OverviewScreen({ search }: { search: string }) {
  const report = useReport<OverviewDto>("overview", search);
  const data = report.data?.data ?? null;
  const loading = report.isPending;
  if (report.data?.problem) return <ProblemAlert problem={report.data.problem} onRetry={() => void report.refresh()} />;
  const totals = data?.totals;
  return (
    <div className="grid gap-4" aria-busy={loading || report.isFetching}>
      <UpdatedBar meta={data?.meta} onRefresh={() => void report.refresh()} refreshing={report.refreshing} />
      {totals && !totals.ok ? <ProblemAlert problem={totals.problem} onRetry={() => void report.refresh()} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Views" value={totals?.ok ? formatCount(totals.data.views.current) : "…"} change={totals?.ok ? totals.data.views : null} />
          <StatCard label="Active users" value={totals?.ok ? formatCount(totals.data.activeUsers.current) : "…"} change={totals?.ok ? totals.data.activeUsers : null} />
          <StatCard label="Sessions" value={totals?.ok ? formatCount(totals.data.sessions.current) : "…"} change={totals?.ok ? totals.data.sessions : null} />
          <StatCard label="Average engagement" value={totals?.ok ? formatDuration(totals.data.engagement.current) : "…"} change={totals?.ok ? totals.data.engagement : null} hint="Time per active user" />
        </div>
      )}
      <Panel title="Traffic over time" description="Views and active users each day.">
        <Body section={data?.series} loading={loading} onRetry={() => void report.refresh()} rows={6}>{(points) => <SeriesChart points={points} />}</Body>
      </Panel>
      <Panel title="Top Stories" description="Open a Story to see how it is doing.">
        <Body section={data?.topStories} loading={loading} onRetry={() => void report.refresh()} rows={5}>{(rows) => <StoryTable rows={rows} />}</Body>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="How readers arrived" description="Where sessions came from.">
          <Body section={data?.channels} loading={loading} onRetry={() => void report.refresh()} empty={(rows) => (rows.length ? null : "No sessions in this range.")}>{(rows) => <ChannelList rows={rows} />}</Body>
        </Panel>
        <Panel title="Devices" description="What readers used.">
          <Body section={data?.devices} loading={loading} onRetry={() => void report.refresh()}>{(items) => <BarList items={items} />}</Body>
        </Panel>
      </div>
      {loading && !data ? <Skeletons rows={2} /> : null}
    </div>
  );
}

