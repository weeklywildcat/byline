"use client";

import { ChoiceCards } from "@byline/newsroom-ui/components/choice-cards";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { analyticsKeys, disconnectGoogle, fetchConnection, fetchOptions, saveMeasurement, selectStream, verifyConnection, type ConnectionDto, type StreamOption, type VerifyDto } from "../analytics/api";
import { useNewsroomRoutes } from "../shell/account";

const STEPS = ["Google account", "Property", "Measurement", "Review"] as const;
const REASONS: Record<string, string> = {
  denied: "Google access was not granted, so nothing changed.",
  failed: "Google sign-in could not be completed. Try connecting again.",
  scope: "Google didn't grant read-only Analytics access. Connect again and allow it.",
  forbidden: "Only administrators can connect Google Analytics.",
  "not-configured": "Google Analytics isn't configured on this server yet (see the setup problems below)."
};

type Measurement = { mode: "external" | "byline"; consent: "ask" | "always" };

/**
 * Site → Analytics: the administrator's connection to Google Analytics and how the public site is
 * measured. Credentials save immediately (they are private); the measurement choice goes public only
 * through "Save & publish analytics setup".
 */
export function AnalyticsSettings() {
  const { api } = useNewsroomRoutes();
  const client = useQueryClient();
  const connection = useQuery({ queryKey: analyticsKeys.connection(), queryFn: () => fetchConnection(api) });
  const [wizard, setWizard] = useState<{ step: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const data = connection.data;

  // The OAuth round trip comes back to this tab with ?analytics=…; show the result once, then clean the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("analytics");
    if (!result) return;
    url.searchParams.delete("analytics");
    window.history.replaceState(null, "", url.pathname + url.search);
    if (result === "connected") { setWizard({ step: 1 }); void client.invalidateQueries({ queryKey: analyticsKeys.all }); } else setNotice(REASONS[result] ?? REASONS.failed!);
  }, [client]);

  if (connection.isPending) return <div className="grid gap-3" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (!data) return <InlineAlert title="Google Analytics settings didn't load" onAction={() => void connection.refetch()}>Try again in a moment.</InlineAlert>;

  const done = (next: ConnectionDto) => { client.setQueryData(analyticsKeys.connection(), next); void client.invalidateQueries({ queryKey: analyticsKeys.all }); };
  return (
    <div className="grid gap-4">
      {notice ? <Alert variant="destructive" role="alert"><CircleAlert aria-hidden="true" /><AlertTitle>Google Analytics</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
      {data.setupProblems.length ? <SetupProblems data={data} /> : null}
      {wizard && data.status !== "disconnected" ? <Wizard data={data} startStep={wizard.step} onChange={done} onClose={() => setWizard(null)} />
        : data.status === "connected" || data.status === "needs-reconnect" ? <Summary data={data} onChange={done} onEdit={(step) => setWizard({ step })} />
        : data.status === "pending-selection" ? <Summary data={data} onChange={done} onEdit={(step) => setWizard({ step })} pending />
        : <Disconnected data={data} />}
    </div>
  );
}

function SetupProblems({ data }: { data: ConnectionDto }) {
  return (
    <Alert role="note">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>This server isn't ready for Google Analytics</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">{data.setupProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        {data.redirectUri ? <p className="mt-2">Authorized redirect URI to add to the Google OAuth client: <code className="break-all">{data.redirectUri}</code></p> : null}
        <p className="mt-1">See docs/google-analytics.md.</p>
      </AlertDescription>
    </Alert>
  );
}

function ConnectLink({ label, variant = "default" }: { label: string; variant?: "default" | "outline" }) {
  const { api } = useNewsroomRoutes();
  // A full-page redirect to Google and back: not a shell navigation.
  return <a href={`${api}/byline/analytics/connect`} className={buttonVariants({ variant })}>{label}</a>;
}

function Disconnected({ data }: { data: ConnectionDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Analytics</CardTitle>
        <CardDescription>Connect a GA4 property to see audience and Story performance inside Byline. Byline can also install the Google tag on your public site.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1.5 text-sm text-muted-foreground">
          <li>Read-only access to Google Analytics. Byline can't change your property.</li>
          <li>No Google password or service-account file is stored.</li>
          <li>The connection is publication-wide: one property for the whole site.</li>
        </ul>
      </CardContent>
      <CardFooter>{data.setupProblems.length ? <Button disabled>Connect Google Analytics</Button> : <ConnectLink label="Connect Google Analytics" />}</CardFooter>
    </Card>
  );
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Never");

function Summary({ data, onChange, onEdit, pending = false }: { data: ConnectionDto; onChange: (next: ConnectionDto) => void; onEdit: (step: number) => void; pending?: boolean }) {
  const { api } = useNewsroomRoutes();
  const [check, setCheck] = useState<VerifyDto | null>(null);
  const [confirm, setConfirm] = useState(false);
  const verify = useMutation({ mutationFn: () => verifyConnection(api), onSuccess: (result) => { setCheck(result); void fetchConnection(api).then(onChange); } });
  const disconnect = useMutation({
    mutationFn: () => disconnectGoogle(api),
    onSuccess: (result) => {
      onChange(result.connection);
      toast(result.revoked ? "Disconnected from Google Analytics." : "Disconnected. Google access couldn't be revoked automatically; you can remove Byline in your Google account's security settings.");
      if (!result.publicationUpdated) toast.error("The public tag wasn't removed. Publish the Publication again, then reconnect and disconnect.");
    }
  });
  const reconnect = data.status === "needs-reconnect";
  const owner = data.trackingMode === "byline" ? "Byline installs the Google tag" : "Tag managed outside Byline";
  const privacy = data.trackingMode !== "byline" ? "Consent and tag behavior are managed outside Byline." : data.consentMode === "always" ? "Always collect analytics" : "Ask readers first";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">Google Analytics {reconnect ? <Badge variant="destructive">Needs reconnect</Badge> : pending ? <Badge variant="secondary">Choose a property</Badge> : <Badge variant="secondary">Connected</Badge>}</CardTitle>
        <CardDescription>{reconnect ? "Google access needs to be renewed. Reconnect the Google account that owns this property." : pending ? "Google is connected. Choose the property and web stream to report on." : check ? check.summary.title : "Google access and reporting are set up."}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {data.timeZoneWarning ? <Alert role="note"><TriangleAlert aria-hidden="true" /><AlertDescription>{data.timeZoneWarning}</AlertDescription></Alert> : null}
        {!data.publishedMatches && data.status === "connected" ? <Alert role="note"><TriangleAlert aria-hidden="true" /><AlertTitle>Saved, not published</AlertTitle><AlertDescription>The public site's measurement doesn't match this setup yet. Choose Change measurement, then Save & publish analytics setup.</AlertDescription></Alert> : null}
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Fact label="Google account" value={data.googleAccountEmail ?? "—"} />
          <Fact label="Property" value={data.property ? `${data.property.name} (${data.property.id})` : "Not chosen"} />
          <Fact label="Web stream" value={data.stream ? `${data.stream.name}${data.stream.defaultUri ? ` · ${data.stream.defaultUri}` : ""}` : "Not chosen"} />
          <Fact label="Measurement ID" value={data.measurementId ?? "—"} />
          <Fact label="Tracking owner" value={data.status === "connected" ? owner : "—"} />
          <Fact label="Privacy mode" value={data.status === "connected" ? privacy : "—"} />
          <Fact label="Last verified" value={when(data.lastVerifiedAt)} />
        </dl>
        {check ? <Checks result={check} /> : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {reconnect ? <ConnectLink label="Reconnect Google" /> : null}
        {!pending && !reconnect ? <Button type="button" onClick={() => verify.mutate()} disabled={verify.isPending}>{verify.isPending ? "Checking…" : "Check connection"}</Button> : null}
        {pending ? <Button type="button" onClick={() => onEdit(1)}>Choose property</Button> : null}
        {!reconnect && !pending ? <Button type="button" variant="outline" onClick={() => onEdit(1)}>Change property</Button> : null}
        {!reconnect && !pending ? <Button type="button" variant="outline" onClick={() => onEdit(2)}>Change measurement</Button> : null}
        {!reconnect ? <ConnectLink label="Reconnect Google" variant="outline" /> : null}
        <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>Disconnect</Button>
      </CardFooter>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Analytics?</AlertDialogTitle>
            <AlertDialogDescription>Byline will revoke its access and forget the property.{data.trackingMode === "byline" ? " The Google tag Byline installs will be removed from the public site at its next deployment." : ""} Reports stop until you connect again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep connected</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => disconnect.mutate()}>Disconnect</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>;

function Checks({ result }: { result: VerifyDto }) {
  const icon = { ok: <CircleCheck className="text-emerald-600" aria-hidden="true" />, warn: <TriangleAlert className="text-amber-600" aria-hidden="true" />, fail: <CircleAlert className="text-destructive" aria-hidden="true" />, skipped: <span className="size-4" aria-hidden="true" /> };
  return (
    <div className="grid gap-2 rounded-lg border p-3" role="status" aria-live="polite">
      <p className="text-sm font-medium">{result.summary.title}<span className="block font-normal text-muted-foreground">{result.summary.detail}</span></p>
      <ul className="grid gap-1.5 text-sm">{result.checks.map((check) => <li key={check.key} className="flex items-start gap-2 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">{icon[check.state]}<span><span className="font-medium">{check.label}.</span> {check.detail}</span></li>)}</ul>
    </div>
  );
}

function Wizard({ data, startStep, onChange, onClose }: { data: ConnectionDto; startStep: number; onChange: (next: ConnectionDto) => void; onClose: () => void }) {
  const { api } = useNewsroomRoutes();
  const [step, setStep] = useState(startStep);
  const [property, setProperty] = useState(data.property?.resource ?? "");
  const [stream, setStream] = useState(data.stream?.resource ?? "");
  const [measurement, setMeasurement] = useState<Measurement>({ mode: data.trackingMode, consent: data.consentMode === "always" ? "always" : "ask" });
  const options = useQuery({ queryKey: analyticsKeys.options(property), queryFn: () => fetchOptions(api, property || undefined), enabled: step === 1, staleTime: 60_000 });
  const problem = options.data && "problem" in options.data ? options.data.problem : null;
  const loaded = options.data && !("problem" in options.data) ? options.data : null;
  const streams = loaded?.streams ?? [];
  const chosenStream = streams.find((item) => item.stream === stream) ?? null;

  const select = useMutation({ mutationFn: () => selectStream(api, { property, stream }), onSuccess: (next) => { onChange(next); setStep(2); } });
  const publish = useMutation({
    mutationFn: () => saveMeasurement(api, { trackingMode: measurement.mode, consentMode: measurement.consent, publish: true }),
    onSuccess: (result) => { onChange(result.connection); toast(result.published?.changed ? "Analytics setup published. The public site updates at its next deployment." : "Analytics setup saved."); onClose(); }
  });
    useEffect(() => {
    if (!loaded?.property || loaded.property.property !== property) return;
    // Never choose silently between several streams: "Recommended" is only a badge. A lone stream is the only choice.
    if (!streams.some((item) => item.stream === stream)) setStream(streams.length === 1 ? streams[0]!.stream : "");
  }, [loaded, property, stream, streams]);

  const account = useMemo(() => loaded?.accounts.find((item) => item.properties.some((entry) => entry.property === property)), [loaded, property]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Google Analytics</CardTitle>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Setup steps">
          {STEPS.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={cn("flex items-center gap-1.5", index === step ? "font-medium" : "text-muted-foreground")}><span className={cn("grid size-5 place-items-center rounded-full border text-xs", index < step && "bg-primary text-primary-foreground")}>{index < step ? <Check className="size-3" aria-hidden="true" /> : index + 1}</span>{label}</li>)}
        </ol>
      </CardHeader>
      <CardContent className="grid gap-4">
        {step === 0 ? <p className="text-sm">Connected as <strong>{data.googleAccountEmail}</strong>. Byline has read-only access to Google Analytics.</p> : null}
        {step === 1 ? (
          <div className="grid gap-4">
            {options.isPending ? <Skeleton className="h-32 w-full" /> : null}
            {problem ? <InlineAlert title={problem.title}>{problem.detail}</InlineAlert> : null}
            {loaded && !loaded.accounts.length ? <InlineAlert title="This Google account has no Analytics properties">Reconnect with the Google account that owns your property.</InlineAlert> : null}
            {loaded?.accounts.map((item) => (
              <fieldset key={item.account} className="grid gap-2"><legend className="pb-1 text-sm font-medium">{item.displayName}</legend>
                <ChoiceCards label={`${item.displayName} properties`} value={item.properties.some((entry) => entry.property === property) ? property : ""} onChange={(value) => { setProperty(value); setStream(""); }} options={item.properties.map((entry) => ({ value: entry.property, title: entry.displayName, description: `Property ID ${entry.propertyId}${loaded.property?.property === entry.property ? ` · ${loaded.property.timeZone}` : ""}` }))} />
              </fieldset>
            ))}
            {property && loaded?.property?.property === property ? (
              <fieldset className="grid gap-2"><legend className="pb-1 text-sm font-medium">Web stream{account ? ` in ${account.displayName}` : ""}</legend>
                {streams.length ? <ChoiceCards label="Web streams" value={stream} onChange={setStream} options={streams.map((item: StreamOption) => ({ value: item.stream, title: <span className="flex flex-wrap items-center gap-2">{item.displayName}{item.recommended ? <Badge>Recommended</Badge> : null}</span>, description: `${item.hostname || item.defaultUri || "No address"} · ${item.measurementId}` }))} />
                  : <InlineAlert title="No web stream in this property">Create a web data stream in Google Analytics, then come back. Byline lists web streams only.</InlineAlert>}
              </fieldset>
            ) : null}
            {loaded?.timeZoneWarning ? <Alert role="note"><TriangleAlert aria-hidden="true" /><AlertDescription>{loaded.timeZoneWarning}</AlertDescription></Alert> : null}
            {select.error ? <InlineAlert title="That choice couldn't be saved">{(select.error as Error).message}</InlineAlert> : null}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="grid gap-4">
            <ChoiceCards label="Who installs the Google tag" value={measurement.mode} onChange={(mode) => setMeasurement({ ...measurement, mode })} options={[
              { value: "external", title: "Already installed", description: "Use this if the publication already has Google Analytics installed through Google Tag Manager, an existing Google tag or another system. Byline reads Analytics but does not change the public site's tracking." },
              { value: "byline", title: "Install with Byline", description: "Byline adds the Google tag to the generated public site and sends Story-aware pageviews." }
            ]} />
            {measurement.mode === "byline" ? (
              <fieldset className="grid gap-2"><legend className="pb-1 text-sm font-medium">Privacy</legend>
                <ChoiceCards label="Reader consent" value={measurement.consent} onChange={(consent) => setMeasurement({ ...measurement, consent })} options={[
                  { value: "ask", title: <span className="flex items-center gap-2">Ask readers first <Badge variant="secondary">Recommended</Badge></span>, description: "Do not load Google Analytics until the reader accepts analytics." },
                  { value: "always", title: "Always collect analytics", description: "Load publication analytics without a Byline consent prompt. Keep all advertising consent states denied." }
                ]} />
              </fieldset>
            ) : <p className="text-sm text-muted-foreground">Consent and tag behavior are managed outside Byline.</p>}
          </div>
        ) : null}
        {step === 3 ? (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label="Google account" value={data.googleAccountEmail ?? "—"} />
            <Fact label="Property" value={data.property ? `${data.property.name} (${data.property.id})` : "—"} />
            <Fact label="Web stream" value={data.stream ? `${data.stream.name}${data.stream.defaultUri ? ` · ${data.stream.defaultUri}` : ""}` : "—"} />
            <Fact label="Measurement ID" value={data.measurementId ?? "—"} />
            <Fact label="Who installs the tag" value={measurement.mode === "byline" ? "Byline" : "Managed outside Byline"} />
            <Fact label="Privacy behavior" value={measurement.mode === "byline" ? (measurement.consent === "ask" ? "Ask readers first" : "Always collect analytics") : "Managed outside Byline"} />
          </dl>
        ) : null}
        {publish.error ? <InlineAlert title="The setup wasn't published">{(publish.error as Error).message}</InlineAlert> : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {step > 0 ? <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>Back</Button> : null}
        {step === 0 ? <Button type="button" onClick={() => setStep(1)}>Continue</Button> : null}
        {step === 1 ? <Button type="button" disabled={!property || !chosenStream || select.isPending} onClick={() => select.mutate()}>{select.isPending ? "Saving…" : "Continue"}</Button> : null}
        {step === 2 ? <Button type="button" onClick={() => setStep(3)}>Review</Button> : null}
        {step === 3 ? <Button type="button" disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? "Publishing…" : "Save & publish analytics setup"}</Button> : null}
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      </CardFooter>
    </Card>
  );
}
