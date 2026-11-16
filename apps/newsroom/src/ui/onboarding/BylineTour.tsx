"use client";

import { cn } from "@byline/newsroom-ui/lib/utils";
import { SAFE_AREA_PADDING, VISUAL_VIEWPORT_INSET, useVisualViewportFit } from "@byline/newsroom-ui/lib/visual-viewport";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Popover, PopoverContent } from "@byline/newsroom-ui/ui/popover";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { WeeklyWildcatLogo } from "../shell/WeeklyWildcatLogo";
import { TourCardBody, type TourCardActions, type TourCardModel } from "./TourCard";
import { readSafeAreaInsets, useTargetGeometry } from "./tour-geometry";
import { focusable, nextTabStop, tabbables, tourKeyIntent } from "./tour-keyboard";
import { tourProgress, type TourStep } from "./tour-registry";
import type { TourRun } from "./tour-run";
import { afterFrame, bringTargetIntoView } from "./tour-targets";
import { TourSpotlight } from "./TourSpotlight";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (listener: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
/** `prefers-reduced-motion: reduce`, live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
}

const samePath = (left: string, right: string) => left.replace(/\/+$/, "") === right.replace(/\/+$/, "");

/** Back never crosses screens: the previous step must live on this one (or on none). */
export function canStepBack(steps: readonly TourStep[], index: number, pathname: string, admin: string): boolean {
  const previous = steps[index - 1];
  if (!previous || steps[index]?.final) return false;
  return previous.screen === undefined || samePath(pathname, `${admin}${previous.screen}` || "/");
}

/**
 * Everything a running tour shows: the spotlight, the guidance card beside
 * the highlighted control (Byline's Popover, anchored to it), a centred card
 * while a screen opens, the closing dialog, and the tour's keyboard and focus.
 */
export default function BylineTour({ run, admin, pathname, onSkip, onFinish }: { run: TourRun; admin: string; pathname: string; onSkip: () => void; onFinish: () => void }) {
  const { phase, steps } = useSyncExternalStore(run.subscribe, run.getState, run.getState);
  const reducedMotion = useReducedMotion();
  const index = phase.kind === "step" || phase.kind === "waiting" || phase.kind === "unavailable" ? phase.index : -1;
  const step = steps[index] ?? null;
  const element = phase.kind === "step" ? phase.element : null;
  const final = phase.kind === "step" && Boolean(step?.final);

  // A new step's target is scrolled into the clear first; the card appears once it has settled.
  // An element React replaced within the same step is followed at once.
  const [shownIndex, setShownIndex] = useState(-1);
  useEffect(() => {
    if (!element) return undefined;
    let live = true;
    void bringTargetIntoView(element, { reducedMotion }).then(() => {
      if (live) setShownIndex(index);
    });
    return () => {
      live = false;
    };
  }, [element, index, reducedMotion]);
  const target = element && shownIndex === index ? element : null;
  const { rect, viewport } = useTargetGeometry(target);

  const kind: "info" | "action" | "status" = phase.kind !== "step" || !step || final ? "status" : step.action ? "action" : "info";
  const canGoBack = phase.kind === "step" && canStepBack(steps, index, pathname, admin);
  const model: TourCardModel | null = useMemo(() => {
    if (phase.kind === "loading") return { kind: "waiting", title: "Starting the tour…" };
    if (phase.kind === "waiting") return { kind: "waiting", title: step?.place ? `Opening ${step.place}…` : "One moment…" };
    if (phase.kind === "unavailable") return { kind: "unavailable", title: step?.title ?? "Byline tour", canContinue: index + 1 < steps.length };
    if (phase.kind !== "step" || !step || final) return null;
    return { kind: step.action ? "action" : "info", title: step.title, description: step.description, instruction: step.action?.instruction, progress: tourProgress(steps, index), canGoBack };
  }, [phase.kind, step, steps, index, final, canGoBack]);

  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const actions: TourCardActions = { onNext: run.next, onBack: run.back, onSkip, onContinue: run.skipUnavailable };

  // Focus starts in the guidance: the primary button of an informational step,
  // the card itself otherwise (Tab then reaches the control to use). Only when
  // the step or its state changes, never when React merely replaced the target.
  const focusKey = phase.kind === "step" ? (target ? `step:${index}` : null) : `${phase.kind}:${index}`;
  useEffect(() => {
    if (!focusKey || final) return undefined;
    // Two frames: the card is positioned before it takes focus.
    let cancel = afterFrame(() => {
      cancel = afterFrame(() => {
        const card = cardRef.current;
        if (!card) return;
        const into = kind === "info" || phase.kind === "unavailable" ? (primaryRef.current ?? card) : card;
        into.focus({ preventScroll: true });
      });
    });
    return () => cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus follows the step, not every render
  }, [focusKey, final]);

  // The tour's keys (tour-keyboard.ts). Capture phase, so the shell's single-key shortcuts never see a key the tour used.
  const keys = useRef({ kind, canGoBack, target, onSkip, run });
  keys.current = { kind, canGoBack, target, onSkip, run };
  useEffect(() => {
    if (final) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const { kind, canGoBack, target, onSkip, run } = keys.current;
      const intent = tourKeyIntent(event, { target: event.target instanceof Element ? event.target : null, card: cardRef.current, highlighted: target, stepKind: kind, canGoBack });
      if (!intent) return;
      if (intent === "tab") {
        const order = [...(kind === "action" && focusable(target) ? [target] : []), ...tabbables(cardRef.current)];
        const next = nextTabStop(order, document.activeElement, event.shiftKey);
        if (!next) return;
        event.preventDefault();
        next.focus();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (intent === "skip") onSkip();
      else if (intent === "next") run.next();
      else run.back();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [final]);

  const insets = useMemo(() => readSafeAreaInsets(), [viewport.width, viewport.height]);
  const collisionPadding = { top: insets.top + 8, right: insets.right + 8, bottom: insets.bottom + 8, left: insets.left + 8 };
  const inSidebar = Boolean(target?.closest('[data-slot="sidebar"]'));
  const announcement = phase.kind === "waiting" || phase.kind === "loading" ? (model?.title ?? "") : phase.kind === "unavailable" ? `${model?.title ?? "This step"} isn’t available right now.` : "";
  const cardClass = "grid w-80 max-w-[calc(100vw-2rem)] gap-3 p-4 text-sm outline-hidden motion-reduce:animate-none";
  const cardProps = { "aria-labelledby": titleId, "aria-describedby": descriptionId, "data-byline-tour-card": "" } as const;

  if (final && step) return <TourComplete step={step} onFinish={onFinish} />;

  return (
    <>
      <TourSpotlight rect={target ? rect : null} viewport={viewport} open={kind === "action"} />
      {model && target && phase.kind === "step" ? (
        <Popover open modal={false} onOpenChange={() => {}}>
          <PopoverContent
            ref={cardRef}
            anchor={target}
            side={inSidebar ? "right" : "bottom"}
            align={inSidebar ? "start" : "center"}
            sideOffset={12}
            collisionPadding={collisionPadding}
            initialFocus={false}
            finalFocus={false}
            tabIndex={-1}
            className={cardClass}
            {...cardProps}
          >
            <TourCardBody model={model} actions={actions} titleId={titleId} descriptionId={descriptionId} primaryRef={primaryRef} />
          </PopoverContent>
        </Popover>
      ) : model && phase.kind !== "step" ? (
        <CenteredCard>
          <div ref={cardRef} role="dialog" tabIndex={-1} className={cn(cardClass, "pointer-events-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10")} {...cardProps}>
            <TourCardBody model={model} actions={actions} titleId={titleId} descriptionId={descriptionId} primaryRef={primaryRef} />
          </div>
        </CenteredCard>
      ) : null}
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    </>
  );
}

/** The card's place while nothing is highlighted: centred in the visible viewport, inside the safe area. */
function CenteredCard({ children }: { children: React.ReactNode }) {
  const fit = useVisualViewportFit();
  return <div ref={fit} className={cn("pointer-events-none fixed z-50 flex items-center justify-center", VISUAL_VIEWPORT_INSET, SAFE_AREA_PADDING)}>{children}</div>;
}

/** The end of the tour: a calm closing dialog, then back to work. */
function TourComplete({ step, onFinish }: { step: TourStep; onFinish: () => void }) {
  const start = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onFinish(); }} disablePointerDismissal>
      <DialogContent showCloseButton={false} initialFocus={start} finalFocus={false} className="gap-5 sm:max-w-sm motion-reduce:animate-none" data-byline-tour-complete="">
        <DialogHeader className="items-center pt-2 text-center">
          <span aria-hidden="true" className="mb-1 flex size-12 items-center justify-center rounded-xl bg-muted text-foreground"><WeeklyWildcatLogo mark className="size-8" /></span>
          <DialogTitle className="text-lg">{step.title}</DialogTitle>
          <DialogDescription className="text-balance">{step.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={start} type="button" onClick={onFinish}>Start working</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
