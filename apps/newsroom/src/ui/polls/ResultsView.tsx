"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Label } from "@byline/newsroom-ui/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { useQuery } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import { useMemo, useState } from "react";
import type { Breakdown, FieldworkRow, QuestionResult } from "../../polls/engine/results";
import { useNewsroomRoutes } from "../shell/account";
import { exportHref, fetchResults, formatWhen, pollKeys, type SurveyResultsView } from "./api";
import { ListSkeleton } from "./PollStudio";

/**
 * Results (docs/wildcat-polls.md#results). Each percentage names its base:
 * the respondents who answered that question. Skipped, unanswered and not
 * applicable are reported beside it, never folded in. Breakdown groups and
 * fieldwork rates below the poll's minimum group are withheld.
 */

type Filters = { from: string; to: string; location: string; session: string; version: string; mode: string };
const EMPTY: Filters = { from: "", to: "", location: "", session: "", version: "", mode: "" };

function query(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
  for (const key of ["location", "session", "version", "mode"] as const) if (filters[key]) params.set(key, filters[key]);
  return params.toString();
}

const pct = (value: number | null) => (value === null ? "—" : `${Number.isInteger(value) ? value : value.toFixed(1)}%`);

export function ResultsView({ id }: { id: number }) {
  const { api } = useNewsroomRoutes();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const search = useMemo(() => query(filters), [filters]);
  const results = useQuery({ queryKey: pollKeys.results(id, search), queryFn: () => fetchResults(api, id, search), placeholderData: (previous) => previous });
  const data = results.data;
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  if (results.isError) return <InlineAlert title="Results aren't available" onAction={() => void results.refetch()}>{(results.error as Error).message}</InlineAlert>;
  if (!data) return <ListSkeleton />;
  const total = data.fieldwork.total;
  return (
    <div className="flex flex-col gap-8" data-polls-results="">
      <div className="flex flex-wrap items-end gap-3 border-b pb-4" role="group" aria-label="Filter results">
        <FilterField label="From"><Input type="date" value={filters.from} onChange={(event) => set({ from: event.target.value })} className="w-40" /></FilterField>
        <FilterField label="To"><Input type="date" value={filters.to} onChange={(event) => set({ to: event.target.value })} className="w-40" /></FilterField>
        <FilterField label="Location">
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={filters.location} onChange={(event) => set({ location: event.target.value })}>
            <option value="">All</option>{data.options.locations.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Session">
          <select className="h-10 max-w-64 rounded-md border bg-background px-2 text-sm" value={filters.session} onChange={(event) => set({ session: event.target.value })}>
            <option value="">All</option>{data.options.sessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
          </select>
        </FilterField>
        {data.versions.length > 1 ? (
          <FilterField label="Version">
            <select className="h-10 rounded-md border bg-background px-2 text-sm" value={filters.version} onChange={(event) => set({ version: event.target.value })}>
              <option value="">All (labels from v{data.version.number})</option>{data.versions.map((version) => <option key={version.id} value={version.id}>Version {version.number}</option>)}
            </select>
          </FilterField>
        ) : null}
        <FilterField label="Collected">
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={filters.mode} onChange={(event) => set({ mode: event.target.value })}>
            <option value="">Any way</option><option value="kiosk">In person</option><option value="public">Public link</option>
          </select>
        </FilterField>
        {search ? <Button type="button" variant="ghost" onClick={() => setFilters(EMPTY)}>Clear</Button> : null}
        <span className="flex-1" />
        <Button nativeButton={false} variant="outline" render={<a href={exportHref(api, id, "summary", search)} download />}><Download data-icon="inline-start" />Summary CSV</Button>
        <Button nativeButton={false} variant="outline" render={<a href={exportHref(api, id, "responses", search)} download />}><Download data-icon="inline-start" />Responses CSV</Button>
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <p className="font-(family-name:--poll-serif) text-[2.5rem] leading-none font-medium tabular-nums">{data.results.responses}<span className="ml-2 font-sans text-base font-normal text-muted-foreground">response{data.results.responses === 1 ? "" : "s"}</span></p>
          <p className="text-sm text-muted-foreground">
            {data.firstResponseAt ? `${formatWhen(data.firstResponseAt)} to ${formatWhen(data.lastResponseAt)}` : "No responses for these filters yet."}
            {data.modes.public ? ` · ${data.modes.kiosk} in person, ${data.modes.public} by public link` : ""}
          </p>
          {total.approached ? (
            <p className="text-sm">
              {total.approached} approached in person · {total.declined} declined · {total.abandoned} incomplete.
              {total.reliable ? ` ${pct(total.declineRate)} declined; ${pct(total.completionRate)} of those who started finished.` : ` Too few approaches (under ${data.survey.minimumGroup}) to give rates.`}
            </p>
          ) : null}
        </div>
        <aside className="flex flex-col gap-2 rounded-lg bg-muted/60 p-4 text-sm" aria-label="Methodology">
          <p className="flex items-center gap-2 font-semibold"><Info className="size-4" aria-hidden="true" />Methodology and limitations</p>
          {data.survey.methodology ? <p className="leading-relaxed whitespace-pre-line">{data.survey.methodology}</p> : <p className="text-muted-foreground">No methodology note yet. Add one in Settings before these results are reported.</p>}
          <p className="text-muted-foreground">Percentages are of the students who answered each question. Students chose whether to take part, so results describe respondents, not the whole school. Groups smaller than {data.survey.minimumGroup} are withheld.</p>
        </aside>
      </section>

      <section className="flex flex-col gap-10" aria-label="Questions">
        {data.results.questions.map((question) => <QuestionBlock key={question.name} question={question} />)}
      </section>

      {data.results.breakdowns.length ? (
        <section className="flex flex-col gap-6">
          <h2 className="font-(family-name:--poll-serif) text-2xl font-medium">Breakdowns</h2>
          {data.results.breakdowns.map((entry) => <BreakdownTable key={`${entry.by}-${entry.question}`} breakdown={entry} minimum={data.survey.minimumGroup} />)}
        </section>
      ) : null}

      {data.fieldwork.sessions.length ? <FieldworkTables data={data} /> : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

function BaseLine({ question }: { question: QuestionResult }) {
  const { base } = question;
  const parts = [`${base.answered} answered of ${base.shown} shown`];
  if (base.skipped) parts.push(`${base.skipped} skipped`);
  if (base.unanswered) parts.push(`${base.unanswered} left blank`);
  if (base.notApplicable) parts.push(`${base.notApplicable} not asked (didn't apply)`);
  return <p className="text-xs text-muted-foreground tabular-nums">{parts.join(" · ")}</p>;
}

function QuestionBlock({ question }: { question: QuestionResult }) {
  const [allTexts, setAllTexts] = useState(false);
  return (
    <article className="grid gap-3 border-t pt-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10" aria-labelledby={`result-${question.name}`}>
      <header className="flex flex-col gap-1.5">
        {question.section ? <p className="text-xs font-semibold tracking-[0.1em] text-(--poll-accent) uppercase">{question.section}</p> : null}
        <h3 id={`result-${question.name}`} className="font-(family-name:--poll-serif) text-xl leading-snug font-medium">{question.label}</h3>
        <BaseLine question={question} />
        {question.multiple ? <p className="text-xs text-muted-foreground">More than one answer allowed, so percentages add up to more than 100.</p> : null}
      </header>
      <div className="min-w-0">
        {question.choices ? <Bars rows={question.choices.map((choice) => ({ key: choice.name, label: choice.label, count: choice.count, percent: choice.percent }))} base={question.base.answered} />
          : question.numeric ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm tabular-nums">Average <strong>{question.numeric.mean ?? "—"}</strong> · median {question.numeric.median ?? "—"} · range {question.numeric.min ?? "—"}–{question.numeric.max ?? "—"}</p>
              {question.kind === "range" ? <Bars rows={question.numeric.distribution.map((entry) => ({ key: String(entry.value), label: String(entry.value), count: entry.count, percent: question.base.answered ? Math.round((entry.count / question.base.answered) * 1000) / 10 : null }))} base={question.base.answered} narrowLabels /> : null}
            </div>
          ) : question.texts ? (
            question.texts.length ? (
              <div className="flex flex-col gap-2">
                <ul className="flex flex-col divide-y rounded-lg border text-sm">
                  {(allTexts ? question.texts : question.texts.slice(0, 8)).map((entry) => <li key={entry.responseId} className="px-3 py-2.5 leading-relaxed whitespace-pre-line">{entry.text}</li>)}
                </ul>
                {question.texts.length > 8 ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAllTexts(!allTexts)}>{allTexts ? "Show fewer" : `Show all ${question.texts.length}`}</Button> : null}
                <p className="text-xs text-muted-foreground">Written answers are confidential. Check them for names before quoting anything.</p>
              </div>
            ) : <p className="text-sm text-muted-foreground">No written answers.</p>
          ) : null}
      </div>
    </article>
  );
}

/** One series of horizontal bars: label, a thin bar from a shared baseline, the value at its tip. */
function Bars({ rows, base, narrowLabels }: { rows: Array<{ key: string; label: string; count: number; percent: number | null }>; base: number; narrowLabels?: boolean }) {
  if (!base) return <p className="text-sm text-muted-foreground">No answers yet.</p>;
  return (
    <table className="w-full border-separate border-spacing-y-1.5 text-sm">
      <thead className="sr-only"><tr><th>Answer</th><th>Share</th><th>Count</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="group" title={`${row.label}: ${row.count} of ${base} (${pct(row.percent)})`}>
            <th scope="row" className={narrowLabels ? "w-10 pr-3 text-left font-normal tabular-nums" : "w-[40%] pr-3 text-left align-middle font-normal"}>{row.label}</th>
            <td className="align-middle">
              <div className="flex items-center gap-2">
                <div className="relative h-3 flex-1 rounded-r-[4px] bg-transparent">
                  <div className="absolute inset-y-0 left-0 w-px bg-border" aria-hidden="true" />
                  <div className="h-3 rounded-r-[4px] bg-(--poll-accent) transition-[width] duration-300 group-hover:opacity-85 motion-reduce:transition-none" style={{ width: `${Math.max(row.count ? 0.5 : 0, row.percent ?? 0)}%` }} />
                </div>
                <span className="w-14 text-right font-medium tabular-nums">{pct(row.percent)}</span>
              </div>
            </td>
            <td className="w-12 text-right text-muted-foreground tabular-nums">{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BreakdownTable({ breakdown, minimum }: { breakdown: Breakdown; minimum: number }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{breakdown.questionLabel} <span className="font-normal text-muted-foreground">by {breakdown.byLabel.replace(/\?$/, "").toLowerCase()}</span></h3>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Answered</TableHead>
              {breakdown.choices.map((choice) => <TableHead key={choice.name} className="text-right">{choice.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdown.groups.map((group) => (
              <TableRow key={group.name}>
                <TableCell className="font-medium">{group.label}</TableCell>
                {group.suppressed ? (
                  <TableCell colSpan={breakdown.choices.length + 1} className="text-right text-muted-foreground">Fewer than {minimum}: withheld</TableCell>
                ) : (
                  <>
                    <TableCell className="text-right tabular-nums">{group.base}</TableCell>
                    {breakdown.choices.map((choice) => <TableCell key={choice.name} className="text-right tabular-nums">{pct(group.cells[choice.name]?.percent ?? null)}</TableCell>)}
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FieldworkTables({ data }: { data: SurveyResultsView }) {
  const sets: Array<[string, FieldworkRow[]]> = [["By location", data.fieldwork.locations], ["By session", data.fieldwork.sessions], ["By collection method", data.fieldwork.methods]];
  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-(family-name:--poll-serif) text-2xl font-medium">Fieldwork</h2>
      {sets.map(([title, rows]) => rows.length ? (
        <div key={title} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-right">Approached</TableHead>
                  <TableHead className="text-right">Declined</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Incomplete</TableHead>
                  <TableHead className="text-right">Decline rate</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="max-w-72 truncate">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.approached}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.declined}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.completed}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.abandoned}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.reliable ? pct(row.declineRate) : <span className="text-muted-foreground">Too few</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.reliable ? pct(row.completionRate) : <span className="text-muted-foreground">Too few</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null)}
    </section>
  );
}
