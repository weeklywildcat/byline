"use client";

import { ChoiceCards } from "@byline/newsroom-ui/components/choice-cards";
import { FormField, TextField } from "@byline/newsroom-ui/components/form-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Radio } from "lucide-react";
import { useId, useState } from "react";
import type { SessionSummary } from "../../polls/server";
import { useNewsroomRoutes } from "../shell/account";
import { createSession, endSession, fetchOverview, formatWhen, pollKeys, startKiosk } from "./api";
import { ListSkeleton, PageHeader, PollsBreadcrumb } from "./PollStudio";

/**
 * Fieldwork setup (docs/wildcat-polls.md#kiosk): choose the poll, where you
 * are and when, set a PIN, and lock this device. Starting the kiosk ends this
 * device's Byline sign-in on the server; the interviewer signs in again to
 * come back here.
 */

const PERIODS = ["Before school", "Lunch A", "Lunch B", "Lunch C", "After school"];
const PIN = /^\d{4,8}$/;

/** Tells other Byline tabs on this device that the account signed out here, so none of them stays on screen. */
function announceSignedOut() {
  // This tab is on its way to the kiosk; only the others should leave.
  (window as { bylineHandingOff?: boolean }).bylineHandingOff = true;
  try {
    const channel = new BroadcastChannel("byline-account");
    channel.postMessage({ type: "signed-out" });
    channel.close();
  } catch {
    // Older browsers: the other tabs find out on their next request.
  }
}

async function handOff(api: string, sessionId: string, pin: string) {
  const { kiosk } = await startKiosk(api, sessionId, pin);
  announceSignedOut();
  // Replace, so Back from the kiosk never returns to a signed-in page.
  window.location.replace(kiosk);
}

function PinInput({ label, value, onChange, invalid }: { label: string; value: string; onChange: (value: string) => void; invalid?: boolean }) {
  const id = useId();
  return (
    <FormField id={id} label={label}>
      <Input id={id} type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={value} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))} />
    </FormField>
  );
}

export function Fieldwork({ preselect }: { preselect: number | null }) {
  const { api } = useNewsroomRoutes();
  const overview = useQuery({ queryKey: pollKeys.overview(), queryFn: () => fetchOverview(api) });
  const data = overview.data;
  const surveys = data?.surveys.filter((survey) => survey.canInterview) ?? [];
  const locations = data?.locations.filter((location) => location.active) ?? [];
  const [surveyId, setSurveyId] = useState<number | null>(preselect);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locationName, setLocationName] = useState("");
  const [period, setPeriod] = useState("");
  const [method, setMethod] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const chosen = surveyId ?? (surveys.length === 1 ? surveys[0].id : null);
  const place = locations.length ? locations.find((location) => location.id === locationId)?.name ?? "" : locationName.trim();
  const pinProblem = pin && !PIN.test(pin) ? "Use 4 to 8 digits." : pin && pinAgain.length >= pin.length && pin !== pinAgain ? "The PINs don't match." : null;
  const ready = Boolean(chosen && place && PIN.test(pin) && pin === pinAgain);
  const start = useMutation({
    mutationFn: async () => {
      const { id } = await createSession(api, { surveyId: chosen!, ...(locationId ? { locationId } : { locationName: place }), period: period.trim(), method: method.trim() });
      await handOff(api, id, pin);
    }
  });
  const mine = data?.sessions.filter((session) => String(session.interviewerId) === String(data.me.id)) ?? [];

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-6 px-4 py-5 lg:px-6" data-polls-fieldwork="">
      <div className="flex flex-col gap-4">
        <PollsBreadcrumb trail={[{ label: "Start fieldwork" }]} />
        <PageHeader level="detail" title="Start fieldwork" description="Set up on this iPad, then hand it to students. The device keeps counts, never names." />
      </div>
      {overview.isError ? <InlineAlert title="Polls aren't available" onAction={() => void overview.refetch()}>{(overview.error as Error).message}</InlineAlert> : null}
      {!data ? <ListSkeleton /> : !surveys.length ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Radio /></EmptyMedia>
            <EmptyTitle>No poll is ready for fieldwork</EmptyTitle>
            <EmptyDescription>An editor publishes a poll and adds you as an interviewer.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); if (ready) start.mutate(); }}>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Poll</FieldLegend>
              <ChoiceCards label="Poll" value={chosen ? String(chosen) : ""} onChange={(value) => setSurveyId(Number(value))}
                options={surveys.map((survey) => ({ value: String(survey.id), title: survey.title, description: `Version ${survey.versionNumber ?? "—"}` }))} />
            </FieldSet>

            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Location</FieldLegend>
              {locations.length ? (
                <ChoiceCards label="Location" className="sm:grid-cols-2" value={locationId ? String(locationId) : ""} onChange={(value) => setLocationId(Number(value))}
                  options={locations.map((location) => ({ value: String(location.id), title: location.name }))} />
              ) : (
                <TextField label="Where are you?" value={locationName} onChange={setLocationName} maxLength={120} placeholder="e.g. Cafeteria" hint="An editor can keep a list of locations in Poll Studio." />
              )}
            </FieldSet>

            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Period</FieldLegend>
              <FieldDescription>Optional.</FieldDescription>
              <ToggleGroup variant="outline" aria-label="Collection period" className="flex-wrap" value={PERIODS.includes(period) ? [period] : []} onValueChange={(next: unknown[]) => setPeriod(typeof next[0] === "string" ? next[0] : "")}>
                {PERIODS.map((entry) => <ToggleGroupItem key={entry} value={entry}>{entry}</ToggleGroupItem>)}
              </ToggleGroup>
              <TextField label="Or describe it" value={PERIODS.includes(period) ? "" : period} onChange={setPeriod} maxLength={120} optional />
            </FieldSet>

            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Sampling method</FieldLegend>
              <TextField label="How you're choosing students" value={method} onChange={setMethod} maxLength={200} optional placeholder="e.g. Every third student in the lunch line" />
            </FieldSet>

            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Interviewer PIN</FieldLegend>
              <FieldDescription>Only you can return to the interviewer controls. Use 4 to 8 digits that aren't your Byline password.</FieldDescription>
              <div className="grid max-w-sm grid-cols-2 gap-3">
                <PinInput label="PIN" value={pin} onChange={setPin} invalid={Boolean(pinProblem)} />
                <PinInput label="Again" value={pinAgain} onChange={setPinAgain} invalid={Boolean(pinProblem)} />
              </div>
              {pinProblem ? <FieldError>{pinProblem}</FieldError> : null}
            </FieldSet>

            <FieldSeparator />
            <Field>
              {start.isError ? <InlineAlert title="Fieldwork didn't start">{(start.error as Error).message}</InlineAlert> : null}
              <Button type="submit" size="lg" disabled={!ready || start.isPending}>
                {start.isPending ? <Spinner data-icon="inline-start" /> : <Lock data-icon="inline-start" />}Start session and lock this iPad
              </Button>
              <FieldDescription>Starting signs this device out of Byline. Students can only take the poll; you'll sign in again to come back to Poll Studio.</FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      )}

      {mine.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="my-sessions">
          <h2 id="my-sessions" className="text-sm font-semibold">Your open sessions</h2>
          <SessionRows sessions={mine} meId={data!.me.id} manage={data!.me.canManage} showSurvey timeZone={data!.timeZone} />
        </section>
      ) : null}
    </main>
  );
}

/** Sessions with their counts, and what this account may do with each. */
export function SessionRows({ sessions, meId, manage, showSurvey, timeZone }: { sessions: Array<SessionSummary & { survey?: string }>; meId: number | string; manage: boolean; showSurvey?: boolean; timeZone: string }) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const [lockFor, setLockFor] = useState<string | null>(null);
  const [endFor, setEndFor] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const kiosk = useMutation({ mutationFn: (id: string) => handOff(api, id, pin) });
  const end = useMutation({ mutationFn: (id: string) => endSession(api, id), onSuccess: () => { setEndFor(null); void queries.invalidateQueries({ queryKey: pollKeys.all }); } });
  return (
    <>
      <ItemGroup className="gap-0 rounded-lg border">
        {sessions.map((session, index) => {
          const mine = String(session.interviewerId) === String(meId);
          return (
            <Item key={session.id} className={index ? "rounded-none border-t-border" : "rounded-none"}>
              <ItemContent className="min-w-48">
                <ItemTitle>{showSurvey && session.survey ? session.survey : session.locationName}</ItemTitle>
                <ItemDescription>
                  {[showSurvey ? session.locationName : null, session.period || null, session.interviewer, `since ${formatWhen(session.startedAt, timeZone)}`].filter(Boolean).join(" · ")}
                </ItemDescription>
                <ItemDescription className="tabular-nums"><span className="font-medium text-foreground">{session.counts.completed}</span> completed · {session.counts.declined} declined · {session.counts.abandoned} incomplete</ItemDescription>
              </ItemContent>
              <ItemActions>
                <StatusBadge tone={session.status === "active" && session.kioskActive ? "done" : session.status === "paused" ? "attention" : "neutral"}>
                  {session.status === "ended" ? "Ended" : session.status === "paused" ? "Paused" : session.kioskActive ? "On a device" : "Not on a device"}
                </StatusBadge>
                {session.status !== "ended" && mine ? <Button type="button" variant="outline" size="sm" onClick={() => { setPin(""); setLockFor(session.id); }}><Lock data-icon="inline-start" />Use this iPad</Button> : null}
                {session.status !== "ended" && (mine || manage) ? <Button type="button" variant="ghost" size="sm" onClick={() => setEndFor(session.id)}>End</Button> : null}
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>

      <Dialog open={lockFor !== null} onOpenChange={(open) => !open && setLockFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Lock this iPad for the session</DialogTitle>
            <DialogDescription>Choose a new PIN. Any other device running this session stops, and this device signs out of Byline.</DialogDescription>
          </DialogHeader>
          <form id="resume-kiosk" onSubmit={(event) => { event.preventDefault(); if (lockFor && PIN.test(pin)) kiosk.mutate(lockFor); }}>
            <PinInput label="PIN" value={pin} onChange={setPin} />
            {kiosk.isError ? <FieldError className="mt-2">{(kiosk.error as Error).message}</FieldError> : null}
          </form>
          <DialogFooter><Button type="submit" form="resume-kiosk" disabled={!PIN.test(pin) || kiosk.isPending}>{kiosk.isPending ? <Spinner data-icon="inline-start" /> : null}Lock this iPad</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={endFor !== null} onOpenChange={(open) => !open && setEndFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>A device still running it leaves kiosk mode. A survey in progress there is counted as incomplete, and answers still waiting to upload on it are lost.</AlertDialogDescription>
          </AlertDialogHeader>
          {end.isError ? <FieldError>{(end.error as Error).message}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); if (endFor) end.mutate(endFor); }}>End session</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
