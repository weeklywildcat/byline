"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Progress, ProgressLabel, ProgressValue } from "@byline/newsroom-ui/ui/progress";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { problemsOf, useYears, useYearWrites, type RolloverPreview, type StaffRow, type YearsOverview } from "./api";
import { TeamNav } from "./TeamNav";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";

/**
 * Starting a new school year (docs/newsroom-roles.md#school-years), one step at
 * a time: the new year, who returns, which responsibilities carry over, who
 * leaves, what work is left behind, whether review routing still works, and
 * the one confirmation that starts it. A planned year changes nothing; the old
 * year's people, assignments and reviews stay as history.
 */

const STEPS = ["New year", "Returning staff", "Responsibilities", "Departing staff", "Unfinished work", "Routing check", "Start the year"] as const;

type Plan = { returning: number[]; carry: number[]; titles: Record<string, string>; disable: number[] };

export function RolloverScreen() {
  const { api } = useNewsroomRoutes();
  const years = useYears(api);
  return (
    <AdminRoot toaster={false} className="byline-rollover">
      <main className="mx-auto flex w-full min-w-0 max-w-[960px] flex-col gap-5 px-4 py-6 lg:px-6" data-byline-rollover-screen="">
        <header className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">New school year</h1>
          <p className="max-w-prose text-sm text-muted-foreground">Decide who returns and which responsibilities carry over. Nothing changes until the last step, and last year’s people, assignments and reviews are kept as history.</p>
        </header>
        <TeamNav current="roles" />
        {years.isError ? <Alert variant="destructive"><AlertTitle>School years couldn’t be loaded</AlertTitle><AlertDescription>{problemsOf(years.error)[0]}</AlertDescription><AlertAction><Button type="button" size="sm" variant="outline" onClick={() => void years.refetch()}>Try again</Button></AlertAction></Alert> : null}
        {years.isPending ? <div className="grid gap-2" aria-busy="true"><Skeleton className="h-6 w-48" /><Skeleton className="h-40" /></div> : null}
        {years.data ? (years.data.planned
          ? <Rollover key={years.data.planned.id} api={api} overview={years.data} />
          : <PlanYear api={api} overview={years.data} />) : null}
      </main>
    </AdminRoot>
  );
}

/* --------------------------------------------------------------- no plan yet */

function PlanYear({ api, overview }: { api: string; overview: YearsOverview }) {
  const writes = useYearWrites(api);
  const ids = { name: useId(), starts: useId(), ends: useId() };
  const [year, setYear] = useState(overview.suggestion);
  const [problems, setProblems] = useState<string[]>([]);
  function submit(event: FormEvent) {
    event.preventDefault();
    setProblems([]);
    writes.plan.mutate(year, { onError: (error) => setProblems(problemsOf(error)) });
  }
  return (
    <section aria-labelledby="plan-heading" className="grid max-w-lg gap-4">
      <div className="grid gap-1">
        <h2 id="plan-heading" className="text-base font-medium">{overview.active ? `Plan the year after ${overview.active.name}` : "Plan the first school year"}</h2>
        <p className="text-sm text-muted-foreground">{overview.active ? `${overview.active.name} stays active until you start the new year.` : "There is no active school year yet. Reviews can’t be routed until one is started."}</p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <FieldGroup>
          <Field><FieldLabel htmlFor={ids.name}>Name</FieldLabel><Input id={ids.name} value={year.name} maxLength={40} onChange={(event) => setYear({ ...year, name: event.target.value })} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor={ids.starts}>First day</FieldLabel><Input id={ids.starts} type="date" value={year.startsOn} onChange={(event) => setYear({ ...year, startsOn: event.target.value })} required /></Field>
            <Field><FieldLabel htmlFor={ids.ends}>Last day</FieldLabel><Input id={ids.ends} type="date" value={year.endsOn} onChange={(event) => setYear({ ...year, endsOn: event.target.value })} required /></Field>
          </div>
          {problems.length ? <FieldError errors={problems.map((message) => ({ message }))} /> : null}
        </FieldGroup>
        <div><Button type="submit" disabled={writes.plan.isPending}>{writes.plan.isPending ? <Spinner /> : null}Start planning</Button></div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------- stepper */

function Rollover({ api, overview }: { api: string; overview: YearsOverview }) {
  const writes = useYearWrites(api);
  const { admin } = useNewsroomRoutes();
  const planned = overview.planned!;
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<Plan>(() => ({
    returning: overview.staff.map((person) => person.userId),
    carry: overview.staff.flatMap((person) => person.assignments.map((assignment) => assignment.id)),
    titles: {},
    disable: []
  }));
  const [preview, setPreview] = useState<RolloverPreview | null>(null);
  const [error, setError] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const planKey = JSON.stringify(plan);

  // The server reads the plan back as it will apply it: who leaves, what is left behind, whether routing holds.
  useEffect(() => {
    if (step < 3) return;
    const timer = window.setTimeout(() => writes.preview.mutate({ id: planned.id, plan }, { onSuccess: setPreview, onError: (failure) => setError(problemsOf(failure)) }), 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, step]);

  const staying = new Set(plan.returning);
  const people = overview.staff;
  const leaving = people.filter((person) => !staying.has(person.userId));
  const toggle = (list: number[], id: number, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((entry) => entry !== id));
  const set = (patch: Partial<Plan>) => setPlan((current) => ({ ...current, ...patch }));

  function start(confirmed: boolean) {
    setError([]);
    writes.activate.mutate({ id: planned.id, plan, confirmed }, {
      onSuccess: (next) => { setConfirming(false); toast.success(`${next.active?.name ?? "The school year"} is now the active school year.`); },
      onError: (failure) => { setConfirming(false); setError(problemsOf(failure)); setStep(5); }
    });
  }

  return (
    <div className="grid gap-5">
      <Progress value={Math.round(((step + 1) / STEPS.length) * 100)} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        <ProgressLabel>Step {step + 1} of {STEPS.length}: {STEPS[step]}</ProgressLabel>
        <ProgressValue>{() => `${planned.name}`}</ProgressValue>
      </Progress>
      {error.length ? <Alert variant="destructive"><AlertTitle>That didn’t work</AlertTitle><AlertDescription>{error.map((message) => <span key={message} className="block">{message}</span>)}</AlertDescription></Alert> : null}

      <section aria-labelledby="step-heading" className="grid gap-4">
        <h2 id="step-heading" className="text-lg font-medium">{STEPS[step]}</h2>

        {step === 0 ? (
          <div className="grid gap-3">
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>{planned.name}</ItemTitle>
                <ItemDescription>{planned.startsOn} to {planned.endsOn}{overview.active ? ` · follows ${overview.active.name}` : ""}</ItemDescription>
              </ItemContent>
              <ItemActions><Badge variant="outline">Planned</Badge></ItemActions>
            </Item>
            <div><Button type="button" size="sm" variant="outline" onClick={() => setDiscarding(true)}>Discard this plan</Button></div>
          </div>
        ) : null}

        {step === 1 ? (
          <FieldSet>
            <FieldLegend variant="label">Who is on the staff in {planned.name}?</FieldLegend>
            <FieldDescription>Everyone with a sign-in is listed. Untick the people who are leaving. You can change someone’s title for the new year.</FieldDescription>
            <Table>
              <caption className="sr-only">Staff and their titles for the new year</caption>
              <TableHeader><TableRow><TableHead scope="col" className="w-12">Returns</TableHead><TableHead scope="col">Person</TableHead><TableHead scope="col">Title in {planned.name}</TableHead></TableRow></TableHeader>
              <TableBody>
                {people.map((person) => <StaffRowView key={person.userId} person={person} staying={staying.has(person.userId)} title={plan.titles[String(person.userId)] ?? person.title}
                  onStay={(on) => set({ returning: toggle(plan.returning, person.userId, on), carry: on ? plan.carry : plan.carry.filter((id) => !person.assignments.some((assignment) => assignment.id === id)), disable: on ? plan.disable.filter((id) => id !== person.userId) : plan.disable })}
                  onTitle={(title) => set({ titles: { ...plan.titles, [String(person.userId)]: title } })} />)}
              </TableBody>
            </Table>
          </FieldSet>
        ) : null}

        {step === 2 ? (
          <FieldSet>
            <FieldLegend variant="label">Which responsibilities carry over?</FieldLegend>
            <FieldDescription>Only people who return can keep a role. Untick what someone shouldn’t keep; roles nobody holds can be filled afterwards in Roles.</FieldDescription>
            {people.some((person) => staying.has(person.userId) && person.assignments.length) ? (
              <ItemGroup className="rounded-lg border border-border">
                {people.filter((person) => staying.has(person.userId) && person.assignments.length).map((person, index) => (
                  <div key={person.userId}>
                    {index ? <ItemSeparator /> : null}
                    <Item size="sm"><ItemContent>
                      <ItemTitle>{person.name}</ItemTitle>
                      <div className="grid gap-2 pt-1">
                        {person.assignments.map((assignment) => <AssignmentCheck key={assignment.id} label={`${assignment.roleName}${assignment.scope ? ` · ${assignment.scope}` : ""}`} owner={person.name} checked={plan.carry.includes(assignment.id)} onChange={(on) => set({ carry: toggle(plan.carry, assignment.id, on) })} />)}
                      </div>
                    </ItemContent></Item>
                  </div>
                ))}
              </ItemGroup>
            ) : <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No returning staff held a role this year.</p>}
          </FieldSet>
        ) : null}

        {step === 3 ? (
          <FieldSet>
            <FieldLegend variant="label">Departing staff</FieldLegend>
            {leaving.length ? (
              <>
                <FieldDescription>They stay in {overview.active?.name ?? "last year"}’s record and keep their bylines and review history. You can also turn off their sign-in now; otherwise it stays on and you can do it later in People.</FieldDescription>
                <ItemGroup className="rounded-lg border border-border">
                  {leaving.map((person, index) => (
                    <div key={person.userId}>
                      {index ? <ItemSeparator /> : null}
                      <Item size="sm"><ItemContent><ItemTitle>{person.name}</ItemTitle><ItemDescription>{person.title || person.securityRole}</ItemDescription></ItemContent>
                        <ItemActions>{person.securityRole === "administrator" ? <Badge variant="outline">Administrators stay signed in</Badge> : <AssignmentCheck label="Turn off sign-in" owner={person.name} checked={plan.disable.includes(person.userId)} onChange={(on) => set({ disable: toggle(plan.disable, person.userId, on) })} />}</ItemActions>
                      </Item>
                    </div>
                  ))}
                </ItemGroup>
              </>
            ) : <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">Everyone is returning.</p>}
          </FieldSet>
        ) : null}

        {step === 4 ? <Unfinished preview={preview} pending={writes.preview.isPending} admin={admin} /> : null}
        {step === 5 ? <RoutingCheck preview={preview} pending={writes.preview.isPending} admin={admin} /> : null}

        {step === 6 ? (
          <div className="grid gap-3">
            <ItemGroup className="rounded-lg border border-border">
              <Summary label="School year" value={`${planned.name} (${planned.startsOn} to ${planned.endsOn})`} />
              <ItemSeparator />
              <Summary label="Returning" value={`${plan.returning.length} ${plan.returning.length === 1 ? "person" : "people"}`} />
              <ItemSeparator />
              <Summary label="Responsibilities carried over" value={String(plan.carry.length)} />
              <ItemSeparator />
              <Summary label="Departing" value={`${leaving.length}${plan.disable.length ? ` (${plan.disable.length} signed out)` : ""}`} />
              <ItemSeparator />
              <Summary label="Review routing" value={preview ? (preview.routing.length ? `${preview.routing.length} ${preview.routing.length === 1 ? "problem" : "problems"}` : "Works for every Section") : "Checking…"} />
            </ItemGroup>
            {overview.active ? <p className="text-sm text-muted-foreground">{overview.active.name} will be archived. Exactly one school year is active at a time.</p> : null}
            <div><Button type="button" onClick={() => setConfirming(true)} disabled={!preview || writes.activate.isPending}>Start {planned.name}…</Button></div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>Back</Button>
        {step < STEPS.length - 1 ? <Button type="button" size="sm" onClick={() => { setError([]); setStep((value) => Math.min(STEPS.length - 1, value + 1)); }}>Next: {STEPS[step + 1]}</Button> : null}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start {planned.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {overview.active ? `${overview.active.name} will be archived and ` : ""}{planned.name} becomes the active school year.{leaving.length ? ` ${leaving.length} ${leaving.length === 1 ? "person leaves" : "people leave"} the staff.` : ""}{preview?.routing.length ? ` Review routing has ${preview.routing.length} ${preview.routing.length === 1 ? "problem" : "problems"}; reviews for those Sections will fail until a role is filled.` : ""} This can’t be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={writes.activate.isPending}>Not yet</AlertDialogCancel>
            <Button type="button" disabled={writes.activate.isPending} onClick={() => start(true)}>{writes.activate.isPending ? <Spinner /> : null}Start the year</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader><AlertDialogTitle>Discard the plan for {planned.name}?</AlertDialogTitle><AlertDialogDescription>Nothing has changed yet, so only this plan is lost.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel type="button">Keep planning</AlertDialogCancel><Button type="button" variant="destructive" onClick={() => writes.discard.mutate(planned.id, { onSuccess: () => setDiscarding(false), onError: (failure) => { setDiscarding(false); setError(problemsOf(failure)); } })}>Discard</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Summary({ label, value }: { label: string; value: string }) {
  return <Item size="sm"><ItemContent><ItemDescription>{label}</ItemDescription><ItemTitle>{value}</ItemTitle></ItemContent></Item>;
}

function AssignmentCheck({ label, owner, checked, onChange }: { label: string; owner: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(Boolean(on))} aria-label={`${label}: ${owner}`} />
      <FieldLabel htmlFor={id} className="font-normal">{label}</FieldLabel>
    </Field>
  );
}

function StaffRowView({ person, staying, title, onStay, onTitle }: { person: StaffRow; staying: boolean; title: string; onStay: (on: boolean) => void; onTitle: (title: string) => void }) {
  const box = useId();
  const field = useId();
  return (
    <TableRow>
      <TableCell><Checkbox id={box} checked={staying} onCheckedChange={(on) => onStay(Boolean(on))} aria-label={`${person.name} returns`} /></TableCell>
      <TableHead scope="row" className="font-medium"><label htmlFor={box}>{person.name}</label> <Badge variant="outline" className="ml-1">{person.securityRole}</Badge></TableHead>
      <TableCell><label htmlFor={field} className="sr-only">Title for {person.name}</label><Input id={field} value={title} maxLength={80} disabled={!staying} onChange={(event) => onTitle(event.target.value)} placeholder="Public title" /></TableCell>
    </TableRow>
  );
}

function Unfinished({ preview, pending, admin }: { preview: RolloverPreview | null; pending: boolean; admin: string }) {
  const list = useMemo(() => preview?.unfinished ?? [], [preview]);
  if (!preview) return <div aria-busy="true"><Skeleton className="h-20" /></div>;
  if (!list.length) return <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{pending ? "Checking…" : "Nobody who is leaving has stories in progress."}</p>;
  return (
    <div className="grid gap-4">
      <Alert><AlertTitle>{list.reduce((sum, entry) => sum + entry.stories.length, 0)} stories in progress belong to people who are leaving</AlertTitle><AlertDescription>Nothing is reassigned for you. Open each one and give it to someone, or let it finish with its current writer.</AlertDescription></Alert>
      {list.map((entry) => (
        <section key={entry.userId} aria-label={`Stories in progress for ${entry.name}`} className="grid gap-2">
          <h3 className="text-sm font-medium">{entry.name}</h3>
          <Table>
            <caption className="sr-only">Stories in progress for {entry.name}</caption>
            <TableHeader><TableRow><TableHead scope="col">Story</TableHead><TableHead scope="col">Stage</TableHead><TableHead scope="col">Due</TableHead><TableHead scope="col">As</TableHead></TableRow></TableHeader>
            <TableBody>{entry.stories.map((story) => (
              <TableRow key={story.id}>
                <TableHead scope="row" className="font-medium"><ShellLink href={`${admin}/collections/stories/${story.id}`} className="underline-offset-2 hover:underline">{story.title}</ShellLink></TableHead>
                <TableCell className="capitalize">{story.phase}</TableCell>
                <TableCell>{story.deadline ?? "No date"}</TableCell>
                <TableCell className="capitalize">{story.as}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </section>
      ))}
    </div>
  );
}

function RoutingCheck({ preview, pending, admin }: { preview: RolloverPreview | null; pending: boolean; admin: string }) {
  if (!preview) return <div aria-busy="true"><Skeleton className="h-20" /></div>;
  if (!preview.routing.length) return <Alert><AlertTitle>Review routing works for every Section</AlertTitle><AlertDescription>{pending ? "Checking again…" : "Every review step has someone to go to in the new year."}</AlertDescription></Alert>;
  return (
    <div className="grid gap-3">
      <Alert variant="destructive"><AlertTitle>{preview.routing.length === 1 ? "One review step can’t be routed" : `${preview.routing.length} review steps can’t be routed`}</AlertTitle><AlertDescription>Go back to carry a responsibility over, or fill the role after the year starts. You can still start the year; reviews for these Sections will fail at that step and tell the editors.</AlertDescription></Alert>
      <ItemGroup>
        {preview.routing.map((issue) => (
          <Item key={`${issue.workflowId}-${issue.step}-${issue.message}`} variant="outline" size="sm" className="border-destructive/50">
            <ItemContent><ItemTitle>{issue.workflow}: {issue.step}</ItemTitle><ItemDescription>{issue.message}</ItemDescription></ItemContent>
            {issue.fix.kind === "role" ? <ItemActions><Button type="button" size="sm" variant="outline" nativeButton={false} role="link" render={<ShellLink href={`${admin}/people?view=roles&role=${issue.fix.roleId}`} />}>Fix roles</Button></ItemActions> : null}
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
}
