"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { ArrowRight, LogIn, MonitorSmartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { KIOSK_PATH } from "../../../polls/links";

/**
 * `/poll` (docs/wildcat-polls.md#setting-up-a-device): the neutral way into
 * polling on any device. A reporter can spend the six-digit code Poll Studio
 * gave them, or sign in to Byline and set this device up themselves.
 *
 * Pairing never signs the device in. The signed-in path returns to Poll Studio,
 * where "Start polling on this device" deliberately hands the account session
 * off for the same session-scoped kiosk credential before students see it.
 *
 * A pairing link carries the code after `#`, which browsers never send to a
 * server; it is read once, then removed from the address.
 */

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export function PairingApp({ api, signInHref }: { api: string; signInHref: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fromLink = digits(decodeURIComponent(window.location.hash.slice(1)));
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (fromLink.length === 6) setCode(fromLink);
    input.current?.focus();
    // A device already running a poll can go straight back to it.
    void fetch(`${api}/byline/polls/kiosk`, { credentials: "same-origin", cache: "no-store" }).then((response) => setRunning(response.ok), () => undefined);
  }, [api]);

  const pair = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${api}/byline/polls/pair`, {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message ?? "That code didn't work.");
      window.location.replace(json.kiosk ?? KIOSK_PATH);
    } catch (failure) {
      setError(failure instanceof TypeError ? "This device can't reach Byline. Check the connection and try again." : (failure as Error).message);
      setBusy(false);
      input.current?.select();
    }
  };

  return (
    <AdminRoot className="byline-polls-kiosk" toaster={false}>
      <main className="grid min-h-dvh place-items-center bg-background pt-(--byline-safe-top) pr-[max(1.25rem,var(--byline-safe-right))] pb-[max(1.25rem,var(--byline-safe-bottom))] pl-[max(1.25rem,var(--byline-safe-left))] text-foreground" data-polls-pair="">
        <div className="flex w-full max-w-md flex-col gap-6 py-10">
          <div className="flex flex-col gap-2">
            <MonitorSmartphone className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Wildcat Polls</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">Set up this device</h1>
            <p className="text-lg leading-relaxed text-muted-foreground">Use a pairing code from Poll Studio, or sign in to Byline to start polling on this device.</p>
          </div>

          <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void pair(); }}>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="poll-pairing-code">Pairing code</FieldLabel>
              <Input
                ref={input}
                id="poll-pairing-code"
                value={code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code}
                onChange={(event) => { setError(null); setCode(digits(event.target.value)); }}
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="000 000"
                aria-invalid={error ? true : undefined}
                aria-describedby="poll-pairing-help"
                className="h-16 px-4 text-center font-mono text-3xl tracking-[0.25em] tabular-nums md:text-3xl"
              />
              {error ? <FieldError>{error}</FieldError> : <FieldDescription id="poll-pairing-help">The interviewer gets it when they start fieldwork. It works once.</FieldDescription>}
            </Field>
            <Button type="submit" size="lg" className="h-14 text-lg" disabled={code.length !== 6 || busy}>
              {busy ? <Spinner data-icon="inline-start" /> : null}Set up with code{busy ? null : <ArrowRight data-icon="inline-end" />}
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <Separator className="flex-1" />
            <span>or</span>
            <Separator className="flex-1" />
          </div>

          <div className="flex flex-col gap-2">
            <Button nativeButton={false} variant="outline" size="lg" className="h-14 text-lg" render={<a href={signInHref} />}>
              <LogIn data-icon="inline-start" />Sign in to Byline
            </Button>
            <p className="text-center text-sm leading-relaxed text-muted-foreground">Sign in if you're the interviewer and want to choose the poll and start this device yourself. Byline signs out before the device is handed over.</p>
          </div>

          {running ? (
            <p className="text-center text-sm text-muted-foreground">
              This device is already running a poll. <a className="font-medium text-foreground underline underline-offset-4" href={KIOSK_PATH}>Go back to it</a>
            </p>
          ) : null}
        </div>
      </main>
    </AdminRoot>
  );
}
