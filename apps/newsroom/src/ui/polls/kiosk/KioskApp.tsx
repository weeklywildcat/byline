"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { ChoiceCards } from "@byline/newsroom-ui/components/choice-cards";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { useScreenWakeLock } from "@byline/newsroom-ui/lib/wake-lock";
import { Cloud, CloudOff, Delete, Lock, MapPin, Pause, Play, ShieldCheck, Square, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Answers, ChoiceImages, SurveyDefinition } from "../../../polls/engine/types";
import { clearStoredUploads, encryptedStore, flushUploads, memoryStore, newKey, type PollUpload, type SendResult, type UploadStore } from "../outbox";
import { SurveyRunner, type SubmitOutcome } from "../runner/SurveyRunner";

/**
 * Kiosk mode (`/polls/kiosk`, docs/wildcat-polls.md#kiosk). The device holds
 * only a kiosk credential for one session; the server decides which mode it is
 * in (locked, interviewer, respondent), so a reload — or a curious student —
 * always lands where the server says. Interviewer controls need the PIN.
 */

const SAVED = { status: "saved" } as const;

type Counts = { started: number; declined: number; completed: number; abandoned: number };
type KioskState = {
  session: { id: string; status: "active" | "paused" | "ended"; locationId: number | null; locationName: string; period: string; method: string; startedAt: string };
  survey: { id: number; title: string; open: boolean };
  version: { id: number; number: number };
  definition: SurveyDefinition;
  images: ChoiceImages;
  counts: Counts;
  mode: "locked" | "interviewer" | "respondent";
  ticket: { id: string; submitted: boolean } | null;
  unlockedUntil: string | null;
  pinLockedUntil: string | null;
  outboxKey: string;
  locations: Array<{ id: number; name: string }>;
  now: string;
};

class KioskError extends Error {
  constructor(message: string, readonly status: number, readonly data: Record<string, unknown> = {}) { super(message); }
}

async function call<T>(api: string, path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${api}/byline/polls/kiosk${path}`, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new KioskError(json.message ?? "Something went wrong.", response.status, json.data ?? {});
    return json as T;
  } catch (error) {
    if (error instanceof KioskError) throw error;
    throw new KioskError("No connection.", 0);
  } finally {
    window.clearTimeout(timer);
  }
}

export function KioskApp({ api, pairHref }: { api: string; pairHref: string }) {
  const [state, setState] = useState<KioskState | null>(null);
  // Keep decoded images for the active version and warm the browser's immutable
  // HTTP cache before the interviewer hands the device to a respondent.
  const urls = JSON.stringify([...new Set(Object.values(state?.images ?? {}).flatMap((list) => Object.values(list).map(({ src }) => src)))]);
  useEffect(() => {
    const pending: string[] = JSON.parse(urls);
    if (!pending.length) return;
    const images: HTMLImageElement[] = [];
    let active = true;
    async function preload() {
      while (active && pending.length) {
        const image = new Image();
        image.src = pending.shift()!;
        await image.decode().then(() => images.push(image), () => undefined);
      }
    }
    void Promise.all(Array.from({ length: Math.min(6, pending.length) }, preload));
    return () => { active = false; images.length = 0; };
  }, [urls]);
  const [ended, setEnded] = useState<{ message: string; counts?: Counts } | null>(null);
  const [offline, setOffline] = useState(false);
  const [store, setStore] = useState<UploadStore | null>(null);
  const [pending, setPending] = useState<PollUpload[]>([]);
  const [rejected, setRejected] = useState(0);
  const [handBack, setHandBack] = useState<null | "finished" | "stopped">(null);
  const ticketFinished = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await call<KioskState>(api, "");
      setState(next);
      setOffline(false);
      return next;
    } catch (error) {
      const failure = error as KioskError;
      if (failure.status === 401) { setEnded({ message: failure.message }); await clearStoredUploads(); }
      else setOffline(failure.status === 0);
      return null;
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const up = () => { setOffline(false); void load(); };
    const down = () => setOffline(true);
    if (typeof navigator !== "undefined" && navigator.onLine === false) setOffline(true);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [load]);

  // The browser's Back button stays inside the kiosk.
  useEffect(() => {
    window.history.pushState({ kiosk: true }, "", window.location.href);
    const trap = () => window.history.pushState({ kiosk: true }, "", window.location.href);
    window.addEventListener("popstate", trap);
    return () => window.removeEventListener("popstate", trap);
  }, []);

  // The encrypted queue opens once the server has handed over this session's key.
  const sessionId = state?.session.id;
  const outboxKey = state?.outboxKey;
  useEffect(() => {
    if (!sessionId || !outboxKey) return;
    let cancelled = false;
    void encryptedStore(sessionId, outboxKey).then(async (opened) => {
      if (cancelled) return;
      setStore(opened);
      setPending(await opened.all());
    });
    return () => { cancelled = true; };
  }, [sessionId, outboxKey]);

  const send = useCallback(async (item: PollUpload): Promise<SendResult> => {
    try {
      await call(api, "/responses", { ticket: item.ticket, submissionId: item.submissionId, answers: item.answers, startedAt: item.startedAt, durationMs: item.durationMs });
      return { status: "saved" };
    } catch (error) {
      const failure = error as KioskError;
      if (failure.data?.discard === true) return { status: "rejected", error: failure.message };
      return { status: "retry", error: failure.message };
    }
  }, [api]);

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (!store || flushing.current) return;
    flushing.current = true;
    try {
      const { saved, rejected: refused } = await flushUploads(store, send);
      if (refused.length) setRejected((count) => count + refused.length);
      setPending(await store.all());
      if (saved.length || refused.length) void load();
    } finally {
      flushing.current = false;
    }
  }, [load, send, store]);

  useEffect(() => {
    if (!store) return;
    void flush();
    const timer = window.setInterval(() => void flush(), 5000);
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => { window.clearInterval(timer); window.removeEventListener("online", online); };
  }, [flush, store]);

  // Keep the screen on while the session runs; a sleeping device interrupts students.
  useScreenWakeLock(Boolean(state && !ended));

  const submit = useCallback(async (answers: Answers, meta: { startedAt: string; durationMs: number }): Promise<SubmitOutcome> => {
    const ticket = state?.ticket?.id;
    const queue = store ?? memoryStore();
    if (!ticket || !state) return { status: "failed", message: "This survey wasn't started properly. Hand the device back to the interviewer.", retry: false };
    const item: PollUpload = { submissionId: newKey(), sessionId: state.session.id, ticket, answers, startedAt: meta.startedAt, durationMs: meta.durationMs, createdAt: Date.now(), attempts: 0, retryAt: 0, error: null };
    await queue.put(item);
    ticketFinished.current = ticket;
    setPending(await queue.all());
    const result = await send(item);
    if (result.status === "saved") { await queue.remove(item.submissionId); setPending(await queue.all()); void load(); return { status: "saved" }; }
    if (result.status === "rejected") { await queue.remove(item.submissionId); setPending(await queue.all()); setRejected((count) => count + 1); return { status: "failed", message: "These answers couldn't be accepted. Please hand the device back to the interviewer.", retry: false }; }
    await queue.put({ ...item, attempts: 1, retryAt: Date.now() + 2000, error: result.error });
    setPending(await queue.all());
    return { status: "queued" };
  }, [load, send, state, store]);

  const unlock = async (pin: string) => {
    const ticket = state?.ticket?.id ?? null;
    const outcomeFor = ticket && (ticketFinished.current === ticket || state?.ticket?.submitted) ? "pending" : "abandon";
    const next = await call<KioskState>(api, "/unlock", { pin, ticketOutcome: outcomeFor });
    setHandBack(null);
    ticketFinished.current = null;
    setState(next);
  };

  const act = async (path: string, body: unknown = {}) => {
    try {
      setState(await call<KioskState>(api, path, body));
    } catch (error) {
      const failure = error as KioskError;
      if (failure.status === 423) await load();
      else if (failure.status === 401) setEnded({ message: failure.message });
      else throw failure;
    }
  };

  const end = async () => {
    const result = await call<{ ended: true; counts?: Counts }>(api, "/end", {});
    await clearStoredUploads();
    setEnded({ message: "This polling session has ended. Thank you.", counts: result.counts });
  };

  return (
    <AdminRoot className="byline-polls-kiosk" toaster={false}>
      {ended ? <Ended pairHref={pairHref} message={ended.message} counts={ended.counts} />
        : !state ? <Loading offline={offline} onRetry={() => void load()} />
        : state.mode === "respondent" && !handBack && (!state.ticket?.submitted || ticketFinished.current === state.ticket.id) ? (
          <SurveyRunner
            key={state.ticket?.id ?? "none"}
            definition={state.definition}
            images={state.images}
            mode="kiosk"
            onSubmit={submit}
            outcomeOverride={state.ticket?.submitted ? SAVED : null}
            onStop={() => setHandBack("stopped")}
            headerAction={<Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label="Interviewer" onClick={() => setHandBack("stopped")}><Lock /></Button>}
            doneAction={<div className="pt-2"><Button type="button" variant="outline" size="lg" className="h-12 px-5 text-base" onClick={() => setHandBack("finished")}><Lock data-icon="inline-start" />Return to interviewer</Button></div>}
          />
        ) : state.mode === "interviewer" ? (
          <InterviewerPanel state={state} pending={pending.length} durable={store?.durable ?? false} online={!offline} rejected={rejected} onAct={act} onEnd={end} onLock={() => void act("/lock")} />
        ) : (
          <PinScreen
            state={state}
            reason={handBack ?? (state.mode === "respondent" ? "finished" : "locked")}
            surveyRunning={state.mode === "respondent" && !state.ticket?.submitted && ticketFinished.current !== state.ticket?.id}
            onUnlock={unlock}
            onCancel={handBack ? () => setHandBack(null) : undefined}
          />
        )}
    </AdminRoot>
  );
}

/* ------------------------------------------------------------------ screens */

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-dvh bg-background pt-(--byline-safe-top) pr-[max(1.25rem,var(--byline-safe-right))] pb-[max(1.25rem,var(--byline-safe-bottom))] pl-[max(1.25rem,var(--byline-safe-left))] text-foreground", className)}>
      {children}
    </div>
  );
}

function Loading({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  return (
    <Shell className="grid place-items-center">
      {offline ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CloudOff /></EmptyMedia>
            <EmptyTitle>This device can't reach Byline</EmptyTitle>
            <EmptyDescription>Check the Wi-Fi, then try again.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button type="button" size="lg" className="h-12 px-5 text-base" onClick={onRetry}>Try again</Button></EmptyContent>
        </Empty>
      ) : <Spinner className="size-6" />}
    </Shell>
  );
}

function Ended({ pairHref, message, counts }: { pairHref: string; message: string; counts?: Counts }) {
  return (
    <Shell className="grid place-items-center">
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Session ended</h1>
        <p className="text-lg leading-relaxed">{message}</p>
        {counts ? <p className="text-muted-foreground tabular-nums">{counts.completed} completed · {counts.declined} declined · {counts.abandoned} incomplete</p> : null}
        <div className="pt-2"><Button nativeButton={false} size="lg" className="h-14 px-6 text-lg" render={<a href={pairHref} />}>Set up this device with a new code</Button></div>
        <p className="text-sm text-muted-foreground">Start a session in Poll Studio on your own phone or laptop to get a code.</p>
      </div>
    </Shell>
  );
}

function InterviewerPanel({ state, pending, durable, online, rejected, onAct, onEnd, onLock }: { state: KioskState; pending: number; durable: boolean; online: boolean; rejected: number; onAct: (path: string, body?: unknown) => Promise<void>; onEnd: () => Promise<void>; onLock: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [ending, setEnding] = useState(false);
  const paused = state.session.status === "paused";
  const { counts } = state;
  const run = async (key: string, task: () => Promise<void>, done?: string) => {
    setBusy(key);
    setError(null);
    try {
      await task();
      if (done) { setNotice(done); window.setTimeout(() => setNotice(null), 2500); }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  };
  // Each tap carries its own key, so a retried request can never count twice.
  const declineKey = useRef(newKey());
  const beginKey = useRef(newKey());
  const started = new Date(state.session.startedAt);
  const healthy = online && pending === 0 && rejected === 0;
  return (
    <Shell>
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-3xl flex-col gap-6 py-6" data-polls-interviewer="">
        <header className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Interviewer</p>
            <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight text-balance">{state.survey.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[state.session.locationName, state.session.period || null, `since ${started.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, `version ${state.version.number}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button type="button" variant="outline" size="lg" className="h-12 px-5" onClick={onLock}><Lock data-icon="inline-start" />Lock</Button>
        </header>

        <section className="rounded-xl border bg-muted/40 px-5 py-4" aria-labelledby="sampling-rule" data-polls-sampling="">
          <h2 id="sampling-rule" className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Users className="size-4" aria-hidden="true" />Who to approach</h2>
          <p className="mt-1.5 text-xl leading-snug font-medium text-balance">{state.session.method || "No sampling rule was set for this session. Approach students the same way each time, and note how in the methodology."}</p>
        </section>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 sm:grid-cols-4" aria-label="This session so far">
          <Stat label="Completed" value={counts.completed} />
          <Stat label="Declined" value={counts.declined} />
          <Stat label="Incomplete" value={counts.abandoned} />
          <Stat label="Waiting to upload" value={pending} attention={pending > 0} />
        </dl>

        {!online ? (
          <Alert variant="destructive" data-polls-offline="">
            <CloudOff />
            <AlertTitle>No connection</AlertTitle>
            <AlertDescription>{durable ? "You can keep polling: finished surveys are encrypted on this device and upload when it reconnects." : "This browser can't keep answers safely offline. Reconnect before the next survey."}</AlertDescription>
          </Alert>
        ) : pending > 0 ? (
          <Alert>
            <Cloud />
            <AlertTitle>{pending} {pending === 1 ? "survey is" : "surveys are"} uploading</AlertTitle>
            <AlertDescription>{durable ? "Encrypted on this device until Byline confirms it has them." : "Keep the device connected until this reaches 0."}</AlertDescription>
          </Alert>
        ) : null}
        {rejected ? <p className="text-sm font-medium text-destructive" role="alert">{rejected} response{rejected === 1 ? " was" : "s were"} refused by the server and not saved.</p> : null}

        {paused ? (
          <Alert>
            <Pause />
            <AlertTitle>Session paused</AlertTitle>
            <AlertDescription>Nothing can be recorded until you resume.</AlertDescription>
            <AlertAction><Button type="button" size="sm" disabled={busy !== null} onClick={() => void run("resume", () => onAct("/resume"))}><Play data-icon="inline-start" />Resume</Button></AlertAction>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            size="lg"
            className="h-24 text-xl"
            disabled={paused || busy !== null || !state.survey.open}
            onClick={() => void run("begin", async () => { await onAct("/begin", { eventKey: beginKey.current }); beginKey.current = newKey(); })}
          >
            {busy === "begin" ? <Spinner data-icon="inline-start" /> : null}Student agreed — begin survey
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-20 text-lg"
            disabled={paused || busy !== null}
            onClick={() => void run("decline", async () => { await onAct("/decline", { eventKey: declineKey.current }); declineKey.current = newKey(); }, "Decline recorded.")}
          >
            Student declined
          </Button>
          <p className="min-h-5 text-center text-sm text-muted-foreground" role="status">{notice ?? (state.survey.open ? "A decline records nothing about the student." : "This poll has been closed in Poll Studio.")}</p>
          {error ? <p className="text-center text-sm font-medium text-destructive" role="alert">{error}</p> : null}
        </div>

        <div className="mt-auto flex flex-col gap-4">
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            {!paused ? <Button type="button" variant="outline" size="lg" className="h-11" disabled={busy !== null} onClick={() => void run("pause", () => onAct("/pause"))}><Pause data-icon="inline-start" />Pause</Button> : null}
            <Button type="button" variant="outline" size="lg" className="h-11" disabled={busy !== null} onClick={() => setMoving(true)}><MapPin data-icon="inline-start" />Change location</Button>
            <Button type="button" variant="outline" size="lg" className="h-11" disabled={busy !== null} onClick={() => setEnding(true)}><Square data-icon="inline-start" />End session</Button>
            <span className="flex-1" />
            {healthy ? (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground" data-polls-durability="">
                {durable ? <ShieldCheck className="size-4" aria-hidden="true" /> : <Cloud className="size-4" aria-hidden="true" />}
                {durable ? "Online · answers kept safely" : "Online only"}
              </span>
            ) : null}
          </div>
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer py-2 font-medium">Before you hand the device over</summary>
            <p className="leading-relaxed">Lock it first. On an iPad, you can also turn on Guided Access (Settings → Accessibility → Guided Access, then triple-click the side or home button) to keep it on this page. {durable ? "Finished surveys waiting to upload are encrypted on this device and deleted once Byline has them." : "This browser can't store answers securely, so keep the iPad connected until “Waiting to upload” is 0."}</p>
          </details>
        </div>
      </div>

      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Change location</DialogTitle><DialogDescription>Responses from now on are counted at the new place.</DialogDescription></DialogHeader>
          {state.locations.length ? (
            <ChoiceCards label="Location" value={state.session.locationId ? String(state.session.locationId) : ""} disabled={busy !== null}
              onChange={(value) => { const location = state.locations.find((entry) => String(entry.id) === value); if (location) void run("move", async () => { await onAct("/location", { locationId: location.id }); setMoving(false); }, `Now at ${location.name}.`); }}
              options={state.locations.map((location) => ({ value: String(location.id), title: location.name }))} />
          ) : <p className="text-sm text-muted-foreground">An editor adds locations in Poll Studio.</p>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={ending} onOpenChange={setEnding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? `${pending} response${pending === 1 ? " is" : "s are"} still waiting to upload and will be lost if you end now. Connect to Wi-Fi and wait for it to reach 0.` : "This device leaves the poll. To poll again, pair it with a new code from Poll Studio."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep polling</AlertDialogCancel>
            <AlertDialogAction variant={pending ? "destructive" : "default"} onClick={() => void run("end", onEnd)}>{pending ? "End and discard" : "End session"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}

function Stat({ label, value, attention }: { label: string; value: number; attention?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-3xl font-semibold tabular-nums", attention && "text-warning")}>{value}</dd>
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function PinScreen({ state, reason, surveyRunning, onUnlock, onCancel }: { state: KioskState; reason: "locked" | "finished" | "stopped"; surveyRunning: boolean; onUnlock: (pin: string) => Promise<void>; onCancel?: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(state.pinLockedUntil);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lockedUntil) return;
    const timer = window.setInterval(() => { if (Date.parse(lockedUntil) <= Date.now()) setLockedUntil(null); tick((n) => n + 1); }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);
  const waiting = lockedUntil ? Math.max(0, Math.ceil((Date.parse(lockedUntil) - Date.now()) / 1000)) : 0;
  const press = (digit: string) => { setError(null); setPin((value) => (value.length < 8 ? value + digit : value)); };
  const submit = async () => {
    if (pin.length < 4 || checking || waiting) return;
    setChecking(true);
    try {
      await onUnlock(pin);
    } catch (failure) {
      const problem = failure as KioskError;
      setError(problem.message);
      if (typeof problem.data?.lockedUntil === "string") setLockedUntil(problem.data.lockedUntil);
      setPin("");
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") setPin((value) => value.slice(0, -1));
      else if (event.key === "Enter") void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const title = reason === "finished" ? "Please hand the device back." : reason === "stopped" ? "Hand the device back to the interviewer." : state.survey.title;
  return (
    <Shell className="grid place-items-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 py-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          <p className="text-muted-foreground">{reason === "locked" ? `${[state.session.locationName, state.session.period || null].filter(Boolean).join(" · ")}. Interviewer: enter your PIN to open the controls.` : "Interviewer: enter your PIN."}</p>
          {surveyRunning ? <p className="text-sm font-medium text-destructive">Unlocking ends the current survey as incomplete. Its answers are not saved.</p> : null}
        </div>
        <div className="flex h-6 items-center gap-3" aria-label={`Interviewer PIN: ${pin.length} digits entered`} role="status">
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={cn("size-3 rounded-full border border-foreground", i < pin.length && "bg-foreground")} />)}
        </div>
        <p className="min-h-5 text-center text-sm font-medium text-destructive" role="alert">{waiting ? `Too many tries. Wait ${waiting} s.` : error}</p>
        <div className="grid w-full grid-cols-3 gap-2.5">
          {KEYS.map((digit) => <PinKey key={digit} label={digit} onPress={() => press(digit)} disabled={checking || waiting > 0} />)}
          <PinKey label="Delete" icon={<Delete className="size-5" />} onPress={() => setPin((value) => value.slice(0, -1))} disabled={checking || !pin} />
          <PinKey label="0" onPress={() => press("0")} disabled={checking || waiting > 0} />
          <Button type="button" className="h-16 text-lg" disabled={pin.length < 4 || checking || waiting > 0} onClick={() => void submit()}>
            {checking ? <Spinner /> : "Unlock"}
          </Button>
        </div>
        {onCancel ? <Button type="button" variant="ghost" size="lg" onClick={onCancel}>Back to the poll</Button> : null}
      </div>
    </Shell>
  );
}

function PinKey({ label, icon, onPress, disabled }: { label: string; icon?: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  // The kit's outline Button, sized for a thumb: the keypad is the one place the kiosk asks for a precise tap.
  return (
    <Button type="button" variant="outline" aria-label={label} onClick={onPress} disabled={disabled} className="h-16 text-2xl font-normal tabular-nums">
      {icon ?? label}
    </Button>
  );
}
