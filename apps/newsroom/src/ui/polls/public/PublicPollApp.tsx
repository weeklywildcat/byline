"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useEffect, useRef, useState } from "react";
import type { Answers, SurveyDefinition } from "../../../polls/engine/types";
import { newKey } from "../outbox";
import { SurveyRunner, type SubmitOutcome } from "../runner/SurveyRunner";

/**
 * A public poll link (docs/wildcat-polls.md#public-links). The same renderer
 * and the same server validation as the kiosk; no account, no session. It is
 * online only: answers are never stored on the respondent's device, and a
 * failed send says so and offers to try again.
 */

type Poll = { title: string; definition: SurveyDefinition; needsCode: boolean; closesAt: string | null };

async function call<T>(api: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${api}/byline/polls/public/${path}`, {
      method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "omit",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw Object.assign(new Error("No connection. Check your internet and try again."), { status: 0 });
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.message ?? "Something went wrong."), { status: response.status });
  return json as T;
}

const doneKey = (key: string) => `byline-poll-done:${key}`;
const remembered = (key: string) => { try { return window.localStorage.getItem(doneKey(key)) === "1"; } catch { return false; } };
const remember = (key: string) => { try { window.localStorage.setItem(doneKey(key), "1"); } catch { /* private browsing: nothing to remember */ } };

export function PublicPollApp({ api, pollKey }: { api: string; pollKey: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [error, setError] = useState<string | null>(pollKey ? null : "This poll isn't available.");
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [already, setAlready] = useState(false);
  const submission = useRef(newKey());
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pollKey) return;
    setAlready(remembered(pollKey));
    call<Poll>(api, pollKey).then(setPoll, (failure: Error) => setError(failure.message));
  }, [api, pollKey]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      setToken((await call<{ startToken: string }>(api, `${pollKey}/start`, { code })).startToken);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setStarting(false);
    }
  };
  useEffect(() => { if (poll && !poll.needsCode && !token && !already) void start(); }, [poll, already]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (answers: Answers): Promise<SubmitOutcome> => {
    try {
      await call(api, `${pollKey}/responses`, { startToken: token, submissionId: submission.current, answers, website: honeypot.current?.value ?? "" });
      remember(pollKey);
      return { status: "saved" };
    } catch (failure) {
      const status = (failure as { status?: number }).status ?? 0;
      return { status: "failed", message: (failure as Error).message, retry: status === 0 || status >= 500 || status === 429 };
    }
  };

  return (
    <AdminRoot toaster={false}>
      {/* A field people never see; automated form fillers do. */}
      <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
      {poll && token ? (
        <SurveyRunner definition={poll.definition} mode="public" onSubmit={(answers) => submit(answers)} />
      ) : (
        <div className="byline-polls grid min-h-dvh place-items-center bg-(--poll-paper) px-6 text-(--poll-ink)">
          <div className="flex w-full max-w-lg flex-col gap-6 py-12">
            {error && !poll ? (
              <><h1 className="font-(family-name:--poll-serif) text-4xl font-medium">Wildcat Polls</h1><p className="text-xl leading-relaxed">{error}</p></>
            ) : !poll ? <Spinner className="size-6" /> : already ? (
              <>
                <h1 className="font-(family-name:--poll-serif) text-4xl font-medium text-balance">{poll.title}</h1>
                <p className="text-xl leading-relaxed">You've already answered this poll on this device. Thank you.</p>
              </>
            ) : poll.needsCode ? (
              <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void start(); }}>
                <h1 className="font-(family-name:--poll-serif) text-4xl font-medium text-balance">{poll.title}</h1>
                <label className="flex flex-col gap-2 text-lg">
                  Access code
                  <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="none" className="h-14 rounded-xl border-2 border-(--poll-rule) bg-white px-4 text-xl outline-none focus:border-(--poll-ink)" />
                </label>
                {error ? <p role="alert" className="font-medium text-(--poll-accent)">{error}</p> : null}
                <Button type="submit" className="h-14 rounded-full text-base" disabled={starting || !code.trim()}>{starting ? <Spinner /> : null}Continue</Button>
              </form>
            ) : error ? (
              <><p className="text-xl">{error}</p><Button type="button" className="h-14 rounded-full" onClick={() => void start()}>Try again</Button></>
            ) : <Spinner className="size-6" />}
          </div>
        </div>
      )}
    </AdminRoot>
  );
}
