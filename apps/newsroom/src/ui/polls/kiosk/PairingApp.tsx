"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { ArrowRight, MonitorSmartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { KIOSK_PATH } from "../../../polls/links";

/**
 * `/poll` (docs/wildcat-polls.md#pairing-a-device): the iPad's way in. The
 * interviewer types the six-digit code Poll Studio gave them; the server
 * spends it and sets this device's kiosk credential, and the kiosk opens
 * locked. Nobody signs in to Byline here, and nothing about the newsroom is
 * shown: a wrong code says only that it didn't work.
 *
 * A pairing link carries the code after `#`, which browsers never send to a
 * server; it is read once, then removed from the address.
 */

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export function PairingApp({ api }: { api: string }) {
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
      setError(failure instanceof TypeError ? "This iPad can't reach Byline. Check the Wi-Fi and try again." : (failure as Error).message);
      setBusy(false);
      input.current?.select();
    }
  };

  return (
    <AdminRoot className="byline-polls-kiosk" toaster={false}>
      <main className="grid min-h-dvh place-items-center bg-background pt-(--byline-safe-top) pr-[max(1.25rem,var(--byline-safe-right))] pb-[max(1.25rem,var(--byline-safe-bottom))] pl-[max(1.25rem,var(--byline-safe-left))] text-foreground" data-polls-pair="">
        <form className="flex w-full max-w-md flex-col gap-6 py-10" onSubmit={(event) => { event.preventDefault(); void pair(); }}>
          <div className="flex flex-col gap-2">
            <MonitorSmartphone className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Wildcat Polls</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">Set up this iPad for a poll</h1>
            <p className="text-lg leading-relaxed text-muted-foreground">Enter the six-digit code from Poll Studio. Nobody signs in on this iPad.</p>
          </div>
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
            {busy ? <Spinner data-icon="inline-start" /> : null}Pair this iPad{busy ? null : <ArrowRight data-icon="inline-end" />}
          </Button>
          {running ? (
            <p className="text-center text-sm text-muted-foreground">
              This iPad is already running a poll. <a className="font-medium text-foreground underline underline-offset-4" href={KIOSK_PATH}>Go back to it</a>
            </p>
          ) : null}
        </form>
      </main>
    </AdminRoot>
  );
}
