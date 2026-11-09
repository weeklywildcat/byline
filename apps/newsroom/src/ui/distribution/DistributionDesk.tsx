"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DeskView, DistributionDeskPayload } from "../../distribution/server";
import { getJson } from "../story/api";
import { formatDay } from "../story/parts";
import { DistributionSheet, DistributionStateBadge } from "./DistributionSheet";

const VIEWS: Array<{ id: DeskView; label: string; empty: string }> = [
  { id: "attention", label: "Needs attention", empty: "No Distribution work needs attention." },
  { id: "drafts", label: "Drafts", empty: "No drafts in progress." },
  { id: "ready", label: "Ready", empty: "Nothing is waiting to go out." },
  { id: "scheduled", label: "Scheduled", empty: "Nothing is scheduled." },
  { id: "posted", label: "Posted", empty: "Nothing has gone out yet." }
];
const ANY = "__any__";
const WHEN = [{ value: ANY, label: "Any time" }, { value: "today", label: "Today" }, { value: "week", label: "Next 7 days" }, { value: "past-week", label: "Past 7 days" }];

type Filters = { view: DeskView; destination: string; owner: string; section: string; when: string; q: string };
const EMPTY: Filters = { view: "attention", destination: "", owner: "", section: "", when: "", q: "" };

const read = (): Filters => {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const view = params.get("view");
  return {
    view: VIEWS.some((entry) => entry.id === view) ? (view as DeskView) : "attention",
    destination: params.get("destination") ?? "", owner: params.get("owner") ?? "", section: params.get("section") ?? "", when: params.get("when") ?? "", q: params.get("q") ?? ""
  };
};
const search = (filters: Filters) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && !(key === "view" && value === "attention")) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export function DistributionDesk({ api, admin, timeZone, userId }: { api: string; admin: string; timeZone: string; userId: number }) {
  // AdminRoot mounts its children a render late; the desk lives inside it.
  return <AdminRoot className="byline-distribution" toaster={false}><DeskBody api={api} admin={admin} timeZone={timeZone} userId={userId} /></AdminRoot>;
}

/** Filters live in the address (Back/Forward work); typing in search replaces rather than pushes. */
function useDeskFilters() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  useEffect(() => {
    setFilters(read());
    const pop = () => setFilters(read());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const update = useCallback((patch: Partial<Filters>, replace = false) => {
    const next = { ...read(), ...patch };
    const query = search(next);
    if (window.location.search !== query) window.history[replace ? "replaceState" : "pushState"](null, "", `${window.location.pathname}${query}`);
    setFilters(next);
  }, []);
  return [filters, update] as const;
}

function DeskBody({ api, admin, timeZone, userId }: { api: string; admin: string; timeZone: string; userId: number }) {
  const [filters, update] = useDeskFilters();
  const [text, setText] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setText(filters.q), [filters.q]);
  useEffect(() => {
    if (text === filters.q) return;
    const timer = setTimeout(() => update({ q: text.trim() }, true), 300);
    return () => clearTimeout(timer);
  }, [text, filters.q, update]);
  const desk = useQuery({
    queryKey: ["byline", "distribution-desk", filters],
    queryFn: () => getJson<DistributionDeskPayload>(api, `/byline/distribution${search(filters)}`),
    placeholderData: keepPreviousData
  });
  const data = desk.data;
  const meta = VIEWS.find((entry) => entry.id === filters.view)!;
  const owners = [{ value: ANY, label: "Anyone" }, { value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...(data?.owners ?? []).map((owner) => ({ value: String(owner.id), label: owner.name }))];
  const destinations = [{ value: ANY, label: "All destinations" }, ...(data?.destinations ?? []).map((entry) => ({ value: entry.kind, label: entry.label }))];
  const sections = [{ value: ANY, label: "All sections" }, ...(data?.sections ?? []).map((entry) => ({ value: String(entry.id), label: entry.name }))];
  const filtered = Boolean(filters.destination || filters.owner || filters.section || filters.when || filters.q);
  const choose = (key: keyof Filters) => (value: unknown) => update({ [key]: !value || value === ANY ? "" : String(value) });

  if (desk.isError && !data) return <div className="p-6"><InlineAlert title="Distribution isn't available" onAction={() => void desk.refetch()}>{(desk.error as Error).message}</InlineAlert></div>;
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-4 p-4 md:p-6">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">Distribution</h1>
        <p className="text-sm text-muted-foreground">What still needs to go out, who owns it, and what actually did.</p>
      </header>

      <Tabs value={filters.view} onValueChange={(value) => update({ view: value as DeskView })}>
        <TabsList className="max-w-full flex-wrap justify-start gap-y-1 group-data-horizontal/tabs:h-auto">
          {VIEWS.map((entry) => <TabsTrigger key={entry.id} value={entry.id} className="h-auto min-h-6">{entry.label}{data ? <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{data.counts[entry.id]}</span> : null}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2" role="search">
        <InputGroup className="min-w-48 flex-1 sm:max-w-xs">
          <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput type="search" value={text} placeholder="Search Stories…" aria-label="Search Stories" onChange={(event) => setText(event.target.value)} />
        </InputGroup>
        <Select items={destinations} value={filters.destination || ANY} onValueChange={choose("destination")}><SelectTrigger aria-label="Destination" className="w-44"><SelectValue /></SelectTrigger><SelectContent>{destinations.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        <Select items={owners} value={filters.owner || ANY} onValueChange={choose("owner")}><SelectTrigger aria-label="Owner" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{owners.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        <Select items={sections} value={filters.section || ANY} onValueChange={choose("section")}><SelectTrigger aria-label="Section" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{sections.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        <Select items={WHEN} value={filters.when || ANY} onValueChange={choose("when")}><SelectTrigger aria-label="When" className="w-36"><SelectValue /></SelectTrigger><SelectContent>{WHEN.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        {filtered ? <Button type="button" variant="ghost" size="sm" onClick={() => update({ destination: "", owner: "", section: "", when: "", q: "" })}><X data-icon="inline-start" />Clear</Button> : null}
      </div>

      {!data ? <div className="grid gap-2" aria-busy="true"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div> : !data.rows.length ? (
        <Empty className="border border-dashed py-10">
          <EmptyHeader><EmptyTitle>{filtered ? "Nothing matches." : meta.empty}</EmptyTitle>{filtered ? <EmptyDescription>Try clearing a filter.</EmptyDescription> : null}</EmptyHeader>
        </Empty>
      ) : (
        <div className={desk.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Story</TableHead>
                <TableHead className="hidden sm:table-cell">Destination</TableHead>
                <TableHead className="hidden sm:table-cell">State</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead className="hidden lg:table-cell">When</TableHead>
                <TableHead className="text-right">Next</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpen(row.id)}>
                  <TableCell className="max-w-72 min-w-0 whitespace-normal sm:min-w-32">
                    <button type="button" className="text-left font-medium [overflow-wrap:anywhere] hover:underline focus-visible:underline" onClick={(event) => { event.stopPropagation(); setOpen(row.id); }}>{row.story}</button>
                    <span className="block text-xs text-muted-foreground">{[row.section, row.published ? null : "Unpublished"].filter(Boolean).join(" · ")}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:hidden">
                      <span>{row.label}</span>
                      <DistributionStateBadge state={row.state} label={row.stateLabel} />
                      {row.attention && row.attention !== row.stateLabel ? <span className="text-muted-foreground">{row.attention}</span> : null}
                      {row.owner ? <span className="text-muted-foreground">{row.owner.name}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell">{row.label}</TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell"><div className="flex flex-wrap items-center gap-1.5"><DistributionStateBadge state={row.state} label={row.stateLabel} />{row.attention && row.attention !== row.stateLabel ? <span className="text-xs text-muted-foreground">{row.attention}</span> : null}</div></TableCell>
                  <TableCell className="hidden md:table-cell">{row.owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="hidden lg:table-cell">{row.time ? <span><span className="text-xs text-muted-foreground">{row.time.label} </span>{formatDay(row.time.at, timeZone)}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right"><Button type="button" variant="ghost" size="sm" aria-label={`${row.nextAction}: ${row.story}, ${row.label}`} onClick={(event) => { event.stopPropagation(); setOpen(row.id); }}>{row.nextAction}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.truncated && filters.view === "posted" ? <p className="pt-2 text-xs text-muted-foreground">Showing the newest {data.rows.length}. Older posts are on their Stories.</p> : null}
        </div>
      )}
      <DistributionSheet api={api} admin={admin} showStory itemId={open} timeZone={timeZone} userId={userId} onClose={() => setOpen(null)} />
    </div>
  );
}
