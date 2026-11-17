"use client";

import { DateTimeField } from "@byline/newsroom-ui/components/date-fields";
import { FormField, TextAreaField, TextField } from "@byline/newsroom-ui/components/form-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Download, FileSpreadsheet, Link2, Radio, Upload, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { instantToLocal, localToInstant } from "../../domain/dates";
import { hasErrors } from "../../polls/engine/xlsform";
import { useNewsroomRoutes } from "../shell/account";
import { deleteSurvey, fetchLinks, fetchPeople, fetchSurvey, formatWhen, pollKeys, publishSurvey, updateSurvey, workbookHref, type SurveyDetail } from "./api";
import { SessionRows } from "./Fieldwork";
import { ListSkeleton, PageHeader, StatusBadge, usePollsNavigation } from "./PollStudio";
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
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 py-6 lg:px-6" data-polls-workspace="">
      <PageHeader
        back={<Button type="button" variant="ghost" className="-ml-3 self-start" onClick={() => go({})}><ArrowLeft data-icon="inline-start" />Polls</Button>}
        title={data?.survey.title ?? "Poll"}
        description={data ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={data.survey.status} />
            <span>{data.current ? `Version ${data.current.number}` : "Not published"}</span>
            {data.survey.canViewResults ? <span className="tabular-nums">{data.survey.responses} response{data.survey.responses === 1 ? "" : "s"}</span> : null}
            {manage && data.draftChanged ? <Badge variant="outline">Unpublished changes</Badge> : null}
          </span>
        ) : undefined}
        actions={data ? (
          <>
            {data.survey.canInterview ? <Button type="button" variant="outline" onClick={() => go({ view: "fieldwork", poll: id })}><Radio data-icon="inline-start" />Start fieldwork</Button> : null}
            {manage ? <Button type="button" variant="outline" onClick={() => go({ view: "import", poll: id })}><Upload data-icon="inline-start" />Import new version</Button> : null}
            {manage ? <Button type="button" disabled={!canPublish || publish.isPending} onClick={() => publish.mutate()} title={blocked ? "Fix the errors in Questions first" : !canPublish ? "Nothing to publish" : undefined}>{publish.isPending ? <Spinner /> : null}{data.current ? "Publish changes" : "Publish"}</Button> : null}
          </>
        ) : null}
      />
      {publish.isError ? <InlineAlert title="Not published">{(publish.error as Error).message}</InlineAlert> : null}

      <Tabs value={active} onValueChange={(next) => go({ poll: id, tab: next as SurveyTab })}>
        <TabsList className="max-w-full overflow-x-auto">
          {visible.map((entry) => <TabsTrigger key={entry.value} value={entry.value} className="min-h-10 px-3">{entry.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {!data ? <ListSkeleton /> : active === "overview" ? <Overview data={data} />
        : active === "questions" ? <QuestionsEditor key={data.survey.draftRevision} id={id} data={data} />
        : active === "preview" ? <PreviewTab data={data} />
        : active === "results" ? <ResultsView id={id} />
        : active === "fieldwork" ? <FieldworkTab data={data} />
        : <Settings data={data} />}
    </main>
  );
}

function Overview({ data }: { data: SurveyDetail }) {
  const { api } = useNewsroomRoutes();
  const definition = data.current?.definition ?? data.draft;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="flex min-w-0 flex-col gap-4">
        {data.survey.description ? <p className="max-w-2xl text-base leading-relaxed">{data.survey.description}</p> : null}
        {data.draftIssues.length && data.survey.canManage ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{hasErrors(data.draftIssues) ? "The draft can't be published yet" : "Notes on the draft"}</h2>
            <IssueList issues={data.draftIssues} max={8} />
          </div>
        ) : null}
        <h2 className="text-sm font-semibold">{data.current ? `Questions in version ${data.current.number}` : "Draft questions"}</h2>
        {definition ? <QuestionMap definition={definition} /> : <p className="text-muted-foreground">No questions yet.</p>}
      </section>
      <aside className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Versions</h2>
          {data.versions.length ? (
            <ItemGroup className="rounded-lg border">
              {data.versions.map((version) => (
                <Item key={version.id} size="sm" className="flex-wrap">
                  <ItemContent>
                    <ItemTitle>Version {version.number}{version.id === data.current?.id ? <Badge variant="secondary">Current</Badge> : null}</ItemTitle>
                    <ItemDescription>{formatWhen(version.publishedAt, data.timeZone)} · {version.publishedBy || "Someone"} · {version.questionCount} questions</ItemDescription>
                    {version.note ? <ItemDescription>{version.note}</ItemDescription> : null}
                  </ItemContent>
                  {data.survey.canManage ? (
                    <ItemActions>
                      <Button nativeButton={false} variant="ghost" size="icon" aria-label={`Download version ${version.number} as a spreadsheet`} render={<a href={workbookHref(api, data.survey.id, version.id)} download />}><Download /></Button>
                    </ItemActions>
                  ) : null}
                </Item>
              ))}
            </ItemGroup>
          ) : <p className="text-sm text-muted-foreground">Not published yet.</p>}
          {data.survey.canManage && data.draft ? <Button nativeButton={false} variant="outline" size="sm" className="self-start" render={<a href={workbookHref(api, data.survey.id)} download />}><Download data-icon="inline-start" />Draft as spreadsheet</Button> : null}
        </div>
        {data.survey.linkedStory || data.survey.linkedCollection ? (
          <div className="flex flex-col gap-1 text-sm">
            <h2 className="font-semibold">Linked</h2>
            {data.survey.linkedStory ? <p>Story: {data.survey.linkedStory.title}</p> : null}
            {data.survey.linkedCollection ? <p>Collection: {data.survey.linkedCollection.title}</p> : null}
          </div>
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
      {definition && definition.questions.length ? <PreviewPanel key={which} definition={definition} /> : <p className="text-muted-foreground">Add questions to preview the poll.</p>}
    </section>
  );
}

function FieldworkTab({ data }: { data: SurveyDetail }) {
  const go = usePollsNavigation();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">Each session is one interviewer at one place. Counts are approaches recorded on the device: students who agreed, declined, and surveys left incomplete.</p>
        {data.survey.canInterview ? <Button type="button" onClick={() => go({ view: "fieldwork", poll: data.survey.id })}><Radio data-icon="inline-start" />Start fieldwork</Button> : null}
      </div>
      {data.sessions.length ? <SessionRows sessions={data.sessions} meId={data.me.id} manage={data.survey.canManage} timeZone={data.timeZone} /> : <p className="text-sm text-muted-foreground">No sessions yet.</p>}
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
  const publicUrl = link?.key ? `${window.location.origin}/polls/s/${link.key}` : "";
  const textChanged = title !== survey.title || description !== survey.description || methodology !== survey.methodology || minimumGroup !== String(survey.minimumGroup);

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      {save.isError ? <InlineAlert title="Not saved">{(save.error as Error).message}</InlineAlert> : null}
      <Section title="About this poll">
        <FieldGroup>
          <TextField label="Title" value={title} onChange={setTitle} maxLength={200} />
          <TextAreaField label="Description" value={description} onChange={setDescription} maxLength={2000} rows={3} optional />
          <TextAreaField label="Methodology and limitations" value={methodology} onChange={setMethodology} maxLength={4000} rows={4} hint="Who was asked, where, when, how they were chosen, and what the results can't tell you. Shown beside the results, and needed before any are published." />
          <TextField label="Smallest group reported" type="number" inputMode="numeric" value={minimumGroup} onChange={setMinimumGroup} hint="Breakdowns and rates for fewer respondents than this (3 to 50) are withheld." />
          <div><Button type="button" disabled={!textChanged || save.isPending} onClick={() => save.mutate({ title, description, methodology, minimumGroup: Number(minimumGroup) })}>Save</Button></div>
        </FieldGroup>
      </Section>

      <Section title="Status">
        <ToggleGroup variant="outline" spacing={0} aria-label="Poll status" disabled={!data.current || save.isPending} value={[survey.status]} onValueChange={(next: unknown[]) => { const value = next[0]; if (value === "open" || value === "closed" || value === "archived") save.mutate({ status: value }); }}>
          <ToggleGroupItem value="open" className="px-4">Open</ToggleGroupItem>
          <ToggleGroupItem value="closed" className="px-4">Closed</ToggleGroupItem>
          <ToggleGroupItem value="archived" className="px-4">Archived</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">{data.current ? "Closing stops new sessions and responses. Results stay." : "Publish the poll to open it."}</p>
      </Section>

      <Section title="Who can work on it">
        <SwitchField label="Any staff member can run fieldwork" description="Otherwise only the interviewers below, and editors." checked={survey.openToAllStaff ?? false} onChange={(checked) => save.mutate({ openToAllStaff: checked })} />
        <PeoplePicker label="Interviewers" description="Staff who may run fieldwork. Editors always can." people={people.data?.people ?? []} chosen={survey.interviewers ?? []} onChange={(ids) => save.mutate({ interviewers: ids })} />
        <PeoplePicker label="Results" description="Staff who may read results and export responses. Editors always can." people={people.data?.people ?? []} chosen={survey.analysts ?? []} onChange={(ids) => save.mutate({ analysts: ids })} />
      </Section>

      <Section title="How it's collected">
        <SwitchField label="In person, on a kiosk device" description="Interviewers hand an iPad to students." checked={survey.kioskEnabled} onChange={(checked) => save.mutate({ kioskEnabled: checked })} />
        <SwitchField label="Public link" description="Anyone with the link can answer, without signing in." checked={link?.enabled ?? false} onChange={(checked) => save.mutate({ publicLink: { enabled: checked } })} />
        {link?.enabled ? (
          <FieldSet className="rounded-lg border p-4">
            <FieldLegend variant="label">Public link</FieldLegend>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-sm">{publicUrl}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(publicUrl)}><Copy data-icon="inline-start" />Copy</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => save.mutate({ publicLink: { regenerateKey: true } })}>New link</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <WindowField label="Opens" value={link.opensAt} timeZone={data.timeZone} onCommit={(value) => save.mutate({ publicLink: { opensAt: value } })} />
              <WindowField label="Closes" value={link.closesAt} timeZone={data.timeZone} onCommit={(value) => save.mutate({ publicLink: { closesAt: value } })} />
            </div>
            <AccessCodeField hasCode={link.hasAccessCode} value={accessCode} onChange={setAccessCode} onSet={() => save.mutate({ publicLink: { accessCode } })} onRemove={() => save.mutate({ publicLink: { accessCode: "" } })} />
            <FieldDescription>Public responses are limited to {link.hourlyLimit} starts an hour. Byline records no IP addresses or device identifiers; each start token works once.</FieldDescription>
          </FieldSet>
        ) : null}
      </Section>

      <Section title="Linked coverage">
        <p className="text-sm text-muted-foreground">Link the Story or Collection reporting on this poll. Results are never published automatically.</p>
        <LinkPicker kind="stories" label="Story" chosen={survey.linkedStory} onChange={(id) => save.mutate({ linkedStory: id })} />
        <LinkPicker kind="collections" label="Collection" chosen={survey.linkedCollection} onChange={(id) => save.mutate({ linkedCollection: id })} />
      </Section>

      {data.survey.canManage ? (
        <Section title="Spreadsheet">
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} variant="outline" render={<a href={workbookHref(api, survey.id)} download />}><FileSpreadsheet data-icon="inline-start" />Download the draft</Button>
            <Button type="button" variant="outline" onClick={() => go({ view: "import", poll: survey.id })}><Upload data-icon="inline-start" />Import a new version</Button>
          </div>
        </Section>
      ) : null}

      <Section title="Delete">
        <p className="text-sm text-muted-foreground">Administrators can delete a poll with every version, session and response. To keep results, close or archive it instead.</p>
        <div><Button type="button" variant="outline" className="text-destructive" onClick={() => setDeleting(true)}>Delete poll…</Button></div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-0">
      <h2 className="font-(family-name:--poll-serif) text-xl font-medium">{title}</h2>
      {children}
    </section>
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
          <Badge key={person.id} variant="secondary" className="h-8 gap-1 pr-1 text-sm">
            {person.name}
            <Button type="button" variant="ghost" size="icon-xs" className="rounded-full" aria-label={`Remove ${person.name}`} onClick={() => onChange(ids.filter((id) => id !== Number(person.id)))}><X /></Button>
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>Add…</PopoverTrigger>
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
      {chosen ? <span className="inline-flex items-center gap-1 font-medium"><Link2 className="size-4" aria-hidden="true" />{chosen.title}</span> : <span className="text-muted-foreground">None</span>}
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
