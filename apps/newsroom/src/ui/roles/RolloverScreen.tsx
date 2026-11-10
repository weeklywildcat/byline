"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { DateField, formatWallTime } from "@byline/newsroom-ui/components/date-fields";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Progress } from "@byline/newsroom-ui/ui/progress";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Inbox, UsersRound } from "lucide-react";
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
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

const day = (value: string) => formatWallTime(value, { withTime: false }) || value;

export function RolloverScreen() {
  const { api } = useNewsroomRoutes();
  const years = useYears(api);
  return (
    <AdminRoot toaster={false} className="byline-rollover">
      <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-5 px-4 py-6 lg:px-6" data-byline-rollover-screen="">
        <header className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">New school year</h1>
          <p className="max-w-prose text-sm text-muted-foreground">Decide who returns and which responsibilities carry over. Nothing changes until the last step, and last year’s people, assignments and reviews are kept as history.</p>
        </header>
        <TeamNav current="roles" />
        {years.isError ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>School years couldn’t be loaded</AlertTitle><AlertDescription>{problemsOf(years.error)[0]}</AlertDescription><AlertAction><Button type="button" size="xs" variant="outline" onClick={() => void years.refetch()}>Try again</Button></AlertAction></Alert> : null}
        {years.isPending ? <div className="grid gap-2" aria-busy="true"><Skeleton className="h-6 w-48" /><Skeleton className="h-48 rounded-xl" /></div> : null}
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
  const ids = { name: useId(), form: useId() };
  const [year, setYear] = useState(overview.suggestion);
  const [problems, setProblems] = useState<string[]>([]);
  const backwards = Boolean(year.startsOn && year.endsOn && year.endsOn <= year.startsOn);
  function submit(event: FormEvent) {
    event.preventDefault();
    setProblems([]);
    writes.plan.mutate(year, { onError: (error) => setProblems(problemsOf(error)) });
  }
  return (
    <Card role="region" aria-labelledby="plan-heading" className="max-w-xl">
      <CardHeader>
        <CardTitle id="plan-heading" role="heading" aria-level={2}>{overview.active ? `Plan the year after ${overview.active.name}` : "Plan the first school year"}</CardTitle>
        <CardDescription>{overview.active ? `${overview.active.name} stays active until you start the new year.` : "There is no active school year yet. Reviews can’t be routed until one is started."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form id={ids.form} onSubmit={submit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor={ids.name}>Name</FieldLabel><Input id={ids.name} value={year.name} maxLength={40} onChange={(event) => setYear({ ...year, name: event.target.value })} required placeholder="2027–28" /></Field>
            <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
              <DateField label="First day" value={year.startsOn} onChange={(startsOn) => setYear({ ...year, startsOn })} placeholder="Choose a date" clearable={false} />
              <DateField label="Last day" value={year.endsOn} onChange={(endsOn) => setYear({ ...year, endsOn })} placeholder="Choose a date" clearable={false} error={backwards ? "The last day comes after the first." : undefined} />
            </div>
            {problems.length ? <FieldError errors={problems.map((message) => ({ message }))} /> : null}
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="border-t">
        <Button type="submit" form={ids.form} disabled={writes.plan.isPending || !year.name.trim() || !year.startsOn || !year.endsOn || backwards}>{writes.plan.isPending ? <Spinner data-icon="inline-start" /> : null}Start planning</Button>
      </CardFooter>
    </Card>
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
  const go = (next: number) => { setError([]); setStep(Math.max(0, Math.min(STEPS.length - 1, next))); };
  const keeping = people.filter((person) => staying.has(person.userId) && person.assignments.length);

  function start(confirmed: boolean) {
    setError([]);
    writes.activate.mutate({ id: planned.id, plan, confirmed }, {
      onSuccess: (next) => { setConfirming(false); toast.success(`${next.active?.name ?? "The school year"} is now the active school year.`); },
      onError: (failure) => { setConfirming(false); setError(problemsOf(failure)); setStep(5); }
    });
  }

  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="School year steps" className="hidden lg:sticky lg:top-16 lg:block">
        <ol className="grid gap-0.5">
          {STEPS.map((label, index) => {
            const done = index < step;
            const current = index === step;
            const marker = <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums ${current ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary/40 text-primary" : "text-muted-foreground"}`} aria-hidden="true">{done ? <Check className="size-3.5" /> : index + 1}</span>;
            return (
              <li key={label}>
                {done
                  ? <button type="button" onClick={() => go(index)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">{marker}<span>{label}</span><span className="sr-only"> (done, go back)</span></button>
                  : <span aria-current={current ? "step" : undefined} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${current ? "bg-muted font-medium" : "text-muted-foreground"}`}>{marker}{label}</span>}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid min-w-0 gap-4">
        <Progress value={Math.round(((step + 1) / STEPS.length) * 100)} aria-label={`Step ${step + 1} of ${STEPS.length}`} className="lg:hidden" />
        {error.length ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>That didn’t work</AlertTitle><AlertDescription>{error.map((message) => <span key={message} className="block">{message}</span>)}</AlertDescription></Alert> : null}

        <Card role="region" aria-labelledby="step-heading">
          <CardHeader>
            <CardDescription>Step {step + 1} of {STEPS.length}: {STEPS[step]} · <span className="font-medium text-foreground">{planned.name}</span></CardDescription>
            <CardTitle id="step-heading" role="heading" aria-level={2} className="text-lg">{STEPS[step]}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {step === 0 ? (
              <>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">School year</dt><dd className="font-medium">{planned.name} <Badge variant="outline" className="ml-1 align-middle">Planned</Badge></dd>
                  <dt className="text-muted-foreground">Dates</dt><dd>{day(planned.startsOn)} to {day(planned.endsOn)}</dd>
                  {overview.active ? <><dt className="text-muted-foreground">Follows</dt><dd>{overview.active.name}, which stays active until the last step</dd></> : null}
                </dl>
                <div><Button type="button" size="sm" variant="ghost" className="-ml-2 text-destructive hover:text-destructive" onClick={() => setDiscarding(true)}>Discard this plan</Button></div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <FieldDescription>Everyone with a sign-in is listed. Untick the people who are leaving. You can change someone’s title for the new year.</FieldDescription>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <caption className="sr-only">Staff and their titles for the new year</caption>
                    <TableHeader><TableRow><TableHead scope="col" className="w-16 pl-4">Returns</TableHead><TableHead scope="col">Person</TableHead><TableHead scope="col" className="pr-4">Title in {planned.name}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {people.map((person) => <StaffRowView key={person.userId} person={person} staying={staying.has(person.userId)} title={plan.titles[String(person.userId)] ?? person.title}
                        onStay={(on) => set({ returning: toggle(plan.returning, person.userId, on), carry: on ? plan.carry : plan.carry.filter((id) => !person.assignments.some((assignment) => assignment.id === id)), disable: on ? plan.disable.filter((id) => id !== person.userId) : plan.disable })}
                        onTitle={(title) => set({ titles: { ...plan.titles, [String(person.userId)]: title } })} />)}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">{plan.returning.length} returning · {leaving.length} leaving</p>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <FieldDescription>Only people who return can keep a role. Untick what someone shouldn’t keep; roles nobody holds can be filled afterwards in Roles.</FieldDescription>
                {keeping.length ? (
                  <ItemGroup className="gap-0 divide-y overflow-hidden rounded-lg border">
                    {keeping.map((person) => (
                      <div role="listitem" key={person.userId}>
                        <Item size="sm" className="rounded-none border-0"><ItemContent>
                          <ItemTitle>{person.name}</ItemTitle>
                          <div className="grid gap-2 pt-1">
                            {person.assignments.map((assignment) => <AssignmentCheck key={assignment.id} label={`${assignment.roleName}${assignment.scope ? ` · ${assignment.scope}` : ""}`} owner={person.name} checked={plan.carry.includes(assignment.id)} onChange={(on) => set({ carry: toggle(plan.carry, assignment.id, on) })} />)}
                          </div>
                        </ItemContent></Item>
                      </div>
                    ))}
                  </ItemGroup>
                ) : <Nothing icon={<UsersRound aria-hidden="true" />}>No returning staff held a role this year.</Nothing>}
              </>
            ) : null}

            {step === 3 ? (
              leaving.length ? (
                <>
                  <FieldDescription>They stay in {overview.active?.name ?? "last year"}’s record and keep their bylines and review history. You can also turn off their sign-in now; otherwise it stays on and you can do it later in People.</FieldDescription>
                  <ItemGroup className="gap-0 divide-y overflow-hidden rounded-lg border">
                    {leaving.map((person) => (
                      <div role="listitem" key={person.userId}>
                        <Item size="sm" className="rounded-none border-0"><ItemContent><ItemTitle>{person.name}</ItemTitle><ItemDescription>{person.title || person.securityRole}</ItemDescription></ItemContent>
                          <ItemActions>{person.securityRole === "administrator" ? <Badge variant="outline">Administrators stay signed in</Badge> : <AssignmentCheck label="Turn off sign-in" owner={person.name} checked={plan.disable.includes(person.userId)} onChange={(on) => set({ disable: toggle(plan.disable, person.userId, on) })} />}</ItemActions>
                        </Item>
                      </div>
                    ))}
                  </ItemGroup>
                </>
              ) : <Nothing icon={<CircleCheck aria-hidden="true" />}>Everyone is returning.</Nothing>
            ) : null}

            {step === 4 ? <Unfinished preview={preview} pending={writes.preview.isPending} admin={admin} /> : null}
            {step === 5 ? <RoutingCheck preview={preview} pending={writes.preview.isPending} admin={admin} /> : null}

            {step === 6 ? (
              <>
                <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">School year</dt><dd className="font-medium">{planned.name} ({day(planned.startsOn)} to {day(planned.endsOn)})</dd>
                  <dt className="text-muted-foreground">Returning</dt><dd>{plan.returning.length} {plan.returning.length === 1 ? "person" : "people"}</dd>
                  <dt className="text-muted-foreground">Responsibilities carried over</dt><dd>{plan.carry.length}</dd>
                  <dt className="text-muted-foreground">Departing</dt><dd>{leaving.length}{plan.disable.length ? ` (${plan.disable.length} signed out)` : ""}</dd>
                  <dt className="text-muted-foreground">Review routing</dt><dd>{preview ? (preview.routing.length ? <Badge variant="destructive">{preview.routing.length} {preview.routing.length === 1 ? "problem" : "problems"}</Badge> : "Works for every Section") : "Checking…"}</dd>
                </dl>
                {overview.active ? <p className="text-sm text-muted-foreground">{overview.active.name} will be archived. Exactly one school year is active at a time.</p> : null}
              </>
            ) : null}
          </CardContent>
          <CardFooter className="justify-between gap-2 border-t">
            <Button type="button" variant="outline" onClick={() => go(step - 1)} disabled={step === 0}><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back</Button>
            {step < STEPS.length - 1
              ? <Button type="button" onClick={() => go(step + 1)}>Next: {STEPS[step + 1]}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button>
              : <Button type="button" onClick={() => setConfirming(true)} disabled={!preview || writes.activate.isPending}>Start {planned.name}…</Button>}
          </CardFooter>
        </Card>
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
            <AlertDialogAction type="button" disabled={writes.activate.isPending} onClick={() => start(true)}>{writes.activate.isPending ? <Spinner data-icon="inline-start" /> : null}Start the year</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader><AlertDialogTitle>Discard the plan for {planned.name}?</AlertDialogTitle><AlertDialogDescription>Nothing has changed yet, so only this plan is lost.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel type="button">Keep planning</AlertDialogCancel><AlertDialogAction type="button" variant="destructive" disabled={writes.discard.isPending} onClick={() => writes.discard.mutate(planned.id, { onSuccess: () => setDiscarding(false), onError: (failure) => { setDiscarding(false); setError(problemsOf(failure)); } })}>Discard</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Nothing({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <Empty className="gap-2 rounded-lg border border-dashed p-6"><EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyDescription>{children}</EmptyDescription></EmptyHeader></Empty>;
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
      <TableCell className="pl-4"><Checkbox id={box} checked={staying} onCheckedChange={(on) => onStay(Boolean(on))} aria-label={`${person.name} returns`} /></TableCell>
      <TableHead scope="row" className="font-medium"><label htmlFor={box}>{person.name}</label> <Badge variant="outline" className="ml-1 font-normal capitalize">{person.securityRole}</Badge></TableHead>
      <TableCell className="pr-4"><label htmlFor={field} className="sr-only">Title for {person.name}</label><Input id={field} value={title} maxLength={80} disabled={!staying} onChange={(event) => onTitle(event.target.value)} placeholder="Public title" /></TableCell>
    </TableRow>
  );
}

function Unfinished({ preview, pending, admin }: { preview: RolloverPreview | null; pending: boolean; admin: string }) {
  const list = useMemo(() => preview?.unfinished ?? [], [preview]);
  if (!preview) return <div aria-busy="true"><Skeleton className="h-20 rounded-lg" /></div>;
  if (!list.length) return <Nothing icon={pending ? <Spinner /> : <Inbox aria-hidden="true" />}>{pending ? "Checking…" : "Nobody who is leaving has stories in progress."}</Nothing>;
  return (
    <div className="grid gap-4">
      <Alert><CircleAlert aria-hidden="true" /><AlertTitle>{list.reduce((sum, entry) => sum + entry.stories.length, 0)} stories in progress belong to people who are leaving</AlertTitle><AlertDescription>Nothing is reassigned for you. Open each one and give it to someone, or let it finish with its current writer.</AlertDescription></Alert>
      {list.map((entry) => (
        <section key={entry.userId} aria-label={`Stories in progress for ${entry.name}`} className="grid gap-2">
          <h3 className="text-sm font-medium">{entry.name}</h3>
          <div className="overflow-x-auto rounded-lg border"><Table>
            <caption className="sr-only">Stories in progress for {entry.name}</caption>
            <TableHeader><TableRow><TableHead scope="col" className="pl-4">Story</TableHead><TableHead scope="col">Stage</TableHead><TableHead scope="col">Due</TableHead><TableHead scope="col">As</TableHead></TableRow></TableHeader>
            <TableBody>{entry.stories.map((story) => (
              <TableRow key={story.id}>
                <TableHead scope="row" className="pl-4 font-medium"><ShellLink href={`${admin}/collections/stories/${story.id}`} className="underline-offset-2 hover:underline">{story.title}</ShellLink></TableHead>
                <TableCell className="capitalize">{story.phase}</TableCell>
                <TableCell>{story.deadline ?? "No date"}</TableCell>
                <TableCell className="capitalize">{story.as}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></div>
        </section>
      ))}
    </div>
  );
}

function RoutingCheck({ preview, pending, admin }: { preview: RolloverPreview | null; pending: boolean; admin: string }) {
  if (!preview) return <div aria-busy="true"><Skeleton className="h-20 rounded-lg" /></div>;
  if (!preview.routing.length) return <Alert><CircleCheck aria-hidden="true" /><AlertTitle>Review routing works for every Section</AlertTitle><AlertDescription>{pending ? "Checking again…" : "Every review step has someone to go to in the new year."}</AlertDescription></Alert>;
  return (
    <div className="grid gap-3">
      <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>{preview.routing.length === 1 ? "One review step can’t be routed" : `${preview.routing.length} review steps can’t be routed`}</AlertTitle><AlertDescription>Go back to carry a responsibility over, or fill the role after the year starts. You can still start the year; reviews for these Sections will fail at that step and tell the editors.</AlertDescription></Alert>
      <ItemGroup className="gap-2">
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
