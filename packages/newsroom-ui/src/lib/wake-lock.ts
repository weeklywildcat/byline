import { useEffect } from "react";

/**
 * Keeps the screen on while `active`, using the Screen Wake Lock API where the
 * browser has one (Safari, including Home Screen web apps; Chromium). Feature
 * detected, never user-agent sniffed.
 *
 * A wake lock is only granted to a visible page and the browser releases it
 * when the page is hidden, so this requests only while the document is
 * visible and asks again when it becomes visible. A refused request (low
 * battery, battery saver, no permission) is silent: the activity it supports
 * must never depend on it. Use it for short, bounded activity (a recording in
 * progress, a capture being sent), not for something that may last hours.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator) || !navigator.wakeLock) return undefined;
    const wakeLock = navigator.wakeLock;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    let requesting = false;

    const release = () => {
      sentinel?.removeEventListener("release", onReleased);
      const held = sentinel;
      sentinel = null;
      void held?.release().catch(() => undefined);
    };
    const onReleased = () => { sentinel = null; };
    const acquire = async () => {
      if (stopped || requesting || sentinel || document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const next = await wakeLock.request("screen");
        if (stopped) { void next.release().catch(() => undefined); return; }
        sentinel = next;
        next.addEventListener("release", onReleased);
      } catch {
        // Denied or unsupported right now; the page is fine without it.
      } finally {
        requesting = false;
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void acquire(); };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [active]);
}
