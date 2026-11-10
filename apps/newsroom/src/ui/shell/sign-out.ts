"use client";

import { useState } from "react";
import { useShellNavigation } from "./navigation";

export function useSignOut(logoutUrl: string, loginHref: string) {
  const [signingOut, setSigningOut] = useState(false);
  const { runGuarded } = useShellNavigation();

  async function endSession() {
    setSigningOut(true);
    try {
      await fetch(logoutUrl, { method: "POST", credentials: "include" });
    } finally {
      window.location.assign(loginHref);
    }
  }

  return { signingOut, signOut: () => runGuarded(() => void endSession()) };
}
