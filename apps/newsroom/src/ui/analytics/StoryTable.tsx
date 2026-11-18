"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { ChevronDown } from "lucide-react";
import type { StoryRow } from "../../analytics/model";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";
import { ChangeBadge } from "./parts";
import { formatCount, formatDuration } from "./format";

/**
 * Stories with their audience. A table on wide screens; on narrow ones, condensed rows with the
 * most important number and the rest one tap away, never a sideways spreadsheet.
 */
export function StoryTable({ rows, showScrolled = false, empty = "No Stories had readers in this range." }: { rows: StoryRow[]; showScrolled?: boolean; empty?: string }) {
  const { story: storyHref } = useNewsroomRoutes();
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const href = (id: number) => `${storyHref(id)}?view=performance`;
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Story</TableHead><TableHead>Section</TableHead>
              <TableHead className="text-right">Views</TableHead><TableHead className="text-right">Active users</TableHead>
              <TableHead className="text-right">Avg engagement</TableHead>
              {showScrolled ? <TableHead className="text-right">Reached 90%</TableHead> : null}
              <TableHead className="text-right">vs previous</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.story.id}>
                <TableCell className="max-w-xs whitespace-normal"><ShellLink href={href(row.story.id)} className="font-medium hover:underline">{row.story.title}</ShellLink></TableCell>
                <TableCell>{row.story.section ? <Badge variant="secondary">{row.story.section.name}</Badge> : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(row.views)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(row.activeUsers)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDuration(row.engagement)}</TableCell>
                {showScrolled ? <TableCell className="text-right tabular-nums">{row.scrolled === null ? "—" : formatCount(row.scrolled)}</TableCell> : null}
                <TableCell className="text-right"><ChangeBadge change={row.viewsChange} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-2 md:hidden" aria-label="Stories">
        {rows.map((row) => (
          <li key={row.story.id}>
            <details className="group rounded-lg border bg-card">
              <summary className="touch-hit flex cursor-pointer list-none items-start gap-3 p-3">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium leading-snug">{row.story.title}</span>
                  <span className="text-xs text-muted-foreground">{row.story.section?.name ?? "No section"}</span>
                </span>
                <span className="grid shrink-0 justify-items-end"><span className="text-base font-semibold tabular-nums">{formatCount(row.views)}</span><span className="text-xs text-muted-foreground">views</span></span>
                <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t px-3 py-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Active users</dt><dd className="tabular-nums">{formatCount(row.activeUsers)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Avg engagement</dt><dd className="tabular-nums">{formatDuration(row.engagement)}</dd></div>
                {showScrolled ? <div><dt className="text-xs text-muted-foreground">Reached 90%</dt><dd className="tabular-nums">{row.scrolled === null ? "—" : formatCount(row.scrolled)}</dd></div> : null}
                <div><dt className="text-xs text-muted-foreground">vs previous</dt><dd><ChangeBadge change={row.viewsChange} /></dd></div>
                <div className="col-span-2"><ShellLink href={href(row.story.id)} className="touch-hit text-sm font-medium underline underline-offset-2">Open Performance</ShellLink></div>
              </dl>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
