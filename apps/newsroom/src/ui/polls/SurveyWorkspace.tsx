"use client";

import { DateTimeField } from "@byline/newsroom-ui/components/date-fields";
import { FormField, TextAreaField, TextField } from "@byline/newsroom-ui/components/form-fields";
import { DisabledReason } from "@byline/newsroom-ui/components/disabled-reason";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, MoreHorizontal, Plus, Radio, Upload, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { instantToLocal, localToInstant } from "../../domain/dates";
import { hasErrors } from "../../polls/engine/xlsform";
import { useNewsroomRoutes } from "../shell/account";
import { deleteSurvey, fetchLinks, fetchPeople, fetchSurvey, formatWhen, pollKeys, publishSurvey, updateSurvey, workbookHref, type SurveyDetail } from "./api";
import { SessionRows } from "./Fieldwork";
import { ListSkeleton, PageHeader, PollsBreadcrumb, PollStatus, usePollsNavigation } from "./PollStudio";
import { QuestionsEditor } from "./QuestionsEditor";
import { ResultsView } from "./ResultsView";
import { SwitchField } from "./fields";
import { IssueList, PreviewPanel, QuestionMap } from "./Review";

export type SurveyTab = "overview" | "questions" | "preview" | "results" | "fieldwork" | "settings";

export function SurveyWorkspace({ id, tab }: { id: number; tab: SurveyTab }) {
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
  const tabs: Array<{ value: SurveyTab; label: string; show: boolean }> = [
    { value: "overview", label: "Overview", show: true },
    { value: "questions", label: "Questions", show: manage },
    { value: "preview", label: "Preview", show: true },
    { value: "results", label: "Results", show: data?.survey.canViewResults ?? false },
    { value: "fieldwork", label: "Fieldwork", show: true },
    { value: "settings", label: "Settings", show: manage }
  ];
  const visible = tabs.filter((entry) => entry.show);
  const active = visible.some((entry) => entry.value === tab) ? tab : "overview";
  const blocked = data ? hasErrors(data.draftIssues) : true;
  const canPublish = manage && Boolean(data?.draft) && !blocked && (data?.draftChanged || !data?.current);

  if (detail.isError) {
    return <main className="mx-auto w-full max-w-[1240px] px-4 py-6 lg:px-6"><InlineAlert title="This poll isn't available" onAction={() => void detail.refetch()}>{(detail.error as Error).message}</InlineAlert></main>;
  }
  if (!data) return <WorkspaceSkeleton />;

  const survey = data.survey;
  const pending = manage && Boolean(data.draft) && (data.draftChanged || !data.current);
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
            {survey.canInterview ? <Button type="button" variant={pending ? "outline" : "default"} onClick={() => go({ view: "fieldwork", poll: id })}><Radio data-icon="inline-start" />Start fieldwork</Button> : null}
            {pending ? (
              <DisabledReason reason={blocked ? "Fix the errors in Questions first." : undefined}>
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

      <Tabs value={active} onValueChange={(next) => go({ poll: id, tab: next as SurveyTab })}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          {visible.map((entry) => <TabsTrigger key={entry.value} value={entry.value}>{entry.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="pt-2">
        {active === "overview" ? <Overview data={data} />
          : active === "questions" ? <QuestionsEditor key={survey.draftRevision} id={id} data={data} />
          : active === "preview" ? <PreviewTab data={data} />
          : active === "results" ? <ResultsView id={id} />
          : active === "fieldwork" ? <FieldworkTab data={data} />
          : <Settings data={data} />}
      </div>
    </main>
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

function Overview({ data }: { data: SurveyDetail }) {
  const { api } = useNewsroomRoutes();
  const definition = data.current?.definition ?? data.draft;
  const manage = data.survey.canManage;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="flex min-w-0 flex-col gap-4">
        {data.survey.description ? <p className="max-w-2xl text-sm leading-relaxed">{data.survey.description}</p> : null}
        {data.draftIssues.length && manage ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{hasErrors(data.draftIssues) ? "The draft can't be published yet" : "Notes on the draft"}</h2>
            <IssueList issues={data.draftIssues} max={8} />
          </div>
        ) : null}
        <h2 className="text-sm font-semibold">{data.current ? `Questions in version ${data.current.number}` : "Draft questions"}</h2>
        {definition?.questions.length ? <QuestionMap definition={definition} /> : <p className="text-sm text-muted-foreground">No questions yet.</p>}
      </section>
      <aside className="flex flex-col gap-6 lg:border-l lg:pl-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Versions</h2>
          {data.versions.length ? (
            <ItemGroup className="gap-0">
              {data.versions.map((version) => (
                <Item key={version.id} size="xs" className="px-0">
                  <ItemContent>
                    <ItemTitle>Version {version.number}{version.id === data.current?.id ? <Badge variant="secondary">Current</Badge> : null}</ItemTitle>
                    <ItemDescription>{formatWhen(version.publishedAt, data.timeZone)} · {version.publishedBy || "Someone"} · {version.questionCount} questions</ItemDescription>
                    {version.note ? <ItemDescription>{version.note}</ItemDescription> : null}
                  </ItemContent>
                  {manage ? (
                    <ItemActions>
                      <Button nativeButton={false} variant="ghost" size="icon-sm" aria-label={`Download version ${version.number} as a spreadsheet`} render={<a href={workbookHref(api, data.survey.id, version.id)} download />}><Download /></Button>
                    </ItemActions>
                  ) : null}
                </Item>
              ))}
            </ItemGroup>
          ) : <p className="text-sm text-muted-foreground">Not published yet.</p>}
        </section>
        {data.survey.linkedStory || data.survey.linkedCollection ? (
          <section className="flex flex-col gap-1 text-sm">
            <h2 className="font-semibold">Linked</h2>
            {data.survey.linkedStory ? <p><span className="text-muted-foreground">Story</span> {data.survey.linkedStory.title}</p> : null}
            {data.survey.linkedCollection ? <p><span className="text-muted-foreground">Collection</span> {data.survey.linkedCollection.title}</p> : null}
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function PreviewTab({ data }: { data: SurveyDetail }) {
  const [which, setWhich] = useState<"draft" | "current">(data.draftChanged || !data.current ? "draft" : "current");
  const definition = which === "draft" ? data.draft : data.current?.definition;
  return (
    <section className="flex flex-col gap-4">
      {data.draft && data.current ? (
        <Tabs value={which} onValueChange={(value) => setWhich(value as "draft" | "current")}>
          <TabsList>
            <TabsTrigger value="current">Published (v{data.current.number})</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {definition && definition.questions.length ? <PreviewPanel key={which} definition={definition} /> : <p className="text-sm text-muted-foreground">Add questions to preview the poll.</p>}
    </section>
  );
}

function FieldworkTab({ data }: { data: SurveyDetail }) {
  const go = usePollsNavigation();
  return (
    <section className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">Each session is one interviewer at one place. Its counts are approaches recorded on the device.</p>
      {data.sessions.length ? <SessionRows sessions={data.sessions} meId={data.me.id} manage={data.survey.canManage} timeZone={data.timeZone} /> : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Radio /></EmptyMedia>
            <EmptyTitle>No sessions yet</EmptyTitle>
            <EmptyDescription>{data.current ? "Start one on the iPad you'll hand to students." : "Publish the poll to start fieldwork."}</EmptyDescription>
          </EmptyHeader>
          {data.survey.canInterview && data.current ? <EmptyContent><Button type="button" onClick={() => go({ view: "fieldwork", poll: data.survey.id })}>Start fieldwork</Button></EmptyContent> : null}
        </Empty>
      )}
    </section>
  );
}

type Person = { id: number; name: string; role: string };

function Settings({ data }: { data: SurveyDetail }) {
  const { api } = useNewsroomRoutes();
  const go = usePollsNavigation();
  const queries = useQueryClient();
  const survey = data.survey;
  const [title, setTitle] = useState(survey.title);
  const [description, setDescription] = useState(survey.description);
  const [methodology, setMethodology] = useState(survey.methodology);
  const [minimumGroup, setMinimumGroup] = useState(String(survey.minimumGroup));
  const [accessCode, setAccessCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { setTitle(survey.title); setDescription(survey.description); setMethodology(survey.methodology); setMinimumGroup(String(survey.minimumGroup)); }, [survey]);
  const people = useQuery({ queryKey: pollKeys.people(), queryFn: () => fetchPeople(api) });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => updateSurvey(api, survey.id, body),
    onSuccess: (next) => { queries.setQueryData(pollKeys.survey(survey.id), next); void queries.invalidateQueries({ queryKey: pollKeys.overview() }); setAccessCode(""); }
  });
  const remove = useMutation({ mutationFn: () => deleteSurvey(api, survey.id, confirm), onSuccess: async () => { await queries.invalidateQueries({ queryKey: pollKeys.all }); go({}); } });
  const link = survey.publicLinkSettings;
  const linkId = useId();
  const publicUrl = link?.key ? `${window.location.origin}/polls/s/${link.key}` : "";
  const textChanged = title !== survey.title || description !== survey.description || methodology !== survey.methodology || minimumGroup !== String(survey.minimumGroup);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      {save.isError ? <InlineAlert title="Not saved">{(save.error as Error).message}</InlineAlert> : null}
      <Section title="About this poll">
        <FieldGroup>
          <TextField label="Title" value={title} onChange={setTitle} maxLength={200} />
          <TextAreaField label="Description" value={description} onChange={setDescription} maxLength={2000} rows={3} optional />
          <TextAreaField label="Methodology and limitations" value={methodology} onChange={setMethodology} maxLength={4000} rows={4} hint="Who was asked, where, when, how they were chosen, and what the results can't tell you. Shown beside the results; needed before any are published." />
          <TextField label="Smallest group reported" type="number" inputMode="numeric" value={minimumGroup} onChange={setMinimumGroup} hint="Breakdowns and rates for fewer respondents than this (3 to 50) are withheld." />
          <div><Button type="button" disabled={!textChanged || save.isPending} onClick={() => save.mutate({ title, description, methodology, minimumGroup: Number(minimumGroup) })}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}Save</Button></div>
        </FieldGroup>
      </Section>

      <Section title="Status">
        <Field>
          <ToggleGroup variant="outline" spacing={0} aria-label="Poll status" disabled={!data.current || save.isPending} value={[survey.status]} onValueChange={(next: unknown[]) => { const value = next[0]; if (value === "open" || value === "closed" || value === "archived") save.mutate({ status: value }); }}>
            <ToggleGroupItem value="open">Open</ToggleGroupItem>
            <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
            <ToggleGroupItem value="archived">Archived</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>{data.current ? "Closing stops new sessions and responses. Results stay." : "Publish the poll to open it."}</FieldDescription>
        </Field>
      </Section>

      <Section title="Who can work on it">
        <FieldGroup>
          <SwitchField label="Any staff member can run fieldwork" description="Otherwise only the interviewers below, and editors." checked={survey.openToAllStaff ?? false} onChange={(checked) => save.mutate({ openToAllStaff: checked })} />
          <PeoplePicker label="Interviewers" description="Editors always can." people={people.data?.people ?? []} chosen={survey.interviewers ?? []} onChange={(ids) => save.mutate({ interviewers: ids })} />
          <PeoplePicker label="Results" description="Staff who may read results and export responses. Editors always can." people={people.data?.people ?? []} chosen={survey.analysts ?? []} onChange={(ids) => save.mutate({ analysts: ids })} />
        </FieldGroup>
      </Section>

      <Section title="How it's collected">
        <FieldGroup>
          <SwitchField label="In person, on a kiosk device" description="Interviewers hand an iPad to students." checked={survey.kioskEnabled} onChange={(checked) => save.mutate({ kioskEnabled: checked })} />
          <SwitchField label="Public link" description="Anyone with the link can answer, without signing in." checked={link?.enabled ?? false} onChange={(checked) => save.mutate({ publicLink: { enabled: checked } })} />
          {link?.enabled ? (
            <FieldSet className="border-l-2 pl-4">
              <FieldLegend className="sr-only">Public link</FieldLegend>
              <Field>
                <FieldLabel htmlFor={`${linkId}-url`}>Link</FieldLabel>
                <InputGroup>
                  <InputGroupInput id={`${linkId}-url`} readOnly value={publicUrl} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton size="xs" onClick={() => void navigator.clipboard?.writeText(publicUrl)}><Copy data-icon="inline-start" />Copy</InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <div><Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => save.mutate({ publicLink: { regenerateKey: true } })}>Replace with a new link</Button></div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <WindowField label="Opens" value={link.opensAt} timeZone={data.timeZone} onCommit={(value) => save.mutate({ publicLink: { opensAt: value } })} />
                <WindowField label="Closes" value={link.closesAt} timeZone={data.timeZone} onCommit={(value) => save.mutate({ publicLink: { closesAt: value } })} />
              </div>
              <AccessCodeField hasCode={link.hasAccessCode} value={accessCode} onChange={setAccessCode} onSet={() => save.mutate({ publicLink: { accessCode } })} onRemove={() => save.mutate({ publicLink: { accessCode: "" } })} />
              <FieldDescription>Limited to {link.hourlyLimit} starts an hour. Byline records no IP addresses or device identifiers, and each start token works once.</FieldDescription>
            </FieldSet>
          ) : null}
        </FieldGroup>
      </Section>

      <Section title="Linked coverage" description="Results are never published automatically.">
        <LinkPicker kind="stories" label="Story" chosen={survey.linkedStory} onChange={(id) => save.mutate({ linkedStory: id })} />
        <LinkPicker kind="collections" label="Collection" chosen={survey.linkedCollection} onChange={(id) => save.mutate({ linkedCollection: id })} />
      </Section>

      <Section title="Delete poll" description="Administrators can delete a poll with every version, session and response. To keep the results, close or archive it instead.">
        <div><Button type="button" variant="destructive" onClick={() => setDeleting(true)}>Delete poll…</Button></div>
      </Section>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{survey.title}”?</AlertDialogTitle>
            <AlertDialogDescription>Every version, session and response goes, permanently. Type the poll's title to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirm} onChange={(event) => setConfirm(event.target.value)} aria-label="Poll title" />
          {remove.isError ? <FieldError>{(remove.error as Error).message}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={confirm.trim() !== survey.title.trim() || remove.isPending} onClick={(event) => { event.preventDefault(); remove.mutate(); }}>Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** One settings group: a plain heading, an optional line under it, and a separator before the next. */
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <>
      <Separator className="first:hidden" />
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </section>
    </>
  );
}

/** A public-link window boundary, read and written in the newsroom's timezone. */
function WindowField({ label, value, timeZone, onCommit }: { label: string; value: string | null; timeZone: string; onCommit: (value: string | null) => void }) {
  const wall = value ? instantToLocal(value, timeZone) : "";
  const [draft, setDraft] = useState(wall);
  useEffect(() => setDraft(wall), [wall]);
  return <DateTimeField label={label} value={draft} timeZone={timeZone} optional onChange={setDraft} onClose={(next) => { if (next !== wall) onCommit(next ? localToInstant(next, timeZone) : null); }} />;
}

function AccessCodeField({ hasCode, value, onChange, onSet, onRemove }: { hasCode: boolean; value: string; onChange: (value: string) => void; onSet: () => void; onRemove: () => void }) {
  const id = useId();
  return (
    <FormField id={id} label={hasCode ? "Access code (set)" : "Access code"} optional hint="Share it with the people you want to answer. Case and spaces don't matter.">
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={hasCode ? "Type a new code to replace it" : undefined} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby={`${id}-hint`} />
        <Button type="button" variant="outline" disabled={!value.trim()} onClick={onSet}>Set</Button>
        {hasCode ? <Button type="button" variant="ghost" onClick={onRemove}>Remove</Button> : null}
      </div>
    </FormField>
  );
}

function PeoplePicker({ label, description, people, chosen, onChange }: { label: string; description: string; people: Person[]; chosen: Array<{ id: number | string; name: string }>; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const ids = chosen.map((entry) => Number(entry.id));
  const staff = people.filter((person) => person.role === "staff");
  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-wrap items-center gap-2">
        {chosen.map((person) => (
          <Badge key={person.id} variant="secondary" className="gap-0.5 pr-0.5">
            {person.name}
            <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${person.name}`} onClick={() => onChange(ids.filter((id) => id !== Number(person.id)))}><X /></Button>
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}><Plus data-icon="inline-start" />Add</PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search staff" />
              <CommandList>
                <CommandEmpty>No one found.</CommandEmpty>
                <CommandGroup>
                  {staff.filter((person) => !ids.includes(person.id)).map((person) => (
                    <CommandItem key={person.id} value={person.name} onSelect={() => { onChange([...ids, person.id]); setOpen(false); }}>{person.name}</CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </FieldSet>
  );
}

function LinkPicker({ kind, label, chosen, onChange }: { kind: "stories" | "collections"; label: string; chosen: { id: number; title: string } | null; onChange: (id: number | null) => void }) {
  const { api } = useNewsroomRoutes();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const results = useQuery({ queryKey: [...pollKeys.all, "links", search], queryFn: () => fetchLinks(api, search), enabled: open });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-24 text-muted-foreground">{label}</span>
      {chosen ? <span className="min-w-0 truncate font-medium">{chosen.title}</span> : <span className="text-muted-foreground">None</span>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>{chosen ? "Change" : "Choose…"}</PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={`Search ${kind}`} value={search} onValueChange={setSearch} />
            <CommandList>
              {results.isLoading ? <div className="p-3"><Spinner /></div> : <CommandEmpty>Nothing found.</CommandEmpty>}
              <CommandGroup>
                {(results.data?.[kind] ?? []).map((entry) => <CommandItem key={entry.id} value={String(entry.id)} onSelect={() => { onChange(entry.id); setOpen(false); }}>{entry.title}</CommandItem>)}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {chosen ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Remove</Button> : null}
    </div>
  );
}
