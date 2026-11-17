"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, FileSpreadsheet, MapPin, MoreHorizontal, Plus, Radio } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, type ReactNode } from "react";
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
      <div className="byline-polls min-h-full">
        <PollsRouter />
      </div>
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

export function PageHeader({ kicker = "Wildcat Polls", title, description, actions, back }: { kicker?: string; title: string; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.12em] text-(--poll-accent) uppercase">{kicker}</p>
          <h1 className="mt-1.5 font-(family-name:--poll-serif) text-[2rem] leading-tight font-medium text-balance">{title}</h1>
          {description ? <div className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "open" ? "default" : "outline"} className={status === "open" ? "bg-(--poll-accent) text-white" : undefined}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function TemplatesMenu({ api, align = "end" }: { api: string; align?: "start" | "end" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" />}><Download data-icon="inline-start" />Templates<ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-80">
        <DropdownMenuLabel>Spreadsheet format</DropdownMenuLabel>
        <DropdownMenuItem render={<a href={fileHref(api, TEMPLATE_WORKBOOK_FILE)} download />}><FileSpreadsheet />Blank template (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem render={<a href={fileHref(api, EXAMPLE_WORKBOOK_FILE)} download />}><FileSpreadsheet />Example: AI at Ninety Six High School</DropdownMenuItem>
        <DropdownMenuItem render={<a href={fileHref(api, SPREADSHEET_GUIDE_FILE)} download />}><Download />Guide for people and AI assistants (.md)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-8 px-4 py-6 lg:px-6" data-polls-home="">
      <PageHeader
        title="Polls"
        description={manage ? "Write a poll as a spreadsheet or here, test every path, publish it, then run fieldwork on an iPad." : "Run fieldwork for the polls you've been given, and read the results you have access to."}
        actions={data ? (
          <>
            {canFieldwork ? <Button type="button" variant={manage ? "outline" : "default"} onClick={() => go({ view: "fieldwork" })}><Radio data-icon="inline-start" />Start fieldwork</Button> : null}
            {manage ? (
              <>
                <TemplatesMenu api={api} />
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" aria-label="More poll actions" />}><MoreHorizontal /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => blank.mutate()}><Plus />New blank poll</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => example.mutate()}><FileSpreadsheet />Add the example poll</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => go({ view: "locations" })}><MapPin />Polling locations</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button type="button" onClick={() => go({ view: "import" })}><FileSpreadsheet data-icon="inline-start" />Import spreadsheet</Button>
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
          <Empty className="border border-dashed py-14">
            <EmptyHeader>
              <EmptyTitle className="font-(family-name:--poll-serif) text-2xl font-medium">{manage ? "No polls yet" : "No polls for you yet"}</EmptyTitle>
              <EmptyDescription className="max-w-md">{manage ? "Import a workbook (an AI assistant can write one from the guide in Templates), start from the example, or build one here." : "When an editor gives you fieldwork or results for a poll, it appears here."}</EmptyDescription>
            </EmptyHeader>
            {manage ? (
              <EmptyContent className="flex-row flex-wrap justify-center">
                <Button type="button" onClick={() => go({ view: "import" })}><FileSpreadsheet data-icon="inline-start" />Import spreadsheet</Button>
                <Button type="button" variant="outline" disabled={example.isPending} onClick={() => example.mutate()}>{example.isPending ? <Spinner /> : null}Add the example poll</Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </section>
    </main>
  );
}

function SurveyTable({ data, onOpen }: { data: PollsOverview; onOpen: (id: number) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[46%]">Poll</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Version</TableHead>
            <TableHead className="text-right">Responses</TableHead>
            <TableHead className="hidden text-right md:table-cell">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.surveys.map((survey) => (
            <TableRow key={survey.id} className="cursor-pointer" onClick={() => onOpen(survey.id)}>
              <TableCell className="py-3">
                <button type="button" className="text-left text-[0.9375rem] font-medium outline-none hover:underline focus-visible:underline" onClick={(event) => { event.stopPropagation(); onOpen(survey.id); }}>{survey.title}</button>
                {survey.description ? <p className="mt-0.5 line-clamp-1 max-w-xl text-xs text-muted-foreground">{survey.description}</p> : null}
              </TableCell>
              <TableCell><StatusBadge status={survey.status} /></TableCell>
              <TableCell className="text-right tabular-nums">{survey.versionNumber ? `v${survey.versionNumber}` : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{survey.canViewResults ? survey.responses : "—"}</TableCell>
              <TableCell className="hidden text-right text-muted-foreground md:table-cell">{formatWhen(survey.updatedAt, data.timeZone)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ListSkeleton() {
  return <div className="flex flex-col gap-2">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>;
}
