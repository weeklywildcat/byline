"use client";

import Script from "next/script";
import { FormEvent, useId, useRef, useState } from "react";

type NewsletterSignupFormProps = {
  sourceTitle: string;
  sourceUrl: string;
  turnstileSiteKey?: string;
};

type SignupState = "idle" | "submitting" | "success" | "error";

const initialMessage = "No spam, just the latest stories from the Weekly Wildcat newsroom.";
const turnstileScript = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export function NewsletterSignupForm({ sourceTitle, sourceUrl, turnstileSiteKey }: NewsletterSignupFormProps) {
  const emailId = useId();
  const messageId = useId();
  const turnstileRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<SignupState>("idle");
  const [message, setMessage] = useState(initialMessage);
  const isSubmitting = status === "submitting";
  const isConfigured = Boolean(turnstileSiteKey);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const formData = new FormData(event.currentTarget);
    const turnstileToken = String(formData.get("cf-turnstile-response") || "");

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

    if (!turnstileToken) {
      setStatus("error");
      setMessage("Complete the security check to sign up.");
      return;
    }

    setStatus("submitting");
    setMessage("Adding you to the list...");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: trimmedEmail,
          company,
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
      const turnstile = (window as typeof window & { turnstile?: { reset: () => void } }).turnstile;

      if (turnstileRef.current && turnstile) {
        turnstile.reset();
      }
    }
  }

  return (
    <aside className="article-newsletter-signup" aria-labelledby="article-newsletter-heading">
      <div className="article-newsletter-copy">
        <p className="article-newsletter-kicker">Newsletter</p>
        <h2 id="article-newsletter-heading">Get the Weekly Wildcat in your Inbox</h2>
        <p>Catch the newest stories, scores, and campus updates when they publish.</p>
      </div>

      {turnstileSiteKey ? <Script src={turnstileScript} strategy="afterInteractive" /> : null}

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
            data-theme="auto"
            data-size="normal"
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
