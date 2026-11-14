"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { useRef } from "react";
import { WeeklyWildcatLogo } from "../shell/WeeklyWildcatLogo";
import { firstName } from "./first-name";

export function welcomeTitle(name: unknown, replay: boolean): string {
  const first = firstName(name);
  if (replay) return first ? `Welcome back, ${first}.` : "Welcome back to Byline.";
  return first ? `Welcome to Byline, ${first}.` : "Welcome to Byline.";
}

/**
 * The first-run welcome (and a replay from the account menu). Byline's own
 * Dialog: focus, safe areas and the Visual Viewport come with it. Escape
 * counts as skipping; a click outside does nothing, so nobody skips by
 * accident.
 */
export default function WelcomeDialog({ name, replay, onStart, onSkip }: { name: unknown; replay: boolean; onStart: () => void; onSkip: () => void }) {
  const start = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open, details) => {
        if (!open && details.reason === "escape-key") onSkip();
      }}
    >
      <DialogContent showCloseButton={false} initialFocus={start} finalFocus={false} className="gap-5 sm:max-w-sm motion-reduce:animate-none" data-byline-welcome="">
        <DialogHeader className="items-center pt-2 text-center">
          <span aria-hidden="true" className="mb-1 flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
            <WeeklyWildcatLogo mark className="size-8" />
          </span>
          <DialogTitle className="text-lg">{welcomeTitle(name, replay)}</DialogTitle>
          <DialogDescription className="text-balance">
            This is where the newsroom plans stories, reports, edits and gets work published. We’ll show you around.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onSkip}>{replay ? "Not now" : "Skip for now"}</Button>
          <Button ref={start} type="button" onClick={onStart}>Show me around</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
