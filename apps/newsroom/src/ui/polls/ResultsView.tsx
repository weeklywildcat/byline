"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card } from "@byline/newsroom-ui/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Item, ItemGroup } from "@byline/newsroom-ui/ui/item";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { DateButton } from "@byline/newsroom-ui/components/date-fields";
import { Field, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Download, Info } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { Breakdown, FieldworkRow, QuestionResult } from "../../polls/engine/results";
import { useNewsroomRoutes } from "../shell/account";
import { exportHref, fetchResults, formatWhen, pollKeys, type SurveyResultsView } from "./api";
import { PollSelect } from "./fields";
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
  const [view, setView] = useState("questions");

  if (results.isError) return <InlineAlert title="Results aren't available" onAction={() => void results.refetch()}>{(results.error as Error).message}</InlineAlert>;
  if (!data) return <ListSkeleton />;
  const total = data.fieldwork.total;
  const views = [
    { value: "questions", label: "Questions", show: true },
    { value: "breakdowns", label: "Breakdowns", show: data.results.breakdowns.length > 0 },
    { value: "fieldwork", label: "Fieldwork", show: data.fieldwork.sessions.length > 0 }
  ].filter((entry) => entry.show);
  return (
    <div className="flex flex-col gap-6" data-polls-results="">
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter results">
        <FilterField label="From" id="results-from"><DateButton id="results-from" value={filters.from} onChange={(from) => set({ from })} className="w-36 justify-start font-normal" /></FilterField>
        <FilterField label="To" id="results-to"><DateButton id="results-to" value={filters.to} onChange={(to) => set({ to })} className="w-36 justify-start font-normal" /></FilterField>
        <FilterField label="Location" id="results-location">
          <PollSelect id="results-location" className="w-40" value={filters.location} emptyLabel="All" options={data.options.locations.map((name) => ({ value: name, label: name }))} onChange={(location) => set({ location })} />
        </FilterField>
        <FilterField label="Session" id="results-session">
          <PollSelect id="results-session" className="w-56" value={filters.session} emptyLabel="All" options={data.options.sessions.map((session) => ({ value: session.id, label: session.label }))} onChange={(session) => set({ session })} />
        </FilterField>
        {data.versions.length > 1 ? (
          <FilterField label="Version" id="results-version">
            <PollSelect id="results-version" className="w-48" value={filters.version} emptyLabel={`All (labels from v${data.version.number})`} options={data.versions.map((version) => ({ value: String(version.id), label: `Version ${version.number}` }))} onChange={(version) => set({ version })} />
          </FilterField>
        ) : null}
        <FilterField label="Collected" id="results-mode">
          <PollSelect id="results-mode" className="w-36" value={filters.mode} emptyLabel="Any way" options={[{ value: "kiosk", label: "In person" }, { value: "public", label: "Public link" }]} onChange={(mode) => set({ mode })} />
        </FilterField>
        {search ? <Button type="button" variant="ghost" onClick={() => setFilters(EMPTY)}>Clear</Button> : null}
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" />}><Download data-icon="inline-start" />Export<ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>CSV, with these filters</DropdownMenuLabel>
              <DropdownMenuItem render={<a href={exportHref(api, id, "summary", search)} download />}>Summary CSV</DropdownMenuItem>
              <DropdownMenuItem render={<a href={exportHref(api, id, "responses", search)} download />}>Responses CSV</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm"><span className="text-2xl font-semibold tracking-tight tabular-nums">{data.results.responses.toLocaleString("en-US")}</span> <span>{data.results.responses === 1 ? "response" : "responses"}</span></p>
          <p className="text-sm text-muted-foreground">
            {data.firstResponseAt ? `${formatWhen(data.firstResponseAt)} to ${formatWhen(data.lastResponseAt)}` : "No responses for these filters yet."}
            {data.modes.public ? ` · ${data.modes.kiosk} in person, ${data.modes.public} by public link` : ""}
          </p>
          {total.approached ? (
            <p className="text-sm text-muted-foreground">
              {total.approached} approached in person · {total.declined} declined · {total.abandoned} incomplete.
              {total.reliable ? ` ${pct(total.declineRate)} declined; ${pct(total.completionRate)} of those who started finished.` : ` Too few approaches (under ${data.survey.minimumGroup}) to give rates.`}
            </p>
          ) : null}
        </div>
        <Alert aria-label="Methodology" role="note">
          <Info />
          <AlertTitle>Methodology and limitations</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            {data.survey.methodology ? <p className="whitespace-pre-line text-foreground">{data.survey.methodology}</p> : <p>No methodology note yet. Add one in Settings before these results are reported.</p>}
            <p>Percentages are of the students who answered each question. Students chose whether to take part, so results describe respondents, not the whole school. Groups smaller than {data.survey.minimumGroup} are withheld.</p>
          </AlertDescription>
        </Alert>
      </section>

      <Tabs value={views.some((entry) => entry.value === view) ? view : "questions"} onValueChange={(next) => setView(next as string)}>
        {views.length > 1 ? (
          <TabsList>
            {views.map((entry) => <TabsTrigger key={entry.value} value={entry.value}>{entry.label}</TabsTrigger>)}
          </TabsList>
        ) : null}
        <TabsContent value="questions" className="mt-4 flex flex-col gap-8" aria-label="Questions">
          {data.results.questions.map((question, index) => (
            <Fragment key={question.name}>
              {index ? <Separator /> : null}
              <QuestionBlock question={question} />
            </Fragment>
          ))}
        </TabsContent>
        <TabsContent value="breakdowns" className="mt-4 flex flex-col gap-6">
          {data.results.breakdowns.map((entry) => <BreakdownTable key={`${entry.by}-${entry.question}`} breakdown={entry} minimum={data.survey.minimumGroup} />)}
        </TabsContent>
        <TabsContent value="fieldwork" className="mt-4">
          <FieldworkTables data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterField({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <Field className="w-auto gap-1"><FieldLabel htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</FieldLabel>{children}</Field>;
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
    <article className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10" aria-labelledby={`result-${question.name}`}>
      <header className="flex flex-col gap-1">
        {question.section ? <p className="text-xs text-muted-foreground">{question.section}</p> : null}
        <h3 id={`result-${question.name}`} className="text-base leading-snug font-semibold">{question.label}</h3>
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
                <ItemGroup className="gap-0 rounded-lg border">
                  {(allTexts ? question.texts : question.texts.slice(0, 8)).map((entry, index) => <Item key={entry.responseId} size="xs" className={cn("rounded-none leading-relaxed whitespace-pre-line", index && "border-t-border")}>{entry.text}</Item>)}
                </ItemGroup>
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
                  <div className="h-3 rounded-r-[4px] bg-primary/80 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.max(row.count ? 0.5 : 0, row.percent ?? 0)}%` }} />
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
      <Card className="gap-0 py-0">
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
      </Card>
    </div>
  );
}

function FieldworkTables({ data }: { data: SurveyResultsView }) {
  const sets: Array<[string, FieldworkRow[]]> = [["By location", data.fieldwork.locations], ["By session", data.fieldwork.sessions], ["By collection method", data.fieldwork.methods]];
  return (
    <section className="flex flex-col gap-6" aria-label="Fieldwork">
      {sets.map(([title, rows]) => rows.length ? (
        <div key={title} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><span className="sr-only">{title}</span></TableHead>
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
          </Card>
        </div>
      ) : null)}
    </section>
  );
}
