"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { MousePointerClick } from "lucide-react";
import type { Ref } from "react";

export type TourCardModel =
  | { kind: "info" | "action"; title: string; description: string; instruction?: string; progress: { current: number; total: number }; canGoBack: boolean }
  | { kind: "waiting"; title: string }
  | { kind: "unavailable"; title: string; canContinue: boolean };

export type TourCardActions = { onNext: () => void; onBack: () => void; onSkip: () => void; onContinue: () => void };

/**
 * The guidance itself, the same in every placement (beside the highlighted
 * control, or centred while a screen loads). Byline's type, buttons and
 * spacing; the title and description name the tour card for assistive
 * technology (`titleId`, `descriptionId`).
 */
export function TourCardBody({ model, actions, titleId, descriptionId, primaryRef }: { model: TourCardModel; actions: TourCardActions; titleId: string; descriptionId: string; primaryRef: Ref<HTMLButtonElement> }) {
  if (model.kind === "waiting") {
    return (
      <>
        <div className="flex items-center gap-2">
          <Spinner aria-hidden="true" role="presentation" className="text-muted-foreground motion-reduce:animate-none" />
          <h2 id={titleId} className="font-heading text-sm font-medium">{model.title}</h2>
        </div>
        <p id={descriptionId} className="sr-only">Waiting for this part of Byline to open.</p>
        <div className="flex justify-start">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={actions.onSkip}>Skip tour</Button>
        </div>
      </>
    );
  }
  if (model.kind === "unavailable") {
    return (
      <>
        <h2 id={titleId} className="font-heading text-sm font-medium">{model.title}</h2>
        <p id={descriptionId} className="text-muted-foreground">This part of Byline isn’t on screen right now, so the tour can’t point at it.</p>
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={actions.onSkip}>End tour</Button>
          {model.canContinue ? <Button ref={primaryRef} type="button" size="sm" onClick={actions.onContinue}>Continue</Button> : null}
        </div>
      </>
    );
  }
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="font-heading text-sm font-medium">{model.title}</h2>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums" aria-label={`Step ${model.progress.current} of ${model.progress.total}`}>
          {model.progress.current} / {model.progress.total}
        </span>
      </div>
      <p id={descriptionId} className="text-muted-foreground">
        {model.description}
        {model.instruction ? <span className="sr-only"> {model.instruction}</span> : null}
      </p>
      {model.instruction ? (
        <p className="flex items-center gap-1.5 font-medium" aria-hidden="true" data-tour-instruction="">
          <MousePointerClick className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {model.instruction}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={actions.onSkip}>Skip tour</Button>
        <div className="flex items-center gap-2">
          {model.canGoBack ? <Button type="button" variant="outline" size="sm" onClick={actions.onBack}>Back</Button> : null}
          {model.kind === "info" ? <Button ref={primaryRef} type="button" size="sm" onClick={actions.onNext}>Next</Button> : null}
        </div>
      </div>
    </>
  );
}
