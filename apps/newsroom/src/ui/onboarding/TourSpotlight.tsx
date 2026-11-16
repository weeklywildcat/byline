"use client";

import { cn } from "@byline/newsroom-ui/lib/utils";
import type { CSSProperties, PointerEvent } from "react";
import { spotlightHole, spotlightPanes, type Box, type Viewport } from "./tour-geometry";

const PANE = "fixed z-40 bg-black/25 dark:bg-black/50 motion-safe:transition-[top,left,width,height] motion-safe:duration-200 motion-safe:ease-out";

const place = (box: Box): CSSProperties => ({ top: box.top, left: box.left, width: box.width, height: box.height });

/** Pointer input on the dimmed page goes nowhere (and does not move focus). */
const absorb = (event: PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * Dims the page around the highlighted control with four fixed panes (they
 * also catch pointer input outside it) and draws a ring around it. `open`:
 * the reader may use the control itself (a step that continues when they do);
 * otherwise a clear shield over it keeps an informational step from starting
 * anything. With no target, the whole page is dimmed.
 *
 * The panes are presentation only (`aria-hidden`); nothing in the app is
 * hidden from assistive technology, so the highlighted control stays
 * reachable.
 */
export function TourSpotlight({ rect, viewport, open }: { rect: Box | null; viewport: Viewport; open: boolean }) {
  if (!rect) return <div aria-hidden="true" data-tour-spotlight="" className={cn(PANE, "inset-0")} onPointerDown={absorb} />;
  const hole = spotlightHole(rect, viewport);
  const panes = spotlightPanes(hole, viewport);
  return (
    <div aria-hidden="true" data-tour-spotlight="">
      {(Object.keys(panes) as Array<keyof typeof panes>).map((side) => (
        <div key={side} className={PANE} style={place(panes[side])} onPointerDown={absorb} data-tour-pane={side} />
      ))}
      <div
        className="pointer-events-none fixed z-40 rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background motion-safe:transition-[top,left,width,height] motion-safe:duration-200 motion-safe:ease-out"
        style={place(hole)}
        data-tour-ring=""
      />
      {open ? null : <div className="fixed z-40" style={place(hole)} onPointerDown={absorb} data-tour-shield="" />}
    </div>
  );
}
