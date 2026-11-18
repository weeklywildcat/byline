"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import type { AcquisitionDto, AudienceDto, EventsDto } from "../../analytics/model";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";
import { useReport } from "./api";
import { formatCount, formatPercent } from "./format";
import { BarList, Body, Panel, ProblemAlert, StatCard, UpdatedBar } from "./parts";
import { ChannelList } from "./OverviewScreen";

/** Each screen's reports fail on their own: one broken card never blanks the page. */
function useScreen<T>(kind: string, search: string) {
  const report = useReport<T>(kind, search);
  return { report, data: report.data?.data ?? null, loading: report.isPending, retry: () => void report.refresh() };
}

export function AcquisitionScreen({ search }: { search: string }) {
  const { story } = useNewsroomRoutes();
  const { report, data, loading, retry } = useScreen<AcquisitionDto>("acquisition", search);
  if (report.data?.problem) return <ProblemAlert problem={report.data.problem} onRetry={retry} />;
  return (
    <div className="grid gap-4" aria-busy={loading || report.isFetching}>
      <UpdatedBar meta={data?.meta} onRefresh={retry} refreshing={report.refreshing} />
      <Panel title="Channels" description="How did readers get here?">
        <Body section={data?.channels} loading={loading} onRetry={retry} empty={(rows) => (rows.length ? null : "No sessions in this range.")}>
          {(rows) => (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Active users</TableHead><TableHead className="text-right">Engaged sessions</TableHead><TableHead className="text-right">Engagement rate</TableHead></TableRow></TableHeader>
                  <TableBody>{rows.map((row) => <TableRow key={row.channel}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{formatCount(row.sessions)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(row.activeUsers)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(row.engagedSessions)}</TableCell><TableCell className="text-right tabular-nums">{formatPercent(row.engagementRate)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
              <div className="md:hidden"><ChannelList rows={rows} /></div>
            </>
          )}
        </Body>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Source / medium" description="Where sessions started.">
          <Body section={data?.sources} loading={loading} onRetry={retry} empty={(rows) => (rows.length ? null : "No sources reported.")}>
            {(rows) => <ul className="grid gap-2 text-sm">{rows.slice(0, 15).map((row) => <li key={row.source} className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate">{row.source}</span><span className="shrink-0 tabular-nums text-muted-foreground">{formatCount(row.sessions)} sessions</span></li>)}</ul>}
          </Body>
        </Panel>
        <Panel title="Landing content" description="Where readers started their visit, matched to Stories.">
          <Body section={data?.landing} loading={loading} onRetry={retry} empty={(rows) => (rows.length ? null : "No landing pages reported.")}>
            {(rows) => (
              <ul className="grid gap-3 text-sm">
                {rows.slice(0, 12).map((row) => (
                  <li key={`${row.path}|${row.source}`} className="grid gap-0.5">
                    {row.story ? <ShellLink href={`${story(row.story.id)}?view=performance`} className="font-medium hover:underline">{row.story.title}</ShellLink> : <span className="font-medium">{row.title}</span>}
                    <span className="text-xs text-muted-foreground">{row.source} · {formatCount(row.sessions)} sessions · {formatPercent(row.engagementRate)} engaged</span>
                  </li>
                ))}
              </ul>
            )}
          </Body>
        </Panel>
      </div>
    </div>
  );
}

export function AudienceScreen({ search }: { search: string }) {
  const { report, data, loading, retry } = useScreen<AudienceDto>("audience", search);
  if (report.data?.problem) return <ProblemAlert problem={report.data.problem} onRetry={retry} />;
  const readers = data?.readers;
  return (
    <div className="grid gap-4" aria-busy={loading || report.isFetching}>
      <UpdatedBar meta={data?.meta} onRefresh={retry} refreshing={report.refreshing} />
      {readers && !readers.ok ? <ProblemAlert problem={readers.problem} onRetry={retry} compact /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Active users" value={readers?.ok ? formatCount(readers.data.activeUsers) : "…"} />
          <StatCard label="New users" value={readers?.ok ? formatCount(readers.data.newUsers) : "…"} />
          <StatCard label="Returning users" value={readers?.ok ? (readers.data.returningUsers === null ? "—" : formatCount(readers.data.returningUsers)) : "…"} hint="Google doesn't always report this" />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {([["Devices", data?.devices], ["Browsers", data?.browsers], ["Operating systems", data?.systems], ["Countries", data?.countries], ["Regions", data?.regions]] as const).map(([title, section]) => (
          <Panel key={title} title={title}><Body section={section} loading={loading} onRetry={retry} empty={(items) => (items.length ? null : "Nothing reported yet.")}>{(items) => <BarList items={items} />}</Body></Panel>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Byline shows device, browser and place, not advertising demographics or exact cities.</p>
    </div>
  );
}

export function EventsScreen({ search }: { search: string }) {
  const { report, data, loading, retry } = useScreen<EventsDto>("events", search);
  if (report.data?.problem) return <ProblemAlert problem={report.data.problem} onRetry={retry} />;
  return (
    <div className="grid gap-4" aria-busy={loading || report.isFetching}>
      <UpdatedBar meta={data?.meta} onRefresh={retry} refreshing={report.refreshing} />
      <Panel title="Events" description="What readers did, counted by Google.">
        <Body section={data?.events} loading={loading} onRetry={retry} empty={(rows) => (rows.length ? null : "No events in this range.")} rows={6}>
          {(rows) => (
            <Table>
              <TableHeader><TableRow><TableHead>Event</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Users</TableHead><TableHead className="hidden text-right sm:table-cell">Key events</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((row) => <TableRow key={row.name}><TableCell className="font-medium">{row.label}{row.label !== row.name ? <span className="ml-2 text-xs font-normal text-muted-foreground">{row.name}</span> : null}</TableCell><TableCell className="text-right tabular-nums">{formatCount(row.count)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(row.users)}</TableCell><TableCell className="hidden text-right tabular-nums sm:table-cell">{row.keyEvents ? formatCount(row.keyEvents) : "—"}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </Body>
      </Panel>
    </div>
  );
}
