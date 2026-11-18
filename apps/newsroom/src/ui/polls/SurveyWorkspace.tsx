"use client";

import { DisabledReason } from "@byline/newsroom-ui/components/disabled-reason";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@byline/newsroom-ui/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ChevronDown, CircleAlert, CircleCheck, Download, Eye, FolderKanban, Hammer, LayoutDashboard, MoreHorizontal, Newspaper, Radio, Settings2, Upload } from "lucide-react";
import { useState, type ComponentType } from "react";
import { hasErrors } from "../../polls/engine/xlsform";
import { useNewsroomRoutes } from "../shell/account";
import { fetchSurvey, formatWhen, pollKeys, publishSurvey, workbookHref, type SurveyDetail } from "./api";
import { Collect } from "./Collect";
import { ListSkeleton, PageHeader, PollsBreadcrumb, PollStatus, usePollsNavigation } from "./PollStudio";
import { BuildEditor } from "./QuestionsEditor";
import { ResultsView } from "./ResultsView";
import { IssueList, PreviewPanel } from "./Review";
import { PollSettings } from "./Settings";

/**
 * One poll (docs/wildcat-polls.md#poll-studio): Overview → Build → Preview →
 * Collect → Results → Settings. Wide screens use the line tabs; narrow ones a
 * single "current section" button that opens the same list in a Drawer, never
 * a strip of six tabs scrolling sideways.
 */
export type SurveyTab = "overview" | "build" | "preview" | "collect" | "results" | "settings";

const LEGACY: Record<string, SurveyTab> = { questions: "build", fieldwork: "collect" };
const TABS: readonly SurveyTab[] = ["overview", "build", "preview", "collect", "results", "settings"];

/** The tab an address asks for; the first names (`questions`, `fieldwork`) still work. */
export function surveyTab(value: string | null | undefined): SurveyTab {
  const name = value ? (LEGACY[value] ?? value) : "overview";
  return TABS.find((entry) => entry === name) ?? "overview";
}

const SECTIONS: Array<{ value: SurveyTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "build", label: "Build", icon: Hammer },
  { value: "preview", label: "Preview", icon: Eye },
  { value: "collect", label: "Collect", icon: Radio },
  { value: "results", label: "Results", icon: BarChart3 },
  { value: "settings", label: "Settings", icon: Settings2 }
];

export function SurveyWorkspace({ id, tab, startFieldwork = false }: { id: number; tab: SurveyTab; startFieldwork?: boolean }) {
  const { api } = useNewsroomRoutes();
  const go = usePollsNavigation();
  const queries = useQueryClient();
  const detail = useQuery({ queryKey: pollKeys.survey(id), queryFn: () => fetchSurvey(api, id) });
  const data = detail.data;
  const manage = data?.survey.canManage ?? false;
  const publish = useMutation({
    mutationFn: () => publishSurvey(api, id, { draftRevision: data?.survey.draftRevision ?? 0 }),
    onSuccess: (next) => { queries.setQueryData(pollKeys.survey(id), next); void queries.invalidateQueries({ queryKey: pollKeys.overview() }); }
  });
  const show: Record<SurveyTab, boolean> = { overview: true, build: manage, preview: true, collect: true, results: data?.survey.canViewResults ?? false, settings: manage };
  const visible = SECTIONS.filter((entry) => show[entry.value]);
  const active = visible.some((entry) => entry.value === tab) ? tab : "overview";
  const blocked = data ? hasErrors(data.draftIssues) : true;
  const pending = manage && Boolean(data?.draft) && Boolean(data?.draftChanged || !data?.current);
  const canPublish = pending && !blocked;

  if (detail.isError) {
    return <main className="mx-auto w-full max-w-[1240px] px-4 py-6 lg:px-6"><InlineAlert title="This poll isn't available" onAction={() => void detail.refetch()}>{(detail.error as Error).message}</InlineAlert></main>;
  }
  if (!data) return <WorkspaceSkeleton />;

  const survey = data.survey;
  const open = (next: SurveyTab) => go({ poll: id, tab: next });
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-4 px-4 py-5 lg:px-6" data-polls-workspace="">
      <PollsBreadcrumb trail={[{ label: survey.title }]} />
      <PageHeader
        level="detail"
        title={survey.title}
        status={<PollStatus status={survey.status} />}
        description={(
          <>
            <span>{data.current ? `Version ${data.current.number}` : "Not published"}</span>
            {survey.canViewResults ? <> · <span className="tabular-nums">{survey.responses.toLocaleString("en-US")} {survey.responses === 1 ? "response" : "responses"}</span></> : null}
            {pending && data.current ? <> · <span className="text-warning">unpublished changes</span></> : null}
          </>
        )}
        actions={(
          <>
            {pending ? (
              <DisabledReason reason={blocked ? "Fix the errors in Build first." : undefined}>
                <Button type="button" disabled={!canPublish || publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? <Spinner data-icon="inline-start" /> : null}{data.current ? "Publish changes" : "Publish"}</Button>
              </DisabledReason>
            ) : null}
            {manage ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" aria-label="More actions for this poll" />}><MoreHorizontal /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => go({ view: "import", poll: id })}><Upload />Import a new version</DropdownMenuItem>
                  {data.draft ? <DropdownMenuItem render={<a href={workbookHref(api, id)} download />}><Download />Download the draft (.xlsx)</DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        )}
      />
      {publish.isError ? <InlineAlert title="Not published">{(publish.error as Error).message}</InlineAlert> : null}

      <PollNav sections={visible} active={active} onChange={open} />

      <div className="pt-2">
        {active === "overview" ? <Overview data={data} onOpen={open} onPublish={canPublish ? () => publish.mutate() : undefined} />
          : active === "build" ? <BuildEditor id={id} data={data} />
          : active === "preview" ? <PreviewTab data={data} />
          : active === "results" ? <ResultsView id={id} />
          : active === "collect" ? <Collect data={data} startFieldwork={startFieldwork} />
          : <PollSettings data={data} />}
      </div>
    </main>
  );
}

/** The poll's sections: line tabs when there's room, otherwise the current one, which opens the list in a Drawer. */
function PollNav({ sections, active, onChange }: { sections: typeof SECTIONS; active: SurveyTab; onChange: (tab: SurveyTab) => void }) {
  const wide = useMediaQuery("(min-width: 768px)", true);
  const [open, setOpen] = useState(false);
  const current = sections.find((entry) => entry.value === active) ?? sections[0];
  if (wide) {
    return (
      <Tabs value={active} onValueChange={(next) => onChange(next as SurveyTab)}>
        <TabsList variant="line" className="w-full justify-start border-b" aria-label="Poll sections">
          {sections.map((entry) => <TabsTrigger key={entry.value} value={entry.value} className="flex-none px-2.5">{entry.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
    );
  }
  const Icon = current.icon;
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger render={<Button type="button" variant="outline" className="w-full justify-between" aria-label={`Poll section: ${current.label}. Change section`} data-polls-section-button="" />}>
        <span className="flex items-center gap-2"><Icon className="size-4" />{current.label}</span>
        <ChevronDown data-icon="inline-end" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Poll sections</DrawerTitle></DrawerHeader>
        <nav aria-label="Poll sections" className="px-2 pb-[max(1rem,var(--byline-safe-bottom))]">
          <ItemGroup>
            {sections.map((entry) => {
              const EntryIcon = entry.icon;
              return (
                <Item key={entry.value} className={cn("text-left", entry.value === active && "bg-muted")}
                  render={<button type="button" aria-current={entry.value === active ? "page" : undefined} onClick={() => { setOpen(false); onChange(entry.value); }} />}>
                  <ItemMedia variant="icon"><EntryIcon /></ItemMedia>
                  <ItemContent><ItemTitle>{entry.label}</ItemTitle></ItemContent>
                </Item>
              );
            })}
          </ItemGroup>
        </nav>
      </DrawerContent>
    </Drawer>
  );
}

function WorkspaceSkeleton() {
  return (
    <main className="mx-auto grid w-full max-w-[1240px] gap-4 px-4 py-5 lg:px-6" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-8 w-full max-w-lg" />
      <ListSkeleton />
    </main>
  );
}

/* ------------------------------------------------------------------ overview */

function Stat({ title, value, detail, action }: { title: string; value: React.ReactNode; detail?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="gap-1">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums">{value}</CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      {detail ? <CardContent className="text-sm text-muted-foreground">{detail}</CardContent> : null}
    </Card>
  );
}

function Check({ ok, children, detail }: { ok: boolean; children: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <Item size="xs" className="items-start px-0">
      <ItemMedia variant="icon" className={ok ? "text-foreground" : "text-warning"}>{ok ? <CircleCheck aria-label="Ready" /> : <CircleAlert aria-label="Not yet" />}</ItemMedia>
      <ItemContent><ItemTitle className="font-normal">{children}</ItemTitle>{detail ? <ItemDescription>{detail}</ItemDescription> : null}</ItemContent>
    </Item>
  );
}

/** Where the poll stands, at a glance. The questions themselves are in Build. */
function Overview({ data, onOpen, onPublish }: { data: SurveyDetail; onOpen: (tab: SurveyTab) => void; onPublish?: () => void }) {
  const { api, admin, story } = useNewsroomRoutes();
  const survey = data.survey;
  const manage = survey.canManage;
  const running = data.sessions.filter((session) => session.status !== "ended");
  const link = survey.publicLinkSettings;
  const errors = data.draftIssues.filter((issue) => issue.severity === "error").length;
  const warnings = data.draftIssues.length - errors;
  const definition = data.current?.definition ?? data.draft;
  const breakdowns = definition?.settings.breakdowns ?? [];
  const pending = manage && Boolean(data.draft) && (data.draftChanged || !data.current);
  return (
    <div className="flex flex-col gap-6" data-polls-overview="">
      {survey.description ? <p className="max-w-3xl text-sm leading-relaxed">{survey.description}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Status" value={<span className="flex items-center gap-2"><PollStatus status={survey.status} /></span>} detail={data.current ? `Version ${data.current.number}, published ${formatWhen(data.versions.find((version) => version.id === data.current?.id)?.publishedAt, data.timeZone)}` : "Not published yet"} />
        {survey.canViewResults ? (
          <Stat title="Responses" value={survey.responses.toLocaleString("en-US")}
            detail={data.responsesByMode ? `${data.responsesByMode.kiosk.toLocaleString("en-US")} in person · ${data.responsesByMode.public.toLocaleString("en-US")} by web link` : undefined}
            action={survey.responses ? <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onOpen("results")}>Results</Button> : undefined} />
        ) : null}
        <Stat title="Fieldwork running" value={running.length} detail={running.length ? running.map((session) => session.locationName).join(", ") : survey.kioskEnabled ? "No sessions right now" : "In-person collection is off"}
          action={<Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onOpen("collect")}>Collect</Button>} />
        <Stat title="Web link" value={survey.publicLink ? "On" : "Off"} detail={link?.enabled ? (link.closesAt ? `Closes ${formatWhen(link.closesAt, data.timeZone)}` : "No closing time") : "Only in-person responses"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {manage ? (
          <Card>
            <CardHeader>
              <CardTitle>Draft</CardTitle>
              <CardDescription>{pending ? (data.current ? "The draft has changes that respondents don't see yet." : "Publish the poll to collect responses.") : "Respondents see exactly the draft."}</CardDescription>
              <CardAction>
                {onPublish ? <Button type="button" size="sm" onClick={onPublish}>{data.current ? "Publish changes" : "Publish"}</Button> : <Button type="button" size="sm" variant="outline" onClick={() => onOpen("build")}>Open Build</Button>}
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm tabular-nums">
                {errors ? <span className="font-medium text-destructive">{errors} {errors === 1 ? "error" : "errors"}</span> : <span>No errors</span>}
                {warnings ? <span className="text-muted-foreground"> · {warnings} {warnings === 1 ? "note" : "notes"}</span> : null}
                <span className="text-muted-foreground"> · {data.draft?.questions.length ?? 0} questions</span>
              </p>
              {data.draftIssues.length ? <IssueList issues={data.draftIssues} max={4} /> : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Ready to report</CardTitle>
            <CardDescription>What a reader of the results will need.</CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-0">
              <Check ok={Boolean(survey.methodology.trim())} detail={survey.methodology.trim() ? undefined : "Who was asked, where, when, how, and what the results can't say. In Settings."}>Methodology note</Check>
              <Check ok detail={`Breakdowns and rates for fewer than ${survey.minimumGroup} respondents are withheld.`}>Smallest reported group: {survey.minimumGroup}</Check>
              <Check ok={breakdowns.length > 0} detail={breakdowns.length ? undefined : "Choose questions such as grade to compare results by, in Build."}>{breakdowns.length ? `Compare by ${breakdowns.length} ${breakdowns.length === 1 ? "question" : "questions"}` : "No comparison questions"}</Check>
              <Check ok={Boolean(survey.linkedStory || survey.linkedCollection)} detail={survey.linkedStory || survey.linkedCollection ? undefined : "Link the Story or Collection it's for, in Settings."}>Linked coverage</Check>
            </ItemGroup>
          </CardContent>
        </Card>

        {survey.linkedStory || survey.linkedCollection ? (
          <Card>
            <CardHeader><CardTitle>Linked coverage</CardTitle><CardDescription>Results are never published automatically.</CardDescription></CardHeader>
            <CardContent>
              <ItemGroup className="gap-0">
                {survey.linkedStory ? (
                  <Item size="xs" className="px-0">
                    <ItemMedia variant="icon"><Newspaper /></ItemMedia>
                    <ItemContent><ItemDescription>Story</ItemDescription><ItemTitle>{survey.linkedStory.title}</ItemTitle></ItemContent>
                    <ItemActions><Button nativeButton={false} variant="ghost" size="sm" render={<a href={story(survey.linkedStory.id)} />}>Open</Button></ItemActions>
                  </Item>
                ) : null}
                {survey.linkedCollection ? (
                  <Item size="xs" className="px-0">
                    <ItemMedia variant="icon"><FolderKanban /></ItemMedia>
                    <ItemContent><ItemDescription>Collection</ItemDescription><ItemTitle>{survey.linkedCollection.title}</ItemTitle></ItemContent>
                    <ItemActions><Button nativeButton={false} variant="ghost" size="sm" render={<a href={`${admin}/collections?collection=${survey.linkedCollection.id}`} />}>Open</Button></ItemActions>
                  </Item>
                ) : null}
              </ItemGroup>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle>Versions</CardTitle><CardDescription>Each published version is kept exactly; every response names the one it answered.</CardDescription></CardHeader>
          <CardContent>
            {data.versions.length ? (
              <ItemGroup className="gap-0">
                {data.versions.slice(0, 5).map((version) => (
                  <Item key={version.id} size="xs" className="px-0">
                    <ItemContent>
                      <ItemTitle>Version {version.number}{version.id === data.current?.id ? <Badge variant="secondary">Current</Badge> : null}</ItemTitle>
                      <ItemDescription>{formatWhen(version.publishedAt, data.timeZone)} · {version.publishedBy || "Someone"} · {version.questionCount} questions{version.note ? ` · ${version.note}` : ""}</ItemDescription>
                    </ItemContent>
                    {manage ? (
                      <ItemActions>
                        <Button nativeButton={false} variant="ghost" size="icon-sm" aria-label={`Download version ${version.number} as a spreadsheet`} render={<a href={workbookHref(api, survey.id, version.id)} download />}><Download /></Button>
                      </ItemActions>
                    ) : null}
                  </Item>
                ))}
              </ItemGroup>
            ) : <p className="text-sm text-muted-foreground">Not published yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ preview */

function PreviewTab({ data }: { data: SurveyDetail }) {
  const [which, setWhich] = useState<"draft" | "current">(data.draftChanged || !data.current ? "draft" : "current");
  const definition = which === "draft" ? data.draft : data.current?.definition;
  return (
    <section className="flex flex-col gap-4">
      {data.draft && data.current ? (
        <Tabs value={which} onValueChange={(value) => setWhich(value as "draft" | "current")}>
          <TabsList>
            <TabsTrigger value="current">Published (v{data.current.number})</TabsTrigger>
            <TabsTrigger value="draft">Draft{data.draftChanged ? " (changed)" : ""}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {definition && definition.questions.length ? <PreviewPanel key={which} definition={definition} frozenImages={which === "current" ? data.current?.images : undefined} /> : <p className="text-sm text-muted-foreground">Add questions to preview the poll.</p>}
    </section>
  );
}
