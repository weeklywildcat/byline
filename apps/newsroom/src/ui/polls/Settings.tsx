"use client";

import { TextAreaField, TextField } from "@byline/newsroom-ui/components/form-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useNewsroomRoutes } from "../shell/account";
import { deleteSurvey, fetchLinks, fetchPeople, pollKeys, updateSurvey, type SurveyDetail } from "./api";
import { SwitchField } from "./fields";
import { usePollsNavigation } from "./PollStudio";

/**
 * Settings (docs/wildcat-polls.md#settings): the things changed rarely. How
 * a poll collects answers lives in Collect; the questions live in Build.
 */
export function PollSettings({ data }: { data: SurveyDetail }) {
  const { api } = useNewsroomRoutes();
  const go = usePollsNavigation();
  const queries = useQueryClient();
  const survey = data.survey;
  const [general, setGeneral] = useState({ title: survey.title, description: survey.description });
  const [reporting, setReporting] = useState({ methodology: survey.methodology, minimumGroup: String(survey.minimumGroup) });
  useEffect(() => { setGeneral({ title: survey.title, description: survey.description }); setReporting({ methodology: survey.methodology, minimumGroup: String(survey.minimumGroup) }); }, [survey]);
  const people = useQuery({ queryKey: pollKeys.people(), queryFn: () => fetchPeople(api) });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => updateSurvey(api, survey.id, body),
    onSuccess: (next) => { queries.setQueryData(pollKeys.survey(survey.id), next); void queries.invalidateQueries({ queryKey: pollKeys.overview() }); }
  });
  const generalChanged = general.title !== survey.title || general.description !== survey.description;
  const reportingChanged = reporting.methodology !== survey.methodology || reporting.minimumGroup !== String(survey.minimumGroup);

  return (
    <div className="flex max-w-4xl flex-col gap-8" data-polls-settings="">
      {save.isError ? <InlineAlert title="Not saved">{(save.error as Error).message}</InlineAlert> : null}

      <Section title="General" description="What the poll is called in Poll Studio and to respondents.">
        <FieldGroup>
          <TextField label="Title" value={general.title} onChange={(title) => setGeneral({ ...general, title })} maxLength={200} />
          <TextAreaField label="Description" value={general.description} onChange={(description) => setGeneral({ ...general, description })} maxLength={2000} rows={3} optional />
          <div><Button type="button" disabled={!generalChanged || save.isPending} onClick={() => save.mutate(general)}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}Save</Button></div>
          <Separator />
          <Field>
            <FieldLabel>Status</FieldLabel>
            <ToggleGroup variant="outline" spacing={0} aria-label="Poll status" disabled={!data.current || save.isPending} value={[survey.status]} onValueChange={(next: unknown[]) => { const value = next[0]; if (value === "open" || value === "closed" || value === "archived") save.mutate({ status: value }); }}>
              <ToggleGroupItem value="open">Open</ToggleGroupItem>
              <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
              <ToggleGroupItem value="archived">Archived</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>{data.current ? "Closing stops new sessions, pairing and web answers. Results stay. Archived polls leave the main list." : "Publish the poll to open it."}</FieldDescription>
          </Field>
        </FieldGroup>
      </Section>

      <Section title="Access" description="Grants never make anyone an editor. Editors can always run fieldwork and read results.">
        <FieldGroup>
          <SwitchField label="Any staff member can run fieldwork" description="Otherwise only the interviewers below, and editors." checked={survey.openToAllStaff ?? false} disabled={save.isPending} onChange={(checked) => save.mutate({ openToAllStaff: checked })} />
          <PeoplePicker label="Interviewers" description="Staff who may start sessions and pair iPads." people={people.data?.people ?? []} chosen={survey.interviewers ?? []} onChange={(ids) => save.mutate({ interviewers: ids })} />
          <PeoplePicker label="Results" description="Staff who may read results and export responses." people={people.data?.people ?? []} chosen={survey.analysts ?? []} onChange={(ids) => save.mutate({ analysts: ids })} />
        </FieldGroup>
      </Section>

      <Section title="Reporting and privacy" description="Shown beside the results, and applied to every breakdown, rate, export and dataset.">
        <FieldGroup>
          <TextAreaField label="Methodology and limitations" value={reporting.methodology} onChange={(methodology) => setReporting({ ...reporting, methodology })} maxLength={4000} rows={5}
            hint="Who was asked, where, when, how they were chosen, and what the results can't tell you. Needed before any result is published." />
          <TextField label="Smallest group reported" type="number" inputMode="numeric" value={reporting.minimumGroup} onChange={(minimumGroup) => setReporting({ ...reporting, minimumGroup })}
            hint="Breakdowns and rates for fewer respondents than this (3 to 50) are withheld everywhere, so a small group can't point at a student." />
          <div><Button type="button" disabled={!reportingChanged || save.isPending} onClick={() => save.mutate({ methodology: reporting.methodology, minimumGroup: Number(reporting.minimumGroup) })}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}Save</Button></div>
        </FieldGroup>
      </Section>

      <Section title="Linked coverage" description="The Story or Collection this poll is for. It shows there for people who can see the poll; results are never published automatically.">
        <FieldGroup>
          <LinkPicker kind="stories" label="Story" chosen={survey.linkedStory} onChange={(id) => save.mutate({ linkedStory: id })} />
          <LinkPicker kind="collections" label="Collection" chosen={survey.linkedCollection} onChange={(id) => save.mutate({ linkedCollection: id })} />
        </FieldGroup>
      </Section>

      {survey.canAdminister ? <DangerZone title={survey.title} id={survey.id} onDeleted={async () => { await queries.invalidateQueries({ queryKey: pollKeys.all }); go({}); }} /> : null}
    </div>
  );
}

/** One group of settings: its name and purpose beside its fields on wide screens, above them on narrow ones. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function DangerZone({ id, title, onDeleted }: { id: number; title: string; onDeleted: () => Promise<void> }) {
  const { api } = useNewsroomRoutes();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const remove = useMutation({ mutationFn: () => deleteSurvey(api, id, confirm), onSuccess: onDeleted });
  return (
    <Section title="Danger zone" description="Administrators only.">
      <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 p-4">
        <p className="text-sm">Delete the poll with every version, session and response, permanently. To keep the results, close or archive it instead.</p>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>Delete poll…</Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>Every version, session and response goes, permanently. Type the poll's title to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirm} onChange={(event) => setConfirm(event.target.value)} aria-label="Poll title" />
          {remove.isError ? <FieldError>{(remove.error as Error).message}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={confirm.trim() !== title.trim() || remove.isPending} onClick={(event) => { event.preventDefault(); remove.mutate(); }}>Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

type Person = { id: number; name: string; role: string };

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
            <Button type="button" variant="ghost" size="icon-xs" className="touch-hit" aria-label={`Remove ${person.name}`} onClick={() => onChange(ids.filter((id) => id !== Number(person.id)))}><X /></Button>
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
  const id = useId();
  const results = useQuery({ queryKey: [...pollKeys.all, "links", search], queryFn: () => fetchLinks(api, search), enabled: open });
  return (
    <Field orientation="responsive">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {chosen ? <span className="min-w-0 truncate font-medium">{chosen.title}</span> : <span className="text-muted-foreground">None</span>}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button id={id} type="button" variant="outline" size="sm" />}>{chosen ? "Change" : "Choose…"}</PopoverTrigger>
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
    </Field>
  );
}
