"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getPollVotedCookieName } from "@/lib/voter-cookie";
import { SiteIcon } from "./SiteIcon";

type PollOption = {
  id: string;
  label: string;
  votes: number;
};

type ActivePoll = {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
};

type PollState = "loading" | "ready" | "results" | "empty" | "error";

const MIN_RESULTS_VOTES = 5;
const LOW_RESPONSE_MESSAGE = "Thanks for your response. We use this to improve our coverage.";

function hasVotedCookie(pollId: string) {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie.startsWith(`${getPollVotedCookieName(pollId)}=`));
}

export function PollWidget() {
  const [poll, setPoll] = useState<ActivePoll | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [state, setState] = useState<PollState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadPoll() {
      try {
        const response = await fetch("/api/polls/active", {
          headers: {
            Accept: "application/json"
          },
          cache: "no-store"
        });

        if (response.status === 404) {
          if (!ignore) {
            setState("empty");
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Poll unavailable");
        }

        const nextPoll = (await response.json()) as ActivePoll;

        if (ignore) {
          return;
        }

        setPoll(nextPoll);
        setSelectedOptionId(nextPoll.options[0]?.id ?? "");
        setState(hasVotedCookie(nextPoll.id) ? "results" : "ready");
      } catch {
        if (!ignore) {
          setState("error");
        }
      }
    }

    loadPoll();

    return () => {
      ignore = true;
    };
  }, []);

  const leadingOptionId = useMemo(() => {
    if (!poll) {
      return "";
    }

    return [...poll.options].sort((left, right) => right.votes - left.votes)[0]?.id ?? "";
  }, [poll]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!poll || !selectedOptionId) {
      return;
    }

    setMessage("");

    try {
      const response = await fetch("/api/polls/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          pollId: poll.id,
          optionId: selectedOptionId
        })
      });
      const payload = (await response.json()) as ActivePoll | { error?: string; poll?: ActivePoll };

      if ("poll" in payload && payload.poll) {
        setPoll(payload.poll);
      } else if (response.ok) {
        setPoll(payload as ActivePoll);
      }

      const nextPoll = "poll" in payload && payload.poll ? payload.poll : response.ok ? (payload as ActivePoll) : null;

      if (response.status === 409) {
        setMessage(nextPoll && nextPoll.totalVotes >= MIN_RESULTS_VOTES ? "You already voted. Here is where things stand." : "");
      } else if (!response.ok) {
        setMessage("We could not record that vote right now.");
      } else {
        setMessage(nextPoll && nextPoll.totalVotes >= MIN_RESULTS_VOTES ? "Vote counted." : "");
      }

      setState("results");
    } catch {
      setMessage("We could not record that vote right now.");
      setState("error");
    }
  }

  return (
    <section className="homepage-poll-card" aria-labelledby="homepage-poll-heading">
      <div className="homepage-poll-heading">
        <span>
          <SiteIcon name="ph:chart-bar-horizontal" width={17} height={17} />
        </span>
        <h2 id="homepage-poll-heading">Your Opinion</h2>
      </div>

      {state === "loading" ? (
        <div className="homepage-poll-loading" aria-label="Loading poll" />
      ) : null}

      {state === "empty" ? <p className="homepage-poll-note">No poll is open right now.</p> : null}

      {state === "error" && !poll ? <p className="homepage-poll-note">Poll results are unavailable right now.</p> : null}

      {poll ? (
        <>
          <p className="homepage-poll-question">{poll.question}</p>
          {state === "results" ? (
            poll.totalVotes >= MIN_RESULTS_VOTES ? (
              <div className="homepage-poll-results" aria-live="polite">
                {poll.options.map((option) => {
                  const percent = poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;

                  return (
                    <div className="homepage-poll-result" key={option.id}>
                      <div>
                        <span>{option.label}</span>
                        <strong>{percent}%</strong>
                      </div>
                      <span className="homepage-poll-bar" aria-hidden="true">
                        <span
                          className={option.id === leadingOptionId ? "homepage-poll-bar-fill homepage-poll-bar-fill-leading" : "homepage-poll-bar-fill"}
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="homepage-poll-note" aria-live="polite">{LOW_RESPONSE_MESSAGE}</p>
            )
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="homepage-poll-options">
                {poll.options.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name="homepage-poll"
                      value={option.id}
                      checked={selectedOptionId === option.id}
                      onChange={() => setSelectedOptionId(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <button type="submit">Vote</button>
            </form>
          )}
          {message ? <p className="homepage-poll-note" aria-live="polite">{message}</p> : null}
        </>
      ) : null}
    </section>
  );
}
