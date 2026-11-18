"use client";

import { DateButton } from "@byline/newsroom-ui/components/date-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@byline/newsroom-ui/ui/chart";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@byline/newsroom-ui/ui/combobox";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@byline/newsroom-ui/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Item, ItemGroup } from "@byline/newsroom-ui/ui/item";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Database, Download, Info, ListFilter, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import type { Breakdown, FieldworkRow, MatrixResult, QuestionResult, RankingOption, SurveyResults } from "../../polls/engine/results";
import { useNewsroomRoutes } from "../shell/account";
import { createResultsDataset, exportHref, fetchResults, formatWhen, pollKeys, type SurveyResultsView } from "./api";
import { PollSelect } from "./fields";
import { ListSkeleton } from "./PollStudio";

/**
 * Results (docs/wildcat-polls.md#results). Each percentage names its base:
 * the respondents who answered that question. Skipped, unanswered and not
 * applicable are reported beside it, never folded in. Breakdown groups and
 * fieldwork rates below the poll's minimum group are withheld by the server;
 * the charts here only ever receive what it already allowed.
 */

type Filters = { from: string; to: string; location: string; session: string; version: string; mode: string; compare: string };
const EMPTY: Filters = { from: "", to: "", location: "", session: "", version: "", mode: "", compare: "" };

function query(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
  for (const key of ["location", "session", "version", "mode", "compare"] as const) if (filters[key]) params.set(key, filters[key]);
  return params.toString();
}

const pct = (value: number | null) => (value === null ? "—" : `${Number.isInteger(value) ? value : value.toFixed(1)}%`);
const n = (value: number) => value.toLocaleString("en-US");

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
  const views = [
    { value: "questions", label: "Questions" },
    ...(data.fieldwork.sessions.length ? [{ value: "fieldwork", label: "Fieldwork" }] : [])
  ];
  return (
    <div className={cn("flex flex-col gap-6", results.isFetching && "opacity-80 transition-opacity")} data-polls-results="" aria-busy={results.isFetching || undefined}>
      <ResultsToolbar data={data} filters={filters} search={search} onChange={set} onClear={() => setFilters({ ...EMPTY, compare: filters.compare })} id={id} />
      <Summary data={data} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Timeline data={data} />
        <Methodology data={data} />
      </div>

      <Tabs value={views.some((entry) => entry.value === view) ? view : "questions"} onValueChange={(next) => setView(next as string)}>
        {views.length > 1 ? (
          <TabsList variant="line" className="w-full justify-start border-b">
            {views.map((entry) => <TabsTrigger key={entry.value} value={entry.value} className="flex-none px-2.5">{entry.label}</TabsTrigger>)}
          </TabsList>
        ) : null}
        <TabsContent value="questions" className="mt-4 flex flex-col gap-8" aria-label="Questions">
          <QuestionResults results={data.results} minimum={data.survey.minimumGroup} />
        </TabsContent>
        <TabsContent value="fieldwork" className="mt-4">
          <FieldworkView data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ filters */

type Option = { value: string; label: string };

function activeFilters(data: SurveyResultsView, filters: Filters): Array<{ key: keyof Filters; label: string }> {
  const chips: Array<{ key: keyof Filters; label: string }> = [];
  if (filters.from) chips.push({ key: "from", label: `From ${filters.from}` });
  if (filters.to) chips.push({ key: "to", label: `To ${filters.to}` });
  if (filters.location) chips.push({ key: "location", label: filters.location });
  if (filters.session) chips.push({ key: "session", label: data.options.sessions.find((session) => session.id === filters.session)?.label ?? "One session" });
  if (filters.version) chips.push({ key: "version", label: `Version ${data.versions.find((version) => String(version.id) === filters.version)?.number ?? ""}` });
  if (filters.mode) chips.push({ key: "mode", label: filters.mode === "kiosk" ? "In person" : "Web link" });
  return chips;
}

function SessionCombobox({ id, sessions, value, onChange }: { id: string; sessions: SurveyResultsView["options"]["sessions"]; value: string; onChange: (value: string) => void }) {
  const options: Option[] = [{ value: "", label: "All sessions" }, ...sessions.map((session) => ({ value: session.id, label: session.label }))];
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <Combobox items={options} value={selected} onValueChange={(next: Option | null) => onChange(next?.value ?? "")} itemToStringLabel={(option: Option) => option.label} isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}>
      <ComboboxTrigger render={<Button id={id} type="button" variant="outline" className="w-full justify-between font-normal sm:w-60" />}>
        <span className="truncate">{selected.label}</span><ChevronDown data-icon="inline-end" />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} aria-label="Search sessions" placeholder="Search sessions…" />
        <ComboboxEmpty>No session found.</ComboboxEmpty>
        <ComboboxList>{(option: Option) => <ComboboxItem key={option.value || "all"} value={option}>{option.label}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function FilterFields({ data, filters, onChange }: { data: SurveyResultsView; filters: Filters; onChange: (patch: Partial<Filters>) => void }) {
  return (
    <>
      <FilterField label="From" id="results-from"><DateButton id="results-from" value={filters.from} onChange={(from) => onChange({ from })} className="w-full justify-start font-normal sm:w-36" /></FilterField>
      <FilterField label="To" id="results-to"><DateButton id="results-to" value={filters.to} onChange={(to) => onChange({ to })} className="w-full justify-start font-normal sm:w-36" /></FilterField>
      <FilterField label="Collected" id="results-mode">
        <PollSelect id="results-mode" className="sm:w-36" value={filters.mode} emptyLabel="Any way" options={[{ value: "kiosk", label: "In person" }, { value: "public", label: "Web link" }]} onChange={(mode) => onChange({ mode })} />
      </FilterField>
      {data.options.locations.length ? (
        <FilterField label="Location" id="results-location">
          <PollSelect id="results-location" className="sm:w-40" value={filters.location} emptyLabel="All" options={data.options.locations.map((name) => ({ value: name, label: name }))} onChange={(location) => onChange({ location })} />
        </FilterField>
      ) : null}
      {data.options.sessions.length ? (
        <FilterField label="Session" id="results-session"><SessionCombobox id="results-session" sessions={data.options.sessions} value={filters.session} onChange={(session) => onChange({ session })} /></FilterField>
      ) : null}
      {data.versions.length > 1 ? (
        <FilterField label="Version" id="results-version">
          <PollSelect id="results-version" className="sm:w-48" value={filters.version} emptyLabel={`All (labels from v${data.version.number})`} options={data.versions.map((version) => ({ value: String(version.id), label: `Version ${version.number}` }))} onChange={(version) => onChange({ version })} />
        </FilterField>
      ) : null}
    </>
  );
}

function ResultsToolbar({ data, filters, search, onChange, onClear, id }: { data: SurveyResultsView; filters: Filters; search: string; onChange: (patch: Partial<Filters>) => void; onClear: () => void; id: number }) {
  const { api, admin } = useNewsroomRoutes();
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [open, setOpen] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const chips = activeFilters(data, filters);
  const filtered = chips.length > 0;
  const dataset = useMutation({ mutationFn: () => createResultsDataset(api, id, search) });
  const compare = data.compare.options.length ? (
    <FilterField label="Compare by" id="results-compare">
      <PollSelect id="results-compare" className="sm:w-52" value={filters.compare} emptyLabel="Nothing (all respondents)" options={data.compare.options.map((option) => ({ value: option.name, label: option.label }))} onChange={(compare) => onChange({ compare })} />
    </FilterField>
  ) : null;
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" />}><Download data-icon="inline-start" />Export<ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal text-muted-foreground">{filtered ? `CSV with the ${chips.length} filter${chips.length === 1 ? "" : "s"} shown` : "CSV of all responses"}</DropdownMenuLabel>
            <DropdownMenuItem render={<a href={exportHref(api, id, "summary", search)} download />}>Summary CSV (aggregates)</DropdownMenuItem>
            <DropdownMenuItem render={<a href={exportHref(api, id, "responses", search)} download />}>Responses CSV (one row each)</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {data.canCreateDataset ? <Button type="button" variant="outline" onClick={() => { dataset.reset(); setHandoff(true); }}><Database data-icon="inline-start" />Create dataset</Button> : null}
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {wide ? (
        <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter results">
          <FilterFields data={data} filters={filters} onChange={onChange} />
          {compare}
          <span className="flex-1" />
          {actions}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger render={<Button type="button" variant="outline" />}><ListFilter data-icon="inline-start" />Filters{filtered ? <Badge variant="secondary" className="tabular-nums">{chips.length}</Badge> : null}</DrawerTrigger>
            <DrawerContent keyboardAware>
              <DrawerHeader><DrawerTitle>Filter results</DrawerTitle><DrawerDescription>Charts, exports and datasets use these filters.</DrawerDescription></DrawerHeader>
              <FieldGroup className="gap-4 overflow-y-auto px-4">
                <FilterFields data={data} filters={filters} onChange={onChange} />
              </FieldGroup>
              <DrawerFooter className="flex-row pb-[max(1rem,var(--byline-safe-bottom))]">
                <Button type="button" variant="ghost" disabled={!filtered} onClick={onClear}>Clear all</Button>
                <span className="flex-1" />
                <Button type="button" onClick={() => setOpen(false)}>Show results</Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
          {compare}
          <span className="flex-1" />
          {actions}
        </div>
      )}
      {filtered ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-0.5 pr-0.5">
              {chip.label}
              <Button type="button" variant="ghost" size="icon-xs" className="touch-hit" aria-label={`Remove filter: ${chip.label}`} onClick={() => onChange({ [chip.key]: "" })}><X /></Button>
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>Clear all</Button>
        </div>
      ) : null}

      <AlertDialog open={handoff} onOpenChange={setHandoff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dataset.isSuccess ? "Dataset created" : "Create a dataset from these results?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {dataset.isSuccess
                ? `${n(dataset.data.rows)} rows of aggregate results are in a private working dataset.${dataset.data.withheld ? ` ${dataset.data.withheld} question${dataset.data.withheld === 1 ? " was" : "s were"} left out for having too few answers.` : ""} Review it in Data; nothing is public until you publish it there.`
                : `Byline Data gets the counts and percentages shown here${filtered ? ", with the current filters" : ""}${filters.compare ? " and comparison" : ""}, each with its base. No individual responses and no written answers, and nothing smaller than ${data.survey.minimumGroup} respondents. It starts private; you publish it in Data when it's reviewed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dataset.isError ? <p className="text-sm text-destructive" role="alert">{(dataset.error as Error).message}</p> : null}
          <AlertDialogFooter>
            {dataset.isSuccess ? (
              <>
                <AlertDialogCancel>Close</AlertDialogCancel>
                <Button nativeButton={false} render={<a href={`${admin}/data?dataset=${dataset.data.datasetId}`} />}>Open in Data</Button>
              </>
            ) : (
              <>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={dataset.isPending} onClick={(event) => { event.preventDefault(); dataset.mutate(); }}>{dataset.isPending ? <Spinner data-icon="inline-start" /> : null}Create private dataset</AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterField({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <Field className="w-full gap-1 sm:w-auto"><FieldLabel htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</FieldLabel>{children}</Field>;
}

/* ------------------------------------------------------------------ summary */

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card className="gap-1 py-3">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums">{value}</CardTitle>
      </CardHeader>
      {detail ? <CardContent className="px-4 text-xs text-muted-foreground">{detail}</CardContent> : null}
    </Card>
  );
}

function Summary({ data }: { data: SurveyResultsView }) {
  const total = data.fieldwork.total;
  const minimum = data.survey.minimumGroup;
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Summary" data-polls-summary="">
      <Metric label="Responses" value={n(data.results.responses)} detail={data.firstResponseAt ? `${formatWhen(data.firstResponseAt)} to ${formatWhen(data.lastResponseAt)}` : "None yet for these filters"} />
      <Metric label="In person" value={n(data.modes.kiosk)} />
      <Metric label="Web link" value={n(data.modes.public)} />
      <Metric label="Completion" value={total.approached ? (total.reliable && total.completionRate !== null ? pct(total.completionRate) : "—") : "—"} detail={total.approached ? (total.reliable ? `${n(total.completed)} of ${n(total.started)} who started, in person` : `Too few approaches (under ${minimum}) to report`) : "In-person sessions only"} />
      <Metric label="Declined" value={total.approached ? (total.reliable && total.declineRate !== null ? pct(total.declineRate) : "—") : "—"} detail={total.approached ? (total.reliable ? `${n(total.declined)} of ${n(total.approached)} approached` : `Too few approaches (under ${minimum}) to report`) : "In-person sessions only"} />
    </section>
  );
}

const timelineConfig = { kiosk: { label: "In person", color: "var(--chart-4)" }, public: { label: "Web link", color: "var(--chart-2)" } } satisfies ChartConfig;

function Timeline({ data }: { data: SurveyResultsView }) {
  const points = data.timeline.map((point) => ({ ...point, label: new Date(`${point.day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) }));
  return (
    <Card data-polls-timeline="">
      <CardHeader>
        <CardTitle>Responses over time</CardTitle>
        <CardDescription>Per day, by how they were collected.</CardDescription>
      </CardHeader>
      <CardContent>
        {points.length ? (
          <ChartContainer config={timelineConfig} className="aspect-auto h-48 w-full">
            <BarChart accessibilityLayer data={points} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              {data.modes.public && data.modes.kiosk ? <ChartLegend content={<ChartLegendContent />} /> : null}
              <Bar dataKey="kiosk" stackId="day" fill="var(--color-kiosk)" radius={data.modes.public ? [0, 0, 0, 0] : [4, 4, 0, 0]} />
              <Bar dataKey="public" stackId="day" fill="var(--color-public)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : <p className="py-10 text-center text-sm text-muted-foreground">No responses for these filters yet.</p>}
      </CardContent>
    </Card>
  );
}

function Methodology({ data }: { data: SurveyResultsView }) {
  return (
    <Alert aria-label="Methodology" role="note" className="h-fit">
      <Info />
      <AlertTitle>Methodology and limitations</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        {data.survey.methodology ? <p className="whitespace-pre-line text-foreground">{data.survey.methodology}</p> : <p>No methodology note yet. Add one in Settings before these results are reported.</p>}
        <p>Percentages are of the students who answered each question. Students chose whether to take part, so results describe respondents, not the whole school. Groups smaller than {data.survey.minimumGroup} are withheld.</p>
      </AlertDescription>
    </Alert>
  );
}

/* ------------------------------------------------------------------ questions */

function QuestionResults({ results, minimum }: { results: SurveyResults; minimum: number }) {
  const questions = new Map(results.questions.map((question) => [question.name, question]));
  const breakdowns = new Map(results.breakdowns.map((entry) => [entry.question, entry]));
  const matrixRows = new Map(results.matrices.flatMap((matrix) => matrix.rows.map((row) => [row, matrix] as const)));
  return results.questions.map((question, index) => {
    const matrix = matrixRows.get(question.name);
    if (matrix && question.name !== matrix.rows[0]) return null;
    return <Fragment key={question.name}>
      {index > 0 ? <Separator /> : null}
      {matrix ? <MatrixResultBlock matrix={matrix} rows={matrix.rows.map((name) => questions.get(name)!)} breakdowns={breakdowns} minimum={minimum} />
        : <QuestionBlock question={question} breakdown={breakdowns.get(question.name) ?? null} minimum={minimum} />}
    </Fragment>;
  });
}

/** The base, always in words beside the numbers: `176 answered · 5 skipped · 3 not asked`. */
function BaseLine({ question }: { question: QuestionResult }) {
  const { base } = question;
  const parts = [`${n(base.answered)} answered`];
  if (base.skipped) parts.push(`${n(base.skipped)} skipped`);
  if (base.unanswered) parts.push(`${n(base.unanswered)} left blank`);
  if (base.notApplicable) parts.push(`${n(base.notApplicable)} not asked`);
  return <p className="text-xs text-muted-foreground tabular-nums" data-polls-base="">{parts.join(" · ")}</p>;
}

function QuestionBlock({ question, breakdown, minimum }: { question: QuestionResult; breakdown: Breakdown | null; minimum: number }) {
  const [display, setDisplay] = useState<"chart" | "table">("chart");
  const tabular = Boolean(question.choices || (question.numeric && question.kind === "range"));
  return (
    <article className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10" aria-labelledby={`result-${question.name}`} data-polls-question-result={question.name}>
      <header className="flex flex-col gap-1">
        {question.section ? <p className="text-xs text-muted-foreground">{question.section}</p> : null}
        <h3 id={`result-${question.name}`} className="text-base leading-snug font-semibold">{question.label}</h3>
        <BaseLine question={question} />
        {question.multiple ? <p className="text-xs text-muted-foreground">More than one answer allowed, so percentages can add up to more than 100%.</p> : null}
        {tabular && question.base.answered ? (
          <ToggleGroup variant="outline" size="sm" className="mt-2" aria-label="Show as" value={[display]} onValueChange={(next: unknown[]) => { if (next[0] === "chart" || next[0] === "table") setDisplay(next[0]); }}>
            <ToggleGroupItem value="chart">Chart</ToggleGroupItem>
            <ToggleGroupItem value="table">Table</ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </header>
      <div className="min-w-0">
        {question.ranking ? <RankingResult options={question.ranking} breakdown={breakdown} minimum={minimum} />
          : question.confirmation ? <ConfirmationResult question={question} breakdown={breakdown} minimum={minimum} />
          : breakdown ? <BreakdownView breakdown={breakdown} minimum={minimum} display={display} multiple={Boolean(question.multiple)} />
          : question.choices ? <ChoiceResult question={question} display={display} />
          : question.numeric ? <NumericResult question={question} display={display} />
          : question.texts ? <TextAnswers question={question} />
          : null}
      </div>
    </article>
  );
}

function RankingResult({ options, breakdown, minimum }: { options: RankingOption[]; breakdown: Breakdown | null; minimum: number }) {
  if (breakdown) return (
    <div className="grid gap-4" data-polls-breakdown={breakdown.by}>
      <p className="text-sm text-muted-foreground">By {breakdown.byLabel}. A first-place share uses the respondents who ranked that option.</p>
      {breakdown.groups.map((group) => <section key={group.name} className="grid gap-2 rounded-lg border p-3">
        <h4 className="font-semibold">{group.label}</h4>
        {group.suppressed ? <p className="text-sm text-muted-foreground">Withheld (small group, minimum {minimum})</p>
          : <RankingList options={group.ranking ?? []} />}
      </section>)}
    </div>
  );
  return <RankingList options={options} />;
}

function RankingList({ options }: { options: RankingOption[] }) {
  if (!options.some((option) => option.base)) return <p className="text-sm text-muted-foreground">No rankings yet.</p>;
  const positions = Math.max(...options.map((option) => option.positions.length));
  return (
    <div className="grid min-w-0 gap-3" data-polls-ranking-result="">
      <h4 className="text-sm font-semibold">Current ranking by average position</h4>
      <ol className="m-0 grid list-none divide-y rounded-lg border p-0">
        {options.map((option, i) => <li key={option.name} className="flex gap-3 p-3">
          <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">{option.base ? i + 1 : "—"}</span>
          <div className="min-w-0">
            <p className="font-medium wrap-anywhere">{option.label}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{option.averagePosition === null ? "No rankings"
              : `Average position ${option.averagePosition.toFixed(1)} · First place ${pct(option.firstPlacePercent)} (${n(option.firstPlaceCount)} of ${n(option.base)})`}</p>
          </div>
        </li>)}
      </ol>
      <details className="min-w-0 text-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">Position distribution</summary>
        <Table>
          <TableHeader><TableRow><TableHead>Answer</TableHead><TableHead className="text-right">Base</TableHead>
            {Array.from({ length: positions }, (_, i) => <TableHead key={i} className="text-right">Position {i + 1}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {options.map((option) => <TableRow key={option.name}>
              <TableCell className="whitespace-normal">{option.label}</TableCell><TableCell className="text-right">{n(option.base)}</TableCell>
              {Array.from({ length: positions }, (_, i) => <TableCell key={i} className="text-right tabular-nums">{n(option.positions[i] ?? 0)}</TableCell>)}
            </TableRow>)}
          </TableBody>
        </Table>
      </details>
    </div>
  );
}

function ConfirmationResult({ question, breakdown, minimum }: { question: QuestionResult; breakdown: Breakdown | null; minimum: number }) {
  const counts = question.confirmation!;
  const figures: Array<[string, number]> = [
    ["Confirmed", counts.confirmed], ["Skipped", question.base.skipped], ["Unanswered", question.base.unanswered],
    ["Not applicable", question.base.notApplicable], ["Base (shown)", counts.base]
  ];
  return <div className="grid gap-3" data-polls-confirmation-result="">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-3 sm:grid-cols-3">
      {figures.map(([label, count]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-lg font-medium tabular-nums">{n(count)}</dd></div>)}
    </dl>
    {breakdown ? <Table>
      <TableHeader><TableRow><TableHead>Group</TableHead><TableHead className="text-right">Confirmed</TableHead><TableHead className="text-right">Base (shown)</TableHead></TableRow></TableHeader>
      <TableBody>{breakdown.groups.map((group) => <TableRow key={group.name}>
        <TableCell className="whitespace-normal">{group.label}</TableCell>
        {group.suppressed ? <TableCell colSpan={2} className="text-right text-muted-foreground">Withheld (small group, minimum {minimum})</TableCell>
          : <><TableCell className="text-right">{n(group.cells.OK?.count ?? 0)}</TableCell><TableCell className="text-right">{n(group.base)}</TableCell></>}
      </TableRow>)}</TableBody>
    </Table> : null}
  </div>;
}

type MatrixRowResult = {
  name: string; label: string; base: number | null; cells: Record<string, { count: number; percent: number | null }>;
  reason?: "withheld" | "unavailable";
};

function MatrixResultBlock({ matrix, rows, breakdowns, minimum }: {
  matrix: MatrixResult; rows: QuestionResult[]; breakdowns: ReadonlyMap<string, Breakdown>; minimum: number;
}) {
  const [display, setDisplay] = useState<"chart" | "table">("chart");
  const entry = rows.flatMap((row) => breakdowns.get(row.name) ?? [])[0];
  const all = rows.map((row): MatrixRowResult => ({
    name: row.name, label: row.label, base: row.base.answered,
    cells: Object.fromEntries((row.choices ?? []).map((choice) => [choice.name, choice]))
  }));
  const comparisons = entry?.groups.map((group) => ({
    key: group.name, label: group.label,
    rows: rows.map((row): MatrixRowResult => {
      const result = breakdowns.get(row.name)?.groups.find((candidate) => candidate.name === group.name);
      if (!result || result.suppressed) return { name: row.name, label: row.label, base: null, cells: {}, reason: result ? "withheld" : "unavailable" };
      return { name: row.name, label: row.label, base: result.base, cells: result.cells };
    })
  })) ?? [];
  return (
    <article className="grid min-w-0 gap-4" aria-labelledby={`result-${matrix.name}`} data-polls-matrix-result={matrix.name}>
      <header>
        <p className="text-xs text-muted-foreground">Matrix</p>
        <h3 id={`result-${matrix.name}`} className="text-base font-semibold wrap-anywhere">{matrix.label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Each row uses the respondents who answered that row.</p>
        <ToggleGroup variant="outline" size="sm" className="mt-2" aria-label="Show matrix as" value={[display]}
          onValueChange={(next: unknown[]) => { if (next[0] === "chart" || next[0] === "table") setDisplay(next[0]); }}>
          <ToggleGroupItem value="chart">Chart</ToggleGroupItem><ToggleGroupItem value="table">Table</ToggleGroupItem>
        </ToggleGroup>
      </header>
      <MatrixDistribution columns={matrix.columns} rows={all} display={display} title="All respondents" />
      <ul className="m-0 grid list-none gap-1 p-0">
        {rows.map((row) => <li key={row.name} className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-medium">{row.label}</span><BaseLine question={row} />
        </li>)}
      </ul>
      {entry ? <div className="grid gap-4 border-t pt-4" data-polls-breakdown={entry.by}>
        <h4 className="text-sm font-semibold">Compare by {entry.byLabel}</h4>
        {comparisons.map((group) => <section key={group.key} className="grid min-w-0 gap-2 rounded-lg border p-3">
          <h5 className="font-medium">{group.label}</h5>
          <MatrixDistribution columns={matrix.columns} rows={group.rows} display={display} title={group.label} />
          {group.rows.some((row) => row.reason === "withheld") ? <p className="text-xs text-muted-foreground">Withheld rows have a small group (minimum {minimum}) or would reveal one.</p> : null}
        </section>)}
      </div> : null}
    </article>
  );
}

function MatrixDistribution({ columns, rows, display, title }: { columns: MatrixResult["columns"]; rows: MatrixRowResult[]; display: "chart" | "table"; title: string }) {
  if (display === "table") return <Table aria-label={`Matrix distribution · ${title}`}>
    <TableHeader><TableRow><TableHead>Row</TableHead><TableHead className="text-right">Base</TableHead>
      {columns.map((column) => <TableHead key={column.name} className="text-right whitespace-normal">{column.label}</TableHead>)}
    </TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.name}>
      <TableHead scope="row" className="whitespace-normal">{row.label}</TableHead>
      {row.reason ? <TableCell colSpan={columns.length + 1} className="text-muted-foreground">{row.reason === "withheld" ? "Withheld" : "No comparison"}</TableCell> : <>
        <TableCell className="text-right tabular-nums">{n(row.base ?? 0)}</TableCell>
        {columns.map((column) => <TableCell key={column.name} className="text-right whitespace-nowrap tabular-nums">
          {pct(row.cells[column.name]?.percent ?? null)}{row.base ? ` (${n(row.cells[column.name]?.count ?? 0)})` : ""}
        </TableCell>)}
      </>}
    </TableRow>)}</TableBody>
  </Table>;
  const config = Object.fromEntries(columns.map((column, i) => [`c${i}`, { label: column.label, color: GROUP_COLORS[i % GROUP_COLORS.length] }])) satisfies ChartConfig;
  const plotted = rows.filter((row) => row.base);
  if (!plotted.length) return <p className="text-sm text-muted-foreground">{rows.some((row) => row.reason === "withheld") ? "No distributions can be shown for this group." : "No answers yet."}</p>;
  const data = plotted.map((row) => ({
    label: `${row.label} (${n(row.base!)})`,
    ...Object.fromEntries(columns.map(({ name }, i) => [`c${i}`, ((row.cells[name]?.count ?? 0) / row.base!) * 100]))
  }));
  return <>
    <ChartContainer config={config} className="aspect-auto w-full min-w-0" style={{ height: `${Math.max(145, plotted.length * 42 + 76)}px` }}>
      <BarChart accessibilityLayer data={data} layout="vertical" stackOffset="expand" margin={{ left: 0, right: 4 }}>
        <XAxis type="number" domain={[0, 1]} hide />
        <YAxis type="category" dataKey="label" width={130} interval={0} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value, key) => <span className="tabular-nums">{config[String(key)]?.label} · {pct(Math.round(Number(value) * 10) / 10)}</span>} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
        {columns.map((column, i) => <Bar key={column.name} dataKey={`c${i}`} stackId="matrix" fill={`var(--color-c${i})`} maxBarSize={28} isAnimationActive={false} />)}
      </BarChart>
    </ChartContainer>
    {rows.filter((row) => row.reason).map((row) => <p key={row.name} className="text-xs text-muted-foreground">{row.label} · {row.reason === "withheld" ? "Withheld" : "No comparison"}</p>)}
  </>;
}

const shareConfig = { percent: { label: "Share", color: "var(--chart-4)" } } satisfies ChartConfig;

/** Single and multiple choice: horizontal bars, labelled, with the count in the tooltip. */
function ChoiceResult({ question, display }: { question: QuestionResult; display: "chart" | "table" }) {
  const base = question.base.answered;
  if (!base || !question.choices) return <p className="text-sm text-muted-foreground">No answers yet.</p>;
  const rows = question.choices.map((choice) => ({ key: choice.name, label: choice.label, count: choice.count, percent: choice.percent ?? 0 }));
  if (display === "table") return <ShareTable rows={rows} base={base} />;
  return (
    <ChartContainer config={shareConfig} className="aspect-auto w-full" style={{ height: `${Math.max(120, rows.length * 40 + 16)}px` }}>
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 0, right: 48 }} barCategoryGap={8}>
        <XAxis type="number" dataKey="percent" hide domain={[0, Math.max(100, ...rows.map((row) => row.percent))]} />
        <YAxis type="category" dataKey="label" width={160} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={0} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator formatter={(_value, _name, item) => <span className="tabular-nums">{pct((item.payload as { percent: number }).percent)} · {n((item.payload as { count: number }).count)} of {n(base)}</span>} />} />
        <Bar dataKey="percent" fill="var(--color-percent)" radius={[0, 4, 4, 0]} maxBarSize={28}>
          <LabelList dataKey="percent" position="right" className="fill-foreground tabular-nums" fontSize={12} formatter={(value: unknown) => pct(Number(value))} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function ShareTable({ rows, base }: { rows: Array<{ key: string; label: string; count: number; percent: number }>; base: number }) {
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Answer</TableHead><TableHead className="text-right">Share</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.map((row) => <TableRow key={row.key}><TableCell className="whitespace-normal">{row.label}</TableCell><TableCell className="text-right tabular-nums">{pct(row.percent)}</TableCell><TableCell className="text-right text-muted-foreground tabular-nums">{n(row.count)}</TableCell></TableRow>)}
        <TableRow><TableCell className="text-muted-foreground">Base (answered)</TableCell><TableCell /><TableCell className="text-right tabular-nums">{n(base)}</TableCell></TableRow>
      </TableBody>
    </Table>
  );
}

const countConfig = { count: { label: "Respondents", color: "var(--chart-4)" } } satisfies ChartConfig;

/** Scales and numbers: average, median and range, and the distribution where it means something. */
function NumericResult({ question, display }: { question: QuestionResult; display: "chart" | "table" }) {
  const numeric = question.numeric!;
  const base = question.base.answered;
  if (!base) return <p className="text-sm text-muted-foreground">No answers yet.</p>;
  const distribution = numeric.distribution;
  const chartable = question.kind === "range" || distribution.length <= 20;
  const rows = distribution.map((entry) => ({ key: String(entry.value), label: String(entry.value), count: entry.count, percent: base ? Math.round((entry.count / base) * 1000) / 10 : 0 }));
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
        <div><dt className="inline text-muted-foreground">Average </dt><dd className="inline font-semibold">{numeric.mean ?? "—"}</dd></div>
        <div><dt className="inline text-muted-foreground">Median </dt><dd className="inline">{numeric.median ?? "—"}</dd></div>
        <div><dt className="inline text-muted-foreground">Range </dt><dd className="inline">{numeric.min ?? "—"}–{numeric.max ?? "—"}</dd></div>
      </dl>
      {chartable && rows.length ? (
        display === "table" ? <ShareTable rows={rows} base={base} /> : (
          <ChartContainer config={countConfig} className="aspect-auto h-44 w-full">
            <BarChart accessibilityLayer data={rows} margin={{ top: 16, left: 0, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} interval={0} />
              <YAxis hide allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator formatter={(_value, _name, item) => <span className="tabular-nums">{n((item.payload as { count: number }).count)} of {n(base)} · {pct((item.payload as { percent: number }).percent)}</span>} />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="count" position="top" className="fill-muted-foreground tabular-nums" fontSize={11} />
              </Bar>
            </BarChart>
          </ChartContainer>
        )
      ) : null}
    </div>
  );
}

function TextAnswers({ question }: { question: QuestionResult }) {
  const [all, setAll] = useState(false);
  const texts = question.texts ?? [];
  if (!texts.length) return <p className="text-sm text-muted-foreground">No written answers.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ItemGroup className="gap-0 rounded-lg border">
        {(all ? texts : texts.slice(0, 8)).map((entry, index) => <Item key={entry.responseId} size="xs" className={cn("rounded-none leading-relaxed whitespace-pre-line", index && "border-t-border")}>{entry.text}</Item>)}
      </ItemGroup>
      {texts.length > 8 ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${texts.length}`}</Button> : null}
      <p className="text-xs text-muted-foreground">Written answers are confidential and never leave the newsroom in a dataset. Check them for names before quoting anything.</p>
    </div>
  );
}

const GROUP_COLORS = ["var(--chart-5)", "var(--chart-3)", "var(--chart-2)", "var(--chart-1)", "var(--chart-4)"];

/** One question compared by a group question. Withheld groups are named, never drawn: the server sent no numbers for them. */
function BreakdownView({ breakdown, minimum, display, multiple }: { breakdown: Breakdown; minimum: number; display: "chart" | "table"; multiple: boolean }) {
  const shown = breakdown.groups.filter((group) => !group.suppressed);
  const withheld = breakdown.groups.filter((group) => group.suppressed);
  const keys = shown.map((_group, index) => `g${index}`);
  const config = Object.fromEntries(shown.map((group, index) => [keys[index], { label: `${group.label} (${n(group.base)})`, color: GROUP_COLORS[index % GROUP_COLORS.length] }])) satisfies ChartConfig;
  const rows = breakdown.choices.map((choice) => Object.fromEntries([["label", choice.label], ...shown.map((group, index) => [keys[index], group.cells[choice.name]?.percent ?? 0])]));
  return (
    <div className="flex flex-col gap-3" data-polls-breakdown={breakdown.by}>
      <p className="text-xs text-muted-foreground">By {breakdown.byLabel.replace(/\?$/, "").toLowerCase()}. Each group's percentages are of its members who answered.{multiple ? " They can add up to more than 100%." : ""}</p>
      {!shown.length ? <p className="text-sm text-muted-foreground">Every group is smaller than {minimum}, so none is shown.</p>
        : display === "table" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Answered</TableHead>
                {breakdown.choices.map((choice) => <TableHead key={choice.name} className="text-right whitespace-normal">{choice.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.groups.map((group) => (
                <TableRow key={group.name}>
                  <TableCell className="font-medium">{group.label}</TableCell>
                  {group.suppressed ? <TableCell colSpan={breakdown.choices.length + 1} className="text-right text-muted-foreground">Withheld (small group)</TableCell> : (
                    <>
                      <TableCell className="text-right tabular-nums">{n(group.base)}</TableCell>
                      {breakdown.choices.map((choice) => <TableCell key={choice.name} className="text-right tabular-nums">{pct(group.cells[choice.name]?.percent ?? null)}</TableCell>)}
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <ChartContainer config={config} className="aspect-auto w-full" style={{ height: `${Math.max(160, breakdown.choices.length * (shown.length * 14 + 18) + 48)}px` }}>
            <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 0, right: 40 }} barGap={2} barCategoryGap={10}>
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis type="category" dataKey="label" width={160} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={0} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value, name) => <span className="flex w-full justify-between gap-3"><span className="text-muted-foreground">{config[String(name)]?.label}</span><span className="tabular-nums">{pct(Number(value))}</span></span>} />} />
              <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
              {keys.map((key) => <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={[0, 3, 3, 0]} maxBarSize={14} />)}
            </BarChart>
          </ChartContainer>
        )}
      {withheld.length ? <p className="text-xs text-muted-foreground">Withheld, fewer than {minimum} (or would reveal one that is): {withheld.map((group) => group.label).join(", ")}.</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ fieldwork */

const funnelConfig = { value: { label: "People", color: "var(--chart-4)" } } satisfies ChartConfig;

function FieldworkView({ data }: { data: SurveyResultsView }) {
  const total = data.fieldwork.total;
  const steps = [
    { step: "Approached", value: total.approached },
    { step: "Declined", value: total.declined },
    { step: "Started", value: total.started },
    { step: "Completed", value: total.completed },
    { step: "Incomplete", value: total.abandoned }
  ];
  const sets: Array<[string, FieldworkRow[]]> = [["By location", data.fieldwork.locations], ["By session", data.fieldwork.sessions], ["By sampling method", data.fieldwork.methods]];
  return (
    <section className="flex flex-col gap-6" aria-label="Fieldwork">
      <Card>
        <CardHeader>
          <CardTitle>From approach to response</CardTitle>
          <CardDescription>
            {total.reliable
              ? `${pct(total.declineRate)} of those approached declined; ${pct(total.completionRate)} of those who started finished.`
              : `Fewer than ${data.survey.minimumGroup} approaches, so no rates are given.`} In-person sessions only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={funnelConfig} className="aspect-auto h-56 w-full">
            <BarChart accessibilityLayer data={steps} layout="vertical" margin={{ left: 0, right: 40 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="step" width={96} tickLine={false} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} maxBarSize={28}>
                <LabelList dataKey="value" position="right" className="fill-foreground tabular-nums" fontSize={12} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      {sets.map(([title, rows]) => rows.length ? (
        <div key={title} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="rounded-lg border">
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
          </div>
        </div>
      ) : null)}
    </section>
  );
}
