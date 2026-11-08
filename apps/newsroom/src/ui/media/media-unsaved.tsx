"use client";

import type { MediaInspectorGuard } from "@byline/newsroom-screens/media/MediaInspectorContent";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useMediaHistoryGuard } from "./media-history";

/**
 * Unsaved file details, one place: the open inspector's guard, the single
 * Save changes / Discard / Stay question, and the browser's Back and Forward
 * (which ask the same question). `guarded(proceed)` is for moves Byline makes
 * itself; `dialog` goes in the screen once.
 */
export function useMediaUnsaved(location: string): { guard: React.RefObject<MediaInspectorGuard | null>; guarded: (proceed: () => void) => void; dialog: ReactNode } {
  const guard = useRef<MediaInspectorGuard | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const ask = useCallback((proceed: () => void) => setPending(() => proceed), []);
  const guarded = useCallback((proceed: () => void) => {
    if (guard.current?.dirty()) ask(proceed);
    else proceed();
  }, [ask]);
  const dirty = useCallback(() => guard.current?.dirty() ?? false, []);
  useMediaHistoryGuard({ dirty, ask, location });

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
      <AlertDialogContent data-media-unsaved="">
        <AlertDialogHeader>
          <AlertDialogTitle>Save your changes to this file?</AlertDialogTitle>
          <AlertDialogDescription>You've edited this file's details without saving them.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <Button variant="outline" onClick={() => { guard.current?.discard(); const proceed = pending; setPending(null); proceed?.(); }}>Discard</Button>
          <AlertDialogAction onClick={async () => { const proceed = pending; setPending(null); if (await guard.current?.save()) proceed?.(); }}>Save changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { guard, guarded, dialog };
}
