"use client";

import { Input } from "@byline/newsroom-ui/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { useId } from "react";
import type { ContentDto } from "../../analytics/model";
import { useReport } from "./api";
import { formatCount } from "./format";
import { Body, Panel, ProblemAlert, UpdatedBar } from "./parts";
import { StoryTable } from "./StoryTable";

export type ContentFilterState = { section: string; author: string; topic: string; story: string; q: string };

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="any-pointer-coarse:min-h-11 h-8 w-full min-w-36 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-44">
        <option value="">All</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

/** Content: GA joined to Byline's Stories. Filters use Byline's own section, author and topic data; none of it is sent to Google. */
export function ContentScreen({ search, filters, onFilters }: { search: string; filters: ContentFilterState; onFilters: (next: Partial<ContentFilterState>) => void }) {
  const query = new URLSearchParams(search);
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const report = useReport<ContentDto>("content", query.toString());
  const data = report.data?.data ?? null;
  const loading = report.isPending;
  const searchId = useId();
  if (report.data?.problem) return <ProblemAlert problem={report.data.problem} onRetry={() => void report.refresh()} />;
  const facets = data?.facets;
  return (
    <div className="grid gap-4" aria-busy={loading || report.isFetching}>
      <UpdatedBar meta={data?.meta} onRefresh={() => void report.refresh()} refreshing={report.refreshing} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1"><label htmlFor={searchId} className="text-xs text-muted-foreground">Search Stories</label><Input id={searchId} type="search" value={filters.q} onChange={(event) => onFilters({ q: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} className="w-full sm:w-52" placeholder="Headline" /></div>
        <FilterSelect label="Section" value={filters.section} onChange={(section) => onFilters({ section })} options={(facets?.sections ?? []).map((item) => ({ value: item.slug, label: item.name }))} />
        <FilterSelect label="Author" value={filters.author} onChange={(author) => onFilters({ author })} options={(facets?.authors ?? []).map((item) => ({ value: String(item.id), label: item.name }))} />
        <FilterSelect label="Topic" value={filters.topic} onChange={(topic) => onFilters({ topic })} options={(facets?.topics ?? []).map((item) => ({ value: String(item.id), label: item.name }))} />
      </div>
      {filters.story ? <p className="text-sm text-muted-foreground">Showing one Story. <button type="button" className="touch-hit underline underline-offset-2" onClick={() => onFilters({ story: "" })}>Show all Stories</button></p> : null}
      <Panel title="Stories" description="Every Story is counted once, whether readers arrived by its Byline ID, its address or an older address that now redirects.">
        <Body section={data?.stories} loading={loading} onRetry={() => void report.refresh()} rows={6}>{(rows) => <StoryTable rows={rows} showScrolled empty="No Stories match these filters in this range." />}</Body>
      </Panel>
      {!filters.story && !filters.section && !filters.author && !filters.topic && !filters.q ? (
        <Panel title="Other pages" description={data && data.unmatchedViews ? `${formatCount(data.unmatchedViews)} views on pages that aren't Stories: the homepage, sections, author pages and so on.` : "Pages that aren't Stories."}>
          <Body section={data?.otherPages} loading={loading} onRetry={() => void report.refresh()} empty={(rows) => (rows.length ? null : "No other pages had readers.")}>
            {(rows) => (
              <Table>
                <TableHeader><TableRow><TableHead>Page</TableHead><TableHead className="text-right">Views</TableHead><TableHead className="hidden text-right sm:table-cell">Active users</TableHead></TableRow></TableHeader>
                <TableBody>{rows.map((row) => <TableRow key={row.path}><TableCell className="max-w-xs whitespace-normal"><span className="block font-medium">{row.title && row.title !== "(not set)" ? row.title : row.path}</span><span className="text-xs text-muted-foreground">{row.path}</span></TableCell><TableCell className="text-right tabular-nums">{formatCount(row.views)}</TableCell><TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCount(row.activeUsers)}</TableCell></TableRow>)}</TableBody>
              </Table>
            )}
          </Body>
        </Panel>
      ) : null}
    </div>
  );
}
