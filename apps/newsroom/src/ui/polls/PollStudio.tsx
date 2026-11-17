"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge, type StatusTone } from "@byline/newsroom-ui/components/status-badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@byline/newsroom-ui/ui/breadcrumb";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card } from "@byline/newsroom-ui/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileSpreadsheet, FileText, MapPin, MoreHorizontal, Plus, Radio, Vote } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, type ReactNode } from "react";
import { EXAMPLE_WORKBOOK_FILE, SPREADSHEET_GUIDE_FILE, TEMPLATE_WORKBOOK_FILE } from "../../polls/workbooks/example";
import { useNewsroomRoutes } from "../shell/account";
import { useShellNavigation } from "../shell/navigation";
import { createSurvey, fetchOverview, fileHref, formatWhen, pollKeys, STATUS_LABEL, type PollsOverview } from "./api";
import { Fieldwork, SessionRows } from "./Fieldwork";
import { ImportFlow } from "./ImportFlow";
import { Locations } from "./Locations";
import { SurveyWorkspace, type SurveyTab } from "./SurveyWorkspace";

/**
 * Poll Studio (`/admin/polls`, docs/wildcat-polls.md). The address is the
 * state, moved through the shell's navigation:
 *
 *   (none)                    every poll you can see, and sessions running now
 *   ?view=fieldwork[&poll=]   start a polling session and hand the device over
 *   ?view=import[&poll=]      upload → validate → review → preview → publish
 *   ?view=locations           where fieldwork happens (editors)
 *   ?poll=<id>&tab=<tab>      one poll: overview, questions, preview, results, fieldwork, settings
 */
export type PollsTarget = { view?: "fieldwork" | "import" | "locations"; poll?: number; tab?: SurveyTab };

export function usePollsNavigation() {
  const { admin } = useNewsroomRoutes();
  const { navigate } = useShellNavigation();
  return useCallback((target: PollsTarget) => {
    const search = new URLSearchParams();
    if (target.view) search.set("view", target.view);
    if (target.poll) search.set("poll", String(target.poll));
    if (target.tab && target.tab !== "overview") search.set("tab", target.tab);
    const query = search.toString();
    navigate(`${admin}/polls${query ? `?${query}` : ""}`);
  }, [admin, navigate]);
}

const positive = (value: string | null | undefined) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const TABS: readonly SurveyTab[] = ["overview", "questions", "preview", "results", "fieldwork", "settings"];

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
  const tab = TABS.find((entry) => entry === params?.get("tab")) ?? "overview";
  if (view === "fieldwork") return <Fieldwork key={`fieldwork-${poll ?? ""}`} preselect={poll} />;
  if (view === "import") return <ImportFlow key={`import-${poll ?? ""}`} pollId={poll} />;
  if (view === "locations") return <Locations />;
  if (poll) return <SurveyWorkspace key={`poll-${poll}`} id={poll} tab={tab} />;
  return <PollsHome />;
}

/** The workspace header, as Data draws it: a title, a short muted line, actions on the right. */
export function PageHeader({ title, description, actions, status, level = "page" }: { title: string; description?: ReactNode; actions?: ReactNode; status?: ReactNode; level?: "page" | "detail" }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className={level === "page" ? "text-2xl font-semibold tracking-tight" : "text-xl font-semibold tracking-tight"}>{title}</h1>
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
      <DropdownMenuItem render={<a href={fileHref(api, TEMPLATE_WORKBOOK_FILE)} download />}><FileSpreadsheet />Blank template (.xlsx)</DropdownMenuItem>
      <DropdownMenuItem render={<a href={fileHref(api, EXAMPLE_WORKBOOK_FILE)} download />}><FileSpreadsheet />Example workbook (.xlsx)</DropdownMenuItem>
      <DropdownMenuItem render={<a href={fileHref(api, SPREADSHEET_GUIDE_FILE)} download />}><FileText />Format guide (.md)</DropdownMenuItem>
    </DropdownMenuGroup>
  );
}

function PollsHome() {
  const { api } = useNewsroomRoutes();
  const go = usePollsNavigation();
  const queries = useQueryClient();
  const overview = useQuery({ queryKey: pollKeys.overview(), queryFn: () => fetchOverview(api) });
  const data = overview.data;
  const manage = data?.me.canManage ?? false;
  const created = async ({ id }: { id: number }, tab: SurveyTab) => { await queries.invalidateQueries({ queryKey: pollKeys.all }); go({ poll: id, tab }); };
  const example = useMutation({ mutationFn: () => createSurvey(api, { example: true }), onSuccess: (result) => created(result, "overview") });
  const blank = useMutation({ mutationFn: () => createSurvey(api, { title: "Untitled poll" }), onSuccess: (result) => created(result, "questions") });
  const canFieldwork = data?.surveys.some((survey) => survey.canInterview) ?? false;

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 py-6 lg:px-6" data-polls-home="">
      <PageHeader
        title="Polls"
        description={manage ? "Create and run student surveys, then analyze the results." : "Run fieldwork for the polls you've been given, and read the results you can see."}
        actions={data ? (
          <>
            {canFieldwork ? <Button type="button" variant={manage ? "outline" : "default"} onClick={() => go({ view: "fieldwork" })}><Radio data-icon="inline-start" />Start fieldwork</Button> : null}
            {manage ? (
              <>
                <Button type="button" onClick={() => go({ view: "import" })}><FileSpreadsheet data-icon="inline-start" />Import spreadsheet</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" aria-label="More poll actions" />}><MoreHorizontal /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => blank.mutate()}><Plus />New blank poll</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => example.mutate()}><Copy />Add the example poll</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => go({ view: "locations" })}><MapPin />Polling locations</DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <TemplateItems api={api} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </>
        ) : null}
      />

      {overview.isError ? <InlineAlert title="Polls aren't available" onAction={() => void overview.refetch()}>{(overview.error as Error).message}</InlineAlert> : null}
      {example.isError || blank.isError ? <InlineAlert title="The poll wasn't created">{((example.error ?? blank.error) as Error).message}</InlineAlert> : null}

      {data?.sessions.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="polls-running">
          <h2 id="polls-running" className="text-sm font-semibold">Fieldwork running now</h2>
          <SessionRows sessions={data.sessions} meId={data.me.id} manage={manage} showSurvey timeZone={data.timeZone} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="polls-list">
        <h2 id="polls-list" className="sr-only">Polls</h2>
        {!data ? <ListSkeleton /> : data.surveys.length ? <SurveyTable data={data} onOpen={(id) => go({ poll: id })} /> : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Vote /></EmptyMedia>
              <EmptyTitle>{manage ? "No polls yet" : "No polls for you yet"}</EmptyTitle>
              <EmptyDescription>{manage ? "Import a workbook, or start from the example poll." : "When an editor gives you fieldwork or results for a poll, it appears here."}</EmptyDescription>
            </EmptyHeader>
            {manage ? (
              <EmptyContent className="flex-row flex-wrap justify-center">
                <Button type="button" onClick={() => go({ view: "import" })}>Import spreadsheet</Button>
                <Button type="button" variant="outline" disabled={example.isPending} onClick={() => example.mutate()}>{example.isPending ? <Spinner data-icon="inline-start" /> : null}Add the example poll</Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </section>
    </main>
  );
}

/** A row that opens on click anywhere; its title button is the keyboard and screen-reader target. */
function openable(onOpen: () => void) {
  return {
    className: "cursor-pointer",
    onClick: (event: { target: EventTarget }) => {
      if ((event.target as HTMLElement).closest("a,button")) return;
      onOpen();
    }
  };
}

function SurveyTable({ data, onOpen }: { data: PollsOverview; onOpen: (id: number) => void }) {
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[46%]">Poll</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Version</TableHead>
            <TableHead className="text-right">Responses</TableHead>
            <TableHead className="hidden text-right md:table-cell">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.surveys.map((survey) => (
            <TableRow key={survey.id} {...openable(() => onOpen(survey.id))} data-polls-row={survey.id}>
              <TableCell className="max-w-0 whitespace-normal">
                <Button type="button" variant="ghost" size="sm" className="h-auto min-h-0 justify-start rounded-none p-0 text-left font-medium whitespace-normal hover:bg-transparent hover:underline any-pointer-coarse:min-h-0" onClick={() => onOpen(survey.id)}>{survey.title}</Button>
                {survey.description ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{survey.description}</p> : null}
              </TableCell>
              <TableCell><PollStatus status={survey.status} /></TableCell>
              <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{survey.versionNumber ? `v${survey.versionNumber}` : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{survey.canViewResults ? survey.responses.toLocaleString("en-US") : "—"}</TableCell>
              <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">{formatWhen(survey.updatedAt, data.timeZone)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function ListSkeleton() {
  return <div className="grid gap-2" aria-hidden="true">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-12 w-full" />)}</div>;
}
