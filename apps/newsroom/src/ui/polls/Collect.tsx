"use client";

import { DateTimeField } from "@byline/newsroom-ui/components/date-fields";
import { FormField } from "@byline/newsroom-ui/components/form-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent } from "@byline/newsroom-ui/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Globe, Plus, QrCode as QrIcon, Radio, RefreshCw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { instantToLocal, localToInstant } from "../../domain/dates";
import { publicPollPath } from "../../polls/links";
import { useNewsroomRoutes } from "../shell/account";
import { formatWhen, pollKeys, updateSurvey, type SurveyDetail } from "./api";
import { FieldworkSetup, SessionRows } from "./Fieldwork";
import { SwitchField } from "./fields";
import { QrCode } from "./QrCode";

/**
 * Collect (docs/wildcat-polls.md#collect): the two ways a poll gathers
 * answers. In person, an interviewer runs a session on an iPad paired with a
 * code; by web link, anyone with the link answers on their own device. Both
 * use the same respondent screen and the same server checks.
 */
export function Collect({ data, startFieldwork }: { data: SurveyDetail; startFieldwork: boolean }) {
  return (
    <div className="flex flex-col gap-10" data-polls-collect="">
      <InPerson data={data} startFieldwork={startFieldwork} />
      <WebLink data={data} />
    </div>
  );
}

function SectionHeader({ id, icon: Icon, title, description, action }: { id: string; icon: typeof Radio; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function useSave(data: SurveyDetail) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => updateSurvey(api, data.survey.id, body),
    onSuccess: (next) => { queries.setQueryData(pollKeys.survey(data.survey.id), next); void queries.invalidateQueries({ queryKey: pollKeys.overview() }); }
  });
}

function InPerson({ data, startFieldwork }: { data: SurveyDetail; startFieldwork: boolean }) {
  const survey = data.survey;
  const save = useSave(data);
  const [setup, setSetup] = useState(startFieldwork && survey.canInterview);
  const running = data.sessions.filter((session) => session.status !== "ended");
  const recent = data.sessions.filter((session) => session.status === "ended").slice(0, 5);
  const totals = data.sessions.reduce((sum, session) => ({ completed: sum.completed + session.counts.completed, declined: sum.declined + session.counts.declined, abandoned: sum.abandoned + session.counts.abandoned }), { completed: 0, declined: 0, abandoned: 0 });
  return (
    <section className="flex flex-col gap-4" aria-labelledby="collect-in-person">
      <SectionHeader id="collect-in-person" icon={Radio} title="In person" description="An interviewer approaches students and hands them an iPad paired to a session with a six-digit code. The iPad never signs in to Byline; it records counts of approaches, never who."
        action={survey.canInterview && !setup ? <Button type="button" onClick={() => setSetup(true)}><Plus data-icon="inline-start" />Start fieldwork</Button> : undefined} />
      {survey.canManage ? (
        <Card size="sm"><CardContent><SwitchField label="Collect in person" description="Interviewers can start sessions on paired iPads." checked={survey.kioskEnabled} disabled={save.isPending} onChange={(checked) => save.mutate({ kioskEnabled: checked })} /></CardContent></Card>
      ) : null}
      {save.isError ? <InlineAlert title="Not saved">{(save.error as Error).message}</InlineAlert> : null}

      {setup && survey.canInterview && data.current ? (
        <Card><CardContent>
          <FieldworkSetup polls={[{ id: survey.id, title: survey.title, versionNumber: survey.versionNumber }]} preselect={survey.id} locations={data.locations} periods={data.periods} sessions={data.sessions} timeZone={data.timeZone} onCancel={() => setSetup(false)} />
        </CardContent></Card>
      ) : null}

      {running.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Running now</h3>
          <SessionRows sessions={running} meId={data.me.id} manage={survey.canManage} timeZone={data.timeZone} />
        </div>
      ) : !setup ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Radio /></EmptyMedia>
            <EmptyTitle>No fieldwork running</EmptyTitle>
            <EmptyDescription>
              {!data.current ? "Publish the poll to start fieldwork." : !survey.kioskEnabled ? "In-person collection is off for this poll." : survey.status !== "open" ? "Open the poll in Settings to start fieldwork." : survey.canInterview ? "Start a session, then pair the iPad you'll hand to students." : "An editor can add you as an interviewer."}
            </EmptyDescription>
          </EmptyHeader>
          {survey.canInterview ? <EmptyContent><Button type="button" onClick={() => setSetup(true)}>Start fieldwork</Button></EmptyContent> : null}
        </Empty>
      ) : null}

      {data.sessions.length ? (
        <p className="text-sm text-muted-foreground tabular-nums">All sessions: <span className="font-medium text-foreground">{totals.completed}</span> completed · {totals.declined} declined · {totals.abandoned} incomplete</p>
      ) : null}
      {recent.length ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Recent sessions ({recent.length})</summary>
          <div className="mt-2"><SessionRows sessions={recent} meId={data.me.id} manage={survey.canManage} timeZone={data.timeZone} /></div>
        </details>
      ) : null}
    </section>
  );
}

type LinkState = { label: string; tone: "done" | "attention" | "neutral" };

function linkState(data: SurveyDetail, now: number): LinkState {
  const link = data.survey.publicLinkSettings;
  if (!link?.enabled) return { label: "Off", tone: "neutral" };
  if (data.survey.status !== "open") return { label: "Not accepting answers: the poll isn't open", tone: "attention" };
  if (link.opensAt && Date.parse(link.opensAt) > now) return { label: `Opens ${formatWhen(link.opensAt, data.timeZone)}`, tone: "attention" };
  if (link.closesAt && Date.parse(link.closesAt) <= now) return { label: "Closed", tone: "neutral" };
  return { label: "Accepting answers", tone: "done" };
}

function WebLink({ data }: { data: SurveyDetail }) {
  const survey = data.survey;
  const link = survey.publicLinkSettings;
  const save = useSave(data);
  const id = useId();
  const [accessCode, setAccessCode] = useState("");
  const [regenerate, setRegenerate] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = link?.key && typeof window !== "undefined" ? `${window.location.origin}${publicPollPath(link.key)}` : "";
  const state = linkState(data, Date.now());
  const copy = () => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }); };
  return (
    <section className="flex flex-col gap-4" aria-labelledby="collect-web">
      <SectionHeader id="collect-web" icon={Globe} title="Web link" description="Anyone with the link answers on their own phone or computer, without signing in. Answers are anonymous: no names, IP addresses or device identifiers are kept, and each visit can submit once." />
      {!survey.canManage ? (
        <p className="text-sm text-muted-foreground">{survey.publicLink ? "This poll has a web link. An editor can share it." : "This poll has no web link."}</p>
      ) : (
        <Card>
          <CardContent>
            <FieldGroup>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SwitchField label="Web link" description="Turning it off stops new answers at once. The link comes back unchanged if you turn it on again." checked={link?.enabled ?? false} disabled={save.isPending} onChange={(checked) => save.mutate({ publicLink: { enabled: checked } })} />
              </div>
              {link?.enabled ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge tone={state.tone} data-polls-link-state="">{state.label}</StatusBadge>
                    {data.responsesByMode ? <span className="text-muted-foreground tabular-nums">{data.responsesByMode.public.toLocaleString("en-US")} {data.responsesByMode.public === 1 ? "response" : "responses"} by web link</span> : null}
                  </div>
                  <Field>
                    <FieldLabel htmlFor={`${id}-url`}>Link</FieldLabel>
                    <InputGroup>
                      <InputGroupInput id={`${id}-url`} readOnly value={url} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} data-polls-public-url="" />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton size="xs" onClick={copy}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? "Copied" : "Copy"}</InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <div className="flex flex-wrap gap-2">
                      <Button nativeButton={false} variant="outline" size="sm" render={<a href={url} target="_blank" rel="noopener noreferrer" />}><ExternalLink data-icon="inline-start" />Open</Button>
                      <Popover>
                        <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}><QrIcon data-icon="inline-start" />QR code</PopoverTrigger>
                        <PopoverContent className="flex w-auto flex-col items-center gap-2">
                          <QrCode value={url} label="QR code for the poll's web link" className="w-56" />
                          <span className="text-xs text-muted-foreground">Print it, or put it on a slide.</span>
                        </PopoverContent>
                      </Popover>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setRegenerate(true)}><RefreshCw data-icon="inline-start" />New link…</Button>
                    </div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <WindowField label="Opens" hint="Before this, the link says when it opens." value={link.opensAt} timeZone={data.timeZone} onCommit={(value) => save.mutate({ publicLink: { opensAt: value } })} />
                    <WindowField label="Closes" hint="After this, the link thanks people and takes no answers." value={link.closesAt} timeZone={data.timeZone} onCommit={(value) => save.mutate({ publicLink: { closesAt: value } })} />
                  </div>
                  <FormField id={`${id}-code`} label={link.hasAccessCode ? "Access code (set)" : "Access code"} optional hint="Only people you give it to can start. Case and spaces don't matter. Byline keeps only a hash, so it can't show it again.">
                    <div className="flex flex-wrap gap-2">
                      <Input id={`${id}-code`} className="w-auto min-w-0 flex-1" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder={link.hasAccessCode ? "Type a new code to replace it" : undefined} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false} />
                      <Button type="button" variant="outline" disabled={!accessCode.trim() || save.isPending} onClick={() => save.mutate({ publicLink: { accessCode } }, { onSuccess: () => setAccessCode("") })}>Set</Button>
                      {link.hasAccessCode ? <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ publicLink: { accessCode: "" } })}>Remove</Button> : null}
                    </div>
                  </FormField>
                  <FieldDescription>At most {link.hourlyLimit.toLocaleString("en-US")} starts an hour, so a link passed around widely can't flood the poll. Each start can submit once.</FieldDescription>
                </>
              ) : null}
            </FieldGroup>
          </CardContent>
        </Card>
      )}
      {save.isError ? <InlineAlert title="Not saved">{(save.error as Error).message}</InlineAlert> : null}
      {link?.enabled && survey.status !== "open" ? (
        <Alert><Globe /><AlertTitle>The link isn't taking answers</AlertTitle><AlertDescription>{data.current ? "Open the poll in Settings." : "Publish the poll first."}</AlertDescription></Alert>
      ) : null}

      <AlertDialog open={regenerate} onOpenChange={setRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a new link?</AlertDialogTitle>
            <AlertDialogDescription>The current link stops working at once, including anywhere it's been shared or printed. Responses already collected stay.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep this link</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { save.mutate({ publicLink: { regenerateKey: true } }); setRegenerate(false); }}>Make a new link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** A web-link window boundary, read and written in the newsroom's timezone. */
function WindowField({ label, hint, value, timeZone, onCommit }: { label: string; hint: string; value: string | null; timeZone: string; onCommit: (value: string | null) => void }) {
  const wall = value ? instantToLocal(value, timeZone) : "";
  const [draft, setDraft] = useState(wall);
  useEffect(() => setDraft(wall), [wall]);
  return <DateTimeField label={label} hint={hint} value={draft} timeZone={timeZone} optional onChange={setDraft} onClose={(next) => { if (next !== wall) onCommit(next ? localToInstant(next, timeZone) : null); }} />;
}
