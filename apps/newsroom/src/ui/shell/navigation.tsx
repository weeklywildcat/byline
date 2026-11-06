"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { useRouteTransition } from "@payloadcms/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ShellLayer } from "./layer";

/** What a screen with a document open reports about it: edited since the last save, or a save in flight. */
export type DocumentWorkState = { modified: boolean; saving: boolean };
export type LeaveGuard = () => DocumentWorkState;

/**
 * How long leaving waits for the document's own autosave. Payload autosaves
 * the story ~1.2s after the last change; an edit still unsaved and not saving
 * after `settleMs` will not be saved by waiting (a failed or skipped save),
 * and a save in flight gets up to `maxMs`.
 */
export const LEAVE_WAIT = { settleMs: 3000, maxMs: 15000, pollMs: 100 } as const;

/**
 * Resolves true once the guarded document is saved (nothing modified, nothing
 * saving), false when waiting will not get it there. It never saves anything
 * itself: the document's own autosave does, and this only waits for it.
 */
export function waitForSavedDocument(read: LeaveGuard, wait: { settleMs: number; maxMs: number; pollMs: number } = LEAVE_WAIT): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const state = read();
      if (!state.modified && !state.saving) return resolve(true);
      const elapsed = Date.now() - start;
      if (elapsed >= wait.maxMs || (!state.saving && elapsed >= wait.settleMs)) return resolve(false);
      window.setTimeout(check, wait.pollMs);
    };
    check();
  });
}

type ShellNavigation = {
  /** Client navigation to a Byline address, after the open document's work is safe. */
  navigate: (href: string) => void;
  /** Whether leaving the current screen would have to wait for (or risk) unsaved work. */
  hasPendingWork: () => boolean;
  /** The screen with a document open registers how to read its state while it is mounted. */
  setLeaveGuard: (guard: LeaveGuard | null) => void;
};

const NavigationContext = createContext<ShellNavigation>({ navigate: () => {}, hasPendingWork: () => false, setLeaveGuard: () => {} });

export const useShellNavigation = () => use(NavigationContext);

/**
 * The shell's navigation. Payload turns off its own leave-without-saving
 * prompt for autosaving documents, and its autosave does not run once the
 * document unmounts, so a story left within a second of an edit would lose
 * it. Every shell link (the sidebar, the Story list, Search, Create) leaves
 * through here: with the Story screen's work saved it navigates at once;
 * otherwise it waits for Payload's own autosave, and asks before leaving
 * anything that still is not saved. It is not a second save system.
 */
export function ShellNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const guard = useRef<LeaveGuard | null>(null);
  const waiting = useRef(false);
  const [unsavedHref, setUnsavedHref] = useState<string | null>(null);

  const go = useCallback((href: string) => startRouteTransition(() => router.push(href)), [router, startRouteTransition]);
  const hasPendingWork = useCallback(() => {
    const state = guard.current?.();
    return Boolean(state && (state.modified || state.saving));
  }, []);

  const navigate = useCallback((href: string) => {
    const read = guard.current;
    if (!read || !hasPendingWork()) return go(href);
    if (waiting.current) return;
    waiting.current = true;
    const notice = toast.loading("Saving your changes…");
    void waitForSavedDocument(read).then((saved) => {
      waiting.current = false;
      toast.dismiss(notice);
      if (saved) go(href);
      else setUnsavedHref(href);
    });
  }, [go, hasPendingWork]);

  const setLeaveGuard = useCallback((next: LeaveGuard | null) => { guard.current = next; }, []);
  const value = useMemo<ShellNavigation>(() => ({ navigate, hasPendingWork, setLeaveGuard }), [navigate, hasPendingWork, setLeaveGuard]);

  return (
    <NavigationContext value={value}>
      {children}
      <ShellLayer active={unsavedHref !== null}>
        <AlertDialog open={unsavedHref !== null} onOpenChange={(open) => { if (!open) setUnsavedHref(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
              <AlertDialogDescription>Your latest changes to this story haven&apos;t been saved. If you leave now, they will be lost.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay on this story</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => { const href = unsavedHref; setUnsavedHref(null); if (href) go(href); }}>Leave anyway</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ShellLayer>
    </NavigationContext>
  );
}

/** While mounted, leaving through the shell first waits for this document's work (see ShellNavigationProvider). */
export function useLeaveGuard(read: LeaveGuard) {
  const { setLeaveGuard } = useShellNavigation();
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    setLeaveGuard(() => latest.current());
    return () => setLeaveGuard(null);
  }, [setLeaveGuard]);
}

const opensElsewhere = (event: MouseEvent<HTMLAnchorElement>) => event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

/**
 * A Next `Link` for shell navigation. A plain click with unsaved work open
 * goes through `navigate` (wait, or ask); a new-tab click, or a click with
 * nothing pending, is an ordinary Link.
 */
export function ShellLink({ href, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { navigate, hasPendingWork } = useShellNavigation();
  return (
    <Link
      href={href}
      prefetch={false}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || opensElsewhere(event) || !hasPendingWork()) return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
