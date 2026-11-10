"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { useId, useState } from "react";
import { workloadHint } from "../../domain/workload";
import { problemsOf, useWorkload } from "./api";
import { TeamNav } from "./TeamNav";
import { useNewsroomRoutes } from "../shell/account";

/**
 * Factual workload (docs/newsroom-roles.md#workload): counts an editor can use
 * when assigning work. Alphabetical, never ranked; no scores, no time tracking,
 * nothing about how much anyone produces.
 */

const COLUMNS = [
  { key: "activeStories", label: "Active stories" },
  { key: "dueThisWeek", label: "Due this week" },
  { key: "overdue", label: "Overdue" },
  { key: "reviews", label: "Reviews" },
  { key: "mediaAssignments", label: "Media assignments" }
] as const;

export function WorkloadScreen() {
  const { api } = useNewsroomRoutes();
  const workload = useWorkload(api);
  const [filter, setFilter] = useState("");
  const search = useId();
  const rows = (workload.data?.rows ?? []).filter((row) => row.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <AdminRoot toaster={false} className="byline-workload">
      <main className="mx-auto flex w-full min-w-0 max-w-[960px] flex-col gap-5 px-4 py-6 lg:px-6" data-byline-workload-screen="">
        <header className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workload</h1>
          <p className="max-w-prose text-sm text-muted-foreground">What’s on each person’s plate right now, to help when you assign work. These are counts, not measures of anyone’s performance, and they never stop an assignment.</p>
        </header>
        <TeamNav current="workload" />
        <div className="grid max-w-sm gap-1.5">
          <label htmlFor={search} className="text-sm font-medium">Find a person</label>
          <Input id={search} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search people…" />
        </div>

        {workload.isError ? <Alert variant="destructive"><AlertTitle>Workload couldn’t be loaded</AlertTitle><AlertDescription>{problemsOf(workload.error)[0]}</AlertDescription><AlertAction><Button type="button" size="sm" variant="outline" onClick={() => void workload.refetch()}>Try again</Button></AlertAction></Alert> : null}
        {workload.isPending ? <div className="grid gap-2" aria-busy="true">{[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-10" />)}</div> : null}
        {workload.data && !rows.length ? <Empty><EmptyHeader><EmptyTitle>No one found</EmptyTitle><EmptyDescription>{filter ? "No one matches that search." : "There are no people with accounts yet."}</EmptyDescription></EmptyHeader></Empty> : null}

        {rows.length ? (
          <>
            <div className="hidden md:block">
              <Table>
                <caption className="sr-only">Work assigned to each person, in alphabetical order</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Person</TableHead>
                    {COLUMNS.map((column) => <TableHead key={column.key} scope="col" className="text-right">{column.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableHead scope="row" className="font-medium">{row.name}</TableHead>
                      {COLUMNS.map((column) => <TableCell key={column.key} className="text-right tabular-nums">{row[column.key]}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ItemGroup className="rounded-lg border border-border md:hidden" aria-label="Work assigned to each person">
              {rows.map((row, index) => (
                <div key={row.userId}>
                  {index ? <ItemSeparator /> : null}
                  <Item size="sm">
                    <ItemContent>
                      <ItemTitle>{row.name}</ItemTitle>
                      <ItemDescription>{workloadHint(row) || "Nothing assigned."}</ItemDescription>
                    </ItemContent>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          </>
        ) : null}
      </main>
    </AdminRoot>
  );
}
