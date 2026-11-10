"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { CircleAlert, Search, SearchX, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { LOAD_LABELS, LOAD_LEVELS, LOAD_THRESHOLDS, loadLevel, workloadHint, type LoadLevel } from "../../domain/workload";
import { problemsOf, useWorkload } from "./api";
import { TeamNav } from "./TeamNav";
import { useNewsroomRoutes } from "../shell/account";

/**
 * Workload (docs/newsroom-roles.md#workload): counts an editor can use when
 * assigning work, and a Load level summarising them. Alphabetical, never
 * ordered by load; no time tracking, nothing about how much anyone produces.
 */

type Tone = "neutral" | "due" | "overdue";
const COLUMNS: ReadonlyArray<{ key: "activeStories" | "dueThisWeek" | "overdue" | "reviews" | "mediaAssignments"; label: string; tone: Tone }> = [
  { key: "activeStories", label: "Active stories", tone: "neutral" },
  { key: "dueThisWeek", label: "Due this week", tone: "due" },
  { key: "overdue", label: "Overdue", tone: "overdue" },
  { key: "reviews", label: "Reviews", tone: "neutral" },
  { key: "mediaAssignments", label: "Media assignments", tone: "neutral" }
];

/** Light to Stretched, cool to warm. Each colour carries its word, so colour is never the only signal. */
const LOAD_STYLES: Record<LoadLevel, { badge: string; dot: string }> = {
  light: { badge: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300", dot: "bg-emerald-500" },
  steady: { badge: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300", dot: "bg-sky-500" },
  busy: { badge: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300", dot: "bg-amber-500" },
  stretched: { badge: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300", dot: "bg-red-500" }
};

function LoadBadge({ level }: { level: LoadLevel }) {
  return <Badge variant="outline" className={LOAD_STYLES[level].badge}><span className={`size-1.5 rounded-full ${LOAD_STYLES[level].dot}`} aria-hidden="true" />{LOAD_LABELS[level]}</Badge>;
}

/** A count tinted by what it means: overdue work red, work due this week amber, busier counts heavier. */
function Count({ value, tone }: { value: number; tone: Tone }) {
  if (!value) return <span className="text-muted-foreground/50">0</span>;
  if (tone === "overdue") return <span className="inline-flex min-w-6 justify-center rounded-md bg-red-100 px-1.5 py-0.5 font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">{value}</span>;
  if (tone === "due") return <span className="inline-flex min-w-6 justify-center rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">{value}</span>;
  return <span className={value >= 4 ? "font-semibold" : "font-medium"}>{value}</span>;
}

const range = (level: LoadLevel) => {
  const index = LOAD_LEVELS.indexOf(level);
  const next = LOAD_LEVELS[index + 1];
  return next ? `${LOAD_THRESHOLDS[level]}–${LOAD_THRESHOLDS[next] - 1}` : `${LOAD_THRESHOLDS[level]}+`;
};

export function WorkloadScreen() {
  const { api } = useNewsroomRoutes();
  const workload = useWorkload(api);
  const [filter, setFilter] = useState("");
  const all = workload.data?.rows ?? [];
  const rows = all.filter((row) => row.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <AdminRoot toaster={false} className="byline-workload">
      <main className="mx-auto flex w-full min-w-0 max-w-[960px] flex-col gap-5 px-4 py-6 lg:px-6" data-byline-workload-screen="">
        <header className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workload</h1>
          <p className="max-w-prose text-sm text-muted-foreground">What’s on each person’s plate right now, to help when you assign work. These are counts, not measures of anyone’s performance, and they never stop an assignment.</p>
        </header>
        <TeamNav current="workload" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput type="search" aria-label="Find a person" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a person…" />
            {filter ? <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setFilter("")}><X aria-hidden="true" /></InputGroupButton></InputGroupAddon> : null}
          </InputGroup>
          {workload.data ? <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{filter ? `${rows.length} of ${all.length}` : all.length} {all.length === 1 ? "person" : "people"}, alphabetical</p> : null}
        </div>

        {workload.isError ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Workload couldn’t be loaded</AlertTitle><AlertDescription>{problemsOf(workload.error)[0]}</AlertDescription><AlertAction><Button type="button" size="xs" variant="outline" onClick={() => void workload.refetch()}>Try again</Button></AlertAction></Alert> : null}
        {workload.isPending ? <div className="divide-y overflow-hidden rounded-xl border" aria-busy="true">{[0, 1, 2, 3].map((n) => <div key={n} className="flex items-center gap-6 px-4 py-3"><Skeleton className="h-4 w-36" /><Skeleton className="ml-auto h-4 w-64" /></div>)}</div> : null}
        {workload.data && !rows.length ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">{filter ? <SearchX aria-hidden="true" /> : <UsersRound aria-hidden="true" />}</EmptyMedia>
              <EmptyTitle>No one found</EmptyTitle>
              <EmptyDescription>{filter ? "No one matches that search." : "There are no people with accounts yet."}</EmptyDescription>
            </EmptyHeader>
            {filter ? <EmptyContent><Button type="button" size="sm" variant="outline" onClick={() => setFilter("")}>Clear search</Button></EmptyContent> : null}
          </Empty>
        ) : null}

        {rows.length ? (
          <>
            <div className="hidden overflow-x-auto rounded-xl border md:block">
              <Table>
                <caption className="sr-only">Work assigned to each person, in alphabetical order</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="pl-4">Person</TableHead>
                    <TableHead scope="col">Load</TableHead>
                    {COLUMNS.map((column) => <TableHead key={column.key} scope="col" className="h-auto w-24 py-2 text-right leading-tight whitespace-normal last:pr-4">{column.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableHead scope="row" className="pl-4 font-medium">{row.name}</TableHead>
                      <TableCell><LoadBadge level={loadLevel(row)} /></TableCell>
                      {COLUMNS.map((column) => <TableCell key={column.key} className="text-right tabular-nums last:pr-4"><Count value={row[column.key]} tone={column.tone} /></TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ItemGroup className="gap-0 divide-y overflow-hidden rounded-xl border md:hidden" aria-label="Work assigned to each person">
              {rows.map((row) => (
                <div role="listitem" key={row.userId}>
                  <Item size="sm" className="rounded-none border-0">
                    <ItemContent>
                      <ItemTitle className="flex-wrap">{row.name}<LoadBadge level={loadLevel(row)} /></ItemTitle>
                      <ItemDescription>{workloadHint(row) || "Nothing assigned."}</ItemDescription>
                    </ItemContent>
                  </Item>
                </div>
              ))}
            </ItemGroup>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <dl className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Load levels">
                {LOAD_LEVELS.map((level) => <div key={level} className="flex items-center gap-1.5"><dt><LoadBadge level={level} /></dt><dd className="tabular-nums">{range(level)}</dd></div>)}
              </dl>
              <p>Load adds up each active story, review, media assignment and story due this week; overdue stories count twice. It describes what’s on someone’s plate, not how well they work.</p>
            </div>
          </>
        ) : null}
      </main>
    </AdminRoot>
  );
}
