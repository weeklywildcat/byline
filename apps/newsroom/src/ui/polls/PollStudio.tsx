"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge, type StatusTone } from "@byline/newsroom-ui/components/status-badge";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@byline/newsroom-ui/ui/breadcrumb";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Copy, FileSpreadsheet, FileText, MapPin, MoreHorizontal, Plus, Radio, Search, Upload, Vote } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EXAMPLE_WORKBOOK_FILE, SPREADSHEET_GUIDE_FILE, TEMPLATE_WORKBOOK_FILE } from "../../polls/workbooks/example";
import { useNewsroomRoutes } from "../shell/account";
import { useBylineCreate } from "../shell/create";
import { useShellNavigation } from "../shell/navigation";
import { createSurvey, fetchOverview, fileHref, formatWhen, pollKeys, saveFile, STATUS_LABEL, type PollsOverview } from "./api";
import { Fieldwork, SessionRows } from "./Fieldwork";
import { ImportFlow } from "./ImportFlow";
import { Locations } from "./Locations";
import { SurveyWorkspace, surveyTab, type SurveyTab } from "./SurveyWorkspace";

/**
 * Poll Studio (`/admin/polls`, docs/wildcat-polls.md). The address is the
 * state, moved through the shell's navigation:
 *
 *   (none)                    every poll you can see, and fieldwork running now
 *   ?view=fieldwork           choose a poll, then set up fieldwork
 *   ?view=import[&poll=]      upload → validate → review → preview → publish
 *   ?view=locations           where fieldwork happens (editors)
 *   ?poll=<id>&tab=<tab>      one poll: overview, build, preview, collect, results, settings
 *
 * The older `tab=questions` and `tab=fieldwork` (and `view=fieldwork&poll=`)
 * still open Build and Collect.
 */
export type PollsTarget = { view?: "fieldwork" | "import" | "locations"; poll?: number; tab?: SurveyTab; start?: boolean };

export function usePollsNavigation() {
  const { admin } = useNewsroomRoutes();
  const { navigate } = useShellNavigation();
  return useCallback((target: PollsTarget) => {
    const search = new URLSearchParams();
    if (target.view) search.set("view", target.view);
    if (target.poll) search.set("poll", String(target.poll));
    if (target.tab && target.tab !== "overview") search.set("tab", target.tab);
    if (target.start) search.set("start", "1");
    const query = search.toString();
    navigate(`${admin}/polls${query ? `?${query}` : ""}`);
  }, [admin, navigate]);
}

const positive = (value: string | null | undefined) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export function PollStudio(_props: { api: string; admin: string }) {
  // A page restored from the back/forward cache after the account signed out (a kiosk started) must not show results.
  useEffect(() => {
    const reload = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", reload);
    return () => window.removeEventListener("pageshow", reload);
  }, []);
  return (
    <AdminRoot toaster={false} className="byline-polls-studio">
      <PollsRouter />
    </AdminRoot>
  );
}

function PollsRouter() {
  const params = useSearchParams();
  const view = params?.get("view");
  const poll = positive(params?.get("poll"));
  const start = params?.get("start") === "1";
  const setupDevice = params?.get("setupDevice") === "1";
  if (view === "fieldwork" && poll) return <SurveyWorkspace key={`poll-${poll}`} id={poll} tab="collect" startFieldwork />;
  if (view === "fieldwork") return <Fieldwork key={setupDevice ? "device-setup" : "fieldwork"} setupDevice={setupDevice} />;
  if (view === "import") return <ImportFlow key={`import-${poll ?? ""}`} pollId={poll} />;
  if (view === "locations") return <Locations />;
  if (poll) return <SurveyWorkspace key={`poll-${poll}`} id={poll} tab={surveyTab(params?.get("tab"))} startFieldwork={start} />;
  return <PollsHome />;
}

/** The workspace header, as Data draws it: a title, a short muted line, actions on the right. */
export function PageHeader({ title, description, actions, status, level = "page" }: { title: string; description?: ReactNode; actions?: ReactNode; status?: ReactNode; level?: "page" | "detail" }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className={level === "page" ? "text-2xl font-semibold tracking-tight" : "text-xl font-semibold tracking-tight text-balance"}>{title}</h1>
          {status}
        </div>
        {description ? <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Where a Poll Studio page sits, as the Data workspace shows it: Polls, then the poll, then the page. */
export function PollsBreadcrumb({ trail }: { trail: Array<{ label: string; target?: PollsTarget }> }) {
  const go = usePollsNavigation();
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink render={<button type="button" onClick={() => go({})} />}>Polls</BreadcrumbLink></BreadcrumbItem>
        {trail.map((crumb, index) => (
          <Fragment key={`${crumb.label}-${index}`}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {crumb.target && index < trail.length - 1
                ? <BreadcrumbLink className="max-w-[24ch] truncate" render={<button type="button" onClick={() => go(crumb.target!)} />}>{crumb.label}</BreadcrumbLink>
                : <BreadcrumbPage className="max-w-[32ch] truncate">{crumb.label}</BreadcrumbPage>}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

const STATUS_TONE: Record<string, StatusTone> = { draft: "neutral", open: "done", closed: "neutral", archived: "neutral" };

/** A poll's status in the newsroom's three looks. */
export function PollStatus({ status }: { status: string }) {
  return <StatusBadge tone={STATUS_TONE[status] ?? "neutral"} data-polls-status={status}>{STATUS_LABEL[status] ?? status}</StatusBadge>;
}

/** The spreadsheet format's downloads, as items of a menu that already exists. */
export function TemplateItems({ api }: { api: string }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Spreadsheet format</DropdownMenuLabel>
      <DropdownMenuItem onClick={saveFile(fileHref(api, TEMPLATE_WORKBOOK_FILE), TEMPLATE_WORKBOOK_FILE)}><FileSpreadsheet />Blank template (.xlsx)</DropdownMenuItem>
      <DropdownMenuItem onClick={saveFile(fileHref(api, EXAMPLE_WORKBOOK_FILE), EXAMPLE_WORKBOOK_FILE)}><FileSpreadsheet />Example workbook (.xlsx)</DropdownMenuItem>
      <DropdownMenuItem onClick={saveFile(fileHref(api, SPREADSHEET_GUIDE_FILE), SPREADSHEET_GUIDE_FILE)}><FileText />Format guide (.md)</DropdownMenuItem>
    </DropdownMenuGroup>
  );
}

type Filter = "all" | "open" | "draft" | "closed" | "archived";
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" }, { value: "open", label: "Open" }, { value: "draft", label: "Draft" }, { value: "closed", label: "Closed" }, { value: "archived", label: "Archived" }
];

function PollsHome() {
  const { api } = useNewsroomRoutes();
  const go = usePollsNavigation();
  const { openCreate } = useBylineCreate();
  const queries = useQueryClient();
  const overview = useQuery({ queryKey: pollKeys.overview(), queryFn: () => fetchOverview(api) });
  const data = overview.data;
  const manage = data?.me.canManage ?? false;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const example = useMutation({
    mutationFn: () => createSurvey(api, { example: true }),
    onSuccess: async ({ id }) => { await queries.invalidateQueries({ queryKey: pollKeys.all }); go({ poll: id }); }
  });
  const canFieldwork = data?.surveys.some((survey) => survey.canInterview) ?? false;
  const counts = useMemo(() => {
    const map = new Map<Filter, number>([["all", 0]]);
    for (const survey of data?.surveys ?? []) {
      map.set("all", (map.get("all") ?? 0) + (survey.status === "archived" ? 0 : 1));
      map.set(survey.status as Filter, (map.get(survey.status as Filter) ?? 0) + 1);
    }
    return map;
  }, [data]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.surveys ?? []).filter((survey) => (filter === "all" ? survey.status !== "archived" : survey.status === filter) && (!needle || `${survey.title} ${survey.description}`.toLowerCase().includes(needle)));
  }, [data, filter, search]);

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 py-6 lg:px-6" data-polls-home="">
      <PageHeader
        title="Polls"
        description={manage ? "Build a poll, collect answers in person or by link, and read the results." : "Run fieldwork for the polls you've been given, and read the results you can see."}
        actions={data ? (
          <>
            {canFieldwork ? <Button type="button" variant="outline" onClick={() => go({ view: "fieldwork" })}><Radio data-icon="inline-start" />Start fieldwork</Button> : null}
            {manage ? (
              <>
                <Button type="button" variant="outline" onClick={() => go({ view: "import" })}><Upload data-icon="inline-start" />Import</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" aria-label="More poll actions" />}><MoreHorizontal /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => example.mutate()}><Copy />Add the example poll</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => go({ view: "locations" })}><MapPin />Polling locations</DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <TemplateItems api={api} />
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button type="button" onClick={() => openCreate("poll")}><Plus data-icon="inline-start" />New poll</Button>
              </>
            ) : null}
          </>
        ) : null}
      />

      {overview.isError ? <InlineAlert title="Polls aren't available" onAction={() => void overview.refetch()}>{(overview.error as Error).message}</InlineAlert> : null}
      {example.isError ? <InlineAlert title="The poll wasn't created">{(example.error as Error).message}</InlineAlert> : null}

      {data?.sessions.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="polls-running">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="polls-running" className="text-sm font-semibold">Fieldwork running now</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{data.sessions.length} {data.sessions.length === 1 ? "session" : "sessions"}</span>
          </div>
          <SessionRows sessions={data.sessions} meId={data.me.id} manage={manage} showSurvey timeZone={data.timeZone} onOpenSurvey={(id) => go({ poll: id, tab: "collect" })} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="polls-list">
        <h2 id="polls-list" className="sr-only">Polls</h2>
        {data?.surveys.length ? (
          <div className="flex flex-wrap items-center gap-2" role="search">
            <InputGroup className="w-full sm:w-72">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search polls" aria-label="Search polls" />
            </InputGroup>
            <ToggleGroup variant="outline" size="sm" aria-label="Show polls" className="max-w-full overflow-x-auto" value={[filter]} onValueChange={(next: unknown[]) => { if (typeof next[0] === "string") setFilter(next[0] as Filter); }}>
              {FILTERS.map((entry) => (
                <ToggleGroupItem key={entry.value} value={entry.value} className="gap-1.5">
                  {entry.label}
                  {counts.get(entry.value) ? <span className="text-muted-foreground tabular-nums">{counts.get(entry.value)}</span> : null}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}
        {!data ? <ListSkeleton /> : data.surveys.length ? (
          shown.length ? <PollRows data={data} surveys={shown} onOpen={(id) => go({ poll: id })} /> : (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No polls match</EmptyTitle>
                <EmptyDescription>{search ? "Try another search, or look under All." : "Nothing here yet."}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent><Button type="button" variant="outline" onClick={() => { setSearch(""); setFilter("all"); }}>Show all polls</Button></EmptyContent>
            </Empty>
          )
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Vote /></EmptyMedia>
              <EmptyTitle>{manage ? "No polls yet" : "No polls for you yet"}</EmptyTitle>
              <EmptyDescription>{manage ? "Build one here, import a spreadsheet, or start from the example." : "When an editor gives you fieldwork or results for a poll, it appears here."}</EmptyDescription>
            </EmptyHeader>
            {manage ? (
              <EmptyContent className="flex-row flex-wrap justify-center">
                <Button type="button" onClick={() => openCreate("poll")}><Plus data-icon="inline-start" />New poll</Button>
                <Button type="button" variant="outline" disabled={example.isPending} onClick={() => example.mutate()}>{example.isPending ? <Spinner data-icon="inline-start" /> : null}Add the example poll</Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </section>
    </main>
  );
}

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/** Each poll as an item: what it is, where it stands, and what's happening with it. */
function PollRows({ data, surveys, onOpen }: { data: PollsOverview; surveys: PollsOverview["surveys"]; onOpen: (id: number) => void }) {
  return (
    <ItemGroup className="gap-0 rounded-lg border" data-polls-list="">
      {surveys.map((survey, index) => (
        <Item
          key={survey.id}
          className={index ? "rounded-none border-t-border text-left" : "rounded-none text-left"}
          render={<button type="button" onClick={() => onOpen(survey.id)} data-polls-row={survey.id} />}
        >
          <ItemContent className="min-w-0">
            <ItemTitle className="flex-wrap">
              <span>{survey.title}</span>
              <PollStatus status={survey.status} />
              {survey.draftChanged && survey.versionNumber ? <Badge variant="outline" className="font-normal">Unpublished changes</Badge> : null}
            </ItemTitle>
            <ItemDescription className="tabular-nums">
              {[
                survey.versionNumber ? `Version ${survey.versionNumber}` : "Not published",
                survey.canViewResults ? plural(survey.responses, "response") : null,
                survey.activeSessions ? `${plural(survey.activeSessions, "session")} running` : null,
                survey.publicLink ? "Web link on" : null,
                `Updated ${formatWhen(survey.updatedAt, data.timeZone)}`
              ].filter(Boolean).join(" · ")}
            </ItemDescription>
          </ItemContent>
          <ItemActions><ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

export function ListSkeleton() {
  return <div className="grid gap-2" aria-hidden="true">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-12 w-full" />)}</div>;
}
