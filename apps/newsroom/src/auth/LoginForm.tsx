"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Input } from "@byline/newsroom-ui/ui/input";

type Props = {
  google: { href: string; domain: string } | null;
  googleFailed: boolean;
  endpoint: string;
  returnTo: string;
  forgotHref: string | null;
};

export function LoginForm({ google, googleFailed, endpoint, returnTo, forgotHref }: Props) {
  const [expanded, setExpanded] = useState(!google || googleFailed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const email = useRef<HTMLInputElement>(null);
  const googleError = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (googleFailed) googleError.current?.focus();
  }, [googleFailed]);

  async function signIn(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      if (response.ok) {
        // Let the Admin load the new native Payload session from its cookie.
        window.location.assign(returnTo);
        return;
      }
      setError(response.status >= 500 ? "Sign-in is unavailable right now. Try again shortly." :
        "Couldn’t sign in. Check your email and password, or contact a newsroom administrator for help.");
    } catch {
      setError("Couldn’t reach the newsroom. Check your connection and try again.");
    }
    setBusy(false);
  }

  return <>
    {googleFailed && <p className="byline-login-error" role="alert" tabIndex={-1} ref={googleError}>
      Google sign-in didn’t complete. You can use your email and password below.
    </p>}
    {google && <div className="byline-login-options">
      <a href={google.href} className={buttonVariants({ size: "lg" })}>Continue with Google</a>
      <p>Use your @{google.domain} account.</p>
      <button type="button" className="byline-login-toggle" aria-controls="byline-password-form" aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) requestAnimationFrame(() => email.current?.focus());
        }}>
        Use email and password
      </button>
    </div>}
    <form className="byline-login-form" id="byline-password-form" aria-label="Email and password"
      hidden={!expanded} method="post" onSubmit={signIn}>
      <label htmlFor="byline-login-email">Email</label>
      <Input id="byline-login-email" name="email" type="email" autoComplete="username" required ref={email} />
      <label htmlFor="byline-login-password">Password</label>
      <Input id="byline-login-password" name="password" type="password" autoComplete="current-password" required />
      <p className="byline-login-error" role="alert">{error}</p>
      <Button type="submit" variant={google ? "outline" : "default"} size="lg" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      {forgotHref ? <a className="byline-login-reset" href={forgotHref}>Forgot password?</a> :
        <p className="byline-login-reset">Forgot your password? Ask a newsroom administrator to reset it.</p>}
    </form>
  </>;
}
