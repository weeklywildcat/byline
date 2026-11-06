"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { useEffect, useState, type ReactNode } from "react";

const EXIT_MS = 250;

/**
 * A Byline root for the shell's own dialogs (Create, Search), mounted only
 * while one is open. A modal a screen has open (Story Peek) hides everything
 * outside itself from assistive technology at the moment it opens; a root
 * created afterwards is not part of that, so a shell dialog opened over it is
 * reachable, as it is when a screen opens its own dialog. Kept a moment after
 * closing so the dialog can animate out.
 */
export function ShellLayer({ active, children }: { active: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(active);
  useEffect(() => {
    if (active) {
      setMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [active]);
  if (!active && !mounted) return null;
  return (
    <AdminRoot className="byline-shell-layer" toaster={false}>
      {children}
    </AdminRoot>
  );
}
