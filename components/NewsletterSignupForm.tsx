"use client";

import Script from "next/script";
import { FormEvent, useEffect, useId, useRef, useState } from "react";

type NewsletterSignupFormProps = {
  sourceTitle: string;
  sourceUrl: string;
  turnstileSiteKey?: string;
};

type SignupState = "idle" | "submitting" | "success" | "error";
type PendingSignup = {
  company: string;
  email: string;
};
type TurnstileApi = {
  execute: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      "error-callback": () => void;
      "expired-callback": () => void;
      action: string;
      callback: (token: string) => void;
      sitekey: string;
      size: "invisible";
    }
  ) => string;
  remove?: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

const initialMessage = "No spam, just the latest stories from the Weekly Wildcat newsroom.";
const turnstileScript = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function NewsletterSignupForm({ sourceTitle, sourceUrl, turnstileSiteKey }: NewsletterSignupFormProps) {
  const emailId = useId();
  const messageId = useId();
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingSignupRef = useRef<PendingSignup | null>(null);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<SignupState>("idle");
  const [message, setMessage] = useState(initialMessage);
  const [isTurnstileReady, setIsTurnstileReady] = useState(false);
  const isSubmitting = status === "submitting";
  const isConfigured = Boolean(turnstileSiteKey);

  function getTurnstile() {
    return (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
  }

  function resetTurnstile() {
    const turnstile = getTurnstile();

    if (widgetIdRef.current && turnstile) {
      turnstile.reset(widgetIdRef.current);
    }
  }

  async function submitSignup({ email: signupEmail, company: signupCompany }: PendingSignup, turnstileToken: string) {
    setMessage("Adding you to the list...");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: signupEmail,
          company: signupCompany,
          turnstileToken,
          source: sourceUrl,
          sourceTitle
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null;

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "We could not add that email right now.");
      }

      setStatus("success");
      setEmail("");
      setMessage("You're on the list. Thanks for reading Weekly Wildcat.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "We could not add that email right now.");
    } finally {
      pendingSignupRef.current = null;
      resetTurnstile();
    }
  }

  useEffect(() => {
    if (!turnstileSiteKey || !isTurnstileReady || !turnstileRef.current || widgetIdRef.current) {
      return;
    }

    const turnstile = getTurnstile();

    if (!turnstile) {
      return;
    }

    widgetIdRef.current = turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      action: "newsletter",
      size: "invisible",
      callback: (token) => {
        const pendingSignup = pendingSignupRef.current;

        if (pendingSignup) {
          void submitSignup(pendingSignup, token);
        }
      },
      "error-callback": () => {
        pendingSignupRef.current = null;
        setStatus("error");
        setMessage("The security check could not be verified. Please try again.");
        resetTurnstile();
      },
      "expired-callback": () => {
        pendingSignupRef.current = null;
        setStatus("error");
        setMessage("The security check expired. Please try again.");
        resetTurnstile();
      }
    });

    return () => {
      const widgetId = widgetIdRef.current;

      if (widgetId && turnstile.remove) {
        turnstile.remove(widgetId);
      }

      widgetIdRef.current = null;
      pendingSignupRef.current = null;
    };
  }, [isTurnstileReady, turnstileSiteKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setStatus("error");
      setMessage("Enter your email address to sign up.");
      return;
    }

    if (!isConfigured) {
      setStatus("error");
      setMessage("Newsletter signup security is not configured yet.");
      return;
    }

    const turnstile = getTurnstile();

    if (!widgetIdRef.current || !turnstile) {
      setStatus("error");
      setMessage("Newsletter signup security is still loading. Please try again.");
      return;
    }

    pendingSignupRef.current = {
      email: trimmedEmail,
      company
    };
    setStatus("submitting");
    setMessage("Checking your signup...");

    try {
      turnstile.execute(widgetIdRef.current);
    } catch (error) {
      pendingSignupRef.current = null;
      setStatus("error");
      setMessage("The security check could not be started. Please try again.");
    }
  }

  return (
    <aside className="article-newsletter-signup" aria-labelledby="article-newsletter-heading">
      <div className="article-newsletter-copy">
        <p className="article-newsletter-kicker">Newsletter</p>
        <h2 id="article-newsletter-heading">Get the Weekly Wildcat in your Inbox</h2>
        <p>Catch the newest stories, scores, and campus updates when they publish.</p>
      </div>

      {turnstileSiteKey ? (
        <Script src={turnstileScript} strategy="afterInteractive" onReady={() => setIsTurnstileReady(true)} />
      ) : null}

      <form className="article-newsletter-form" onSubmit={handleSubmit}>
        <label htmlFor={emailId}>Email address</label>
        <div className="article-newsletter-controls">
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            aria-describedby={messageId}
            required
          />
          <input
            className="newsletter-signup-trap"
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            aria-hidden="true"
          />
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing up..." : "Sign up"}
          </button>
        </div>
        {turnstileSiteKey ? (
          <div
            ref={turnstileRef}
            className="cf-turnstile article-newsletter-turnstile"
            data-sitekey={turnstileSiteKey}
            data-action="newsletter"
          />
        ) : null}
        <p
          id={messageId}
          className={`article-newsletter-message article-newsletter-message-${status}`}
          aria-live="polite"
        >
          {message}
        </p>
      </form>
    </aside>
  );
}
