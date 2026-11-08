"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { buttonVariants } from "@byline/newsroom-ui/ui/button";

export type GoogleSignIn = {
  clientId: string;
  domain: string;
  href: string;
  challengeUrl: string;
  credentialUrl: string;
};

type GoogleIdentityServices = {
  initialize(options: {
    client_id: string;
    hd: string;
    nonce: string;
    ux_mode: "popup";
    use_fedcm_for_button: boolean;
    callback(response: { credential: string }): void;
  }): void;
  renderButton(parent: HTMLElement, options: {
    type: "standard";
    size: "large";
    text: "continue_with";
    width: number;
  }): void;
};

export function GoogleSignInButton({ google, onFailure }: { google: GoogleSignIn; onFailure(): void }) {
  const host = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    const element = host.current;
    const sdk = (window as Window & { google?: { accounts?: { id?: GoogleIdentityServices } } }).google?.accounts?.id;
    if (!scriptReady || !element || !sdk) return;
    const abort = new AbortController();
    let resize: ResizeObserver | undefined;

    async function mount(container: HTMLDivElement, gis: GoogleIdentityServices) {
      const response = await fetch(google.challengeUrl, { method: "POST", signal: abort.signal });
      if (!response.ok) return;
      const { state, nonce } = await response.json();
      if (abort.signal.aborted) return;
      let submitting = false;
      gis.initialize({
        client_id: google.clientId,
        hd: google.domain,
        nonce,
        ux_mode: "popup",
        use_fedcm_for_button: true,
        callback: async ({ credential }) => {
          if (abort.signal.aborted || submitting) return;
          submitting = true;
          try {
            const login = await fetch(google.credentialUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ state, credential }),
              signal: abort.signal,
            });
            if (login.ok) {
              const { returnTo } = await login.json();
              window.location.assign(returnTo);
              return;
            }
          } catch {
            // The redirect and password options are available after a failure.
          }
          if (!abort.signal.aborted) onFailure();
        },
      });

      let renderedWidth = 0;
      function render() {
        const width = Math.min(Math.floor(container.getBoundingClientRect().width), 400);
        if (!width || width === renderedWidth) return;
        renderedWidth = width;
        container.replaceChildren();
        gis.renderButton(container, { type: "standard", size: "large", text: "continue_with", width });
      }
      render();
      resize = new ResizeObserver(render);
      resize.observe(container);
    }

    // Keep the server-rendered redirect link if the SDK or setup fails.
    void mount(element, sdk).catch(() => {});
    return () => {
      abort.abort();
      resize?.disconnect();
      element.replaceChildren();
    };
  }, [google, onFailure, scriptReady]);

  return <>
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
    <div ref={host} className="byline-google-button" />
    <GoogleRedirectLink href={google.href} />
  </>;
}

export function GoogleRedirectLink({ href }: { href: string }) {
  return <a href={href} className={buttonVariants({ size: "lg" })}>Continue with Google</a>;
}
