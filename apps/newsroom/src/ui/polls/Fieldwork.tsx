"use client";

import { ChoiceCards } from "@byline/newsroom-ui/components/choice-cards";
import { DateTimeField } from "@byline/newsroom-ui/components/date-fields";
import { FormField, TextField } from "@byline/newsroom-ui/components/form-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogRoot, DialogTitle } from "@byline/newsroom-ui/ui/adaptive-dialog";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleCheck, Copy, Link2, Lock, MonitorSmartphone, Radio, RefreshCw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { instantToLocal, localToInstant } from "../../domain/dates";
import { pairingPath, PAIR_PATH } from "../../polls/links";
import type { SessionSummary } from "../../polls/server";
import { useNewsroomRoutes } from "../shell/account";
import { cancelPairing, createSession, endSession, fetchOverview, formatWhen, pollKeys, preparePairing, startKiosk, type PairingCode } from "./api";
import { ListSkeleton, PageHeader, PollsBreadcrumb } from "./PollStudio";
import { QrCode } from "./QrCode";

/**
 * Fieldwork (docs/wildcat-polls.md#collect): choose the poll, where you are and
 * when, and a PIN, then put the session on the iPad you'll hand to students.
 *
 * Pairing is the recommended way: Poll Studio shows a six-digit code that
 * lasts as long as you choose (up to two days), the iPad types it at /poll,
 * and it never signs in to Byline. "Use this device" turns the signed-in
 * device itself into the kiosk, which signs it out of Byline on the server.
 */

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

/** "Use this device": the signed-in device becomes the kiosk and leaves Byline. */
async function handOff(api: string, sessionId: string, pin: string) {
  const { kiosk } = await startKiosk(api, sessionId, pin);
  announceSignedOut();
  // Replace, so Back from the kiosk never returns to a signed-in page.
  window.location.replace(kiosk);
}

function pinProblem(pin: string, again: string): string | null {
  if (pin && !PIN.test(pin)) return "Use 4 to 8 digits.";
  if (pin && again.length >= pin.length && pin !== again) return "The PINs don't match.";
  return null;
}

/** The interviewer's PIN, twice. Digits only; never their Byline password. */
function PinFields({ pin, again, onPin, onAgain }: { pin: string; again: string; onPin: (value: string) => void; onAgain: (value: string) => void }) {
  const id = useId();
  const problem = pinProblem(pin, again);
  return (
    <FieldSet>
      <FieldLegend>Interviewer PIN</FieldLegend>
      <FieldDescription>Only you can open the interviewer controls on the iPad. 4 to 8 digits, not your Byline password.</FieldDescription>
      <div className="grid max-w-sm grid-cols-2 gap-3">
        <FormField id={`${id}-pin`} label="PIN">
          <Input id={`${id}-pin`} type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} aria-invalid={problem ? true : undefined} onChange={(event) => onPin(event.target.value.replace(/\D/g, ""))} />
        </FormField>
        <FormField id={`${id}-again`} label="Again">
          <Input id={`${id}-again`} type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={again} aria-invalid={problem ? true : undefined} onChange={(event) => onAgain(event.target.value.replace(/\D/g, ""))} />
        </FormField>
      </div>
      {problem ? <FieldError>{problem}</FieldError> : null}
    </FieldSet>
  );
}

/* ------------------------------------------------------------------ code lifetime */

const MAX_MINUTES = 2 * 24 * 60;
const PRESETS: Array<{ value: string; label: string; minutes: number }> = [
  { value: "15", label: "15 minutes", minutes: 15 },
  { value: "60", label: "1 hour", minutes: 60 },
  { value: "480", label: "8 hours", minutes: 480 },
  { value: "1440", label: "1 day", minutes: 1440 },
  { value: "2880", label: "2 days", minutes: 2880 }
];

/** How long a pairing code lasts: a preset, or a time you choose, at most two days away. */
export type Expiry = { preset: string; until: string };
export const DEFAULT_EXPIRY: Expiry = { preset: "60", until: "" };

function expiryMinutes(expiry: Expiry, timeZone: string): number | null {
  if (expiry.preset !== "custom") return PRESETS.find((entry) => entry.value === expiry.preset)?.minutes ?? 60;
  if (!expiry.until) return null;
  const minutes = Math.round((Date.parse(localToInstant(expiry.until, timeZone)) - Date.now()) / 60_000);
  return minutes >= 5 && minutes <= MAX_MINUTES ? minutes : null;
}

function ExpiryField({ value, onChange, timeZone }: { value: Expiry; onChange: (value: Expiry) => void; timeZone: string }) {
  const minutes = expiryMinutes(value, timeZone);
  const latest = instantToLocal(new Date(Date.now() + MAX_MINUTES * 60_000), timeZone);
  return (
    <FieldSet>
      <FieldLegend>Code lasts</FieldLegend>
      <FieldDescription>Set the iPad up now, or later: the code works once, until it expires. Two days at most.</FieldDescription>
      <ToggleGroup variant="outline" aria-label="How long the pairing code lasts" className="flex-wrap" value={[value.preset]} onValueChange={(next: unknown[]) => { if (typeof next[0] === "string") onChange({ ...value, preset: next[0] }); }}>
        {PRESETS.map((entry) => <ToggleGroupItem key={entry.value} value={entry.value}>{entry.label}</ToggleGroupItem>)}
        <ToggleGroupItem value="custom">Until…</ToggleGroupItem>
      </ToggleGroup>
      {value.preset === "custom" ? (
        <div className="max-w-xs">
          <DateTimeField label="Expires" value={value.until} timeZone={timeZone} onChange={(until) => onChange({ ...value, until })}
            error={value.until && minutes === null ? `Choose a time between 5 minutes and 2 days from now (before ${latest.replace("T", " ")}).` : undefined} />
        </div>
      ) : null}
    </FieldSet>
  );
}

export type FieldworkPoll = { id: number; title: string; versionNumber: number | null };
type Place = { id: number; name: string };

/** `/admin/polls?view=fieldwork`: choose one of your polls, then set up. */
export function Fieldwork() {
  const { api } = useNewsroomRoutes();
  const overview = useQuery({ queryKey: pollKeys.overview(), queryFn: () => fetchOverview(api) });
  const data = overview.data;
  const surveys = data?.surveys.filter((survey) => survey.canInterview) ?? [];
  const mine = data?.sessions.filter((session) => String(session.interviewerId) === String(data.me.id)) ?? [];
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[760px] flex-col gap-6 px-4 py-5 lg:px-6" data-polls-fieldwork="">
      <div className="flex flex-col gap-4">
        <PollsBreadcrumb trail={[{ label: "Start fieldwork" }]} />
        <PageHeader level="detail" title="Start fieldwork" description="Set up a session here, then pair the iPad you'll hand to students with a six-digit code. It never signs in to Byline, and it keeps counts, never names." />
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
        <FieldworkSetup polls={surveys} locations={data.locations.filter((location) => location.active)} periods={data.periods} sessions={data.sessions} timeZone={data.timeZone} />
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

/**
 * The setup form: poll (when there's a choice), location, period, sampling
 * method, PIN and how long the code lasts. It ends on the pairing code, or
 * hands this device over.
 */
export function FieldworkSetup({ polls, preselect, locations, periods, sessions, timeZone, onCancel }: {
  polls: FieldworkPoll[];
  preselect?: number;
  locations: Place[];
  periods: string[];
  /** Live sessions, to notice when the paired device arrives. */
  sessions: SessionSummary[];
  timeZone: string;
  onCancel?: () => void;
}) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const [surveyId, setSurveyId] = useState<number | null>(preselect ?? null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locationName, setLocationName] = useState("");
  const [period, setPeriod] = useState("");
  const [method, setMethod] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [expiry, setExpiry] = useState<Expiry>(DEFAULT_EXPIRY);
  const [pairing, setPairing] = useState<{ sessionId: string; code: PairingCode; minutes: number } | null>(null);
  const chosen = surveyId ?? (polls.length === 1 ? polls[0].id : null);
  const place = locations.length ? locations.find((location) => location.id === locationId)?.name ?? "" : locationName.trim();
  const minutes = expiryMinutes(expiry, timeZone);
  const ready = Boolean(chosen && place && PIN.test(pin) && pin === again);
  const session = async () => (await createSession(api, { surveyId: chosen!, ...(locationId ? { locationId } : { locationName: place }), period: period.trim(), method: method.trim() })).id;
  const pair = useMutation({
    mutationFn: async () => {
      const sessionId = await session();
      return { sessionId, minutes: minutes!, code: await preparePairing(api, sessionId, { pin, expiresInMinutes: minutes! }) };
    },
    onSuccess: (next) => { setPairing(next); void queries.invalidateQueries({ queryKey: pollKeys.all }); }
  });
  const here = useMutation({ mutationFn: async () => handOff(api, await session(), pin) });

  if (pairing) {
    const live = sessions.find((entry) => entry.id === pairing.sessionId);
    return <PairingPanel sessionId={pairing.sessionId} code={pairing.code} minutes={pairing.minutes} session={live} timeZone={timeZone} onCode={(code) => setPairing({ ...pairing, code })} onDone={() => { setPairing(null); onCancel?.(); }} />;
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (ready && minutes) pair.mutate(); }} data-polls-setup="">
      <FieldGroup>
        {polls.length > 1 || !preselect ? (
          <>
            <FieldSet>
              <FieldLegend>Poll</FieldLegend>
              <ChoiceCards label="Poll" value={chosen ? String(chosen) : ""} onChange={(value) => setSurveyId(Number(value))}
                options={polls.map((poll) => ({ value: String(poll.id), title: poll.title, description: `Version ${poll.versionNumber ?? "—"}` }))} />
            </FieldSet>
            <FieldSeparator />
          </>
        ) : null}

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
          {periods.length ? (
            <ToggleGroup variant="outline" aria-label="Collection period" className="flex-wrap" value={periods.includes(period) ? [period] : []} onValueChange={(next: unknown[]) => setPeriod(typeof next[0] === "string" ? next[0] : "")}>
              {periods.map((entry) => <ToggleGroupItem key={entry} value={entry}>{entry}</ToggleGroupItem>)}
            </ToggleGroup>
          ) : null}
          <TextField label={periods.length ? "Or describe it" : "When"} value={periods.includes(period) ? "" : period} onChange={setPeriod} maxLength={120} optional />
        </FieldSet>

        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Sampling method</FieldLegend>
          <TextField label="How you'll choose students" value={method} onChange={setMethod} maxLength={200} optional placeholder="e.g. Every third student in the lunch line"
            hint="Shown large on the iPad's interviewer screen while you choose who to approach, and reported with the results." />
        </FieldSet>

        <FieldSeparator />
        <PinFields pin={pin} again={again} onPin={setPin} onAgain={setAgain} />

        <FieldSeparator />
        <ExpiryField value={expiry} onChange={setExpiry} timeZone={timeZone} />

        <FieldSeparator />
        <Field>
          {pair.isError || here.isError ? <InlineAlert title="Fieldwork didn't start">{((pair.error ?? here.error) as Error).message}</InlineAlert> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="lg" disabled={!ready || !minutes || pair.isPending || here.isPending}>
              {pair.isPending ? <Spinner data-icon="inline-start" /> : <MonitorSmartphone data-icon="inline-start" />}Get a pairing code
            </Button>
            <Button type="button" size="lg" variant="outline" disabled={!ready || pair.isPending || here.isPending} onClick={() => here.mutate()}>
              {here.isPending ? <Spinner data-icon="inline-start" /> : <Lock data-icon="inline-start" />}Use this device instead
            </Button>
            {onCancel ? <Button type="button" size="lg" variant="ghost" onClick={onCancel}>Cancel</Button> : null}
          </div>
          <FieldDescription>Recommended: pair the iPad with a code, so nobody signs in to Byline on it. “Use this device” signs this device out of Byline and locks it to the poll.</FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function lifetime(ms: number, expiresAt: string, timeZone: string): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds <= 3600) return `for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} more`;
  return `until ${formatWhen(expiresAt, timeZone)}`;
}

/**
 * A pairing code, ready for the iPad: where to go, the code, how long it
 * lasts, and a QR code for the whole link. It watches for the device to arrive.
 */
export function PairingPanel({ sessionId, code, minutes, session, timeZone, onCode, onDone }: { sessionId: string; code: PairingCode; minutes?: number; session: SessionSummary | undefined; timeZone?: string; onCode: (code: PairingCode) => void; onDone: () => void }) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const now = useNow();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const expiresAt = Date.parse(code.expiresAt);
  const remaining = expiresAt - now;
  const paired = Boolean(session && session.kioskActive && !session.pairingExpiresAt && (!code.replaces || remaining > 0));
  const expired = !paired && remaining <= 0;
  // Watch for the device while the code is live.
  useEffect(() => {
    if (paired || expired) return;
    const timer = window.setInterval(() => void queries.invalidateQueries({ queryKey: pollKeys.all }), 3000);
    return () => window.clearInterval(timer);
  }, [paired, expired, queries]);
  const fresh = useMutation({ mutationFn: () => preparePairing(api, sessionId, { replaceDevice: code.replaces, ...(minutes ? { expiresInMinutes: minutes } : {}) }), onSuccess: onCode });
  const cancel = useMutation({ mutationFn: () => cancelPairing(api, sessionId), onSuccess: () => { void queries.invalidateQueries({ queryKey: pollKeys.all }); onDone(); } });
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const host = typeof window === "undefined" ? "" : window.location.host;
  const link = `${origin}${pairingPath(code.code)}`;
  const copy = (what: "code" | "link") => {
    void navigator.clipboard?.writeText(what === "code" ? code.code.replace(/\s/g, "") : link).then(() => { setCopied(what); window.setTimeout(() => setCopied(null), 2000); });
  };

  if (paired) {
    return (
      <Alert data-polls-paired="">
        <CircleCheck />
        <AlertTitle>The iPad is paired</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>It's locked. Enter your PIN on it to open the interviewer controls, then lock it again before you hand it to a student.</p>
          <div><Button type="button" variant="outline" onClick={onDone}>Done</Button></div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card data-polls-pairing="">
      <CardHeader>
        <CardTitle>Pair the iPad</CardTitle>
        <CardDescription>On the iPad you'll hand to students, open Safari and go to <span className="font-medium text-foreground">{host}{PAIR_PATH}</span>, then enter this code. Nobody signs in to Byline on it.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className={expired ? "font-mono text-5xl font-semibold tracking-[0.15em] text-muted-foreground line-through tabular-nums" : "font-mono text-5xl font-semibold tracking-[0.15em] tabular-nums"} aria-label={`Pairing code ${code.code.replace(/\s/g, "").split("").join(" ")}`} data-polls-pairing-code="">
            {code.code}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums" role="status">
            {expired ? "This code has expired. Get a new one." : `Works once, ${lifetime(remaining, code.expiresAt, timeZone ?? "")}.`}
            {code.replaces && !expired ? " Pairing stops the device running this session now." : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={expired} onClick={() => copy("code")}>{copied === "code" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}Copy code</Button>
            <Button type="button" variant="outline" size="sm" disabled={expired} onClick={() => copy("link")}>{copied === "link" ? <Check data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}Copy pairing link</Button>
            <Button type="button" variant={expired ? "default" : "ghost"} size="sm" disabled={fresh.isPending} onClick={() => fresh.mutate()}>{fresh.isPending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}New code</Button>
          </div>
          {fresh.isError ? <FieldError>{(fresh.error as Error).message}</FieldError> : null}
        </div>
        {!expired ? (
          <div className="flex flex-col items-center gap-1.5">
            <QrCode value={link} label="QR code for the pairing link" className="w-36" />
            <span className="text-xs text-muted-foreground">Or scan with the iPad's camera</span>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        <span className="flex-1 text-xs text-muted-foreground">Waiting for the iPad… The code isn't a password: once used, it stops working, and the iPad still needs your PIN.</span>
        <Button type="button" variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel code</Button>
      </CardFooter>
    </Card>
  );
}

/** A session's device, in a word. */
function deviceState(session: SessionSummary, timeZone: string): { label: string; tone: "done" | "attention" | "neutral" } {
  if (session.status === "ended") return { label: "Ended", tone: "neutral" };
  if (session.status === "paused") return { label: "Paused", tone: "attention" };
  if (session.pairingExpiresAt) return { label: `Code waiting until ${formatWhen(session.pairingExpiresAt, timeZone)}`, tone: "attention" };
  if (session.kioskActive) return { label: "On a device", tone: "done" };
  return { label: "No device", tone: "neutral" };
}

type Dialog = { kind: "pair" | "here"; session: SessionSummary } | null;

/** Sessions with their counts, their device, and what this account may do with each. */
export function SessionRows({ sessions, meId, manage, showSurvey, timeZone, onOpenSurvey }: { sessions: Array<SessionSummary & { survey?: string }>; meId: number | string; manage: boolean; showSurvey?: boolean; timeZone: string; onOpenSurvey?: (surveyId: number) => void }) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [endFor, setEndFor] = useState<string | null>(null);
  const end = useMutation({ mutationFn: (id: string) => endSession(api, id), onSuccess: () => { setEndFor(null); void queries.invalidateQueries({ queryKey: pollKeys.all }); } });
  return (
    <>
      <ItemGroup className="gap-0 rounded-lg border" data-polls-sessions="">
        {sessions.map((session, index) => {
          const mine = String(session.interviewerId) === String(meId);
          const device = deviceState(session, timeZone);
          const canRun = session.status !== "ended" && (mine || manage);
          return (
            <Item key={session.id} className={index ? "rounded-none border-t-border" : "rounded-none"} data-polls-session={session.id}>
              <ItemContent className="min-w-48">
                <ItemTitle className="flex-wrap">
                  {showSurvey && session.survey ? (
                    onOpenSurvey ? <button type="button" className="text-left hover:underline" onClick={() => onOpenSurvey(session.surveyId)}>{session.survey}</button> : session.survey
                  ) : session.locationName}
                  <StatusBadge tone={device.tone}>{device.label}</StatusBadge>
                </ItemTitle>
                <ItemDescription>
                  {[showSurvey ? session.locationName : null, session.period || null, session.interviewer, `since ${formatWhen(session.startedAt, timeZone)}`].filter(Boolean).join(" · ")}
                </ItemDescription>
                {session.method ? <ItemDescription>Sampling: {session.method}</ItemDescription> : null}
                <ItemDescription className="tabular-nums"><span className="font-medium text-foreground">{session.counts.completed}</span> completed · {session.counts.declined} declined · {session.counts.abandoned} incomplete</ItemDescription>
              </ItemContent>
              {canRun ? (
                <ItemActions className="flex-wrap">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: "pair", session })}><MonitorSmartphone data-icon="inline-start" />{session.pairingExpiresAt ? "New code" : "Pair a device"}</Button>
                  {mine ? <Button type="button" variant="ghost" size="sm" onClick={() => setDialog({ kind: "here", session })}><Lock data-icon="inline-start" />Use this device</Button> : null}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEndFor(session.id)}>End</Button>
                </ItemActions>
              ) : null}
            </Item>
          );
        })}
      </ItemGroup>

      {dialog ? <DeviceDialog key={`${dialog.kind}-${dialog.session.id}`} dialog={dialog} sessions={sessions} timeZone={timeZone} onClose={() => setDialog(null)} /> : null}

      <AlertDialog open={endFor !== null} onOpenChange={(open) => !open && setEndFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>A device still running it leaves the poll. A survey in progress there is counted as incomplete, and answers still waiting to upload on it are lost. An unused pairing code stops working.</AlertDialogDescription>
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

/** Pair a device to an existing session, or turn this device into its kiosk. */
function DeviceDialog({ dialog, sessions, timeZone, onClose }: { dialog: NonNullable<Dialog>; sessions: SessionSummary[]; timeZone: string; onClose: () => void }) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [expiry, setExpiry] = useState<Expiry>(DEFAULT_EXPIRY);
  const [code, setCode] = useState<PairingCode | null>(null);
  const { session } = dialog;
  const replaces = session.kioskActive;
  const pending = Boolean(session.pairingExpiresAt);
  const ready = PIN.test(pin) && pin === again;
  const minutes = expiryMinutes(expiry, timeZone);
  const canPair = Boolean(minutes) && (ready || (pending && !pin));
  const pair = useMutation({
    // A code still waiting keeps its PIN unless a new one is typed.
    mutationFn: () => preparePairing(api, session.id, { ...(pin ? { pin } : {}), replaceDevice: replaces, expiresInMinutes: minutes! }),
    onSuccess: (next) => { setCode(next); void queries.invalidateQueries({ queryKey: pollKeys.all }); }
  });
  const here = useMutation({ mutationFn: () => handOff(api, session.id, pin) });
  const live = sessions.find((entry) => entry.id === session.id) ?? session;
  return (
    <DialogRoot open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {code ? (
          <>
            <DialogHeader>
              <DialogTitle>Pair a device</DialogTitle>
              <DialogDescription>{session.locationName}{session.period ? ` · ${session.period}` : ""}</DialogDescription>
            </DialogHeader>
            <PairingPanel sessionId={session.id} code={code} minutes={minutes ?? undefined} session={live} timeZone={timeZone} onCode={setCode} onDone={onClose} />
          </>
        ) : (
          <form className="contents" onSubmit={(event) => { event.preventDefault(); if (dialog.kind === "pair" && canPair) pair.mutate(); else if (dialog.kind === "here" && ready) here.mutate(); }}>
            <DialogHeader>
              <DialogTitle>{dialog.kind === "pair" ? (pending ? "A new pairing code" : "Pair a device") : "Use this device"}</DialogTitle>
              <DialogDescription>
                {dialog.kind === "pair"
                  ? pending ? "The code already waiting stops working. Keep its PIN, or choose a new one." : "Choose the PIN for the paired iPad. It starts locked, so only you can open its interviewer controls."
                  : "This device becomes the kiosk for this session: it signs out of Byline on the server and shows only the poll."}
              </DialogDescription>
            </DialogHeader>
            {replaces ? (
              <Alert variant="destructive">
                <MonitorSmartphone />
                <AlertTitle>This session is running on another device</AlertTitle>
                <AlertDescription>{dialog.kind === "pair" ? "Pairing a new device stops that one as soon as the new one is paired." : "It stops as soon as this device takes over."} A survey in progress there ends as incomplete.</AlertDescription>
              </Alert>
            ) : null}
            <PinFields pin={pin} again={again} onPin={setPin} onAgain={setAgain} />
            {dialog.kind === "pair" ? <ExpiryField value={expiry} onChange={setExpiry} timeZone={timeZone} /> : null}
            {pair.isError || here.isError ? <FieldError>{((pair.error ?? here.error) as Error).message}</FieldError> : null}
            <DialogFooter>
              {dialog.kind === "pair" ? (
                <Button type="submit" variant={replaces ? "destructive" : "default"} disabled={!canPair || pair.isPending}>
                  {pair.isPending ? <Spinner data-icon="inline-start" /> : null}{replaces ? "Get a code to replace it" : "Get a pairing code"}
                </Button>
              ) : (
                <Button type="submit" variant={replaces ? "destructive" : "default"} disabled={!ready || here.isPending}>{here.isPending ? <Spinner data-icon="inline-start" /> : <Lock data-icon="inline-start" />}{replaces ? "Take over on this device" : "Lock this device"}</Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
