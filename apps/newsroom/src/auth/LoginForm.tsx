"use client";

import { useCallback, useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@byline/newsroom-ui/ui/button";
import { trackVisualViewport } from "@byline/newsroom-ui/lib/visual-viewport";
import { Input } from "@byline/newsroom-ui/ui/input";
import { GoogleRedirectLink, GoogleSignInButton, type GoogleSignIn } from "./GoogleSignInButton";

type Props = {
  google: GoogleSignIn | null;
  googleFailed: boolean;
  endpoint: string;
  returnTo: string;
  forgotHref: string | null;
};

export function LoginForm({ google, googleFailed, endpoint, returnTo, forgotHref }: Props) {
  const [expanded, setExpanded] = useState(!google || googleFailed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [buttonFailed, setButtonFailed] = useState(false);
  const email = useRef<HTMLInputElement>(null);
  const googleError = useRef<HTMLParagraphElement>(null);

  // The page is fixed; with the software keyboard open it follows the visible viewport so the fields and Sign in stay reachable.
  useEffect(() => {
    const page = email.current?.closest<HTMLElement>(".byline-login");
    return page ? trackVisualViewport(page) : undefined;
  }, []);

  useEffect(() => {
    if (googleFailed || buttonFailed) googleError.current?.focus();
  }, [googleFailed, buttonFailed]);

  const onGoogleFailure = useCallback(() => {
    setButtonFailed(true);
    setExpanded(true);
  }, []);

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
    {(googleFailed || buttonFailed) && <p className="byline-login-error" role="alert" tabIndex={-1} ref={googleError}>
      Google sign-in didn’t complete. You can use your email and password below.
    </p>}
    {google && <div className="byline-login-options">
      {googleFailed || buttonFailed ? <GoogleRedirectLink href={google.href} /> :
        <GoogleSignInButton google={google} onFailure={onGoogleFailure} />}
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
      <Input id="byline-login-email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required ref={email} />
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
